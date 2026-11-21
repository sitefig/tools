// Second-pass tools for rows first skipped in free-browser-tools.md (peerreview/new-list/pass2-C.md). See TOOLS.md.
// Built here, all hand-written with no third-party code: a backtracking regex engine (PCRE2-like and Python-re-like flavours),
// a TypeScript type stripper, a WebAssembly WAT assembler and disassembler, an ESTree JavaScript parser (AST explorer),
// a token-level JavaScript obfuscator, OpenPGP public-key encryption/decryption (RSA, ECDH) and a LaTeX math to SVG layout engine.
// Each engine states its supported subset in the matching content/en/<id>.json and in peerreview/new-list/pass2-C.md.
const T = [];

// ===== Backtracking regex engine (PCRE2-like and Python-re-like flavours), hand-written =====
const rxFold = (c) => { if (c < 128) return c >= 65 && c <= 90 ? c + 32 : c; const l = String.fromCodePoint(c).toLowerCase(), a = l.codePointAt(0); return l.length === (a > 0xffff ? 2 : 1) ? a : c; };
const rxUp = (c) => { if (c < 128) return c >= 97 && c <= 122 ? c - 32 : c; const l = String.fromCodePoint(c).toUpperCase(), a = l.codePointAt(0); return l.length === (a > 0xffff ? 2 : 1) ? a : c; };
const rxIsWordA = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const rxU = (re) => (c) => re.test(String.fromCodePoint(c));
const rxWordU = rxU(/^[\p{L}\p{N}_]$/u), rxDigU = rxU(/^\p{Nd}$/u);
const rxSpaceU = (c) => (c >= 9 && c <= 13) || (c >= 28 && c <= 32) || c === 0x85 || (c > 127 && c !== 0xfeff && /^\s$/u.test(String.fromCodePoint(c)));
const rxSpaceA = (c) => c === 32 || (c >= 9 && c <= 13);
const rxPosix = {
  alpha: (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122), digit: (c) => c >= 48 && c <= 57, alnum: (c) => rxPosix.alpha(c) || rxPosix.digit(c),
  upper: (c) => c >= 65 && c <= 90, lower: (c) => c >= 97 && c <= 122, space: rxSpaceA, blank: (c) => c === 32 || c === 9,
  punct: (c) => c > 32 && c < 127 && !rxPosix.alnum(c), print: (c) => c >= 32 && c < 127, graph: (c) => c > 32 && c < 127, cntrl: (c) => c < 32 || c === 127,
  xdigit: (c) => rxPosix.digit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102), word: rxIsWordA, ascii: (c) => c < 128,
};
function rxClassFn(ch, py, ascii) {
  const lc = ch.toLowerCase(); let f;
  if (lc === 'd') f = py && !ascii ? rxDigU : (c) => c >= 48 && c <= 57;
  else if (lc === 's') f = py && !ascii ? rxSpaceU : rxSpaceA;
  else if (lc === 'w') f = py && !ascii ? rxWordU : rxIsWordA;
  else if (lc === 'h') f = (c) => c === 32 || c === 9 || c === 0xa0 || c === 0x1680 || c === 0x180e || (c >= 0x2000 && c <= 0x200a) || c === 0x202f || c === 0x205f || c === 0x3000;
  else f = (c) => (c >= 10 && c <= 13) || c === 0x85 || c === 0x2028 || c === 0x2029; // v
  return ch === lc ? f : (c) => !f(c);
}
class RxError extends Error {}
function rxParse(src, flavor, flags) {
  const py = flavor === 'python', P = Array.from(src), L = P.length; let p = 0, ngroups = 0, depth = 0, nGlobal = 0;
  let lookDepth = 0; const names = {}, open = new Set(), err = (m) => { throw new RxError(m + ' at position ' + p); };
  let total = 0; { let inC = false; for (let q = 0; q < L; q++) { const c = P[q]; if (c === '\\') { q++; continue; } if (inC) { if (c === ']') inC = false; continue; } if (c === '[') { inC = true; if (P[q + 1] === '^') q++; if (P[q + 1] === ']') q++; continue; } if (c === '(') { if (P[q + 1] !== '?' && P[q + 1] !== '*') total++; else if (P[q + 1] === '?' && (P[q + 2] === 'P' && P[q + 3] === '<' || P[q + 2] === "'" || P[q + 2] === '<' && P[q + 3] !== '=' && P[q + 3] !== '!')) total++; } } }
  const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
  const hexv = (s) => /^[0-9a-fA-F]+$/.test(s) ? parseInt(s, 16) : err('bad hex escape');
  const readName = (end) => { let s = ''; while (p < L && P[p] !== end) s += P[p++]; if (p >= L) err('missing ' + end); p++; if (!s) err('missing group name'); if (py ? !/^[\p{L}_][\p{L}\p{N}_]*$/u.test(s) : !/^[A-Za-z_]\w{0,31}$/.test(s)) err('bad group name'); return s; };
  // escape that yields a single code point, or null. inClass: inside [...]
  function escChar(c, inClass, fl) {
    switch (c) {
      case 'n': return 10; case 't': return 9; case 'r': return 13; case 'f': return 12; case 'a': return 7;
      case 'v': if (py) return 11; return null;
      case 'e': if (!py) return 27; return null;
      case 'x': {
        if (!py && P[p] === '{') { p++; let s = ''; while (p < L && P[p] !== '}') s += P[p++]; p++; const v = hexv(s); if (v > 0x10ffff) err('code point too large'); return v; }
        let s = ''; const n = py ? 2 : 2; while (s.length < n && p < L && /[0-9a-fA-F]/.test(P[p])) s += P[p++]; if (py && s.length < 2) err('incomplete escape \\x'); return s ? hexv(s) : 0;
      }
      case 'u': if (py) { const s = P.slice(p, p + 4).join(''); if (s.length < 4) err('incomplete escape \\u'); p += 4; return hexv(s); } return null;
      case 'U': if (py) { const s = P.slice(p, p + 8).join(''); if (s.length < 8) err('incomplete escape \\U'); p += 8; const v = hexv(s); if (v > 0x10ffff) err('bad escape'); return v; } return null;
      case 'c': if (!py) { const ch = P[p++]; if (ch === undefined || ch.charCodeAt(0) > 126) err('\\c must be followed by an ASCII character'); return ch.toUpperCase().charCodeAt(0) ^ 64; } return null;
      case 'o': if (!py && P[p] === '{') { p++; let s = ''; while (p < L && P[p] !== '}') s += P[p++]; p++; if (!/^[0-7]+$/.test(s)) err('bad octal'); return parseInt(s, 8); } return null;
      case '0': { let s = '0'; while (s.length < (py ? 3 : 3) && /[0-7]/.test(P[p] || '')) s += P[p++]; return parseInt(s, 8); }
    }
    return null;
  }
  const mkSet = (items, neg, fl) => ({ t: 'set', items, neg, ic: fl.i, a: py && fl.a });
  function parseClass(fl) {
    const start = p; const items = []; let neg = false;
    if (P[p] === '^') { neg = true; p++; }
    let first = true;
    const atom = () => { // returns {c} or {f}
      let c = P[p++];
      if (c === '[' && !py && P[p] === ':') { const e = P.indexOf(':', p + 1); if (e > 0 && P[e + 1] === ']') { let nm = P.slice(p + 1, e).join(''), ng = false; if (nm[0] === '^') { ng = true; nm = nm.slice(1); } if (!rxPosix[nm]) err('unknown POSIX class name'); p = e + 2; const f = rxPosix[nm]; return { f: ng ? (x) => !f(x) : f }; } }
      if (c !== '\\') return { c: c.codePointAt(0) };
      c = P[p++]; if (c === undefined) err('bad escape (end of pattern)');
      if (/[dDsSwW]/.test(c) || (!py && /[hHvV]/.test(c))) return { f: rxClassFn(c, py, fl.a) };
      if (c === 'b') return { c: 8 };
      if (!py && (c === 'p' || c === 'P')) return { f: propFn(c) };
      if (!py && c === 'N') err('\\N is not supported in a class');
      if (!py && c === 'R') err('escape sequence is invalid in character class');
      if (!py && c === 'Q') { /* \Q..\E inside class */ let s = []; while (p < L && !(P[p] === '\\' && P[p + 1] === 'E')) s.push(P[p++]); p += 2; return { lit: s.map((x) => x.codePointAt(0)) }; }
      if (!py && c === 'E') return { lit: [] };
      if (/[1-7]/.test(c)) { let s = c; while (s.length < 3 && /[0-7]/.test(P[p] || '')) s += P[p++]; if (py && s.length < 3) err('bad escape \\' + s); return { c: parseInt(s, 8) }; }
      const e = escChar(c, true, fl); if (e !== null) return { c: e };
      if (/[A-Za-z0-9]/.test(c)) err('bad escape \\' + c);
      return { c: c.codePointAt(0) };
    };
    for (;;) {
      if (p >= L) err('missing terminating ] for character class');
      if (P[p] === ']' && !first) { p++; break; } first = false;
      const a = atom();
      if (a.lit) { for (const x of a.lit) items.push([x, x]); continue; }
      if (P[p] === '-' && P[p + 1] !== ']' && p + 1 < L) {
        if (a.f) { if (py) err('bad character range'); items.push(a); continue; }
        const save = p; p++; const b = atom();
        if (b.f || b.lit) { if (py) err('bad character range'); p = save; items.push([a.c, a.c]); continue; }
        if (b.c < a.c) err('range out of order in character class'); items.push([a.c, b.c]);
      } else if (a.f) items.push(a); else items.push([a.c, a.c]);
    }
    return mkSet(items, neg, fl);
  }
  function propFn(c) {
    let nm; if (P[p] === '{') { p++; let s = ''; while (p < L && P[p] !== '}') s += P[p++]; p++; nm = s; } else nm = P[p++];
    let ng = c === 'P'; if (nm && nm[0] === '^') { ng = !ng; nm = nm.slice(1); }
    if (nm === 'Any') return () => !ng; if (nm === 'L&') nm = 'LC';
    let re; try { re = /^[\w]+$/.test(nm) ? new RegExp('^\\p{' + nm + '}$', 'u') : null; } catch (e) { re = null; }
    if (!re) { try { re = new RegExp('^\\p{Script=' + nm + '}$', 'u'); } catch (e) { err('unknown property name'); } }
    return (x) => re.test(String.fromCodePoint(x)) !== ng;
  }
  function parseAlts(fl) { // fl: mutable flags for this group; returns array of seq nodes
    const alts = []; let seq = [];
    const quant = (min, max) => {
      const last = seq[seq.length - 1];
      if (!last) err('nothing to repeat');
      if (last.quantified) err('multiple repeat'); if (/^(bol|eol|bos|eos|eosnl|wordb|keep)$/.test(last.t)) err('quantifier does not follow a repeatable item');
      if (!py && fl.x) for (;;) { if (isWs(P[p])) p++; else if (P[p] === '#') { while (p < L && P[p] !== '\n') p++; } else break; }
      let mode = 'greedy'; if (P[p] === '?') { mode = 'lazy'; p++; } else if (P[p] === '+') { mode = 'poss'; p++; }
      if (min === 0 && max === 0 && false) return;
      seq[seq.length - 1] = { t: 'rep', node: last, min, max, mode, quantified: true };
    };
    for (;;) {
      if (p >= L) break; const c = P[p];
      if (c === '|') { alts.push(seq); seq = []; p++; continue; }
      if (c === ')') { if (!depth) err('unmatched closing parenthesis'); break; }
      if (fl.x && isWs(c)) { p++; continue; }
      if (fl.x && c === '#') { while (p < L && P[p] !== '\n') p++; continue; }
      if (c === '*' || c === '+' || c === '?') { p++; quant(c === '+' ? 1 : 0, c === '?' ? 1 : Infinity); continue; }
      if (c === '{') {
        const m = (py ? /^\{(\d*)(?:(,)(\d*))?\}/ : /^\{(\d+)(?:(,)(\d*))?\}/).exec(P.slice(p, p + 24).join(''));
        if (m && (m[1] !== '' || (py && m[2] && m[3] !== '')) && !(py && m[1] === '' && m[2] === undefined)) {
          p += m[0].length; const min = m[1] === '' ? 0 : +m[1], max = m[2] ? (m[3] === '' ? Infinity : +m[3]) : min;
          if (max < min) err('min repeat greater than max repeat'); quant(min, max); continue;
        }
        p++; seq.push({ t: 'char', c: 123, ic: fl.i }); continue;
      }
      p++;
      if (c === '(') { const n = parseGroup(fl); if (n) seq.push(n); continue; }
      if (c === '[') { seq.push(parseClass(fl)); continue; }
      if (c === '.') { seq.push({ t: 'any', s: fl.s }); continue; }
      if (c === '^') { seq.push({ t: 'bol', m: fl.m }); continue; }
      if (c === '$') { seq.push({ t: 'eol', m: fl.m }); continue; }
      if (c === '\\') { const n = parseEscape(fl); if (n && n.t === 'multi') seq.push(...n.list); else if (n) seq.push(n); continue; }
      seq.push({ t: 'char', c: c.codePointAt(0), ic: fl.i });
    }
    alts.push(seq); return alts;
  }
  const seqNode = (s) => (s.length === 1 ? s[0] : { t: 'seq', list: s });
  const altNode = (alts) => (alts.length === 1 ? seqNode(alts[0]) : { t: 'alt', list: alts.map(seqNode) });
  function parseEscape(fl) {
    const c = P[p++]; if (c === undefined) err('bad escape (end of pattern)');
    if (/[dDsSwW]/.test(c) || (!py && /[hHvV]/.test(c))) return mkSet([{ f: rxClassFn(c, py, fl.a) }], false, fl);
    if (c === 'b' || c === 'B') return { t: 'wordb', neg: c === 'B', f: rxClassFn('w', py, fl.a) };
    if (c === 'A') return { t: 'bos' };
    if (c === 'Z') return py ? { t: 'eos' } : { t: 'eosnl' };
    if (!py) {
      if (c === 'z') return { t: 'eos' };
      if (c === 'K') { if (lookDepth) err('\\K is not allowed in lookarounds'); return { t: 'keep' }; }
      if (c === 'N') return { t: 'any', s: false };
      if (c === 'R') return { t: 'alt', list: [{ t: 'seq', list: [{ t: 'char', c: 13 }, { t: 'char', c: 10 }] }, mkSet([{ f: rxClassFn('v', false) }], false, fl)] };
      if (c === 'p' || c === 'P') return mkSet([{ f: propFn(c) }], false, fl);
      if (c === 'G' || c === 'X' || c === 'C') err('unsupported escape \\' + c);
      if (c === 'Q') { const o = []; while (p < L && !(P[p] === '\\' && P[p + 1] === 'E')) o.push({ t: 'char', c: P[p++].codePointAt(0), ic: fl.i }); p += 2; if (!o.length) return null; return { t: 'multi', list: o }; }
      if (c === 'E') return null;
      if (c === 'g' || c === 'k') {
        let ref, close = null;
        if (P[p] === '{' && (c === 'g' || c === 'k')) { p++; ref = ''; while (p < L && P[p] !== '}') ref += P[p++]; p++; }
        else if (c === 'k' && (P[p] === '<' || P[p] === "'")) { close = P[p] === '<' ? '>' : "'"; p++; ref = ''; while (p < L && P[p] !== close) ref += P[p++]; p++; }
        else if (c === 'g' && (P[p] === '<' || P[p] === "'")) { close = P[p] === '<' ? '>' : "'"; p++; ref = ''; while (p < L && P[p] !== close) ref += P[p++]; p++; return callNode(ref); }
        else if (c === 'g') { ref = ''; if (P[p] === '-' || P[p] === '+') ref += P[p++]; while (/\d/.test(P[p] || '')) ref += P[p++]; } else err('\\k is not followed by a braced, angle-bracketed, or quoted name');
        if (/^[+-]?\d+$/.test(ref)) { let n = +ref; if (ref[0] === '-') n = ngroups + 1 + n; else if (ref[0] === '+') n = ngroups + n; if (n < 1) err('reference to non-existent subpattern'); return { t: 'backref', idx: n, ic: fl.i }; }
        return { t: 'backref', name: ref, ic: fl.i };
      }
    }
    if (/[1-9]/.test(c)) {
      let s = c; while (/\d/.test(P[p] || '') && (py ? s.length < 2 : true)) s += P[p++];
      let n = +s;
      if (py) { if (n > ngroups) err('invalid group reference ' + n); if (open.has(n)) err('cannot refer to an open group'); return { t: 'backref', idx: n, ic: fl.i, py: true }; }
      if (n < 10 || n <= total) return { t: 'backref', idx: n, ic: fl.i };
      // octal
      p -= s.length - 1; let o = c; if (!/[0-7]/.test(c)) err('reference to non-existent subpattern');
      while (o.length < 3 && /[0-7]/.test(P[p] || '')) o += P[p++]; return { t: 'char', c: parseInt(o, 8), ic: fl.i };
    }
    const e = escChar(c, false, fl); if (e !== null) return { t: 'char', c: e, ic: fl.i };
    if (/[A-Za-z0-9]/.test(c)) err('bad escape \\' + c);
    return { t: 'char', c: c.codePointAt(0), ic: fl.i };
  }
  const callNode = (ref) => (/^[+-]?\d+$/.test(ref) ? { t: 'call', idx: ref[0] === '-' ? ngroups + 1 + +ref : ref[0] === '+' ? ngroups + +ref : +ref } : { t: 'call', name: ref });
  function readFlags(fl, scopedOk) { // after "(?"; returns new flags and whether ':' or ')'
    const nf = { ...fl }; let on = true, seen = false;
    for (;;) {
      const c = P[p++]; if (c === undefined) err('missing )');
      if (c === '-') { if (!on) err('unknown flag'); on = false; seen = true; continue; }
      if (c === ')' || c === ':') { return { nf, end: c }; }
      if ('imsx'.includes(c)) nf[c] = on;
      else if (py && 'auL'.includes(c)) { if (!on && c !== 'x') err('bad inline flags: cannot turn off flags a, u and L'); if (c === 'a') nf.a = true; if (c === 'u') nf.a = false; }
      else if (!py && c === 'U') { /* ungreedy: not supported */ err('unsupported flag (?U)'); }
      else err('unknown flag');
    }
  }
  function parseGroup(fl) {
    const gs = p - 1;
    const alone = P[p] === '?';
    if (P[p] === '*') err('unsupported (*VERB)');
    let kind = 'cap', name = null, cond = null;
    if (alone) {
      p++; const c = P[p++];
      if (c === '#') { while (p < L && P[p] !== ')') p++; if (p >= L) err('missing ) after comment'); p++; return null; }
      else if (c === ':') kind = 'nc';
      else if (c === '=') kind = 'la'; else if (c === '!') kind = 'nla'; else if (c === '>') kind = 'at';
      else if (c === '|') err('unsupported branch reset group (?|');
      else if (c === '<' && (P[p] === '=' || P[p] === '!')) { kind = P[p++] === '=' ? 'lb' : 'nlb'; }
      else if (c === 'P') {
        const d = P[p++];
        if (d === '<') { name = readName('>'); kind = 'cap'; }
        else if (d === '=') { const nm = readName(')'); return { t: 'backref', name: nm, ic: fl.i }; }
        else if (d === '>' && !py) { const nm = readName(')'); return callNode(nm); }
        else err('unknown extension ?P' + (d || ''));
      } else if (c === '<' && !py) { name = readName('>'); kind = 'cap'; }
      else if (c === "'" && !py) { name = readName("'"); kind = 'cap'; }
      else if (c === '&' && !py) { const nm = readName(')'); return callNode(nm); }
      else if (!py && (c === 'R' || /[0-9+-]/.test(c)) && (c === 'R' || /[0-9]/.test(c) || /[0-9]/.test(P[p] || ''))) {
        let ref = c === 'R' ? '0' : c; while (/\d/.test(P[p] || '')) ref += P[p++]; if (P[p++] !== ')') err('(?R or (?[+-]digits must be followed by )'); return callNode(ref);
      } else if (c === '(') {
        kind = 'cond'; let ref = '';
        if (!py && P[p] === '?') { // assertion condition
          p--; // at '('
          const save = p; p++; const an = parseGroup(fl); if (!an || !/^(la|nla|lb|nlb)$/.test(an.kind0 || '')) err('assertion expected after (?( or (?(?C)'); cond = an;
        } else {
          while (p < L && P[p] !== ')') ref += P[p++]; p++;
          if (/^\d+$/.test(ref)) cond = { idx: +ref }; else if (!py && /^[+-]\d+$/.test(ref)) cond = { idx: ref[0] === '-' ? ngroups + 1 + +ref : ngroups + +ref };
          else { let nm = ref; if (!py && /^<.*>$|^'.*'$/.test(nm)) nm = nm.slice(1, -1); if (!nm || (!py && /^(R|DEFINE|VERSION.*)$|^R[&\d]/.test(nm))) err('unsupported condition'); if (py && !/^[\p{L}_][\p{L}\p{N}_]*$/u.test(nm)) err('bad character in group name'); cond = { name: nm }; }
        }
      } else {
        p--; const { nf, end } = readFlags(fl);
        if (end === ')') { // global (py: must be at start) or rest-of-group (pcre)
          if (py) { if (gs !== nGlobal) err('global flags not at the start of the expression'); nGlobal = p; Object.assign(fl, nf); Object.assign(rootFlags, nf); } else Object.assign(fl, nf);
          return null;
        }
        // scoped
        depth++; const inner = { ...nf }; const a = parseAlts(inner); if (P[p++] !== ')') err('missing closing parenthesis'); depth--; return altNode(a);
      }
    } else if (!alone) { /* plain capture */ }
    let idx = 0; if (kind === 'cap') { idx = ++ngroups; if (name) { if (names[name]) err('redefinition of group name'); names[name] = idx; } }
    depth++; const inner = { ...fl }; if (idx) open.add(idx);
    const isLook = /^(la|nla|lb|nlb)$/.test(kind); if (isLook) lookDepth++;
    let alts = parseAlts(inner); if (isLook) lookDepth--; if (P[p++] !== ')') err('missing closing parenthesis'); depth--; open.delete(idx);
    if (kind === 'cond') { if (alts.length > 2) err('conditional subpattern contains more than two branches'); return { t: 'cond', cond, yes: seqNode(alts[0]), no: alts[1] ? seqNode(alts[1]) : { t: 'seq', list: [] } }; }
    const node = altNode(alts);
    if (kind === 'cap') return { t: 'group', idx, node };
    if (kind === 'nc') return { t: 'seq', list: [node] };
    if (kind === 'at') return { t: 'atomic', node };
    const r = { t: 'look', ahead: kind === 'la' || kind === 'nla', neg: kind === 'nla' || kind === 'nlb', alts: alts.map(seqNode), kind0: kind };
    return r;
  }
  const rootFlags = { i: !!flags.i, m: !!flags.m, s: !!flags.s, x: !!flags.x, a: !!flags.a };
  const top = { ...rootFlags };
  const alts = parseAlts(top);
  if (p < L) err('unmatched closing parenthesis');
  const root = altNode(alts);
  return { root, ngroups, names, py, rootFlags };
}
// width of a node: returns number or throws RxError if variable
function rxWidth(n, py) {
  switch (n.t) {
    case 'char': case 'any': case 'set': return 1;
    case 'seq': return n.list.reduce((a, x) => a + rxWidth(x, py), 0);
    case 'alt': { const w = n.list.map((x) => rxWidth(x, py)); if (w.some((x) => x !== w[0])) throw new RxError('lookbehind assertion is not fixed length'); return w[0]; }
    case 'group': case 'atomic': return rxWidth(n.node, py);
    case 'rep': if (n.min !== n.max) throw new RxError('lookbehind assertion is not fixed length'); return n.min * rxWidth(n.node, py);
    case 'look': case 'bol': case 'eol': case 'bos': case 'eos': case 'eosnl': case 'wordb': case 'keep': return 0;
    case 'cond': { const a = rxWidth(n.yes, py), b = rxWidth(n.no, py); if (a !== b) throw new RxError('lookbehind assertion is not fixed length'); return a; }
    default: throw new RxError('lookbehind assertion is not fixed length');
  }
}
function rxCompile(src, flavor, flags) {
  const ast = rxParse(src, flavor, flags || {}), py = ast.py, table = [];
  const resolveRef = (n) => { if (n.name !== undefined) { const i = ast.names[n.name]; if (!i) throw new RxError('reference to non-existent subpattern ' + n.name); return i; } if (n.idx > ast.ngroups) throw new RxError('invalid group reference ' + n.idx); return n.idx; };
  const tick = (s) => { if (++s.steps > s.limit) throw new RxError('Backtracking limit exceeded (' + s.limit + ' steps): the pattern may backtrack catastrophically'); };
  const oneFn = (n) => { // single-char predicate or null
    if (n.t === 'char') { const c = n.c; if (n.ic) { const f = rxFold(c); return (x) => x === c || rxFold(x) === f; } return (x) => x === c; }
    if (n.t === 'any') return n.s ? () => true : (x) => x !== 10;
    if (n.t === 'set') {
      const raw = (x) => { for (const it of n.items) { if (it.f) { if (it.f(x)) return true; } else if (x >= it[0] && x <= it[1]) return true; } return false; };
      const f = n.ic ? (x) => raw(x) || raw(rxFold(x)) || raw(rxUp(x)) : raw;
      return n.neg ? (x) => !f(x) : f;
    }
    if (n.t === 'seq' && n.list.length === 1) return oneFn(n.list[0]);
    if (n.t === 'alt') { const fs = n.list.map(oneFn); if (fs.every(Boolean)) return (x) => fs.some((f) => f(x)); }
    return null;
  };
  function comp(n) {
    const one = oneFn(n);
    if (one) return (s, i, k) => i < s.n && one(s.str[i]) && k(i + 1);
    switch (n.t) {
      case 'seq': { const ms = n.list.map(comp); if (!ms.length) return (s, i, k) => k(i); return ms.reduceRight((nx, m) => (s, i, k) => m(s, i, (j) => nx(s, j, k))); }
      case 'alt': { const ms = n.list.map(comp); return (s, i, k) => { for (const m of ms) { tick(s); if (m(s, i, k)) return true; } return false; }; }
      case 'group': {
        const m = comp(n.node), idx = n.idx;
        const g = (s, i, k) => m(s, i, (j) => { const old = s.caps[idx]; s.caps[idx] = [i, j]; if (k(j)) return true; s.caps[idx] = old; return false; });
        table[idx] = g; return g;
      }
      case 'rep': {
        const { min, max, mode } = n; let one2 = oneFn(n.node), gi = 0;
        if (!one2 && n.node.t === 'group' && (one2 = oneFn(n.node.node))) gi = n.node.idx;
        if (one2) {
          if (gi) { const inner = rep1(one2, min, max, mode); return (s, i, k) => inner(s, i, (j, c) => { if (!c) return k(j); const old = s.caps[gi]; s.caps[gi] = [j - 1, j]; if (k(j)) return true; s.caps[gi] = old; return false; }); }
          if (mode === 'lazy') return (s, i, k) => { let c = 0; while (c < min) { if (i + c >= s.n || !one2(s.str[i + c])) return false; c++; } for (;;) { tick(s); if (k(i + c)) return true; if (c >= max || i + c >= s.n || !one2(s.str[i + c])) return false; c++; } };
          return (s, i, k) => { let c = 0; while (c < max && i + c < s.n && one2(s.str[i + c])) c++; if (c < min) return false; if (mode === 'poss') return k(i + c); for (; c >= min; c--) { tick(s); if (k(i + c)) return true; } return false; };
        }
        const m = comp(n.node);
        const loop = (s, i, k) => {
          const go = (c, i) => {
            tick(s);
            const more = () => c < max && m(s, i, (j) => (j === i && c + 1 >= min && (py || max === Infinity) ? k(j) : go(c + 1, j)));
            if (c < min) return more();
            if (mode === 'lazy') return k(i) || more();
            return more() || k(i);
          };
          return go(0, i);
        };
        if (mode !== 'poss') return loop;
        return atomic(loop);
      }
      case 'bol': return n.m ? (s, i, k) => (i === 0 || (s.str[i - 1] === 10 && (py || i < s.n))) && k(i) : (s, i, k) => i === 0 && k(i);
      case 'eol': return n.m ? (s, i, k) => (i === s.n || s.str[i] === 10) && k(i) : (s, i, k) => (i === s.n || (i === s.n - 1 && s.str[i] === 10)) && k(i);
      case 'bos': return (s, i, k) => i === 0 && k(i);
      case 'eos': return (s, i, k) => i === s.n && k(i);
      case 'eosnl': return (s, i, k) => (i === s.n || (i === s.n - 1 && s.str[i] === 10)) && k(i);
      case 'wordb': return (s, i, k) => { if (py && n.neg && !s.n) return false; const a = i > 0 && n.f(s.str[i - 1]), b = i < s.n && n.f(s.str[i]); return ((a !== b) !== n.neg) && k(i); };
      case 'keep': return (s, i, k) => { const o = s.keep; s.keep = i; if (k(i)) return true; s.keep = o; return false; };
      case 'atomic': return atomic(comp(n.node));
      case 'look': {
        const ms = n.alts.map((a) => {
          if (n.ahead) return comp(a);
          const w = rxWidth(a, py); const m = comp(a); return { w, m };
        });
        if (!n.ahead && py) { const ws = new Set(ms.map((x) => x.w)); if (ws.size > 1) throw new RxError('look-behind requires fixed-width pattern'); }
        const test = (s, i) => {
          if (n.ahead) { for (const m of ms) if (m(s, i, () => true)) return true; return false; }
          for (const { w, m } of ms) { if (i - w >= 0 && m(s, i - w, (j) => j === i)) return true; } return false;
        };
        return (s, i, k) => { const snap = s.caps.slice(); const r = test(s, i); if (n.neg) { s.caps = snap; return !r && k(i); } if (!r) { s.caps = snap; return false; } if (k(i)) return true; s.caps = snap; return false; };
      }
      case 'backref': {
        const idx = resolveRef(n);
        return (s, i, k) => { const c = s.caps[idx]; if (!c) return false; const len = c[1] - c[0]; if (i + len > s.n) return false; for (let q = 0; q < len; q++) { const a = s.str[c[0] + q], b = s.str[i + q]; if (a !== b && !(n.ic && rxFold(a) === rxFold(b))) return false; } return k(i + len); };
      }
      case 'cond': {
        const yes = comp(n.yes), no = comp(n.no);
        if (n.cond.t === 'look') { const lk = comp(n.cond); return (s, i, k) => { let r = false; const snap = s.caps.slice(); r = lk(s, i, () => true); return r ? yes(s, i, k) : (s.caps = snap, no(s, i, k)); }; }
        const idx = resolveRef(n.cond);
        return (s, i, k) => (s.caps[idx] ? yes(s, i, k) : no(s, i, k));
      }
      case 'call': {
        const idx = resolveRef(n);
        return (s, i, k) => {
          if (++s.depth > 400) { s.depth--; throw new RxError('Recursion too deep'); }
          const snap = s.caps.slice(), g = idx === 0 ? table[0] : table[idx];
          const r = g(s, i, (j) => { const inner = s.caps; s.caps = snap.slice(); s.depth--; if (k(j)) return true; s.depth++; s.caps = inner; return false; });
          if (!r) { s.depth--; s.caps = snap; }
          return r;
        };
      }
    }
    throw new RxError('internal: unknown node ' + n.t);
  }
  function rep1(one2, min, max, mode) { // continuation receives (end, count)
    if (mode === 'lazy') return (s, i, k) => { let c = 0; while (c < min) { if (i + c >= s.n || !one2(s.str[i + c])) return false; c++; } for (;;) { tick(s); if (k(i + c, c)) return true; if (c >= max || i + c >= s.n || !one2(s.str[i + c])) return false; c++; } };
    return (s, i, k) => { let c = 0; while (c < max && i + c < s.n && one2(s.str[i + c])) c++; if (c < min) return false; if (mode === 'poss') return k(i + c, c); for (; c >= min; c--) { tick(s); if (k(i + c, c)) return true; } return false; };
  }
  function atomic(m) {
    return (s, i, k) => { const snap = s.caps.slice(); let end = -1; if (!m(s, i, (j) => { end = j; return true; })) { s.caps = snap; return false; } if (k(end)) return true; s.caps = snap; return false; };
  }
  const root = comp(ast.root); table[0] = root;
  return { ast, ngroups: ast.ngroups, names: ast.names, exec(str, start, must, limit) {
    const s = { str, n: str.length, caps: new Array(ast.ngroups + 1), keep: -1, steps: 0, limit: limit || 3e6, depth: 0 };
    for (let st = start; st <= s.n; st++) {
      s.caps = new Array(ast.ngroups + 1); s.keep = -1; let end = -1;
      if (root(s, st, (j) => { if (must && st === start && j === st) return false; end = j; return true; })) {
        const b = s.keep >= 0 ? s.keep : st; return { start: b, end, caps: s.caps.slice(1), cap0: [b, end] };
      }
    }
    return null;
  } };
}
function rxAll(prog, str, limit) {
  const out = []; let pos = 0, must = false;
  while (pos <= str.length && out.length < 100000) {
    const m = prog.exec(str, pos, must, limit); if (!m) break;
    out.push(m); must = m.end === m.start; pos = m.end;
  }
  return out;
}
function rxExpandPy(tpl, m, str, names) {
  const T = Array.from(tpl, (c) => c.codePointAt(0)), out = []; let i = 0;
  const grp = (g) => { if (typeof g === 'string') { if (!names[g]) throw new RxError('unknown group name ' + g); g = names[g]; } if (g > m.caps.length) throw new RxError('invalid group reference ' + g); const c = g === 0 ? m.cap0 : m.caps[g - 1]; return c ? str.slice(c[0], c[1]) : []; };
  const ch = (k) => String.fromCodePoint(T[k]);
  while (i < T.length) {
    if (T[i] !== 92) { out.push(T[i++]); continue; }
    i++; if (i >= T.length) throw new RxError('bad escape (end of pattern)');
    const c = ch(i);
    if (c === 'g') {
      if (ch(i + 1) !== '<') throw new RxError('missing <'); let j = i + 2, nm = ''; while (j < T.length && ch(j) !== '>') nm += ch(j++); if (j >= T.length) throw new RxError('missing >, unterminated name');
      if (!nm) throw new RxError('missing group name'); i = j + 1;
      if (/^\d+$/.test(nm)) out.push(...grp(+nm)); else if (/^[\p{L}_][\p{L}\p{N}_]*$/u.test(nm)) out.push(...grp(nm)); else throw new RxError('bad character in group name');
    } else if (c === '0') { let s = '0', j = i + 1; while (s.length < 3 && /[0-7]/.test(j < T.length ? ch(j) : '')) s += ch(j++); i = j; out.push(parseInt(s, 8)); }
    else if (/[1-9]/.test(c)) {
      let s = c, j = i + 1;
      if (/\d/.test(j < T.length ? ch(j) : '')) { s += ch(j++); if (/[0-7]/.test(c) && /[0-7]/.test(s[1]) && /[0-7]/.test(j < T.length ? ch(j) : '')) { s += ch(j++); if (parseInt(s, 8) > 255) throw new RxError('octal escape value outside of range 0-0o377'); i = j; out.push(parseInt(s, 8)); continue; } }
      i = j; out.push(...grp(+s));
    } else {
      const map = { n: 10, t: 9, r: 13, f: 12, v: 11, a: 7, b: 8, '\\': 92 }; i++;
      if (map[c] !== undefined) out.push(map[c]); else if (/[A-Za-z]/.test(c)) throw new RxError('bad escape \\' + c); else out.push(92, c.codePointAt(0));
    }
  }
  return out;
}
function rxExpandPcre(tpl, m, str, names) {
  const T = Array.from(tpl, (c) => c.codePointAt(0)), out = []; let i = 0;
  const ch = (k) => (k < T.length ? String.fromCodePoint(T[k]) : '');
  const grp = (g) => { if (typeof g === 'string') { if (!names[g]) throw new RxError('unknown substring name ' + g); g = names[g]; } if (g > m.caps.length) throw new RxError('unknown substring number ' + g); const c = g === 0 ? m.cap0 : m.caps[g - 1]; return c ? str.slice(c[0], c[1]) : []; };
  while (i < T.length) {
    if (ch(i) !== '$') { out.push(T[i++]); continue; }
    i++; const c = ch(i);
    if (c === '$') { out.push(36); i++; continue; }
    let nm = '';
    if (c === '{') { let j = i + 1; while (j < T.length && ch(j) !== '}') nm += ch(j++); if (j >= T.length) throw new RxError('bad substitution (missing })'); i = j + 1; }
    else { let j = i; if (/\d/.test(c)) { while (/\d/.test(ch(j))) nm += ch(j++); } else if (/[A-Za-z_]/.test(c)) { while (/\w/.test(ch(j))) nm += ch(j++); } else throw new RxError('bad substitution after $'); i = j; }
    out.push(...grp(/^\d+$/.test(nm) ? +nm : nm));
  }
  return out;
}
function rxRun(flavor, inputs, o) {
  const pat = inputs[0].replace(/\r?\n$/, ''), subj = inputs[1] ?? '';
  if (!pat) throw new Error('Enter a pattern.');
  const flags = { i: !!o.i, m: !!o.m, s: !!o.s, x: !!o.x, a: !!o.a }, py = flavor === 'python';
  let prog; try { prog = rxCompile(pat, flavor, flags); } catch (e) { if (e instanceof RxError) throw new Error((py ? 'Python re error: ' : 'PCRE2 error: ') + e.message); throw e; }
  const str = Array.from(subj, (c) => c.codePointAt(0)), show = (a, b) => JSON.stringify(String.fromCodePoint(...str.slice(a, b)));
  let ms; try { ms = rxAll(prog, str); } catch (e) { if (e instanceof RxError) throw new Error(e.message); if (e instanceof RangeError) throw new Error('Subject too long for this pattern (recursion depth exceeded). Try a shorter subject or a simpler pattern.'); throw e; }
  const nm = Object.entries(prog.names), byIdx = {}; for (const [k, v] of nm) byIdx[v] = k;
  const L = [`${py ? 'Python re' : 'PCRE2'} flavour, ${prog.ngroups} capture group${prog.ngroups === 1 ? '' : 's'}${nm.length ? ' (named: ' + nm.map(([k, v]) => k + '=' + v).join(', ') + ')' : ''}. Offsets count code points.`, `${ms.length} match${ms.length === 1 ? '' : 'es'}`, ''];
  ms.slice(0, 200).forEach((m, n) => {
    L.push(`Match ${n + 1}: ${m.start}-${m.end} ${show(m.start, m.end)}`);
    m.caps.length || 0; for (let g = 1; g <= prog.ngroups; g++) { const c = m.caps[g - 1]; L.push(`  group ${g}${byIdx[g] ? ' (' + byIdx[g] + ')' : ''}: ${c ? c[0] + '-' + c[1] + ' ' + show(c[0], c[1]) : 'unset'}`); }
  });
  if (ms.length > 200) L.push(`... ${ms.length - 200} more matches not listed`);
  if (o.repl != null && o.repl !== '') {
    const ex = py ? rxExpandPy : rxExpandPcre; let res = [], pos = 0;
    try { if (py && !ms.length) ex(o.repl, { caps: new Array(prog.ngroups).fill(undefined), cap0: [0, 0] }, str, prog.names); for (const m of ms) { res.push(...str.slice(pos, m.start), ...ex(o.repl, m, str, prog.names)); pos = m.end; } } catch (e) { if (e instanceof RxError) throw new Error((py ? 'Replacement error: ' : 'Replacement error: ') + e.message); throw e; }
    res.push(...str.slice(pos)); L.push('', 'Replaced result:', ms.length ? String.fromCodePoint(...res) : subj);
  }
  return L.join('\n');
}

// ===== TypeScript type stripper (subset), hand-written token-level transformer =====
class TsFail extends Error {}
const TS_KW_EXPR = new Set(['return', 'typeof', 'void', 'delete', 'await', 'yield', 'case', 'throw', 'in', 'of', 'instanceof', 'new', 'else', 'do', 'extends', 'export', 'default', 'import', 'as', 'satisfies']);
const TS_PUNCT = ['<<=', '<<', '...', '===', '!==', '**=', '&&=', '||=', '??=', '=>', '==', '!=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**'];
function tsTokenize(src) {
  const toks = [], n = src.length, stack = []; let i = 0, nl = false;
  const err = (m, at) => { throw new TsFail(m + ' at ' + tsPos(src, at ?? i)); };
  const isIdStart = (c) => /[\p{ID_Start}$_\\]/u.test(c), isIdPart = (c) => /[\p{ID_Continue}$_‌‍\\]/u.test(c);
  const push = (t, s, e, extra) => { const tk = { t, v: src.slice(s, e), s, e, nl, ...extra }; toks.push(tk); nl = false; return tk; };
  const regexOk = () => { const p = toks[toks.length - 1]; if (!p) return true; if (p.t === 'num' || p.t === 'str' || p.t === 're') return false; if (p.t === 'tmpl') return p.part === 'head' || p.part === 'mid'; if (p.t === 'id') return TS_KW_EXPR.has(p.v) && !(toks[toks.length - 2] && toks[toks.length - 2].v === '.'); return !(p.v === ')' || p.v === ']' || p.v === '}' || p.v === '++' || p.v === '--'); };
  const readTmpl = (start, cont) => { // from after ` or }, to ${ or `
    let j = start; for (;;) { if (j >= n) err('Unterminated template literal', start); const c = src[j]; if (c === '\\') { j += 2; continue; } if (c === '`') { j++; push('tmpl', cont ? start - 1 : start - 1, j, { part: cont ? 'tail' : 'full' }); return j; } if (c === '$' && src[j + 1] === '{') { j += 2; push('tmpl', start - 1, j, { part: cont ? 'mid' : 'head' }); stack.push('t'); return j; } j++; }
  };
  while (i < n) {
    const c = src[i];
    if (c === '\n' || c === '\r' || c === ' ' || c === ' ') { nl = true; i++; continue; }
    if (/\s/.test(c) || c === '﻿') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); if (e < 0) err('Unterminated comment'); if (/[\n\r]/.test(src.slice(i, e))) nl = true; i = e + 2; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; else if (src[j] === '\n') err('Unterminated string'); j++; } if (j >= n) err('Unterminated string'); push('str', i, j + 1); i = j + 1; continue; }
    if (c === '`') { i = readTmpl(i + 1, false); continue; }
    if (c === '}' && stack[stack.length - 1] === 't') { stack.pop(); i = readTmpl(i + 1, true); if (toks[toks.length - 1].part === 'mid') { /* readTmpl pushed 't' again */ } continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) { const m = /^(?:0[xX][0-9a-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|(?:[0-9][0-9_]*)?\.?[0-9_]*(?:[eE][+-]?[0-9_]+)?n?)/.exec(src.slice(i, i + 80)); push('num', i, i + m[0].length); i += m[0].length; continue; }
    if (isIdStart(c) || c === '#' && isIdStart(src[i + 1] || ' ')) { let j = i + 1; while (j < n && (isIdPart(src[j]))) j++; if (src[i] === '\\') err('Unicode escapes in identifiers are not supported'); push('id', i, j); i = j; continue; }
    if (c === '/' && regexOk()) { let j = i + 1, cls = false; while (j < n) { const d = src[j]; if (d === '\\') { j += 2; continue; } if (d === '\n') err('Unterminated regular expression'); if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) break; j++; } j++; while (j < n && /[a-z]/i.test(src[j])) j++; push('re', i, j); i = j; continue; }
    let p = null; for (const q of TS_PUNCT) if (src.startsWith(q, i)) { p = q; break; }
    if (p === '?.' && /[0-9]/.test(src[i + 2] || '')) p = null;
    if (!p) p = c;
    if (p === '{') stack.push('{'); else if (p === '}') stack.pop();
    push('p', i, i + p.length); i += p.length;
  }
  // bracket matching (templates: head opens, mid both, tail closes)
  const st = [];
  toks.forEach((tk, k) => {
    const o = tk.t === 'p' ? tk.v : null;
    if (o === '(' || o === '[' || o === '{' || (tk.t === 'tmpl' && tk.part === 'head')) st.push(k);
    else if (tk.t === 'tmpl' && tk.part === 'mid') { const a = st.pop(); toks[a].m = k; tk.m = a; st.push(k); }
    else if (o === ')' || o === ']' || o === '}' || (tk.t === 'tmpl' && tk.part === 'tail')) { const a = st.pop(); if (a === undefined) throw new TsFail('Unbalanced ' + tk.v + ' at ' + tsPos(src, tk.s)); toks[a].m = k; tk.m = a; }
  });
  if (st.length) throw new TsFail('Unclosed ' + toks[st[st.length - 1]].v + ' at ' + tsPos(src, toks[st[st.length - 1]].s));
  return toks;
}
function tsPos(src, at) { const pre = src.slice(0, at), line = pre.split('\n').length; return 'line ' + line + ', column ' + (at - pre.lastIndexOf('\n')); }

function tsStrip(src, opt = {}) {
  const T = tsTokenize(src), edits = [], N = T.length, typeNames = new Set(), imports = [];
  const v = (k) => (T[k] ? T[k].v : ''), isP = (k, s) => T[k] && T[k].t === 'p' && T[k].v === s, isId = (k, s) => T[k] && T[k].t === 'id' && (s === undefined || T[k].v === s);
  const fail = (m, k) => { throw new TsFail(m + ' at ' + tsPos(src, T[Math.min(k, N - 1)] ? T[Math.min(k, N - 1)].s : src.length)); };
  const del = (s, e) => { if (e > s) edits.push({ s, e, text: '' }); };
  const ins = (at, text) => edits.push({ s: at, e: at, text });
  const rep = (s, e, text) => edits.push({ s, e, text });
  const endOf = (k) => T[k].e;
  const exprEnd = (k) => { const t = T[k]; if (!t) return false; if (t.t === 'p') return t.v === ')' || t.v === ']' || t.v === '}' || t.v === '++' || t.v === '--'; if (t.t === 'id') return !TS_KW_EXPR.has(t.v) || (k > 0 && v(k - 1) === '.'); if (t.t === 'tmpl') return t.part === 'tail' || t.part === 'full'; return true; };
  // ---- types ----
  const bad = (k) => new TsFail('Unrecognised type syntax at ' + tsPos(src, T[Math.min(k, N - 1)] ? T[Math.min(k, N - 1)].s : src.length));
  const spec = (f, k) => { try { return f(k); } catch (e) { if (e instanceof TsFail) return -1; throw e; } };
  function skipTypeArgs(k) { // at '<'; returns index after '>'
    if (!isP(k, '<')) throw bad(k); k++;
    if (isP(k, '>')) return k + 1;
    for (;;) {
      while (isId(k) && /^(const|in|out)$/.test(v(k)) && T[k + 1] && (T[k + 1].t === 'id')) k++;
      k = skipType(k, true);
      if (isId(k, 'extends')) { const a = skipType(k + 1, true); if (isP(a, '?')) { const b = skipType(a + 1); if (!isP(b, ':')) throw bad(k); k = skipType(b + 1); } else k = a; }
      if (isP(k, '=')) k = skipType(k + 1);
      if (isP(k, ',')) { k++; if (isP(k, '>')) return k + 1; continue; }
      if (isP(k, '>')) return k + 1; throw bad(k);
    }
  }
  function skipEntity(k) { if (!isId(k)) throw bad(k); k++; while (isP(k, '.') && isId(k + 1)) k += 2; return k; }
  function skipParamsT(k) { // (...) in function types; balanced
    if (!isP(k, '(')) throw bad(k); return T[k].m + 1;
  }
  function skipPrimary(k) {
    const t = T[k]; if (!t) throw bad(k);
    if (t.t === 'id') {
      const w = t.v;
      if (/^(keyof|readonly|unique)$/.test(w) && T[k + 1] && !(T[k + 1].t === 'p' && /^[,;)\]>=|&]$/.test(T[k + 1].v))) return skipPostfix(skipPrimary(k + 1), k + 1);
      if (w === 'infer') { k = skipPrimary(k + 1); if (isId(k, 'extends') && !isP(k + 1, '?')) { const r = spec(skipType, k + 1); if (r > 0 && !isP(r, '?')) k = r; } return k; }
      if (w === 'typeof') { if (isId(k + 1, 'import')) return skipPrimary(k + 1); k = skipEntity(k + 1); if (isP(k, '<') && !T[k].nl) { const r = spec(skipTypeArgs, k); if (r > 0) k = r; } return k; }
      if (w === 'import') { if (!isP(k + 1, '(')) throw bad(k); k = T[k + 1].m + 1; while (isP(k, '.') && isId(k + 1)) k += 2; if (isP(k, '<')) k = skipTypeArgs(k); return k; }
      if (w === 'new' || (w === 'abstract' && isId(k + 1, 'new'))) { if (w === 'abstract') k++; k++; if (isP(k, '<')) k = skipTypeArgs(k); k = skipParamsT(k); if (!isP(k, '=>')) throw bad(k); return skipType(k + 1); }
      if (w === 'asserts' && isId(k + 1) && !T[k + 1].nl) { /* asserts x [is T] */ k += 2; if (isId(k, 'is') && !T[k].nl) k = skipType(k + 1); return k; }
      k = skipEntity(k); if (isP(k, '<') && !T[k].nl) k = skipTypeArgs(k);
      return k;
    }
    if (t.t === 'str' || t.t === 'num') return k + 1;
    if (t.t === 'tmpl') { let q = k; while (T[q].part === 'head' || T[q].part === 'mid') q = T[q].m; return q + 1; }
    if (t.t === 'p') {
      if (t.v === '-' && T[k + 1] && T[k + 1].t === 'num') return k + 2;
      if (t.v === '(') { const m = t.m; if (isP(m + 1, '=>') && isFnTypeStart(k)) return skipType(m + 2); return skipTypeInParens(k); }
      if (t.v === '<') { k = skipTypeArgs(k); k = skipParamsT(k); if (!isP(k, '=>')) throw bad(k); return skipType(k + 1); }
      if (t.v === '{' || t.v === '[') return t.m + 1;
    }
    throw bad(k);
  }
  function isFnTypeStart(k) { // '(' begins function-type parameters (vs a parenthesised type)
    const a = k + 1; if (isP(a, ')') || isP(a, '...')) return true;
    if (isId(a) || isId(a, 'this')) { const b = a + 1; return isP(b, ':') || isP(b, ',') || isP(b, '?') || isP(b, '=') || (isP(b, ')')); }
    if (isP(a, '{') || isP(a, '[')) { const b = T[a].m + 1; return isP(b, ':') || isP(b, ',') || isP(b, '?') || isP(b, '=') || isP(b, ')'); }
    return false;
  }
  function skipTypeInParens(k) { const e = skipType(k + 1); if (e !== T[k].m) throw bad(k); return e + 1; }
  function skipPostfix(k) { while (isP(k, '[') && !T[k].nl) k = T[k].m + 1; return k; }
  function skipType(k, noCond) {
    if (isP(k, '|') || isP(k, '&')) k++;
    k = skipPostfix(skipPrimary(k));
    while ((isP(k, '|') || isP(k, '&'))) { k = skipPostfix(skipPrimary(k + 1)); }
    if (!noCond && isId(k, 'extends') && !T[k].nl && k > 0) { // conditional
      const r = k + 1; const a = skipType(r); if (isP(a, '?')) { const b = skipType(a + 1); if (!isP(b, ':')) throw bad(k); return skipType(b + 1); } throw bad(k);
    }
    if (isId(k, 'is') && k > 0 && isId(k - 1) && !T[k].nl && opt._retCtx) return skipType(k + 1);
    return k;
  }
  function skipRetType(k) { opt._retCtx = true; try { return skipType(k); } finally { opt._retCtx = false; } }
  function skipAnnot(k) { // at ':'; deletes annotation, returns index after type
    const e = skipType(k + 1); del(endOf(k - 1), endOf(e - 1)); return e;
  }
  function skipRetAnnot(k) { const e = skipRetType(k + 1); del(endOf(k - 1), endOf(e - 1)); return e; }
  function delTypeParams(k) { const e = skipTypeArgs(k); del(T[k].s, endOf(e - 1)); return e; }

  // ---- scanning ----
  // scan tokens from k until a stop token at this nesting level; returns index of the stop token (not consumed)
  function scan(k, stop, asi, ctx = {}) {
    let ternary = 0, ms = !!ctx.member;
    while (k < N) {
      const t = T[k], prev = k - 1;
      if (t.t === 'p' && stop.includes(t.v)) return k;
      if (t.t === 'tmpl' && (t.part === 'mid' || t.part === 'tail') && stop.includes('tmpl')) return k;
      if (asi && t.nl && k > 0 && exprEnd(prev) && !isContinuation(k)) return k;
      const wasMember = ms; ms = false;
      if (wasMember && ctx.member && !(t.t === 'id' && v(prev) === '.') && (t.t === 'id' || t.t === 'str' || t.t === 'num' || (t.t === 'p' && (t.v === '[' || t.v === '*'))) && tryMethod(k)) { k = methodEnd; continue; }
      if (t.t === 'tmpl') { if (t.part === 'head') { let q = k + 1; for (;;) { q = scan(q, ['tmpl'], false); if (T[q].part === 'tail') break; q++; } k = q + 1; } else k++; continue; }
      if (t.t === 'p') {
        const w = t.v;
        if (w === '(') { k = parenAt(k, ternary); continue; }
        if (w === '[' ) { const e = scan(k + 1, [']'], false); k = e + 1; continue; }
        if (w === '{') { const e = scan(k + 1, ['}'], false, { member: true }); k = e + 1; ms = true; continue; }
        if (w === '<') {
          if (!exprEnd(prev) || (T[prev].t === 'id' && TS_KW_EXPR.has(T[prev].v) && v(prev - 1) !== '.')) { // expression start
            const e = spec(skipTypeArgs, k);
            if (e > 0 && isP(e, '(') && tryArrow(e, ternary)) { del(t.s, endOf(e - 1)); k = e; continue; }
            if (e > 0) fail('Angle-bracket type assertions (<T>expr) are not supported. Use "expr as T"', k);
            fail('JSX or unrecognised "<" is not supported (TypeScript only, not TSX)', k);
          }
          if (T[prev].t === 'id' || isP(prev, ')') && false) { const e = spec(skipTypeArgs, k); if (e > 0 && (isP(e, '(') || (T[e] && T[e].t === 'tmpl' && T[e].part !== 'mid' && T[e].part !== 'tail') || (isId(prev) && isId(prev - 1, 'new') && true))) { del(t.s, endOf(e - 1)); k = e; continue; } }
          k++; continue;
        }
        if (w === '!' && k > 0 && !t.nl && exprEnd(prev) && !(T[prev].t === 'p' && T[prev].v === '}' && false)) { del(t.s, t.e); k++; continue; }
        if (w === '?') { ternary++; k++; continue; }
        if (w === ':') { if (ternary > 0) ternary--; k++; continue; }
        if (w === ';' || w === ',') ms = !!ctx.member;
        if (w === '@') fail('Decorators are not supported', k);
        k++; if (w === '}' ) ms = !!ctx.member;
        continue;
      }
      if (t.t === 'id') {
        const w = t.v, afterDot = v(prev) === '.' || v(prev) === '?.';
        if (!afterDot) {
          if (k === 0 || stmtStart(k)) { const r = stmtKeyword(k); if (r >= 0) { k = r; continue; } }
          if (w === 'function' && !(T[k + 1] && T[k + 1].t === 'p' && /^[:,}=)]$/.test(T[k + 1].v))) { k = functionHead(k, false); continue; }
          if (w === 'class' && !(T[k + 1] && T[k + 1].t === 'p' && /^[:,}=)]$/.test(T[k + 1].v))) { k = classAt(k); continue; }
          if (w === 'const' || w === 'let' || w === 'var') { if (isDeclStart(k)) { k = declAt(k); continue; } }
          if (w === 'catch' && isP(k + 1, '(')) { let q = k + 2; if (isId(q) && isP(q + 1, ':')) { skipAnnot(q + 1); } else if (isP(q, '{') || isP(q, '[')) { /* pattern */ } k = k + 1; continue; }
          if ((w === 'as' || w === 'satisfies') && k > 0 && !t.nl && exprEnd(prev)) {
            let e; if (w === 'as' && isId(k + 1, 'const')) e = k + 2; else e = skipType(k + 1);
            del(endOf(prev), endOf(e - 1)); k = e; continue;
          }
          if (w === 'async' && isP(k + 1, '(') && !T[k + 1].nl) { if (tryArrow(k + 1, ternary)) { k = parenAt(k + 1, ternary, true); continue; } }
          if (w === 'async' && isP(k + 1, '<')) { const e = spec(skipTypeArgs, k + 1); if (e > 0 && isP(e, '(') && tryArrow(e, ternary)) { del(T[k + 1].s, endOf(e - 1)); k = parenAt(e, ternary, true); continue; } }
          if (w === 'enum' && isId(k + 1) && isP(k + 2, '{') && stmtStart(k)) { k = enumAt(k, false); continue; }
        }
      }
      k++;
    }
    return k;
  }
  function isContinuation(k) {
    const t = T[k]; if (t.t === 'tmpl') return t.part === 'head' || t.part === 'full';
    if (t.t === 'id') return /^(in|instanceof|as|satisfies|of)$/.test(t.v);
    if (t.t !== 'p') return false;
    return !/^(\+\+|--|!|~|\{|;|\}|\)|\]|@)$/.test(t.v) || (t.v === '}' && false);
  }
  function stmtStart(k) { if (k === 0) return true; const p = T[k - 1]; return p.t === 'p' && (p.v === ';' || p.v === '{' || p.v === '}') || T[k].nl || (p.t === 'id' && /^(export|declare|default)$/.test(p.v)) || (p.t === 'p' && p.v === ')' && false); }
  function isDeclStart(k) { const n1 = T[k + 1]; if (!n1) return false; if (n1.t === 'id') return !/^(in|instanceof)$/.test(n1.v); return n1.t === 'p' && (n1.v === '{' || n1.v === '['); }
  function parenAt(k, ternary, afterAsync) { // at '(' in expression position; returns index after ')' (and body start handled by caller loop)
    const prev = k - 1, pt = T[prev];
    const callLike = k > 0 && exprEnd(prev) && !(afterAsync) && !(pt.t === 'id' && pt.v === 'async' && tryArrow(k, ternary, true));
    const kwParen = pt && pt.t === 'id' && /^(if|while|for|switch|catch|with)$/.test(pt.v);
    if (!callLike && !kwParen && tryArrow(k, ternary)) return arrowParams(k);
    if (callLike || kwParen || true) {
      const asi = false; let e = scan(k + 1, [')'], asi); return e + 1;
    }
  }
  function tryArrow(k, ternary, quiet) {
    const m = T[k].m; if (isP(m + 1, '=>')) return true;
    if (isP(m + 1, ':')) {
      if (ternary > 0) { // ambiguous with a?(b):c=>d ; accept only if params look annotated
        let hasAnn = false; for (let q = k + 1; q < m; q++) { if (T[q].t === 'p' && (T[q].v === '(' || T[q].v === '[' || T[q].v === '{')) { q = T[q].m; continue; } if (T[q].t === 'p' && T[q].v === ':') hasAnn = true; }
        if (!hasAnn) return false;
      }
      const e = spec(skipRetType, m + 2); return e > 0 && isP(e, '=>');
    }
    return false;
  }
  function arrowParams(k) { const r = paramList(k, false); let e = r.end; if (isP(e, ':')) e = skipRetAnnot(e); return e; }
  // parameter list at '(' ; returns {end: index after ')', props}
  function paramList(k, isCtor) {
    const props = []; const close = T[k].m; let q = k + 1, first = true;
    while (q < close) {
      // one parameter
      let isProp = false, modS = null, modE = null;
      if (isId(q, 'this') && isP(q + 1, ':') && first) { let e = skipType(q + 2); let end = endOf(e - 1); if (isP(e, ',')) end = endOf(e); del(T[q].s, end); q = e + (isP(e, ',') ? 1 : 0); first = false; continue; }
      while (isCtor && isId(q) && /^(public|private|protected|readonly|override)$/.test(v(q)) && !(T[q + 1].t === 'p' && /^[,):?=]$/.test(T[q + 1].v))) { if (modS === null) modS = T[q].s; modE = T[q + 1].s; isProp = true; q++; }
      if (modS !== null) del(modS, modE);
      if (isP(q, '@')) fail('Decorators are not supported', q);
      if (isP(q, '...')) q++;
      let name = null;
      if (isId(q)) { name = v(q); q++; } else if (isP(q, '{') || isP(q, '[')) { scan(q + 1, [T[q].v === '{' ? '}' : ']'], false); q = T[q].m + 1; } else fail('Unrecognised parameter', q);
      if (isP(q, '?') && T[q + 1] && T[q + 1].t === 'p' && /^[:,)=]$/.test(T[q + 1].v)) { del(T[q].s, T[q].e); q++; }
      if (isP(q, ':')) q = skipAnnot(q);
      if (isP(q, '=')) { q = scan(q + 1, [',', ')'], false); }
      if (isProp) { if (!name) fail('Parameter properties cannot use destructuring', q); props.push(name); }
      first = false; if (isP(q, ',')) q++; else break;
    }
    return { end: close + 1, props };
  }
  // function keyword at k (statement or expression); returns index after return type, before the body
  function functionHead(k, isDeclare) {
    const start = k; k++; if (isP(k, '*')) k++;
    if (isId(k) && !isP(k, '(')) k++;
    if (isP(k, '<')) k = delTypeParams(k);
    if (!isP(k, '(')) fail('Expected "(" after function', k);
    const r = paramList(k, false); k = r.end;
    if (isP(k, ':')) k = skipRetAnnot(k);
    if (!isP(k, '{')) { // overload signature or declare function: remove statement
      if (stmtStart(start) || isDeclare) { const e = isP(k, ';') ? k : k - 1; removeStmt(isDeclStmtStart(start), isP(k, ';') ? k : e); return isP(k, ';') ? k + 1 : k; }
      fail('Expected function body', k);
    }
    return k;
  }
  function isDeclStmtStart(k) { let s = k; while (s > 0 && isId(s - 1) && /^(export|declare|default|async)$/.test(v(s - 1))) s--; return s; }
  // remove statement tokens [a..b] inclusive, tidy line
  function removeStmt(a, b) {
    let s = T[a].s, e = endOf(b);
    if (isP(b + 1, ';') && b + 1 > b && false) e = endOf(b + 1);
    let ls = s; while (ls > 0 && (src[ls - 1] === ' ' || src[ls - 1] === '\t')) ls--;
    let le = e; while (le < src.length && (src[le] === ' ' || src[le] === '\t')) le++;
    if ((ls === 0 || src[ls - 1] === '\n') && (le >= src.length || src[le] === '\n' || src[le] === '\r')) { s = ls; e = le < src.length ? (src[le] === '\r' && src[le + 1] === '\n' ? le + 2 : le + 1) : le; }
    del(s, e);
  }
  function stmtEndAfter(k) { // k is index of last token of a statement; include ';'
    return isP(k + 1, ';') ? k + 1 : k;
  }
  // statement-start keywords: interface, type, enum, declare, abstract, namespace, import, export
  function stmtKeyword(k) {
    const w = v(k), n1 = T[k + 1];
    if (w === 'interface' && isId(k + 1) && (isP(k + 2, '{') || isP(k + 2, '<') || isId(k + 2, 'extends'))) {
      let q = k + 2; typeNames.add(v(k + 1)); if (isP(q, '<')) q = skipTypeArgs(q);
      if (isId(q, 'extends')) { q++; for (;;) { q = skipType(q, true); if (isP(q, ',')) q++; else break; } }
      if (!isP(q, '{')) fail('Malformed interface', q); const e = T[q].m; const st = isDeclStmtStart(k); removeStmt(st, e); return e + 1;
    }
    if (w === 'type' && isId(k + 1) && !T[k + 1].nl && (isP(k + 2, '=') || isP(k + 2, '<'))) {
      typeNames.add(v(k + 1)); let q = k + 2; if (isP(q, '<')) q = skipTypeArgs(q); if (!isP(q, '=')) return -1; const e = skipType(q + 1); const last = stmtEndAfter(e - 1); removeStmt(isDeclStmtStart(k), last); return last + 1;
    }
    if (w === 'declare' && n1 && n1.t === 'id' && !n1.nl) return declareAt(k);
    if (w === 'abstract' && isId(k + 1, 'class')) { del(T[k].s, T[k + 1].s); return classAt(k + 1); }
    if ((w === 'enum' || (w === 'const' && isId(k + 1, 'enum'))) && (isId(k + 1) && isP(k + 2, '{') || w === 'const' && isId(k + 2) && isP(k + 3, '{'))) return enumAt(k, false);
    if ((w === 'namespace' || w === 'module') && isId(k + 1) && !T[k + 1].nl && (isP(k + 2, '{') || isP(k + 2, '.'))) fail('namespace/module blocks are not supported (they need runtime code generation)', k);
    if (w === 'import' && !(isP(k + 1, '(') || isP(k + 1, '.'))) return importAt(k);
    if (w === 'export') return exportAt(k);
    return -1;
  }
  function declareAt(k) { // declare ... : remove statement
    let q = k + 1; const kw = v(q);
    if (/^(namespace|module|global)$/.test(kw)) { while (!isP(q, '{') && q < N) q++; const e = T[q].m; removeStmt(isDeclStmtStart(k), e); return e + 1; }
    if (kw === 'function') { q++; while (q < N && !isP(q, ';') && !isP(q, '{') && !(T[q].nl && q > k + 3 && exprEnd(q - 1) && !isP(q, '('))) { if (isP(q, '(') || isP(q, '<') && false) q = T[q].m; q++; } const last = isP(q, ';') ? q : q - 1; removeStmt(isDeclStmtStart(k), last); return last + 1; }
    if (kw === 'class' || kw === 'abstract' || kw === 'interface' || kw === 'enum' || (kw === 'const' && isId(q + 1, 'enum'))) { while (!isP(q, '{')) q++; const e = T[q].m; if (kw === 'class' || kw === 'abstract') { /* name recorded as value: nothing */ } removeStmt(isDeclStmtStart(k), e); return e + 1; }
    if (kw === 'type') { const r = stmtKeyword(q); return r; }
    if (kw === 'const' || kw === 'let' || kw === 'var') { // declare var x: T, y: U;
      q++; for (;;) { if (isId(q)) q++; else fail('Unrecognised declare statement', q); if (isP(q, ':')) q = skipType(q + 1); if (isP(q, ',')) { q++; continue; } break; }
      const last = isP(q, ';') ? q : q - 1; removeStmt(isDeclStmtStart(k), last); return last + 1;
    }
    fail('Unsupported declare statement', k);
  }
  function declAt(k) { // let/const/var at k: process binding list; returns index after the whole declaration
    let q = k + 1;
    for (;;) {
      if (isId(q)) q++; else if (isP(q, '{') || isP(q, '[')) { scan(q + 1, [T[q].v === '{' ? '}' : ']'], false); q = T[q].m + 1; } else fail('Expected a binding name', q);
      if (isP(q, '!') && isP(q + 1, ':')) { del(T[q].s, T[q].e); q++; }
      if (isP(q, ':')) q = skipAnnot(q);
      if (isP(q, '=')) q = scan(q + 1, [',', ';', ')', ']', '}'], true);
      if (isP(q, ',')) { q++; continue; }
      break;
    }
    return q;
  }
  // ---- import / export ----
  function importAt(k) {
    const stmtS = k, rec = { def: null, ns: null, specs: [], src: null, typeOnly: false, bare: false }; let q = k + 1;
    if (T[q].t === 'str') { return q + 1; } // side-effect import: keep
    if (isId(q, 'type') && (isP(q + 1, '{') || isP(q + 1, '*') || (isId(q + 1) && !isId(q + 1, 'from')) || (isId(q + 1, 'from') && isId(q + 2, 'from')))) rec.typeOnly = true, q++;
    if (isId(q) && !isP(q, '{')) { if (isP(q + 1, '=')) fail('"import x = require()" is not supported (CommonJS-only syntax)', q); rec.def = v(q); q++; if (isP(q, ',')) q++; }
    if (isP(q, '*')) { if (!isId(q + 1, 'as')) fail('Expected "as"', q); rec.ns = v(q + 2); q += 3; }
    else if (isP(q, '{')) {
      const close = T[q].m; q++;
      while (q < close) {
        let isType = false; if (isId(q, 'type') && isId(q + 1) && !isId(q + 1, 'as') || (isId(q, 'type') && isId(q + 1, 'as') && isId(q + 2, 'as'))) { isType = true; q++; }
        const imported = v(q); let local = imported; q++;
        if (isId(q, 'as')) { local = v(q + 1); q += 2; }
        rec.specs.push({ imported, local, isType, text: imported === local ? imported : imported + ' as ' + local });
        if (isP(q, ',')) q++;
      }
      q = close + 1;
    }
    if (!isId(q, 'from')) fail('Malformed import', q); q++; if (T[q].t !== 'str') fail('Malformed import', q);
    rec.src = v(q); let last = q; if (isId(q + 1, 'with') || isId(q + 1, 'assert')) { last = T[q + 2].m; }
    const endTok = stmtEndAfter(last); rec.a = stmtS; rec.b = endTok; rec.hadSemi = endTok > last; imports.push(rec);
    return endTok + 1;
  }
  function exportAt(k) {
    let q = k + 1;
    if (isId(q, 'type') && (isP(q + 1, '{') || isP(q + 1, '*'))) { // export type {..} [from ..]
      let e = isP(q + 1, '{') ? T[q + 1].m : q + 2; if (isP(q + 1, '*')) e = q + 3 + (isId(q + 2, 'as') ? 2 : 0) - 1 + 1;
      let r = e; if (isId(r + 1, 'from')) r += 2; removeStmt(k, stmtEndAfter(r)); return stmtEndAfter(r) + 1;
    }
    if (isP(q, '=')) fail('"export =" is not supported (CommonJS-only syntax)', q);
    if (isId(q, 'as') && isId(q + 1, 'namespace')) fail('"export as namespace" is not supported', q);
    if (isId(q, 'import')) fail('"export import" is not supported', q);
    if (isP(q, '{')) { // export { a, type B, c as d } [from '...']
      const close = T[q].m; const keep = []; let z = q + 1;
      while (z < close) {
        let isType = false; if (isId(z, 'type') && isId(z + 1) && !isId(z + 1, 'as') || (isId(z, 'type') && isId(z + 1, 'as') && isId(z + 2, 'as'))) { isType = true; z++; }
        const a = v(z), b = isId(z + 1, 'as') ? v(z + 2) : a; z += isId(z + 1, 'as') ? 3 : 1;
        keep.push({ a, b, isType }); if (isP(z, ',')) z++;
      }
      const hasFrom = isId(close + 1, 'from'); const endTok = stmtEndAfter(hasFrom ? close + 2 : close);
      const kept = keep.filter((s) => !s.isType && (hasFrom || !typeNames.has(s.a)));
      if (kept.length !== keep.length) {
        if (!kept.length) removeStmt(k, endTok);
        else rep(T[q].s, endOf(close), '{ ' + kept.map((s) => (s.a === s.b ? s.a : s.a + ' as ' + s.b)).join(', ') + ' }');
      }
      exportLists.push({ k, close });
      return endTok + 1;
    }
    if (isP(q, '*')) { let e = q + 1; if (isId(e, 'as')) e += 2; if (isId(e, 'from')) e += 2; return stmtEndAfter(e - 1) + 1; }
    // export <declaration> | export default ...
    if (isId(q, 'default')) { q++; if (isId(q, 'interface')) { const r = stmtKeyword(q); return r; } if (isId(q, 'abstract') && isId(q + 1, 'class')) { del(T[q].s, T[q + 1].s); return classAt(q + 1); } return q; }
    if (isId(q, 'declare')) return declareAtExport(k, q);
    if (isId(q, 'enum') || isId(q, 'const') && isId(q + 1, 'enum')) return enumAt(q, true, k);
    if (isId(q, 'interface') || isId(q, 'type') || isId(q, 'abstract')) { const r = stmtKeyword(q); return r >= 0 ? r : q; }
    if (isId(q, 'namespace') || isId(q, 'module')) { const r = stmtKeyword(q); return r; }
    return q; // export const/function/class ...: main loop continues from q
  }
  const exportLists = [];
  function declareAtExport(k, q) { const r = declareAt(q); return r; }
  // ---- enum ----
  function enumAt(k, exported, exportTok) {
    let q = k; if (isId(q, 'const')) q++; q++; const name = v(q); q++; const close = T[q].m; q++;
    const members = []; let nextAuto = 0, nextExpr = null; const known = {}; const out = [];
    while (q < close) {
      let key; if (T[q].t === 'id') key = v(q); else if (T[q].t === 'str') key = JSON.parse('"' + v(q).slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"') + '"'); else fail('Unsupported enum member', q);
      q++; let init = null, a = q;
      if (isP(q, '=')) { q++; const e = scan(q, [',', '}'], false); init = []; for (let z = q; z < e; z++) init.push(z); q = e; }
      const keyLit = JSON.stringify(key);
      let line, valKind;
      if (init) {
        const first = T[init[0]];
        if (init.length === 1 && first.t === 'str') { line = `${name}[${keyLit}] = ${first.v};`; valKind = 'str'; delete known[key]; nextAuto = null; nextExpr = null; }
        else if (init.length === 1 && first.t === 'tmpl' && first.part === 'full') { line = `${name}[${keyLit}] = ${first.v};`; nextAuto = null; nextExpr = null; }
        else {
          let txt = '', const_ = true; for (const z of init) { const tk = T[z]; if (tk.t === 'id' && v(z - 1) !== '.' && Object.prototype.hasOwnProperty.call(known, tk.v)) { txt += known[tk.v] === null ? `${name}.${tk.v}` : String(known[tk.v]); if (known[tk.v] === null) const_ = false; } else if (tk.t === 'id' && tk.v === key && false) { } else { if (!(tk.t === 'num' || tk.t === 'p' && /^(\+|-|\*|\/|%|\*\*|<|>|&|\||\^|~|\(|\))$/.test(tk.v))) const_ = false; txt += tk.v + ' '; } }
          if (const_) { let val; try { val = Function('"use strict";return (' + txt.replace(/\b(\d+)n\b/g, '$1') + ')')(); } catch (e) { val = undefined; } if (typeof val === 'number') { known[key] = val; nextAuto = val + 1; nextExpr = null; line = `${name}[${name}[${keyLit}] = ${val}] = ${keyLit};`; } else const_ = false; }
          if (!const_) { known[key] = null; nextExpr = `${name}[${keyLit}] + 1`; nextAuto = null; line = `${name}[${name}[${keyLit}] = ${txt.trim()}] = ${keyLit};`; }
        }
      } else {
        if (nextAuto !== null) { known[key] = nextAuto; line = `${name}[${name}[${keyLit}] = ${nextAuto}] = ${keyLit};`; nextAuto++; }
        else if (nextExpr) { known[key] = null; line = `${name}[${name}[${keyLit}] = ${nextExpr}] = ${keyLit};`; nextExpr = `${name}[${keyLit}] + 1`; }
        else fail('Enum member must have an initializer', q);
      }
      out.push('    ' + line);
      if (isP(q, ',')) q++;
    }
    const text = `${exported ? 'export ' : ''}var ${name};\n(function (${name}) {\n${out.join('\n')}\n})(${name} || (${name} = {}));`;
    const startTok = exportTok !== undefined ? exportTok : isDeclStmtStart(k);
    rep(T[startTok].s, endOf(close), text);
    return close + 1;
  }
  // ---- classes ----
  function classAt(k) {
    const classStart = k; k++; let hasExtends = false;
    if (isId(k) && !isId(k, 'extends') && !isId(k, 'implements')) k++;
    if (isP(k, '<')) k = delTypeParams(k);
    if (isId(k, 'extends')) {
      hasExtends = true; k++;
      // heritage expression: scan to implements / '{', stripping type args after entity
      for (;;) { if (isP(k, '{') && T[k].v === '{') break; if (isId(k, 'implements')) break; if (isP(k, '<')) { const e = spec(skipTypeArgs, k); if (e > 0) { del(T[k].s, endOf(e - 1)); k = e; continue; } } if (isP(k, '(')) { const e = scan(k + 1, [')'], false); k = e + 1; continue; } if (k >= N) fail('Unterminated class', k); k++; }
    }
    if (isId(k, 'implements')) { const s = T[k].s; let e = k; while (!isP(e, '{')) e++; del(endOf(k - 1), endOf(e - 1)); k = e; }
    if (!isP(k, '{')) fail('Expected class body', k);
    const close = T[k].m; k++; const cs = { props: false, thisField: false, decls: [] }, openTok = k - 1;
    while (k < close) {
      if (isP(k, ';')) { k++; continue; }
      k = memberAt(k, close, hasExtends, cs);
    }
    if (cs.decls.length) ins(T[openTok].e, '\n  ' + cs.decls.map((n) => n + ';').join('\n  '));
    if (cs.props && cs.thisField) fail('A field initializer uses "this" in a class with constructor parameter properties; the order of initialisation differs between TypeScript targets, so this is not converted', classStart);
    return close + 1;
  }
  const MODS = /^(public|private|protected|readonly|static|abstract|override|declare|accessor|async|get|set)$/;
  function memberAt(k, close, hasExtends, cs) {
    const first = k; let isAbstract = false, isDeclare = false, isStatic = false; const mods = [];
    if (isP(k, '@')) fail('Decorators are not supported', k);
    // index signature
    if (isP(k, '[') && isId(k + 1) && isP(k + 2, ':')) { const e = T[k].m; let last = e; if (isP(last + 1, ':')) last = skipType(last + 2) - 1; removeStmtMember(k, stmtEndAfter(last)); return stmtEndAfter(last) + 1; }
    if (isId(k, 'static') && isP(k + 1, '{')) { const e = scan(k + 2, ['}'], false, { member: true }); return e + 1; }
    for (;;) {
      if (isId(k) && MODS.test(v(k)) && T[k + 1] && !(T[k + 1].t === 'p' && /^[(<:=;?!,}]$/.test(T[k + 1].v)) && !(T[k + 1].nl && /^(get|set|async|static|accessor)$/.test(v(k)) && false)) {
        const w = v(k); if (w === 'abstract') isAbstract = true; if (w === 'declare') isDeclare = true; if (w === 'static') isStatic = true;
        if (/^(public|private|protected|readonly|abstract|override|declare)$/.test(w)) mods.push(k);
        k++; continue;
      }
      break;
    }
    // delete modifier tokens
    for (const m of mods) del(T[m].s, T[m + 1].s);
    let gen = false; if (isP(k, '*')) { gen = true; k++; }
    // name
    let nameTok = k, isCtor = false;
    if (T[k].t === 'id' || T[k].t === 'str' || T[k].t === 'num') { isCtor = v(k) === 'constructor' && !isStatic; k++; } else if (isP(k, '[')) k = T[k].m + 1; else fail('Unrecognised class member', k);
    let optional = false; if (isP(k, '?') ) { del(T[k].s, T[k].e); k++; } else if (isP(k, '!')) { del(T[k].s, T[k].e); k++; }
    if (isP(k, '<') || isP(k, '(')) { // method
      if (isP(k, '<')) k = delTypeParams(k);
      const r = paramList(k, isCtor); k = r.end;
      if (isP(k, ':')) k = skipRetAnnot(k);
      if (!isP(k, '{')) { // overload or abstract: no body
        const last = stmtEndAfter(k - 1); removeStmtMember(first, last); return last + 1;
      }
      const bc = T[k].m;
      if (isAbstract || isDeclare) fail('Abstract/declare methods cannot have a body', k);
      scan(k + 1, ['}'], false, { member: true });
      if (isCtor && r.props.length) { cs.props = true; // insert param property assignments
        let at = T[k].e, pre = '\n', post = '';
        if (hasExtends) { // after the first super(...) call statement
          let q = k + 1, found = -1; while (q < bc) { if (isId(q, 'super') && isP(q + 1, '(')) { found = T[q + 1].m; break; } if (T[q].t === 'p' && /^[({[]$/.test(T[q].v)) { q = T[q].m + 1; continue; } q++; }
          if (found < 0) fail('A constructor with parameter properties in a derived class must call super()', k);
          at = isP(found + 1, ';') ? endOf(found + 1) : endOf(found); if (!isP(found + 1, ';')) pre = ';\n';
        }
        let ls = T[first].s; while (ls > 0 && src[ls - 1] !== '\n') ls--; const ind = (/^[ \t]*/.exec(src.slice(ls))[0]) + '  ';
        const lines = r.props.map((n) => `this.${n} = ${n};`).join('\n' + ind); cs.decls.push(...r.props);
        ins(at, pre.replace('\n', '\n' + ind) + lines);
      }
      return bc + 1;
    }
    // property
    if (isP(k, ':')) k = skipAnnot(k);
    if (isAbstract || isDeclare) { const last = isP(k, '=') ? scan(k + 1, [';', '}'], true) - 1 : k - 1; const l2 = stmtEndAfter(last); removeStmtMember(first, l2); return l2 + 1; }
    if (isP(k, '=')) { const k0 = k; k = scan(k + 1, [';', '}'], true); if (!isStatic) for (let z = k0; z < k; z++) if (isId(z, 'this')) cs.thisField = true; }
    if (isP(k, ';')) k++;
    else if (!(k >= close)) { /* ASI */ }
    return k;
  }
  function removeStmtMember(a, b) { removeStmt(a, b); }
  // tryMethod: in object literal / block mixed scan at member start. Sets methodEnd.
  let methodEnd = 0;
  function tryMethod(k) {
    let j = k;
    if (/^(if|for|while|switch|catch|with|function|return|typeof|new|throw|super|import|else|do|try|await|yield|delete|void|in|of)$/.test(v(j))) return false;
    while (isId(j) && /^(async|get|set)$/.test(v(j)) && T[j + 1] && (T[j + 1].t === 'id' || T[j + 1].t === 'str' || T[j + 1].t === 'num' || isP(j + 1, '[') || isP(j + 1, '*'))) j++;
    if (isP(j, '*')) j++;
    if (isP(j, '[')) j = T[j].m + 1; else if (T[j] && (T[j].t === 'id' || T[j].t === 'str' || T[j].t === 'num')) j++; else return false;
    let tpS = -1; if (isP(j, '<')) { const e = spec(skipTypeArgs, j); if (e < 0) return false; tpS = j; j = e; }
    if (!isP(j, '(')) return false;
    const m = T[j].m; let e = m + 1; let rt = false;
    if (isP(e, ':')) { const r = spec(skipRetType, e + 1); if (r < 0) return false; e = r; rt = true; }
    if (!isP(e, '{')) return false;
    if (tpS >= 0) delTypeParams(tpS);
    paramList(j, false); if (rt) skipRetAnnot(m + 1);
    methodEnd = e; return true;
  }
  scanTop();
  function scanTop() { let k = 0; while (k < N) { const e = scan(k, ['}', ')', ']'], false, { member: true }); if (e >= N) break; fail('Unbalanced ' + v(e), e); } }
  // ---- unused import elision & import regeneration ----
  const dels = edits.filter((e) => e.text === '' && e.e > e.s).map((e) => [e.s, e.e]);
  const inDel = (p) => dels.some(([a, b]) => p >= a && p < b);
  const used = new Set(); const impRanges = imports.map((r) => [T[r.a].s, endOf(r.b)]);
  T.forEach((tk, k) => { if (tk.t === 'id' && !(k > 0 && (T[k - 1].v === '.' || T[k - 1].v === '?.')) && !inDel(tk.s) && !impRanges.some(([a, b]) => tk.s >= a && tk.s < b)) used.add(tk.v); });
  // names used in export lists count as used
  for (const ex of exportLists) for (let z = ex.k; z < ex.close; z++) if (T[z].t === 'id' && !inDel(T[z].s)) used.add(T[z].v);
  for (const r of imports) {
    if (opt.keepImports) continue;
    const defUsed = r.def && used.has(r.def) && !r.typeOnly, nsUsed = r.ns && used.has(r.ns) && !r.typeOnly;
    const specs = r.typeOnly ? [] : r.specs.filter((s) => !s.isType && used.has(s.local));
    const keepAny = defUsed || nsUsed || specs.length;
    if (!keepAny) { removeStmt(r.a, r.b); continue; }
    const parts = []; if (defUsed) parts.push(r.def); if (nsUsed) parts.push('* as ' + r.ns); if (specs.length) parts.push('{ ' + specs.map((s) => s.text).join(', ') + ' }');
    const orig = src.slice(T[r.a].s, endOf(r.b));
    if (r.typeOnly || specs.length !== r.specs.length || (r.def && !defUsed) || (r.ns && !nsUsed) || r.specs.some((s) => s.isType)) rep(T[r.a].s, endOf(r.b), 'import ' + parts.join(', ') + ' from ' + r.src + (r.hadSemi ? ';' : ''));
  }
  const outp = tsApply(src, edits);
  if (T.some((x) => x.t === 'id' && (x.v === 'export' || x.v === 'import')) && !tsTokenize(outp).some((x) => x.t === 'id' && (x.v === 'export' || x.v === 'import'))) return outp.replace(/\s*$/, '') + '\nexport {};\n';
  return outp;
}
function tsApply(src, edits) {
  const es = edits.slice().sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
  const kept = []; let end = -1;
  for (const e of es) { if (e.s < end) { if (e.e <= end) continue; continue; } kept.push(e); end = Math.max(end, e.e); }
  let out = '', pos = 0; for (const e of kept) { out += src.slice(pos, e.s) + e.text; pos = e.e; } out += src.slice(pos);
  return out;
}

// ===== JavaScript obfuscator (token-level, conservative) =====
// Uses tsTokenize (same tokenizer as the TypeScript stripper).
function jsoUnescape(raw) { // raw includes quotes; returns string value or null when unsure
  const b = raw.slice(1, -1); let o = '';
  for (let i = 0; i < b.length; i++) {
    const c = b[i]; if (c !== '\\') { o += c; continue; }
    const e = b[++i];
    if (e === 'n') o += '\n'; else if (e === 't') o += '\t'; else if (e === 'r') o += '\r'; else if (e === 'b') o += '\b'; else if (e === 'f') o += '\f'; else if (e === 'v') o += '\v';
    else if (e === '0' && !/[0-9]/.test(b[i + 1] || '')) o += '\0';
    else if (e === 'x') { const h = b.substr(i + 1, 2); if (!/^[0-9a-fA-F]{2}$/.test(h)) return null; o += String.fromCharCode(parseInt(h, 16)); i += 2; }
    else if (e === 'u') { if (b[i + 1] === '{') { const j = b.indexOf('}', i); const cp = parseInt(b.slice(i + 2, j), 16); if (!(cp >= 0 && cp <= 0x10ffff)) return null; o += String.fromCodePoint(cp); i = j; } else { const h = b.substr(i + 1, 4); if (!/^[0-9a-fA-F]{4}$/.test(h)) return null; o += String.fromCharCode(parseInt(h, 16)); i += 4; } }
    else if (e === '\n' || e === ' ' || e === ' ') { /* line continuation */ }
    else if (e === '\r') { if (b[i + 1] === '\n') i++; }
    else if (/[0-9]/.test(e)) return null;
    else o += e;
  }
  return o;
}
function jsoEncode(s) { let o = "'"; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c >= 0x20 && c < 0x7f && c !== 0x27 && c !== 0x5c) o += s[i]; else if (c < 256) o += '\\x' + c.toString(16).padStart(2, '0'); else o += '\\u' + c.toString(16).padStart(4, '0'); } return o + "'"; }
function jsoHexAll(s) { let o = "'"; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); o += c < 256 ? '\\x' + c.toString(16).padStart(2, '0') : '\\u' + c.toString(16).padStart(4, '0'); } return o + "'"; }
const JSO_KW = new Set('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof new return super switch this throw try typeof var void while with yield let static await async of get set null true false undefined NaN Infinity arguments eval'.split(' '));
function jsObfuscate(src, o = {}) {
  let hashbang = ''; if (src.startsWith('#!')) { const e = src.indexOf('\n'); hashbang = (e < 0 ? src : src.slice(0, e)) + '\n'; src = e < 0 ? '' : src.slice(e + 1); }
  let T; try { T = tsTokenize(src); } catch (e) { if (e instanceof TsFail) throw new Error('Could not tokenise the JavaScript: ' + e.message); throw e; }
  const notes = []; const N = T.length; let seed = (o.seed >>> 0) || 1;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const v = (k) => (T[k] ? T[k].v : ''), isP = (k, s) => T[k] && T[k].t === 'p' && T[k].v === s, isId = (k, s) => T[k] && T[k].t === 'id' && (s === undefined || T[k].v === s);
  const repl = new Map(); // token index -> replacement text
  const allIds = new Set(T.filter((t) => t.t === 'id').map((t) => t.v));
  const mkName = () => { for (;;) { const n = '_0x' + Math.floor(rnd() * 0xffffff).toString(16).padStart(5, '0'); if (!allIds.has(n)) { allIds.add(n); return n; } } };
  // ---- 1. rename local variables ----
  if (o.rename) {
    const danger = T.findIndex((t, k) => t.t === 'id' && !isP(k - 1, '.') && (t.v === 'eval' || t.v === 'with' || (t.v === 'Function' && (isP(k + 1, '(') || isId(k - 1, 'new')))));
    if (danger >= 0) notes.push('Renaming skipped: "' + T[danger].v + '" found (it can reach local names by string).');
    else jsoRename(T, src, notes, mkName, o, repl);
  }
  // ---- 2. strings ----
  let prelude = ''; const strTokens = [];
  T.forEach((t, k) => {
    if (t.t !== 'str') return;
    const p = T[k - 1], nx = T[k + 1];
    const stmtStart = !p || (p.t === 'p' && /^[;{}]$/.test(p.v)); if (stmtStart && (!nx || nx.nl || (nx.t === 'p' && /^[;}]$/.test(nx.v)))) return; // directive
    if (p && p.t === 'p' && /^[{,]$/.test(p.v) && nx && nx.t === 'p' && nx.v === ':' && T[k - 1] && T[T[k].m === undefined ? 0 : 0]) { /* key (possibly) */ }
    if (p && p.t === 'p' && /^[{,]$/.test(p.v) && isP(k + 1, ':')) return; // object key
    if (isP(k + 1, '(') && p && p.t === 'p' && /^[{,;}]$/.test(p.v)) return; // 'method'() {}
    if (p && p.t === 'id' && /^(from|import|get|set|static|async)$/.test(p.v)) return; // module specifiers / member names
    if (isId(k - 1, 'export') || (p && p.v === '*' && isId(k - 2, 'export'))) return;
    const val = jsoUnescape(t.v); if (val === null) return;
    strTokens.push({ k, val });
  });
  if (o.stringArray && strTokens.length) {
    const uniq = [...new Set(strTokens.map((s) => s.val))];
    const order = uniq.map((_, i) => i); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const arrName = mkName(); const pos = new Map(); order.forEach((orig, i) => pos.set(uniq[orig], i));
    const arr = order.map((orig) => jsoHexAll(uniq[orig]));
    for (const s of strTokens) repl.set(s.k, arrName + '[0x' + pos.get(s.val).toString(16) + ']');
    prelude = 'var ' + arrName + '=[' + arr.join(',') + '];';
    notes.push(uniq.length + ' distinct strings moved into one array.');
  } else if (o.escape) { for (const s of strTokens) repl.set(s.k, jsoHexAll(s.val)); notes.push(strTokens.length + ' strings written as \\x escapes.'); }
  // ---- 3. numbers ----
  if (o.hexNumbers) T.forEach((t, k) => { if (t.t === 'num' && /^[0-9]+$/.test(t.v) && !isP(k + 1, '.') && !(isP(k - 1, '.')) && t.v.length < 16 && !/^0[0-9]/.test(t.v) ) { const n = Number(t.v); if (Number.isSafeInteger(n)) repl.set(k, '0x' + n.toString(16)); } });
  // ---- 4. emit ----
  let out = '';
  const idc = /[A-Za-z0-9_$\\]/;
  const pieces = T.map((t, k) => (repl.has(k) ? repl.get(k) : t.v));
  if (!o.minify) {
    let pos = 0, res = ''; T.forEach((t, k) => { res += src.slice(pos, t.s) + pieces[k]; pos = t.e; }); res += src.slice(pos);
    out = (prelude ? prelude + '\n' : '') + res;
  } else {
    let last = '';
    T.forEach((t, k) => {
      const p = pieces[k]; let sep = '';
      if (out) {
        const a = last[last.length - 1], b = p[0];
        if (idc.test(a) && idc.test(b)) sep = ' '; else if ((a === '+' && b === '+') || (a === '-' && b === '-') || (a === '/' && (b === '/' || b === '*')) || (a === '+' && b === '-' && false)) sep = ' ';
        else if (/[0-9]/.test(a) && b === '.' && false) sep = ' ';
        if (t.nl && !sep && !(last === ';' || last === '{') && !(T[k - 1] && T[k - 1].t === 'tmpl' && false)) sep = '\n'; else if (t.nl && sep === ' ' ) sep = '\n';
        if (T[k - 1] && T[k - 1].t === 'num' && /^[0-9]+$/.test(T[k - 1].v) && b === '.') sep = ' ';
        if (a === '.' && /^\d/.test(b) && false) sep = ' ';
      }
      out += sep + p; last = p;
    });
    out = prelude + out;
  }
  return { code: hashbang + out, notes };
}
// local-variable renaming (conservative scope analysis on tokens)
function jsoRename(T, src, notes, mkName, o, repl) {
  const N = T.length; const isP = (k, s) => T[k] && T[k].t === 'p' && T[k].v === s, isId = (k, s) => T[k] && T[k].t === 'id' && (s === undefined || T[k].v === s), v = (k) => (T[k] ? T[k].v : '');
  const encl = new Array(N).fill(-1), st = [];
  T.forEach((t, k) => { if ((t.t === 'p' && (t.v === ')' || t.v === ']' || t.v === '}')) || (t.t === 'tmpl' && (t.part === 'tail' || t.part === 'mid'))) st.pop(); encl[k] = st.length ? st[st.length - 1] : -1; if ((t.t === 'p' && (t.v === '(' || t.v === '[' || t.v === '{')) || (t.t === 'tmpl' && (t.part === 'head' || t.part === 'mid'))) st.push(k); });
  const kind = new Map(), tricky = new Set(), fns = new Map(); // fns: body '{' index -> {start (function token), end}
  const trickyRange = (a, b) => { for (let q = a; q <= b; q++) if (T[q].t === 'id') tricky.add(T[q].v); };
  const KW = /^(if|for|while|switch|catch|with|function|return|typeof|new|await|yield|in|of|do|else|case|throw|delete|void|instanceof)$/;
  const decls = []; // {name, scopeS, scopeE, tok}
  // classes
  T.forEach((t, k) => { if (isId(k, 'class') && !isP(k - 1, '.')) { let q = k + 1; while (q < N && !isP(q, '{')) { if (isP(q, '(') || isP(q, '[')) q = T[q].m; q++; } if (q < N) { kind.set(q, 'opaque'); } if (isId(k + 1) && !isId(k + 1, 'extends')) tricky.add(v(k + 1)); for (let z = k + 1; z < q; z++) if (T[z].t === 'id') tricky.add(T[z].v); } });
  // arrows
  T.forEach((t, k) => { if (isP(k, '=>')) { if (isId(k - 1)) tricky.add(v(k - 1)); else if (isP(k - 1, ')')) trickyRange(T[k - 1].m, k - 1); if (isP(k + 1, '{')) kind.set(k + 1, 'opaque'); } });
  // methods / getters / setters: ident ( ... ) {
  T.forEach((t, k) => { if (t.t === 'id' && isP(k + 1, '(') && isP(T[k + 1].m + 1, '{') && !KW.test(t.v) && !(isId(k - 1, 'function') || (isP(k - 1, '*') && isId(k - 2, 'function')))) { tricky.add(t.v); trickyRange(k + 1, T[k + 1].m); kind.set(T[k + 1].m + 1, 'opaque'); } });
  // function declarations / expressions
  T.forEach((t, k) => {
    if (!isId(k, 'function') || isP(k - 1, '.')) return;
    let q = k + 1; if (isP(q, '*')) q++; let nameTok = -1; if (isId(q)) nameTok = q++;
    if (!isP(q, '(') || !isP(T[q].m + 1, '{')) { return; }
    const close = T[q].m, body = close + 1; const params = []; let simple = true;
    for (let z = q + 1; z < close; z++) { if (T[z].t === 'id' && (z === q + 1 || isP(z - 1, ',')) && (z + 1 === close || isP(z + 1, ','))) params.push(z); else if (!isP(z, ',')) simple = false; }
    const pv = T[k - 1];
    const exprPos = pv && ((pv.t === 'p' && !/^[;{})]$/.test(pv.v)) || (pv.t === 'id' && /^(return|typeof|new|in|of|case|throw|void|delete|await|yield)$/.test(pv.v)));
    if (!simple) trickyRange(q, close); else if (!kind.has(body)) { kind.set(body, 'fn'); fns.set(body, { start: k, end: T[body].m }); for (const p of params) decls.push({ name: v(p), tok: p, scopeS: k, scopeE: T[body].m, fnBody: body }); }
    if (nameTok >= 0) { if (exprPos) tricky.add(v(nameTok)); else decls.push({ name: v(nameTok), tok: nameTok, decl: 'func', at: k }); }
  });
  // var/let/const declarations
  const continues = (k) => { const t = T[k]; if (t.t === 'tmpl') return t.part === 'head' || t.part === 'full'; if (t.t === 'id') return /^(in|instanceof|of)$/.test(t.v); if (t.t !== 'p') return false; return !/^(\+\+|--|!|~|\{|;|\}|\)|\]|@)$/.test(t.v); };
  const endsExpr = (k) => { const t = T[k]; if (t.t === 'p') return /^[)\]}]$|^(\+\+|--)$/.test(t.v); if (t.t === 'id') return !/^(return|typeof|void|delete|await|yield|case|throw|in|of|instanceof|new|else|do|extends|export|default|import|as|var|let|const)$/.test(t.v); return true; };
  const declList = [];
  T.forEach((t, k) => {
    if (!(t.t === 'id' && /^(var|let|const)$/.test(t.v)) || isP(k - 1, '.') || isP(k - 1, '?.')) return;
    if (t.v === 'let' && !(isId(k + 1) || isP(k + 1, '[') || isP(k + 1, '{'))) return;
    let q = k + 1;
    for (;;) {
      if (isP(q, '{') || isP(q, '[')) { trickyRange(q, T[q].m); q = T[q].m + 1; }
      else if (isId(q)) { declList.push({ name: v(q), tok: q, kw: t.v, at: k }); q++; }
      else break;
      if (isP(q, '=')) { // skip initializer
        q++; while (q < N) { const x = T[q]; if (x.t === 'p' && (x.v === ',' || x.v === ';')) break; if (x.t === 'p' && (x.v === ')' || x.v === ']' || x.v === '}')) break; if (x.t === 'id' && (x.v === 'in' || x.v === 'of') && false) break; if (x.nl && q > 0 && endsExpr(q - 1) && !continues(q)) break; if (x.t === 'p' && (x.v === '(' || x.v === '[' || x.v === '{')) { q = x.m + 1; continue; } if (x.t === 'tmpl' && x.part === 'head') { let z = q; while (T[z].part !== 'tail') z = T[z].m; q = z + 1; continue; } q++; }
      }
      if (isP(q, ',')) { q++; continue; }
      break;
    }
  });
  // catch params
  T.forEach((t, k) => { if (isId(k, 'catch') && isP(k + 1, '(')) trickyRange(k + 1, T[k + 1].m); });
  // shorthand properties / classfield-like: prev { or , and next , or } inside braces
  T.forEach((t, k) => { if (t.t === 'id' && encl[k] >= 0 && isP(encl[k], '{') && (isP(k - 1, '{') || isP(k - 1, ',')) && (isP(k + 1, ',') || isP(k + 1, '}'))) tricky.add(t.v); });
  // scope for each simple declaration
  const fnOf = (k) => { for (let e = encl[k]; e >= 0; e = encl[e]) { const kd = kind.get(e); if (kd === 'fn') return { fn: e }; if (kd === 'opaque') return { opaque: true }; } return { top: true }; };
  const blockOf = (k) => { for (let e = encl[k]; e >= 0; e = encl[e]) if (isP(e, '{')) return e; return -1; };
  for (const d of declList) {
    const w = fnOf(d.tok);
    if (w.opaque) { tricky.add(d.name); continue; }
    if (w.top) continue; // top-level: never renamed unless option below
    if (d.kw === 'var') decls.push({ name: d.name, tok: d.tok, scopeS: fns.get(w.fn).start, scopeE: fns.get(w.fn).end });
    else {
      // let/const: innermost block; a for-header declaration belongs to the whole for statement
      const forTok = isP(encl[d.tok], '(') && isId(encl[d.tok] - 1, 'for') ? encl[d.tok] - 1 : -1;
      if (forTok >= 0) { const pc = T[encl[d.tok]].m; let e; if (isP(pc + 1, '{')) e = T[pc + 1].m; else { e = pc + 1; while (e < N && !isP(e, ';') && !(isP(e, '}') && encl[e] !== encl[forTok])) { if (T[e].t === 'p' && /^[({[]$/.test(T[e].v)) e = T[e].m; e++; } } decls.push({ name: d.name, tok: d.tok, scopeS: forTok, scopeE: e }); }
      else { const b = blockOf(d.tok); if (b < 0) continue; if (kind.get(b) === 'opaque') { tricky.add(d.name); continue; } decls.push({ name: d.name, tok: d.tok, scopeS: b, scopeE: T[b].m }); }
    }
  }
  // function declaration names: scope = enclosing function body, only when directly in it (otherwise tricky)
  for (const d of decls.filter((x) => x.decl === 'func')) {
    const e = encl[d.at]; const w = fnOf(d.at);
    if (w.top || w.opaque || e !== w.fn) { tricky.add(d.name); continue; }
    d.scopeS = fns.get(w.fn).start; d.scopeE = fns.get(w.fn).end;
  }
  const real = decls.filter((d) => d.scopeS !== undefined && !tricky.has(d.name));
  if (!real.length) { notes.push('No local variables were safe to rename.'); return; }
  // name per (name, scope)
  const names = new Map(); const keyOf = (d) => d.name + '@' + d.scopeS + '-' + d.scopeE;
  for (const d of real) if (!names.has(keyOf(d))) names.set(keyOf(d), mkName());
  const byName = new Map(); for (const d of real) { if (!byName.has(d.name)) byName.set(d.name, []); byName.get(d.name).push(d); }
  // class-body member names that must not be touched
  const inClassBody = (k) => { const e = encl[k]; return e >= 0 && isP(e, '{') && kind.get(e) === 'opaque' && T[e - 1] && !isP(e - 1, ')') && !isP(e - 1, '=>'); };
  let count = 0;
  T.forEach((t, k) => {
    if (t.t !== 'id' || !byName.has(t.v)) return;
    if (isP(k - 1, '.') || isP(k - 1, '?.')) return;
    if (encl[k] >= 0 && isP(encl[k], '{') && (isP(k - 1, '{') || isP(k - 1, ',')) && isP(k + 1, ':')) return; // object key
    if (inClassBody(k) && /^(\(|=|;|\})$/.test(v(k + 1)) && (isP(k - 1, '{') || isP(k - 1, ';') || isP(k - 1, '}') || isId(k - 1, 'static') || isId(k - 1, 'get') || isId(k - 1, 'set') || isId(k - 1, 'async') || isP(k - 1, '*'))) return;
    let best = null; for (const d of byName.get(t.v)) if (k >= d.scopeS && k <= d.scopeE && (!best || d.scopeS > best.scopeS || (d.scopeS === best.scopeS && d.scopeE < best.scopeE))) best = d;
    if (best) { repl.set(k, names.get(keyOf(best))); count++; }
  });
  notes.push(`${names.size} local names renamed (${count} occurrences); ${tricky.size} names left alone because they appear in forms that need a full parser (destructuring, arrow parameters, class or method bodies, shorthand properties, catch).`);
}

// ===== JavaScript parser to an ESTree-shaped tree (ES2022 subset, scripts only), hand-written =====
class AstError extends Error {}
function astParse(src) {
  let T; try { T = tsTokenize(src); } catch (e) { if (e instanceof TsFail) throw new AstError(e.message); throw e; }
  if (src.startsWith('#!')) throw new AstError('Remove the #! line first');
  T.push({ t: 'eof', v: '', s: src.length, e: src.length, nl: true });
  let p = 0; const N = T.length;
  const fail = (m, k = p) => { const t = T[Math.min(k, N - 1)]; throw new AstError(m + ' at ' + tsPos(src, t.s)); };
  const cur = () => T[p];
  // operator text at p: merges adjacent '>' '>' '=' characters that the tokenizer keeps separate
  const opAt = (k = p) => { const t = T[k]; if (t.t !== 'p') return null; if (t.v === '>') { let s = '>', q = k; while (T[q + 1].t === 'p' && T[q + 1].s === T[q].e && (T[q + 1].v === '>' || T[q + 1].v === '=') && s.length < 4) { q++; s += T[q].v; if (T[q].v === '=') break; } return { v: s, n: q - k + 1 }; } if (t.v === '<' && T[k + 1].t === 'p' && T[k + 1].s === t.e && T[k + 1].v === '=') return { v: '<=', n: 2 }; return { v: t.v, n: 1 }; };
  const isP = (s, k = p) => { const o = opAt(k); return o && o.v === s; };
  const isKw = (s, k = p) => T[k].t === 'id' && T[k].v === s;
  const nextTok = () => T[p++];
  const eatP = (s) => { const o = opAt(); if (o && o.v === s) { p += o.n; return true; } return false; };
  const expectP = (s) => { if (!eatP(s)) fail('Expected "' + s + '"'); };
  const eatKw = (s) => { if (isKw(s)) { p++; return true; } return false; };
  const lastEnd = () => T[p - 1].e;
  const node = (type, start, props) => ({ type, start, end: lastEnd(), ...props });
  const RESERVED = new Set('break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with'.split(' '));
  const semicolon = () => { if (eatP(';')) return; if (isP('}') || cur().t === 'eof' || cur().nl) return; fail('Expected ";"'); };
  const ident = (allowKw) => { const t = cur(); if (t.t !== 'id' || (!allowKw && RESERVED.has(t.v))) fail('Expected an identifier'); p++; return { type: 'Identifier', start: t.s, end: t.e, name: t.v }; };
  // ---- literals ----
  function unesc(raw, tmpl) {
    const b = tmpl ? raw : raw.slice(1, -1); let o = '';
    for (let i = 0; i < b.length; i++) {
      const c = b[i]; if (c !== '\\') { o += (tmpl && c === '\r') ? (b[i + 1] === '\n' ? '' : '\n') : c; continue; }
      const e = b[++i];
      if (e === 'n') o += '\n'; else if (e === 't') o += '\t'; else if (e === 'r') o += '\r'; else if (e === 'b') o += '\b'; else if (e === 'f') o += '\f'; else if (e === 'v') o += '\v';
      else if (e === 'x') { o += String.fromCharCode(parseInt(b.substr(i + 1, 2), 16)); i += 2; }
      else if (e === 'u') { if (b[i + 1] === '{') { const j = b.indexOf('}', i); o += String.fromCodePoint(parseInt(b.slice(i + 2, j), 16)); i = j; } else { o += String.fromCharCode(parseInt(b.substr(i + 1, 4), 16)); i += 4; } }
      else if (/[0-7]/.test(e)) { let s = e; while (s.length < 3 && /[0-7]/.test(b[i + 1] || '') && parseInt(s + b[i + 1], 8) < 256) s += b[++i]; o += String.fromCharCode(parseInt(s, 8)); }
      else if (e === '\n' || e === ' ' || e === ' ') { /* continuation */ } else if (e === '\r') { if (b[i + 1] === '\n') i++; }
      else o += e;
    }
    return o;
  }
  function numVal(raw) { const r = raw.replace(/_/g, ''); if (/n$/.test(r)) return { value: BigInt(r.slice(0, -1)), bigint: BigInt(r.slice(0, -1)).toString() }; if (/^0[0-7]+$/.test(r)) return { value: parseInt(r, 8) }; return { value: Number(r) }; }
  // ---- patterns ----
  function toAssignable(n) {
    switch (n.type) {
      case 'Identifier': case 'MemberExpression': case 'ObjectPattern': case 'ArrayPattern': case 'AssignmentPattern': case 'RestElement': return n;
      case 'ObjectExpression': return { ...n, type: 'ObjectPattern', properties: n.properties.map((q) => (q.type === 'SpreadElement' ? { type: 'RestElement', start: q.start, end: q.end, argument: toAssignable(q.argument) } : { ...q, value: toAssignable(q.value) })) };
      case 'ArrayExpression': return { ...n, type: 'ArrayPattern', elements: n.elements.map((q) => (q ? (q.type === 'SpreadElement' ? { type: 'RestElement', start: q.start, end: q.end, argument: toAssignable(q.argument) } : toAssignable(q)) : q)) };
      case 'AssignmentExpression': if (n.operator !== '=') fail('Invalid assignment target', 0); return { type: 'AssignmentPattern', start: n.start, end: n.end, left: toAssignable(n.left), right: n.right };
      default: throw new AstError('Invalid assignment target (' + n.type + ') at ' + tsPos(src, n.start));
    }
  }
  function bindingTarget() { // BindingPattern
    const s = cur().s;
    if (isP('[')) { p++; const el = []; while (!isP(']')) { if (isP(',')) { p++; el.push(null); continue; } if (isP('...')) { const rs = cur().s; p++; const a = bindingTarget(); el.push(node('RestElement', rs, { argument: a })); } else el.push(bindingElement()); if (!isP(']')) expectP(','); } expectP(']'); return node('ArrayPattern', s, { elements: el }); }
    if (isP('{')) { p++; const props = []; while (!isP('}')) { if (isP('...')) { const rs = cur().s; p++; const a = ident(); props.push(node('RestElement', rs, { argument: a })); } else props.push(bindingProperty()); if (!isP('}')) expectP(','); } expectP('}'); return node('ObjectPattern', s, { properties: props }); }
    return ident();
  }
  function bindingElement() { const s = cur().s; const t = bindingTarget(); if (eatP('=')) { const r = assign(); return node('AssignmentPattern', s, { left: t, right: r }); } return t; }
  function bindingProperty() {
    const s = cur().s; let computed = false, key;
    if (isP('[')) { p++; key = assign(); expectP(']'); computed = true; } else key = propName();
    if (eatP(':')) { const v = bindingElement(); return node('Property', s, { method: false, shorthand: false, computed, key, value: v, kind: 'init' }); }
    if (computed || key.type !== 'Identifier') fail('Expected ":"');
    let value = { ...key }; if (eatP('=')) { const r = assign(); value = node('AssignmentPattern', s, { left: key, right: r }); }
    return node('Property', s, { method: false, shorthand: true, computed: false, key, value, kind: 'init' });
  }
  function propName() {
    const t = cur();
    if (t.t === 'id') { p++; return { type: 'Identifier', start: t.s, end: t.e, name: t.v }; }
    if (t.t === 'str') { p++; return { type: 'Literal', start: t.s, end: t.e, value: unesc(t.v), raw: t.v }; }
    if (t.t === 'num') { p++; return { type: 'Literal', start: t.s, end: t.e, ...numVal(t.v), raw: t.v }; }
    fail('Expected a property name');
  }
  // ---- functions ----
  function params() {
    expectP('('); const ps = [];
    while (!isP(')')) { if (isP('...')) { const rs = cur().s; p++; const a = bindingTarget(); ps.push(node('RestElement', rs, { argument: a })); } else ps.push(bindingElement()); if (!isP(')')) expectP(','); }
    expectP(')'); return ps;
  }
  function funcBody(ctx) {
    const s = cur().s; expectP('{'); const body = []; const save = p; stmts(body, '}', true); expectP('}'); return node('BlockStatement', s, { body });
  }
  function fnRest(type, start, isAsync, gen, id) { const ps = params(); const body = funcBody(); return node(type, start, { id, expression: false, generator: gen, async: isAsync, params: ps, body }); }
  function functionNode(decl, startTok, isAsync) {
    const s = startTok !== undefined ? startTok : cur().s; if (isAsync === undefined) isAsync = false;
    if (!eatKw('function')) fail('Expected "function"'); const gen = eatP('*'); let id = null; if (cur().t === 'id' && !isP('(')) id = ident(true); else if (decl) fail('Function name required');
    return fnRest(decl ? 'FunctionDeclaration' : 'FunctionExpression', s, isAsync, gen, id);
  }
  function arrowFrom(s, isAsync, ps) {
    expectP('=>'); let body, expression;
    if (isP('{')) { body = funcBody(); expression = false; } else { body = assign(); expression = true; }
    return node('ArrowFunctionExpression', s, { id: null, expression, generator: false, async: isAsync, params: ps, body });
  }
  // ---- classes ----
  function classNode(decl) {
    const s = cur().s; p++; let id = null; if (cur().t === 'id' && !isKw('extends')) id = ident(); else if (decl) fail('Class name required');
    let sup = null; if (eatKw('extends')) sup = lhs();
    const bs = cur().s; expectP('{'); const body = [];
    while (!isP('}')) {
      if (eatP(';')) continue;
      const ms = cur().s; let isStatic = false, isAsync = false, gen = false, kind = 'method';
      if (isKw('static') && !isP('(', p + 1) && !isP('=', p + 1) && !isP(';', p + 1) && !isP('}', p + 1)) { p++; isStatic = true; if (isP('{')) { const sb = []; expectP('{'); stmts(sb, '}', false); expectP('}'); body.push(node('StaticBlock', ms, { body: sb })); continue; } }
      if (isKw('async') && !isP('(', p + 1) && !isP('=', p + 1) && !isP(';', p + 1) && !isP('}', p + 1) && !T[p + 1].nl) { p++; isAsync = true; }
      if (eatP('*')) gen = true;
      if ((isKw('get') || isKw('set')) && !isAsync && !gen && !isP('(', p + 1) && !isP('=', p + 1) && !isP(';', p + 1) && !isP('}', p + 1)) { kind = cur().v; p++; }
      let computed = false, key;
      if (isP('[')) { p++; key = assign(); expectP(']'); computed = true; }
      else if (cur().t === 'id' && cur().v[0] === '#') { const t = nextTok(); key = { type: 'PrivateIdentifier', start: t.s, end: t.e, name: t.v.slice(1) }; }
      else key = propName();
      if (isP('(')) {
        if (!computed && !isStatic && ((key.type === 'Identifier' && key.name === 'constructor') || (key.type === 'Literal' && key.value === 'constructor')) && kind === 'method') kind = 'constructor';
        const fs = cur().s; const ps = params(); const b = funcBody(); const fn = node('FunctionExpression', fs, { id: null, expression: false, generator: gen, async: isAsync, params: ps, body: b });
        body.push(node('MethodDefinition', ms, { static: isStatic, computed, key, kind, value: fn }));
      } else {
        let value = null; if (eatP('=')) value = assign(); semicolon();
        body.push(node('PropertyDefinition', ms, { static: isStatic, computed, key, value }));
      }
    }
    expectP('}'); const cb = node('ClassBody', bs, { body });
    return node(decl ? 'ClassDeclaration' : 'ClassExpression', s, { id, superClass: sup, body: cb });
  }
  // ---- expressions ----
  function expression(noIn) {
    const s = cur().s; const e = assign(noIn);
    if (isP(',')) { const ex = [e]; while (eatP(',')) ex.push(assign(noIn)); return node('SequenceExpression', s, { expressions: ex }); }
    return e;
  }
  const ASSIGN = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '&&=', '||=', '??=']);
  function isArrowAhead() { // at '(' : is matching ')' followed by '=>'?
    return isP('(') && T[T[p].m + 1] && T[T[p].m + 1].t === 'p' && T[T[p].m + 1].v === '=>';
  }
  function assign(noIn) {
    const s = cur().s;
    if (isKw('yield') && inGen) { p++; let delegate = false, arg = null; if (!cur().nl) { delegate = eatP('*'); if (!(isP(')') || isP(']') || isP('}') || isP(',') || isP(';') || isP(':') || cur().t === 'eof' || (cur().nl && !delegate))) arg = assign(noIn); } return node('YieldExpression', s, { delegate, argument: arg }); }
    if (isKw('async') && !T[p + 1].nl) {
      if (T[p + 1].t === 'id' && !RESERVED.has(T[p + 1].v) && isP('=>', p + 2)) { p++; const id = ident(); return arrowFrom(s, true, [id]); }
      if (isP('(', p + 1) && T[T[p + 1].m + 1] && T[T[p + 1].m + 1].v === '=>') { p++; const ps = params(); return arrowFrom(s, true, ps); }
    }
    if (isArrowAhead()) { const ps = params(); return arrowFrom(s, false, ps); }
    if (cur().t === 'id' && !RESERVED.has(cur().v) && isP('=>', p + 1)) { const id = ident(); return arrowFrom(s, false, [id]); }
    const left = conditional(noIn);
    const o = opAt();
    if (o && ASSIGN.has(o.v)) { p += o.n; const l = o.v === '=' ? toAssignable(left) : (left.type === 'Identifier' || left.type === 'MemberExpression' ? left : fail('Invalid assignment target', p)); const right = assign(noIn); return node('AssignmentExpression', s, { operator: o.v, left: l, right }); }
    return left;
  }
  function conditional(noIn) {
    const s = cur().s; const test = binary(0, noIn);
    if (eatP('?')) { const c = assign(); expectP(':'); const a = assign(noIn); return node('ConditionalExpression', s, { test, consequent: c, alternate: a }); }
    return test;
  }
  const PREC = { '??': 1, '||': 2, '&&': 3, '|': 4, '^': 5, '&': 6, '==': 7, '!=': 7, '===': 7, '!==': 7, '<': 8, '>': 8, '<=': 8, '>=': 8, in: 8, instanceof: 8, '<<': 9, '>>': 9, '>>>': 9, '+': 10, '-': 10, '*': 11, '/': 11, '%': 11, '**': 12 };
  function binOp(noIn) {
    const t = cur(); if (t.t === 'id') { if (t.v === 'instanceof' || (t.v === 'in' && !noIn)) return { v: t.v, n: 1 }; return null; }
    const o = opAt(); if (o && PREC[o.v] !== undefined) return o; return null;
  }
  function binary(minPrec, noIn) {
    const s = cur().s; let left = unary();
    for (;;) {
      const o = binOp(noIn); if (!o) return left; const prec = PREC[o.v]; if (prec <= minPrec && !(o.v === '**' && prec === minPrec && false)) { if (!(o.v === '**' && prec > minPrec)) return left; }
      if (prec <= minPrec) return left;
      p += o.n; const right = o.v === '**' ? binary(prec - 1, noIn) : binary(prec, noIn);
      const type = o.v === '&&' || o.v === '||' || o.v === '??' ? 'LogicalExpression' : 'BinaryExpression';
      left = node(type, s, { left, operator: o.v, right });
    }
  }
  function unary() {
    const s = cur().s, t = cur();
    if (t.t === 'p' && (t.v === '!' || t.v === '~' || t.v === '+' || t.v === '-')) { p++; const a = unary(); return node('UnaryExpression', s, { operator: t.v, prefix: true, argument: a }); }
    if (t.t === 'p' && (t.v === '++' || t.v === '--')) { p++; const a = unary(); return node('UpdateExpression', s, { operator: t.v, prefix: true, argument: a }); }
    if (t.t === 'id' && (t.v === 'typeof' || t.v === 'void' || t.v === 'delete')) { p++; const a = unary(); return node('UnaryExpression', s, { operator: t.v, prefix: true, argument: a }); }
    if (t.t === 'id' && t.v === 'await' && inAsync) { p++; const a = unary(); return node('AwaitExpression', s, { argument: a }); }
    const e = postfix();
    return e;
  }
  function postfix() {
    const s = cur().s; const e = lhs(); const t = cur();
    if (t.t === 'p' && (t.v === '++' || t.v === '--') && !t.nl) { p++; return node('UpdateExpression', s, { operator: t.v, prefix: false, argument: e }); }
    return e;
  }
  function args() { expectP('('); const a = []; while (!isP(')')) { if (isP('...')) { const s = cur().s; p++; const x = assign(); a.push(node('SpreadElement', s, { argument: x })); } else a.push(assign()); if (!isP(')')) expectP(','); } expectP(')'); return a; }
  function lhs() {
    const s = cur().s; let e;
    if (isKw('new')) e = newExpr(); else e = primary();
    let chain = false;
    for (;;) {
      const t = cur();
      if (isP('.')) { p++; const pn = cur(); let prop; if (pn.t === 'id' && pn.v[0] === '#') { p++; prop = { type: 'PrivateIdentifier', start: pn.s, end: pn.e, name: pn.v.slice(1) }; } else prop = ident(true); e = node('MemberExpression', s, { object: e, property: prop, computed: false, optional: false }); }
      else if (isP('?.')) { p++; chain = true; if (isP('(')) { const a = args(); e = node('CallExpression', s, { callee: e, arguments: a, optional: true }); } else if (isP('[')) { p++; const x = expression(); expectP(']'); e = node('MemberExpression', s, { object: e, property: x, computed: true, optional: true }); } else { const pn = cur(); let prop; if (pn.t === 'id' && pn.v[0] === '#') { p++; prop = { type: 'PrivateIdentifier', start: pn.s, end: pn.e, name: pn.v.slice(1) }; } else prop = ident(true); e = node('MemberExpression', s, { object: e, property: prop, computed: false, optional: true }); } }
      else if (isP('[')) { p++; const x = expression(); expectP(']'); e = node('MemberExpression', s, { object: e, property: x, computed: true, optional: false }); }
      else if (isP('(')) { const a = args(); e = node('CallExpression', s, { callee: e, arguments: a, optional: false }); }
      else if (t.t === 'tmpl' && (t.part === 'full' || t.part === 'head')) { const q = template(); e = node('TaggedTemplateExpression', s, { tag: e, quasi: q }); }
      else break;
    }
    if (chain) e = node('ChainExpression', s, { expression: e });
    return e;
  }
  function newExpr() {
    const s = cur().s; p++; if (isP('.')) { p++; const pr = ident(true); return node('MetaProperty', s, { meta: { type: 'Identifier', start: s, end: s + 3, name: 'new' }, property: pr }); }
    const cs = cur().s; let callee = isKw('new') ? newExpr() : primary(); callee = memberOnly(callee, cs);
    const a = isP('(') ? args() : []; return node('NewExpression', s, { callee, arguments: a });
  }
  function memberOnly(e, s) { // member accesses for `new X.y.z(...)`
    for (;;) {
      if (isP('.')) { p++; const prop = ident(true); e = node('MemberExpression', s, { object: e, property: prop, computed: false, optional: false }); }
      else if (isP('[')) { p++; const x = expression(); expectP(']'); e = node('MemberExpression', s, { object: e, property: x, computed: true, optional: false }); }
      else return e;
    }
  }
  function template() {
    const s = cur().s; const quasis = [], exprs = []; let t = nextTok();
    const piece = (tk, tail) => { const head = tk.part === 'head' || tk.part === 'full'; const raw = tk.v.slice(1, tk.v.length - (tail ? 1 : 2)); const q = { type: 'TemplateElement', start: tk.s + 1, end: tk.e - (tail ? 1 : 2), value: { raw: raw.replace(/\r\n?/g, '\n'), cooked: unesc(raw, true) }, tail }; quasis.push(q); };
    if (t.part === 'full') { piece(t, true); return node('TemplateLiteral', s, { quasis, expressions: exprs }); }
    piece(t, false);
    for (;;) { exprs.push(expression()); const m = nextTok(); if (m.t !== 'tmpl') fail('Bad template literal', p - 1); if (m.part === 'tail') { piece(m, true); break; } piece(m, false); }
    return node('TemplateLiteral', s, { quasis, expressions: exprs });
  }
  let inGen = false, inAsync = false;
  function primary() {
    const t = cur(), s = t.s;
    if (t.t === 'num') { p++; return { type: 'Literal', start: t.s, end: t.e, ...numVal(t.v), raw: t.v }; }
    if (t.t === 'str') { p++; return { type: 'Literal', start: t.s, end: t.e, value: unesc(t.v), raw: t.v }; }
    if (t.t === 're') { p++; const m = /^\/(.*)\/([a-z]*)$/s.exec(t.v); let value = null; try { value = new RegExp(m[1], m[2]); } catch (e) { /* keep null like acorn */ } return { type: 'Literal', start: t.s, end: t.e, value, raw: t.v, regex: { pattern: m[1], flags: m[2] } }; }
    if (t.t === 'tmpl') return template();
    if (t.t === 'p') {
      if (t.v === '(') { p++; const e = expression(); expectP(')'); e.parenthesized = true; return e; }
      if (t.v === '[') { p++; const el = []; while (!isP(']')) { if (isP(',')) { p++; el.push(null); continue; } if (isP('...')) { const ss = cur().s; p++; const a = assign(); el.push(node('SpreadElement', ss, { argument: a })); } else el.push(assign()); if (!isP(']')) expectP(','); } expectP(']'); return node('ArrayExpression', s, { elements: el }); }
      if (t.v === '{') return objectLit();
    }
    if (t.t === 'id') {
      if (t.v === 'function') return functionNode(false);
      if (t.v === 'async' && isKw('function', p + 1) && !T[p + 1].nl) { p++; return functionNode(false, s, true); }
      if (t.v === 'class') return classNode(false);
      if (t.v === 'this') { p++; return { type: 'ThisExpression', start: t.s, end: t.e }; }
      if (t.v === 'super') { p++; return { type: 'Super', start: t.s, end: t.e }; }
      if (t.v === 'null') { p++; return { type: 'Literal', start: t.s, end: t.e, value: null, raw: 'null' }; }
      if (t.v === 'true' || t.v === 'false') { p++; return { type: 'Literal', start: t.s, end: t.e, value: t.v === 'true', raw: t.v }; }
      if (t.v[0] === '#') { p++; return { type: 'PrivateIdentifier', start: t.s, end: t.e, name: t.v.slice(1) }; }
      if (t.v === 'import') { if (isP('(', p + 1)) { p += 2; const src2 = assign(); expectP(')'); return node('ImportExpression', s, { source: src2 }); } if (isP('.', p + 1)) { p += 2; const pr = ident(true); return node('MetaProperty', s, { meta: { type: 'Identifier', start: t.s, end: t.e, name: 'import' }, property: pr }); } fail('import/export (modules) are not supported'); }
      return ident();
    }
    fail('Unexpected token "' + (t.v || 'end of input') + '"');
  }
  function objectLit() {
    const s = cur().s; expectP('{'); const props = [];
    while (!isP('}')) {
      const ps = cur().s;
      if (isP('...')) { p++; const a = assign(); props.push(node('SpreadElement', ps, { argument: a })); }
      else {
        let isAsync = false, gen = false, kind = 'init';
        const nx = (k) => T[p + k];
        const ends = (k) => isP(',', p + k) || isP(':', p + k) || isP('(', p + k) || isP('}', p + k) || isP('=', p + k);
        if (isKw('async') && !ends(1) && !T[p + 1].nl) { p++; isAsync = true; }
        if (eatP('*')) gen = true;
        if ((isKw('get') || isKw('set')) && !isAsync && !gen && !ends(1)) { kind = cur().v; p++; }
        let computed = false, key;
        if (isP('[')) { p++; key = assign(); expectP(']'); computed = true; } else key = propName();
        if (isP('(')) { const fs = cur().s; const prs = params(); const b = funcBody(); const fn = node('FunctionExpression', fs, { id: null, expression: false, generator: gen, async: isAsync, params: prs, body: b }); props.push(node('Property', ps, { method: kind === 'init', shorthand: false, computed, key, kind, value: fn })); }
        else if (eatP(':')) { const v = assign(); props.push(node('Property', ps, { method: false, shorthand: false, computed, key, value: v, kind: 'init' })); }
        else { if (computed || key.type !== 'Identifier') fail('Expected ":"'); let value = { ...key }; if (isP('=')) { p++; const r = assign(); value = node('AssignmentPattern', ps, { left: key, right: r }); } props.push(node('Property', ps, { method: false, shorthand: true, computed: false, key, value, kind: 'init' })); }
      }
      if (!isP('}')) expectP(',');
    }
    expectP('}'); return node('ObjectExpression', s, { properties: props });
  }
  // ---- statements ----
  function stmts(out, close, prologue) {
    let directives = !!prologue;
    while (!(close ? isP(close) : cur().t === 'eof')) {
      if (cur().t === 'eof') fail('Unexpected end of input');
      const st = statement(); if (directives) { if (st.type === 'ExpressionStatement' && st.expression.type === 'Literal' && typeof st.expression.value === 'string' && !st.expression.parenthesized) st.directive = st.expression.raw.slice(1, -1); else directives = false; }
      out.push(st);
    }
  }
  function varDecl(kind, noIn, s) {
    const decls = [];
    do { const ds = cur().s; const id = bindingTarget(); let init = null; if (eatP('=')) init = assign(noIn); decls.push(node('VariableDeclarator', ds, { id, init })); } while (eatP(','));
    return node('VariableDeclaration', s, { declarations: decls, kind });
  }
  function isLetDecl() { return isKw('let') && (T[p + 1].t === 'id' && !(T[p + 1].v === 'in' || T[p + 1].v === 'instanceof' || T[p + 1].v === 'of') || isP('[', p + 1) || isP('{', p + 1)); }
  function block() { const s = cur().s; expectP('{'); const body = []; stmts(body, '}', false); expectP('}'); return node('BlockStatement', s, { body }); }
  function statement() {
    const t = cur(), s = t.s;
    if (t.t === 'p') {
      if (t.v === '{') return block();
      if (t.v === ';') { p++; return node('EmptyStatement', s, {}); }
    }
    if (t.t === 'id') {
      switch (t.v) {
        case 'var': case 'const': { p++; const d = varDecl(t.v, false, s); semicolon(); d.end = lastEnd(); return d; }
        case 'let': if (isLetDecl()) { p++; const d = varDecl('let', false, s); semicolon(); d.end = lastEnd(); return d; } break;
        case 'function': return functionNode(true);
        case 'async': if (isKw('function', p + 1) && !T[p + 1].nl) { p++; return functionNode(true, s, true); } break;
        case 'class': return classNode(true);
        case 'if': { p++; expectP('('); const test = expression(); expectP(')'); const c = statement(); let a = null; if (eatKw('else')) a = statement(); return node('IfStatement', s, { test, consequent: c, alternate: a }); }
        case 'while': { p++; expectP('('); const test = expression(); expectP(')'); const body = statement(); return node('WhileStatement', s, { test, body }); }
        case 'do': { p++; const body = statement(); if (!eatKw('while')) fail('Expected "while"'); expectP('('); const test = expression(); expectP(')'); eatP(';'); return node('DoWhileStatement', s, { body, test }); }
        case 'for': return forStmt();
        case 'return': { p++; let a = null; if (!(isP(';') || isP('}') || cur().nl || cur().t === 'eof')) a = expression(); semicolon(); const n = node('ReturnStatement', s, { argument: a }); return n; }
        case 'break': case 'continue': { p++; let label = null; if (cur().t === 'id' && !cur().nl && !RESERVED.has(cur().v)) label = ident(); semicolon(); return node(t.v === 'break' ? 'BreakStatement' : 'ContinueStatement', s, { label }); }
        case 'throw': { p++; if (cur().nl) fail('Illegal newline after throw'); const a = expression(); semicolon(); return node('ThrowStatement', s, { argument: a }); }
        case 'try': { p++; const b = block(); let h = null, f = null; if (isKw('catch')) { const cs = cur().s; p++; let param = null; if (eatP('(')) { param = bindingTarget(); expectP(')'); } const body = block(); h = node('CatchClause', cs, { param, body }); } if (eatKw('finally')) f = block(); if (!h && !f) fail('Missing catch or finally'); return node('TryStatement', s, { block: b, handler: h, finalizer: f }); }
        case 'switch': { p++; expectP('('); const d = expression(); expectP(')'); expectP('{'); const cases = []; while (!isP('}')) { const cs = cur().s; let test = null; if (eatKw('case')) test = expression(); else if (!eatKw('default')) fail('Expected "case" or "default"'); expectP(':'); const cons = []; while (!isP('}') && !isKw('case') && !isKw('default')) cons.push(statement()); cases.push(node('SwitchCase', cs, { test, consequent: cons })); } expectP('}'); return node('SwitchStatement', s, { discriminant: d, cases }); }
        case 'debugger': p++; semicolon(); return node('DebuggerStatement', s, {});
        case 'import': case 'export': fail('import/export (modules) are not supported');
        case 'with': fail('"with" is not supported');
      }
      if (!RESERVED.has(t.v) && isP(':', p + 1)) { p += 2; const body = statement(); return node('LabeledStatement', s, { body, label: { type: 'Identifier', start: t.s, end: t.e, name: t.v } }); }
    }
    const e = expression(); semicolon(); return node('ExpressionStatement', s, { expression: e });
  }
  function forStmt() {
    const s = cur().s; p++; let isAwait = false; if (isKw('await')) { p++; isAwait = true; } expectP('(');
    let init = null;
    if (isP(';')) { /* no init */ }
    else if (isKw('var') || isKw('const') || isLetDecl()) {
      const ks = cur().s, kind = cur().v; p++; init = varDecl(kind, true, ks);
      if ((isKw('of') || isKw('in')) && init.declarations.length === 1) return forInOf(s, init, isAwait);
    } else {
      const es = cur().s; const e = expression(true);
      if (isKw('of') || isKw('in')) return forInOf(s, toAssignable(e), isAwait);
      init = e;
    }
    expectP(';'); const test = isP(';') ? null : expression(); expectP(';'); const update = isP(')') ? null : expression(); expectP(')'); const body = statement();
    return node('ForStatement', s, { init, test, update, body });
  }
  function forInOf(s, left, isAwait) {
    const of = isKw('of'); p++; const right = of ? assign() : expression(); expectP(')'); const body = statement();
    return node(of ? 'ForOfStatement' : 'ForInStatement', s, of ? { left, right, body, await: isAwait } : { left, right, body });
  }
  // async/generator context: simplified—`await` and `yield` are treated as operators everywhere they can be (scripts only)
  inAsync = true; inGen = true;
  const body = []; stmts(body, null, true);
  return { type: 'Program', start: 0, end: src.length, body, sourceType: 'script' };
}
// ---- tree printer ----
function astPrint(node, showPos) {
  const lines = [];
  const scalar = (x) => (typeof x === 'string' ? JSON.stringify(x) : typeof x === 'bigint' ? x + 'n' : x instanceof RegExp ? String(x) : String(x));
  const walk = (n, ind, label) => {
    if (n === null || n === undefined) { lines.push(ind + label + ': null'); return; }
    if (Array.isArray(n)) { if (!n.length) { lines.push(ind + label + ': []'); return; } lines.push(ind + label + ':'); n.forEach((c, i) => walk(c, ind + '  ', '[' + i + ']')); return; }
    if (typeof n !== 'object' || n instanceof RegExp) { lines.push(ind + label + ': ' + scalar(n)); return; }
    const sc = []; const kids = [];
    for (const [k, val] of Object.entries(n)) { if (k === 'type' || k === 'start' || k === 'end' || k === 'parenthesized') continue; if (val && typeof val === 'object' && !(val instanceof RegExp) && !('regex' === k)) kids.push([k, val]); else sc.push(k + '=' + scalar(val)); }
    lines.push(ind + label + ': ' + n.type + (showPos && n.start !== undefined ? ' (' + n.start + '-' + n.end + ')' : '') + (sc.length ? ' ' + sc.join(' ') : ''));
    for (const [k, val] of kids) walk(val, ind + '  ', k);
  };
  walk(node, '', 'root');
  return lines.join('\n');
}

// ===== WebAssembly binary <-> text (WAT), hand-written; core + a few common post-MVP extensions =====
const WA_VT = { 0x7f: 'i32', 0x7e: 'i64', 0x7d: 'f32', 0x7c: 'f64', 0x70: 'funcref', 0x6f: 'externref' };
const WA_VT_REV = Object.fromEntries(Object.entries(WA_VT).map(([k, v]) => [v, +k]));
// name, opcode, immediate kind, natural align exponent (memory ops)
const WA_OPS = (() => {
  const t = [];
  const add = (code, names, kind, ...rest) => names.split(' ').forEach((n, i) => t.push([n, code + i, kind, ...rest]));
  add(0x00, 'unreachable nop', 'none'); add(0x02, 'block loop if', 'block'); add(0x0c, 'br br_if', 'label'); add(0x0e, 'br_table', 'brtable'); add(0x0f, 'return', 'none');
  add(0x10, 'call', 'func'); add(0x11, 'call_indirect', 'callind'); add(0x1a, 'drop select', 'none'); add(0x20, 'local.get local.set local.tee', 'local'); add(0x23, 'global.get global.set', 'global');
  add(0x25, 'table.get table.set', 'table');
  const mem = [['i32.load', 2], ['i64.load', 3], ['f32.load', 2], ['f64.load', 3], ['i32.load8_s', 0], ['i32.load8_u', 0], ['i32.load16_s', 1], ['i32.load16_u', 1], ['i64.load8_s', 0], ['i64.load8_u', 0], ['i64.load16_s', 1], ['i64.load16_u', 1], ['i64.load32_s', 2], ['i64.load32_u', 2], ['i32.store', 2], ['i64.store', 3], ['f32.store', 2], ['f64.store', 3], ['i32.store8', 0], ['i32.store16', 1], ['i64.store8', 0], ['i64.store16', 1], ['i64.store32', 2]];
  mem.forEach(([n, a], i) => t.push([n, 0x28 + i, 'memarg', a]));
  t.push(['memory.size', 0x3f, 'memidx'], ['memory.grow', 0x40, 'memidx'], ['i32.const', 0x41, 'i32'], ['i64.const', 0x42, 'i64'], ['f32.const', 0x43, 'f32'], ['f64.const', 0x44, 'f64']);
  add(0x45, 'i32.eqz i32.eq i32.ne i32.lt_s i32.lt_u i32.gt_s i32.gt_u i32.le_s i32.le_u i32.ge_s i32.ge_u', 'none');
  add(0x50, 'i64.eqz i64.eq i64.ne i64.lt_s i64.lt_u i64.gt_s i64.gt_u i64.le_s i64.le_u i64.ge_s i64.ge_u', 'none');
  add(0x5b, 'f32.eq f32.ne f32.lt f32.gt f32.le f32.ge f64.eq f64.ne f64.lt f64.gt f64.le f64.ge', 'none');
  add(0x67, 'i32.clz i32.ctz i32.popcnt i32.add i32.sub i32.mul i32.div_s i32.div_u i32.rem_s i32.rem_u i32.and i32.or i32.xor i32.shl i32.shr_s i32.shr_u i32.rotl i32.rotr', 'none');
  add(0x79, 'i64.clz i64.ctz i64.popcnt i64.add i64.sub i64.mul i64.div_s i64.div_u i64.rem_s i64.rem_u i64.and i64.or i64.xor i64.shl i64.shr_s i64.shr_u i64.rotl i64.rotr', 'none');
  add(0x8b, 'f32.abs f32.neg f32.ceil f32.floor f32.trunc f32.nearest f32.sqrt f32.add f32.sub f32.mul f32.div f32.min f32.max f32.copysign', 'none');
  add(0x99, 'f64.abs f64.neg f64.ceil f64.floor f64.trunc f64.nearest f64.sqrt f64.add f64.sub f64.mul f64.div f64.min f64.max f64.copysign', 'none');
  add(0xa7, 'i32.wrap_i64 i32.trunc_f32_s i32.trunc_f32_u i32.trunc_f64_s i32.trunc_f64_u i64.extend_i32_s i64.extend_i32_u i64.trunc_f32_s i64.trunc_f32_u i64.trunc_f64_s i64.trunc_f64_u f32.convert_i32_s f32.convert_i32_u f32.convert_i64_s f32.convert_i64_u f32.demote_f64 f64.convert_i32_s f64.convert_i32_u f64.convert_i64_s f64.convert_i64_u f64.promote_f32 i32.reinterpret_f32 i64.reinterpret_f64 f32.reinterpret_i32 f64.reinterpret_i64', 'none');
  add(0xc0, 'i32.extend8_s i32.extend16_s i64.extend8_s i64.extend16_s i64.extend32_s', 'none');
  t.push(['ref.null', 0xd0, 'reftype'], ['ref.is_null', 0xd1, 'none'], ['ref.func', 0xd2, 'func']);
  // 0xFC prefix
  'i32.trunc_sat_f32_s i32.trunc_sat_f32_u i32.trunc_sat_f64_s i32.trunc_sat_f64_u i64.trunc_sat_f32_s i64.trunc_sat_f32_u i64.trunc_sat_f64_s i64.trunc_sat_f64_u'.split(' ').forEach((n, i) => t.push([n, 0xfc00 + i, 'none']));
  t.push(['memory.init', 0xfc08, 'meminit'], ['data.drop', 0xfc09, 'dataidx'], ['memory.copy', 0xfc0a, 'memcopy'], ['memory.fill', 0xfc0b, 'memidx'], ['table.init', 0xfc0c, 'tableinit'], ['elem.drop', 0xfc0d, 'elemidx'], ['table.copy', 0xfc0e, 'tablecopy'], ['table.grow', 0xfc0f, 'table'], ['table.size', 0xfc10, 'table'], ['table.fill', 0xfc11, 'table']);
  return t;
})();
const WA_BY_NAME = new Map(WA_OPS.map((o) => [o[0], o])), WA_BY_CODE = new Map(WA_OPS.map((o) => [o[1], o]));
class WaError extends Error {}

// ---------- LEB / byte helpers ----------
const waU = (n) => { n = BigInt(n); const o = []; do { let b = Number(n & 0x7fn); n >>= 7n; if (n) b |= 0x80; o.push(b); } while (n); return o; };
const waS = (n) => { n = BigInt(n); const o = []; for (;;) { const b = Number(n & 0x7fn); n >>= 7n; if ((n === 0n && !(b & 0x40)) || (n === -1n && (b & 0x40))) { o.push(b); return o; } o.push(b | 0x80); } };
class WaReader {
  constructor(b) { this.b = b; this.p = 0; }
  err(m) { throw new WaError(m + ' (at byte offset ' + this.p + ')'); }
  u8() { if (this.p >= this.b.length) this.err('Unexpected end of data'); return this.b[this.p++]; }
  uleb(max = 32) { let r = 0n, s = 0n; for (;;) { const x = this.u8(); r |= BigInt(x & 0x7f) << s; s += 7n; if (!(x & 0x80)) break; if (s > BigInt(max + 7)) this.err('LEB128 too long'); } return r; }
  u32() { const v = this.uleb(); if (v > 0xffffffffn) this.err('u32 out of range'); return Number(v); }
  sleb(bits) { let r = 0n, s = 0n, x; do { x = this.u8(); r |= BigInt(x & 0x7f) << s; s += 7n; if (s > BigInt(bits + 7)) this.err('LEB128 too long'); } while (x & 0x80); if (x & 0x40) r -= 1n << s; return r; }
  bytes(n) { if (this.p + n > this.b.length) this.err('Unexpected end of data'); const r = this.b.subarray(this.p, this.p + n); this.p += n; return r; }
  name() { const n = this.u32(); return this.bytes(n); }
  get eof() { return this.p >= this.b.length; }
}
const waEscStr = (bytes) => { let s = '"'; for (const c of bytes) { if (c === 0x22) s += '\\"'; else if (c === 0x5c) s += '\\\\'; else if (c >= 0x20 && c < 0x7f) s += String.fromCharCode(c); else s += '\\' + c.toString(16).padStart(2, '0'); } return s + '"'; };
function waFloat(bits, is64) {
  const dv = new DataView(new ArrayBuffer(8));
  if (is64) { dv.setBigUint64(0, bits); } else dv.setUint32(0, Number(bits));
  const sign = is64 ? bits >> 63n : bits >> 31n, neg = sign ? '-' : '';
  const expMask = is64 ? 0x7ffn : 0xffn, mantBits = is64 ? 52n : 23n, mant = bits & ((1n << mantBits) - 1n), exp = (bits >> mantBits) & expMask;
  if (exp === expMask) { if (!mant) return neg + 'inf'; if (mant === 1n << (mantBits - 1n)) return neg + 'nan'; return neg + 'nan:0x' + mant.toString(16); }
  const x = is64 ? dv.getFloat64(0) : dv.getFloat32(0);
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';
  if (is64) { let s = String(x); if (Number(s) === x) return s; return s; }
  for (let p = 1; p <= 9; p++) { const s = x.toPrecision(p); if (Math.fround(Number(s)) === x) return String(Number(s)); }
  return String(x);
}

// ---------- binary -> text ----------
function wasmToWat(bytes) {
  const R = new WaReader(bytes);
  if (bytes.length < 8 || R.u8() !== 0 || R.u8() !== 0x61 || R.u8() !== 0x73 || R.u8() !== 0x6d) throw new WaError('Not a WebAssembly binary (missing \\0asm magic)');
  const ver = R.u8() | (R.u8() << 8) | (R.u8() << 16) | (R.u8() << 24); if (ver !== 1) throw new WaError('Unsupported WebAssembly version ' + ver);
  const M = { types: [], imports: [], funcs: [], tables: [], mems: [], globals: [], exports: [], start: null, elems: [], codes: [], datas: [], dataCount: null, customs: [] };
  const valtype = (r) => { const b = r.u8(); if (!WA_VT[b]) r.err('Unsupported value type 0x' + b.toString(16)); return WA_VT[b]; };
  const limits = (r) => { const f = r.u8(); if (f > 1) r.err('Unsupported limits flags ' + f + ' (shared/64-bit memories are not supported)'); const min = r.u32(); return { min, max: f & 1 ? r.u32() : null }; };
  const tabletype = (r) => { const t = valtype(r); return { ref: t, ...limits(r) }; };
  const globaltype = (r) => { const t = valtype(r), m = r.u8(); if (m > 1) r.err('Bad global mutability'); return { t, mut: !!m }; };
  const nImpFn = () => M.imports.filter((i) => i.kind === 'func').length;
  while (!R.eof) {
    const id = R.u8(), size = R.u32(), end = R.p + size; if (end > bytes.length) R.err('Section extends past end of data');
    const S = new WaReader(bytes.subarray(0, end)); S.p = R.p;
    const vec = (f) => { const n = S.u32(), o = []; for (let i = 0; i < n; i++) o.push(f()); return o; };
    if (id === 0) { S.name(); }
    else if (id === 1) M.types = vec(() => { if (S.u8() !== 0x60) S.err('Expected function type (0x60)'); return { params: vec(() => valtype(S)), results: vec(() => valtype(S)) }; });
    else if (id === 2) M.imports = vec(() => { const mod = S.name(), nm = S.name(), k = S.u8(); const o = { mod, nm }; if (k === 0) { o.kind = 'func'; o.type = S.u32(); } else if (k === 1) { o.kind = 'table'; o.tt = tabletype(S); } else if (k === 2) { o.kind = 'memory'; o.lim = limits(S); } else if (k === 3) { o.kind = 'global'; o.gt = globaltype(S); } else S.err('Unsupported import kind ' + k); return o; });
    else if (id === 3) M.funcs = vec(() => S.u32());
    else if (id === 4) M.tables = vec(() => tabletype(S));
    else if (id === 5) M.mems = vec(() => limits(S));
    else if (id === 6) M.globals = vec(() => { const gt = globaltype(S); return { gt, init: readExpr(S) }; });
    else if (id === 7) M.exports = vec(() => { const nm = S.name(), k = S.u8(), i = S.u32(); if (k > 3) S.err('Unsupported export kind ' + k); return { nm, kind: ['func', 'table', 'memory', 'global'][k], idx: i }; });
    else if (id === 8) M.start = S.u32();
    else if (id === 9) M.elems = vec(() => readElem(S));
    else if (id === 10) M.codes = vec(() => { const sz = S.u32(), e = S.p + sz; const groups = vec(() => ({ n: S.u32(), t: valtype(S) })); const body = readExpr(S, e); if (S.p !== e) S.err('Function body size mismatch'); return { groups, body }; });
    else if (id === 11) M.datas = vec(() => { const f = S.u32(); const d = {}; if (f === 0) { d.mem = 0; d.offset = readExpr(S); } else if (f === 1) d.passive = true; else if (f === 2) { d.mem = S.u32(); d.offset = readExpr(S); } else S.err('Bad data segment flags'); d.bytes = S.bytes(S.u32()); return d; });
    else if (id === 12) M.dataCount = S.u32();
    else R.err('Unknown section id ' + id);
    if (id !== 0 && S.p !== end) S.err('Section size mismatch (section ' + id + ')');
    R.p = end;
  }
  if (M.funcs.length !== M.codes.length) throw new WaError('Function and code section counts differ');
  function readElem(S) {
    const f = S.u32(); const e = { flags: f, items: [] };
    const exprs = !!(f & 4), passiveOrDecl = !!(f & 1), explicit = !!(f & 2);
    if (!passiveOrDecl) { e.mode = 'active'; e.table = explicit ? S.u32() : 0; e.offset = readExpr(S); } else e.mode = explicit ? 'declare' : 'passive';
    if (passiveOrDecl || explicit) { if (exprs) e.ref = valtype(S); else { const k = S.u8(); if (k !== 0) S.err('Unsupported element kind'); e.ref = 'funcref'; } } else e.ref = 'funcref';
    const n = S.u32(); for (let i = 0; i < n; i++) e.items.push(exprs ? readExpr(S) : [{ op: 'ref.func', imm: S.u32() }]);
    e.exprs = exprs; return e;
  }
  function readExpr(S, limit) { // returns list of instructions until matching end (function-level end included as last 'end')
    const out = []; let depth = 0;
    for (;;) {
      if (limit !== undefined && S.p >= limit) S.err('Unterminated function body');
      const at = S.p; let b = S.u8(); let code = b;
      if (b === 0xfc) code = 0xfc00 + S.u32(); else if (b === 0xfd) S.err('SIMD instructions are not supported'); else if (b === 0xfe) S.err('Atomic/threads instructions are not supported');
      if (b === 0x05) { out.push({ op: 'else' }); continue; }
      if (b === 0x0b) { out.push({ op: 'end' }); if (!depth) return out; depth--; continue; }
      if (b === 0x1c) { out.push({ op: 'select', imm: vecT(S) }); continue; }
      const d = WA_BY_CODE.get(code); if (!d) { S.p = at; S.err('Unknown opcode 0x' + code.toString(16)); }
      const [name, , kind, al] = d; const ins = { op: name };
      switch (kind) {
        case 'block': { const x = S.sleb(33); ins.imm = x === -64n ? { empty: true } : x < 0n ? { vt: WA_VT[Number(x & 0x7fn)] } : { type: Number(x) }; if (ins.imm.vt === undefined && ins.imm.type === undefined && !ins.imm.empty) S.err('Bad block type'); depth++; break; }
        case 'label': case 'func': case 'local': case 'global': case 'table': case 'dataidx': case 'elemidx': ins.imm = S.u32(); break;
        case 'brtable': { const n = S.u32(), l = []; for (let i = 0; i <= n; i++) l.push(S.u32()); ins.imm = l; break; }
        case 'callind': ins.imm = { type: S.u32(), table: S.u32() }; break;
        case 'memarg': ins.imm = { align: S.u32(), offset: S.uleb(), nat: al }; break;
        case 'memidx': if (S.u8() !== 0) S.err('Only memory 0 is supported'); break;
        case 'i32': ins.imm = S.sleb(32); break;
        case 'i64': ins.imm = S.sleb(64); break;
        case 'f32': { const v = S.bytes(4); ins.imm = BigInt(v[0] | (v[1] << 8) | (v[2] << 16)) | (BigInt(v[3]) << 24n); break; }
        case 'f64': { const v = S.bytes(8); let x = 0n; for (let i = 7; i >= 0; i--) x = (x << 8n) | BigInt(v[i]); ins.imm = x; break; }
        case 'reftype': ins.imm = valtype(S); break;
        case 'meminit': ins.imm = S.u32(); if (S.u8() !== 0) S.err('Only memory 0 is supported'); break;
        case 'memcopy': if (S.u8() !== 0 || S.u8() !== 0) S.err('Only memory 0 is supported'); break;
        case 'tableinit': ins.imm = { elem: S.u32(), table: S.u32() }; break;
        case 'tablecopy': ins.imm = { dst: S.u32(), src: S.u32() }; break;
      }
      out.push(ins);
    }
  }
  function vecT(S) { const n = S.u32(), o = []; for (let i = 0; i < n; i++) o.push(WA_VT[S.u8()]); return o; }
  // ---- print ----
  const L = ['(module']; const ind = (n) => '  '.repeat(n);
  const sig = (t) => (t.params.length ? ' (param ' + t.params.join(' ') + ')' : '') + (t.results.length ? ' (result ' + t.results.join(' ') + ')' : '');
  M.types.forEach((t, i) => L.push(ind(1) + `(type (;${i};) (func${sig(t)}))`));
  const lim = (l) => l.min + (l.max !== null ? ' ' + l.max : '');
  let fi = 0, ti = 0, mi = 0, gi = 0;
  for (const im of M.imports) {
    const hd = `(import ${waEscStr(im.mod)} ${waEscStr(im.nm)} `;
    if (im.kind === 'func') { if (!M.types[im.type]) throw new WaError('Type index out of range'); L.push(ind(1) + hd + `(func (;${fi++};) (type ${im.type})))`); }
    else if (im.kind === 'table') L.push(ind(1) + hd + `(table (;${ti++};) ${lim(im.tt)} ${im.tt.ref}))`);
    else if (im.kind === 'memory') L.push(ind(1) + hd + `(memory (;${mi++};) ${lim(im.lim)}))`);
    else L.push(ind(1) + hd + `(global (;${gi++};) ${im.gt.mut ? '(mut ' + im.gt.t + ')' : im.gt.t}))`);
  }
  const imm = (i) => {
    switch (i.op) {
      case 'else': case 'end': return '';
    }
    const d = WA_BY_NAME.get(i.op), kind = d ? d[2] : 'none'; let s = i.op;
    switch (kind) {
      case 'label': case 'func': case 'local': case 'global': case 'table': case 'dataidx': case 'elemidx': return s + ' ' + i.imm;
      case 'brtable': return s + ' ' + i.imm.join(' ');
      case 'callind': return s + (i.imm.table ? ' ' + i.imm.table : '') + ` (type ${i.imm.type})`;
      case 'memarg': return s + (i.imm.offset ? ' offset=' + i.imm.offset : '') + (i.imm.align !== i.imm.nat ? ' align=' + 2 ** i.imm.align : '');
      case 'i32': case 'i64': return s + ' ' + i.imm;
      case 'f32': return s + ' ' + waFloat(i.imm, false);
      case 'f64': return s + ' ' + waFloat(i.imm, true);
      case 'reftype': return s + ' ' + (i.imm === 'funcref' ? 'func' : 'extern');
      case 'meminit': return s + ' ' + i.imm;
      case 'tableinit': return s + (i.imm.table ? ' ' + i.imm.table : '') + ' ' + i.imm.elem;
      case 'tablecopy': return s + (i.imm.dst || i.imm.src ? ` ${i.imm.dst} ${i.imm.src}` : '');
    }
    return s;
  };
  const bodyLines = (ins, level, labels) => {
    const out = []; let lv = level; let lab = labels || 0;
    for (const i of ins) {
      if (i.op === 'end') { lv--; lab--; if (lv < level) { break; } out.push(ind(lv) + 'end'); continue; }
      if (i.op === 'else') { out.push(ind(lv - 1) + 'else'); continue; }
      if (i.op === 'block' || i.op === 'loop' || i.op === 'if') {
        let s = i.op; const b = i.imm; if (b.type !== undefined) { if (!M.types[b.type]) throw new WaError('Type index out of range'); s += ` (type ${b.type})`; } else if (b.vt) s += ` (result ${b.vt})`;
        out.push(ind(lv) + s); lv++; lab++; continue;
      }
      if (i.op === 'select' && i.imm && i.imm.length) { out.push(ind(lv) + 'select (result ' + i.imm.join(' ') + ')'); continue; }
      out.push(ind(lv) + imm(i));
    }
    return out;
  };
  M.funcs.forEach((tidx, k) => {
    const t = M.types[tidx]; if (!t) throw new WaError('Type index out of range');
    const c = M.codes[k]; const body = bodyLines(c.body, 2, 0);
    const locals = c.groups.length ? [ind(2) + '(local ' + c.groups.flatMap((g) => { if (g.n > 50000) throw new WaError('Too many locals'); return Array(g.n).fill(g.t); }).join(' ') + ')'] : [];
    const head = ind(1) + `(func (;${fi++};) (type ${tidx})${sig(t)}`;
    const all = [...locals, ...body];
    if (!all.length) L.push(head + ')'); else { L.push(head, ...all.slice(0, -1), all[all.length - 1] + ')'); }
  });
  M.tables.forEach((t) => L.push(ind(1) + `(table (;${ti++};) ${lim(t)} ${t.ref})`));
  M.mems.forEach((m) => L.push(ind(1) + `(memory (;${mi++};) ${lim(m)})`));
  const exprStr = (e) => { const lines = bodyLines(e, 0); return lines.map((x) => '(' + x.trim() + ')').join(' '); };
  M.globals.forEach((g) => L.push(ind(1) + `(global (;${gi++};) ${g.gt.mut ? '(mut ' + g.gt.t + ')' : g.gt.t} ${exprStr(g.init)})`));
  M.exports.forEach((e) => L.push(ind(1) + `(export ${waEscStr(e.nm)} (${e.kind} ${e.idx}))`));
  if (M.start !== null) L.push(ind(1) + `(start ${M.start})`);
  M.elems.forEach((e, i) => {
    let s = `(elem (;${i};)`;
    if (e.mode === 'active') { if (e.table) s += ` (table ${e.table})`; s += ' ' + (e.offset.length === 2 ? '(' + imm(e.offset[0]) + ')' : `(offset ${exprStr(e.offset).slice(0)})`); }
    else if (e.mode === 'declare') s += ' declare';
    if (!e.exprs) s += ' func ' + e.items.map((it) => it[0].imm).join(' ');
    else s += ' ' + e.ref + ' ' + e.items.map((it) => '(item ' + exprStr(it) + ')').join(' ');
    L.push(ind(1) + s.replace(/ $/, '') + ')');
  });
  M.datas.forEach((d, i) => { let s = `(data (;${i};)`; if (!d.passive) { if (d.mem) s += ` (memory ${d.mem})`; s += ' ' + (d.offset.length === 2 ? '(' + imm(d.offset[0]) + ')' : `(offset ${exprStr(d.offset)})`); } L.push(ind(1) + s + ' ' + waEscStr(d.bytes) + ')'); });
  L.push(')');
  return L.join('\n') + '\n';
}

// ---------- text -> binary ----------
function waTokenize(src) {
  const toks = []; let i = 0; const n = src.length;
  const err = (m) => { const pre = src.slice(0, i); throw new WaError(m + ' at line ' + (pre.split('\n').length) + ', column ' + (i - pre.lastIndexOf('\n'))); };
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === ';' && src[i + 1] === ';') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '(' && src[i + 1] === ';') { let d = 1; i += 2; while (i < n && d) { if (src[i] === '(' && src[i + 1] === ';') { d++; i += 2; } else if (src[i] === ';' && src[i + 1] === ')') { d--; i += 2; } else i++; } if (d) err('Unterminated block comment'); continue; }
    if (c === '(' || c === ')') { toks.push({ t: c, at: i }); i++; continue; }
    if (c === '"') {
      const at = i; i++; const bytes = [];
      while (i < n && src[i] !== '"') {
        if (src[i] === '\\') {
          i++; const e = src[i];
          if (e === 'n') bytes.push(10); else if (e === 't') bytes.push(9); else if (e === 'r') bytes.push(13); else if (e === '\\') bytes.push(92); else if (e === '"') bytes.push(34); else if (e === "'") bytes.push(39);
          else if (e === 'u' && src[i + 1] === '{') { const e2 = src.indexOf('}', i); const cp = parseInt(src.slice(i + 2, e2).replace(/_/g, ''), 16); if (!(cp >= 0 && cp < 0x110000)) err('Bad \\u escape'); bytes.push(...new TextEncoder().encode(String.fromCodePoint(cp))); i = e2; }
          else if (/[0-9a-fA-F]/.test(e) && /[0-9a-fA-F]/.test(src[i + 1] || '')) { bytes.push(parseInt(src.substr(i, 2), 16)); i++; }
          else err('Bad string escape');
          i++;
        } else { if (src[i] === '\n') err('Newline in string'); bytes.push(...new TextEncoder().encode(String.fromCodePoint(src.codePointAt(i)))); i += src.codePointAt(i) > 0xffff ? 2 : 1; }
      }
      if (i >= n) err('Unterminated string'); i++; toks.push({ t: 'str', bytes: Uint8Array.from(bytes), at }); continue;
    }
    const at = i; while (i < n && !/[\s()";]/.test(src[i])) i++;
    const w = src.slice(at, i); toks.push({ t: w[0] === '$' ? 'id' : 'atom', v: w, at });
  }
  // nest
  const root = []; const st = [root];
  for (const t of toks) {
    if (t.t === '(') { const l = []; l.at = t.at; st[st.length - 1].push(l); st.push(l); }
    else if (t.t === ')') { if (st.length < 2) { i = t.at; err('Unexpected ")"'); } st.pop(); }
    else st[st.length - 1].push(t);
  }
  if (st.length > 1) throw new WaError('Missing ")" (unclosed parenthesis)');
  return { list: root, src };
}
const waIsAtom = (x, v) => x && !Array.isArray(x) && (x.t === 'atom') && (v === undefined || x.v === v);
function waParseInt(s, bits, what) {
  const t = s.replace(/_/g, ''); let neg = false, body = t; if (body[0] === '+' || body[0] === '-') { neg = body[0] === '-'; body = body.slice(1); }
  if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(body)) throw new WaError('Bad integer literal ' + s);
  let v = BigInt(body); if (neg) v = -v;
  const lo = -(1n << BigInt(bits - 1)), hi = (1n << BigInt(bits)) - 1n; if (v < lo || v > hi) throw new WaError('Integer literal out of range for ' + what + ': ' + s);
  return v;
}
function waParseFloat(s, is64) {
  const t = s.replace(/_/g, ''); let neg = false, b = t; if (b[0] === '+' || b[0] === '-') { neg = b[0] === '-'; b = b.slice(1); }
  const mb = is64 ? 52n : 23n, eb = is64 ? 0x7ffn : 0xffn, signBit = neg ? 1n << (is64 ? 63n : 31n) : 0n;
  if (b === 'inf') return signBit | (eb << mb);
  if (b === 'nan') return signBit | (eb << mb) | (1n << (mb - 1n));
  let m = /^nan:0x([0-9a-fA-F]+)$/.exec(b); if (m) { const p = BigInt('0x' + m[1]); if (p === 0n || p >= 1n << mb) throw new WaError('Bad NaN payload ' + s); return signBit | (eb << mb) | p; }
  let x;
  if (/^0x/i.test(b)) { m = /^0x([0-9a-fA-F]*)\.?([0-9a-fA-F]*)(?:p([+-]?[0-9]+))?$/i.exec(b); if (!m || (!m[1] && !m[2])) throw new WaError('Bad float literal ' + s); const digits = (m[1] + m[2]) || '0'; x = Number(BigInt('0x' + digits)) * 2 ** (Number(m[3] || 0) - 4 * m[2].length); if (digits.length > 13) { /* precision loss beyond double: accept */ } }
  else { if (!/^([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?$/.test(b)) throw new WaError('Bad float literal ' + s); x = Number(b); }
  const dv = new DataView(new ArrayBuffer(8)); if (is64) { dv.setFloat64(0, x); return signBit | (dv.getBigUint64(0) & ~(1n << 63n)); } dv.setFloat32(0, x); return signBit | (BigInt(dv.getUint32(0)) & 0x7fffffffn);
}
function watToWasm(text) {
  const { list } = waTokenize(text);
  let mod = list.length === 1 && Array.isArray(list[0]) && waIsAtom(list[0][0], 'module') ? list[0] : null;
  let fields;
  if (mod) { fields = mod.slice(1); if (fields[0] && fields[0].t === 'id') fields = fields.slice(1); }
  else if (list.length && list.every((x) => Array.isArray(x))) fields = list; else throw new WaError('Expected a (module ...) form');
  const err = (m, at) => { throw new WaError(m + (at && at.at !== undefined ? ' (near character ' + at.at + ')' : '')); };
  const head = (f) => (Array.isArray(f) && f[0] && f[0].t === 'atom' ? f[0].v : null);
  const M = { types: [], typeIds: {}, funcs: [], tables: [], mems: [], globals: [], exports: [], start: null, elems: [], datas: [], imports: [] };
  const ids = { func: {}, table: {}, memory: {}, global: {}, type: {}, data: {}, elem: {} };
  const counts = { func: 0, table: 0, memory: 0, global: 0 }; let sawDef = { func: false, table: false, memory: false, global: false };
  const defineId = (space, id, idx) => { if (id) { if (id.v in ids[space]) err('Duplicate ' + space + ' identifier ' + id.v, id); ids[space][id.v] = idx; } };
  const parseVT = (a) => { if (!a || a.t !== 'atom' || !(a.v in WA_VT_REV)) err('Expected a value type, got ' + (a ? a.v : 'end'), a); return a.v; };
  const sameSig = (a, b) => a.params.join() === b.params.join() && a.results.join() === b.results.join();
  const internType = (sig) => { for (let i = 0; i < M.types.length; i++) if (sameSig(M.types[i], sig)) return i; M.types.push(sig); return M.types.length - 1; };
  const lookup = (space, a) => { if (!a) err('Missing ' + space + ' index'); if (a.t === 'id') { if (!(a.v in ids[space])) err('Unknown ' + space + ' ' + a.v, a); return ids[space][a.v]; } return Number(waParseInt(a.v, 32, 'index')); };
  // pass 1: types and declarations
  const funcItems = []; let pendingElemFuncs = [];
  for (const f of fields) {
    const h = head(f); if (!h) err('Unexpected token at module level', f);
    if (h === 'type') {
      let k = 1, id = null; if (f[k] && f[k].t === 'id') id = f[k++]; const ft = f[k]; if (head(ft) !== 'func') err('Only (func ...) types are supported', f);
      const sig = { params: [], results: [] }; for (const p of ft.slice(1)) { const hh = head(p); if (hh === 'param') { let q = 1; if (p[q] && p[q].t === 'id') q++; for (; q < p.length; q++) sig.params.push(parseVT(p[q])); } else if (hh === 'result') for (let q = 1; q < p.length; q++) sig.results.push(parseVT(p[q])); else err('Bad type', p); }
      defineId('type', id, M.types.length); M.types.push(sig);
    }
  }
  const typeUse = (items, start, allowNames) => { // parses (type x)? (param..)* (result..)* ; returns {idx, sig, names, next}
    let k = start, tidx = null; const sig = { params: [], results: [] }, names = [];
    if (head(items[k]) === 'type') { tidx = lookup('type', items[k][1]); k++; }
    let hasInline = false;
    for (; k < items.length; k++) { const hh = head(items[k]); if (hh === 'param') { hasInline = true; const p = items[k]; let q = 1; if (p[q] && p[q].t === 'id') { names[sig.params.length] = p[q]; q++; sig.params.push(parseVT(p[q])); q++; if (q < p.length) err('Named parameter must declare a single type', p); } else for (; q < p.length; q++) sig.params.push(parseVT(p[q])); } else if (hh === 'result') { hasInline = true; for (let q = 1; q < items[k].length; q++) sig.results.push(parseVT(items[k][q])); } else break; }
    if (tidx !== null) { if (!M.types[tidx]) err('Type index out of range', items[start]); if (hasInline && !sameSig(M.types[tidx], sig)) err('Inline signature does not match the referenced type', items[start]); return { idx: tidx, sig: M.types[tidx], names, next: k }; }
    return { idx: internType(sig), sig, names, next: k };
  };
  const resolveBlockType = (items, k) => { // returns {bt: bytes, next}
    let tidx = null; const sig = { params: [], results: [] }; let has = false;
    const startK = k;
    if (head(items[k]) === 'type') { tidx = lookup('type', items[k][1]); k++; }
    for (; k < items.length; k++) { const hh = head(items[k]); if (hh === 'param') { has = true; for (let q = 1; q < items[k].length; q++) sig.params.push(parseVT(items[k][q])); } else if (hh === 'result') { has = true; for (let q = 1; q < items[k].length; q++) sig.results.push(parseVT(items[k][q])); } else break; }
    if (tidx !== null) return { bt: waS(tidx), next: k };
    if (!sig.params.length && !sig.results.length) return { bt: [0x40], next: k };
    if (!sig.params.length && sig.results.length === 1) return { bt: [WA_VT_REV[sig.results[0]]], next: k };
    return { bt: waS(internType(sig)), next: k };
  };
  // collect imports/defs in order, assigning indices
  const imps = [], defs = [];
  const parseImportDesc = (d, kindHint) => { /* d: (func ..) etc. */ };
  const inlineExports = (items, k, space, idx) => { while (head(items[k]) === 'export') { const e = items[k]; if (!e[1] || e[1].t !== 'str') err('Expected export name', e); M.exports.push({ name: e[1].bytes, kind: space, idx }); k++; } return k; };
  let usesDataCount = false;
  const funcBodies = [];
  // pass 1b: assign indices
  for (const f of fields) {
    const h = head(f); if (h === 'type') continue;
    if (h === 'import') {
      if (!f[1] || f[1].t !== 'str' || !f[2] || f[2].t !== 'str') err('Import needs module and field name strings', f); const d = f[3]; const dh = head(d);
      if (!['func', 'table', 'memory', 'global'].includes(dh)) err('Unsupported import kind', f);
      if (sawDef[dh] || Object.values(sawDef).some(Boolean) && false) err('Imports must occur before all non-import definitions', f);
      imps.push({ f, mod: f[1].bytes, nm: f[2].bytes, d, dh }); const k0 = d[1] && d[1].t === 'id' ? 1 : 0; defineId(dh, k0 ? d[1] : null, counts[dh]); counts[dh]++;
    } else if (['func', 'table', 'memory', 'global'].includes(h)) {
      let k = 1, id = null; if (f[k] && f[k].t === 'id') id = f[k++];
      let ex = []; const exStart = k; while (head(f[k]) === 'export') k++;
      const impl = head(f[k]) === 'import' ? f[k] : null;
      for (let q = exStart; q < k; q++) { const e = f[q]; if (!e[1] || e[1].t !== 'str') err('Expected export name', e); M.exports.push({ name: e[1].bytes, kind: h, idx: counts[h] }); }
      if (impl) { if (sawDef[h]) err('Imports must occur before all non-import definitions', f); imps.push({ f, mod: impl[1].bytes, nm: impl[2].bytes, d: f, dh: h, inline: true, id, k: k + 1, exStart, exEnd: k }); defineId(h, id, counts[h]); counts[h]++; }
      else { sawDef[h] = true; defs.push({ f, h, id, k, exStart, exEnd: k, idx: counts[h] }); defineId(h, id, counts[h]); counts[h]++; }
    } else if (h === 'export') { if (!f[1] || f[1].t !== 'str') err('Expected export name', f); M.exports.push({ name: f[1].bytes, kind: head(f[2]), ref: f[2] }); }
    else if (h === 'elem' || h === 'data') { /* ids later */ }
  }
  // numbering for elem/data ids
  let ne = 0, nd = 0; for (const f of fields) { const h = head(f); if (h === 'elem') { if (f[1] && f[1].t === 'id') defineId('elem', f[1], ne); ne++; } if (h === 'data') { if (f[1] && f[1].t === 'id') defineId('data', f[1], nd); nd++; } }
  // imports into module
  const importEntries = [];
  for (const im of imps) {
    const e = { mod: im.mod, nm: im.nm, kind: im.dh }; let d = im.d, k = im.inline ? im.k : (d[1] && d[1].t === 'id' ? 2 : 1);
    if (im.inline) { const idxInSpace = ids[im.dh][im.f[1] && im.f[1].t === 'id' ? im.f[1].v : null]; }
    if (im.dh === 'func') { const tu = typeUse(d, k); e.type = tu.idx; }
    else if (im.dh === 'table') { const lim = parseLimits(d, k); e.lim = lim.lim; e.ref = parseRefType(d[lim.next]); }
    else if (im.dh === 'memory') { e.lim = parseLimits(d, k).lim; }
    else { e.gt = parseGlobalType(d[k]); }
    importEntries.push(e);
  }
  function parseLimits(items, k) { const mn = items[k]; if (!mn || mn.t !== 'atom') err('Expected limits', items); const min = Number(waParseInt(mn.v, 32, 'limit')); let max = null, nx = k + 1; if (items[nx] && items[nx].t === 'atom' && /^[0-9]/.test(items[nx].v)) { max = Number(waParseInt(items[nx].v, 32, 'limit')); nx++; } return { lim: { min, max }, next: nx }; }
  function parseRefType(a) { if (!a || a.t !== 'atom') err('Expected reference type', a); if (a.v === 'funcref' || a.v === 'externref') return a.v; if (a.v === 'anyfunc') return 'funcref'; err('Unsupported reference type ' + a.v, a); }
  function parseGlobalType(a) { if (Array.isArray(a)) { if (head(a) !== 'mut') err('Bad global type', a); return { t: parseVT(a[1]), mut: true }; } return { t: parseVT(a), mut: false }; }
  // ---- instruction assembler ----
  function assembleBody(items, k, ctx) { // ctx: {locals:{}, nlocals, labels:[]}; returns bytes
    const out = []; const emit = (...b) => { for (const x of b.flat()) out.push(x); };
    const resolveLabel = (a) => { if (!a) err('Missing label'); if (a.t === 'id') { for (let i = ctx.labels.length - 1; i >= 0; i--) if (ctx.labels[i] === a.v) return ctx.labels.length - 1 - i; err('Unknown label ' + a.v, a); } return Number(waParseInt(a.v, 32, 'label')); };
    const resolveLocal = (a) => { if (!a) err('Missing local index'); if (a.t === 'id') { if (!(a.v in ctx.locals)) err('Unknown local ' + a.v, a); return ctx.locals[a.v]; } return Number(waParseInt(a.v, 32, 'local index')); };
    const memarg = (arr, k2, nat) => { let off = 0n, al = nat; while (arr[k2] && arr[k2].t === 'atom' && /^(offset|align)=/.test(arr[k2].v)) { const [kk, vv] = arr[k2].v.split('='); const n = waParseInt(vv, 64, kk); if (kk === 'offset') { if (n < 0n || n > 0xffffffffn) err('offset out of range', arr[k2]); off = n; } else { if (n <= 0n || (n & (n - 1n))) err('alignment must be a power of two', arr[k2]); al = n.toString(2).length - 1; } k2++; } return { off, al, next: k2 }; };
    // flat sequence of items: atoms are instrs w/ immediates, lists are folded
    const seq = (arr, i0, endAt) => {
      let i = i0;
      while (i < endAt) {
        const x = arr[i];
        if (Array.isArray(x)) { folded(x); i++; continue; }
        if (x.t !== 'atom') err('Unexpected token in instruction sequence', x);
        const name = x.v; i = plain(arr, i, name);
      }
    };
    // plain instruction at arr[i] (atom); returns next index. handles structured flat forms
    const plain = (arr, i, name) => {
      const x = arr[i]; i++;
      if (name === 'block' || name === 'loop' || name === 'if') {
        let label = null; if (arr[i] && arr[i].t === 'id') label = arr[i++].v; const r = resolveBlockType(arr, i); i = r.next;
        emit(WA_BY_NAME.get(name)[1], r.bt); ctx.labels.push(label);
        // read until matching end, with else
        while (i < arr.length && !(waIsAtom(arr[i], 'end') || waIsAtom(arr[i], 'else'))) { const a = arr[i]; if (Array.isArray(a)) { folded(a); i++; } else i = plain(arr, i, a.v); }
        if (waIsAtom(arr[i], 'else')) { if (name !== 'if') err('else without if', arr[i]); i++; if (arr[i] && arr[i].t === 'id') i++; emit(0x05); while (i < arr.length && !waIsAtom(arr[i], 'end')) { const a = arr[i]; if (Array.isArray(a)) { folded(a); i++; } else i = plain(arr, i, a.v); } }
        if (!waIsAtom(arr[i], 'end')) err('Missing "end" for ' + name, x); i++; if (arr[i] && arr[i].t === 'id') i++; emit(0x0b); ctx.labels.pop(); return i;
      }
      if (name === 'end' || name === 'else') err('Unexpected "' + name + '"', x);
      const d = WA_BY_NAME.get(name); if (!d) {
        if (name === 'select' ) { /* handled below */ } else err('Unknown instruction "' + name + '"', x);
      }
      const op = (code) => { if (code > 0xff) emit(0xfc, waU(code & 0xff)); else emit(code); };
      if (name === 'select') {
        if (Array.isArray(arr[i]) && head(arr[i]) === 'result') { const ts = arr[i].slice(1).map(parseVT); i++; emit(0x1c, waU(ts.length), ts.map((t) => WA_VT_REV[t])); } else emit(0x1b); return i;
      }
      const [, code, kind, nat] = d;
      switch (kind) {
        case 'none': op(code); break;
        case 'label': op(code); emit(waU(resolveLabel(arr[i++]))); break;
        case 'brtable': { op(code); const ls = []; while (arr[i] && !Array.isArray(arr[i]) && arr[i].t !== undefined && (arr[i].t === 'id' || (arr[i].t === 'atom' && /^[0-9]/.test(arr[i].v)))) ls.push(resolveLabel(arr[i++])); if (!ls.length) err('br_table needs at least one label', x); emit(waU(ls.length - 1), ls.map((l) => waU(l))); break; }
        case 'func': op(code); emit(waU(lookup('func', arr[i++]))); break;
        case 'callind': { op(code); let tbl = 0; if (arr[i] && !Array.isArray(arr[i])) tbl = lookup('table', arr[i++]); const tu = typeUse(arr, i); i = tu.next; emit(waU(tu.idx), waU(tbl)); break; }
        case 'local': op(code); emit(waU(resolveLocal(arr[i++]))); break;
        case 'global': op(code); emit(waU(lookup('global', arr[i++]))); break;
        case 'table': { op(code); let t = 0; if (arr[i] && !Array.isArray(arr[i]) && arr[i].t !== undefined && (arr[i].t === 'id' || /^[0-9]/.test(arr[i].v))) t = lookup('table', arr[i++]); emit(waU(t)); break; }
        case 'memarg': { const m = memarg(arr, i, nat); i = m.next; op(code); emit(waU(m.al), waU(m.off)); break; }
        case 'memidx': op(code); emit(0x00); break;
        case 'i32': { op(code); const v = waParseInt(arr[i++].v, 32, 'i32'); emit(waS(BigInt.asIntN(32, v))); break; }
        case 'i64': { op(code); const v = waParseInt(arr[i++].v, 64, 'i64'); emit(waS(BigInt.asIntN(64, v))); break; }
        case 'f32': { op(code); const b = waParseFloat(arr[i++].v, false); emit([Number(b & 0xffn), Number((b >> 8n) & 0xffn), Number((b >> 16n) & 0xffn), Number((b >> 24n) & 0xffn)]); break; }
        case 'f64': { op(code); const b = waParseFloat(arr[i++].v, true); const o = []; for (let q = 0n; q < 64n; q += 8n) o.push(Number((b >> q) & 0xffn)); emit(o); break; }
        case 'reftype': { op(code); const a = arr[i++]; if (!a || (a.v !== 'func' && a.v !== 'extern' && a.v !== 'funcref' && a.v !== 'externref')) err('ref.null needs func or extern', x); emit(a.v.startsWith('func') ? 0x70 : 0x6f); break; }
        case 'meminit': usesDataCount = true; op(code); emit(waU(lookup('data', arr[i++])), 0x00); break;
        case 'dataidx': usesDataCount = true; op(code); emit(waU(lookup('data', arr[i++]))); break;
        case 'memcopy': op(code); emit(0x00, 0x00); break;
        case 'elemidx': op(code); emit(waU(lookup('elem', arr[i++]))); break;
        case 'tableinit': { op(code); const a = arr[i], b = arr[i + 1]; let t = 0, e; if (b && !Array.isArray(b) && b.t !== undefined && (b.t === 'id' || /^[0-9]/.test(b.v))) { t = lookup('table', a); e = lookup('elem', b); i += 2; } else { e = lookup('elem', a); i++; } emit(waU(e), waU(t)); break; }
        case 'tablecopy': { op(code); let d1 = 0, s1 = 0; if (arr[i] && !Array.isArray(arr[i]) && arr[i].t !== undefined && (arr[i].t === 'id' || /^[0-9]/.test(arr[i].v))) { d1 = lookup('table', arr[i++]); s1 = lookup('table', arr[i++]); } emit(waU(d1), waU(s1)); break; }
        default: err('Unsupported instruction form ' + name, x);
      }
      return i;
    };
    const folded = (l) => {
      const h = head(l); if (!h) err('Expected an instruction', l);
      if (h === 'block' || h === 'loop') { let i = 1, label = null; if (l[i] && l[i].t === 'id') label = l[i++].v; const r = resolveBlockType(l, i); i = r.next; emit(WA_BY_NAME.get(h)[1], r.bt); ctx.labels.push(label); seq(l, i, l.length); emit(0x0b); ctx.labels.pop(); return; }
      if (h === 'if') {
        let i = 1, label = null; if (l[i] && l[i].t === 'id') label = l[i++].v; const r = resolveBlockType(l, i); i = r.next;
        while (i < l.length && head(l[i]) !== 'then') { if (!Array.isArray(l[i])) err('Expected folded condition or (then ...)', l[i]); folded(l[i]); i++; }
        emit(0x04, r.bt); ctx.labels.push(label);
        const th = l[i]; if (head(th) !== 'then') err('if needs a (then ...) clause', l); seq(th, 1, th.length); i++;
        if (l[i] && head(l[i]) === 'else') { emit(0x05); seq(l[i], 1, l[i].length); i++; }
        if (i < l.length) err('Unexpected content after (else ...)', l[i]); emit(0x0b); ctx.labels.pop(); return;
      }
      // plain folded: operands (lists) after immediates
      let i = 0; const atoms = []; let k2 = 0;
      // find extent of immediates: atoms/ids at the start (until first list that isn't a typeuse/result/memarg-ish)
      const name = l[0].v; const d = WA_BY_NAME.get(name); let j = 1;
      const isImmList = (x) => Array.isArray(x) && (head(x) === 'type' || head(x) === 'param' || head(x) === 'result');
      while (j < l.length && (!Array.isArray(l[j]) || isImmList(l[j]))) j++;
      const immItems = l.slice(0, j); const operands = l.slice(j);
      for (const o of operands) { if (!Array.isArray(o)) err('Unexpected token in folded expression', o); folded(o); }
      const used = plain(immItems, 0, name); if (used < immItems.length) err('Unexpected operands for ' + name, immItems[used]);
    };
    seq(items, k, items.length);
    return out;
  }
  const constExpr = (items) => { const ctx = { locals: {}, labels: [] }; let e = items; if (head(e) === 'offset') e = e.slice(1); else e = [e]; const b = assembleBody(e, 0, ctx); return [...b, 0x0b]; };
  // ---- pass 2: build definitions ----
  const entries = { func: [], table: [], memory: [], global: [] };
  const bodies = [];
  for (const d of defs) {
    const { f, h, k: k0 } = d; let k = k0;
    const idx = d.idx + 0; // index within defs space (adjusted below)
    const spaceIdx = d.idx;
    const exports = () => {};
    if (h === 'func') {
      const tu = typeUse(f, k); k = tu.next; const locals = {}; const ltypes = [];
      tu.sig.params.forEach((_, i) => { if (tu.names[i]) locals[tu.names[i].v] = i; });
      let n = tu.sig.params.length;
      while (head(f[k]) === 'local') { const l = f[k]; let q = 1; if (l[q] && l[q].t === 'id') { locals[l[q].v] = n; q++; ltypes.push(parseVT(l[q])); n++; if (q + 1 < l.length) err('Named local must declare a single type', l); } else for (; q < l.length; q++) { ltypes.push(parseVT(l[q])); n++; } k++; }
      const ctx = { locals, labels: [] }; const code = assembleBody(f, k, ctx);
      const groups = []; for (const t of ltypes) { if (groups.length && groups[groups.length - 1][1] === t) groups[groups.length - 1][0]++; else groups.push([1, t]); }
      const body = [...waU(groups.length), ...groups.flatMap(([c, t]) => [...waU(c), WA_VT_REV[t]]), ...code, 0x0b];
      entries.func.push(tu.idx); bodies.push(body); exports('func', spaceIdx);
    } else if (h === 'table') {
      // (table id? limits reftype) | (table reftype (elem ...))
      if (f[k] && f[k].t === 'atom' && /^[0-9]/.test(f[k].v)) { const lim = parseLimits(f, k); entries.table.push({ lim: lim.lim, ref: parseRefType(f[lim.next]) }); }
      else { const ref = parseRefType(f[k]); const el = f[k + 1]; if (head(el) !== 'elem') err('Expected (elem ...) or limits', f); const items = el.slice(1); entries.table.push({ lim: { min: items.length, max: items.length }, ref }); M.elems.push({ inlineTable: spaceIdx, items: items.map((it) => (Array.isArray(it) ? [it] : null) && it), ref, f: el }); }
      exports('table', spaceIdx);
    } else if (h === 'memory') {
      if (head(f[k]) === 'data') { const segs = f[k].slice(1); let len = 0; const bs = segs.map((s) => { if (s.t !== 'str') err('Expected string', s); len += s.bytes.length; return s.bytes; }); const pages = Math.ceil(len / 65536); entries.memory.push({ min: pages, max: pages }); M.datas.push({ mem: spaceIdx, offset: [0x41, 0x00, 0x0b], bytes: Uint8Array.from(bs.flatMap((b) => [...b])) }); }
      else entries.memory.push(parseLimits(f, k).lim);
      exports('memory', spaceIdx);
    } else if (h === 'global') {
      const gt = parseGlobalType(f[k]); const initE = f.slice(k + 1); if (!initE.length) err('Global needs an initializer', f);
      const ctx = { locals: {}, labels: [] }; const b = assembleBody(initE, 0, ctx); entries.global.push({ gt, init: [...b, 0x0b] }); exports('global', spaceIdx);
    }
  }
  for (const f of fields) {
    const h = head(f);
    if (h === 'export') { /* resolved below */ }
    else if (h === 'start') M.start = lookup('func', f[1]);
    else if (h === 'elem') M.elems.push({ f });
    else if (h === 'data') M.datas.push({ f });
    else if (!['type', 'import', 'func', 'table', 'memory', 'global'].includes(h)) err('Unsupported module field "' + h + '"', f);
  }
  for (const e of M.exports) if (e.ref) { if (!['func', 'table', 'memory', 'global'].includes(e.kind)) err('Bad export descriptor', e.ref); e.idx = lookup(e.kind, e.ref[1]); }
  // elems
  const refItem = (x) => { // returns expr bytes for a funcref item; x may be atom ($f / idx) or list
    if (Array.isArray(x)) { let e = x; if (head(e) === 'item') e = e.slice(1).length === 1 && Array.isArray(e[1]) ? e[1] : e.slice(1); const ctx = { locals: {}, labels: [] }; return [...assembleBody(Array.isArray(e[0]) || e[0].t ? (Array.isArray(e[0]) ? e : [e]) : e, 0, ctx), 0x0b]; }
    return [0xd2, ...waU(lookup('func', x)), 0x0b];
  };
  const elemSegs = [];
  for (const E of M.elems) {
    if (E.inlineTable !== undefined) { const items = E.f.slice(1); const allFuncs = items.every((x) => !Array.isArray(x)); elemSegs.push(allFuncs ? { mode: 'active', table: E.inlineTable, offset: [0x41, 0x00, 0x0b], funcs: items.map((x) => lookup('func', x)) } : { mode: 'active', table: E.inlineTable, offset: [0x41, 0x00, 0x0b], ref: E.ref, exprs: items.map(refItem) }); continue; }
    const f = E.f; let k = 1; if (f[k] && f[k].t === 'id') k++;
    const seg = { mode: 'passive' };
    if (waIsAtom(f[k], 'declare')) { seg.mode = 'declare'; k++; }
    else { let table = 0; if (head(f[k]) === 'table') { table = lookup('table', f[k][1]); k++; } if (Array.isArray(f[k]) && (head(f[k]) === 'offset' || (WA_BY_NAME.has(head(f[k]))))) { seg.mode = 'active'; seg.table = table; seg.offset = constExpr(f[k]); k++; } else if (table) err('(table ...) requires an offset', f); }
    if (f[k] && (waIsAtom(f[k], 'func'))) { k++; seg.funcs = f.slice(k).map((x) => lookup('func', x)); }
    else if (f[k] && f[k].t === 'atom' && (f[k].v === 'funcref' || f[k].v === 'externref')) { seg.ref = f[k].v; k++; seg.exprs = f.slice(k).map(refItem); }
    else if (seg.mode === 'active' && (!f[k] || !Array.isArray(f[k]) || true)) { const rest = f.slice(k); if (rest.every((x) => !Array.isArray(x))) seg.funcs = rest.map((x) => lookup('func', x)); else { seg.ref = 'funcref'; seg.exprs = rest.map(refItem); } }
    else err('Malformed elem segment', f);
    elemSegs.push(seg);
  }
  const dataSegs = [];
  for (const D of M.datas) {
    if (!D.f) { dataSegs.push({ mem: D.mem, offset: D.offset, bytes: D.bytes }); continue; }
    const f = D.f; let k = 1; if (f[k] && f[k].t === 'id') k++; const seg = {};
    let mem = 0; if (head(f[k]) === 'memory') { mem = lookup('memory', f[k][1]); k++; }
    if (Array.isArray(f[k])) { seg.mem = mem; seg.offset = constExpr(f[k]); k++; } else seg.passive = true;
    const bs = []; for (; k < f.length; k++) { if (f[k].t !== 'str') err('Expected data string', f[k]); for (const x of f[k].bytes) bs.push(x); } seg.bytes = Uint8Array.from(bs); dataSegs.push(seg);
  }
  // ---- emit binary ----
  const out = [0, 0x61, 0x73, 0x6d, 1, 0, 0, 0];
  const section = (id, payload) => { out.push(id, ...waU(payload.length)); for (let i = 0; i < payload.length; i++) out.push(payload[i]); };
  const vec = (items, f) => [...waU(items.length), ...items.flatMap(f)];
  const nameB = (b) => [...waU(b.length), ...b];
  const limB = (l) => (l.max === null ? [0, ...waU(l.min)] : [1, ...waU(l.min), ...waU(l.max)]);
  if (M.types.length) section(1, vec(M.types, (t) => [0x60, ...vec(t.params, (p) => [WA_VT_REV[p]]), ...vec(t.results, (p) => [WA_VT_REV[p]])]));
  if (importEntries.length) section(2, vec(importEntries, (e) => [...nameB(e.mod), ...nameB(e.nm), ...(e.kind === 'func' ? [0, ...waU(e.type)] : e.kind === 'table' ? [1, WA_VT_REV[e.ref], ...limB(e.lim)] : e.kind === 'memory' ? [2, ...limB(e.lim)] : [3, WA_VT_REV[e.gt.t], e.gt.mut ? 1 : 0])]));
  if (entries.func.length) section(3, vec(entries.func, (t) => waU(t)));
  if (entries.table.length) section(4, vec(entries.table, (t) => [WA_VT_REV[t.ref], ...limB(t.lim)]));
  if (entries.memory.length) section(5, vec(entries.memory, (m) => limB(m)));
  if (entries.global.length) section(6, vec(entries.global, (g) => [WA_VT_REV[g.gt.t], g.gt.mut ? 1 : 0, ...g.init]));
  if (M.exports.length) section(7, vec(M.exports, (e) => [...nameB(e.name), ['func', 'table', 'memory', 'global'].indexOf(e.kind), ...waU(e.idx)]));
  if (M.start !== null) section(8, waU(M.start));
  for (const s of elemSegs) { // wabt-compatible simplification: all-ref.func funcref items become function indices
    if (s.exprs && (s.ref || 'funcref') === 'funcref') { const fs = []; for (const e of s.exprs) { if (e[0] === 0xd2 && e[e.length - 1] === 0x0b) { const r = new WaReader(Uint8Array.from(e.slice(1, -1))); const v = r.u32(); if (r.eof) { fs.push(v); continue; } } break; } if (fs.length === s.exprs.length) { s.funcs = fs; delete s.exprs; } }
  }
  if (elemSegs.length) section(9, vec(elemSegs, (s) => {
    const exprs = !!s.exprs; const o = [];
    if (s.mode === 'active') {
      if (!exprs) { o.push(...waU(s.table ? 2 : 0)); if (s.table) o.push(...waU(s.table)); o.push(...s.offset); if (s.table) o.push(0); o.push(...waU(s.funcs.length), ...s.funcs.flatMap((i) => waU(i))); }
      else { const ref = s.ref || 'funcref'; if (!s.table && ref === 'funcref') o.push(4, ...s.offset); else o.push(6, ...waU(s.table), ...s.offset, WA_VT_REV[ref]); o.push(...waU(s.exprs.length), ...s.exprs.flat()); }
    } else { const base = s.mode === 'passive' ? 1 : 3; if (!exprs) o.push(base, 0, ...waU(s.funcs.length), ...s.funcs.flatMap((i) => waU(i))); else o.push(base + 4, WA_VT_REV[s.ref || 'funcref'], ...waU(s.exprs.length), ...s.exprs.flat()); }
    return o;
  }));
  if (usesDataCount) section(12, waU(dataSegs.length));
  if (bodies.length) section(10, vec(bodies, (b) => [...waU(b.length), ...b]));
  if (dataSegs.length) section(11, vec(dataSegs, (d) => [...(d.passive ? [1] : d.mem ? [2, ...waU(d.mem)] : [0]), ...(d.passive ? [] : d.offset), ...waU(d.bytes.length), ...d.bytes]));
  return Uint8Array.from(out);
}
function waHex(b) { return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' '); }
function waParseBinaryInput(s) {
  const t = s.trim(); let m = t.replace(/0x/gi, '').replace(/[\s,]/g, '');
  if (/^[0-9a-fA-F]+$/.test(m) && m.length % 2 === 0) return Uint8Array.from(m.match(/../g).map((h) => parseInt(h, 16)));
  const b64 = t.replace(/\s/g, ''); if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(b64)) { try { const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); } catch (e) { /* fallthrough */ } }
  throw new WaError('Input is neither WAT text (starting with "(") nor a hex or base64 WebAssembly binary');
}

// ===== OpenPGP public-key encrypt / decrypt (RFC 4880 v4 keys, SEIPD v1), hand-written =====
const pgpCat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const pgpU32 = (n) => Uint8Array.of(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const pgpHex = (u) => Array.from(u, (x) => x.toString(16).padStart(2, '0')).join('');
const pgpB64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const pgpFromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const pgpCrc24 = (u8) => { let crc = 0xb704ce; for (const b of u8) { crc ^= b << 16; for (let i = 0; i < 8; i++) { crc <<= 1; if (crc & 0x1000000) crc ^= 0x1864cfb; } } return crc & 0xffffff; };
const pgpBig = (u) => { let v = 0n; for (const b of u) v = (v << 8n) | BigInt(b); return v; };
const pgpFromBig = (v, len) => { const o = new Uint8Array(len); for (let i = len - 1; i >= 0; i--) { o[i] = Number(v & 255n); v >>= 8n; } if (v) throw new Error('Number too large'); return o; };
const pgpModpow = (b, e, m) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; };
const pgpMpi = (u) => { let i = 0; while (i < u.length && u[i] === 0) i++; u = u.subarray(i); const bits = u.length ? (u.length - 1) * 8 + (32 - Math.clz32(u[0])) : 0; return pgpCat(Uint8Array.of(bits >> 8, bits & 255), u); };
const pgpReadMpi = (u, p) => { const bits = (u[p.i] << 8) | u[p.i + 1], len = (bits + 7) >> 3; p.i += 2; const r = u.subarray(p.i, p.i + len); if (r.length !== len) throw new Error('Truncated MPI'); p.i += len; return r; };
function pgpArmor(type, u8) { const b = pgpB64(u8).match(/.{1,64}/g) || []; const c = pgpCrc24(u8); return `-----BEGIN PGP ${type}-----\n\n${b.join('\n')}\n=${pgpB64(Uint8Array.of(c >> 16, (c >> 8) & 255, c & 255))}\n-----END PGP ${type}-----\n`; }
function pgpDearmor(text) { // returns concatenated binary of every armor block (or raw binary if the text is not armored)
  const re = /-----BEGIN PGP ([A-Z ]+)-----\r?\n([\s\S]*?)-----END PGP \1-----/g; const out = []; let m;
  while ((m = re.exec(text))) {
    const lines = m[2].split(/\r?\n/); let i = 0; while (i < lines.length && lines[i].trim() !== '') i++; // skip headers
    let body = lines.slice(i + 1).map((l) => l.trim()).filter(Boolean); let crc = null;
    if (body.length && body[body.length - 1][0] === '=') crc = body.pop().slice(1);
    let bin; try { bin = pgpFromB64(body.join('')); } catch { throw new Error('Bad base64 in the armored block'); }
    if (crc !== null) { const c = pgpFromB64(crc); if (((c[0] << 16) | (c[1] << 8) | c[2]) !== pgpCrc24(bin)) throw new Error('Armor checksum (CRC-24) does not match: the text was damaged'); }
    out.push({ type: m[1], bin });
  }
  return out;
}
function pgpPackets(u) {
  const r = []; let i = 0;
  while (i < u.length) {
    const b = u[i++]; if (!(b & 0x80)) throw new Error('Not an OpenPGP packet stream'); let tag, len;
    if (b & 0x40) {
      tag = b & 63; const parts = [];
      for (;;) { const l = u[i++]; if (l < 192) { len = l; } else if (l < 224) len = ((l - 192) << 8) + u[i++] + 192; else if (l === 255) { len = ((u[i] << 24) | (u[i + 1] << 16) | (u[i + 2] << 8) | u[i + 3]) >>> 0; i += 4; } else { len = 1 << (l & 31); if (i + len > u.length) throw new Error('Truncated packet'); parts.push(u.subarray(i, i + len)); i += len; continue; } if (i + len > u.length) throw new Error('Truncated packet'); parts.push(u.subarray(i, i + len)); i += len; break; }
      r.push({ tag, body: parts.length === 1 ? parts[0] : pgpCat(...parts) }); continue;
    }
    else { tag = (b >> 2) & 15; const lt = b & 3; if (lt === 0) len = u[i++]; else if (lt === 1) { len = (u[i] << 8) | u[i + 1]; i += 2; } else if (lt === 2) { len = ((u[i] << 24) | (u[i + 1] << 16) | (u[i + 2] << 8) | u[i + 3]) >>> 0; i += 4; } else len = u.length - i; }
    if (i + len > u.length) throw new Error('Truncated packet');
    r.push({ tag, body: u.subarray(i, i + len) }); i += len;
  }
  return r;
}
const pgpPacket = (tag, body) => { const n = body.length; return pgpCat(Uint8Array.of(0xc0 | tag), n < 192 ? Uint8Array.of(n) : n < 8384 ? Uint8Array.of(((n - 192) >> 8) + 192, (n - 192) & 255) : pgpCat(Uint8Array.of(255), pgpU32(n)), body); };
// ---- AES via WebCrypto (ECB emulated with CBC and a zero IV) ----
async function pgpAes(key) { const k = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt']); const iv = new Uint8Array(16); return async (blk) => new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, k, blk)).subarray(0, 16); }
async function pgpCfb(key, data, decrypt) { // OpenPGP CFB, zero IV, no resync
  const E = await pgpAes(key), out = new Uint8Array(data.length); let fr = new Uint8Array(16);
  for (let i = 0; i < data.length; i += 16) { const ks = await E(fr), n = Math.min(16, data.length - i); for (let j = 0; j < n; j++) out[i + j] = data[i + j] ^ ks[j]; fr = decrypt ? data.subarray(i, i + 16) : out.subarray(i, i + 16); if (fr.length < 16) fr = pgpCat(fr, new Uint8Array(16 - fr.length)); }
  return out;
}
const PGP_HASH = { 1: 'MD5', 2: 'SHA-1', 8: 'SHA-256', 9: 'SHA-384', 10: 'SHA-512', 11: 'SHA-224' };
const PGP_KEYLEN = { 7: 16, 8: 24, 9: 32 };
const pgpSha = async (name, d) => new Uint8Array(await crypto.subtle.digest(name, d));
async function pgpS2k(pass, spec, keyLen) {
  const hn = PGP_HASH[spec.hash]; if (!hn || spec.hash === 1 || spec.hash === 11) throw new Error('Unsupported S2K hash algorithm ' + spec.hash);
  const pw = new TextEncoder().encode(pass); let data = spec.type === 0 ? pw : pgpCat(spec.salt, pw);
  if (spec.type === 3) { const total = Math.max(spec.count, data.length); const buf = new Uint8Array(total); for (let i = 0; i < total; i += data.length) buf.set(data.subarray(0, Math.min(data.length, total - i)), i); data = buf; }
  const out = []; let got = 0; for (let inst = 0; got < keyLen; inst++) { const d = await pgpSha(hn, pgpCat(new Uint8Array(inst), data)); out.push(d); got += d.length; } return pgpCat(...out).subarray(0, keyLen);
}
// ---- X25519 (RFC 7748) ----
const P25519 = (1n << 255n) - 19n, modP = (x) => ((x % P25519) + P25519) % P25519;
function pgpX25519(k, u) {
  const sc = Uint8Array.from(k); sc[0] &= 248; sc[31] &= 127; sc[31] |= 64; let kk = 0n; for (let i = 31; i >= 0; i--) kk = (kk << 8n) | BigInt(sc[i]);
  const uu = Uint8Array.from(u); uu[31] &= 127; let x1 = 0n; for (let i = 31; i >= 0; i--) x1 = (x1 << 8n) | BigInt(uu[i]);
  let x2 = 1n, z2 = 0n, x3 = x1, z3 = 1n, swap = 0n;
  for (let t = 254; t >= 0; t--) { const kt = (kk >> BigInt(t)) & 1n; swap ^= kt; if (swap) { [x2, x3] = [x3, x2]; [z2, z3] = [z3, z2]; } swap = kt; const A = modP(x2 + z2), AA = modP(A * A), B = modP(x2 - z2), BB = modP(B * B), E = modP(AA - BB), C = modP(x3 + z3), D = modP(x3 - z3), DA = modP(D * A), CB = modP(C * B); x3 = modP((DA + CB) ** 2n); z3 = modP(x1 * modP((DA - CB) ** 2n)); x2 = modP(AA * BB); z2 = modP(E * (AA + 121665n * E)); }
  if (swap) { [x2, x3] = [x3, x2]; [z2, z3] = [z3, z2]; }
  const r = modP(x2 * pgpModpow(z2, P25519 - 2n, P25519)); const out = new Uint8Array(32); let v = r; for (let i = 0; i < 32; i++) { out[i] = Number(v & 255n); v >>= 8n; } return out;
}
const PGP_CURVES = { '2a8648ce3d030107': { name: 'P-256', size: 32 }, '2b81040022': { name: 'P-384', size: 48 }, '2b81040023': { name: 'P-521', size: 66 }, '2b060104019755010501': { name: 'Curve25519', size: 32 } };
// ---- key parsing ----
async function pgpParseKeys(bins) { // returns {keys: [{pubBody, algo, ..., fp, keyid, isSub, flags, secret?}]}
  const keys = []; let primary = null, last = null;
  for (const bin of bins) {
    for (const pk of pgpPackets(bin)) {
      if (pk.tag === 6 || pk.tag === 14 || pk.tag === 5 || pk.tag === 7) {
        const k = await pgpParseKeyPacket(pk.body, pk.tag === 5 || pk.tag === 7); k.isSub = pk.tag === 14 || pk.tag === 7; if (!k.isSub) primary = k; k.primary = primary; keys.push(k); last = k;
      } else if (pk.tag === 2 && last) {
        try { const s = pgpParseSig(pk.body); if (s.type === 0x18 || s.type === 0x13 || s.type === 0x10 || s.type === 0x11 || s.type === 0x12) { if (s.type === 0x18 && last.isSub) { last.flags = s.flags ?? last.flags; last.expires = s.keyExpiry ? last.created + s.keyExpiry : last.expires; } else if ((s.type >= 0x10 && s.type <= 0x13) && !last.isSub && s.flags !== undefined && last.flags === undefined) { last.flags = s.flags; if (s.keyExpiry) last.expires = last.created + s.keyExpiry; } } else if (s.type === 0x28 || s.type === 0x20) last.revoked = true; } catch { /* ignore unparsable signatures */ }
      }
    }
  }
  return keys;
}
function pgpParseSig(b) {
  if (b[0] !== 4) throw new Error('only v4 signatures'); const r = { type: b[1] }; let i = 4; const hl = (b[i] << 8) | b[i + 1]; i += 2; const area = b.subarray(i, i + hl);
  let j = 0; while (j < area.length) { let l = area[j++]; if (l >= 192 && l < 255) l = ((l - 192) << 8) + area[j++] + 192; else if (l === 255) { l = ((area[j] << 24) | (area[j + 1] << 16) | (area[j + 2] << 8) | area[j + 3]) >>> 0; j += 4; } const t = area[j] & 127; const d = area.subarray(j + 1, j + l); if (t === 27) r.flags = d[0]; if (t === 9) r.keyExpiry = ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0; j += l; }
  return r;
}
async function pgpParseKeyPacket(b, secret) {
  if (b[0] === 6) throw new Error('Version 6 keys (RFC 9580) are not supported; use a v4 key'); if (b[0] !== 4) throw new Error('Only version 4 keys are supported (found v' + b[0] + ')');
  const created = ((b[1] << 24) | (b[2] << 16) | (b[3] << 8) | b[4]) >>> 0, algo = b[5], p = { i: 6 }; const k = { created, algo };
  if (algo === 1 || algo === 2 || algo === 3) { k.n = pgpReadMpi(b, p); k.e = pgpReadMpi(b, p); }
  else if (algo === 18) { const ol = b[p.i++]; const oid = pgpHex(b.subarray(p.i, p.i + ol)); p.i += ol; k.curve = PGP_CURVES[oid]; k.oid = b.subarray(p.i - ol, p.i); if (!k.curve) throw new Error('Unsupported ECDH curve (OID ' + oid + ')'); k.point = pgpReadMpi(b, p); const kl = b[p.i++]; if (kl !== 3 || b[p.i] !== 1) throw new Error('Unsupported ECDH KDF parameters'); k.kdfHash = b[p.i + 1]; k.kdfCipher = b[p.i + 2]; p.i += kl; }
  else if (algo === 16) throw new Error('ElGamal keys are not supported');
  else { k.other = true; }
  if (k.other) { k.pubBody = b; k.fp = await pgpSha('SHA-1', pgpCat(Uint8Array.of(0x99, b.length >> 8, b.length & 255), b)); k.keyid = k.fp.subarray(12); return k; }
  k.pubBody = b.subarray(0, p.i); k.fp = await pgpSha('SHA-1', pgpCat(Uint8Array.of(0x99, k.pubBody.length >> 8, k.pubBody.length & 255), k.pubBody)); k.keyid = k.fp.subarray(12);
  if (secret) k.secretRaw = b.subarray(p.i);
  return k;
}
function pgpPickEncKey(keys, now) {
  const usable = keys.filter((k) => !k.other && (k.algo === 1 || k.algo === 2 || k.algo === 18) && !k.revoked && !(k.expires && k.expires < now / 1000) && (k.flags === undefined ? true : (k.flags & 0x0c)));
  const subs = usable.filter((k) => k.isSub).sort((a, b) => b.created - a.created); if (subs.length) return subs[0];
  const prim = usable.filter((k) => !k.isSub); return prim[0] || null;
}
// ---- session key wrapping ----
async function pgpEcdhKdf(Z, k, symlen) { const param = pgpCat(Uint8Array.of(k.oid.length), k.oid, Uint8Array.of(18, 3, 1, k.kdfHash, k.kdfCipher), new TextEncoder().encode('Anonymous Sender    '), k.fp); const h = await pgpSha(PGP_HASH[k.kdfHash], pgpCat(pgpU32(1), Z, param)); if (h.length < symlen) throw new Error('KDF hash too short'); return h.subarray(0, symlen); }
async function pgpAesKw(kek, data, wrap) {
  const ka = await crypto.subtle.importKey('raw', kek, 'AES-KW', false, wrap ? ['wrapKey'] : ['unwrapKey']);
  const alg = { name: 'HMAC', hash: 'SHA-256' };
  if (wrap) { const ck = await crypto.subtle.importKey('raw', data, alg, true, ['sign']); return new Uint8Array(await crypto.subtle.wrapKey('raw', ck, ka, 'AES-KW')); }
  const ck = await crypto.subtle.unwrapKey('raw', data, ka, 'AES-KW', alg, true, ['sign']); return new Uint8Array(await crypto.subtle.exportKey('raw', ck));
}
async function pgpEncryptSessionKey(k, symAlgo, sessionKey) {
  const csum = sessionKey.reduce((a, x) => a + x, 0) & 0xffff; const m = pgpCat(Uint8Array.of(symAlgo), sessionKey, Uint8Array.of(csum >> 8, csum & 255));
  const head = pgpCat(Uint8Array.of(3), k.keyid, Uint8Array.of(k.algo === 18 ? 18 : 1));
  if (k.algo !== 18) { // RSA PKCS#1 v1.5
    const nbytes = k.n.length - (k.n[0] === 0 ? 1 : 0), n = pgpBig(k.n), e = pgpBig(k.e); const nb = Math.ceil(n.toString(2).length / 8);
    if (m.length > nb - 11) throw new Error('RSA key too small'); const ps = crypto.getRandomValues(new Uint8Array(nb - m.length - 3)); for (let i = 0; i < ps.length; i++) while (ps[i] === 0) ps[i] = crypto.getRandomValues(new Uint8Array(1))[0];
    const em = pgpCat(Uint8Array.of(0, 2), ps, Uint8Array.of(0), m); const c = pgpModpow(pgpBig(em), e, n); return pgpCat(head, pgpMpi(pgpFromBig(c, nb)));
  }
  const symlen = PGP_KEYLEN[k.kdfCipher]; if (!symlen) throw new Error('Unsupported KDF cipher'); let eph, Z;
  if (k.curve.name === 'Curve25519') { const sk = crypto.getRandomValues(new Uint8Array(32)); const pubE = pgpX25519(sk, Uint8Array.of(9, ...new Array(31).fill(0))); if (k.point[0] !== 0x40) throw new Error('Bad Curve25519 point'); Z = pgpX25519(sk, k.point.subarray(1)); eph = pgpCat(Uint8Array.of(0x40), pubE); }
  else { const name = k.curve.name, sz = k.curve.size; const pt = k.point; if (pt[0] !== 4) throw new Error('Only uncompressed EC points are supported'); const pub = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: name, x: pgpB64(pt.subarray(1, 1 + sz)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), y: pgpB64(pt.subarray(1 + sz)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }, { name: 'ECDH', namedCurve: name }, false, []); const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: name }, true, ['deriveBits']); Z = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, kp.privateKey, sz * 8)); eph = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)); }
  const kek = await pgpEcdhKdf(Z, k, symlen); let pad = 8 - (m.length % 8); const padded = pgpCat(m, new Uint8Array(pad).fill(pad)); const wrapped = await pgpAesKw(kek, padded, true);
  return pgpCat(head, pgpMpi(eph), Uint8Array.of(wrapped.length), wrapped);
}
// ---- encrypt ----
async function pgpEncrypt(msgBytes, pubTexts, opt) {
  const blocks = pubTexts.flatMap((t) => pgpDearmor(t).filter((b) => /PUBLIC KEY/.test(b.type))); if (!blocks.length) throw new Error('No "-----BEGIN PGP PUBLIC KEY BLOCK-----" found in the key box.');
  const recipients = []; for (const b of blocks) { const keys = await pgpParseKeys([b.bin]); const k = pgpPickEncKey(keys, Date.now()); if (!k) throw new Error('This public key has no usable encryption-capable key (expired, revoked, signing-only, or an unsupported algorithm such as ElGamal or v6).'); recipients.push(k); }
  const symAlgo = 9, sk = crypto.getRandomValues(new Uint8Array(32));
  const pkesk = []; for (const k of recipients) pkesk.push(pgpPacket(1, await pgpEncryptSessionKey(k, symAlgo, sk)));
  const lit = pgpPacket(11, pgpCat(Uint8Array.of(opt.text ? 0x75 : 0x62, 0), pgpU32(Math.floor(Date.now() / 1000)), msgBytes));
  const prefix = crypto.getRandomValues(new Uint8Array(16)); const pre = pgpCat(prefix, prefix.subarray(14, 16));
  const mdcInput = pgpCat(pre, lit, Uint8Array.of(0xd3, 0x14)); const mdc = pgpCat(Uint8Array.of(0xd3, 0x14), await pgpSha('SHA-1', mdcInput));
  const enc = await pgpCfb(sk, pgpCat(pre, lit, mdc), false);
  const out = pgpCat(...pkesk, pgpPacket(18, pgpCat(Uint8Array.of(1), enc)));
  return { armored: pgpArmor('MESSAGE', out), recipients };
}
// ---- decrypt ----
async function pgpUnlockSecret(k, pass) {
  const r = k.secretRaw; let i = 0; const usage = r[i++]; let plain;
  if (usage === 0) { plain = r.subarray(i); const body = plain.subarray(0, plain.length - 2); const cs = (plain[plain.length - 2] << 8) | plain[plain.length - 1]; if ((body.reduce((a, x) => a + x, 0) & 0xffff) !== cs) throw new Error('Secret key checksum mismatch'); return body; }
  if (usage !== 254 && usage !== 255) throw new Error('Unsupported secret-key protection (usage byte ' + usage + '; AEAD-protected keys are not supported)');
  if (!pass) throw new Error('This secret key is protected: enter its passphrase.');
  const sym = r[i++], keyLen = PGP_KEYLEN[sym]; if (!keyLen) throw new Error('Unsupported secret-key cipher ' + sym);
  const st = r[i++]; if (st !== 0 && st !== 1 && st !== 3) throw new Error('Unsupported S2K type ' + st + ' (Argon2 and GnuPG-private forms are not supported)');
  const spec = { type: st, hash: r[i++] }; if (st >= 1) { spec.salt = r.subarray(i, i + 8); i += 8; } if (st === 3) { const c = r[i++]; spec.count = (16 + (c & 15)) << ((c >> 4) + 6); }
  const iv = r.subarray(i, i + 16); i += 16; const key = await pgpS2k(pass, spec, keyLen); const ct = r.subarray(i);
  // CFB with explicit IV: emulate by prepending nothing; implement manually
  const E = await pgpAes(key); const out = new Uint8Array(ct.length); let fr = iv;
  for (let o = 0; o < ct.length; o += 16) { const ks = await E(fr); const n = Math.min(16, ct.length - o); for (let j = 0; j < n; j++) out[o + j] = ct[o + j] ^ ks[j]; fr = ct.subarray(o, o + 16); if (fr.length < 16) fr = pgpCat(fr, new Uint8Array(16 - fr.length)); }
  if (usage === 254) { const body = out.subarray(0, out.length - 20); const h = await pgpSha('SHA-1', body); if (pgpHex(h) !== pgpHex(out.subarray(out.length - 20))) throw new Error('Wrong passphrase (the secret key integrity check failed)'); return body; }
  const body = out.subarray(0, out.length - 2), cs = (out[out.length - 2] << 8) | out[out.length - 1]; if ((body.reduce((a, x) => a + x, 0) & 0xffff) !== cs) throw new Error('Wrong passphrase (checksum mismatch)'); return body;
}
async function pgpDecryptSessionKey(k, material, pk) { // pk: PKESK body after keyid/algo; returns {algo, key}
  let m;
  if (k.algo !== 18) {
    const p = { i: 0 }; const body = material; const sec = { i: 0 }; const d = pgpBig(pgpReadMpi(body, sec)); const n = pgpBig(k.n); const c = pgpBig(pgpReadMpi(pk, p)); const nb = Math.ceil(n.toString(2).length / 8);
    const em = pgpFromBig(pgpModpow(c, d, n), nb); if (em[0] !== 0 || em[1] !== 2) throw new Error('RSA decryption failed (wrong key?)'); let z = 2; while (z < em.length && em[z] !== 0) z++; if (z < 10 || z >= em.length) throw new Error('RSA padding invalid'); m = em.subarray(z + 1);
  } else {
    const sec = { i: 0 }; const sk = pgpReadMpi(material, sec); const p = { i: 0 }; const eph = pgpReadMpi(pk, p); const wl = pk[p.i++]; const wrapped = pk.subarray(p.i, p.i + wl); let Z;
    if (k.curve.name === 'Curve25519') { const sc = new Uint8Array(32); const rev = Array.from(sk).reverse(); sc.set(rev.slice(0, 32)); if (eph[0] !== 0x40) throw new Error('Bad ephemeral point'); Z = pgpX25519(sc, eph.subarray(1)); }
    else { const name = k.curve.name, sz = k.curve.size; const b64u = (u) => pgpB64(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); const pad = (u) => pgpCat(new Uint8Array(sz - u.length), u); const priv = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: name, d: b64u(pad(sk)), x: b64u(k.point.subarray(1, 1 + sz)), y: b64u(k.point.subarray(1 + sz)) }, { name: 'ECDH', namedCurve: name }, false, ['deriveBits']); const pub = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: name, x: b64u(eph.subarray(1, 1 + sz)), y: b64u(eph.subarray(1 + sz)) }, { name: 'ECDH', namedCurve: name }, false, []); Z = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, sz * 8)); }
    const symlen = PGP_KEYLEN[k.kdfCipher]; const kek = await pgpEcdhKdf(Z, k, symlen); let un; try { un = await pgpAesKw(kek, wrapped, false); } catch { throw new Error('Could not unwrap the session key (wrong key?)'); }
    const padn = un[un.length - 1]; if (padn < 1 || padn > 8) throw new Error('Bad session-key padding'); m = un.subarray(0, un.length - padn);
  }
  const algo = m[0], key = m.subarray(1, m.length - 2), cs = (m[m.length - 2] << 8) | m[m.length - 1]; if ((key.reduce((a, x) => a + x, 0) & 0xffff) !== cs) throw new Error('Session key checksum mismatch'); return { algo, key };
}
async function pgpInflate(data, fmt) { const ds = new DecompressionStream(fmt); const w = ds.writable.getWriter(); w.write(data); w.close(); return new Uint8Array(await new Response(ds.readable).arrayBuffer()); }
async function pgpDecrypt(msgText, keyTexts, pass) {
  const mb = pgpDearmor(msgText).filter((b) => /MESSAGE/.test(b.type)); let bin;
  if (mb.length) bin = mb[0].bin; else { const t = msgText.trim(); if (/^[0-9a-fA-F\s]+$/.test(t)) bin = Uint8Array.from(t.replace(/\s/g, '').match(/../g).map((h) => parseInt(h, 16))); else throw new Error('No "-----BEGIN PGP MESSAGE-----" block found.'); }
  const packets = pgpPackets(bin); const pkesks = packets.filter((p) => p.tag === 1), seipd = packets.find((p) => p.tag === 18 || p.tag === 20);
  if (packets.some((p) => p.tag === 9)) throw new Error('This message uses the old unprotected encryption packet (no integrity check); refusing to decrypt it.');
  if (!seipd) throw new Error(packets.some((p) => p.tag === 3) ? 'This message is passphrase-encrypted: use the passphrase tool (OpenPGP Passphrase Encrypt / Decrypt).' : 'No encrypted data packet found.');
  if (seipd.tag === 18 && seipd.body[0] !== 1) throw new Error('SEIPD version ' + seipd.body[0] + ' (RFC 9580) is not supported; supported: version 1 and the GnuPG/LibrePGP OCB packet.');
  if (!pkesks.length) throw new Error('No public-key encrypted session key packet found.');
  const blocks = keyTexts.flatMap((t) => pgpDearmor(t).filter((b) => /PRIVATE KEY/.test(b.type))); if (!blocks.length) throw new Error('No "-----BEGIN PGP PRIVATE KEY BLOCK-----" found in the key box.');
  const keys = []; for (const b of blocks) keys.push(...(await pgpParseKeys([b.bin])).filter((k) => k.secretRaw));
  let sess = null, lastErr = null, tried = 0;
  for (const pk of pkesks) {
    if (pk.body[0] !== 3) { lastErr = new Error('Only version 3 session-key packets are supported'); continue; }
    const kid = pgpHex(pk.body.subarray(1, 9)), algo = pk.body[9], rest = pk.body.subarray(10);
    const cands = keys.filter((k) => (kid === '0000000000000000' || pgpHex(k.keyid) === kid) && (algo === 18 ? k.algo === 18 : k.algo === 1 || k.algo === 2));
    for (const k of cands) { tried++; try { const material = await pgpUnlockSecret(k, pass); sess = await pgpDecryptSessionKey(k, material, rest); break; } catch (e) { lastErr = e; } }
    if (sess) break;
  }
  if (!sess) throw lastErr || new Error('None of the session keys in this message is addressed to the secret key(s) you pasted (key IDs: ' + pkesks.map((p) => pgpHex(p.body.subarray(1, 9))).join(', ') + ').');
  const keyLen = PGP_KEYLEN[sess.algo]; if (!keyLen || sess.key.length !== keyLen) throw new Error('Unsupported symmetric algorithm ' + sess.algo + ' (only AES-128/192/256).');
  let inner; const notes = [];
  if (seipd.tag === 20) inner = pgpAeadDecrypt(seipd.body, sess.key, sess.algo);
  else {
    const dec = await pgpCfb(sess.key, seipd.body.subarray(1), true);
    if (dec[14] !== dec[16] || dec[15] !== dec[17]) throw new Error('Decryption failed: bad session key (prefix check).');
    const mdcStart = dec.length - 22; if (dec[mdcStart] !== 0xd3 || dec[mdcStart + 1] !== 0x14) throw new Error('Missing integrity (MDC) packet: message modified or truncated.');
    const h = await pgpSha('SHA-1', dec.subarray(0, mdcStart + 2)); if (pgpHex(h) !== pgpHex(dec.subarray(mdcStart + 2))) throw new Error('Integrity (MDC) check failed: the message was modified.');
    inner = dec.subarray(18, mdcStart);
  }
  for (let depth = 0; depth < 4; depth++) {
    const ps = pgpPackets(inner); const lit = ps.find((p) => p.tag === 11), comp = ps.find((p) => p.tag === 8);
    if (lit) { const b = lit.body; const nl = b[1]; const name = new TextDecoder().decode(b.subarray(2, 2 + nl)); const data = b.subarray(2 + nl + 4); if (ps.some((p) => p.tag === 2 || p.tag === 4)) notes.push('The message carries a signature; it was not verified.'); return { data, name, notes, algo: sess.algo }; }
    if (comp) { const a = comp.body[0], d = comp.body.subarray(1); if (a === 0) inner = d; else if (a === 1) inner = await pgpInflate(d, 'deflate-raw'); else if (a === 2) inner = await pgpInflate(d, 'deflate'); else throw new Error('Compression algorithm ' + a + ' (BZip2) is not supported.'); continue; }
    throw new Error('No literal data packet inside the message.');
  }
  throw new Error('Nested compression too deep.');
}
function pgpKeyInfo(keys) { return keys.map((k) => `${k.isSub ? 'subkey ' : 'key    '} ${pgpHex(k.keyid).toUpperCase()} ${k.algo === 18 ? 'ECDH ' + (k.curve ? k.curve.name : '') : k.algo === 1 || k.algo === 2 ? 'RSA ' + (k.n ? Math.ceil(pgpBig(k.n).toString(2).length) : '') : 'algo ' + k.algo}${k.flags !== undefined ? ' flags=0x' + k.flags.toString(16) : ''}`).join('\n'); }
// ---- hand-written AES block cipher (needed for OCB, which also uses block decryption) ----
const PGP_SBOX = new Uint8Array(256), PGP_INV = new Uint8Array(256);
(() => { let p = 1, q = 1; do { p = p ^ ((p << 1) & 255) ^ (p & 0x80 ? 0x1b : 0); q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 255; if (q & 0x80) q ^= 0x09; const x = q ^ ((q << 1) | (q >> 7)) & 255 ^ ((q << 2) | (q >> 6)) & 255 ^ ((q << 3) | (q >> 5)) & 255 ^ ((q << 4) | (q >> 4)) & 255; PGP_SBOX[p] = (x ^ 0x63) & 255; } while (p !== 1); PGP_SBOX[0] = 0x63; for (let i = 0; i < 256; i++) PGP_INV[PGP_SBOX[i]] = i; })();
const pgpXt = (x) => ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 255;
const pgpMul = (a, b) => { let r = 0; while (b) { if (b & 1) r ^= a; a = pgpXt(a); b >>= 1; } return r; };
function pgpAesKey(key) {
  const nk = key.length / 4, nr = nk + 6, w = new Uint8Array(16 * (nr + 1)); w.set(key);
  for (let i = nk, rc = 1; i < 4 * (nr + 1); i++) { let t = w.slice(4 * i - 4, 4 * i); if (i % nk === 0) { t = Uint8Array.of(PGP_SBOX[t[1]] ^ rc, PGP_SBOX[t[2]], PGP_SBOX[t[3]], PGP_SBOX[t[0]]); rc = pgpXt(rc); } else if (nk > 6 && i % nk === 4) t = t.map((x) => PGP_SBOX[x]); for (let j = 0; j < 4; j++) w[4 * i + j] = w[4 * (i - nk) + j] ^ t[j]; }
  return { w, nr };
}
function pgpAesEnc(k, b) {
  const s = Uint8Array.from(b); const ark = (r) => { for (let i = 0; i < 16; i++) s[i] ^= k.w[16 * r + i]; }; ark(0);
  for (let r = 1; r <= k.nr; r++) {
    for (let i = 0; i < 16; i++) s[i] = PGP_SBOX[s[i]];
    const t = Uint8Array.from(s); for (let c = 0; c < 4; c++) for (let rw = 0; rw < 4; rw++) s[4 * c + rw] = t[4 * ((c + rw) % 4) + rw];
    if (r < k.nr) for (let c = 0; c < 4; c++) { const a = s.subarray(4 * c, 4 * c + 4), a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3]; a[0] = pgpXt(a0) ^ pgpXt(a1) ^ a1 ^ a2 ^ a3; a[1] = a0 ^ pgpXt(a1) ^ pgpXt(a2) ^ a2 ^ a3; a[2] = a0 ^ a1 ^ pgpXt(a2) ^ pgpXt(a3) ^ a3; a[3] = pgpXt(a0) ^ a0 ^ a1 ^ a2 ^ pgpXt(a3); }
    ark(r);
  }
  return s;
}
function pgpAesDec(k, b) {
  const s = Uint8Array.from(b); const ark = (r) => { for (let i = 0; i < 16; i++) s[i] ^= k.w[16 * r + i]; }; ark(k.nr);
  for (let r = k.nr - 1; r >= 0; r--) {
    const t = Uint8Array.from(s); for (let c = 0; c < 4; c++) for (let rw = 0; rw < 4; rw++) s[4 * ((c + rw) % 4) + rw] = t[4 * c + rw];
    for (let i = 0; i < 16; i++) s[i] = PGP_INV[s[i]];
    ark(r);
    if (r > 0) for (let c = 0; c < 4; c++) { const a0 = s[4 * c], a1 = s[4 * c + 1], a2 = s[4 * c + 2], a3 = s[4 * c + 3]; s[4 * c] = pgpMul(a0, 14) ^ pgpMul(a1, 11) ^ pgpMul(a2, 13) ^ pgpMul(a3, 9); s[4 * c + 1] = pgpMul(a0, 9) ^ pgpMul(a1, 14) ^ pgpMul(a2, 11) ^ pgpMul(a3, 13); s[4 * c + 2] = pgpMul(a0, 13) ^ pgpMul(a1, 9) ^ pgpMul(a2, 14) ^ pgpMul(a3, 11); s[4 * c + 3] = pgpMul(a0, 11) ^ pgpMul(a1, 13) ^ pgpMul(a2, 9) ^ pgpMul(a3, 14); }
  }
  return s;
}
// ---- AES-OCB (RFC 7253), 128-bit tag ----
function pgpOcb(key, nonce, data, ad, decrypt) { // data: plaintext, or ciphertext||tag when decrypting
  const K = pgpAesKey(key), E = (b) => pgpAesEnc(K, b), D = (b) => pgpAesDec(K, b);
  const dbl = (b) => { const o = new Uint8Array(16); for (let i = 0; i < 15; i++) o[i] = ((b[i] << 1) | (b[i + 1] >> 7)) & 255; o[15] = (b[15] << 1) & 255; if (b[0] & 0x80) o[15] ^= 0x87; return o; };
  const xor = (a, b) => a.map((x, i) => x ^ b[i]);
  const Ls = pgpAesEnc(K, new Uint8Array(16)), Ld = dbl(Ls); const L = [dbl(Ld)]; const getL = (i) => { while (L.length <= i) L.push(dbl(L[L.length - 1])); return L[i]; };
  const ntz = (i) => { let n = 0; while (!(i & 1)) { i >>= 1; n++; } return n; };
  const nb = new Uint8Array(16); nb.set(nonce, 16 - nonce.length); nb[15 - nonce.length] |= 1; const bottom = nb[15] & 63; const top = Uint8Array.from(nb); top[15] &= 0xc0;
  const Kt = E(top), st = new Uint8Array(24); st.set(Kt); for (let i = 0; i < 8; i++) st[16 + i] = Kt[i] ^ Kt[i + 1];
  let off = new Uint8Array(16); { const by = bottom >> 3, bi = bottom & 7; for (let i = 0; i < 16; i++) off[i] = ((st[i + by] << bi) | (bi ? st[i + by + 1] >> (8 - bi) : 0)) & 255; }
  let ct = data, tagIn = null; if (decrypt) { ct = data.subarray(0, data.length - 16); tagIn = data.subarray(data.length - 16); }
  const out = new Uint8Array(ct.length); let sum = new Uint8Array(16); const full = Math.floor(ct.length / 16);
  for (let i = 1; i <= full; i++) { off = xor(off, getL(ntz(i))); const blk = ct.subarray(16 * (i - 1), 16 * i); if (decrypt) { const p = xor(off, D(xor(blk, off))); out.set(p, 16 * (i - 1)); sum = xor(sum, p); } else { out.set(xor(off, E(xor(blk, off))), 16 * (i - 1)); sum = xor(sum, blk); } }
  const rem = ct.length - 16 * full;
  if (rem) { off = xor(off, Ls); const pad = E(off); const blk = ct.subarray(16 * full); const o = xor(blk, pad.subarray(0, rem)); out.set(o, 16 * full); const pl = decrypt ? o : blk; const padded = new Uint8Array(16); padded.set(pl); padded[rem] = 0x80; sum = xor(sum, padded); }
  let tag = E(xor(xor(sum, off), Ld));
  // HASH(K, A)
  let h = new Uint8Array(16), ho = new Uint8Array(16); const af = Math.floor(ad.length / 16);
  for (let i = 1; i <= af; i++) { ho = xor(ho, getL(ntz(i))); h = xor(h, E(xor(ad.subarray(16 * (i - 1), 16 * i), ho))); }
  const ar = ad.length - 16 * af; if (ar) { ho = xor(ho, Ls); const blk = new Uint8Array(16); blk.set(ad.subarray(16 * af)); blk[ar] = 0x80; h = xor(h, E(xor(blk, ho))); }
  tag = xor(tag, h);
  if (decrypt) { let d = 0; for (let i = 0; i < 16; i++) d |= tag[i] ^ tagIn[i]; if (d) throw new Error('Authentication failed: the message was modified or the key is wrong.'); return out; }
  return pgpCat(out, tag);
}
// LibrePGP / draft-4880bis AEAD packet (tag 20) with OCB
function pgpAeadDecrypt(body, sessionKey, sessAlgo) {
  if (body[0] !== 1) throw new Error('Unsupported AEAD packet version ' + body[0]); const cipher = body[1], aead = body[2], cbits = body[3];
  if (aead !== 2) throw new Error('Unsupported AEAD mode ' + aead + ' (only OCB is supported)'); if (cipher !== sessAlgo) throw new Error('AEAD cipher mismatch');
  const iv = body.subarray(4, 19), chunk = 2 ** (cbits + 6), data = body.subarray(19); const total = data.length;
  const out = []; let idx = 0, pos = 0, plainLen = 0;
  const nonceFor = (i) => { const n = Uint8Array.from(iv); for (let b = 0; b < 8; b++) n[14 - b] ^= Number((BigInt(i) >> BigInt(8 * b)) & 255n); return n; };
  const adFor = (i, extra) => pgpCat(Uint8Array.of(0xd4, 1, cipher, aead, cbits), pgpFromBig(BigInt(i), 8), extra || new Uint8Array(0));
  while (total - pos > 16 + 16) { const n = Math.min(chunk + 16, total - pos - 16); out.push(pgpOcb(sessionKey, nonceFor(idx), data.subarray(pos, pos + n), adFor(idx), true)); plainLen += n - 16; pos += n; idx++; }
  const rest = data.subarray(pos); if (rest.length < 32 && rest.length >= 16) { /* last data chunk (if any) then final tag */ }
  // remaining: optional last short chunk (ct+tag) followed by 16-byte final tag
  if (rest.length > 16 + 16 - 1 && rest.length - 16 >= 16) { const c = rest.subarray(0, rest.length - 16); out.push(pgpOcb(sessionKey, nonceFor(idx), c, adFor(idx), true)); plainLen += c.length - 16; idx++; }
  const fin = rest.subarray(rest.length - 16); pgpOcb(sessionKey, nonceFor(idx), fin, adFor(idx, pgpFromBig(BigInt(plainLen), 8)), true);
  return pgpCat(...out);
}

// Glyph metrics (width,height,depth in 1/1000 em of the 10pt design size) measured by running LaTeX (Computer Modern) with \setbox/\wd/\ht/\dp.
// Group suffix S / SS = script / scriptscript style. TXIC = italic corrections of math letters, TXOPIC = italic corrections of big operators.
const TXM = {"it":{"a":[529,431,0],"b":[429,694,0],"c":[433,431,0],"d":[520,694,0],"e":[466,431,0],"f":[597,694,194],"g":[513,431,194],"h":[576,694,0],"i":[344,660,0],"j":[469,660,194],"k":[552,694,0],"l":[318,694,0],"m":[878,431,0],"n":[600,431,0],"o":[485,431,0],"p":[503,431,194],"q":[482,431,194],"r":[479,431,0],"s":[469,431,0],"t":[361,615,0],"u":[572,431,0],"v":[521,431,0],"w":[743,431,0],"x":[572,431,0],"y":[526,431,194],"z":[509,431,0],"A":[750,683,0],"B":[809,683,0],"C":[786,683,0],"D":[856,683,0],"E":[796,683,0],"F":[782,683,0],"G":[786,683,0],"H":[912,683,0],"I":[518,683,0],"J":[651,683,0],"K":[921,683,0],"L":[681,683,0],"M":[1079,683,0],"N":[912,683,0],"O":[791,683,0],"P":[781,683,0],"Q":[791,683,194],"R":[767,683,0],"S":[671,683,0],"T":[723,683,0],"U":[792,683,0],"V":[806,683,0],"W":[1083,683,0],"X":[907,683,0],"Y":[803,683,0],"Z":[754,683,0]},"rm":{"0":[500,644,0],"1":[500,644,0],"2":[500,644,0],"3":[500,644,0],"4":[500,644,0],"5":[500,644,0],"6":[500,644,0],"7":[500,644,0],"8":[500,644,0],"9":[500,644,0]},"rmL":{"a":[500,431,0],"b":[556,694,0],"c":[444,431,0],"d":[556,694,0],"e":[444,431,0],"f":[306,694,0],"g":[500,431,194],"h":[556,694,0],"i":[278,668,0],"j":[306,668,194],"k":[528,694,0],"l":[278,694,0],"m":[833,431,0],"n":[556,431,0],"o":[500,431,0],"p":[556,431,194],"q":[528,431,194],"r":[392,431,0],"s":[394,431,0],"t":[389,615,0],"u":[556,431,0],"v":[528,431,0],"w":[722,431,0],"x":[528,431,0],"y":[528,431,194],"z":[444,431,0],"A":[750,683,0],"B":[708,683,0],"C":[722,683,0],"D":[764,683,0],"E":[681,683,0],"F":[653,683,0],"G":[785,683,0],"H":[750,683,0],"I":[361,683,0],"J":[514,683,0],"K":[778,683,0],"L":[625,683,0],"M":[917,683,0],"N":[750,683,0],"O":[778,683,0],"P":[681,683,0],"Q":[778,683,194],"R":[736,683,0],"S":[556,683,0],"T":[722,683,0],"U":[750,683,0],"V":[750,683,0],"W":[1028,683,0],"X":[750,683,0],"Y":[750,683,0],"Z":[611,683,0],"0":[500,644,0],"1":[500,644,0],"2":[500,644,0],"3":[500,644,0],"4":[500,644,0],"5":[500,644,0],"6":[500,644,0],"7":[500,644,0],"8":[500,644,0],"9":[500,644,0],",":[278,106,194],".":[278,106,0],";":[278,431,194],":":[278,431,0],"(":[389,750,250],")":[389,750,250],"[":[278,750,250],"]":[278,750,250],"!":[278,694,0],"?":[472,694,0],"+":[778,583,83],"=":[778,367,0],"/":[500,750,250],"-":[333,431,0],"'":[278,694,0]},"bf":{"a":[559,444,0],"b":[639,694,0],"c":[511,444,0],"d":[639,694,0],"e":[527,444,0],"f":[460,694,0],"g":[591,444,194],"h":[639,694,0],"i":[319,694,0],"j":[351,694,194],"k":[607,694,0],"l":[319,694,0],"m":[958,444,0],"n":[639,444,0],"o":[575,444,0],"p":[639,444,194],"q":[607,444,194],"r":[474,444,0],"s":[454,444,0],"t":[447,635,0],"u":[639,444,0],"v":[623,444,0],"w":[846,444,0],"x":[607,444,0],"y":[623,444,194],"z":[511,444,0],"A":[869,686,0],"B":[818,686,0],"C":[831,686,0],"D":[882,686,0],"E":[756,686,0],"F":[724,686,0],"G":[904,686,0],"H":[900,686,0],"I":[436,686,0],"J":[594,686,0],"K":[901,686,0],"L":[692,686,0],"M":[1092,686,0],"N":[900,686,0],"O":[864,686,0],"P":[786,686,0],"Q":[864,686,194],"R":[862,686,0],"S":[639,686,0],"T":[800,686,0],"U":[885,686,0],"V":[885,686,0],"W":[1205,686,0],"X":[869,686,0],"Y":[898,686,0],"Z":[703,686,0],"0":[575,644,0],"1":[575,644,0],"2":[575,644,0],"3":[575,644,0],"4":[575,644,0],"5":[575,644,0],"6":[575,644,0],"7":[575,644,0],"8":[575,644,0],"9":[575,644,0]},"sf":{"a":[481,444,0],"b":[517,694,0],"c":[444,444,0],"d":[517,694,0],"e":[444,444,0],"f":[375,694,0],"g":[514,444,194],"h":[517,694,0],"i":[239,679,0],"j":[267,679,194],"k":[489,694,0],"l":[239,694,0],"m":[794,444,0],"n":[517,444,0],"o":[500,444,0],"p":[517,444,194],"q":[517,444,194],"r":[356,444,0],"s":[383,444,0],"t":[361,571,0],"u":[517,444,0],"v":[475,444,0],"w":[697,444,0],"x":[461,444,0],"y":[475,444,194],"z":[435,444,0],"A":[667,694,0],"B":[667,694,0],"C":[639,694,0],"D":[722,694,0],"E":[597,694,0],"F":[569,694,0],"G":[667,694,0],"H":[708,694,0],"I":[278,694,0],"J":[472,694,0],"K":[694,694,0],"L":[542,694,0],"M":[875,694,0],"N":[708,694,0],"O":[736,694,0],"P":[639,694,0],"Q":[736,694,125],"R":[646,694,0],"S":[556,694,0],"T":[681,694,0],"U":[688,694,0],"V":[681,694,0],"W":[958,694,0],"X":[667,694,0],"Y":[692,694,0],"Z":[611,694,0]},"tt":{"a":[525,431,0],"b":[525,611,0],"c":[525,431,0],"d":[525,611,0],"e":[525,431,0],"f":[525,611,0],"g":[525,431,222],"h":[525,611,0],"i":[525,611,0],"j":[525,611,222],"k":[525,611,0],"l":[525,611,0],"m":[525,431,0],"n":[525,431,0],"o":[525,431,0],"p":[525,431,222],"q":[525,431,222],"r":[525,431,0],"s":[525,431,0],"t":[525,554,0],"u":[525,431,0],"v":[525,431,0],"w":[525,431,0],"x":[525,431,0],"y":[525,431,222],"z":[525,431,0],"A":[525,611,0],"B":[525,611,0],"C":[525,611,0],"D":[525,611,0],"E":[525,611,0],"F":[525,611,0],"G":[525,611,0],"H":[525,611,0],"I":[525,611,0],"J":[525,611,0],"K":[525,611,0],"L":[525,611,0],"M":[525,611,0],"N":[525,611,0],"O":[525,611,0],"P":[525,611,0],"Q":[525,611,139],"R":[525,611,0],"S":[525,611,0],"T":[525,611,0],"U":[525,611,0],"V":[525,611,0],"W":[525,611,0],"X":[525,611,0],"Y":[525,611,0],"Z":[525,611,0],"0":[525,611,0],"1":[525,611,0],"2":[525,611,0],"3":[525,611,0],"4":[525,611,0],"5":[525,611,0],"6":[525,611,0],"7":[525,611,0],"8":[525,611,0],"9":[525,611,0]},"itl":{"a":[588,431,0],"b":[523,694,0],"c":[516,431,0],"d":[614,694,0],"e":[535,431,0],"f":[519,694,194],"g":[548,431,194],"h":[588,694,0],"i":[409,655,0],"j":[451,655,194],"k":[568,694,0],"l":[359,694,0],"m":[894,431,0],"n":[639,431,0],"o":[574,431,0],"p":[574,431,194],"q":[548,431,194],"r":[529,431,0],"s":[491,431,0],"t":[427,615,0],"u":[613,431,0],"v":[568,431,0],"w":[772,431,0],"x":[584,431,0],"y":[574,431,194],"z":[532,431,0],"A":[743,683,0],"B":[806,683,0],"C":[861,683,0],"D":[849,683,0],"E":[799,683,0],"F":[786,683,0],"G":[861,683,0],"H":[907,683,0],"I":[544,683,0],"J":[665,683,0],"K":[914,683,0],"L":[627,683,0],"M":[1060,683,0],"N":[907,683,0],"O":[861,683,0],"P":[781,683,0],"Q":[861,683,194],"R":[768,683,0],"S":[682,683,0],"T":[849,683,0],"U":[907,683,0],"V":[927,683,0],"W":[1182,683,0],"X":[901,683,0],"Y":[937,683,0],"Z":[759,683,0]},"bb":{"A":[722,689,0],"B":[667,689,0],"C":[722,689,0],"D":[722,689,0],"E":[667,689,0],"F":[611,689,0],"G":[778,689,0],"H":[778,689,0],"I":[389,689,0],"J":[500,689,167],"K":[778,689,0],"L":[667,689,0],"M":[944,689,0],"N":[722,689,0],"O":[778,689,167],"P":[611,689,0],"Q":[778,689,167],"R":[722,689,0],"S":[556,689,0],"T":[667,689,0],"U":[722,689,0],"V":[722,689,0],"W":[1000,689,0],"X":[722,689,0],"Y":[722,689,0],"Z":[667,689,0]},"cal":{"A":[798,683,0],"B":[687,683,0],"C":[585,683,0],"D":[799,683,0],"E":[617,683,0],"F":[818,683,0],"G":[654,683,97],"H":[854,683,0],"I":[618,683,0],"J":[862,683,97],"K":[776,683,0],"L":[690,683,0],"M":[1201,683,0],"N":[968,683,0],"O":[824,683,0],"P":[778,683,0],"Q":[817,683,97],"R":[848,683,0],"S":[681,683,0],"T":[799,683,0],"U":[725,683,0],"V":[695,683,0],"W":[1070,683,0],"X":[860,683,0],"Y":[751,683,97],"Z":[804,683,0]},"p":{"(":[389,750,250],")":[389,750,250],"[":[278,750,250],"]":[278,750,250],"+":[778,583,83],"=":[778,367,0],"<":[778,539,39],">":[778,539,39],"/":[500,750,250],"|":[278,750,250],"!":[278,694,0],"?":[472,694,0],",":[278,106,194],".":[278,106,0],":":[278,431,0],";":[278,431,194],"'":[281,752,0],"-":[778,583,83],"*":[500,465,0],"minus":[778,583,83],"comma":[278,106,194],"semi":[278,431,194]},"c":{"alpha":[643,431,0],"beta":[618,694,194],"gamma":[573,431,194],"delta":[482,694,0],"epsilon":[406,431,0],"zeta":[511,694,194],"eta":[532,431,194],"theta":[497,694,0],"iota":[354,431,0],"kappa":[576,431,0],"lambda":[583,694,0],"mu":[602,431,194],"nu":[558,431,0],"xi":[484,694,194],"pi":[606,431,0],"rho":[517,431,194],"sigma":[607,431,0],"tau":[550,431,0],"upsilon":[576,431,0],"phi":[596,694,194],"chi":[626,431,194],"psi":[687,694,194],"omega":[658,431,0],"varepsilon":[466,431,0],"vartheta":[591,694,0],"varpi":[856,431,0],"varrho":[517,431,194],"varsigma":[443,431,97],"varphi":[654,431,194],"Gamma":[625,683,0],"Delta":[833,683,0],"Theta":[778,683,0],"Lambda":[694,683,0],"Xi":[667,683,0],"Pi":[750,683,0],"Sigma":[722,683,0],"Upsilon":[778,683,0],"Phi":[722,683,0],"Psi":[778,683,0],"Omega":[722,683,0],"pm":[778,583,83],"mp":[778,583,83],"times":[778,583,83],"div":[778,583,83],"cdot":[278,444,0],"ast":[500,465,0],"star":[500,465,0],"circ":[500,444,0],"bullet":[500,444,0],"cap":[667,556,0],"cup":[667,556,0],"uplus":[667,556,0],"sqcap":[667,556,0],"sqcup":[667,556,0],"vee":[667,556,0],"wedge":[667,556,0],"setminus":[500,750,250],"wr":[278,694,194],"diamond":[500,444,0],"oplus":[778,583,83],"ominus":[778,583,83],"otimes":[778,583,83],"oslash":[778,583,83],"odot":[778,583,83],"leq":[778,636,136],"geq":[778,636,136],"equiv":[778,464,0],"subset":[778,539,39],"supset":[778,539,39],"approx":[778,483,0],"subseteq":[778,636,136],"supseteq":[778,636,136],"ll":[1000,539,39],"gg":[1000,539,39],"prec":[778,539,39],"succ":[778,539,39],"sim":[778,367,0],"simeq":[778,464,0],"preceq":[778,636,136],"succeq":[778,636,136],"propto":[778,431,0],"perp":[778,694,0],"mid":[278,750,250],"parallel":[500,750,250],"neq":[778,694,194],"ne":[778,694,194],"in":[667,539,39],"ni":[667,539,39],"notin":[667,750,39],"leftarrow":[1000,367,0],"rightarrow":[1000,367,0],"leftrightarrow":[1000,367,0],"Leftarrow":[1000,367,0],"Rightarrow":[1000,367,0],"Leftrightarrow":[1000,367,0],"mapsto":[1000,367,0],"uparrow":[500,694,194],"downarrow":[500,694,194],"longrightarrow":[1611,367,0],"longleftarrow":[1611,367,0],"nearrow":[1000,694,194],"searrow":[1000,694,194],"aleph":[611,694,0],"hbar":[540,689,0],"imath":[322,431,0],"jmath":[384,431,194],"ell":[417,694,0],"wp":[636,431,194],"Re":[722,694,0],"Im":[722,694,0],"partial":[586,694,0],"infty":[1000,431,0],"nabla":[833,683,0],"forall":[556,694,0],"exists":[556,694,0],"neg":[667,431,0],"emptyset":[500,750,56],"prime":[275,556,0],"angle":[722,692,0],"triangle":[889,694,194],"top":[778,694,0],"bot":[778,694,0],"ldots":[1167,106,0],"cdots":[1333,444,0],"vdots":[278,1506,0],"ddots":[1167,1506,0],"dots":[1333,106,0],"surd":[833,750,250],"lfloor":[444,750,250],"rfloor":[444,750,250],"lceil":[444,750,250],"rceil":[444,750,250],"langle":[389,750,250],"rangle":[389,750,250],"backslash":[500,750,250],"vert":[278,750,250],"Vert":[500,750,250],"lbrace":[500,750,250],"rbrace":[500,750,250],"to":[1000,367,0],"gets":[1000,367,0],"iff":[2389,367,0],"implies":[2167,367,0],"land":[667,556,0],"lor":[667,556,0],"lnot":[667,431,0],"nmid":[278,741,251],"subsetneq":[778,636,136],"supsetneq":[778,636,136],"nsubseteq":[778,794,303],"leqslant":[778,637,137],"geqslant":[778,637,137],"lesssim":[778,730,230],"gtrsim":[778,730,230],"therefore":[667,692,0],"because":[667,692,0],"square":[778,675,0],"checkmark":[833,692,0],"amalg":[750,683,0],"dagger":[444,694,194],"ddagger":[444,694,194],"S":[444,694,194],"P":[611,694,194],"hookrightarrow":[1111,464,0],"Longrightarrow":[1611,367,0],"Longleftarrow":[1611,367,0],"Longleftrightarrow":[1833,367,0],"sum":[1056,750,250],"prod":[944,750,250],"coprod":[944,750,250],"int":[667,806,306],"oint":[667,806,306],"bigcup":[833,750,250],"bigcap":[833,750,250],"bigvee":[833,750,250],"bigwedge":[833,750,250],"bigoplus":[1111,750,250],"bigotimes":[1111,750,250],"bigodot":[1111,750,250],"biguplus":[833,750,250],"bigsqcup":[833,750,250],"iint":[1167,806,306],"iiint":[1667,806,306]},"cd":{"sum":[1444,1050,550],"prod":[1278,1050,550],"coprod":[1278,1050,550],"int":[1000,1361,861],"oint":[1000,1361,861],"bigcup":[1111,1050,550],"bigcap":[1111,1050,550],"bigvee":[1111,1050,550],"bigwedge":[1111,1050,550],"bigoplus":[1511,1050,550],"bigotimes":[1511,1050,550],"bigodot":[1511,1050,550],"biguplus":[1111,1050,550],"bigsqcup":[1111,1050,550],"iint":[1667,1361,861],"iiint":[2333,1361,861]},"itS":{"a":[434,301,0],"b":[352,486,0],"c":[357,301,0],"d":[416,486,0],"e":[379,301,0],"f":[468,486,136],"g":[415,301,136],"h":[468,486,0],"i":[283,463,0],"j":[371,463,136],"k":[442,486,0],"l":[257,486,0],"m":[710,301,0],"n":[494,301,0],"o":[395,301,0],"p":[412,301,136],"q":[392,301,136],"r":[393,301,0],"s":[377,301,0],"t":[302,431,0],"u":[473,301,0],"v":[425,301,0],"w":[597,301,0],"x":[454,301,0],"y":[431,301,136],"z":[411,301,0],"A":[601,478,0],"B":[638,478,0],"C":[623,478,0],"D":[675,478,0],"E":[626,478,0],"F":[615,478,0],"G":[623,478,0],"H":[708,478,0],"I":[409,478,0],"J":[508,478,0],"K":[721,478,0],"L":[549,478,0],"M":[838,478,0],"N":[708,478,0],"O":[630,478,0],"P":[617,478,0],"Q":[630,478,136],"R":[606,478,0],"S":[529,478,0],"T":[580,478,0],"U":[620,478,0],"V":[644,478,0],"W":[860,478,0],"X":[710,478,0],"Y":[642,478,0],"Z":[594,478,0]},"rmS":{"0":[399,451,0],"1":[399,451,0],"2":[399,451,0],"3":[399,451,0],"4":[399,451,0],"5":[399,451,0],"6":[399,451,0],"7":[399,451,0],"8":[399,451,0],"9":[399,451,0]},"rmLS":{"a":[399,301,0],"b":[442,486,0],"c":[356,301,0],"d":[442,486,0],"e":[356,301,0],"f":[248,486,0],"g":[399,301,136],"h":[442,486,0],"i":[226,471,0],"j":[248,471,136],"k":[420,486,0],"l":[226,486,0],"m":[657,301,0],"n":[442,301,0],"o":[399,301,0],"p":[442,301,136],"q":[420,301,136],"r":[312,301,0],"s":[317,301,0],"t":[312,431,0],"u":[442,301,0],"v":[420,301,0],"w":[571,301,0],"x":[420,301,0],"y":[420,301,136],"z":[356,301,0],"A":[590,478,0],"B":[559,478,0],"C":[571,478,0],"D":[602,478,0],"E":[538,478,0],"F":[516,478,0],"G":[619,478,0],"H":[590,478,0],"I":[289,478,0],"J":[408,478,0],"K":[612,478,0],"L":[494,478,0],"M":[719,478,0],"N":[590,478,0],"O":[614,478,0],"P":[538,478,0],"Q":[614,478,136],"R":[581,478,0],"S":[442,478,0],"T":[571,478,0],"U":[590,478,0],"V":[590,478,0],"W":[806,478,0],"X":[590,478,0],"Y":[590,478,0],"Z":[485,478,0],"0":[399,451,0],"1":[399,451,0],"2":[399,451,0],"3":[399,451,0],"4":[399,451,0],"5":[399,451,0],"6":[399,451,0],"7":[399,451,0],"8":[399,451,0],"9":[399,451,0],",":[226,81,136],".":[226,81,0],";":[226,301,136],":":[226,301,0],"(":[312,525,175],")":[312,525,175],"[":[226,525,175],"]":[226,525,175],"!":[226,486,0],"?":[377,486,0],"+":[614,433,83],"=":[614,269,0],"/":[399,525,175],"-":[269,301,0],"'":[226,486,0]},"bfS":{"a":[441,311,0],"b":[503,486,0],"c":[403,311,0],"d":[503,486,0],"e":[415,311,0],"f":[364,486,0],"g":[466,311,136],"h":[503,486,0],"i":[254,486,0],"j":[279,486,136],"k":[478,486,0],"l":[254,486,0],"m":[751,311,0],"n":[503,311,0],"o":[453,311,0],"p":[503,311,136],"q":[478,311,136],"r":[374,311,0],"s":[359,311,0],"t":[354,444,0],"u":[503,311,0],"v":[490,311,0],"w":[664,311,0],"x":[478,311,0],"y":[490,311,136],"z":[403,311,0],"A":[678,480,0],"B":[640,480,0],"C":[652,480,0],"D":[690,480,0],"E":[591,480,0],"F":[566,480,0],"G":[708,480,0],"H":[701,480,0],"I":[336,480,0],"J":[466,480,0],"K":[702,480,0],"L":[541,480,0],"M":[851,480,0],"N":[701,480,0],"O":[678,480,0],"P":[615,480,0],"Q":[678,480,136],"R":[672,480,0],"S":[503,480,0],"T":[628,480,0],"U":[689,480,0],"V":[690,480,0],"W":[938,480,0],"X":[678,480,0],"Y":[700,480,0],"Z":[552,480,0],"0":[453,451,0],"1":[453,451,0],"2":[453,451,0],"3":[453,451,0],"4":[453,451,0],"5":[453,451,0],"6":[453,451,0],"7":[453,451,0],"8":[453,451,0],"9":[453,451,0]},"sfS":{"a":[357,311,0],"b":[384,486,0],"c":[331,311,0],"d":[384,486,0],"e":[331,311,0],"f":[279,486,0],"g":[382,311,136],"h":[384,486,0],"i":[177,480,0],"j":[198,480,136],"k":[363,486,0],"l":[177,486,0],"m":[591,311,0],"n":[384,311,0],"o":[372,311,0],"p":[384,311,136],"q":[384,311,136],"r":[264,311,0],"s":[285,311,0],"t":[269,400,0],"u":[384,311,0],"v":[353,311,0],"w":[518,311,0],"x":[343,311,0],"y":[353,311,136],"z":[323,311,0],"A":[496,486,0],"B":[496,486,0],"C":[475,486,0],"D":[537,486,0],"E":[446,486,0],"F":[425,486,0],"G":[496,486,0],"H":[525,486,0],"I":[207,486,0],"J":[351,486,0],"K":[516,486,0],"L":[405,486,0],"M":[649,486,0],"N":[525,486,0],"O":[549,486,0],"P":[475,486,0],"Q":[549,486,90],"R":[481,486,0],"S":[413,486,0],"T":[508,486,0],"U":[510,486,0],"V":[506,486,0],"W":[713,486,0],"X":[496,486,0],"Y":[514,486,0],"Z":[454,486,0]},"ttS":{"a":[372,301,0],"b":[372,428,0],"c":[372,301,0],"d":[372,428,0],"e":[372,301,0],"f":[372,428,0],"g":[372,301,156],"h":[372,428,0],"i":[372,428,0],"j":[372,428,156],"k":[372,428,0],"l":[372,428,0],"m":[372,301,0],"n":[372,301,0],"o":[372,301,0],"p":[372,301,156],"q":[372,301,156],"r":[372,301,0],"s":[372,301,0],"t":[372,388,0],"u":[372,301,0],"v":[372,301,0],"w":[372,301,0],"x":[372,301,0],"y":[372,301,156],"z":[372,301,0],"A":[372,428,0],"B":[372,428,0],"C":[372,428,0],"D":[372,428,0],"E":[372,428,0],"F":[372,428,0],"G":[372,428,0],"H":[372,428,0],"I":[372,428,0],"J":[372,428,0],"K":[372,428,0],"L":[372,428,0],"M":[372,428,0],"N":[372,428,0],"O":[372,428,0],"P":[372,428,0],"Q":[372,428,97],"R":[372,428,0],"S":[372,428,0],"T":[372,428,0],"U":[372,428,0],"V":[372,428,0],"W":[372,428,0],"X":[372,428,0],"Y":[372,428,0],"Z":[372,428,0],"0":[372,428,0],"1":[372,428,0],"2":[372,428,0],"3":[372,428,0],"4":[372,428,0],"5":[372,428,0],"6":[372,428,0],"7":[372,428,0],"8":[372,428,0],"9":[372,428,0]},"itlS":{"a":[482,301,0],"b":[423,486,0],"c":[415,301,0],"d":[487,486,0],"e":[432,301,0],"f":[410,486,136],"g":[441,301,136],"h":[482,486,0],"i":[320,460,0],"j":[357,460,136],"k":[456,486,0],"l":[282,486,0],"m":[729,301,0],"n":[524,301,0],"o":[464,301,0],"p":[464,301,136],"q":[441,301,136],"r":[426,301,0],"s":[395,301,0],"t":[343,431,0],"u":[503,301,0],"v":[456,301,0],"w":[621,301,0],"x":[467,301,0],"y":[462,301,136],"z":[430,301,0],"A":[606,475,0],"B":[645,475,0],"C":[686,475,0],"D":[680,475,0],"E":[634,475,0],"F":[624,475,0],"G":[686,475,0],"H":[710,475,0],"I":[428,475,0],"J":[519,475,0],"K":[726,475,0],"L":[514,475,0],"M":[833,475,0],"N":[710,475,0],"O":[691,475,0],"P":[624,475,0],"Q":[691,475,136],"R":[614,475,0],"S":[542,475,0],"T":[675,475,0],"U":[710,475,0],"V":[736,475,0],"W":[942,475,0],"X":[715,475,0],"Y":[744,475,0],"Z":[604,475,0]},"bbS":{"A":[506,482,0],"B":[467,482,0],"C":[506,482,0],"D":[506,482,0],"E":[467,482,0],"F":[428,482,0],"G":[544,482,0],"H":[544,482,0],"I":[272,482,0],"J":[350,482,117],"K":[544,482,0],"L":[467,482,0],"M":[661,482,0],"N":[506,482,0],"O":[544,482,117],"P":[428,482,0],"Q":[544,482,117],"R":[506,482,0],"S":[389,482,0],"T":[467,482,0],"U":[506,482,0],"V":[506,482,0],"W":[700,482,0],"X":[506,482,0],"Y":[506,482,0],"Z":[467,482,0]},"calS":{"A":[642,478,0],"B":[545,478,0],"C":[469,478,0],"D":[644,478,0],"E":[490,478,0],"F":[643,478,0],"G":[522,478,68],"H":[685,478,0],"I":[498,478,0],"J":[678,478,68],"K":[611,478,0],"L":[554,478,0],"M":[940,478,0],"N":[760,478,0],"O":[656,478,0],"P":[625,478,0],"Q":[655,478,68],"R":[687,478,0],"S":[542,478,0],"T":[638,478,0],"U":[573,478,0],"V":[562,478,0],"W":[853,478,0],"X":[676,478,0],"Y":[594,478,68],"Z":[633,478,0]},"pS":{"(":[312,525,175],")":[312,525,175],"[":[226,525,175],"]":[226,525,175],"+":[614,433,83],"=":[614,269,0],"<":[625,403,53],">":[625,403,53],"/":[410,525,175],"|":[238,525,175],"!":[226,486,0],"?":[377,486,0],",":[238,81,136],".":[238,81,0],":":[226,301,0],";":[226,301,136],"'":[270,580,0],"-":[625,433,83],"*":[410,326,0],"minus":[625,433,83],"comma":[238,81,136],"semi":[226,301,136]},"cS":{"alpha":[520,301,0],"beta":[489,486,136],"gamma":[463,301,136],"delta":[389,486,0],"epsilon":[333,301,0],"zeta":[409,486,136],"eta":[437,301,136],"theta":[402,486,0],"iota":[296,301,0],"kappa":[468,301,0],"lambda":[474,486,0],"mu":[486,301,136],"nu":[448,301,0],"xi":[388,486,136],"pi":[493,301,0],"rho":[415,301,136],"sigma":[488,301,0],"tau":[450,301,0],"upsilon":[468,301,0],"phi":[481,486,136],"chi":[500,301,136],"psi":[554,486,136],"omega":[529,301,0],"varepsilon":[378,301,0],"vartheta":[483,486,0],"varpi":[686,301,0],"varrho":[415,301,136],"varsigma":[361,301,68],"varphi":[526,301,136],"Gamma":[494,478,0],"Delta":[657,478,0],"Theta":[614,478,0],"Lambda":[547,478,0],"Xi":[528,478,0],"Pi":[590,478,0],"Sigma":[571,478,0],"Upsilon":[614,478,0],"Phi":[571,478,0],"Psi":[614,478,0],"Omega":[571,478,0],"pm":[625,433,83],"mp":[625,433,83],"times":[625,433,83],"div":[625,433,83],"cdot":[238,326,0],"ast":[410,326,0],"star":[410,326,0],"circ":[410,326,0],"bullet":[410,326,0],"cap":[539,389,0],"cup":[539,389,0],"uplus":[539,389,0],"sqcap":[539,389,0],"sqcup":[539,389,0],"vee":[539,389,0],"wedge":[539,389,0],"setminus":[410,525,175],"wr":[238,486,136],"diamond":[410,326,0],"oplus":[625,433,83],"ominus":[625,433,83],"otimes":[625,433,83],"oslash":[625,433,83],"odot":[625,433,83],"leq":[625,480,130],"geq":[625,480,130],"equiv":[625,346,0],"subset":[625,403,53],"supset":[625,403,53],"approx":[625,361,11],"subseteq":[625,480,130],"supseteq":[625,480,130],"ll":[797,403,53],"gg":[797,403,53],"prec":[625,403,53],"succ":[625,403,53],"sim":[625,269,0],"simeq":[625,346,0],"preceq":[625,480,130],"succeq":[625,480,130],"propto":[625,301,0],"perp":[625,486,0],"mid":[238,525,175],"parallel":[410,525,175],"neq":[614,486,136],"ne":[614,486,136],"in":[539,403,53],"ni":[539,403,53],"notin":[539,525,53],"leftarrow":[797,269,0],"rightarrow":[797,269,0],"leftrightarrow":[797,269,0],"Leftarrow":[797,269,0],"Rightarrow":[797,269,0],"Leftrightarrow":[797,269,0],"mapsto":[797,269,0],"uparrow":[410,486,136],"downarrow":[410,486,136],"longrightarrow":[1286,269,0],"longleftarrow":[1286,269,0],"nearrow":[797,486,136],"searrow":[797,486,136],"aleph":[496,486,0],"hbar":[443,482,0],"imath":[279,301,0],"jmath":[309,301,136],"ell":[335,486,0],"wp":[511,301,136],"Re":[582,486,0],"Im":[582,486,0],"partial":[470,486,0],"infty":[797,301,0],"nabla":[668,478,0],"forall":[453,486,0],"exists":[453,486,0],"neg":[539,301,0],"emptyset":[410,525,39],"prime":[231,389,0],"angle":[582,482,0],"triangle":[711,486,136],"top":[625,486,0],"bot":[625,486,0],"ldots":[712,81,0],"cdots":[849,326,0],"vdots":[278,1506,0],"ddots":[1106,1506,0],"dots":[849,81,0],"surd":[657,525,175],"lfloor":[367,525,175],"rfloor":[367,525,175],"lceil":[367,525,175],"rceil":[367,525,175],"langle":[324,525,175],"rangle":[324,525,175],"backslash":[410,525,175],"vert":[238,525,175],"Vert":[410,525,175],"lbrace":[410,525,175],"rbrace":[410,525,175],"to":[797,269,0],"gets":[797,269,0],"iff":[1913,269,0],"implies":[1730,269,0],"land":[539,389,0],"lor":[539,389,0],"lnot":[539,301,0],"nmid":[238,529,179],"subsetneq":[625,482,133],"supsetneq":[625,482,133],"nsubseteq":[625,610,260],"leqslant":[625,482,133],"geqslant":[625,482,133],"lesssim":[625,550,195],"gtrsim":[625,550,204],"therefore":[539,482,0],"because":[539,482,0],"square":[625,521,0],"checkmark":[668,482,0],"amalg":[601,478,0],"dagger":[367,486,136],"ddagger":[367,486,136],"S":[367,486,136],"P":[496,486,136],"hookrightarrow":[898,346,0],"Longrightarrow":[1274,269,0],"Longleftarrow":[1274,269,0],"Longleftrightarrow":[1458,269,0],"sum":[840,525,175],"prod":[754,525,175],"coprod":[754,525,175],"int":[539,564,214],"oint":[539,564,214],"bigcup":[668,525,175],"bigcap":[668,525,175],"bigvee":[668,525,175],"bigwedge":[668,525,175],"bigoplus":[883,525,175],"bigotimes":[883,525,175],"bigodot":[883,525,175],"biguplus":[668,525,175],"bigsqcup":[668,525,175],"iint":[941,564,214],"iiint":[1344,564,214]},"itSS":{"a":[387,215,0],"b":[317,347,0],"c":[325,215,0],"d":[370,347,0],"e":[338,215,0],"f":[401,347,97],"g":[368,215,97],"h":[414,347,0],"i":[267,333,0],"j":[324,333,97],"k":[387,347,0],"l":[240,347,0],"m":[614,215,0],"n":[440,215,0],"o":[351,215,0],"p":[370,215,97],"q":[347,215,97],"r":[353,215,0],"s":[335,215,0],"t":[282,308,0],"u":[423,215,0],"v":[379,215,0],"w":[518,215,0],"x":[396,215,0],"y":[383,215,97],"z":[363,215,0],"A":[518,342,0],"B":[542,342,0],"C":[532,342,0],"D":[572,342,0],"E":[529,342,0],"F":[520,342,0],"G":[532,342,0],"H":[592,342,0],"I":[352,342,0],"J":[434,342,0],"K":[604,342,0],"L":[478,342,0],"M":[696,342,0],"N":[592,342,0],"O":[541,342,0],"P":[524,342,0],"Q":[541,342,97],"R":[516,342,0],"S":[454,342,0],"T":[503,342,0],"U":[526,342,0],"V":[553,342,0],"W":[726,342,0],"X":[595,342,0],"Y":[551,342,0],"Z":[506,342,0]},"rmSS":{"0":[340,322,0],"1":[340,322,0],"2":[340,322,0],"3":[340,322,0],"4":[340,322,0],"5":[340,322,0],"6":[340,322,0],"7":[340,322,0],"8":[340,322,0],"9":[340,322,0]},"rmLSS":{"a":[340,215,0],"b":[375,347,0],"c":[306,215,0],"d":[375,347,0],"e":[306,215,0],"f":[219,347,0],"g":[340,215,97],"h":[375,347,0],"i":[201,340,0],"j":[219,340,97],"k":[358,347,0],"l":[201,347,0],"m":[549,215,0],"n":[375,215,0],"o":[340,215,0],"p":[375,215,97],"q":[358,215,97],"r":[271,215,0],"s":[274,215,0],"t":[271,308,0],"u":[375,215,0],"v":[358,215,0],"w":[479,215,0],"x":[358,215,0],"y":[358,215,97],"z":[306,215,0],"A":[490,340,0],"B":[467,340,0],"C":[479,340,0],"D":[502,340,0],"E":[450,340,0],"F":[433,340,0],"G":[517,340,0],"H":[490,340,0],"I":[247,340,0],"J":[346,340,0],"K":[508,340,0],"L":[415,340,0],"M":[594,340,0],"N":[490,340,0],"O":[514,340,0],"P":[450,340,0],"Q":[514,340,97],"R":[485,340,0],"S":[375,340,0],"T":[479,340,0],"U":[490,340,0],"V":[490,340,0],"W":[664,340,0],"X":[490,340,0],"Y":[490,340,0],"Z":[410,340,0],"0":[340,322,0],"1":[340,322,0],"2":[340,322,0],"3":[340,322,0],"4":[340,322,0],"5":[340,322,0],"6":[340,322,0],"7":[340,322,0],"8":[340,322,0],"9":[340,322,0],",":[201,61,97],".":[201,61,0],";":[201,215,97],":":[201,215,0],"(":[271,375,125],")":[271,375,125],"[":[201,375,125],"]":[201,375,125],"!":[201,347,0],"?":[323,347,0],"+":[514,333,83],"=":[514,198,0],"/":[340,375,125],"-":[236,215,0],"'":[201,347,0]},"bfSS":{"a":[369,222,0],"b":[419,347,0],"c":[339,222,0],"d":[419,347,0],"e":[346,222,0],"f":[303,347,0],"g":[389,222,97],"h":[419,347,0],"i":[218,347,0],"j":[238,347,97],"k":[399,347,0],"l":[218,347,0],"m":[621,222,0],"n":[419,222,0],"o":[379,222,0],"p":[419,222,97],"q":[399,222,97],"r":[311,222,0],"s":[303,222,0],"t":[299,318,0],"u":[419,222,0],"v":[409,222,0],"w":[550,222,0],"x":[399,222,0],"y":[409,222,97],"z":[339,222,0],"A":[557,343,0],"B":[528,343,0],"C":[540,343,0],"D":[569,343,0],"E":[489,343,0],"F":[469,343,0],"G":[585,343,0],"H":[576,343,0],"I":[275,343,0],"J":[388,343,0],"K":[577,343,0],"L":[449,343,0],"M":[697,343,0],"N":[576,343,0],"O":[561,343,0],"P":[508,343,0],"Q":[561,343,97],"R":[551,343,0],"S":[419,343,0],"T":[521,343,0],"U":[567,343,0],"V":[567,343,0],"W":[768,343,0],"X":[557,343,0],"Y":[575,343,0],"Z":[460,343,0],"0":[379,322,0],"1":[379,322,0],"2":[379,322,0],"3":[379,322,0],"4":[379,322,0],"5":[379,322,0],"6":[379,322,0],"7":[379,322,0],"8":[379,322,0],"9":[379,322,0]},"sfSS":{"a":[255,222,0],"b":[274,347,0],"c":[236,222,0],"d":[274,347,0],"e":[236,222,0],"f":[199,347,0],"g":[273,222,97],"h":[274,347,0],"i":[127,343,0],"j":[142,343,97],"k":[260,347,0],"l":[127,347,0],"m":[422,222,0],"n":[274,222,0],"o":[266,222,0],"p":[274,222,97],"q":[274,222,97],"r":[189,222,0],"s":[204,222,0],"t":[192,286,0],"u":[274,222,0],"v":[252,222,0],"w":[370,222,0],"x":[245,222,0],"y":[252,222,97],"z":[231,222,0],"A":[354,347,0],"B":[354,347,0],"C":[339,347,0],"D":[384,347,0],"E":[319,347,0],"F":[304,347,0],"G":[354,347,0],"H":[375,347,0],"I":[148,347,0],"J":[251,347,0],"K":[369,347,0],"L":[289,347,0],"M":[464,347,0],"N":[375,347,0],"O":[392,347,0],"P":[339,347,0],"Q":[392,347,64],"R":[344,347,0],"S":[295,347,0],"T":[363,347,0],"U":[365,347,0],"V":[362,347,0],"W":[509,347,0],"X":[354,347,0],"Y":[368,347,0],"Z":[325,347,0]},"ttSS":{"a":[266,215,0],"b":[266,306,0],"c":[266,215,0],"d":[266,306,0],"e":[266,215,0],"f":[266,306,0],"g":[266,215,111],"h":[266,306,0],"i":[266,306,0],"j":[266,306,111],"k":[266,306,0],"l":[266,306,0],"m":[266,215,0],"n":[266,215,0],"o":[266,215,0],"p":[266,215,111],"q":[266,215,111],"r":[266,215,0],"s":[266,215,0],"t":[266,277,0],"u":[266,215,0],"v":[266,215,0],"w":[266,215,0],"x":[266,215,0],"y":[266,215,111],"z":[266,215,0],"A":[266,306,0],"B":[266,306,0],"C":[266,306,0],"D":[266,306,0],"E":[266,306,0],"F":[266,306,0],"G":[266,306,0],"H":[266,306,0],"I":[266,306,0],"J":[266,306,0],"K":[266,306,0],"L":[266,306,0],"M":[266,306,0],"N":[266,306,0],"O":[266,306,0],"P":[266,306,0],"Q":[266,306,69],"R":[266,306,0],"S":[266,306,0],"T":[266,306,0],"U":[266,306,0],"V":[266,306,0],"W":[266,306,0],"X":[266,306,0],"Y":[266,306,0],"Z":[266,306,0],"0":[266,306,0],"1":[266,306,0],"2":[266,306,0],"3":[266,306,0],"4":[266,306,0],"5":[266,306,0],"6":[266,306,0],"7":[266,306,0],"8":[266,306,0],"9":[266,306,0]},"itlSS":{"a":[345,215,0],"b":[302,347,0],"c":[297,215,0],"d":[348,347,0],"e":[309,215,0],"f":[293,347,97],"g":[315,215,97],"h":[345,347,0],"i":[228,328,0],"j":[255,328,97],"k":[326,347,0],"l":[201,347,0],"m":[521,215,0],"n":[374,215,0],"o":[331,215,0],"p":[331,215,97],"q":[315,215,97],"r":[304,215,0],"s":[282,215,0],"t":[245,308,0],"u":[359,215,0],"v":[326,215,0],"w":[444,215,0],"x":[333,215,0],"y":[330,215,97],"z":[307,215,0],"A":[433,339,0],"B":[461,339,0],"C":[490,339,0],"D":[486,339,0],"E":[453,339,0],"F":[445,339,0],"G":[490,339,0],"H":[507,339,0],"I":[306,339,0],"J":[371,339,0],"K":[518,339,0],"L":[367,339,0],"M":[595,339,0],"N":[507,339,0],"O":[494,339,0],"P":[446,339,0],"Q":[494,339,97],"R":[439,339,0],"S":[387,339,0],"T":[482,339,0],"U":[507,339,0],"V":[526,339,0],"W":[672,339,0],"X":[511,339,0],"Y":[532,339,0],"Z":[431,339,0]},"bbSS":{"A":[361,344,0],"B":[333,344,0],"C":[361,344,0],"D":[361,344,0],"E":[333,344,0],"F":[306,344,0],"G":[389,344,0],"H":[389,344,0],"I":[194,344,0],"J":[250,344,81],"K":[389,344,0],"L":[333,344,0],"M":[472,344,0],"N":[361,344,0],"O":[389,344,81],"P":[306,344,0],"Q":[389,344,81],"R":[361,344,0],"S":[278,344,0],"T":[333,344,0],"U":[361,344,0],"V":[361,344,0],"W":[500,344,0],"X":[361,344,0],"Y":[361,344,0],"Z":[333,344,0]},"calSS":{"A":[557,342,0],"B":[468,342,0],"C":[410,342,0],"D":[559,342,0],"E":[424,342,0],"F":[546,342,0],"G":[452,342,49],"H":[597,342,0],"I":[436,342,0],"J":[573,342,49],"K":[528,342,0],"L":[482,342,0],"M":[784,342,0],"N":[640,342,0],"O":[562,342,0],"P":[542,342,0],"Q":[566,342,49],"R":[598,342,0],"S":[468,342,0],"T":[549,342,0],"U":[488,342,0],"V":[492,342,0],"W":[727,342,0],"X":[572,342,0],"Y":[508,342,49],"Z":[537,342,0]},"pSS":{"(":[271,375,125],")":[271,375,125],"[":[201,375,125],"]":[201,375,125],"+":[514,333,83],"=":[514,198,0],"<":[542,300,50],">":[542,300,50],"/":[368,375,125],"|":[229,375,125],"!":[201,347,0],"?":[323,347,0],",":[229,61,97],".":[229,61,0],":":[201,215,0],";":[201,215,97],"'":[270,480,0],"-":[542,333,83],"*":[368,233,0],"minus":[542,333,83],"comma":[229,61,97],"semi":[201,215,97]},"cSS":{"alpha":[457,215,0],"beta":[421,347,97],"gamma":[408,215,97],"delta":[343,347,0],"epsilon":[307,215,0],"zeta":[360,347,97],"eta":[390,215,97],"theta":[356,347,0],"iota":[275,215,0],"kappa":[414,215,0],"lambda":[420,347,0],"mu":[425,215,97],"nu":[391,215,0],"xi":[342,347,97],"pi":[434,215,0],"rho":[363,215,97],"sigma":[426,215,0],"tau":[399,215,0],"upsilon":[414,215,0],"phi":[421,347,97],"chi":[432,215,97],"psi":[483,347,97],"omega":[461,215,0],"varepsilon":[337,215,0],"vartheta":[428,347,0],"varpi":[590,215,0],"varrho":[363,215,97],"varsigma":[326,215,49],"varphi":[459,215,97],"Gamma":[415,340,0],"Delta":[549,340,0],"Theta":[514,340,0],"Lambda":[456,340,0],"Xi":[444,340,0],"Pi":[490,340,0],"Sigma":[479,340,0],"Upsilon":[514,340,0],"Phi":[479,340,0],"Psi":[514,340,0],"Omega":[479,340,0],"pm":[542,333,83],"mp":[542,333,83],"times":[542,333,83],"div":[542,333,83],"cdot":[229,246,0],"ast":[368,233,0],"star":[368,233,0],"circ":[368,246,0],"bullet":[368,246,0],"cap":[472,278,0],"cup":[472,278,0],"uplus":[472,278,0],"sqcap":[472,278,0],"sqcup":[472,278,0],"vee":[472,278,0],"wedge":[472,278,0],"setminus":[368,375,125],"wr":[229,347,97],"diamond":[368,246,0],"oplus":[542,333,83],"ominus":[542,333,83],"otimes":[542,333,83],"oslash":[542,333,83],"odot":[542,333,83],"leq":[542,360,110],"geq":[542,360,110],"equiv":[542,257,7],"subset":[542,300,50],"supset":[542,300,50],"approx":[542,269,19],"subseteq":[542,360,110],"supseteq":[542,360,110],"ll":[681,300,50],"gg":[681,300,50],"prec":[542,300,50],"succ":[542,300,50],"sim":[542,198,0],"simeq":[542,257,7],"preceq":[542,360,110],"succeq":[542,360,110],"propto":[542,215,0],"perp":[542,347,0],"mid":[229,375,125],"parallel":[368,375,125],"neq":[514,347,97],"ne":[514,347,97],"in":[472,300,50],"ni":[472,300,50],"notin":[472,375,50],"leftarrow":[681,198,0],"rightarrow":[681,198,0],"leftrightarrow":[681,198,0],"Leftarrow":[681,198,0],"Rightarrow":[681,198,0],"Leftrightarrow":[681,198,0],"mapsto":[681,198,0],"uparrow":[368,347,97],"downarrow":[368,347,97],"longrightarrow":[1100,198,0],"longleftarrow":[1100,198,0],"nearrow":[681,347,97],"searrow":[681,347,97],"aleph":[438,347,0],"hbar":[396,344,0],"imath":[267,215,0],"jmath":[277,215,97],"ell":[299,347,0],"wp":[445,215,97],"Re":[507,347,0],"Im":[507,347,0],"partial":[409,347,0],"infty":[681,215,0],"nabla":[576,342,0],"forall":[403,347,0],"exists":[403,347,0],"neg":[472,215,0],"emptyset":[368,375,28],"prime":[220,278,0],"angle":[507,340,0],"triangle":[611,347,97],"top":[542,347,0],"bot":[542,347,0],"ldots":[688,61,0],"cdots":[810,246,0],"vdots":[278,1506,0],"ddots":[1079,1506,0],"dots":[810,61,0],"surd":[549,375,125],"lfloor":[333,375,125],"rfloor":[333,375,125],"lceil":[333,375,125],"rceil":[333,375,125],"langle":[299,375,125],"rangle":[299,375,125],"backslash":[368,375,125],"vert":[229,375,125],"Vert":[368,375,125],"lbrace":[368,375,125],"rbrace":[368,375,125],"to":[681,198,0],"gets":[681,198,0],"iff":[1647,198,0],"implies":[1481,198,0],"land":[472,278,0],"lor":[472,278,0],"lnot":[472,215,0],"nmid":[229,375,125],"subsetneq":[542,360,110],"supsetneq":[542,360,110],"nsubseteq":[542,467,217],"leqslant":[542,358,110],"geqslant":[542,358,110],"lesssim":[542,410,155],"gtrsim":[542,410,168],"therefore":[472,340,0],"because":[472,340,0],"square":[542,410,0],"checkmark":[576,340,0],"amalg":[518,342,0],"dagger":[333,347,97],"ddagger":[333,347,97],"S":[333,347,97],"P":[438,347,97],"hookrightarrow":[787,257,7],"Longrightarrow":[1072,198,0],"Longleftarrow":[1072,198,0],"Longleftrightarrow":[1238,198,0],"sum":[600,375,125],"prod":[539,375,125],"coprod":[539,375,125],"int":[385,403,153],"oint":[385,403,153],"bigcup":[477,375,125],"bigcap":[477,375,125],"bigvee":[477,375,125],"bigwedge":[477,375,125],"bigoplus":[631,375,125],"bigotimes":[631,375,125],"bigodot":[631,375,125],"biguplus":[477,375,125],"bigsqcup":[477,375,125],"iint":[647,403,153],"iiint":[909,403,153]}};
const TXD = {"(":{"0":[389,750,250],"1":[458,850,350],"2":[597,1150,650],"3":[736,1450,950],"4":[792,1750,1250]},")":{"0":[389,750,250],"1":[458,850,350],"2":[597,1150,650],"3":[736,1450,950],"4":[792,1750,1250]},"[":{"0":[278,750,250],"1":[417,850,350],"2":[472,1150,650],"3":[528,1450,950],"4":[583,1750,1250]},"]":{"0":[278,750,250],"1":[417,850,350],"2":[472,1150,650],"3":[528,1450,950],"4":[583,1750,1250]},"lbrace":{"0":[500,750,250],"1":[583,850,350],"2":[667,1150,650],"3":[750,1450,950],"4":[806,1750,1250]},"rbrace":{"0":[500,750,250],"1":[583,850,350],"2":[667,1150,650],"3":[750,1450,950],"4":[806,1750,1250]},"langle":{"0":[389,750,250],"1":[472,850,350],"2":[611,1150,650],"3":[750,1450,950],"4":[806,1750,1250]},"rangle":{"0":[389,750,250],"1":[472,850,350],"2":[611,1150,650],"3":[750,1450,950],"4":[806,1750,1250]},"vert":{"0":[278,750,250],"1":[333,850,350],"2":[333,1150,650],"3":[333,1450,950],"4":[333,1750,1250]},"Vert":{"0":[500,750,250],"1":[556,850,350],"2":[556,1150,650],"3":[556,1450,950],"4":[556,1750,1250]},"lfloor":{"0":[444,750,250],"1":[472,850,350],"2":[528,1150,650],"3":[583,1450,950],"4":[639,1750,1250]},"rfloor":{"0":[444,750,250],"1":[472,850,350],"2":[528,1150,650],"3":[583,1450,950],"4":[639,1750,1250]},"lceil":{"0":[444,750,250],"1":[472,850,350],"2":[528,1150,650],"3":[583,1450,950],"4":[639,1750,1250]},"rceil":{"0":[444,750,250],"1":[472,850,350],"2":[528,1150,650],"3":[583,1450,950],"4":[639,1750,1250]},"slash":{"0":[500,750,250],"1":[578,850,350],"2":[811,1150,650],"3":[1044,1450,950],"4":[1278,1750,1250]},"backslash":{"0":[500,750,250],"1":[578,850,350],"2":[811,1150,650],"3":[1044,1450,950],"4":[1278,1750,1250]},"surd":{"0":[833,750,250],"1":[833,850,350],"2":[833,1150,650],"3":[833,1450,950],"4":[833,1750,1250]}};
const TXIC = {"it/f":108,"it/g":36,"it/j":57,"it/k":32,"it/l":20,"it/q":36,"it/r":28,"it/v":36,"it/w":27,"it/y":36,"it/z":44,"it/B":50,"it/C":72,"it/D":28,"it/E":58,"it/F":139,"it/H":81,"it/I":78,"it/J":96,"it/K":72,"it/M":109,"it/N":109,"it/O":28,"it/P":139,"it/R":8,"it/S":58,"it/T":139,"it/U":109,"it/V":222,"it/W":139,"it/X":78,"it/Y":222,"it/Z":72,"p/'":281,"c/alpha":4,"c/beta":53,"c/gamma":56,"c/delta":38,"c/zeta":74,"c/eta":36,"c/theta":28,"c/nu":64,"c/xi":46,"c/pi":36,"c/sigma":36,"c/tau":113,"c/upsilon":36,"c/psi":36,"c/omega":36,"c/varpi":28,"c/varsigma":80,"c/partial":56,"c/cdots":167,"c/dots":167,"c/iff":-278,"c/implies":-278,"c/int":194,"c/oint":194,"c/iint":194,"c/iiint":194,"cal/B":30,"cal/C":58,"cal/D":28,"cal/E":89,"cal/F":99,"cal/G":59,"cal/H":10,"cal/I":74,"cal/J":185,"cal/K":14,"cal/N":147,"cal/O":28,"cal/P":82,"cal/S":75,"cal/T":254,"cal/U":99,"cal/V":82,"cal/W":82,"cal/X":146,"cal/Y":82,"cal/Z":80,"bf/f":109,"bf/g":16,"bf/v":16,"bf/w":16,"bf/y":16,"bf/V":16,"bf/W":16,"bf/Y":29,"itl/a":77,"itl/b":63,"itl/c":56,"itl/d":103,"itl/e":75,"itl/f":212,"itl/g":88,"itl/h":77,"itl/i":102,"itl/j":145,"itl/k":108,"itl/l":103,"itl/m":77,"itl/n":77,"itl/o":63,"itl/p":63,"itl/q":88,"itl/r":108,"itl/s":82,"itl/t":95,"itl/u":77,"itl/v":108,"itl/w":108,"itl/x":120,"itl/y":88,"itl/z":123,"itl/B":103,"itl/C":145,"itl/D":94,"itl/E":120,"itl/F":133,"itl/G":87,"itl/H":164,"itl/I":158,"itl/J":140,"itl/K":145,"itl/M":164,"itl/N":164,"itl/O":94,"itl/P":103,"itl/Q":94,"itl/R":39,"itl/S":120,"itl/T":133,"itl/U":164,"itl/V":184,"itl/W":184,"itl/X":158,"itl/Y":194,"itl/Z":145};
const TXOPIC = {"sum_d":0,"sum_t":0,"prod_d":0,"prod_t":0,"coprod_d":0,"coprod_t":0,"int_d":444,"int_t":194,"oint_d":444,"oint_t":194,"bigcup_d":0,"bigcup_t":0,"bigcap_d":0,"bigcap_t":0,"bigvee_d":0,"bigvee_t":0,"bigwedge_d":0,"bigwedge_t":0,"bigoplus_d":0,"bigoplus_t":0,"bigotimes_d":0,"bigotimes_t":0,"bigodot_d":0,"bigodot_t":0,"biguplus_d":0,"biguplus_t":0,"bigsqcup_d":0,"bigsqcup_t":0,"iint_d":444,"iint_t":194,"iiint_d":444,"iiint_t":194};
// TeX font parameters (fontdimen of cmsy/cmex at 10/7/5pt, in em of 10pt) for text, script and scriptscript style.
const TXP = {"T":{"xh":0.43055,"quad":1.0,"num1":0.67651,"num2":0.39373,"num3":0.44373,"denom1":0.68595,"denom2":0.34484,"sup1":0.41289,"sup2":0.36289,"sup3":0.28889,"sub1":0.15,"sub2":0.24722,"supdrop":0.38611,"subdrop":0.05,"delim1":2.39,"delim2":1.01,"axis":0.25,"theta":0.04,"bos1":0.11111,"bos2":0.16667,"bos3":0.2,"bos4":0.6,"bos5":0.1,"nds":0.12,"scriptspace":0.05},"S":{"xh":0.30139,"quad":0.81945,"num1":0.51262,"num2":0.26873,"num3":0.32984,"denom1":0.52651,"denom2":0.24095,"sup1":0.35178,"sup2":0.30178,"sup3":0.2,"sub1":0.1,"sub2":0.2,"supdrop":0.24722,"subdrop":0.05,"delim1":1.19,"delim2":0.81,"axis":0.175,"theta":0.034,"bos1":0.07778,"bos2":0.11667,"bos3":0.14,"bos4":0.42778,"bos5":0.1},"SS":{"xh":0.21528,"quad":0.73612,"num1":0.46262,"num2":0.19373,"num3":0.25207,"denom1":0.51262,"denom2":0.26595,"sup1":0.25178,"sup2":0.20178,"sup3":0.14722,"sub1":0.1,"sub2":0.2,"supdrop":0.24722,"subdrop":0.05,"delim1":0.99,"delim2":0.71,"axis":0.125,"theta":0.02428,"bos1":0.05555,"bos2":0.08333,"bos3":0.1,"bos4":0.30555,"bos5":0.07143}};
// widths (1/1000 em) of extensible delimiters taller than 3em
const TXE = {"(":875,")":875,"[":667,"]":667,"lbrace":889,"rbrace":889,"langle":806,"rangle":806,"vert":333,"Vert":556,"lfloor":667,"rfloor":667,"lceil":667,"rceil":667,"slash":1278,"backslash":1278};

// ===== LaTeX math -> SVG layout engine (TeX rules from the TeXbook, appendix G, simplified), hand-written =====
class TxError extends Error {}
const TX_GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'ϕ', chi: 'χ', psi: 'ψ', omega: 'ω', varepsilon: 'ε', vartheta: 'ϑ', varpi: 'ϖ', varrho: 'ϱ', varsigma: 'ς', varphi: 'φ', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω' };
// [unicode, class]
const TX_SYM = {
  pm: ['±', 'bin'], mp: ['∓', 'bin'], times: ['×', 'bin'], div: ['÷', 'bin'], cdot: ['⋅', 'bin'], ast: ['∗', 'bin'], star: ['⋆', 'bin'], circ: ['∘', 'bin'], bullet: ['∙', 'bin'], cap: ['∩', 'bin'], cup: ['∪', 'bin'], uplus: ['⊎', 'bin'], sqcap: ['⊓', 'bin'], sqcup: ['⊔', 'bin'], vee: ['∨', 'bin'], wedge: ['∧', 'bin'], land: ['∧', 'bin'], lor: ['∨', 'bin'], setminus: ['∖', 'bin'], wr: ['≀', 'bin'], diamond: ['⋄', 'bin'], oplus: ['⊕', 'bin'], ominus: ['⊖', 'bin'], otimes: ['⊗', 'bin'], oslash: ['⊘', 'bin'], odot: ['⊙', 'bin'], amalg: ['⨿', 'bin'], dagger: ['†', 'bin'], ddagger: ['‡', 'bin'],
  leq: ['≤', 'rel'], le: ['≤', 'rel', 'leq'], geq: ['≥', 'rel'], ge: ['≥', 'rel', 'geq'], equiv: ['≡', 'rel'], subset: ['⊂', 'rel'], supset: ['⊃', 'rel'], approx: ['≈', 'rel'], subseteq: ['⊆', 'rel'], supseteq: ['⊇', 'rel'], ll: ['≪', 'rel'], gg: ['≫', 'rel'], prec: ['≺', 'rel'], succ: ['≻', 'rel'], sim: ['∼', 'rel'], simeq: ['≃', 'rel'], preceq: ['⪯', 'rel'], succeq: ['⪰', 'rel'], propto: ['∝', 'rel'], perp: ['⊥', 'rel'], mid: ['∣', 'rel'], parallel: ['∥', 'rel'], neq: ['≠', 'rel'], ne: ['≠', 'rel', 'neq'], in: ['∈', 'rel'], ni: ['∋', 'rel'], notin: ['∉', 'rel'], leftarrow: ['←', 'rel'], gets: ['←', 'rel', 'leftarrow'], rightarrow: ['→', 'rel'], to: ['→', 'rel', 'rightarrow'], leftrightarrow: ['↔', 'rel'], Leftarrow: ['⇐', 'rel'], Rightarrow: ['⇒', 'rel'], Leftrightarrow: ['⇔', 'rel'], iff: ['⟺', 'rel', 'Longleftrightarrow'], implies: ['⟹', 'rel', 'Longrightarrow'], mapsto: ['↦', 'rel'], longrightarrow: ['⟶', 'rel'], longleftarrow: ['⟵', 'rel'], Longrightarrow: ['⟹', 'rel'], Longleftarrow: ['⟸', 'rel'], Longleftrightarrow: ['⟺', 'rel'], uparrow: ['↑', 'rel'], downarrow: ['↓', 'rel'], nearrow: ['↗', 'rel'], searrow: ['↘', 'rel'], hookrightarrow: ['↪', 'rel'], nmid: ['∤', 'rel'], subsetneq: ['⊊', 'rel'], supsetneq: ['⊋', 'rel'], nsubseteq: ['⊈', 'rel'], leqslant: ['⩽', 'rel'], geqslant: ['⩾', 'rel'], lesssim: ['≲', 'rel'], gtrsim: ['≳', 'rel'], therefore: ['∴', 'rel'], because: ['∵', 'rel'],
  aleph: ['ℵ', 'ord'], hbar: ['ℏ', 'ord'], imath: ['ı', 'ord'], jmath: ['ȷ', 'ord'], ell: ['ℓ', 'ord'], wp: ['℘', 'ord'], Re: ['ℜ', 'ord'], Im: ['ℑ', 'ord'], partial: ['∂', 'ord'], infty: ['∞', 'ord'], nabla: ['∇', 'ord'], forall: ['∀', 'ord'], exists: ['∃', 'ord'], neg: ['¬', 'ord'], lnot: ['¬', 'ord', 'neg'], emptyset: ['∅', 'ord'], prime: ['′', 'ord'], angle: ['∠', 'ord'], triangle: ['△', 'ord'], top: ['⊤', 'ord'], bot: ['⊥', 'ord'], surd: ['√', 'ord'], backslash: ['\\', 'ord'], square: ['□', 'ord'], checkmark: ['✓', 'ord'], S: ['§', 'ord'], P: ['¶', 'ord'],
  ldots: ['…', 'inner'], cdots: ['⋯', 'cdots'], vdots: ['⋮', 'ord'], ddots: ['⋱', 'inner'], dots: ['…', 'inner', 'ldots'],
  langle: ['⟨', 'open'], rangle: ['⟩', 'close'], lfloor: ['⌊', 'open'], rfloor: ['⌋', 'close'], lceil: ['⌈', 'open'], rceil: ['⌉', 'close'], lbrace: ['{', 'open'], rbrace: ['}', 'close'], vert: ['|', 'ord'], Vert: ['‖', 'ord'],
  sum: ['∑', 'op'], prod: ['∏', 'op'], coprod: ['∐', 'op'], int: ['∫', 'op'], oint: ['∮', 'op'], bigcup: ['⋃', 'op'], bigcap: ['⋂', 'op'], bigvee: ['⋁', 'op'], bigwedge: ['⋀', 'op'], bigoplus: ['⨁', 'op'], bigotimes: ['⨂', 'op'], bigodot: ['⨀', 'op'], biguplus: ['⨄', 'op'], bigsqcup: ['⨆', 'op'], iint: ['∬', 'op'], iiint: ['∭', 'op'],
};
const TX_NOLIM = new Set(['int', 'oint', 'iint', 'iiint']);
const TX_FUNCS = 'arccos arcsin arctan arg cos cosh cot coth csc deg det dim exp gcd hom inf ker lg lim liminf limsup ln log max min Pr sec sin sinh sup tan tanh'.split(' ');
const TX_FUNC_LIM = new Set(['det', 'gcd', 'inf', 'lim', 'liminf', 'limsup', 'max', 'min', 'Pr', 'sup']);
const TX_CAL = '𝒜ℬ𝒞𝒟ℰℱ𝒢ℋℐ𝒥𝒦ℒℳ𝒩𝒪𝒫𝒬ℛ𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵'; const TX_BB = '𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ';
const TX_OPEN = { '(': '(', '[': '[', lbrace: '{', '\\{': '{', langle: '⟨', lfloor: '⌊', lceil: '⌈', '.': '', '/': '/', vert: '|', '|': '|', Vert: '‖', '\\|': '‖', lgroup: '(' };
const TX_CLOSE = { ')': ')', ']': ']', rbrace: '}', '\\}': '}', rangle: '⟩', rfloor: '⌋', rceil: '⌉', '.': '', '/': '/', vert: '|', '|': '|', Vert: '‖', '\\|': '‖' };
const TX_PARAM_OLD = { sup1: 0.413, sup2: 0.363, sup3: 0.289, sub1: 0.15, sub2: 0.247, supdrop: 0.386, subdrop: 0.05, num1: 0.677, num2: 0.394, num3: 0.444, denom1: 0.686, denom2: 0.345, axis: 0.25, theta: 0.04, xh: 0.4306, delim1: 2.39, delim2: 1.01 };
const TX_SPACE = { // [left][right] -> 0 none, 1 thin, 2 med, 3 thick; negative = only outside script styles
  ord: { ord: 0, op: 1, bin: -2, rel: -3, open: 0, close: 0, punct: 0, inner: -1 },
  op: { ord: 1, op: 1, bin: 9, rel: -3, open: 0, close: 0, punct: 0, inner: -1 },
  bin: { ord: -2, op: -2, bin: 9, rel: 9, open: -2, close: 9, punct: 9, inner: -2 },
  rel: { ord: -3, op: -3, bin: 9, rel: 0, open: -3, close: 0, punct: 0, inner: -3 },
  open: { ord: 0, op: 0, bin: 9, rel: 0, open: 0, close: 0, punct: 0, inner: 0 },
  close: { ord: 0, op: 1, bin: -2, rel: -3, open: 0, close: 0, punct: 0, inner: -1 },
  punct: { ord: -1, op: -1, bin: 9, rel: -1, open: -1, close: -1, punct: -1, inner: -1 },
  inner: { ord: -1, op: 1, bin: -2, rel: -3, open: -1, close: 0, punct: -1, inner: -1 },
  cdots: { ord: 0, op: 0, bin: -4, rel: -5, open: 0, close: 0, punct: 3, inner: 0 }, // measured: amsmath's \cdots differs from a plain inner atom
};
for (const k of Object.keys(TX_SPACE)) TX_SPACE[k].cdots = TX_SPACE[k].inner;
// ---- tokenizer / parser ----
function txTokenize(src) {
  const t = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '%') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '\\') { let j = i + 1; if (/[A-Za-z]/.test(src[j] || '')) { while (/[A-Za-z]/.test(src[j] || '')) j++; t.push({ k: 'cmd', v: src.slice(i + 1, j), at: i }); i = j; } else { t.push({ k: 'cmd', v: src[j] || '', at: i }); i = j + 1; } continue; }
    t.push({ k: '{}^_&~#$'.includes(c) ? c : 'ch', v: c, at: i }); i++;
  }
  return t;
}
function txParse(src) {
  const T = txTokenize(src); let p = 0;
  const fail = (m) => { throw new TxError(m); };
  const peek = () => T[p];
  const isTok = (k, v) => T[p] && T[p].k === k && (v === undefined || T[p].v === v);
  function parseList(stops) { // stops: set of token kinds/cmds that end the list (not consumed)
    const out = [];
    while (p < T.length) {
      const t = T[p];
      if (t.k === '}' || t.k === '&' || (t.k === 'cmd' && (t.v === '\\' || t.v === 'right' || t.v === 'middle' || t.v === 'end'))) { if (stops && (stops.has(t.k) || stops.has('\\' + t.v))) break; if (t.k === '}') fail('Unmatched "}"'); if (t.k === '&' || (t.k === 'cmd' && t.v === '\\')) fail('"&" and "\\\\" are only valid inside matrix, cases or aligned environments'); if (t.v === 'right') fail('\\right without \\left'); if (t.v === 'end') fail('\\end without \\begin'); break; }
      if (t.k === '^' || t.k === '_') {
        p++; const arg = parseArg(); let last = out[out.length - 1];
        if (!last || last.t !== 'atom' || (t.k === '^' ? last.sup : last.sub)) { if (last && last.t === 'atom') fail('Double ' + (t.k === '^' ? 'superscript' : 'subscript')); last = { t: 'atom', cls: 'ord', nuc: { t: 'empty' } }; out.push(last); }
        if (t.k === '^') last.sup = arg; else last.sub = arg; continue;
      }
      if (t.k === 'ch' && t.v === "'") { p++; let n = 1; while (isTok('ch', "'")) { p++; n++; } let last = out[out.length - 1]; if (!last || last.t !== 'atom' || last.sup) { last = { t: 'atom', cls: 'ord', nuc: { t: 'empty' } }; out.push(last); } last.sup = { t: 'group', list: [...Array(n)].map(() => ({ t: 'atom', cls: 'ord', nuc: { t: 'sym', u: '′', m: 'prime', fam: 'rm' } })) }; continue; }
      const at = parseAtom(); if (at.t === 'mod') { const last = out[out.length - 1]; if (!last || last.cls !== 'op') fail('\\' + at.v + ' must follow an operator'); last.limitsMod = at.v; continue; } out.push(at);
    }
    return out;
  }
  function parseArg() { // one argument: {group} or single token
    if (p >= T.length) fail('Missing argument');
    const t = T[p];
    if (t.k === '{') { p++; const l = parseList(new Set(['}'])); if (!isTok('}')) fail('Missing "}"'); p++; return { t: 'group', list: l }; }
    if (t.k === '}' || t.k === '^' || t.k === '_' || t.k === '&') fail('Missing argument');
    return { t: 'group', list: [parseAtom()] };
  }
  function argText() { // raw text for \text{...}
    if (!isTok('{')) { const t = T[p++]; return t ? t.v : ''; }
    const open = T[p].at; let depth = 0, q = p; for (; q < T.length; q++) { if (T[q].k === '{') depth++; else if (T[q].k === '}') { depth--; if (!depth) break; } }
    if (q >= T.length) fail('Missing "}"'); const end = T[q].at; const s = src.slice(open + 1, end); p = q + 1; return s;
  }
  const simpleAtom = (cls, nuc) => ({ t: 'atom', cls, nuc });
  function delim() { const t = T[p++]; if (!t) fail('Missing delimiter'); if (t.k === 'ch') return t.v; if (t.k === 'cmd') return t.v === '{' ? '\\{' : t.v === '}' ? '\\}' : t.v === '|' ? '\\|' : t.v; fail('Bad delimiter'); }
  function parseAtom() {
    const t = T[p++];
    if (t.k === '{') { p--; const g = parseArg(); return { t: 'atom', cls: 'ord', nuc: g }; }
    if (t.k === '~') return { t: 'atom', cls: 'ord', nuc: { t: 'space', em: 0.333, abs: true } };
    if (t.k === '&' || t.k === '#' || t.k === '$') fail('Unexpected "' + t.v + '"');
    if (t.k === 'ch') return charAtom(t.v);
    // commands
    const c = t.v;
    if (TX_GREEK[c]) return simpleAtom('ord', { t: 'sym', u: TX_GREEK[c], m: c, fam: /^[A-Z]/.test(c) ? 'rm' : 'it', grp: 'c' });
    if (TX_SYM[c]) { const s = TX_SYM[c]; return simpleAtom(s[1], { t: 'sym', u: s[0], m: s[2] || c, fam: 'rm', grp: 'c', op: s[1] === 'op' }); }
    if (c === 'limsup' || c === 'liminf') return { t: 'atom', cls: 'op', nuc: { t: 'text', s: c.slice(0, 3) + '\u2009' + c.slice(3), fam: 'rm' }, fn: true, lim: true };
    if (TX_FUNCS.includes(c)) return { t: 'atom', cls: 'op', nuc: { t: 'text', s: c, fam: 'rm' }, fn: true, lim: TX_FUNC_LIM.has(c) };
    switch (c) {
      case ',': return simpleAtom('ord', { t: 'space', em: 3 / 18 }); case ':': case '>': return simpleAtom('ord', { t: 'space', em: 4 / 18 }); case ';': return simpleAtom('ord', { t: 'space', em: 5 / 18 }); case '!': return simpleAtom('ord', { t: 'space', em: -3 / 18 });
      case ' ': return simpleAtom('ord', { t: 'space', em: 1 / 3, abs: true }); case 'quad': return simpleAtom('ord', { t: 'space', em: 1, abs: true }); case 'qquad': return simpleAtom('ord', { t: 'space', em: 2, abs: true });
      case '{': case '}': case '%': case '$': case '&': case '#': case '_': return simpleAtom(c === '{' ? 'open' : c === '}' ? 'close' : 'ord', { t: 'sym', u: c, m: c === '{' ? 'lbrace' : c === '}' ? 'rbrace' : c, fam: 'rm', grp: c === '{' || c === '}' ? 'c' : 'p' });
      case '|': return simpleAtom('ord', { t: 'sym', u: '‖', m: 'Vert', fam: 'rm', grp: 'c' });
      case 'frac': case 'dfrac': case 'tfrac': case 'cfrac': { const a = parseArg(), b = parseArg(); return simpleAtom('ord', { t: 'frac', num: a, den: b, bar: true, force: c === 'dfrac' ? 0 : c === 'tfrac' ? 2 : null }); }
      case 'binom': case 'dbinom': case 'tbinom': { const a = parseArg(), b = parseArg(); return simpleAtom('ord', { t: 'frac', num: a, den: b, bar: false, delims: ['(', ')'], force: c === 'dbinom' ? 0 : c === 'tbinom' ? 2 : null }); }
      case 'sqrt': { let idx = null; if (isTok('ch', '[')) { p++; const l = []; while (!isTok('ch', ']')) { if (p >= T.length) fail('Missing "]"'); l.push(parseAtom()); } p++; idx = { t: 'group', list: l }; } const body = parseArg(); return simpleAtom('ord', { t: 'sqrt', body, idx }); }
      case 'text': case 'textrm': case 'mbox': case 'hbox': return simpleAtom('ord', { t: 'text', s: argText(), fam: 'rm' });
      case 'textbf': return simpleAtom('ord', { t: 'text', s: argText(), fam: 'bf' }); case 'textit': return simpleAtom('ord', { t: 'text', s: argText(), fam: 'itl' }); case 'textsf': return simpleAtom('ord', { t: 'text', s: argText(), fam: 'sf' }); case 'texttt': return simpleAtom('ord', { t: 'text', s: argText(), fam: 'tt' });
      case 'operatorname': return { t: 'atom', cls: 'op', nuc: { t: 'text', s: argText(), fam: 'rm' }, fn: true, lim: false };
      case 'mathrm': case 'mathbf': case 'mathit': case 'mathsf': case 'mathtt': case 'mathbb': case 'mathcal': case 'mathscr': case 'boldsymbol': case 'bm': case 'mathnormal': case 'mathfrak': { const fam = { mathrm: 'rm', mathbf: 'bf', mathit: 'itl', mathsf: 'sf', mathtt: 'tt', mathbb: 'bb', mathcal: 'cal', mathscr: 'cal', boldsymbol: 'bf', bm: 'bf', mathnormal: 'it', mathfrak: 'rm' }[c]; const a = parseArg(); return simpleAtom('ord', { t: 'font', fam, body: a, boldsym: c === 'boldsymbol' || c === 'bm' }); }
      case 'displaystyle': return simpleAtom('ord', { t: 'style', s: 0 }); case 'textstyle': return simpleAtom('ord', { t: 'style', s: 2 }); case 'scriptstyle': return simpleAtom('ord', { t: 'style', s: 4 }); case 'scriptscriptstyle': return simpleAtom('ord', { t: 'style', s: 6 });
      case 'limits': case 'nolimits': { const last = null; return { t: 'mod', v: c }; }
      case 'left': { const o = delim(); const l = parseList(new Set(['\\right', '\\middle'])); const mids = []; let parts = [{ list: l }]; while (isTok('cmd', 'middle')) { p++; const m = delim(); mids.push(m); parts.push({ list: parseList(new Set(['\\right', '\\middle'])) }); } if (!isTok('cmd', 'right')) fail('\\left without \\right'); p++; const cl = delim(); return simpleAtom('inner', { t: 'left', open: o, close: cl, mids, parts: parts.map((x) => x.list) }); }
      case 'bigl': case 'Bigl': case 'biggl': case 'Biggl': case 'big': case 'Big': case 'bigg': case 'Bigg': case 'bigr': case 'Bigr': case 'biggr': case 'Biggr': case 'bigm': case 'Bigm': { const sz = c.replace(/[lrm]$/, ''); const level = { big: 1, Big: 2, bigg: 3, Bigg: 4 }[sz.replace(/^.*$/, sz)] || 1; const d = delim(); const isOpen = /l$/.test(c) || (!/[rm]$/.test(c) && !!TX_OPEN[d] && !TX_CLOSE[d.replace('lbrace', 'rbrace')]); return simpleAtom(/r$/.test(c) ? 'close' : /l$/.test(c) ? 'open' : 'ord', { t: 'bigdelim', d, level, isClose: /r$/.test(c) }); }
      case 'overline': return simpleAtom('ord', { t: 'over', kind: 'line', body: parseArg() }); case 'underline': return simpleAtom('ord', { t: 'under', kind: 'line', body: parseArg() });
      case 'overbrace': return { t: 'atom', cls: 'op', nuc: { t: 'over', kind: 'brace', body: parseArg() }, limitsMod: 'limits' }; case 'underbrace': return { t: 'atom', cls: 'op', nuc: { t: 'under', kind: 'brace', body: parseArg() }, limitsMod: 'limits' };
      case 'hat': case 'widehat': case 'bar': case 'vec': case 'dot': case 'ddot': case 'tilde': case 'widetilde': case 'check': case 'breve': case 'acute': case 'grave': case 'overrightarrow': case 'overleftarrow': return simpleAtom('ord', { t: 'accent', kind: c, body: parseArg() });
      case 'stackrel': case 'overset': { const top = parseArg(), base = parseArg(); const inner = { t: 'atom', cls: 'op', nuc: base, sup: top, limitsMod: 'limits' }; return c === 'stackrel' ? simpleAtom('rel', { t: 'group', list: [inner] }) : inner; }
      case 'underset': { const bot = parseArg(), base = parseArg(); return { t: 'atom', cls: 'op', nuc: base, sub: bot, limitsMod: 'limits' }; }
      case 'substack': case 'smallmatrix': { const a = argText(); return simpleAtom('ord', { t: 'substack', rows: a.split('\\\\').map((r) => txParse(r.trim())) }); }
      case 'not': { const nx = parseAtom(); if (nx.nuc && nx.nuc.t === 'sym') { const map = { '=': '≠', '∈': '∉', '⊂': '⊄', '⊆': '⊈', '<': '≮', '>': '≯', '≤': '≰', '≥': '≱', '≡': '≢', '∼': '≁', '≈': '≉', '∃': '∄' }; const u = map[nx.nuc.u]; if (u) return { ...nx, nuc: { ...nx.nuc, u } }; } return nx; }
      case 'begin': return parseEnv();
      case 'phantom': case 'hphantom': case 'vphantom': return simpleAtom('ord', { t: 'phantom', kind: c, body: parseArg() });
      case 'boxed': return simpleAtom('ord', { t: 'boxed', body: parseArg() });
      case 'color': case 'textcolor': { argText(); if (c === 'textcolor') return simpleAtom('ord', parseArg()); return simpleAtom('ord', { t: 'space', em: 0 }); }
      case 'mathop': return { t: 'atom', cls: 'op', nuc: parseArg(), lim: true };
      case 'mathbin': return simpleAtom('bin', parseArg()); case 'mathrel': return simpleAtom('rel', parseArg()); case 'mathord': return simpleAtom('ord', parseArg()); case 'mathopen': return simpleAtom('open', parseArg()); case 'mathclose': return simpleAtom('close', parseArg()); case 'mathpunct': return simpleAtom('punct', parseArg());
      case 'newline': case 'cr': fail('Line breaks are only supported inside environments');
      case 'right': case 'middle': case 'end': fail('Unexpected \\' + c);
      case 'cdotp': return simpleAtom('bin', { t: 'sym', u: '⋅', m: 'cdot', fam: 'rm', grp: 'c' });
      case 'colon': return simpleAtom('punct', { t: 'sym', u: ':', m: ':', fam: 'rm', grp: 'p' });
      case 'lbrack': return charAtom('['); case 'rbrack': return charAtom(']'); case 'lvert': return simpleAtom('open', { t: 'sym', u: '|', m: 'vert', fam: 'rm', grp: 'c' }); case 'rvert': return simpleAtom('close', { t: 'sym', u: '|', m: 'vert', fam: 'rm', grp: 'c' });
    }
    fail('Unsupported command \\' + c);
  }
  function charAtom(c) {
    if (/[A-Za-z]/.test(c)) return { t: 'atom', cls: 'ord', nuc: { t: 'sym', u: c, m: c, fam: 'it', grp: 'it' } };
    if (/[0-9]/.test(c)) return { t: 'atom', cls: 'ord', nuc: { t: 'sym', u: c, m: c, fam: 'rm', grp: 'rm' } };
    const map = { '+': ['+', 'bin'], '-': ['−', 'bin'], '*': ['∗', 'bin'], '=': ['=', 'rel'], '<': ['<', 'rel'], '>': ['>', 'rel'], ':': [':', 'rel'], '(': ['(', 'open'], '[': ['[', 'open'], ')': [')', 'close'], ']': [']', 'close'], '!': ['!', 'close'], '?': ['?', 'close'], ',': [',', 'punct'], ';': [';', 'punct'], '.': ['.', 'ord'], '/': ['/', 'ord'], '|': ['|', 'ord'], '"': ['″', 'ord'], '@': ['@', 'ord'], '`': ['‘', 'ord'] };
    const m = map[c]; if (!m) { if (c.charCodeAt(0) > 127) return { t: 'atom', cls: 'ord', nuc: { t: 'sym', u: c, m: c, fam: 'rm', grp: 'it' } }; fail('Unsupported character "' + c + '"'); }
    return { t: 'atom', cls: m[1], nuc: { t: 'sym', u: m[0], m: c === '-' ? 'minus' : c, fam: 'rm', grp: 'p' } };
  }
  function parseEnv() {
    const name = argText().trim(); let spec = null;
    if (name === 'array') spec = argText().replace(/\s/g, '');
    const rows = []; let row = [[]];
    // collect until \end{name}
    for (;;) {
      const cell = parseList(new Set(['&', '\\\\', '\\end']));
      row[row.length - 1] = cell;
      if (isTok('&')) { p++; row.push([]); continue; }
      if (isTok('cmd', '\\')) { p++; rows.push(row); row = [[]]; if (isTok('ch', '[')) { /* skip [len] */ while (!isTok('ch', ']') && p < T.length) p++; p++; } continue; }
      if (isTok('cmd', 'end')) { p++; const n2 = argText().trim(); if (n2 !== name) fail('\\begin{' + name + '} closed by \\end{' + n2 + '}'); if (row.length > 1 || row[0].length) rows.push(row); break; }
      fail('Unterminated environment ' + name);
    }
    const envs = { matrix: ['', ''], pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['\\{', '\\}'], vmatrix: ['|', '|'], Vmatrix: ['\\|', '\\|'], smallmatrix: ['', ''] };
    if (envs[name]) return simpleAtom('ord', { t: 'matrix', rows, delims: envs[name], align: 'c', small: name === 'smallmatrix' });
    if (name === 'cases') return simpleAtom('ord', { t: 'matrix', rows, delims: ['\\{', '.'], align: 'l', cases: true });
    if (name === 'array') return simpleAtom('ord', { t: 'matrix', rows, delims: ['', ''], spec: spec.replace(/\|/g, '') });
    if (name === 'aligned' || name === 'align' || name === 'align*' || name === 'split' || name === 'gathered' || name === 'eqnarray') return simpleAtom('ord', { t: 'matrix', rows, delims: ['', ''], aligned: name !== 'gathered', display: true, align: name === 'gathered' ? 'c' : 'rl' });
    fail('Unsupported environment "' + name + '"');
  }
  const list = parseList(null);
  if (p < T.length) fail('Unexpected "' + T[p].v + '"');
  return list;
}
// ---- layout ----
const txP = (s) => TXP[txLvl(s) < 2 ? 'T' : txLvl(s) === 2 ? 'S' : 'SS'];
const txSz = (s) => [1, 1, 1, 1, 0.7, 0.7, 0.5, 0.5][s];
const txLvl = (s) => s >> 1, txCr = (s) => s & 1;
const txMake = (l, c) => l * 2 + c;
const txSup = (s) => txMake(txLvl(s) < 2 ? 2 : 3, txCr(s)), txSub = (s) => txMake(txLvl(s) < 2 ? 2 : 3, 1), txNum = (s) => txMake(Math.min(txLvl(s) + 1, 3), txCr(s)), txDen = (s) => txMake(Math.min(txLvl(s) + 1, 3), 1), txCramp = (s) => txMake(txLvl(s), 1);
function txBox(w, h, d) { return { w, h, d, kids: [], ops: [] }; }
function txPlace(parent, child, dx, dy) { parent.kids.push({ b: child, dx, dy }); }
function txHcat(list) { const b = txBox(0, 0, 0); let x = 0; for (const c of list) { txPlace(b, c, x, 0); x += c.w; b.h = Math.max(b.h, c.h); b.d = Math.max(b.d, c.d); } b.w = x; return b; }
function txMetric(grp, key, lvl) {
  const sfx = lvl === 2 ? 'S' : lvl === 3 ? 'SS' : '';
  const find = (g) => { const t = TXM[g + sfx] || (sfx ? null : TXM[g]); return t && t[key]; };
  let m = find(grp); if (!m && grp === 'it') m = find('rm') || find('p'); if (!m) m = find('c') || find('p') || find('rm');
  if (!m && sfx) { const b = TXM[grp] && TXM[grp][key] || TXM.c[key] || TXM.p[key]; if (b) { const f = lvl === 2 ? 0.7 : 0.5; m = [b[0] * f, b[1] * f, b[2] * f]; } }
  return m ? [m[0] / 1000, m[1] / 1000, m[2] / 1000] : [0.778 * (lvl === 2 ? 0.7 : lvl === 3 ? 0.5 : 1), 0.68, 0.1];
}
function txGlyph(u, fam, size, w, h, d, extra) { const b = txBox(w, h, d); b.ops.push({ k: 't', x: 0, y: 0, s: u, fam, size, w, ...extra }); return b; }
function txLayout(list, style, ctx) {
  // 1. atoms -> boxes with classes
  const items = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.t !== 'atom') continue;
    if (a.nuc.t === 'style') { style = a.nuc.s | (style & 1); continue; }
    let cls = a.cls;
    items.push({ cls, a, style });
  }
  // bin -> ord conversion
  for (let i = 0; i < items.length; i++) { if (items[i].cls !== 'bin') continue; const prev = items[i - 1], next = items[i + 1]; if (!prev || /^(bin|op|rel|open|punct)$/.test(prev.cls) || !next) items[i].cls = 'ord'; }
  for (let i = 0; i < items.length; i++) { if (items[i].cls === 'rel' || items[i].cls === 'close' || items[i].cls === 'punct') { const prev = items[i - 1]; if (prev && prev.cls === 'bin') prev.cls = 'ord'; } }
  const boxes = items.map((it) => ({ cls: it.cls, box: txAtom(it.a, it.style, ctx, it.cls), style: it.style }));
   const res = txBox(0, 0, 0); let x = 0; let prev = null;
  for (const b of boxes) {
    if (prev) { const code = (TX_SPACE[prev.cls] || {})[b.cls]; let sp = 0; if (code !== undefined && code !== 9) { const abs = Math.abs(code); if (code >= 0 || txLvl(b.style) < 2) sp = [0, 3, 4, 5, 1, 2][abs] * txP(b.style).quad / 18; } x += sp; }
    txPlace(res, b.box, x, 0); x += b.box.w; res.h = Math.max(res.h, b.box.h); res.d = Math.max(res.d, b.box.d); prev = b;
  }
  res.w = x; return res;
}
function txFam(fam, ch) { return fam; }
function txNucleus(n, style, ctx, a) {
  const sz = txSz(style), P = txP(style);
  switch (n.t) {
    case 'empty': return txBox(0, 0, 0);
    case 'space': return txBox(n.abs ? n.em : n.em * txP(style).quad, 0, 0);
    case 'sym': {
      const lvl = txLvl(style); const isBigOp = n.op && a && a.cls === 'op';
      if (isBigOp) { // large operator: display style uses the big variant, centred on the math axis
        const disp = lvl === 0; const m = disp && TXM.cd[n.m] ? txMetric('cd', n.m, 0) : txMetric('c', n.m, lvl);
        const multi = n.m === 'iint' ? 2 : n.m === 'iiint' ? 3 : 1; const mi = multi > 1 ? (disp ? txMetric('cd', 'int', 0) : txMetric('c', 'int', lvl)) : m; const shift = (m[1] - m[2]) / 2 - P.axis;
        const o = txBox(m[0], m[1] - shift, m[2] + shift); const isInt = /int/.test(n.m); const bigF = disp ? (isInt ? 2.0 : 1.4) : 1; for (let q = 0; q < multi; q++) txPlace(o, txGlyph(multi > 1 ? '∫' : n.u, 'rm', sz * bigF, mi[0], mi[1], mi[2], { cy: -P.axis - shift }), multi > 1 ? q * (m[0] - mi[0]) / (multi - 1) : 0, shift); o.ic = (TXOPIC[n.m + (disp ? '_d' : '_t')] || 0) / 1000 * (lvl >= 2 ? 0.7 : 1); o.bigop = true; o.opChar = true; return o;
      }
      const m = txMetric(n.grp || 'c', n.m, lvl); const ic = ((TXIC[(n.grp || 'c') + '/' + n.m] || 0) / 1000) * (lvl === 2 ? 0.7 : lvl === 3 ? 0.5 : 1); const b = txGlyph(n.u, txFam(n.fam), sz, m[0] - ic, m[1], m[2]); b.ic = ic; b.isChar = true; return b;
    }
    case 'text': { let x = 0, b = txBox(0, 0, 0); const fam = n.fam; for (const ch of n.s) { if (ch === '\u2009') { x += 0.1667 * sz; continue; } const m = ch === ' ' ? [0.333 * sz, 0, 0] : txMetric(fam === 'bf' ? 'bf' : fam === 'sf' ? 'sf' : fam === 'tt' ? 'tt' : fam === 'itl' ? 'itl' : 'rmL', ch, txLvl(style)); const g = ch === ' ' ? txBox(m[0], 0, 0) : txGlyph(ch === '-' ? '-' : ch, fam, sz, m[0], m[1], m[2]); txPlace(b, g, x, 0); x += g.w; b.h = Math.max(b.h, g.h); b.d = Math.max(b.d, g.d); } b.w = x; return b; }
    case 'group': return txLayout(n.list.map((x) => x), style, ctx);
    case 'font': return txFontBox(n, style, ctx);
    case 'style': return txBox(0, 0, 0);
    case 'frac': return txFrac(n, style, ctx);
    case 'sqrt': return txSqrt(n, style, ctx);
    case 'left': return txLeft(n, style, ctx);
    case 'bigdelim': { const sizes = [1, 1.2, 1.8, 2.4, 3]; const H = sizes[n.level]; return txDelim(n.d, H, P.axis, n.isClose, sz); }
    case 'over': case 'under': return txOverUnder(n, style, ctx);
    case 'accent': return txAccent(n, style, ctx);
    case 'stack': return txStack(n, style, ctx);
    case 'substack': { const rows = n.rows.map((r) => txLayout(r, txLvl(style) >= 2 ? style : txSub(style), ctx)); return txVcatCentered(rows, 0.1 * sz, sz, style); }
    case 'matrix': return txMatrix(n, style, ctx);
    case 'phantom': { const b = txNucleus(n.body, style, ctx); const o = txBox(n.kind === 'vphantom' ? 0 : b.w, n.kind === 'hphantom' ? 0 : b.h, n.kind === 'hphantom' ? 0 : b.d); return o; }
    case 'boxed': { const b = txNucleus(n.body, style, ctx); const pad = 0.3 * sz, t = 0.04 * sz; const o = txBox(b.w + 2 * pad + 2 * t, b.h + pad + t, b.d + pad + t); o.ops.push({ k: 'r', x: 0, y: -o.h, w: o.w, h: t }, { k: 'r', x: 0, y: o.d - t, w: o.w, h: t }, { k: 'r', x: 0, y: -o.h, w: t, h: o.h + o.d }, { k: 'r', x: o.w - t, y: -o.h, w: t, h: o.h + o.d }); txPlace(o, b, pad + t, 0); return o; }
  }
  throw new TxError('internal: unknown node ' + n.t);
}
function txFontBox(n, style, ctx) {
  const sz = txSz(style); const fam = n.fam; const walk = (node) => {
    if (node.t === 'group') return { ...node, list: node.list.map((a) => ({ ...a, nuc: walk(a.nuc), sup: a.sup, sub: a.sub })) };
    if (node.t === 'sym' && (/^[A-Za-z0-9]$/.test(node.u))) {
      const grp = { rm: 'rm', bf: 'bf', itl: 'itl', sf: 'sf', tt: 'tt', bb: 'bb', cal: 'cal', it: 'it' }[fam]; const isL = /[A-Za-z]/.test(node.u);
      let u = node.u; if (fam === 'bb' && /[A-Z]/.test(u)) u = Array.from(TX_BB)[u.charCodeAt(0) - 65]; if (fam === 'cal' && /[A-Z]/.test(u)) u = Array.from(TX_CAL)[u.charCodeAt(0) - 65];
      const key = node.u; const g = (fam === 'rm' && isL) ? 'rmL' : grp; return { ...node, u, fam, grp: TXM[g] && TXM[g][key] ? g : (TXM.rm[key] ? 'rm' : 'it'), m: key, bold: n.boldsym };
    }
    if (node.t === 'sym' && n.boldsym) return { ...node, fam: 'bf' };
    return node;
  };
  return txNucleus(walk(n.body), style, ctx);
}
function txAtom(a, style, ctx, cls) {
  const sz = txSz(style), P = txP(style);
  const nucNode = a.nuc;
  let nuc = txNucleus(nucNode, style, ctx, a);
  if (!a.sup && !a.sub) { if (nuc.isChar && nuc.ic) { const o = txBox(nuc.w + nuc.ic, nuc.h, nuc.d); txPlace(o, nuc, 0, 0); return o; } return nuc; }
  const isOp = a.cls === 'op';
  const limits = isOp && (a.limitsMod ? a.limitsMod === 'limits' : (a.fn ? a.lim && txLvl(style) === 0 : (nuc.bigop && !TX_NOLIM.has(nucNode.m) && txLvl(style) === 0) || (!nuc.bigop && a.lim)));
  const ssup = a.sup ? txLayout([{ t: 'atom', cls: 'ord', nuc: a.sup }], txSup(style), ctx) : null;
  const ssub = a.sub ? txLayout([{ t: 'atom', cls: 'ord', nuc: a.sub }], txSub(style), ctx) : null;
  const sp = 0.05; // scriptspace 0.5pt (absolute)
  const theta = P.theta;
  if (limits) {
    const delta = nuc.ic || 0; const W = Math.max(nuc.w, ssup ? ssup.w : 0, ssub ? ssub.w : 0); const o = txBox(W, nuc.h, nuc.d);
    txPlace(o, nuc, (W - nuc.w) / 2, 0); let top = nuc.h, bot = nuc.d;
    if (ssup) { const k = Math.max(P.bos1, P.bos3 - ssup.d); const y = -(nuc.h + k + ssup.d); txPlace(o, ssup, (W - ssup.w) / 2 + delta / 2, y); o.h = nuc.h + k + ssup.d + ssup.h + P.bos5; }
    if (ssub) { const k = Math.max(P.bos2, P.bos4 - ssub.h); const y = nuc.d + k + ssub.h; txPlace(o, ssub, (W - ssub.w) / 2 - delta / 2, y); o.d = nuc.d + k + ssub.h + ssub.d + P.bos5; }
    return o;
  }
  // Rule 18: scripts beside the nucleus
  let u = 0, v = 0; const charNuc = nuc.isChar;
  if (!charNuc) { u = nuc.h - txP(txSup(style)).supdrop; v = nuc.d + txP(txSub(style)).subdrop; }
  const xh = P.xh; const delta = nuc.ic || 0;
  const baseW = nuc.w - (nuc.bigop && ssub ? delta : 0); const o = txBox(0, nuc.h, nuc.d); txPlace(o, nuc, 0, 0);
  const supP = (txLvl(style) === 0 && !txCr(style)) ? P.sup1 : txCr(style) ? P.sup3 : P.sup2;
  if (ssup && !ssub) {
    u = Math.max(u, supP, ssup.d + Math.abs(xh) / 4); txPlace(o, ssup, baseW + delta, -u); o.w = baseW + delta + ssup.w + sp; o.h = Math.max(o.h, u + ssup.h);
  } else if (ssub && !ssup) {
    v = Math.max(v, P.sub1, ssub.h - 0.8 * xh); txPlace(o, ssub, baseW, v); o.w = baseW + ssub.w + sp; o.d = Math.max(o.d, v + ssub.d);
  } else {
    u = Math.max(u, supP, ssup.d + Math.abs(xh) / 4); v = Math.max(v, P.sub2);
    const gap = (u - ssup.d) - (ssub.h - v);
    if (gap < 4 * theta) { v += 4 * theta - gap; const psi = 0.8 * xh - (u - ssup.d); if (psi > 0) { u += psi; v -= psi; } }
    txPlace(o, ssup, baseW + delta, -u); txPlace(o, ssub, baseW, v); o.w = baseW + Math.max(delta + ssup.w, ssub.w) + sp; o.h = Math.max(o.h, u + ssup.h); o.d = Math.max(o.d, v + ssub.d);
  }
  return o;
}
function txFrac(n, style, ctx) {
  let st = style;  if (n.force !== null && n.force !== undefined) st = n.force | (style & 1);
  const sz = txSz(st), P = txP(st), theta = P.theta;
  const num = txLayout([{ t: 'atom', cls: 'ord', nuc: n.num }], txNum(st), ctx), den = txLayout([{ t: 'atom', cls: 'ord', nuc: n.den }], txDen(st), ctx);
  const disp = txLvl(st) === 0; const axis = P.axis;
  let u, v, W = Math.max(num.w, den.w);
  if (n.bar) {
    u = (disp ? P.num1 : P.num2); v = (disp ? P.denom1 : P.denom2); const phi = disp ? 3 * theta : theta;
    if ((u - num.d) - (axis + theta / 2) < phi) u += phi - ((u - num.d) - (axis + theta / 2));
    if ((axis - theta / 2) - (den.h - v) < phi) v += phi - ((axis - theta / 2) - (den.h - v));
  } else {
    u = (disp ? P.num1 : P.num3); v = (disp ? P.denom1 : P.denom2); const phi = disp ? 7 * theta : 3 * theta;
    const gap = (u - num.d) - (den.h - v); if (gap < phi) { const e = (phi - gap) / 2; u += e; v += e; }
  }
  const nd = 0.12; const inner = txBox(W, Math.max(num.h + u, 0), den.d + v); // null delimiter space added below
  txPlace(inner, num, (W - num.w) / 2, -u); txPlace(inner, den, (W - den.w) / 2, v);
  if (n.bar) inner.ops.push({ k: 'r', x: 0, y: -(axis + theta / 2), w: W, h: theta });
  inner.h = num.h + u; inner.d = den.d + v;
  let box;
  if (n.delims) { const D = (disp ? P.delim1 : P.delim2); const l = txDelim(n.delims[0], D, axis, false, sz), r = txDelim(n.delims[1], D, axis, true, sz); box = txBox(l.w + inner.w + r.w, Math.max(inner.h, l.h), Math.max(inner.d, l.d)); txPlace(box, l, 0, 0); txPlace(box, inner, l.w, 0); txPlace(box, r, l.w + inner.w, 0); }
  else { box = txBox(inner.w + 2 * nd, inner.h, inner.d); txPlace(box, inner, nd, 0); }
  return box;
}
function txDelimSize(h, d, sz, axis) { // TeX rule for \left..\right: smallest delimiter of at least this total height
  const delta = Math.max(h - axis, d + axis); const need = Math.max(delta * 2 * 0.901, delta * 2 - 0.5 * sz);
  const sizes = [1, 1.2, 1.8, 2.4, 3]; const pick = sizes.find((x) => x * sz >= need - 1e-9); return pick ? pick * sz : need;
}
function txSqrt(n, style, ctx) {
  const P = txP(style), sz = txSz(style), theta = P.theta;
  const body = txLayout([{ t: 'atom', cls: 'ord', nuc: n.body }], txCramp(style), ctx);
  const phi = txLvl(style) === 0 ? P.xh : theta; let psi = theta + Math.abs(phi) / 4;
  const need = body.h + body.d + psi + theta; const sizes = [1, 1.2, 1.8, 2.4, 3], widths = [0.833, 1.0, 1.0, 1.0, 1.0];
  const k = sizes.findIndex((x) => x * sz >= need + 0.002); const T = k < 0 ? need : sizes[k] * sz; const hd = body.h + body.d, lv = txLvl(style); const tbl = lv < 2 ? [[0.95, 0.8333], [2.95, 1], [1e9, 1.0556]] : lv === 2 ? [[0.6, 0.6569], [0.9, 0.8333], [2.0, 0.7861], [1e9, 0.8292]] : [[0.4, 0.5486], [0.6, 0.6569], [0.9, 0.8333], [1.4, 0.5615], [1e9, 0.5923]]; const signW = tbl.find((r) => hd < r[0] + 0.049)[1];
  psi += Math.max(0, T - need) / 2;
  const ruleTop = -(body.h + psi + theta);
  const o = txBox(signW + body.w, body.h + psi + 2 * theta, Math.max(body.d, T + ruleTop));
  const tickY = ruleTop + Math.min(0.5 * sz + 0.02, 0.45 * T);
  o.ops.push({ k: 'p', d: `M ${0.03 * sz} ${tickY} L ${0.14 * sz} ${tickY - 0.05 * sz} L ${0.38 * signW} ${ruleTop + T - 0.01 * sz} L ${signW} ${ruleTop + theta / 2} L ${signW + body.w} ${ruleTop + theta / 2}`, sw: theta, fill: false });
  txPlace(o, body, signW, 0);
  if (!n.idx) return o;
  const idx = txLayout([{ t: 'atom', cls: 'ord', nuc: n.idx }], 6, ctx); const extra = idx.w - 5 / 18 * sz; const raise = 0.6 * (o.h - o.d);
  const o2 = txBox(o.w + extra, Math.max(o.h, raise + idx.h), o.d); txPlace(o2, o, extra, 0); txPlace(o2, idx, Math.max(0, -extra) * 0, -raise);
  return o2;
}
function txPath(parts) { return parts; }
function txDelim(d, H, axis, isClose, sz) { // H total height (em, already scaled), centred on the axis
  const map = isClose ? TX_CLOSE : TX_OPEN; const g = d === '' ? '' : (map[d] !== undefined ? map[d] : d);
  if (g === '' || d === '.') return txBox(0.12 * sz, H / 2 + axis, H / 2 - axis);
  const sizes = [1, 1.2, 1.8, 2.4, 3]; const lvl = sizes.findIndex((s) => s * sz >= H - 1e-9); const level = lvl < 0 ? 5 : lvl; const effH = lvl < 0 ? H : sizes[lvl] * sz;
  const names = { '(': '(', ')': ')', '[': '[', ']': ']', '{': 'lbrace', '}': 'rbrace', '⟨': 'langle', '⟩': 'rangle', '|': 'vert', '‖': 'Vert', '⌊': 'lfloor', '⌋': 'rfloor', '⌈': 'lceil', '⌉': 'rceil', '/': 'slash' };
  const nm = names[g] || '('; const dm = TXD[nm] ? (level === 5 ? [TXE[nm] || TXD[nm][4][0]] : TXD[nm][level]) : [500, 0, 0]; const w = dm[0] / 1000 * sz;
  const b = txBox(w, effH / 2 + axis, effH / 2 - axis); const top = -(effH / 2 + axis), bot = effH / 2 - axis, mid = (top + bot) / 2, t = 0.04 * sz;
  const L = (x1, y1, x2, y2) => `M ${x1} ${y1} L ${x2} ${y2}`;
  let path = '';
  if (g === '(' ) path = `M ${w * 0.8} ${top} C ${w * 0.15} ${top + effH * 0.25} ${w * 0.15} ${bot - effH * 0.25} ${w * 0.8} ${bot}`;
  else if (g === ')') path = `M ${w * 0.2} ${top} C ${w * 0.85} ${top + effH * 0.25} ${w * 0.85} ${bot - effH * 0.25} ${w * 0.2} ${bot}`;
  else if (g === '[') path = `M ${w * 0.8} ${top} L ${w * 0.25} ${top} L ${w * 0.25} ${bot} L ${w * 0.8} ${bot}`;
  else if (g === ']') path = `M ${w * 0.2} ${top} L ${w * 0.75} ${top} L ${w * 0.75} ${bot} L ${w * 0.2} ${bot}`;
  else if (g === '{') path = `M ${w * 0.8} ${top} C ${w * 0.45} ${top} ${w * 0.5} ${top + effH * 0.15} ${w * 0.5} ${top + effH * 0.3} L ${w * 0.5} ${mid - effH * 0.06} C ${w * 0.5} ${mid - effH * 0.02} ${w * 0.35} ${mid} ${w * 0.15} ${mid} C ${w * 0.35} ${mid} ${w * 0.5} ${mid + effH * 0.02} ${w * 0.5} ${mid + effH * 0.06} L ${w * 0.5} ${bot - effH * 0.3} C ${w * 0.5} ${bot - effH * 0.15} ${w * 0.45} ${bot} ${w * 0.8} ${bot}`;
  else if (g === '}') path = `M ${w * 0.2} ${top} C ${w * 0.55} ${top} ${w * 0.5} ${top + effH * 0.15} ${w * 0.5} ${top + effH * 0.3} L ${w * 0.5} ${mid - effH * 0.06} C ${w * 0.5} ${mid - effH * 0.02} ${w * 0.65} ${mid} ${w * 0.85} ${mid} C ${w * 0.65} ${mid} ${w * 0.5} ${mid + effH * 0.02} ${w * 0.5} ${mid + effH * 0.06} L ${w * 0.5} ${bot - effH * 0.3} C ${w * 0.5} ${bot - effH * 0.15} ${w * 0.55} ${bot} ${w * 0.2} ${bot}`;
  else if (g === '|' ) path = L(w / 2, top, w / 2, bot);
  else if (g === '‖') path = L(w * 0.35, top, w * 0.35, bot) + ' ' + L(w * 0.65, top, w * 0.65, bot);
  else if (g === '⟨') path = `M ${w * 0.75} ${top} L ${w * 0.25} ${mid} L ${w * 0.75} ${bot}`;
  else if (g === '⟩') path = `M ${w * 0.25} ${top} L ${w * 0.75} ${mid} L ${w * 0.25} ${bot}`;
  else if (g === '⌊') path = `M ${w * 0.3} ${top} L ${w * 0.3} ${bot} L ${w * 0.75} ${bot}`;
  else if (g === '⌋') path = `M ${w * 0.25} ${bot} L ${w * 0.7} ${bot} L ${w * 0.7} ${top}`;
  else if (g === '⌈') path = `M ${w * 0.3} ${bot} L ${w * 0.3} ${top} L ${w * 0.75} ${top}`;
  else if (g === '⌉') path = `M ${w * 0.25} ${top} L ${w * 0.7} ${top} L ${w * 0.7} ${bot}`;
  else if (g === '/') path = L(w * 0.1, bot, w * 0.9, top);
  else path = L(w / 2, top, w / 2, bot);
  b.ops.push({ k: 'p', d: path, sw: g === '(' || g === ')' || g === '{' || g === '}' ? 0.05 * sz : t, fill: false });
  return b;
}
function txLeft(n, style, ctx) {
  const sz = txSz(style), axis = txP(style).axis; const parts = n.parts.map((l) => txLayout(l, style, ctx));
  let h = 0, d = 0; for (const b of parts) { h = Math.max(h, b.h); d = Math.max(d, b.d); }
  const Hs = txDelimSize(h, d, sz, axis); const items = [txDelim(n.open, Hs, axis, false, sz)];
  parts.forEach((b, i) => { items.push(b); if (i < n.mids.length) items.push(txDelim(n.mids[i], Hs, axis, false, sz)); });
  items.push(txDelim(n.close, Hs, axis, true, sz)); return txHcat(items);
}
function txOverUnder(n, style, ctx) {
  const sz = txSz(style), theta = txP(style).theta; const body = txLayout([{ t: 'atom', cls: 'ord', nuc: n.body }], style, ctx);
  const brace = n.kind === 'brace'; const W = brace ? Math.max(body.w, 1.8) : body.w; const o = txBox(W, body.h, body.d); txPlace(o, body, (W - body.w) / 2, 0);
  if (n.t === 'over') {
    if (!brace) { const y = -(body.h + 3 * theta); o.ops.push({ k: 'r', x: 0, y: y - theta, w: body.w, h: theta }); o.h = body.h + 5 * theta; }
    else { o.ops.push({ k: 'p', d: txBracePath(0, -(body.h + 0.1), W, 0.5, true), sw: 0.04, fill: false }); o.h = body.h + 0.72; }
  } else if (!brace) { const y = body.d + 3 * theta; o.ops.push({ k: 'r', x: 0, y, w: body.w, h: theta }); o.d = body.d + 5 * theta; }
  else { o.ops.push({ k: 'p', d: txBracePath(0, body.d + 0.1, W, 0.5, false), sw: 0.04, fill: false }); o.d = body.d + 0.72; }
  return o;
}
function txBracePath(x, y, w, h, up) { // brace opening away from the body; (x,y) at body side; h is signed offset
  const s = up ? -1 : 1; const m = x + w / 2, e = 0.12; const hh = Math.abs(h) * s; const yy = y, ty = y + hh; const r = Math.min(0.1, w / 6);
  return `M ${x} ${yy} C ${x} ${yy + hh * 0.5} ${x + r} ${ty} ${x + 2 * r} ${ty} L ${m - r} ${ty} C ${m} ${ty} ${m} ${ty + hh * 0.3} ${m} ${ty + hh * 0.5} C ${m} ${ty + hh * 0.3} ${m} ${ty} ${m + r} ${ty} L ${x + w - 2 * r} ${ty} C ${x + w - r} ${ty} ${x + w} ${yy + hh * 0.5} ${x + w} ${yy}`.replace(/ M/g, ' M');
}
function txAccent(n, style, ctx) {
  const sz = txSz(style), theta = 0.04 * sz; const body = txLayout([{ t: 'atom', cls: 'ord', nuc: n.body }], txCramp(style), ctx);
  const k = n.kind; const wide = /^wide/.test(k); const single = n.body.t === 'group' && n.body.list.length === 1 && n.body.list[0].nuc && n.body.list[0].nuc.t === 'sym';
  const HA = { hat: 0.6944, bar: 0.5678, vec: 0.7144, dot: 0.6679, ddot: 0.6679, tilde: 0.6679, check: 0.6285, breve: 0.6944, acute: 0.6944, grave: 0.6944, widehat: body.w < 0.6 ? 0.7222 : 0.75, widetilde: body.w < 0.6 ? 0.7222 : 0.75, overrightarrow: 0.7974, overleftarrow: 0.7974 };
  const hA = (HA[k] || 0.6944) * sz; const xh = txP(style).xh; const delta = Math.min(body.h, xh); const total = body.h - delta + hA;
  const o = txBox(body.w, total, body.d); txPlace(o, body, 0, 0);
  const skew = single && body.kids.length && body.kids[0].b && body.kids[0].b.isChar && body.kids[0].b.ic !== undefined && n.body.list[0].nuc.fam === 'it' ? 0.05 * sz : 0;
  const cx = body.w / 2 + (wide ? 0 : skew); const top = -total; const aw = wide || k === 'overrightarrow' || k === 'overleftarrow' ? Math.max(body.w, 0.5 * sz) / 2 : (k === 'bar' ? 0.25 : 0.25) * sz; const mh = 0.13 * sz; let path = '';
  if (k === 'hat' || k === 'widehat') path = `M ${cx - aw * 0.85} ${top + mh} L ${cx} ${top} L ${cx + aw * 0.85} ${top + mh}`;
  else if (k === 'check') path = `M ${cx - aw * 0.85} ${top} L ${cx} ${top + mh} L ${cx + aw * 0.85} ${top}`;
  else if (k === 'bar') { o.ops.push({ k: 'r', x: cx - aw, y: top, w: aw * 2, h: theta }); return o; }
  else if (k === 'tilde' || k === 'widetilde') path = `M ${cx - aw * 0.85} ${top + mh * 0.8} C ${cx - aw * 0.45} ${top - mh * 0.2} ${cx - aw * 0.1} ${top + mh * 0.9} ${cx + aw * 0.15} ${top + mh * 0.5} C ${cx + aw * 0.45} ${top + mh * 0.05} ${cx + aw * 0.6} ${top + mh * 0.8} ${cx + aw * 0.85} ${top + mh * 0.2}`;
  else if (k === 'vec' || k === 'overrightarrow') { const yy = top + 0.075 * sz; path = `M ${cx - aw} ${yy} L ${cx + aw} ${yy} M ${cx + aw - 0.09 * sz} ${yy - 0.06 * sz} L ${cx + aw} ${yy} L ${cx + aw - 0.09 * sz} ${yy + 0.06 * sz}`; }
  else if (k === 'overleftarrow') { const yy = top + 0.075 * sz; path = `M ${cx - aw} ${yy} L ${cx + aw} ${yy} M ${cx - aw + 0.09 * sz} ${yy - 0.06 * sz} L ${cx - aw} ${yy} L ${cx - aw + 0.09 * sz} ${yy + 0.06 * sz}`; }
  else if (k === 'dot' || k === 'ddot') { const r = 0.04 * sz; const xs = k === 'dot' ? [cx] : [cx - 0.1 * sz, cx + 0.1 * sz]; for (const xx of xs) o.ops.push({ k: 'c', cx: xx, cy: top + r, r }); return o; }
  else if (k === 'breve') path = `M ${cx - aw * 0.8} ${top} C ${cx - aw * 0.5} ${top + mh * 1.3} ${cx + aw * 0.5} ${top + mh * 1.3} ${cx + aw * 0.8} ${top}`;
  else if (k === 'acute') path = `M ${cx - 0.05 * sz} ${top + mh} L ${cx + 0.08 * sz} ${top}`; else if (k === 'grave') path = `M ${cx + 0.05 * sz} ${top + mh} L ${cx - 0.08 * sz} ${top}`;
  o.ops.push({ k: 'p', d: path, sw: theta, fill: false }); return o;
}
function txStack(n, style, ctx) {
  const sz = txSz(style); const base = txLayout([{ t: 'atom', cls: 'ord', nuc: n.base }], style, ctx);
  const sub = txSup(style); const top = n.top ? txLayout([{ t: 'atom', cls: 'ord', nuc: n.top }], sub, ctx) : null; const bot = n.bottom ? txLayout([{ t: 'atom', cls: 'ord', nuc: n.bottom }], txSub(style), ctx) : null;
  const W = Math.max(base.w, top ? top.w : 0, bot ? bot.w : 0); const o = txBox(W, base.h, base.d); txPlace(o, base, (W - base.w) / 2, 0);
  if (top) { const k = 0.111 * sz; txPlace(o, top, (W - top.w) / 2, -(base.h + k + top.d)); o.h = base.h + k + top.d + top.h; }
  if (bot) { const k = 0.2 * sz; txPlace(o, bot, (W - bot.w) / 2, base.d + k + bot.h); o.d = base.d + k + bot.h + bot.d; }
  return o;
}
function txVcatCentered(rows, gap, sz, style) { const axis = txP(style).axis; const W = Math.max(...rows.map((r) => r.w)); const o = txBox(W, 0, 0); let y = 0; rows.forEach((r, i) => { y = i === 0 ? r.h : y + rows[i - 1].d + gap + r.h; txPlace(o, r, (W - r.w) / 2, y); }); const total = y + rows[rows.length - 1].d, shift = total / 2 - axis; for (const k of o.kids) k.dy -= total - shift; o.h = total - shift; o.d = shift; return o; }
function txMatrix(n, style, ctx) {
  const P = txP(style), sz = txSz(style); const cst = n.small ? 4 : n.display ? 0 : 2; const cstyle = (txLvl(style) >= 2 ? style : cst) | (style & 1);
  const stretch = n.cases ? 1.2 : 1; const nc = Math.max(...n.rows.map((r) => r.length)); const strutH = 0.7 * 1.2 * stretch * sz, strutD = 0.3 * 1.2 * stretch * sz;
  const cells = n.rows.map((r) => r.map((c, j) => txLayout(n.aligned && j % 2 === 1 ? [{ t: 'atom', cls: 'ord', nuc: { t: 'empty' } }, ...c] : c, cstyle, ctx)));
  const colW = Array(nc).fill(0); cells.forEach((r) => r.forEach((c, j) => { colW[j] = Math.max(colW[j], c.w); }));
  const rowH = cells.map((r) => Math.max(strutH, ...r.map((c) => c.h))), rowD = cells.map((r) => Math.max(strutD, ...r.map((c) => c.d)));
  const spec = n.spec ? n.spec.split('') : null; const al = (j) => (spec ? spec[j] || 'c' : n.align === 'rl' ? (j % 2 === 0 ? 'r' : 'l') : n.align === 'l' ? 'l' : 'c');
  const colX = []; let x = n.spec ? 0.5 * sz : 0; for (let j = 0; j < nc; j++) { colX.push(x); const sep = n.aligned ? (j % 2 === 0 ? 0 : 1 * sz) : sz; x += colW[j] + (j < nc - 1 ? sep : 0); }
  const W = x + (n.spec ? 0.5 * sz : 0); const body = txBox(W, 0, 0); let y = 0;
  cells.forEach((r, i) => { y = i === 0 ? rowH[0] : y + rowD[i - 1] + rowH[i] + (n.aligned || n.display ? 0.3 * sz : 0); r.forEach((c, j) => { const a = al(j); const dx = a === 'l' ? 0 : a === 'r' ? colW[j] - c.w : (colW[j] - c.w) / 2; txPlace(body, c, colX[j] + dx, y); }); });
  const total = y + rowD[rowD.length - 1] + 0; const shift = total / 2 - P.axis; // vcenter: middle of the matrix on the math axis
  const mid = txBox(W, total - shift, shift); for (const k of body.kids) k.dy -= (total - shift);
  mid.kids = body.kids;
  const Hs = txDelimSize(total - shift, shift, sz, P.axis); const items = [];
  if (n.delims[0]) items.push(txDelim(n.delims[0], Hs, P.axis, false, sz)); items.push(mid); if (n.delims[1]) items.push(txDelim(n.delims[1], Hs, P.axis, true, sz));
  return txHcat(items);
}
function txFlatten(b, x, y, out) { for (const o of b.ops) out.push({ ...o, x: (o.x || 0) + x, y: (o.y || 0) + y, cx: o.cx !== undefined ? o.cx + x : undefined, cy: o.cy !== undefined ? o.cy + y : undefined, dx: x, dy: y }); for (const k of b.kids) txFlatten(k.b, x + k.dx, y + k.dy, out); }
function texToSvg(src, o = {}) {
  const list = txParse(src); const style = o.display === false ? 2 : 0;
  const box = txLayout(list, style, {});
  const ops = []; txFlatten(box, 0, 0, ops);
  const pad = 0.1, S = 100; const W = box.w + 2 * pad, H = box.h + box.d + 2 * pad;
  const num = (v) => Math.round(v * S * 100) / 100; let body = '';
  const FAM = { it: 'font-style="italic"', itl: 'font-style="italic"', rm: '', bf: 'font-weight="bold"', sf: 'font-family="Arial, Helvetica, sans-serif"', tt: 'font-family="Courier New, monospace"', cal: '', bb: '' };
  for (const p of ops) {
    if (p.k === 't') { const yy = p.cy !== undefined ? p.cy : p.y; body += `<text x="${num(p.x + p.w / 2 + pad)}" y="${num(yy + box.h + pad)}" text-anchor="middle"${p.cy !== undefined ? ' dominant-baseline="central"' : ''} font-size="${num(p.size)}" ${FAM[p.fam] || ''}>${txEsc(p.s)}</text>`; }
    else if (p.k === 'r') body += `<rect x="${num(p.x + pad)}" y="${num(p.y + box.h + pad)}" width="${num(p.w)}" height="${num(p.h)}"/>`;
    else if (p.k === 'c') body += `<circle cx="${num(p.cx + pad)}" cy="${num(p.cy + box.h + pad)}" r="${num(p.r)}"/>`;
    else if (p.k === 'p') { const d = p.d.replace(/-?\d*\.?\d+(e-?\d+)?/g, (m, _e, off, str) => m); const mapped = txMapPath(p.d, p.dx + pad, p.dy + box.h + pad, S); body += `<path d="${mapped}" fill="none" stroke="currentColor" stroke-width="${num(p.sw)}" stroke-linecap="round" stroke-linejoin="round"/>`; }
  }
  const fs = o.size || 24;
  const label = String(src).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}" viewBox="0 0 ${num(W)} ${num(H)}" width="${Math.round(W * fs * 10) / 10}" height="${Math.round(H * fs * 10) / 10}" font-family="'Latin Modern Math','STIX Two Math','Cambria Math','Times New Roman',serif" fill="currentColor"><title>${label}</title>${body}</svg>`, w: box.w, h: box.h, d: box.d };
}
function txMapPath(d, dx, dy, S) { const t = d.trim().split(/\s+/); let out = [], i = 0, isX = true; for (const tok of t) { if (/^[A-Za-z]$/.test(tok)) { out.push(tok); isX = true; continue; } const v = parseFloat(tok); out.push(Math.round(((isX ? v + dx : v + dy)) * S * 100) / 100); isX = !isX; } return out.join(' '); }
const txEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ===== tool definitions =====
const rxOpts = (py) => [
  { id: 'i', label: 'Case-insensitive (i)', type: 'checkbox', def: false }, { id: 'm', label: 'Multiline: ^ and $ match at line breaks (m)', type: 'checkbox', def: false },
  { id: 's', label: 'Dot matches newline (s)', type: 'checkbox', def: false }, { id: 'x', label: 'Verbose: ignore white space and # comments (x)', type: 'checkbox', def: false },
  ...(py ? [{ id: 'a', label: 'ASCII-only \\w \\d \\s \\b (a)', type: 'checkbox', def: false }] : []),
  { id: 'repl', label: py ? 'Replacement (re.sub template: \\1, \\g<name>, \\n)' : 'Replacement (PCRE2 substitute: $1, ${name}, $$)', type: 'text', def: '' },
];
T.push({
  id: 'pcre-regex-tester', cat: 'Regex', title: 'PCRE Regex Tester (PCRE2 Syntax, Lookbehind, Recursion)',
  desc: 'Test a PCRE2-style pattern with a hand-written backtracking engine: named groups, lookahead and lookbehind, atomic and possessive quantifiers, backreferences, conditionals, recursion and \\K. Offline.',
  inputs: 2, labels: ['Pattern (PCRE2 syntax, no delimiters)', 'Subject text'], placeholder: ['(?<year>\\d{4})-(?<mon>\\d\\d)', 'Text to search'],
  sample: '(?<year>\\d{4})-(?<mon>\\d\\d)-(?<day>\\d\\d)\\b(?!-)', sample2: 'Released 2024-05-17, patched 2024-06-02, typo 2024-07-1.',
  opts: rxOpts(false), run: (inp, o) => rxRun('pcre', inp, o),
});
T.push({
  id: 'python-re-regex-tester', cat: 'Regex', title: 'Python re Regex Tester (Python 3.12 Syntax, finditer and sub)',
  desc: 'Test a pattern with Python re semantics without Python: (?P<name>), (?P=name), lookbehind that must be fixed width, atomic groups, possessive quantifiers, flags, finditer and re.sub templates.',
  inputs: 2, labels: ['Pattern (Python re syntax, no quotes)', 'Subject text'], placeholder: ['(?P<year>\\d{4})-(?P<mon>\\d\\d)', 'Text to search'],
  sample: '(?P<year>\\d{4})-(?P<mon>\\d\\d)-(?P<day>\\d\\d)\\b(?!-)', sample2: 'Released 2024-05-17, patched 2024-06-02, typo 2024-07-1.',
  opts: rxOpts(true), run: (inp, o) => rxRun('python', inp, o),
});
T.push({
  id: 'typescript-to-javascript', cat: 'Code Formatters', title: 'TypeScript to JavaScript Converter (Strip Types, Enums, Parameter Properties)',
  desc: 'Remove TypeScript syntax and get plain modern JavaScript: annotations, interfaces, type aliases, generics, enums, as and satisfies, access modifiers, optional parameters, parameter properties. Unsupported syntax is rejected.',
  inputs: 1, labels: ['TypeScript'], sample: `import { readFileSync, type PathLike } from 'node:fs';
import type { Stats } from 'node:fs';

interface Point<T = number> { x: T; y: T; label?: string }
type Id = string | number;
enum Color { Red, Green = 5, Blue }

abstract class Shape {
  private static count = 0;
  protected constructor(public readonly name: string, private id: Id = 1) { Shape.count++; }
  abstract area(): number;
  describe(): string { return \`\${this.name} #\${this.id}: \${this.area().toFixed(2)}\`; }
}

class Circle extends Shape implements Iterable<number> {
  constructor(private r: number) { super('circle'); }
  area(): number { return Math.PI * this.r ** 2; }
  *[Symbol.iterator](): Iterator<number> { yield this.r; }
}

function first<T extends object>(items: T[], pick?: (x: T) => boolean): T | undefined {
  return pick ? items.find(pick) : items[0];
}

const pts = [{ x: 1, y: 2 }] as Point[];
const p = first<Point>(pts)!;
const label = (p.label ?? 'none') satisfies string;
console.log(new Circle(2).describe(), Color.Green, Color[0], p, label);
`, opts: [{ id: 'keep', label: 'Keep unused imports (do not remove names only used as types)', type: 'checkbox', def: false }],
  run: ([src], o) => { try { return tsStrip(src, { keepImports: o.keep }); } catch (e) { if (e instanceof TsFail) throw new Error(e.message); throw e; } },
});
T.push({
  id: 'wasm-wat-converter', cat: 'Dev Extras', title: 'WebAssembly Text and Binary Converter (WAT to WASM, WASM to WAT)',
  desc: 'Assemble WAT text into a .wasm binary or disassemble a .wasm (hex or base64) into WAT. Hand-written for the core instruction set plus bulk memory, reference types, multi-value and sign extension. Validates with the browser.',
  inputs: 1, labels: ['WAT text, or a WebAssembly binary as hex or base64'], sample: `(module
  (memory (export "mem") 1)
  (data (i32.const 0) "Hello")
  (func $fac (export "fac") (param $n i64) (result i64)
    (if (result i64) (i64.eqz (local.get $n))
      (then (i64.const 1))
      (else (i64.mul (local.get $n) (call $fac (i64.sub (local.get $n) (i64.const 1)))))))
  (func (export "sum") (param $n i32) (result i32) (local $i i32) (local $acc i32)
    (block $done
      (loop $next
        (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
        (local.set $acc (i32.add (local.get $acc) (local.get $i)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $next)))
    (local.get $acc)))`,
  opts: [{ id: 'dir', label: 'Direction', type: 'select', choices: ['auto', 'wat to wasm', 'wasm to wat'], def: 'auto' }],
  run: ([t], o) => {
    const s = t.trim(); if (!s) throw new Error('Paste WAT text or a hex/base64 WebAssembly binary.');
    const toWasm = o.dir === 'wat to wasm' || (o.dir === 'auto' && /^(\(|;;)/.test(s));
    try {
      if (toWasm) {
        const bytes = watToWasm(s); let v = 'Validation: not run (WebAssembly is not available here).';
        if (typeof WebAssembly !== 'undefined') { try { new WebAssembly.Module(bytes); v = 'Validation (WebAssembly.Module in this browser): OK'; } catch (e) { v = 'Validation (WebAssembly.Module in this browser) FAILED: ' + e.message; } }
        return { text: `${bytes.length} bytes assembled. ${v}\n\nHex:\n${waHex(bytes)}\n\nBase64:\n${pgpB64(bytes)}`, blob: new Blob([bytes], { type: 'application/wasm' }), filename: 'module.wasm' };
      }
      return wasmToWat(waParseBinaryInput(s));
    } catch (e) { if (e instanceof WaError) throw new Error(e.message); throw e; }
  },
});
T.push({
  id: 'javascript-ast-explorer', cat: 'Dev Extras', title: 'JavaScript AST Explorer (ESTree Tree View)',
  desc: 'Parse JavaScript (ES2022 scripts) into an ESTree syntax tree with node types, properties and source ranges, shown as an indented tree or JSON. Also explores JSON. Hand-written parser.',
  inputs: 1, labels: ['JavaScript (or JSON) source'], sample: 'const { a, ...rest } = obj ?? {};\nasync function f(x = 1, ...ys) {\n  for (const y of ys) if (y?.ok) await g(`v=${y.v}`, x);\n  return class extends Base { #p = 1; get p() { return this.#p } };\n}\n',
  opts: [{ id: 'lang', label: 'Language', type: 'select', choices: ['javascript', 'json'], def: 'javascript' }, { id: 'fmt', label: 'Output', type: 'select', choices: ['tree', 'ESTree JSON'], def: 'tree' }, { id: 'pos', label: 'Show source ranges [start-end]', type: 'checkbox', def: true }],
  run: ([src], o) => {
    if (o.lang === 'json') {
      let v; try { v = JSON.parse(src); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
      const L = []; const walk = (x, ind, k) => { if (Array.isArray(x)) { L.push(`${ind}${k}: Array(${x.length})`); x.forEach((c, i) => walk(c, ind + '  ', `[${i}]`)); } else if (x && typeof x === 'object') { L.push(`${ind}${k}: Object`); for (const [kk, c] of Object.entries(x)) walk(c, ind + '  ', JSON.stringify(kk)); } else L.push(`${ind}${k}: ${typeof x} ${JSON.stringify(x)}`); };
      walk(v, '', 'root'); return L.join('\n');
    }
    let ast; try { ast = astParse(src); } catch (e) { if (e instanceof AstError) throw new Error(e.message); throw e; }
    if (o.fmt === 'ESTree JSON') return JSON.stringify(ast, (k, v) => (typeof v === 'bigint' ? v + 'n' : v instanceof RegExp ? String(v) : (!o.pos && (k === 'start' || k === 'end')) || k === 'parenthesized' ? undefined : v), 2);
    return astPrint(ast, !!o.pos);
  },
});
T.push({
  id: 'javascript-obfuscator', cat: 'Dev Extras', title: 'JavaScript Obfuscator (Local Variables, String Array, Minify)',
  desc: 'Make JavaScript harder to read with token-level transforms that are safe without a full parser: rename local variables, move strings into an array, hex-escape strings and numbers, strip comments and white space.',
  inputs: 1, labels: ['JavaScript'], sample: `function greet(person, times) {
  var message = 'Hello, ' + person.name + '!';
  var out = [];
  for (var i = 0; i < times; i++) { out.push(message + ' (' + (i + 1) + ')'); }
  return out.join('\\n');
}
console.log(greet({ name: 'world' }, 3));
`,
  opts: [{ id: 'rename', label: 'Rename local variables and parameters (inside functions)', type: 'checkbox', def: true }, { id: 'stringArray', label: 'Move strings into one array', type: 'checkbox', def: true }, { id: 'escape', label: 'Hex-escape strings (when the array is off)', type: 'checkbox', def: false },
    { id: 'hexNumbers', label: 'Write integers as hex', type: 'checkbox', def: true }, { id: 'minify', label: 'Remove comments and extra white space', type: 'checkbox', def: true }, { id: 'seed', label: 'Seed (same seed, same output)', type: 'number', def: 1 }, { id: 'report', label: 'Add a comment listing what was and was not changed', type: 'checkbox', def: true }],
  run: ([src], o) => {
    if (!src.trim()) throw new Error('Paste some JavaScript.');
    let before = null; try { before = astParse(src); } catch { /* outside the parser subset: output cannot be re-checked */ }
    const r = jsObfuscate(src, { ...o, seed: +o.seed || 1 });
    let check = 'The output was not re-parsed (your code uses syntax outside the built-in checker).';
    if (before) { try { astParse(r.code); check = 'The output parses again with the built-in checker.'; } catch (e) { throw new Error('Internal check failed, nothing returned: the obfuscated code does not parse (' + e.message + ').'); } }
    const rep = o.report ? `/* obfuscated with token-level transforms only. ${r.notes.join(' ')} ${check} Run your tests on the result. */\n` : '';
    return rep + r.code;
  },
});
T.push({
  id: 'pgp-public-key-encrypt-decrypt', cat: 'Crypto', title: 'PGP Public Key Encrypt and Decrypt (gpg Compatible, RSA and ECDH)',
  desc: 'Encrypt a message to an armored OpenPGP public key (RSA, Curve25519, NIST P-256/384/521) or decrypt a gpg message with your private key. Hand-written OpenPGP, runs in your browser, keys never leave the page.',
  inputs: 3, labels: ['Text to encrypt, or the PGP MESSAGE to decrypt', 'Public key block (encrypt) or private key block (decrypt); several public keys allowed', 'Passphrase of the private key (decrypt only, leave empty if the key has none)'],
  sample: 'Meet me at noon.', sample2: "-----BEGIN PGP PUBLIC KEY BLOCK-----\n\nmDMEats7VBYJKwYBBAHaRw8BAQdAWLh8lyN/kl52/1GT3rQt6TUSMUh+74QJlZIa\nqhT1wZ60I1NpdGVmaWcgU2FtcGxlIDxzYW1wbGVAZXhhbXBsZS5vcmc+iJMEExYK\nADsWIQQrR+5zpOKYTHYLtw3BiGvdeoVQ+wUCats7VAIbAwULCQgHAgIiAgYVCgkI\nCwIEFgIDAQIeBwIXgAAKCRDBiGvdeoVQ+9+mAP40vo+jhZwBMfyHEyz7yl53bV6B\nRSW7uV8IqNTmxTObFgEA56KYxMD2zHYSZ1GRJqArBPw/XxTAHyMM1JVbCoz/wA+4\nOARq2ztUEgorBgEEAZdVAQUBAQdArmKwEOEEu2pTpB7VLMw7omXMktpvzIE85hoM\n7Zm+XjADAQgHiHgEGBYKACAWIQQrR+5zpOKYTHYLtw3BiGvdeoVQ+wUCats7VAIb\nDAAKCRDBiGvdeoVQ+wU6AP908ja2pc8rKRGkn/34KZlQSshNTU0Myo0nJymY66r2\nEQD/cEiHK3gaHs6kM7Yx+HNhdKlLVURAT0Tcqbw+pD+t/gY=\n=BBJO\n-----END PGP PUBLIC KEY BLOCK-----\n", sample3: '',
  opts: [{ id: 'mode', label: 'Action', type: 'select', choices: ['encrypt', 'decrypt'], def: 'encrypt' }],
  run: async ([msg, key, pass], o) => {
    if (!key.trim()) throw new Error('Paste an armored key block.');
    try {
      if (o.mode === 'encrypt') { const r = await pgpEncrypt(new TextEncoder().encode(msg), [key], { text: false }); return { text: r.armored + '\nEncrypted to: ' + r.recipients.map((k) => pgpHex(k.keyid).toUpperCase() + (k.algo === 18 ? ' (ECDH ' + k.curve.name + ')' : ' (RSA)')).join(', ') + '. Cipher AES-256, integrity protected (SEIPD v1).\nNot signed.', filename: 'message.asc', blob: new Blob([r.armored], { type: 'application/pgp-encrypted' }) }; }
      const r = await pgpDecrypt(msg, [key], pass); let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(r.data); } catch { text = null; }
      const note = r.notes.length ? '\n\n' + r.notes.join('\n') : '';
      if (text !== null) return { text: text + note, blob: new Blob([r.data]), filename: r.name || 'decrypted.txt' };
      return { text: `Binary content, ${r.data.length} bytes${r.name ? ' (' + r.name + ')' : ''}. Hex:\n${pgpHex(r.data.subarray(0, 4096))}${r.data.length > 4096 ? '...' : ''}${note}`, blob: new Blob([r.data]), filename: r.name || 'decrypted.bin' };
    } catch (e) { if (e instanceof Error) throw e; throw new Error(String(e)); }
  },
});
T.push({
  id: 'latex-equation-renderer', cat: 'Math & Science', title: 'LaTeX Equation Renderer to SVG (TeX Layout Rules)',
  desc: 'Typeset a LaTeX math formula to a scalable SVG: fractions, scripts, roots, sums and integrals with limits, Greek, delimiters, matrices, cases and accents. Layout follows TeX rules and Computer Modern metrics.',
  inputs: 1, labels: ['LaTeX math (without the surrounding $ signs)'], sample: 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}\\qquad \\sum_{n=0}^{\\infty}\\frac{x^n}{n!}=e^x\\qquad \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
  opts: [{ id: 'display', label: 'Display style (large operators, limits above and below)', type: 'checkbox', def: true }, { id: 'size', label: 'Font size in px', type: 'number', def: 28 }],
  run: (inp, o) => {
    let src = inp[0].trim(), display = !!o.display; if (!src) throw new Error('Enter a LaTeX formula.');
    let m; if ((m = /^\$\$([\s\S]*)\$\$$/.exec(src)) || (m = /^\\\[([\s\S]*)\\\]$/.exec(src))) { src = m[1].trim(); display = true; } else if ((m = /^\$([\s\S]*)\$$/.exec(src)) || (m = /^\\\(([\s\S]*)\\\)$/.exec(src))) { src = m[1].trim(); display = false; }
    let r; try { r = texToSvg(src, { display, size: Math.min(200, Math.max(8, +o.size || 28)) }); } catch (e) { if (e instanceof TxError) throw new Error('LaTeX: ' + e.message); throw e; }
    const html = `<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light dark"><body style="margin:14px;color:CanvasText;background:Canvas">${r.svg}`;
    return { text: r.svg, html, blob: new Blob([r.svg.replace('<svg ', '<svg color="#000" ')], { type: 'image/svg+xml' }), filename: 'equation.svg' };
  },
});
export default T;

// gap1.js: tools from the devstools.app gap audit (see peerreview/gap-audit.md). Zero dependencies, client-side only.
//
// Built here: jq-playground (json-query-transform), xlsx-to-json (excel-to-json), dns-resolution-simulator (dns-lookup-simulator),
//   sse-stream-parser (sse-stream-tester), tailwind-mesh-gradient-generator, react-native-icon-finder.
//
// Skipped (needs a live network endpoint, an account or an unpublished vocabulary): dns-propagation-checker, websocket-tester,
//   live mode of sse-stream-tester / mcp-inspector, exact Claude 3+ token counts (claude-token-counter; llm-token-estimator is approximate).
//
// jq-playground ceilings: no def/user functions, no path expressions (assignment |=, =, +=, del, paths, getpath), no limits on
//   recursion depth other than the JS stack, object key order follows JS (integer-like keys sort first), numbers are IEEE doubles
//   (jq 1.7 keeps big literals verbatim), no $ENV/input/debug/@sh edge cases. Upgrade: add path tracking to the evaluator.
import native from './native.js';
import RN_ICONS from '../rn-icons.js';

const JSONC = 'JSON';

// ====================================================================== jq subset
const KW = new Set(['if', 'then', 'elif', 'else', 'end', 'and', 'or', 'as', 'reduce', 'foreach', 'try', 'catch']);
function jqLex(src) {
  const out = []; let i = 0;
  const isId = (c) => /[A-Za-z0-9_]/.test(c || '');
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '"') { // string with \(interpolation)
      let j = i + 1, cur = '', parts = [];
      for (;;) {
        if (j >= src.length) throw new Error('Unterminated string in filter');
        const d = src[j];
        if (d === '"') { j++; break; }
        if (d === '\\') {
          const e = src[j + 1];
          if (e === '(') {
            let depth = 1, k = j + 2;
            while (k < src.length && depth) { if (src[k] === '(') depth++; else if (src[k] === ')') depth--; else if (src[k] === '"') { k++; while (k < src.length && src[k] !== '"') { if (src[k] === '\\') k++; k++; } } k++; }
            if (depth) throw new Error('Unterminated \\( in string');
            if (cur) parts.push(cur); cur = '';
            parts.push({ sub: src.slice(j + 2, k - 1) }); j = k; continue;
          }
          if (e === 'u') { cur += String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16)); j += 6; continue; }
          const m = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' }[e];
          if (m === undefined) throw new Error('Invalid escape \\' + e);
          cur += m; j += 2; continue;
        }
        cur += d; j++;
      }
      if (cur || !parts.length) parts.push(cur);
      out.push({ k: 'str', v: parts }); i = j; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      out.push({ k: 'num', v: Number(m[0]) }); i += m[0].length; continue;
    }
    if (c === '.' && src[i + 1] === '.') { out.push({ k: 'op', v: '..' }); i += 2; continue; }
    if (c === '.' && /[A-Za-z_]/.test(src[i + 1] || '')) { let j = i + 1; while (isId(src[j])) j++; out.push({ k: 'field', v: src.slice(i + 1, j) }); i = j; continue; }
    if (c === '$' || c === '@') { let j = i + 1; while (isId(src[j])) j++; out.push({ k: c === '$' ? 'var' : 'fmt', v: src.slice(i + 1, j) }); i = j; continue; }
    if (/[A-Za-z_]/.test(c)) { let j = i; while (isId(src[j]) || (src[j] === ':' && src[j + 1] === ':' && isId(src[j + 2]))) j += src[j] === ':' ? 2 : 1; out.push({ k: 'id', v: src.slice(i, j) }); i = j; continue; }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '//', '|=', '+=', '-=', '*=', '/=', '%='].includes(two)) { out.push({ k: 'op', v: two }); i += 2; continue; }
    if ('.[](){}|,:;?<>+-*/%='.includes(c)) { out.push({ k: 'op', v: c }); i++; continue; }
    throw new Error(`Unexpected character "${c}" in filter`);
  }
  return out;
}

function jqParse(src) {
  const toks = jqLex(src); let p = 0;
  const peek = () => toks[p], isOp = (v) => toks[p]?.k === 'op' && toks[p].v === v, isId = (v) => toks[p]?.k === 'id' && toks[p].v === v;
  const eat = (v) => { if (!isOp(v)) throw new Error(`Expected "${v}" in filter` + (toks[p] ? `, found "${toks[p].v}"` : ', found end')); p++; };
  const eatId = (v) => { if (!isId(v)) throw new Error(`Expected "${v}" in filter`); p++; };
  const strNode = (t) => ({ t: 'str', parts: t.v.map((x) => (typeof x === 'string' ? x : jqParse(x.sub))) });
  function pipe() {
    const l = comma();
    if (isOp('|')) { p++; return { t: 'pipe', l, r: pipe() }; }
    return l;
  }
  function comma() { let l = alt(); while (isOp(',')) { p++; l = { t: 'comma', l, r: alt() }; } return l; }
  function alt() { const l = orx(); if (isOp('//')) { p++; return { t: 'alt', l, r: alt() }; } if (peek()?.k === 'op' && /^(\|=|[-+*/%]?=)$/.test(peek().v)) throw new Error('Assignment operators are not supported in this jq subset'); return l; }
  function orx() { let l = andx(); while (isId('or')) { p++; l = { t: 'or', l, r: andx() }; } return l; }
  function andx() { let l = cmp(); while (isId('and')) { p++; l = { t: 'and', l, r: cmp() }; } return l; }
  function cmp() { const l = add(); const o = peek(); if (o?.k === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(o.v)) { p++; return { t: 'bin', op: o.v, l, r: add() }; } return l; }
  function add() { let l = mul(); while (isOp('+') || isOp('-')) { const op = toks[p++].v; l = { t: 'bin', op, l, r: mul() }; } return l; }
  function mul() { let l = unary(); while (isOp('*') || isOp('/') || isOp('%')) { const op = toks[p++].v; l = { t: 'bin', op, l, r: unary() }; } return l; }
  function unary() { if (isOp('-')) { p++; return { t: 'neg', e: unary() }; } return postfix(); }
  function postfix(allowAs = true) {
    let t = primary();
    for (;;) {
      const k = peek();
      if (k?.k === 'field') { p++; t = { t: 'idx', b: t, i: { t: 'lit', v: k.v } }; }
      else if (isOp('.') && toks[p + 1]?.k === 'str') { p++; t = { t: 'idx', b: t, i: strNode(toks[p++]) }; }
      else if (isOp('.') && toks[p + 1]?.v === '[') { p++; }
      else if (isOp('[')) {
        p++;
        if (isOp(']')) { p++; t = { t: 'iter', b: t }; continue; }
        if (isOp(':')) { p++; const to = pipe(); eat(']'); t = { t: 'slice', b: t, from: null, to }; continue; }
        const a = pipe();
        if (isOp(':')) { p++; const to = isOp(']') ? null : pipe(); eat(']'); t = { t: 'slice', b: t, from: a, to }; } else { eat(']'); t = { t: 'idx', b: t, i: a }; }
      } else if (isOp('?')) { p++; t = { t: 'try', e: t, c: null }; }
      else break;
    }
    if (allowAs && isId('as')) {
      p++; const names = [];
      const v = peek(); if (v?.k !== 'var') throw new Error('Destructuring patterns are not supported; use "as $name"');
      names.push(v.v); p++;
      eat('|'); return { t: 'as', src: t, name: names[0], body: pipe() };
    }
    return t;
  }
  function primary() {
    const k = peek(); if (!k) throw new Error('Unexpected end of filter');
    if (k.k === 'num') { p++; return { t: 'lit', v: k.v }; }
    if (k.k === 'str') { p++; return strNode(k); }
    if (k.k === 'fmt') { p++; if (peek()?.k === 'str') { const s = strNode(toks[p++]); s.fmt = k.v; return s; } return { t: 'fmt', name: k.v }; }
    if (k.k === 'var') { p++; return { t: 'var', name: k.v }; }
    if (k.k === 'field') { return { t: 'id' }; }
    if (k.k === 'op') {
      if (k.v === '.') { p++; if (peek()?.k === 'str') { return { t: 'idx', b: { t: 'id' }, i: strNode(toks[p++]) }; } return { t: 'id' }; }
      if (k.v === '..') { p++; return { t: 'call', name: 'recurse', args: [] }; }
      if (k.v === '(') { p++; const e = pipe(); eat(')'); return e; }
      if (k.v === '[') { p++; if (isOp(']')) { p++; return { t: 'arr', e: null }; } const e = pipe(); eat(']'); return { t: 'arr', e }; }
      if (k.v === '{') return objc();
    }
    if (k.k === 'id') {
      if (k.v === 'if') {
        p++; const c = pipe(); eatId('then'); const th = pipe(); let el = null;
        if (isId('elif')) { toks[p] = { k: 'id', v: 'if' }; el = primary(); return { t: 'if', c, th, el }; }
        if (isId('else')) { p++; el = pipe(); }
        eatId('end'); return { t: 'if', c, th, el };
      }
      if (k.v === 'try') { p++; const e = postfixNoAs(); let c = null; if (isId('catch')) { p++; c = postfixNoAs(); } return { t: 'try', e, c }; }
      if (k.v === 'reduce') { p++; const src = postfixNoAs(); eatId('as'); const v = toks[p++]; if (v?.k !== 'var') throw new Error('reduce needs "as $name"'); eat('('); const init = pipe(); eat(';'); const upd = pipe(); eat(')'); return { t: 'reduce', src, name: v.v, init, upd }; }
      if (k.v === 'foreach') throw new Error('foreach is not supported in this jq subset');
      if (k.v === 'def') throw new Error('def (user functions) is not supported in this jq subset');
      if (KW.has(k.v)) throw new Error(`Unexpected keyword "${k.v}"`);
      p++; const args = [];
      if (isOp('(')) { p++; args.push(pipe()); while (isOp(';')) { p++; args.push(pipe()); } eat(')'); }
      if (k.v === 'null' || k.v === 'true' || k.v === 'false') return { t: 'lit', v: k.v === 'null' ? null : k.v === 'true' };
      return { t: 'call', name: k.v, args };
    }
    throw new Error(`Unexpected "${k.v}" in filter`);
  }
  const postfixNoAs = () => postfix(false);
  function objc() {
    eat('{'); const ents = [];
    if (isOp('}')) { p++; return { t: 'obj', ents }; }
    for (;;) {
      const k = peek(); let key, val = null;
      if (k.k === 'id' || k.k === 'num') { p++; key = { t: 'lit', v: String(k.v) }; if (k.k === 'id' && ['null', 'true', 'false'].includes(k.v)) key = { t: 'lit', v: k.v }; }
      else if (k.k === 'str') { p++; key = strNode(k); }
      else if (k.k === 'var') { p++; key = { t: 'lit', v: k.v }; val = { t: 'var', name: k.v }; }
      else if (isOp('(')) { p++; key = pipe(); eat(')'); }
      else if (k.k === 'field') { throw new Error('Object keys cannot start with "."'); }
      else throw new Error('Bad object key in filter');
      if (isOp(':')) { p++; val = alt(); while (isOp('|')) { p++; val = { t: 'pipe', l: val, r: alt() }; } }
      else if (!val) val = { t: 'idx', b: { t: 'id' }, i: key };
      ents.push([key, val]);
      if (isOp(',')) { p++; continue; }
      eat('}'); break;
    }
    return { t: 'obj', ents };
  }
  const ast = isOp('|') || !toks.length ? { t: 'id' } : pipe();
  if (p < toks.length) throw new Error(`Unexpected "${toks[p].v}" in filter`);
  return ast;
}

const jType = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const ORD = { null: 0, boolean: 1, number: 3, string: 4, array: 5, object: 6 };
function jCmp(a, b) {
  const ta = jType(a), tb = jType(b);
  if (ta === 'boolean' && tb === 'boolean') return a === b ? 0 : a ? 1 : -1;
  if (ta !== tb) return ORD[ta] - ORD[tb];
  if (ta === 'number') return a < b ? -1 : a > b ? 1 : 0;
  if (ta === 'string') { const x = [...a], y = [...b]; for (let i = 0; i < Math.min(x.length, y.length); i++) { const d = x[i].codePointAt(0) - y[i].codePointAt(0); if (d) return d < 0 ? -1 : 1; } return x.length - y.length < 0 ? -1 : x.length > y.length ? 1 : 0; }
  if (ta === 'array') { for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = jCmp(a[i], b[i]); if (c) return c; } return a.length < b.length ? -1 : a.length > b.length ? 1 : 0; }
  if (ta === 'object') {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort(), c = jCmp(ka, kb); if (c) return c;
    for (const k of ka) { const d = jCmp(a[k], b[k]); if (d) return d; } return 0;
  }
  return 0;
}
const jEq = (a, b) => jCmp(a, b) === 0;
const truthy = (v) => v !== null && v !== false;
const J = (v) => JSON.stringify(v);
const errv = (v) => { const s = J(v); return `${jType(v)} (${s.length > 11 ? s.slice(0, 10) + '...' : s})`; };
const keysOf = (v) => (Array.isArray(v) ? v.map((_, i) => i) : jType(v) === 'object' ? Object.keys(v).sort() : (() => { throw new Error(`${errv(v)} has no keys`); })());
class JqBreak extends Error {}

function arith(op, a, b) {
  const ta = jType(a), tb = jType(b);
  if (op === '+') {
    if (ta === 'null') return b; if (tb === 'null') return a;
    if (ta === 'number' && tb === 'number') return a + b;
    if (ta === 'string' && tb === 'string') return a + b;
    if (ta === 'array' && tb === 'array') return a.concat(b);
    if (ta === 'object' && tb === 'object') return { ...a, ...b };
  } else if (op === '-') {
    if (ta === 'number' && tb === 'number') return a - b;
    if (ta === 'array' && tb === 'array') return a.filter((x) => !b.some((y) => jEq(x, y)));
  } else if (op === '*') {
    if (ta === 'number' && tb === 'number') return a * b;
    if ((ta === 'string' && tb === 'number') || (ta === 'number' && tb === 'string')) { const [s, n] = ta === 'string' ? [a, b] : [b, a]; return n > 0 ? s.repeat(Math.ceil(n)) : null; }
    if (ta === 'object' && tb === 'object') { const m = (x, y) => { const r = { ...x }; for (const k of Object.keys(y)) r[k] = jType(r[k]) === 'object' && jType(y[k]) === 'object' ? m(r[k], y[k]) : y[k]; return r; }; return m(a, b); }
  } else if (op === '/') {
    if (ta === 'number' && tb === 'number') { if (b === 0) throw new Error(`${errv(a)} and ${errv(b)} cannot be divided because the divisor is zero`); return a / b; }
    if (ta === 'string' && tb === 'string') return a === '' ? [] : b === '' ? [...a] : a.split(b);
  } else if (op === '%') {
    if (ta === 'number' && tb === 'number') { const x = Math.trunc(a), y = Math.trunc(b); if (y === 0) throw new Error(`${errv(a)} and ${errv(b)} cannot be divided because the divisor is zero`); return (Math.abs(x) % Math.abs(y)) * (x < 0 ? -1 : 1); }
  }
  throw new Error(`${errv(a)} and ${errv(b)} cannot be ${{ '+': 'added', '-': 'subtracted', '*': 'multiplied', '/': 'divided', '%': 'divided' }[op]}`);
}

function fmtApply(name, v) {
  const str = (x) => (typeof x === 'string' ? x : J(x));
  switch (name) {
    case 'text': return str(v);
    case 'json': return J(v);
    case 'csv': case 'tsv': {
      if (!Array.isArray(v)) throw new Error(`${errv(v)} cannot be ${name}-formatted, only an array can be`);
      return v.map((x) => {
        if (typeof x === 'number') return String(x); if (typeof x === 'boolean') return String(x); if (x === null) return '';
        if (typeof x !== 'string') throw new Error(`${errv(x)} is not valid in a ${name} row`);
        return name === 'csv' ? '"' + x.replace(/"/g, '""') + '"' : x.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
      }).join(name === 'csv' ? ',' : '\t');
    }
    case 'html': return str(v).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;' }[c]));
    case 'uri': return [...new TextEncoder().encode(str(v))].map((b) => (/[A-Za-z0-9\-_.~]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : '%' + b.toString(16).toUpperCase().padStart(2, '0'))).join('');
    case 'base64': return btoa(String.fromCharCode(...new TextEncoder().encode(str(v))));
    case 'base64d': return new TextDecoder().decode(Uint8Array.from(atob(str(v)), (c) => c.charCodeAt(0)));
    case 'sh': { const q = (x) => (typeof x === 'string' ? "'" + x.replace(/'/g, "'\\''") + "'" : J(x)); return Array.isArray(v) ? v.map(q).join(' ') : q(v); }
    default: throw new Error(`@${name} is not a valid format`);
  }
}

function* jqEval(n, v, env) {
  switch (n.t) {
    case 'id': yield v; return;
    case 'lit': yield n.v; return;
    case 'str': {
      const rec = function* (i, acc) {
        if (i === n.parts.length) { yield acc; return; }
        const part = n.parts[i];
        if (typeof part === 'string') { yield* rec(i + 1, acc + part); return; }
        for (const x of jqEval(part, v, env)) yield* rec(i + 1, acc + (n.fmt ? fmtApply(n.fmt, x) : typeof x === 'string' ? x : J(x)));
      };
      yield* rec(0, ''); return;
    }
    case 'fmt': yield fmtApply(n.name, v); return;
    case 'var': { if (!(n.name in env)) throw new Error(`$${n.name} is not defined`); yield env[n.name]; return; }
    case 'pipe': for (const x of jqEval(n.l, v, env)) yield* jqEval(n.r, x, env); return;
    case 'comma': yield* jqEval(n.l, v, env); yield* jqEval(n.r, v, env); return;
    case 'neg': for (const x of jqEval(n.e, v, env)) { if (typeof x !== 'number') throw new Error(`${errv(x)} cannot be negated`); yield -x; } return;
    case 'bin': for (const r of jqEval(n.r, v, env)) for (const l of jqEval(n.l, v, env)) {
      if (['==', '!=', '<', '<=', '>', '>='].includes(n.op)) { const c = jCmp(l, r); yield n.op === '==' ? c === 0 : n.op === '!=' ? c !== 0 : n.op === '<' ? c < 0 : n.op === '<=' ? c <= 0 : n.op === '>' ? c > 0 : c >= 0; } else yield arith(n.op, l, r);
    } return;
    case 'and': for (const l of jqEval(n.l, v, env)) { if (!truthy(l)) yield false; else for (const r of jqEval(n.r, v, env)) yield truthy(r); } return;
    case 'or': for (const l of jqEval(n.l, v, env)) { if (truthy(l)) yield true; else for (const r of jqEval(n.r, v, env)) yield truthy(r); } return;
    case 'alt': { let any = false; try { for (const x of jqEval(n.l, v, env)) if (truthy(x)) { any = true; yield x; } } catch (e) { if (e instanceof JqBreak) throw e; } if (!any) yield* jqEval(n.r, v, env); return; }
    case 'if': for (const c of jqEval(n.c, v, env)) { if (truthy(c)) yield* jqEval(n.th, v, env); else if (n.el) yield* jqEval(n.el, v, env); else yield v; } return;
    case 'try': {
      try { for (const x of jqEval(n.e, v, env)) yield x; } catch (e) { if (e instanceof JqBreak) throw e; if (n.c) yield* jqEval(n.c, e.jqValue !== undefined ? e.jqValue : e.message, env); }
      return;
    }
    case 'arr': yield n.e ? [...jqEval(n.e, v, env)] : []; return;
    case 'obj': {
      const rec = function* (i, acc) {
        if (i === n.ents.length) { yield acc; return; }
        const [kn, vn] = n.ents[i];
        for (const k of jqEval(kn, v, env)) {
          if (typeof k !== 'string') throw new Error(`Object keys must be strings, not ${jType(k)}`);
          for (const val of jqEval(vn, v, env)) yield* rec(i + 1, { ...acc, [k]: val });
        }
      };
      yield* rec(0, {}); return;
    }
    case 'as': for (const x of jqEval(n.src, v, env)) yield* jqEval(n.body, v, { ...env, [n.name]: x }); return;
    case 'reduce': {
      for (const init of jqEval(n.init, v, env)) {
        let acc = init;
        for (const x of jqEval(n.src, v, env)) { let last = null, got = false; for (const r of jqEval(n.upd, acc, { ...env, [n.name]: x })) { last = r; got = true; } acc = got ? last : null; }
        yield acc;
      }
      return;
    }
    case 'idx': for (const b of jqEval(n.b, v, env)) for (const i of jqEval(n.i, v, env)) yield index(b, i); return;
    case 'iter': for (const b of jqEval(n.b, v, env)) {
      if (Array.isArray(b)) yield* b; else if (jType(b) === 'object') yield* Object.values(b); else throw new Error(`Cannot iterate over ${errv(b)}`);
    } return;
    case 'slice': for (const b of jqEval(n.b, v, env)) for (const to of n.to ? jqEval(n.to, v, env) : [null]) for (const from of n.from ? jqEval(n.from, v, env) : [null]) {
      if (b === null) { yield null; continue; }
      if (typeof b !== 'string' && !Array.isArray(b)) throw new Error(`Cannot index ${jType(b)} with object`);
      const arr = typeof b === 'string' ? [...b] : b, len = arr.length;
      const f = from === null ? 0 : Math.floor(from < 0 ? Math.max(0, len + from) : Math.min(from, len));
      const t = to === null ? len : Math.ceil(to < 0 ? Math.max(0, len + to) : Math.min(to, len));
      const r = arr.slice(f, Math.max(f, t)); yield typeof b === 'string' ? r.join('') : r;
    } return;
    case 'call': yield* callFn(n, v, env); return;
    default: throw new Error('Internal: unknown node ' + n.t);
  }
}

function index(b, i) {
  if (typeof i === 'string') { if (b === null) return null; if (jType(b) !== 'object') throw new Error(`Cannot index ${jType(b)} with "${i}"`); return Object.hasOwn(b, i) ? b[i] : null; }
  if (typeof i === 'number') { if (b === null) return null; if (!Array.isArray(b)) throw new Error(`Cannot index ${jType(b)} with number`); const k = Math.floor(i); const r = b[k < 0 ? b.length + k : k]; return r === undefined ? null : r; }
  if (b === null && i === null) return null;
  throw new Error(`Cannot index ${jType(b)} with ${jType(i)}`);
}

function* walkRec(v) { yield v; if (Array.isArray(v)) for (const x of v) yield* walkRec(x); else if (jType(v) === 'object') for (const x of Object.values(v)) yield* walkRec(x); }
const sortBy = (arr, keys) => arr.map((x, i) => ({ x, k: keys[i], i })).sort((a, b) => jCmp(a.k, b.k) || a.i - b.i);
const keyed = (v, f, env) => { if (!Array.isArray(v)) throw new Error(`Cannot index ${jType(v)} with number`); return v.map((x) => [...jqEval(f, x, env)]); };
const deepContains = (a, b) => {
  if (jType(a) !== jType(b)) throw new Error(`${errv(a)} and ${errv(b)} cannot have their containment checked`);
  if (jType(a) === 'object') return Object.keys(b).every((k) => Object.hasOwn(a, k) && deepContains(a[k], b[k]));
  if (Array.isArray(a)) return b.every((y) => a.some((x) => jType(x) === jType(y) && (jType(x) === 'object' || Array.isArray(x) ? deepContains(x, y) : jEq(x, y))));
  if (typeof a === 'string') return a.includes(b);
  return jEq(a, b);
};
const flatten = (a, d) => a.reduce((r, x) => (Array.isArray(x) && d > 0 ? r.concat(flatten(x, d - 1)) : (r.push(x), r)), []);
const toNum = (v) => { if (typeof v === 'number') return v; if (typeof v === 'string') { const s = v.trim(); if (s !== '' && !isNaN(Number(s))) return Number(s); } throw new Error(`${errv(v)} cannot be parsed as a number`); };
const mkRe = (re, flags) => { const f = (flags || '').replace(/[^gimsx]/g, '').replace('x', ''); return new RegExp(re, f.includes('g') ? f : f + ''); };

// value functions: (input, ...argValues) => value
const VF = {
  length: (v) => { if (v === null) return 0; if (typeof v === 'boolean') throw new Error('boolean (' + v + ') has no length'); if (typeof v === 'number') return Math.abs(v); if (typeof v === 'string') return [...v].length; if (Array.isArray(v)) return v.length; return Object.keys(v).length; },
  utf8bytelength: (v) => new TextEncoder().encode(v).length,
  not: (v) => !truthy(v), keys: keysOf, keys_unsorted: (v) => (Array.isArray(v) ? v.map((_, i) => i) : Object.keys(v)),
  values: (v) => (v === null ? undefined : v), type: jType, tostring: (v) => (typeof v === 'string' ? v : J(v)), tojson: (v) => J(v),
  fromjson: (v) => { try { return JSON.parse(v); } catch (e) { throw new Error(`${e.message} (while parsing '${v}')`); } },
  tonumber: toNum, ascii_downcase: (v) => v.replace(/[A-Z]/g, (c) => c.toLowerCase()), ascii_upcase: (v) => v.replace(/[a-z]/g, (c) => c.toUpperCase()),
  add: (v) => { const a = Array.isArray(v) ? v : jType(v) === 'object' ? Object.values(v) : (() => { throw new Error(`Cannot iterate over ${errv(v)}`); })(); return a.reduce((s, x) => arith('+', s, x), null); },
  sort: (v) => { if (!Array.isArray(v)) throw new Error(`${errv(v)} cannot be sorted, as it is not an array`); return sortBy(v, v).map((e) => e.x); },
  reverse: (v) => (typeof v === 'string' ? [...v].reverse().join('') : v === null ? [] : [...v].reverse()),
  unique: (v) => { const s = sortBy(v, v).map((e) => e.x); return s.filter((x, i) => i === 0 || !jEq(x, s[i - 1])); },
  min: (v) => (v.length ? sortBy(v, v)[0].x : null), max: (v) => { if (!v.length) return null; const s = sortBy(v, v); let m = s[s.length - 1]; for (let i = s.length - 1; i >= 0 && jEq(s[i].k, m.k); i--) m = s[i].i > m.i ? s[i] : m; return m.x; },
  flatten: (v, d = 1e9) => { if (d < 0) throw new Error('flatten depth must not be negative'); return flatten(v, d); },
  floor: Math.floor, ceil: Math.ceil, sqrt: Math.sqrt, round: (v) => (v < 0 ? -Math.round(-v) : Math.round(v)), fabs: Math.abs, abs: (v) => (v < 0 ? -v : v), pow: Math.pow, log: Math.log, log2: Math.log2, exp: Math.exp,
  to_entries: (v) => Object.keys(v).map((k) => ({ key: k, value: v[k] })),
  from_entries: (v) => { const r = {}; for (const e of v) { const k = e.key ?? e.k ?? e.name ?? e.Name ?? e.Key ?? e.K; if (k === null || k === undefined) throw new Error('Cannot use null as object key'); r[typeof k === 'string' ? k : J(k)] = e.value ?? e.v ?? e.Value ?? e.V ?? null; } return r; },
  has: (v, k) => { if (jType(v) === 'object' && typeof k === 'string') return Object.hasOwn(v, k); if (Array.isArray(v) && typeof k === 'number') return k >= 0 && k < v.length; throw new Error(`Cannot check whether ${jType(v)} has a ${jType(k)} key`); },
  contains: deepContains, inside: (v, o) => deepContains(o, v),
  join: (v, s) => v.map((x) => (x === null ? '' : typeof x === 'string' ? x : typeof x === 'number' || typeof x === 'boolean' ? String(x) : (() => { throw new Error(`Cannot join with ${jType(x)}`); })())).join(s),
  split: (v, s) => { if (typeof v !== 'string' || typeof s !== 'string') throw new Error('split input and separator must be strings'); return v === '' ? [] : s === '' ? [...v] : v.split(s); },
  startswith: (v, s) => { if (typeof v !== 'string' || typeof s !== 'string') throw new Error('startswith() requires string inputs'); return v.startsWith(s); },
  endswith: (v, s) => { if (typeof v !== 'string' || typeof s !== 'string') throw new Error('endswith() requires string inputs'); return v.endsWith(s); },
  ltrimstr: (v, s) => (typeof v === 'string' && typeof s === 'string' && v.startsWith(s) ? v.slice(s.length) : v),
  rtrimstr: (v, s) => (typeof v === 'string' && typeof s === 'string' && s !== '' && v.endsWith(s) ? v.slice(0, -s.length) : v),
  trim: (v) => v.trim(), ltrim: (v) => v.trimStart(), rtrim: (v) => v.trimEnd(),
  test: (v, re, fl) => mkRe(re, fl).test(v),
  explode: (v) => [...v].map((c) => c.codePointAt(0)), implode: (v) => String.fromCodePoint(...v),
  isnan: Number.isNaN, infinite: () => Infinity, nan: () => NaN,
  isinfinite: (v) => v === Infinity || v === -Infinity, isnormal: (v) => Number.isFinite(v) && v !== 0,
  transpose: (v) => { const n = Math.max(0, ...v.map((r) => r.length)); return Array.from({ length: n }, (_, i) => v.map((r) => r[i] ?? null)); },
  indices: (v, x) => { if (typeof v === 'string') { const r = []; if (x === '') return null; for (let i = v.indexOf(x); i >= 0; i = v.indexOf(x, i + 1)) r.push(i); return r; } if (Array.isArray(x)) { const r = []; for (let i = 0; i + x.length <= v.length; i++) if (x.every((y, j) => jEq(v[i + j], y))) r.push(i); return r; } return v.map((y, i) => (jEq(y, x) ? i : -1)).filter((i) => i >= 0); },
  error: (v, m) => { const e = new Error(typeof m === 'string' ? m : J(m)); e.jqValue = m === undefined ? v : m; throw e; },
  todate: (v) => new Date(v * 1000).toISOString().replace(/\.\d+Z$/, 'Z'), fromdate: (v) => Math.floor(Date.parse(v) / 1000), now: () => Date.now() / 1000,
};
const ARITY0 = new Set(['length', 'utf8bytelength', 'not', 'keys', 'keys_unsorted', 'values', 'type', 'tostring', 'tojson', 'fromjson', 'tonumber', 'ascii_downcase', 'ascii_upcase', 'add', 'sort', 'reverse', 'unique', 'min', 'max', 'floor', 'ceil', 'sqrt', 'round', 'fabs', 'abs', 'log', 'log2', 'exp', 'to_entries', 'from_entries', 'trim', 'ltrim', 'rtrim', 'explode', 'implode', 'isnan', 'infinite', 'nan', 'isinfinite', 'isnormal', 'transpose', 'todate', 'fromdate', 'now', 'flatten', 'error']);

function* callFn(n, v, env) {
  const { name, args } = n, a = args.length, id = `${name}/${a}`;
  const body = (i, x) => jqEval(args[i], x, env);
  switch (id) {
    case 'empty/0': return;
    case 'select/1': for (const c of body(0, v)) if (truthy(c)) yield v; return;
    case 'map/1': { if (!Array.isArray(v) && jType(v) !== 'object') throw new Error(`Cannot iterate over ${errv(v)}`); const r = []; for (const x of Array.isArray(v) ? v : Object.values(v)) r.push(...body(0, x)); yield r; return; }
    case 'map_values/1': { if (Array.isArray(v)) { const r = []; for (const x of v) { const f = body(0, x).next(); if (!f.done) r.push(f.value); } yield r; } else { const r = {}; for (const [k, x] of Object.entries(v)) { const f = body(0, x).next(); if (!f.done) r[k] = f.value; } yield r; } return; }
    case 'recurse/0': yield* walkRec(v); return;
    case 'recurse/1': { const rec = function* (x) { yield x; for (const y of body(0, x)) yield* rec(y); }; yield* rec(v); return; }
    case 'range/1': for (const nn of body(0, v)) for (let i = 0; i < nn; i++) yield i; return;
    case 'range/2': for (const f of body(0, v)) for (const t of body(1, v)) for (let i = f; i < t; i++) yield i; return;
    case 'range/3': for (const f of body(0, v)) for (const t of body(1, v)) for (const s of body(2, v)) { if (s > 0) for (let i = f; i < t; i += s) yield i; else if (s < 0) for (let i = f; i > t; i += s) yield i; } return;
    case 'first/0': yield index(v, 0); return;
    case 'last/0': yield index(v, -1); return;
    case 'first/1': for (const x of body(0, v)) { yield x; return; } return;
    case 'last/1': { let l, got = false; for (const x of body(0, v)) { l = x; got = true; } if (got) yield l; return; }
    case 'limit/2': for (const nn of body(0, v)) { if (nn <= 0) continue; let i = 0; for (const x of body(1, v)) { yield x; if (++i >= nn) break; } } return;
    case 'nth/1': for (const i of body(0, v)) yield index(v, i); return;
    case 'any/0': yield v.some(truthy); return;
    case 'all/0': yield v.every(truthy); return;
    case 'any/1': yield (Array.isArray(v) ? v : Object.values(v)).some((x) => [...body(0, x)].some(truthy)); return;
    case 'all/1': yield (Array.isArray(v) ? v : Object.values(v)).every((x) => [...body(0, x)].every(truthy)); return;
    case 'any/2': { let r = false; for (const x of body(0, v)) for (const c of body(1, x)) if (truthy(c)) r = true; yield r; return; }
    case 'all/2': { let r = true; for (const x of body(0, v)) for (const c of body(1, x)) if (!truthy(c)) r = false; yield r; return; }
    case 'sort_by/1': yield sortBy(v, keyed(v, args[0], env)).map((e) => e.x); return;
    case 'group_by/1': { const s = sortBy(v, keyed(v, args[0], env)), g = []; for (const e of s) { if (g.length && jEq(g[g.length - 1].k, e.k)) g[g.length - 1].xs.push(e.x); else g.push({ k: e.k, xs: [e.x] }); } yield g.map((x) => x.xs); return; }
    case 'unique_by/1': { const s = sortBy(v, keyed(v, args[0], env)), g = []; for (const e of s) if (!g.length || !jEq(g[g.length - 1].k, e.k)) g.push(e); yield g.map((e) => e.x); return; }
    case 'min_by/1': { if (!v.length) { yield null; return; } yield sortBy(v, keyed(v, args[0], env))[0].x; return; }
    case 'max_by/1': { if (!v.length) { yield null; return; } const s = sortBy(v, keyed(v, args[0], env)); let m = s[s.length - 1]; for (let i = s.length - 1; i >= 0 && jEq(s[i].k, m.k); i--) m = s[i].i > m.i ? s[i] : m; yield m.x; return; }
    case 'with_entries/1': { const ents = VF.to_entries(v), r = []; for (const e of ents) r.push(...body(0, e)); yield VF.from_entries(r); return; }
    case 'walk/1': { const w = function* (x) { let y = x; if (Array.isArray(x)) y = x.flatMap((e) => [...w(e)]); else if (jType(x) === 'object') { y = {}; for (const [k, e] of Object.entries(x)) { const f = w(e).next(); if (!f.done) y[k] = f.value; } } yield* body(0, y); }; yield* w(v); return; }
    case 'del/1': throw new Error('del is not supported in this jq subset (no path expressions)');
    case 'input/0': case 'inputs/0': throw new Error('input/inputs are not available');
    case 'tostream/0': throw new Error('tostream is not supported in this jq subset');
    case 'splits/1': for (const re of body(0, v)) yield* v.split(mkRe(re, 'g')); return;
    case 'sub/2': case 'gsub/2': for (const re of body(0, v)) for (const rep of body(1, v)) yield v.replace(new RegExp(re, name === 'gsub' ? 'g' : ''), rep); return;
    case 'sub/3': case 'gsub/3': for (const re of body(0, v)) for (const rep of body(1, v)) for (const fl of body(2, v)) yield v.replace(new RegExp(re, (name === 'gsub' ? 'g' : '') + fl.replace(/[^imsg]/g, '')), rep); return;
    case 'env/0': case '$ENV/0': yield {}; return;
    case 'getpath/1': { for (const p of body(0, v)) { let x = v; for (const k of p) { if (x === null) break; x = index(x, k); } yield x; } return; }
    case 'isempty/1': { let any = false; for (const _ of body(0, v)) { any = true; break; } yield !any; return; }
    case 'numbers/0': if (typeof v === 'number') yield v; return;
    case 'strings/0': if (typeof v === 'string') yield v; return;
    case 'booleans/0': if (typeof v === 'boolean') yield v; return;
    case 'nulls/0': if (v === null) yield v; return;
    case 'arrays/0': if (Array.isArray(v)) yield v; return;
    case 'objects/0': if (jType(v) === 'object') yield v; return;
    case 'iterables/0': if (Array.isArray(v) || jType(v) === 'object') yield v; return;
    case 'scalars/0': if (!Array.isArray(v) && jType(v) !== 'object') yield v; return;
    case 'null/0': yield null; return;
    case 'add/1': { let s = null; for (const x of body(0, v)) s = arith('+', s, x); yield s; return; }
    case 'IN/1': for (const x of body(0, v)) if (jEq(x, v)) { yield true; return; } yield false; return;
    default:
  }
  const fn = VF[name];
  if (!fn || (a === 0 && !ARITY0.has(name) && !['test', 'join'].includes(name) && fn.length > 1) || a > 3) throw new Error(`${name}/${a} is not defined in this jq subset`);
  const rec = function* (i, vals) {
    if (i < 0) { const r = fn(v, ...vals); if (r !== undefined) yield r; return; }
    for (const x of jqEval(args[i], v, env)) yield* rec(i - 1, [x, ...vals]);
  };
  yield* rec(a - 1, []);
}

export function jq(src, input, opts = {}) {
  const ast = jqParse(src), out = [];
  for (const r of jqEval(ast, input, {})) { out.push(r); if (out.length > 50000) throw new Error('More than 50 000 results; narrow the filter'); }
  return out;
}
const sortKeysDeep = (v) => (Array.isArray(v) ? v.map(sortKeysDeep) : jType(v) === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeysDeep(v[k])])) : v);

// ====================================================================== XLSX -> JSON
const csvRows = (s) => {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  row.push(f); rows.push(row); return rows;
};

// ====================================================================== DNS resolution simulator
const lc = (s) => s.toLowerCase().replace(/\.$/, '');
function dnsSim(zoneText, zone, qname, qtype) {
  zone = lc(zone);
  const abs = (n) => { n = n.trim(); if (n === '@') return zone; if (n.endsWith('.')) return lc(n); return lc(n) + '.' + zone; };
  const recs = [];
  zoneText.split(/\r?\n/).forEach((raw, i) => {
    const l = raw.replace(/\s+#.*$/, '').trim(); if (!l || l[0] === '#' || l[0] === ';') return;
    const m = l.match(/"[^"]*"|\S+/g), type = m[0].toUpperCase(), name = m[1], val = m.slice(2).filter((x) => !/^ttl=/i.test(x));
    if (!['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'PTR'].includes(type)) throw new Error(`Line ${i + 1}: unsupported record type "${m[0]}"`);
    if (!name || !val.length) throw new Error(`Line ${i + 1}: expected "TYPE name value..."`);
    const tgt = type === 'MX' ? val[1] : type === 'SRV' ? val[3] : ['CNAME', 'NS', 'PTR'].includes(type) ? val[0] : null;
    recs.push({ name: abs(name), type, data: val.map((x) => (tgt !== null && x === tgt ? (x.endsWith('.') ? x : abs(x) + '.') : x)).join(' '), target: tgt === null || tgt === undefined ? null : abs(tgt) });
  });
  if (!recs.length) throw new Error('Add at least one record');
  const inZone = (n) => n === zone || n.endsWith('.' + zone);
  const exists = (n) => n === zone || recs.some((r) => r.name === n || r.name.endsWith('.' + n));
  const log = [], ans = []; let name = lc(qname), rcode = 'NOERROR', note = '';
  if (!inZone(name)) throw new Error(`${name} is not inside the zone ${zone}; a resolver would ask the parent zone's servers`);
  const fmt = (r, owner) => `${owner}.\t${r.type}\t${r.data}`;
  for (let hop = 0; hop < 10; hop++) {
    if (!inZone(name)) { note = `Chain leaves the zone at ${name}; a resolver would continue the lookup at that name's own servers.`; break; }
    // delegation: NS at a strict ancestor (or at name itself when asking for something other than NS)
    const labels = name.split('.'), zl = zone.split('.').length;
    let cut = null;
    for (let k = 0; k <= labels.length - zl - 1; k++) { const anc = labels.slice(k).join('.'); if (anc !== zone && recs.some((r) => r.name === anc && r.type === 'NS') && (anc !== name || qtype !== 'NS')) { cut = anc; break; } }
    if (cut) { rcode = 'NOERROR (referral)'; for (const r of recs.filter((x) => x.name === cut && x.type === 'NS')) ans.push({ sec: 'AUTHORITY', t: fmt(r, cut) }); log.push(`${name} is below the delegation at ${cut}: this zone is not authoritative, the NS records above are a referral.`); break; }
    const at = recs.filter((r) => r.name === name);
    const cn = at.find((r) => r.type === 'CNAME');
    if (cn && qtype !== 'CNAME') { ans.push({ sec: 'ANSWER', t: fmt(cn, name) }); log.push(`${name} has a CNAME, follow it to ${cn.target}`); name = cn.target; continue; }
    const hit = at.filter((r) => r.type === qtype);
    if (hit.length) { hit.forEach((r) => ans.push({ sec: 'ANSWER', t: fmt(r, name) })); log.push(`${hit.length} ${qtype} record(s) at ${name}`); break; }
    if (at.length || exists(name)) { rcode = 'NOERROR (NODATA)'; log.push(`${name} exists but has no ${qtype} record${at.length ? ` (it has ${[...new Set(at.map((r) => r.type))].join(', ')})` : ' (it only has names below it)'}.`); break; }
    // wildcard: closest encloser must exist
    let done = false;
    for (let k = 1; k < labels.length; k++) {
      const enc = labels.slice(k).join('.');
      if (!(inZone(enc) && exists(enc))) continue;
      const wc = '*.' + enc, w = recs.filter((r) => r.name === wc);
      if (!w.length) break;
      log.push(`${name} does not exist; wildcard ${wc} matches (closest encloser ${enc}).`);
      const wcn = w.find((r) => r.type === 'CNAME');
      if (wcn && qtype !== 'CNAME') { ans.push({ sec: 'ANSWER', t: fmt(wcn, name) }); name = wcn.target; done = 'follow'; break; }
      const wh = w.filter((r) => r.type === qtype);
      if (wh.length) { wh.forEach((r) => ans.push({ sec: 'ANSWER', t: fmt(r, name) })); done = 'ok'; } else { rcode = 'NOERROR (NODATA)'; log.push(`Wildcard has no ${qtype} record.`); done = 'ok'; }
      break;
    }
    if (done === 'follow') continue;
    if (done) break;
    rcode = 'NXDOMAIN'; log.push(`${name} does not exist in the zone and no wildcard covers it.`); break;
  }
  const extra = [];
  for (const a of ans.filter((x) => x.sec === 'ANSWER' || x.sec === 'AUTHORITY')) {
    const r = recs.find((x) => fmt(x, x.name) === a.t || a.t.startsWith(x.name + '.\t' + x.type + '\t' + x.data) );
    const tg = r?.target; if (!tg || !['MX', 'NS', 'SRV'].includes(r.type)) continue;
    for (const g of recs.filter((x) => x.name === tg && (x.type === 'A' || x.type === 'AAAA'))) extra.push({ sec: 'ADDITIONAL', t: fmt(g, tg) });
  }
  const all = [...ans, ...extra];
  const sec = (s) => all.filter((x) => x.sec === s).map((x) => x.t);
  const out = [`;; QUERY: ${lc(qname)}. ${qtype}   (zone ${zone}.)`, `;; STATUS: ${rcode}`];
  for (const s of ['ANSWER', 'AUTHORITY', 'ADDITIONAL']) { const l = sec(s); if (l.length) out.push('', `;; ${s} SECTION:`, ...l); }
  if (!ans.length && !rcode.includes('referral')) out.push('', ';; ANSWER SECTION: (empty)');
  out.push('', ';; HOW IT RESOLVED:', ...log.map((x) => '- ' + x));
  if (note) out.push('- ' + note);
  return out.join('\n');
}

// ====================================================================== SSE
function parseSse(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r\n|\n|\r/), evs = [], comments = [], retries = [];
  let cur = { data: [], event: '', id: null, has: false };
  const flush = () => {
    if (cur.data.length) evs.push({ event: cur.event || 'message', data: cur.data.join('\n'), ...(cur.id !== null ? { id: cur.id } : {}) });
    cur = { data: [], event: '', id: null, has: false };
  };
  const feed = (line) => {
    if (line === '') { flush(); return; }
    if (line[0] === ':') { comments.push(line.slice(1).replace(/^ /, '')); return; }
    const i = line.indexOf(':'), f = i < 0 ? line : line.slice(0, i); let v = i < 0 ? '' : line.slice(i + 1); if (v[0] === ' ') v = v.slice(1);
    if (f === 'data') { cur.data.push(v); cur.has = true; } else if (f === 'event') { cur.event = v; cur.has = true; } else if (f === 'id') { if (!v.includes('\0')) { cur.id = v; cur.has = true; } } else if (f === 'retry') { if (/^\d+$/.test(v)) retries.push(Number(v)); }
  };
  lines.forEach(feed); // the last element is the unterminated tail (or '' when the text ended with a line break)
  const pending = cur.has ? { event: cur.event || 'message', data: cur.data.join('\n') } : null;
  return { events: evs, comments, pending, retry: retries.pop() };
}

// ====================================================================== Tailwind mesh gradient
function rng(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
export function meshGradient(colors, seed, size) {
  const r = rng(seed), pts = colors.slice(1).map((c) => ({ c, x: Math.round(r() * 100), y: Math.round(r() * 100) }));
  const layers = pts.map((p) => `radial-gradient(at ${p.x}% ${p.y}%, ${p.c} 0px, transparent ${size}%)`);
  return { base: colors[0], layers };
}

export default [
  {
    id: 'jq-playground', cat: JSONC, title: 'jq Playground (Online jq Filter Tester)',
    desc: 'Run jq filters on JSON in your browser: paths, pipes, select, map, group_by, sort_by, reduce, if/else, string interpolation, @csv/@tsv/@base64 and about 90 built-ins. A jq subset: no assignments, def or path functions.',
    inputs: 2, labels: ['JSON input', 'jq filter'], placeholder: ['{"users":[...]}', '.users[] | select(.age > 30) | .name'],
    sample: '{"users":[{"name":"Ada","age":36,"tags":["math","code"]},{"name":"Linus","age":54,"tags":["kernel"]},{"name":"Grace","age":45,"tags":["compiler","navy"]}]}',
    sample2: '[.users[] | select(.age > 40) | {name, tags: (.tags | join("/"))}]',
    opts: [
      { id: 'raw', label: 'Raw output (-r): strings without quotes', type: 'checkbox', def: false },
      { id: 'compact', label: 'Compact output (-c)', type: 'checkbox', def: false },
      { id: 'sort', label: 'Sort object keys (-S)', type: 'checkbox', def: false },
      { id: 'slurp', label: 'Slurp (-s): treat several JSON values as one array', type: 'checkbox', def: false },
    ],
    run: ([src, filter], o) => {
      if (!src.trim()) throw new Error('Paste some JSON');
      let input;
      const parseAll = () => { // concatenated / newline-delimited JSON values
        const vals = []; let i = 0; const s = src;
        while (i < s.length) {
          while (i < s.length && /\s/.test(s[i])) i++; if (i >= s.length) break;
          let lo = i, ok = false, hi = i;
          // find the shortest prefix that parses; JSON values are self-delimiting for objects/arrays/strings, otherwise token-delimited
          if ('{["'.includes(s[i])) { let depth = 0, str = false; for (hi = i; hi < s.length; hi++) { const c = s[hi]; if (str) { if (c === '\\') hi++; else if (c === '"') { str = false; if (!depth) { hi++; break; } } } else if (c === '"') str = true; else if (c === '{' || c === '[') depth++; else if (c === '}' || c === ']') { depth--; if (!depth) { hi++; break; } } } }
          else { hi = i; while (hi < s.length && !/\s/.test(s[hi])) hi++; }
          try { vals.push(JSON.parse(s.slice(lo, hi))); ok = true; } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
          void ok; i = hi;
        }
        return vals;
      };
      try { input = JSON.parse(src); if (o.slurp) input = [input]; } catch (e) {
        const vals = parseAll(); if (!vals.length) throw new Error('Invalid JSON: ' + e.message);
        input = o.slurp ? vals : null; if (!o.slurp) { const outs = []; for (const v of vals) outs.push(...jq(filter, v)); return render(outs, o); }
      }
      if (o.slurp && !Array.isArray(input)) input = [input];
      return render(jq(filter, input), o);
    },
  },
  {
    id: 'xlsx-to-json', cat: 'Archives & Spreadsheets', title: 'Excel (XLSX) to JSON Converter', inputs: 0,
    desc: 'Convert one sheet of an .xlsx workbook to JSON in your browser: an array of objects keyed by the header row, or an array of arrays. Numbers and booleans are typed; dates arrive as Excel serial numbers.',
    file: { accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    opts: [
      { id: 'sheet', label: 'Sheet number', type: 'number', def: 1 },
      { id: 'shape', label: 'Shape', type: 'select', choices: ['array of objects (first row = keys)', 'array of arrays'], def: 'array of objects (first row = keys)' },
      { id: 'types', label: 'Convert numbers and TRUE/FALSE', type: 'checkbox', def: true },
      { id: 'indent', label: 'Indent', type: 'number', def: 2 },
    ],
    run: async (_i, o, files) => {
      const view = native.find((t) => t.id === 'xlsx-viewer');
      const csv = await view.run(['', ''], { sheet: o.sheet, list: false }, files);
      let rows = csvRows(csv); while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
      if (!rows.length) throw new Error('The sheet is empty');
      const conv = (c) => (o.types === false ? c : c === 'TRUE' ? true : c === 'FALSE' ? false : /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(c) && Number.isFinite(Number(c)) && c.replace(/\D/g, '').length <= 15 ? Number(c) : c);
      let data;
      if (String(o.shape).startsWith('array of arrays')) data = rows.map((r) => r.map(conv));
      else {
        const seen = new Map(), head = rows[0].map((h, i) => { let k = h === '' ? `column${i + 1}` : h; const n = seen.get(k) || 0; seen.set(k, n + 1); return n ? `${k}_${n + 1}` : k; });
        data = rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, conv(r[i] ?? '')])));
      }
      return { text: JSON.stringify(data, null, Math.max(0, Math.min(8, +o.indent || 0))), filename: 'sheet.json' };
    },
  },
  {
    id: 'dns-resolution-simulator', cat: 'Network & HTTP', title: 'DNS Resolution Simulator (Zone Records, Offline)',
    desc: 'Paste DNS records and ask a question (name and type): see what an authoritative server would answer, including CNAME chains, wildcards, NODATA vs NXDOMAIN, delegations and glue. Nothing is looked up; it simulates your own records.',
    inputs: 1, labels: ['Records (TYPE name value...)'],
    sample: 'A @ 203.0.113.10\nA www 203.0.113.10\nCNAME app www\nCNAME docs cdn.example.net.\nA *.dev 203.0.113.50\nMX @ 10 mail\nA mail 203.0.113.25\nTXT @ "v=spf1 mx -all"\nNS eu ns1.eu\nA ns1.eu 203.0.113.99',
    opts: [
      { id: 'zone', label: 'Zone', type: 'text', def: 'example.com' },
      { id: 'q', label: 'Query name', type: 'text', def: 'app.example.com' },
      { id: 'type', label: 'Type', type: 'select', choices: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'PTR'], def: 'A' },
    ],
    run: ([s], o) => {
      const z = (o.zone || '').trim(), q = (o.q || '').trim();
      if (!/^[a-z0-9_.-]+\.[a-z0-9-]+\.?$/i.test(z)) throw new Error('Enter a zone such as example.com');
      if (!q) throw new Error('Enter a name to query');
      return dnsSim(s, z, q.includes('.') || q.endsWith('.') ? q : `${q}.${z}`, o.type);
    },
  },
  {
    id: 'sse-stream-parser', cat: 'Network & HTTP', title: 'SSE (Server-Sent Events) Stream Parser',
    desc: 'Paste a raw text/event-stream capture and see it parsed the way a browser EventSource does: events with id, event type, retry and multi-line data, comments, a pending unterminated event, and the assembled text of OpenAI or Anthropic token streams.',
    inputs: 1, labels: ['Raw event stream'],
    sample: ': keep-alive\nretry: 3000\n\nevent: message_start\ndata: {"type":"message_start"}\n\ndata: {"choices":[{"delta":{"content":"Hel"}}]}\nid: 1\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}\nid: 2\n\ndata: first line\ndata: second line\n\ndata: [DONE]\n\ndata: cut off',
    opts: [{ id: 'json', label: 'Parse data as JSON when possible', type: 'checkbox', def: true }],
    run: ([s], o) => {
      if (!s.trim()) throw new Error('Paste a stream');
      const { events, comments, pending, retry } = parseSse(s);
      const outEv = events.map((e) => { if (o.json === false) return e; try { return { ...e, data: JSON.parse(e.data) }; } catch { return e; } });
      let asm = '';
      for (const e of events) { try { const j = JSON.parse(e.data); asm += j?.choices?.[0]?.delta?.content ?? j?.delta?.text ?? j?.choices?.[0]?.text ?? ''; } catch { /* not JSON */ } }
      const out = [`${events.length} event(s), ${comments.length} comment line(s)${events.some((e) => e.data === '[DONE]') ? ', [DONE] marker seen' : ''}`, '', JSON.stringify(outEv, null, 2)];
      if (comments.length) out.push('', 'Comments: ' + JSON.stringify(comments));
      if (pending) out.push('', 'PENDING (not dispatched, the stream ended without a blank line): ' + JSON.stringify(pending));
      if (asm) out.push('', 'Assembled text: ' + asm);
      if (retry != null) out.push('', `Reconnect delay set by server: ${retry} ms`);
      return out.join('\n');
    },
  },
  {
    id: 'tailwind-mesh-gradient-generator', cat: 'CSS', title: 'Tailwind CSS v4 Mesh Gradient Generator',
    desc: 'Build a mesh gradient from your colours and get a single Tailwind v4 arbitrary-value class (bg-[radial-gradient(...)]) plus the equivalent plain CSS, with a live preview. Seeded, so results are repeatable.',
    inputs: 1, labels: ['Colours (hex, first = background, comma or line separated)'], sample: '#0f172a, #6366f1, #ec4899, #22d3ee, #f59e0b',
    opts: [
      { id: 'seed', label: 'Seed', type: 'number', def: 7 },
      { id: 'size', label: 'Blob spread (% before fading to transparent)', type: 'number', def: 55 },
    ],
    run: ([s], o) => {
      const colors = s.split(/[\s,;]+/).filter(Boolean);
      if (colors.length < 2) throw new Error('Give at least two colours: the background plus one blob');
      if (colors.length > 9) throw new Error('At most 9 colours (1 background + 8 blobs)');
      const bad = colors.find((c) => !HEX.test(c)); if (bad) throw new Error(`"${bad}" is not a hex colour like #6366f1`);
      const size = Math.max(5, Math.min(100, +o.size || 55)), { base, layers } = meshGradient(colors, +o.seed || 0, size);
      const tw = `bg-[${base}] bg-[${layers.map((l) => l.replace(/, /g, ',').replace(/ /g, '_')).join(',')}]`;
      const css = `background-color: ${base};\nbackground-image:\n  ${layers.join(',\n  ')};`;
      const html = `<!doctype html><html><body style="margin:0;min-height:100vh;${css.replace(/\n\s*/g, ' ')}"></body></html>`;
      return { text: `/* Tailwind v4 */\nclass="${tw}"\n\n/* Plain CSS */\n${css}`, html };
    },
  },
  {
    id: 'react-native-icon-finder', cat: 'Converters', title: 'React Native Vector Icons Finder',
    desc: 'Search icon names across react-native-vector-icons sets (Feather, Ionicons, MaterialIcons, MaterialCommunityIcons, FontAwesome 5 and 6 free, AntDesign, Entypo, Octicons) and copy the import and JSX. Names only, no glyph preview.',
    inputs: 1, labels: ['Search (several words = all must match)'], sample: 'arrow left',
    opts: [{ id: 'set', label: 'Icon set', type: 'select', choices: ['all', ...Object.keys(RN_ICONS)], def: 'all' }, { id: 'max', label: 'Max results', type: 'number', def: 100 }],
    run: ([q], o) => {
      const terms = q.toLowerCase().split(/[\s,]+/).filter(Boolean);
      if (!terms.length) throw new Error('Type a search term');
      const max = Math.max(1, Math.min(1000, +o.max || 100)), res = [];
      let total = 0;
      for (const [set, names] of Object.entries(RN_ICONS)) {
        if (o.set !== 'all' && o.set !== set) continue;
        for (const n of names.split(' ')) if (terms.every((t) => n.includes(t))) { total++; if (res.length < max) res.push([set, n]); }
      }
      if (!total) return `No icon name contains all of: ${terms.join(', ')}`;
      const bySet = {}; for (const [s, n] of res) (bySet[s] ||= []).push(n);
      const out = [`${total} match(es)${total > res.length ? `, showing ${res.length}` : ''}`, ''];
      for (const [s, ns] of Object.entries(bySet)) {
        out.push(`// ${s}${s.startsWith('FontAwesome') ? ' (Free set; add the solid or brand prop for those styles)' : ''}`, `import ${s} from 'react-native-vector-icons/${s}';`);
        for (const n of ns) out.push(`<${s} name="${n}" size={24} color="#000" />`);
        out.push('');
      }
      return out.join('\n').trimEnd();
    },
  },
];

function render(outs, o) {
  const f = (v) => (o.raw && typeof v === 'string' ? v : o.compact ? JSON.stringify(o.sort ? sortKeysDeep(v) : v) : JSON.stringify(o.sort ? sortKeysDeep(v) : v, null, 2));
  return outs.length ? outs.map(f).join('\n') : '(no output: the filter produced no results)';
}

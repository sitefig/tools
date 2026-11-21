// Tools from free-browser-tools.md, batch 22 (Math & Science, Education & Learning, Productivity & Office). See TOOLS.md for the contract.
// Sources for reference data are cited in the tool output: CODATA 2022 (NIST), CIAAW abridged atomic weights 2024 (IUPAC), NASA Planetary Fact Sheet.
// Skipped on purpose: dictionary / countries / holidays APIs, star catalogue, LaTeX typesetting, photo perspective scanner, drag-and-drop boards.
const T = [];
const MS = 'Math & Science', LRN = 'Learning', PRD = 'Time & Productivity';

// ---------- shared helpers ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (x, d = 12) => { if (typeof x === 'bigint') return String(x); if (!Number.isFinite(x)) return String(x); const v = Number(x.toPrecision(d)); return Object.is(v, -0) ? '0' : String(v); };
const lines = (s) => String(s).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const need = (c, m) => { if (!c) throw new Error(m); };
const numOpt = (v, name, lo = -Infinity, hi = Infinity) => { const x = typeof v === 'number' ? v : parseFloat(v); need(Number.isFinite(x), `${name} must be a number`); need(x >= lo && x <= hi, `${name} must be between ${lo} and ${hi}`); return x; };
const seeded = (seed) => { let h = 1779033703 ^ String(seed).length; for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); } let a = h >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const shuf = (a, rnd) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const PAGE_CSS = 'body{font:14px/1.4 system-ui,sans-serif;margin:12px;background:#fff;color:#111}table{border-collapse:collapse}td,th{border:1px solid #888;padding:3px 6px;text-align:left}h1,h2{font-size:1.1rem}.sheet{page-break-after:always}@media print{body{margin:0}}';
const doc = (title, body, css = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PAGE_CSS}${css}</style></head><body>${body}</body></html>`;
const svgWrap = (w, h, inner, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}" style="max-width:100%;height:auto;background:#fff">${inner}</svg>`;
const COLORS = ['#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf'];

// ---------- expression parser / evaluator / differentiator (shared) ----------
const CONSTS = { // CODATA 2022 recommended values, https://physics.nist.gov/cuu/Constants/ (allascii.txt)
  c: [299792458, 'speed of light in vacuum', 'm s^-1', 'exact'], h: [6.62607015e-34, 'Planck constant', 'J Hz^-1', 'exact'], hbar: [1.054571817e-34, 'reduced Planck constant', 'J s', 'exact (1.054 571 817...)'],
  qe: [1.602176634e-19, 'elementary charge', 'C', 'exact'], kB: [1.380649e-23, 'Boltzmann constant', 'J K^-1', 'exact'], NA: [6.02214076e23, 'Avogadro constant', 'mol^-1', 'exact'],
  R: [8.314462618, 'molar gas constant', 'J mol^-1 K^-1', 'exact (8.314 462 618...)'], G: [6.6743e-11, 'Newtonian constant of gravitation', 'm^3 kg^-1 s^-2', 'u = 0.00015e-11'],
  g0: [9.80665, 'standard acceleration of gravity', 'm s^-2', 'exact'], me: [9.1093837139e-31, 'electron mass', 'kg', 'u = 0.0000000028e-31'], mp: [1.67262192595e-27, 'proton mass', 'kg', 'u = 0.00000000052e-27'],
  mn: [1.67492750056e-27, 'neutron mass', 'kg', 'u = 0.00000000085e-27'], eps0: [8.8541878188e-12, 'vacuum electric permittivity', 'F m^-1', 'u = 0.0000000014e-12'], sigma: [5.670374419e-8, 'Stefan-Boltzmann constant', 'W m^-2 K^-4', 'exact (5.670 374 419...)'],
  amu: [1.66053906892e-27, 'atomic mass constant', 'kg', 'u = 0.00000000052e-27'], a0: [5.29177210544e-11, 'Bohr radius', 'm', 'u = 0.00000000082e-11'], alpha: [7.2973525643e-3, 'fine-structure constant', '1', 'u = 0.0000000011e-3'],
  Ryd: [10973731.568157, 'Rydberg constant', 'm^-1', 'u = 0.000012'], F: [96485.33212, 'Faraday constant', 'C mol^-1', 'exact (96 485.332 12...)'],
};
const CONST_SRC = 'Constants: 2022 CODATA recommended values, NIST, https://physics.nist.gov/cuu/Constants/';
const FN1 = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh, exp: Math.exp, ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2, sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign, fact: (n) => gammaFact(n) };
const FN2 = { atan2: Math.atan2, min: Math.min, max: Math.max, pow: Math.pow, mod: (a, b) => ((a % b) + b) % b, hypot: Math.hypot, nCr: (n, k) => Math.round(gammaFact(n) / (gammaFact(k) * gammaFact(n - k))), nPr: (n, k) => Math.round(gammaFact(n) / gammaFact(n - k)), root: (a, n) => (a < 0 && n % 2 === 1 ? -Math.pow(-a, 1 / n) : Math.pow(a, 1 / n)) };
const TRIG = new Set(['sin', 'cos', 'tan']), ITRIG = new Set(['asin', 'acos', 'atan']);
function gammaFact(n) { if (!Number.isInteger(n) || n < 0 || n > 170) return NaN; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
const tokenize = (src) => {
  const s = String(src).replace(/π/g, 'pi').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/²/g, '^2').replace(/³/g, '^3').replace(/√/g, 'sqrt');
  const out = []; let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    let m;
    if ((m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i)))) { out.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; } else if ((m = /^[A-Za-z_][A-Za-z_0-9]*/.exec(s.slice(i)))) { out.push({ t: 'id', v: m[0] }); i += m[0].length; } else if ('+-*/^(),!°'.includes(ch)) { out.push({ t: ch }); i++; } else if (ch === '%') { out.push({ t: '%' }); i++; } else throw new Error(`Unexpected character "${ch}"`);
  }
  return out;
};
function parseExpr(src) {
  const tk = tokenize(src); let p = 0;
  const peek = () => tk[p], eat = (t) => { if (tk[p] && tk[p].t === t) return tk[p++]; return null; };
  const num = (v) => ({ t: 'num', v }), bin = (op, a, b) => ({ t: 'bin', op, a, b });
  function expr() { let a = term(); for (;;) { if (eat('+')) a = bin('+', a, term()); else if (eat('-')) a = bin('-', a, term()); else return a; } }
  function term() {
    let a = unary();
    for (;;) {
      if (eat('*')) a = bin('*', a, unary()); else if (eat('/')) a = bin('/', a, unary());
      else { const n = peek(); if (n && (n.t === 'num' || n.t === 'id' || n.t === '(')) a = bin('*', a, unary()); else return a; }
    }
  }
  function unary() { if (eat('-')) return { t: 'neg', a: unary() }; if (eat('+')) return unary(); return power(); }
  function power() { const a = post(); if (eat('^')) return bin('^', a, unary()); return a; }
  function post() {
    let a = primary();
    for (;;) { if (eat('!')) a = { t: 'fn', n: 'fact', args: [a] }; else if (eat('°')) a = { t: 'deg', a }; else if (eat('%')) a = bin('/', a, num(100)); else return a; }
  }
  function primary() {
    const t = tk[p++]; if (!t) throw new Error('Unexpected end of expression');
    if (t.t === 'num') return num(t.v);
    if (t.t === '(') { const e = expr(); need(eat(')'), 'Missing )'); return e; }
    if (t.t === 'id') {
      const nx = peek();
      if (nx && nx.t === '(' && (FN1[t.v] || FN2[t.v])) {
        p++; const args = []; if (!eat(')')) { do args.push(expr()); while (eat(',')); need(eat(')'), 'Missing )'); }
        const want = FN1[t.v] ? 1 : 2; need(args.length === want, `${t.v}() takes ${want} argument${want > 1 ? 's' : ''}`);
        return { t: 'fn', n: t.v, args };
      }
      if (FN1[t.v] && !(nx && nx.t === '(')) throw new Error(`${t.v} needs parentheses, e.g. ${t.v}(x)`);
      return { t: 'var', n: t.v };
    }
    throw new Error(`Unexpected "${t.t}"`);
  }
  const e = expr(); if (p < tk.length) throw new Error(`Unexpected "${tk[p].t === 'num' ? tk[p].v : tk[p].v || tk[p].t}"`);
  return e;
}
const BASE_ENV = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2 };
function ev(n, env, deg) {
  switch (n.t) {
    case 'num': return n.v;
    case 'var': { if (n.n in env) return env[n.n]; if (n.n in BASE_ENV) return BASE_ENV[n.n]; if (n.n in CONSTS) return CONSTS[n.n][0]; throw new Error(`Unknown name "${n.n}"`); }
    case 'neg': return -ev(n.a, env, deg);
    case 'deg': { const v = ev(n.a, env, deg); return deg ? v : v * Math.PI / 180; }
    case 'bin': { const a = ev(n.a, env, deg), b = ev(n.b, env, deg); switch (n.op) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return a / b; default: return Math.pow(a, b); } }
    case 'fn': {
      const a = n.args.map((x) => ev(x, env, deg));
      if (a.length === 2) return FN2[n.n](a[0], a[1]);
      if (deg && TRIG.has(n.n)) { const r = a[0] % 360; if (n.n === 'tan' && Math.abs(Math.abs(r) % 180 - 90) < 1e-12) return NaN; if (r % 180 === 0 && n.n === 'sin') return 0; return FN1[n.n](a[0] * Math.PI / 180); }
      if (deg && ITRIG.has(n.n)) return FN1[n.n](a[0]) * 180 / Math.PI;
      return FN1[n.n](a[0]);
    }
    default: throw new Error('bad node');
  }
}
const hasVar = (n, v) => (n.t === 'var' ? n.n === v : n.t === 'num' ? false : n.t === 'bin' ? hasVar(n.a, v) || hasVar(n.b, v) : n.t === 'fn' ? n.args.some((x) => hasVar(x, v)) : hasVar(n.a, v));
const freeVars = (n, acc = new Set()) => { if (n.t === 'var') { if (!(n.n in BASE_ENV)) acc.add(n.n); } else if (n.t === 'bin') { freeVars(n.a, acc); freeVars(n.b, acc); } else if (n.t === 'fn') n.args.forEach((x) => freeVars(x, acc)); else if (n.a) freeVars(n.a, acc); return acc; };
const N = (v) => ({ t: 'num', v }), B = (op, a, b) => ({ t: 'bin', op, a, b }), V = (n) => ({ t: 'var', n }), FNn = (n, ...args) => ({ t: 'fn', n, args }), NEG = (a) => ({ t: 'neg', a });
const isNum = (n, v) => n.t === 'num' && (v === undefined || n.v === v);
function simp(n) {
  switch (n.t) {
    case 'num': case 'var': return n;
    case 'deg': return { t: 'deg', a: simp(n.a) };
    case 'neg': { const a = simp(n.a); if (a.t === 'num') return N(-a.v); if (a.t === 'neg') return a.a; return NEG(a); }
    case 'fn': { const args = n.args.map(simp); if (args.every((a) => a.t === 'num') && !TRIG.has(n.n)) { const v = args.length === 1 ? FN1[n.n](args[0].v) : FN2[n.n](args[0].v, args[1].v); if (Number.isInteger(v)) return N(v); } if (n.n === 'sin' && isNum(args[0], 0)) return N(0); if (n.n === 'cos' && isNum(args[0], 0)) return N(1); return { t: 'fn', n: n.n, args }; }
    case 'bin': {
      let a = simp(n.a), b = simp(n.b); const op = n.op;
      if (a.t === 'num' && b.t === 'num') { const v = ev(B(op, a, b), {}); if (Number.isFinite(v) && (Number.isInteger(v) || op !== '/')) return N(v); }
      if (op === '+') { if (isNum(a, 0)) return b; if (isNum(b, 0)) return a; if (b.t === 'neg') return simp(B('-', a, b.a)); if (a.t === 'neg') return simp(B('-', b, a.a)); }
      if (op === '-') { if (isNum(b, 0)) return a; if (isNum(a, 0)) return simp(NEG(b)); if (b.t === 'neg') return simp(B('+', a, b.a)); }
      if (op === '*') {
        if (isNum(a, 0) || isNum(b, 0)) return N(0); if (isNum(a, 1)) return b; if (isNum(b, 1)) return a;
        if (a.t === 'neg') return simp(NEG(B('*', a.a, b))); if (b.t === 'neg') return simp(NEG(B('*', a, b.a)));
        if (isNum(a, -1)) return simp(NEG(b)); if (isNum(b, -1)) return simp(NEG(a));
        if (b.t === 'num' && a.t !== 'num') [a, b] = [b, a];
        if (a.t === 'num' && b.t === 'bin' && b.op === '*' && b.a.t === 'num') return simp(B('*', N(a.v * b.a.v), b.b));
      }
      if (op === '/') { if (isNum(a, 0)) return N(0); if (pr(a) === pr(b)) return N(1); if (isNum(b, 1)) return a; if (a.t === 'neg') return simp(NEG(B('/', a.a, b))); }
      if (op === '^') { if (isNum(b, 0)) return N(1); if (isNum(b, 1)) return a; if (isNum(a, 1)) return N(1); }
      return B(op, a, b);
    }
    default: return n;
  }
}
const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };
function pr(n, par = 0) {
  let s, p;
  switch (n.t) {
    case 'num': s = fmt(n.v, 10); p = n.v < 0 ? 3 : 9; break;
    case 'var': s = n.n; p = 9; break;
    case 'deg': s = pr(n.a, 8) + '°'; p = 9; break;
    case 'neg': s = '-' + pr(n.a, 3); p = 3; break;
    case 'fn': s = `${n.n}(${n.args.map((a) => pr(a)).join(', ')})`; p = 9; break;
    default: {
      p = PREC[n.op]; const l = pr(n.a, n.op === '^' ? 5 : p), r = pr(n.b, n.op === '^' ? 3 : (n.op === '-' || n.op === '/') ? p + 1 : p);
      s = n.op === '^' ? `${l}^${r}` : `${l}${n.op === '*' || n.op === '/' ? ' ' + n.op + ' ' : ' ' + n.op + ' '}${r}`;
    }
  }
  return p < par ? `(${s})` : s;
}
// derivative with a rule trace
function diff(n, v, tr, d = 0) {
  const ind = '  '.repeat(d), log = (rule) => tr && tr.length < 80 && tr.push(`${ind}d/d${v} [ ${pr(n)} ]  ${rule}`);
  const D = (m) => diff(m, v, tr, d + 1);
  if (!hasVar(n, v)) { if (n.t !== 'num') log('constant: 0'); return N(0); }
  switch (n.t) {
    case 'var': log('d/dx x = 1'); return N(1);
    case 'neg': log('negation'); return NEG(D(n.a));
    case 'deg': throw new Error('Derivatives are taken in radians: remove the degree sign');
    case 'bin': {
      const { a, b, op } = n;
      if (op === '+' || op === '-') { log('sum/difference rule'); return B(op, D(a), D(b)); }
      if (op === '*') {
        if (!hasVar(a, v)) { log('constant multiple rule'); return B('*', a, D(b)); }
        if (!hasVar(b, v)) { log('constant multiple rule'); return B('*', D(a), b); }
        log('product rule: (fg)\' = f\'g + fg\''); return B('+', B('*', D(a), b), B('*', a, D(b)));
      }
      if (op === '/') {
        if (!hasVar(b, v)) { log('constant divisor'); return B('/', D(a), b); }
        log('quotient rule: (f/g)\' = (f\'g - fg\')/g^2'); return B('/', B('-', B('*', D(a), b), B('*', a, D(b))), B('^', b, N(2)));
      }
      if (!hasVar(b, v)) { log(isNum(b) ? 'power rule with chain rule' : 'power rule with constant exponent'); return B('*', B('*', b, B('^', a, B('-', b, N(1)))), D(a)); }
      if (!hasVar(a, v)) { log('exponential rule: (a^g)\' = a^g ln(a) g\''); return B('*', B('*', n, FNn('ln', a)), D(b)); }
      log('logarithmic differentiation: (f^g)\' = f^g (g\' ln f + g f\'/f)'); return B('*', n, B('+', B('*', D(b), FNn('ln', a)), B('/', B('*', b, D(a)), a)));
    }
    case 'fn': {
      const u = n.args[0], du = () => D(u), ch = (o) => B('*', o, du());
      if (n.args.length === 2) throw new Error(`Cannot differentiate ${n.n}() with two arguments`);
      log(`chain rule with ${n.n}`);
      switch (n.n) {
        case 'sin': return ch(FNn('cos', u)); case 'cos': return ch(NEG(FNn('sin', u))); case 'tan': return B('/', du(), B('^', FNn('cos', u), N(2)));
        case 'asin': return B('/', du(), FNn('sqrt', B('-', N(1), B('^', u, N(2))))); case 'acos': return NEG(B('/', du(), FNn('sqrt', B('-', N(1), B('^', u, N(2)))))); case 'atan': return B('/', du(), B('+', N(1), B('^', u, N(2))));
        case 'sinh': return ch(FNn('cosh', u)); case 'cosh': return ch(FNn('sinh', u)); case 'tanh': return B('/', du(), B('^', FNn('cosh', u), N(2)));
        case 'exp': return ch(n); case 'ln': return B('/', du(), u);
        case 'log': case 'log10': return B('/', du(), B('*', u, FNn('ln', N(10)))); case 'log2': return B('/', du(), B('*', u, FNn('ln', N(2))));
        case 'sqrt': return B('/', du(), B('*', N(2), n)); case 'cbrt': return B('*', B('/', du(), B('*', N(3), B('^', n, N(2)))), N(1));
        case 'abs': return B('*', B('/', u, n), du());
        default: throw new Error(`No derivative rule for ${n.n}()`);
      }
    }
    default: throw new Error('Cannot differentiate this expression');
  }
}
// polynomials (coefficients low to high)
const pAdd = (a, b) => { const r = Array(Math.max(a.length, b.length)).fill(0); a.forEach((x, i) => { r[i] += x; }); b.forEach((x, i) => { r[i] += x; }); return r; };
const pMul = (a, b) => { const r = Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { r[i + j] += x * y; })); return r; };
const pTrim = (a) => { a = [...a]; while (a.length > 1 && Math.abs(a[a.length - 1]) < 1e-14 * Math.max(1, ...a.map(Math.abs))) a.pop(); return a; };
function toPoly(n, v) {
  switch (n.t) {
    case 'num': return [n.v];
    case 'var': if (n.n === v) return [0, 1]; if (n.n in BASE_ENV) return [BASE_ENV[n.n]]; throw new Error(`Unknown symbol "${n.n}"`);
    case 'neg': return toPoly(n.a, v).map((x) => -x);
    case 'bin': {
      if (n.op === '+') return pAdd(toPoly(n.a, v), toPoly(n.b, v)); if (n.op === '-') return pAdd(toPoly(n.a, v), toPoly(n.b, v).map((x) => -x));
      if (n.op === '*') return pMul(toPoly(n.a, v), toPoly(n.b, v));
      if (n.op === '/') { const d = toPoly(n.b, v); need(d.length === 1 && d[0] !== 0, 'Division is only allowed by a nonzero number'); return toPoly(n.a, v).map((x) => x / d[0]); }
      const e = toPoly(n.b, v); need(e.length === 1 && Number.isInteger(e[0]) && e[0] >= 0 && e[0] <= 60, 'Exponents must be whole numbers from 0 to 60'); let r = [1]; for (let i = 0; i < e[0]; i++) r = pMul(r, toPoly(n.a, v)); return r;
    }
    default: throw new Error('Only polynomial equations are supported (no functions)');
  }
}
function plotSvgDoc({ series, xmin, xmax, ymin, ymax, marks = [], shade, title, W = 640, H = 420 }) {
  const L = 44, R = 12, Tp = 12, Bt = 28, pw = W - L - R, ph = H - Tp - Bt;
  const X = (x) => L + (x - xmin) / (xmax - xmin) * pw, Y = (y) => Tp + (ymax - y) / (ymax - ymin) * ph;
  const tick = (lo, hi) => { const raw = (hi - lo) / 6, mag = 10 ** Math.floor(Math.log10(raw)); const st = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw); const out = []; for (let t = Math.ceil(lo / st) * st; t <= hi + 1e-12; t += st) out.push(Number(t.toPrecision(12))); return out; };
  let g = `<rect x="${L}" y="${Tp}" width="${pw}" height="${ph}" fill="none" stroke="#888"/>`;
  for (const t of tick(xmin, xmax)) g += `<line x1="${X(t)}" x2="${X(t)}" y1="${Tp}" y2="${Tp + ph}" stroke="#ddd"/><text x="${X(t)}" y="${H - 10}" font-size="11" text-anchor="middle" fill="#333">${t}</text>`;
  for (const t of tick(ymin, ymax)) g += `<line y1="${Y(t)}" y2="${Y(t)}" x1="${L}" x2="${L + pw}" stroke="#ddd"/><text x="${L - 4}" y="${Y(t) + 4}" font-size="11" text-anchor="end" fill="#333">${t}</text>`;
  if (xmin < 0 && xmax > 0) g += `<line x1="${X(0)}" x2="${X(0)}" y1="${Tp}" y2="${Tp + ph}" stroke="#555"/>`;
  if (ymin < 0 && ymax > 0) g += `<line y1="${Y(0)}" y2="${Y(0)}" x1="${L}" x2="${L + pw}" stroke="#555"/>`;
  g += `<clipPath id="c"><rect x="${L}" y="${Tp}" width="${pw}" height="${ph}"/></clipPath><g clip-path="url(#c)">`;
  if (shade) g += `<path d="${shade.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(2) + ' ' + Y(Math.max(ymin - 1e3 * (ymax - ymin), Math.min(ymax + 1e3 * (ymax - ymin), p[1]))).toFixed(2)).join('')}Z" fill="#1f77b455" stroke="none"/>`;
  series.forEach((s, k) => { let d = '', pen = false; for (const [x, y] of s.pts) { if (!Number.isFinite(y) || Math.abs(y) > 1e3 * (ymax - ymin) + 1e6) { pen = false; continue; } d += (pen ? 'L' : 'M') + X(x).toFixed(2) + ' ' + Y(y).toFixed(2); pen = true; } g += `<path d="${d}" fill="none" stroke="${COLORS[k % COLORS.length]}" stroke-width="2"/>`; });
  for (const m of marks) g += `<circle cx="${X(m[0])}" cy="${Y(m[1])}" r="4" fill="${m[2] || '#000'}" stroke="#fff"/>`;
  g += '</g>';
  const legend = series.map((s, k) => `<span style="color:${COLORS[k % COLORS.length]}">&#9632;</span> ${esc(s.name)}`).join(' &nbsp; ');
  return svgWrap(W, H, g, title) + `<p>${legend}</p>`;
}

// ---------- numeric helpers ----------
const fnOf = (src, v = 'x', deg = false) => { const ast = parseExpr(src.replace(/^\s*(y|f\(\w\)|z)\s*=/i, '')); const unknown = [...freeVars(ast)].filter((k) => k !== v && !(k in CONSTS)); need(!unknown.length, `Unknown name "${unknown[0]}": use only ${v}, pi, e and functions`); return { ast, f: (x) => ev(ast, { [v]: x }, deg) }; };
function findRoots(f, lo, hi, n = 4000) {
  const out = []; let px = lo, py = f(lo);
  for (let i = 1; i <= n; i++) {
    const x = lo + (hi - lo) * i / n, y = f(x);
    if (Number.isFinite(py) && Number.isFinite(y) && (py === 0 || py * y < 0)) {
      let a = px, b = x, fa = py; for (let k = 0; k < 80; k++) { const m = (a + b) / 2, fm = f(m); if (fa * fm <= 0) b = m; else { a = m; fa = fm; } }
      const r = (a + b) / 2, scale = Math.max(Math.abs(py), Math.abs(y));
      if (Math.abs(f(r)) <= 1e-6 * Math.max(1, scale) && Math.abs(f(r)) < Math.max(Math.abs(py), Math.abs(y)) + 1e-12 && (!out.length || Math.abs(out[out.length - 1] - r) > 1e-9)) out.push(r);
    }
    px = x; py = y;
  }
  return out;
}
const autoRange = (vals) => { const v = vals.filter(Number.isFinite).sort((a, b) => a - b); if (!v.length) return [-1, 1]; const lo = v[Math.floor(v.length * 0.02)], hi = v[Math.ceil(v.length * 0.98) - 1]; const pad = (hi - lo || 1) * 0.1; return [lo - pad, hi + pad]; };
const optNum = (v, d) => (v === '' || v == null ? d : numOpt(v, 'Value'));

T.push({
  id: 'function-grapher-roots', cat: MS, title: 'Function Grapher with Roots and Intersections',
  desc: 'Plot one or more functions of x, with the roots and the points where two curves cross marked and listed.',
  inputs: 1, labels: ['Functions of x, one per line (y = x^2 - 3, sin(x), ...)'], sample: 'y = x^2 - 3\nsin(x) * 2',
  opts: [{ id: 'xmin', label: 'x min', type: 'number', def: -6 }, { id: 'xmax', label: 'x max', type: 'number', def: 6 }, { id: 'ymin', label: 'y min (blank = automatic)', type: 'text', def: '' }, { id: 'ymax', label: 'y max (blank = automatic)', type: 'text', def: '' }, { id: 'deg', label: 'Trig functions use degrees', type: 'checkbox', def: false }],
  run: ([src], o) => {
    const xmin = numOpt(o.xmin, 'x min'), xmax = numOpt(o.xmax, 'x max'); need(xmax > xmin, 'x max must be larger than x min');
    const ls = lines(src); need(ls.length, 'Enter at least one function'); need(ls.length <= 6, 'At most 6 functions');
    const fs = ls.map((l) => ({ name: l, f: fnOf(l, 'x', o.deg).f }));
    const N0 = 800; const series = fs.map((s) => ({ name: s.name, pts: Array.from({ length: N0 + 1 }, (_, i) => { const x = xmin + (xmax - xmin) * i / N0; return [x, s.f(x)]; }) }));
    let [ylo, yhi] = autoRange(series.flatMap((s) => s.pts.map((p) => p[1]))); const ymin = optNum(o.ymin, ylo), ymax = optNum(o.ymax, yhi); need(ymax > ymin, 'y max must be larger than y min');
    const marks = [], rows = [];
    fs.forEach((s, i) => { const r = findRoots(s.f, xmin, xmax); r.forEach((x) => { marks.push([x, 0, '#000']); }); rows.push(`Roots of ${s.name}: ${r.length ? r.map((x) => 'x = ' + (Math.abs(x) < 1e-12 ? '0' : fmt(x, 8))).join(', ') : 'none found in range'}`); });
    for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) { const r = findRoots((x) => fs[i].f(x) - fs[j].f(x), xmin, xmax); r.forEach((x) => marks.push([x, fs[i].f(x), '#e6a700'])); rows.push(`Crossings of #${i + 1} and #${j + 1}: ${r.length ? r.map((x) => `(${fmt(x, 8)}, ${fmt(fs[i].f(x), 8)})`).join(', ') : 'none found in range'}`); }
    const svg = plotSvgDoc({ series, xmin, xmax, ymin, ymax, marks, title: `Graph of ${ls.join('; ')}` });
    return { html: doc('Graph', svg + '<pre>' + esc(rows.join('\n') + '\n\nBlack dots: roots (sign changes). Orange dots: crossings. Found by sampling 4000 points and bisection, so touching roots (like x^2) and jumps can be missed or shown wrongly: review before relying on them.') + '</pre>') };
  },
});

T.push({
  id: 'scientific-calculator-degrees', cat: MS, title: 'Scientific Calculator with Degrees and CODATA Constants',
  desc: 'Evaluate full expressions with trig (degrees or radians), logs, factorials, variables and physical constants that show their NIST source.',
  inputs: 1, labels: ['Expressions, one per line (a = 5 sets a variable, ans = last result)'], sample: 'sin(30°) + log(100) * pi\nr = 2\n2 * pi * r^2\nkB * 300 / qe\n5!',
  opts: [{ id: 'unit', label: 'Angle unit', type: 'select', choices: ['Radians', 'Degrees'], def: 'Radians' }, { id: 'digits', label: 'Significant digits', type: 'number', def: 12 }, { id: 'list', label: 'List all constants with sources', type: 'checkbox', def: false }],
  run: ([src], o) => {
    const deg = o.unit === 'Degrees', d = numOpt(o.digits, 'Digits', 1, 17), env = { ans: 0 }, out = [], used = new Set();
    for (const l of lines(src)) {
      try {
        const m = /^([A-Za-z_]\w*)\s*=(?!=)\s*(.+)$/.exec(l); const ast = parseExpr(m ? m[2] : l);
        freeVars(ast).forEach((k) => { if (k in CONSTS && !(k in env)) used.add(k); });
        const v = ev(ast, env, deg); need(Number.isFinite(v), 'not a finite number (check domain)'); env.ans = v; if (m) env[m[1]] = v;
        out.push(`${l}  =  ${fmt(v, d)}`);
      } catch (e) { out.push(`${l}  ->  error: ${e.message}`); }
    }
    const names = o.list ? Object.keys(CONSTS) : [...used];
    let t = out.join('\n') + `\n\nAngle unit: ${deg ? 'degrees' : 'radians'}. The degree sign converts to the current unit.`;
    if (names.length) t += '\n\n' + CONST_SRC + '\n' + names.map((k) => `  ${k} = ${CONSTS[k][0]} ${CONSTS[k][2]}  (${CONSTS[k][1]}; ${CONSTS[k][3]})`).join('\n');
    return t + '\nBase names: pi, e, tau, phi. Floating point (IEEE double) so about 15-16 digits are meaningful.';
  },
});

// ---------- polynomial equation solver ----------
const gcdBI = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const cAdd = (a, b) => [a[0] + b[0], a[1] + b[1]], cSub = (a, b) => [a[0] - b[0], a[1] - b[1]], cMul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cDiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
function numericRoots(c) { // c low->high, degree >= 1, real coefficients. Durand-Kerner then Newton polish.
  const n = c.length - 1, a = c.map((x) => x / c[n]); const R = 1 + Math.max(...a.slice(0, n).map(Math.abs));
  const z = Array.from({ length: n }, (_, k) => { const ang = 2 * Math.PI * k / n + 0.4; return [R * 0.7 * Math.cos(ang), R * 0.7 * Math.sin(ang)]; });
  const horner = (x) => { let r = [a[n], 0]; for (let i = n - 1; i >= 0; i--) r = cAdd(cMul(r, x), [a[i], 0]); return r; };
  for (let it = 0; it < 2000; it++) {
    let delta = 0;
    for (let i = 0; i < n; i++) { let den = [1, 0]; for (let j = 0; j < n; j++) if (j !== i) den = cMul(den, cSub(z[i], z[j])); if (den[0] === 0 && den[1] === 0) den = [1e-12, 0]; const step = cDiv(horner(z[i]), den); z[i] = cSub(z[i], step); delta = Math.max(delta, Math.hypot(step[0], step[1])); }
    if (delta < 1e-15 * R) break;
  }
  const dp = a.map((x, i) => x * i).slice(1);
  return z.map((x) => { for (let k = 0; k < 8; k++) { let d = [dp[dp.length - 1], 0]; for (let i = dp.length - 2; i >= 0; i--) d = cAdd(cMul(d, x), [dp[i], 0]); if (!d[0] && !d[1]) break; const nx = cSub(x, cDiv(horner(x), d)); if (!Number.isFinite(nx[0] + nx[1])) break; x = nx; } return Math.abs(x[1]) < 1e-9 * (1 + Math.abs(x[0])) ? [x[0], 0] : x; });
}
const divisors = (n) => { const r = []; for (let i = 1n; i * i <= n; i++) if (n % i === 0n) { r.push(i); if (i * i !== n) r.push(n / i); } return r; };
function rationalRoots(coefs) { // coefs: real array low->high. Returns {roots:[[p,q]], rest:[...] or null}
  let sc = null; for (const k of [1, 10, 100, 1e3, 1e4, 1e5, 1e6]) if (coefs.every((x) => Math.abs(x * k - Math.round(x * k)) < 1e-9 * Math.max(1, Math.abs(x * k)))) { sc = k; break; }
  if (!sc) return { roots: [], rest: null };
  let A = coefs.map((x) => BigInt(Math.round(x * sc))); const roots = [];
  const trim = () => { while (A.length > 1 && A[A.length - 1] === 0n) A.pop(); };
  trim();
  while (A.length > 1 && A[0] === 0n) { A = A.slice(1); roots.push([0n, 1n]); }
  for (let guard = 0; A.length > 3 && guard < 60; guard++) {
    const a0 = A[0] < 0n ? -A[0] : A[0], an = A[A.length - 1] < 0n ? -A[A.length - 1] : A[A.length - 1];
    if (a0 > 10n ** 12n || an > 10n ** 12n) break;
    let found = null;
    outer: for (const p of divisors(a0)) for (const q of divisors(an)) for (const sg of [1n, -1n]) {
      const P = p * sg; if (gcdBI(P, q) !== 1n) continue; let s = 0n; const nn = A.length - 1; for (let i = 0; i <= nn; i++) s += A[i] * P ** BigInt(i) * q ** BigInt(nn - i);
      if (s === 0n) { found = [P, q]; break outer; }
    }
    if (!found) break;
    const [P, q] = found; // divide A by (q x - P)
    const nn = A.length - 1, Q = Array(nn).fill(0n); let rem = A[nn];
    for (let i = nn - 1; i >= 0; i--) { Q[i] = rem / q; rem = A[i] + Q[i] * P; }
    roots.push(found); A = Q;
  }
  return { roots, rest: A.map((x) => Number(x) / sc) };
}
const showC = (z, d = 10) => { const [re, im] = z; if (im === 0) return fmt(re, d); return `${fmt(re, d)} ${im < 0 ? '-' : '+'} ${fmt(Math.abs(im), d)}i`; };
const polyStr = (c, v = 'x') => { const t = []; for (let i = c.length - 1; i >= 0; i--) { const a = c[i]; if (Math.abs(a) < 1e-14) continue; const m = i === 0 ? '' : i === 1 ? v : `${v}^${i}`; const abs = Math.abs(a), co = (abs === 1 && i > 0) ? '' : fmt(abs, 10); t.push((t.length ? (a < 0 ? ' - ' : ' + ') : (a < 0 ? '-' : '')) + co + m); } return t.length ? t.join('') : '0'; };

T.push({
  id: 'polynomial-equation-solver', cat: MS, title: 'Equation Solver: Linear, Quadratic and Polynomial Roots with Steps',
  desc: 'Solve an equation in one variable, such as 2x^2 + 3x - 5 = 0, with each step and the real and complex roots.',
  inputs: 1, labels: ['Equation in one variable (2x^2 + 3x - 5 = 0)'], sample: '2x^2 + 3x - 5 = 0',
  run: ([src]) => {
    const s = lines(src)[0]; need(s, 'Enter an equation'); const parts = s.split('='); need(parts.length <= 2, 'Use a single = sign');
    const L = parseExpr(parts[0]), Rr = parts.length === 2 ? parseExpr(parts[1]) : N(0);
    const vars = freeVars(B('-', L, Rr)); need(vars.size > 0, 'No unknown found: write the equation with a letter such as x'); need(vars.size === 1, `One unknown only (found ${[...vars].join(', ')})`);
    const v = [...vars][0], out = [`Equation: ${s}`, `Unknown: ${v}`];
    let c; try { c = pTrim(toPoly(B('-', L, Rr), v)); } catch (e) {
      const f = (x) => ev(B('-', L, Rr), { [v]: x }, false); const r = findRoots(f, -100, 100, 20000);
      if (!/polynomial|Unknown symbol/.test(e.message)) throw e;
      return `${out.join('\n')}\n\nNot a polynomial, so no algebraic steps. Numeric roots between -100 and 100 (sign changes, bisection):\n${r.length ? r.map((x) => `  ${v} = ${fmt(x, 10)}`).join('\n') : '  none found'}\nTouching roots and roots outside the range can be missed: review.`;
    }
    out.push(`Move everything to the left: ${polyStr(c, v)} = 0`);
    const deg = c.length - 1;
    if (deg === 0) return out.join('\n') + (Math.abs(c[0]) < 1e-12 ? '\n\nEvery value works (identity 0 = 0).' : `\n\nNo solution: ${fmt(c[0])} = 0 is false.`);
    const rr = [];
    const solveLow = (cc, o2) => { // cc degree 1 or 2
      if (cc.length === 2) { o2.push(`Linear: ${fmt(cc[1])}${v} + ${fmt(cc[0])} = 0  ->  ${v} = ${fmt(-cc[0])} / ${fmt(cc[1])}`); return [[-cc[0] / cc[1], 0]]; }
      const [C, Bq, A] = cc, D = Bq * Bq - 4 * A * C;
      o2.push(`Quadratic with a = ${fmt(A)}, b = ${fmt(Bq)}, c = ${fmt(C)}`, `Discriminant D = b^2 - 4ac = ${fmt(D)}`);
      if (Math.abs(D) < 1e-12 * Math.max(1, Bq * Bq)) { o2.push(`D = 0: one repeated real root, ${v} = -b / 2a`); return [[-Bq / (2 * A), 0], [-Bq / (2 * A), 0]]; }
      if (D > 0) { const q = -(Bq + Math.sign(Bq || 1) * Math.sqrt(D)) / 2; o2.push(`D > 0: two real roots, ${v} = (-b +- sqrt(D)) / 2a`); return [[q / A, 0], [C / q, 0]].sort((a, b) => a[0] - b[0]); }
      o2.push(`D < 0: two complex roots, ${v} = (-b +- i*sqrt(-D)) / 2a`); return [[-Bq / (2 * A), -Math.sqrt(-D) / (2 * A)], [-Bq / (2 * A), Math.sqrt(-D) / (2 * A)]];
    };
    if (deg <= 2) rr.push(...solveLow(c, out));
    else {
      const { roots, rest } = rationalRoots(c);
      if (roots.length) { out.push(`Rational root theorem (integer-coefficient check, exact BigInt arithmetic): found ${roots.map(([p, q]) => `${v} = ${q === 1n ? p : p + '/' + q}`).join(', ')}`); roots.forEach(([p, q]) => rr.push([Number(p) / Number(q), 0])); }
      const rest2 = rest ? pTrim(rest) : c;
      if (rest2.length > 1 && rest2.length <= 3) { out.push(`Remaining factor: ${polyStr(rest2, v)} = 0`); rr.push(...solveLow(rest2, out)); } else if (rest2.length > 3) { out.push(`No more rational roots. Remaining polynomial of degree ${rest2.length - 1}: ${polyStr(rest2, v)}. Solved numerically (Durand-Kerner, then Newton polish); degree 5+ has no general formula in radicals.`); rr.push(...numericRoots(rest2)); }
    }
    rr.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const mx = Math.max(...c.map(Math.abs)); const chk = rr.map((z) => { let r = [c[deg], 0]; for (let i = deg - 1; i >= 0; i--) r = cAdd(cMul(r, z), [c[i], 0]); return Math.hypot(r[0], r[1]); });
    out.push('', `Roots (${rr.length}, counted with multiplicity):`, ...rr.map((z, i) => `  ${v}${rr.length > 1 ? '_' + (i + 1) : ''} = ${showC(z)}`), '', `Check: largest |p(root)| = ${chk.reduce((a, b) => Math.max(a, b), 0).toExponential(2)} (coefficients up to ${fmt(mx, 4)}). Multiple roots are less precise when found numerically.`);
    return out.join('\n');
  },
});

T.push({
  id: 'derivative-calculator-steps', cat: MS, title: 'Symbolic Derivative Calculator with Rule-by-Rule Steps',
  desc: 'Differentiate a function of x symbolically, see which rule is applied at each level, and get the simplified result.',
  inputs: 1, labels: ['Function (x^2 * sin(x), exp(3x)/x, ln(x^2+1))'], sample: 'x^2 * sin(x)',
  opts: [{ id: 'order', label: 'Order of derivative (1-4)', type: 'number', def: 1 }, { id: 'at', label: 'Evaluate at x = (blank = skip)', type: 'text', def: '' }],
  run: ([src], o) => {
    const order = numOpt(o.order, 'Order', 1, 4); need(Number.isInteger(order), 'Order must be a whole number');
    const f0 = lines(src)[0]; need(f0, 'Enter a function'); let ast = parseExpr(f0.replace(/^\s*(y|f\(x\))\s*=/i, ''));
    const un = [...freeVars(ast)].filter((k) => k !== 'x' && !(k in CONSTS)); need(!un.length, `Only x is allowed as the variable (found ${un[0]})`);
    const out = [`f(x) = ${pr(ast)}`]; let cur = ast;
    for (let k = 1; k <= order; k++) {
      const tr = []; const raw = diff(cur, 'x', tr); const sm = simp(simp(raw));
      out.push('', k === 1 ? 'Steps (first derivative):' : `Order ${k}: differentiate again`, ...(k === 1 ? tr.slice(0, 40) : []), `Result: f${"'".repeat(k)}(x) = ${pr(sm)}`); cur = sm;
    }
    if (o.at !== '' && o.at != null) { const x0 = numOpt(o.at, 'x'); out.push('', `At x = ${fmt(x0)}: f = ${fmt(ev(ast, { x: x0 }))}, f${"'".repeat(order)} = ${fmt(ev(cur, { x: x0 }))}`); }
    out.push('', 'Rules used: constant, power, sum, product, quotient, chain, exponential and the standard functions. The result is simplified only with simple arithmetic rules, so equivalent forms may look longer than a hand-simplified answer. Radians assumed.');
    return out.join('\n');
  },
});

// ---------- integral ----------
function linearOf(n, v) { try { const p = pTrim(toPoly(n, v)); if (p.length === 2) return { a: p[1], b: p[0] }; } catch { /* not polynomial */ } return null; }
function anti(n, v) {
  if (!hasVar(n, v)) return B('*', n, V(v));
  try { const p = pTrim(toPoly(n, v)); return p.map((c, i) => (c === 0 ? null : (Number.isInteger(c) || i === 0) ? (i === 0 ? B('*', N(c), V(v)) : B('/', c === 1 ? B('^', V(v), N(i + 1)) : B('*', N(c), B('^', V(v), N(i + 1))), N(i + 1))) : B('*', N(c / (i + 1)), B('^', V(v), N(i + 1))))).filter(Boolean).reduce((a, b) => (a ? B('+', a, b) : b), null); } catch { /* not polynomial */ }
  if (n.t === 'neg') { const a = anti(n.a, v); return a && NEG(a); }
  if (n.t === 'bin') {
    const { a, b, op } = n;
    if (op === '+' || op === '-') { const x = anti(a, v), y = anti(b, v); return x && y && B(op, x, y); }
    if (op === '*') { if (!hasVar(a, v)) { const y = anti(b, v); return y && B('*', a, y); } if (!hasVar(b, v)) { const x = anti(a, v); return x && B('*', b, x); } return null; }
    if (op === '/') {
      if (!hasVar(b, v)) { const x = anti(a, v); return x && B('/', x, b); }
      if (!hasVar(a, v)) {
        const l = linearOf(b, v); if (l && l.a !== 0) return B('/', B('*', a, FNn('ln', FNn('abs', b))), N(l.a));
        try { const p = pTrim(toPoly(b, v)); if (p.length === 3 && p[1] === 0 && p[0] * p[2] > 0) return B('*', B('/', a, N(Math.sqrt(p[0] * p[2]))), FNn('atan', B('*', V(v), N(Math.sqrt(p[2] / p[0]))))); } catch { /* skip */ }
      }
      return null;
    }
    const l = linearOf(a, v);
    if (l && l.a !== 0 && !hasVar(b, v)) { const e = ev(b, {}, false); if (e === -1) return B('/', FNn('ln', FNn('abs', a)), N(l.a)); return B('/', B('^', a, N(e + 1)), N(l.a * (e + 1))); }
    const lb = linearOf(b, v);
    if (!hasVar(a, v) && lb && lb.a !== 0) { const base = ev(a, {}, false); if (base > 0 && base !== 1) return B('/', n, N(lb.a * Math.log(base))); }
    return null;
  }
  if (n.t === 'fn') {
    const u = n.args[0], l = linearOf(u, v); if (!l || l.a === 0) return null; const k = N(l.a);
    switch (n.n) {
      case 'sin': return NEG(B('/', FNn('cos', u), k)); case 'cos': return B('/', FNn('sin', u), k); case 'exp': return B('/', n, k);
      case 'sinh': return B('/', FNn('cosh', u), k); case 'cosh': return B('/', FNn('sinh', u), k);
      case 'tan': return NEG(B('/', FNn('ln', FNn('abs', FNn('cos', u))), k));
      case 'sqrt': return B('/', B('*', N(2 / 3), B('^', u, N(1.5))), k);
      case 'ln': return B('/', B('-', B('*', u, FNn('ln', u)), u), k);
      default: return null;
    }
  }
  return null;
}
function simpson(f, a, b, eps = 1e-10) {
  let evals = 0; const F = (x) => { evals++; return f(x); };
  const S = (fa, fm, fb, a1, b1) => (b1 - a1) / 6 * (fa + 4 * fm + fb);
  const rec = (a1, b1, fa, fm, fb, whole, e, d) => {
    const m = (a1 + b1) / 2, lm = (a1 + m) / 2, rm = (m + b1) / 2, flm = F(lm), frm = F(rm), L = S(fa, flm, fm, a1, m), R = S(fm, frm, fb, m, b1);
    if (d <= 0 || evals > 400000 || Math.abs(L + R - whole) <= 15 * e) return L + R + (L + R - whole) / 15;
    return rec(a1, m, fa, flm, fm, L, e / 2, d - 1) + rec(m, b1, fm, frm, fb, R, e / 2, d - 1);
  };
  const fa = F(a), fb = F(b), fm = F((a + b) / 2); return rec(a, b, fa, fm, fb, S(fa, fm, fb, a, b), eps, 40);
}
T.push({
  id: 'integral-calculator-area', cat: MS, title: 'Integral Calculator: Antiderivative, Definite Integral and Shaded Area',
  desc: 'Find the antiderivative of common functions and the value of a definite integral, with a numeric cross-check and a plot of the area.',
  inputs: 1, labels: ['Function of x (3x^2 + sin(2x), 1/(x+1), exp(-x))'], sample: 'x^2 + sin(x)',
  opts: [{ id: 'a', label: 'Lower limit (blank = indefinite)', type: 'text', def: '0' }, { id: 'b', label: 'Upper limit', type: 'text', def: '3' }],
  run: ([src], o) => {
    const f0 = lines(src)[0]; need(f0, 'Enter a function'); const { ast, f } = fnOf(f0, 'x', false);
    const out = [`f(x) = ${pr(ast)}`]; let F = anti(ast, 'x');
    if (F) { F = simp(simp(F)); const pts = [0.37, 0.91, 1.43, 2.17, 2.9]; const ok = pts.every((x) => { const g = (xx) => ev(F, { x: xx }, false), h = 1e-5, num = (g(x + h) - g(x - h)) / (2 * h), ex = f(x); return !Number.isFinite(num) || !Number.isFinite(ex) || Math.abs(num - ex) <= 1e-5 * (1 + Math.abs(ex)); }); if (!ok) F = null; }
    out.push(F ? `Antiderivative: F(x) = ${pr(F)} + C   (checked by differentiating numerically at 5 points)` : 'Antiderivative: not found by the built-in rule table (polynomials, sums, constant multiples, powers of a linear term, sin, cos, exp, sinh, cosh, tan, sqrt, ln of a linear term, c/(ax+b), c/(ax^2+k)). Products and compositions need by-parts or substitution, which is not built in.');
    let html = '';
    if (o.a !== '' && o.b !== '') {
      const a = numOpt(o.a, 'Lower limit'), b = numOpt(o.b, 'Upper limit'); need(a !== b, 'Limits must differ'); const lo = Math.min(a, b), hi = Math.max(a, b);
      const num = simpson(f, lo, hi) * (a > b ? -1 : 1); need(Number.isFinite(num), 'The function is not finite on this interval (a singularity?)');
      out.push('', `Numeric value (adaptive Simpson, tolerance 1e-10): ${fmt(num, 12)}`);
      if (F) { const ex = ev(F, { x: b }, false) - ev(F, { x: a }, false); out.push(`F(${fmt(b)}) - F(${fmt(a)}) = ${fmt(ex, 12)}`); if (!(Math.abs(ex - num) <= 1e-6 * (1 + Math.abs(num)))) out.push('The two values disagree: the function probably has a singularity or sign change inside the interval. Review before using either.'); }
      const n = 400, pts = Array.from({ length: n + 1 }, (_, i) => { const x = lo + (hi - lo) * i / n; return [x, f(x)]; });
      const pad = (hi - lo) * 0.15, xmin = lo - pad, xmax = hi + pad, wide = Array.from({ length: 601 }, (_, i) => { const x = xmin + (xmax - xmin) * i / 600; return [x, f(x)]; });
      const [ylo, yhi] = autoRange(wide.map((p) => p[1]).concat([0])); const sh = [[lo, 0], ...pts, [hi, 0]];
      html = plotSvgDoc({ series: [{ name: `f(x) = ${pr(ast)}`, pts: wide }], xmin, xmax, ymin: Math.min(ylo, -0.05 * Math.abs(yhi)), ymax: yhi, shade: sh, title: `Area under ${f0} from ${lo} to ${hi}` });
    }
    out.push('', 'Numeric values use floating point. Signed area: parts below the x axis count as negative.');
    return { html: doc('Integral', `<pre>${esc(out.join('\n'))}</pre>${html}`) };
  },
});

// ---------- 3D surface ----------
T.push({
  id: 'surface-plotter-3d', cat: MS, title: '3D Surface Plotter z = f(x, y)',
  desc: 'Draw a surface z = f(x, y) as a shaded 3D mesh and turn it by setting the azimuth and elevation angles.',
  inputs: 1, labels: ['z = f(x, y)  (sin(x) * cos(y), x^2 - y^2, sin(sqrt(x^2+y^2)))'], sample: 'sin(x) * cos(y)',
  opts: [{ id: 'xmin', label: 'x min', type: 'number', def: -3.14 }, { id: 'xmax', label: 'x max', type: 'number', def: 3.14 }, { id: 'ymin', label: 'y min', type: 'number', def: -3.14 }, { id: 'ymax', label: 'y max', type: 'number', def: 3.14 }, { id: 'n', label: 'Grid cells per side (6-60)', type: 'number', def: 30 }, { id: 'az', label: 'Azimuth (degrees)', type: 'number', def: 35 }, { id: 'el', label: 'Elevation (degrees, 0-90)', type: 'number', def: 30 }],
  run: ([src], o) => {
    const ast = parseExpr(lines(src)[0].replace(/^\s*z\s*=/i, '')), un = [...freeVars(ast)].filter((k) => k !== 'x' && k !== 'y' && !(k in CONSTS)); need(!un.length, `Unknown name "${un[0]}": use x and y`);
    const x0 = numOpt(o.xmin, 'x min'), x1 = numOpt(o.xmax, 'x max'), y0 = numOpt(o.ymin, 'y min'), y1 = numOpt(o.ymax, 'y max'); need(x1 > x0 && y1 > y0, 'Max must be larger than min');
    const n = Math.round(numOpt(o.n, 'Grid', 6, 60)), az = numOpt(o.az, 'Azimuth') * Math.PI / 180, el = numOpt(o.el, 'Elevation', 0, 90) * Math.PI / 180;
    const Z = []; let zlo = Infinity, zhi = -Infinity;
    for (let i = 0; i <= n; i++) { Z.push([]); for (let j = 0; j <= n; j++) { const z = ev(ast, { x: x0 + (x1 - x0) * i / n, y: y0 + (y1 - y0) * j / n }, false); Z[i].push(Number.isFinite(z) ? z : NaN); if (Number.isFinite(z)) { zlo = Math.min(zlo, z); zhi = Math.max(zhi, z); } } }
    need(Number.isFinite(zlo), 'f(x, y) is not finite anywhere in the range'); const zr = zhi - zlo || 1;
    const P = (i, j) => { const x = 2 * i / n - 1, y = 2 * j / n - 1, z = (Z[i][j] - zlo) / zr * 1.2 - 0.6; const xr = x * Math.cos(az) - y * Math.sin(az), yr = x * Math.sin(az) + y * Math.cos(az); return { sx: xr, sy: z * Math.cos(el) + yr * Math.sin(el), d: -yr * Math.cos(el) + z * Math.sin(el), z: Z[i][j] }; };
    const faces = []; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const q = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)]; if (q.some((p) => Number.isNaN(p.z))) continue; faces.push({ q, d: q.reduce((a, p) => a + p.d, 0) / 4, z: q.reduce((a, p) => a + p.z, 0) / 4 }); }
    faces.sort((a, b) => a.d - b.d); const W = 560, H = 440, S = 190, X = (v) => W / 2 + v * S, Y = (v) => H / 2 + 20 - v * S;
    const body = faces.map((f) => `<polygon points="${f.q.map((p) => X(p.sx).toFixed(1) + ',' + Y(p.sy).toFixed(1)).join(' ')}" fill="hsl(${Math.round(240 - 240 * (f.z - zlo) / zr)},70%,55%)" stroke="#fff" stroke-width=".4"/>`).join('');
    return { html: doc('Surface', svgWrap(W, H, body, `3D surface of z = ${pr(ast)} for x from ${x0} to ${x1}, y from ${y0} to ${y1}; z from ${fmt(zlo, 4)} to ${fmt(zhi, 4)}`) + `<p>z = ${esc(pr(ast))}, x in [${x0}, ${x1}], y in [${y0}, ${y1}], z in [${fmt(zlo, 4)}, ${fmt(zhi, 4)}] (blue low, red high). Azimuth ${o.az}, elevation ${o.el}. Change the angles to turn the surface. Depth-sorted polygons, no hidden-line perfection for steep surfaces.</p>`) };
  },
});

// ---------- number theory ----------
const bigAbs = (a) => (a < 0n ? -a : a);
const modPow = (b, e, m) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; };
const MR_BASES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
function isPrimeBig(n) { // deterministic for n < 3.3e24 with these 12 bases (Sorenson and Webster 2015); probable prime above
  if (n < 2n) return false; for (const p of MR_BASES) { if (n === p) return true; if (n % p === 0n) return false; }
  let d = n - 1n, s = 0; while ((d & 1n) === 0n) { d >>= 1n; s++; }
  for (const a of MR_BASES) { let x = modPow(a, d, n); if (x === 1n || x === n - 1n) continue; let comp = true; for (let r = 1; r < s; r++) { x = (x * x) % n; if (x === n - 1n) { comp = false; break; } } if (comp) return false; }
  return true;
}
function rho(n) { // Pollard-Brent; returns a nontrivial factor or null
  if (n % 2n === 0n) return 2n;
  for (let c = 1n; c < 40n; c++) {
    let x = 2n, y = 2n, d = 1n, steps = 0; const f = (v) => (v * v + c) % n;
    while (d === 1n && steps < 400000) { x = f(x); y = f(f(y)); d = gcdBI(x > y ? x - y : y - x, n); steps++; }
    if (d !== 1n && d !== n) return d;
  }
  return null;
}
function factorBig(n) { // Map prime -> exponent, plus `rest` of unfactored cofactor
  const f = new Map(); const add = (p, k = 1) => f.set(p, (f.get(p) || 0) + k); let rest = 1n;
  for (const p of [2n, 3n, 5n]) while (n % p === 0n) { add(p); n /= p; }
  for (let p = 7n, inc = [4n, 2n, 4n, 2n, 4n, 6n, 2n, 6n], i = 0; p < 100000n && p * p <= n; p += inc[i++ % 8]) while (n % p === 0n) { add(p); n /= p; }
  const stack = n > 1n ? [n] : [];
  while (stack.length) { const m = stack.pop(); if (m === 1n) continue; if (isPrimeBig(m)) { add(m); continue; } const d = rho(m); if (!d) { rest *= m; continue; } stack.push(d, m / d); }
  return { f, rest };
}
const pow = (p, k) => (k === 1 ? `${p}` : `${p}^${k}`);
T.push({
  id: 'prime-factorizer-primality', cat: MS, title: 'Prime Factorization and Primality Test (Big Integers)',
  desc: 'Test whether numbers are prime and factor them into primes in exponent form, with divisor count, divisor sum and Euler totient.',
  inputs: 1, labels: ['Whole numbers, one per line (up to about 30 digits)'], sample: '360\n9999999967\n600851475143\n1000000007\n170141183460469231731687303715884105727',
  run: ([src]) => {
    const out = [];
    for (const l of lines(src).slice(0, 30)) {
      if (!/^\d+$/.test(l)) { out.push(`${l}: not a whole number`); continue; }
      if (l.length > 40) { out.push(`${l.slice(0, 12)}...: more than 40 digits, too large`); continue; }
      const n = BigInt(l);
      if (n < 2n) { out.push(`${l}: neither prime nor composite`); continue; }
      const { f, rest } = factorBig(n); const ps = [...f.keys()].sort((a, b) => (a < b ? -1 : 1));
      if (f.size === 1 && f.get(ps[0]) === 1 && rest === 1n) { out.push(`${l} is prime${n > 3317044064679887385961981n ? ' (probable prime: 12 Miller-Rabin bases, not a proof above 3.3e24)' : ''}`); continue; }
      let line = `${l} = ${ps.map((p) => pow(p, f.get(p))).join(' x ')}${rest > 1n ? ` x [unfactored composite ${rest}]` : ''}`;
      if (rest === 1n) { let nd = 1n, sd = 1n, ph = 1n; for (const p of ps) { const k = BigInt(f.get(p)); nd *= k + 1n; sd *= (p ** (k + 1n) - 1n) / (p - 1n); ph *= p ** (k - 1n) * (p - 1n); } line += `\n    divisors: ${nd}, sum of divisors: ${sd}, Euler totient: ${ph}`; } else line += '\n    (stopped after the time budget; the cofactor is composite but its factors were not found)';
      out.push(line);
    }
    need(out.length, 'Enter at least one number'); return out.join('\n');
  },
});
T.push({
  id: 'gcd-lcm-euclid-steps', cat: MS, title: 'GCD and LCM Calculator with Euclidean Algorithm Steps',
  desc: 'Greatest common divisor and least common multiple of two or more integers, with each division step of the Euclidean algorithm.',
  inputs: 1, labels: ['Integers separated by spaces, commas or new lines'], sample: '1071 462 84',
  run: ([src]) => {
    const xs = src.split(/[\s,;]+/).filter(Boolean); need(xs.length >= 2, 'Enter at least two integers'); need(xs.length <= 30, 'At most 30 integers');
    const ns = xs.map((x) => { need(/^-?\d{1,60}$/.test(x), `"${x}" is not an integer`); return BigInt(x); }); need(ns.every((n) => n !== 0n), 'Zero is not allowed (gcd(0, n) = n is trivial, lcm(0, n) = 0)');
    const out = []; let g = bigAbs(ns[0]), l = bigAbs(ns[0]);
    for (let i = 1; i < ns.length; i++) {
      const b = bigAbs(ns[i]); out.push(`gcd(${g}, ${b}):`); let x = g > b ? g : b, y = g > b ? b : g;
      while (y) { out.push(`  ${x} = ${x / y} x ${y} + ${x % y}`); [x, y] = [y, x % y]; }
      out.push(`  gcd = ${x}`); l = l / gcdBI(l, b) * b; g = x;
    }
    return `GCD = ${g}\nLCM = ${l}\n\nEuclidean algorithm (a = q x b + r until r = 0), folded over the list:\n${out.join('\n')}\n\nLCM computed as lcm(a, b) = a / gcd(a, b) x b step by step. Signs are ignored.`;
  },
});

// ---------- significant figures ----------
function parseDec(s) { // -> {neg, digits:'123', exp10 (position of decimal point: value = 0.digits x 10^pt)}, sig count, flags
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s.trim()); need(m && (m[2] || m[3]), `"${s}" is not a number`);
  const ip = m[2] || '', fp = m[3] || '', ex = parseInt(m[4] || '0', 10), hasPoint = s.includes('.'), sci = /e/i.test(s);
  let digits = ip + fp, pt = ip.length + ex; const lead = digits.match(/^0*/)[0].length; digits = digits.slice(lead); pt -= lead;
  if (!digits.replace(/0/g, '')) return { neg: m[1] === '-', zero: true, digits: '', pt: 0, sig: hasPoint ? Math.max(1, fp.length) : 1, ambiguous: false };
  let sig = digits.length, amb = false;
  if (!hasPoint && !sci) { const tz = digits.match(/0*$/)[0].length; if (tz) { sig -= tz; amb = true; } }
  return { neg: m[1] === '-', digits, pt, sig, ambiguous: amb, zero: false };
}
function roundSig(d, n, mode) { // d from parseDec; returns {digits, pt}
  if (d.digits.length <= n) return { digits: d.digits.padEnd(n, '0'), pt: d.pt };
  const keep = d.digits.slice(0, n), nxt = d.digits.slice(n); let up;
  const first = nxt.charCodeAt(0) - 48, tail = /[1-9]/.test(nxt.slice(1));
  if (first > 5 || (first === 5 && tail)) up = true; else if (first < 5) up = false; else up = mode === 'half up' ? true : (parseInt(keep[n - 1], 10) % 2 === 1);
  if (!up) return { digits: keep, pt: d.pt };
  const inc = (BigInt(keep) + 1n).toString(); if (inc.length > n) return { digits: inc.slice(0, n), pt: d.pt + 1 }; return { digits: inc.padStart(n, '0'), pt: d.pt };
}
const decFixed = (neg, digits, pt) => { let s; if (pt <= 0) s = '0.' + '0'.repeat(-pt) + digits; else if (pt >= digits.length) s = digits + '0'.repeat(pt - digits.length); else s = digits.slice(0, pt) + '.' + digits.slice(pt); return (neg ? '-' : '') + s; };
const decSci = (neg, digits, pt) => `${neg ? '-' : ''}${digits[0]}${digits.length > 1 ? '.' + digits.slice(1) : ''} x 10^${pt - 1}`;
T.push({
  id: 'significant-figures-counter-rounder', cat: MS, title: 'Significant Figures Counter and Rounder',
  desc: 'Count the significant figures in numbers and round them to a chosen number of figures, shown in plain and scientific notation.',
  inputs: 1, labels: ['Numbers, one per line (0.00450, 1200, 1.20e3, 12.30)'], sample: '0.004500\n1200\n1200.\n1.20e3\n12.345\n0.000999',
  opts: [{ id: 'n', label: 'Round to this many significant figures (blank = only count)', type: 'text', def: '3' }, { id: 'mode', label: 'Tie rule when the dropped part is exactly half', type: 'select', choices: ['half up', 'half even'], def: 'half up' }],
  run: ([src], o) => {
    const n = o.n === '' ? null : Math.round(numOpt(o.n, 'Figures', 1, 40)); const out = [];
    for (const l of lines(src).slice(0, 100)) {
      try {
        const d = parseDec(l); let t = `${l}: ${d.sig} significant figure${d.sig === 1 ? '' : 's'}${d.ambiguous ? ' (trailing zeros of a number without a decimal point are treated as not significant; write 1.20e3 or 1200. to show them)' : ''}`;
        if (n && !d.zero) { const r = roundSig(d, n, o.mode); t += `\n    rounded to ${n}: ${decFixed(d.neg, r.digits, r.pt)}   =   ${decSci(d.neg, r.digits, r.pt)}`; } else if (n) t += `\n    rounded to ${n}: 0${n > 1 ? '.' + '0'.repeat(n - 1) : ''}`;
        out.push(t);
      } catch (e) { out.push(`${l}: ${e.message}`); }
    }
    need(out.length, 'Enter at least one number'); return out.join('\n') + '\n\nDecimal-string arithmetic, so rounding is exact for the digits you typed (no binary floating point). Rule used: all non-zero digits, zeros between them and trailing zeros after a decimal point are significant; leading zeros are not.';
  },
});

// ---------- regression ----------
function lsq(X, y) { // X rows of features; least squares via modified Gram-Schmidt QR
  const m = X.length, n = X[0].length, Q = X.map((r) => [...r]), Rm = Array.from({ length: n }, () => Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    for (let k = 0; k < j; k++) { let d = 0; for (let i = 0; i < m; i++) d += Q[i][k] * Q[i][j]; Rm[k][j] = d; for (let i = 0; i < m; i++) Q[i][j] -= d * Q[i][k]; }
    let nr = 0; for (let i = 0; i < m; i++) nr += Q[i][j] ** 2; nr = Math.sqrt(nr); need(nr > 1e-12, 'The data does not determine this model (too few distinct x values or collinear columns)'); Rm[j][j] = nr; for (let i = 0; i < m; i++) Q[i][j] /= nr;
  }
  const qty = Array(n).fill(0); for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) qty[j] += Q[i][j] * y[i];
  const b = Array(n).fill(0); for (let j = n - 1; j >= 0; j--) { let s = qty[j]; for (let k = j + 1; k < n; k++) s -= Rm[j][k] * b[k]; b[j] = s / Rm[j][j]; } return b;
}
T.push({
  id: 'regression-curve-fit', cat: MS, title: 'Regression Calculator: Linear, Polynomial, Exponential, Power and Log Fits',
  desc: 'Fit a model to x, y data and get the equation, R squared, residuals and a plot of the curve over your points.',
  inputs: 1, labels: ['Data: one "x y" pair per line (space, comma or tab)'], sample: '1 2.9\n2 5.1\n3 7.2\n4 8.8\n5 11.1\n6 13.2',
  opts: [{ id: 'model', label: 'Model', type: 'select', choices: ['linear', 'polynomial', 'exponential', 'power', 'logarithmic'], def: 'linear' }, { id: 'deg', label: 'Polynomial degree (2-6)', type: 'number', def: 2 }],
  run: ([src], o) => {
    const pts = lines(src).map((l) => l.split(/[\s,;]+/).map(Number)).filter((p) => p.length >= 2); need(pts.every((p) => p.slice(0, 2).every(Number.isFinite)), 'Every line needs two numbers'); need(pts.length >= 3, 'At least 3 points');
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); const m = o.model; let pred, eq, k;
    if (m === 'linear' || m === 'polynomial') { const dg = m === 'linear' ? 1 : Math.round(numOpt(o.deg, 'Degree', 2, 6)); need(pts.length > dg, `Need more than ${dg} points for degree ${dg}`); const mu = xs.reduce((a, b) => a + b, 0) / xs.length, sd = Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length) || 1; const zs = xs.map((x) => (x - mu) / sd); const b = lsq(zs.map((z) => Array.from({ length: dg + 1 }, (_, i) => z ** i)), ys);
      // convert to raw x by expanding (z = (x - mu)/sd)
      let c = Array(dg + 1).fill(0); for (let i = 0; i <= dg; i++) { let term = [1]; for (let j = 0; j < i; j++) term = pMul(term, [-mu / sd, 1 / sd]); term.forEach((t, j) => { c[j] += b[i] * t; }); }
      pred = (x) => c.reduce((a, cc, i) => a + cc * x ** i, 0); eq = `y = ${polyStr(c, 'x')}`; k = dg + 1; }
    else if (m === 'exponential') { need(ys.every((y) => y > 0), 'Exponential fit needs all y > 0'); const b = lsq(xs.map((x) => [1, x]), ys.map(Math.log)); pred = (x) => Math.exp(b[0] + b[1] * x); eq = `y = ${fmt(Math.exp(b[0]), 8)} * e^(${fmt(b[1], 8)} x)`; k = 2; }
    else if (m === 'power') { need(xs.every((x) => x > 0) && ys.every((y) => y > 0), 'Power fit needs all x > 0 and y > 0'); const b = lsq(xs.map((x) => [1, Math.log(x)]), ys.map(Math.log)); pred = (x) => Math.exp(b[0]) * x ** b[1]; eq = `y = ${fmt(Math.exp(b[0]), 8)} * x^${fmt(b[1], 8)}`; k = 2; }
    else { need(xs.every((x) => x > 0), 'Logarithmic fit needs all x > 0'); const b = lsq(xs.map((x) => [1, Math.log(x)]), ys); pred = (x) => b[0] + b[1] * Math.log(x); eq = `y = ${fmt(b[0], 8)} + ${fmt(b[1], 8)} * ln(x)`; k = 2; }
    const ym = ys.reduce((a, b) => a + b, 0) / ys.length, sst = ys.reduce((a, y) => a + (y - ym) ** 2, 0), sse = pts.reduce((a, p) => a + (p[1] - pred(p[0])) ** 2, 0), r2 = sst ? 1 - sse / sst : NaN;
    const n = pts.length, adj = n > k ? 1 - (1 - r2) * (n - 1) / (n - k) : NaN, rmse = Math.sqrt(sse / n);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), pad = (x1 - x0 || 1) * 0.08, curve = Array.from({ length: 301 }, (_, i) => { const x = x0 - pad + (x1 - x0 + 2 * pad) * i / 300; return [x, pred(x)]; });
    const [yl, yh] = autoRange(ys.concat(curve.map((p) => p[1]))); const svg = plotSvgDoc({ series: [{ name: eq, pts: curve }], xmin: x0 - pad, xmax: x1 + pad, ymin: Math.min(yl, ...ys), ymax: Math.max(yh, ...ys), marks: pts.map((p) => [p[0], p[1], '#000']), title: `Fit ${eq} over ${n} data points` });
    const txt = `Model: ${m}\n${eq}\nR squared = ${fmt(r2, 8)}   adjusted R squared = ${fmt(adj, 8)}   RMSE = ${fmt(rmse, 8)}   n = ${n}\n\n x          y          fitted     residual\n` + pts.map((p) => [fmt(p[0], 6), fmt(p[1], 6), fmt(pred(p[0]), 6), fmt(p[1] - pred(p[0]), 4)].map((s) => s.padEnd(10)).join(' ')).join('\n') + (m === 'exponential' || m === 'power' ? '\n\nExponential and power models are fitted by least squares on the logarithms (the usual spreadsheet method); R squared is computed on the original y values.' : '') + '\nCorrelation is not causation; a high R squared does not prove the model is right.';
    return { html: doc('Regression', svg + '<pre>' + esc(txt) + '</pre>') };
  },
});

// ---------- distributions ----------
function erfcx(x) { // erfc with ~1e-13 absolute accuracy
  const ax = Math.abs(x); let r;
  if (ax < 2.5) { let sum = ax, term = ax; for (let n = 1; n < 300; n++) { term *= -ax * ax / n; const d = term / (2 * n + 1); sum += d; if (Math.abs(d) < 1e-18) break; } r = 1 - 2 / Math.sqrt(Math.PI) * sum; } else { let t = ax; for (let k = 80; k >= 1; k--) t = ax + (k / 2) / t; r = Math.exp(-ax * ax) / (Math.sqrt(Math.PI) * t); }
  return x < 0 ? 2 - r : r;
}
const normCdf = (z) => 0.5 * erfcx(-z / Math.SQRT2);
const logFactTab = (n) => { const t = [0]; for (let i = 1; i <= n; i++) t.push(t[i - 1] + Math.log(i)); return t; };
T.push({
  id: 'probability-distribution-calculator', cat: MS, title: 'Probability Distribution Calculator and Plot: Normal, Binomial, Poisson',
  desc: 'Pick a normal, binomial or Poisson distribution, set its parameters and an interval, and get the probability with a shaded plot.',
  inputs: 0, sample: '',
  opts: [{ id: 'dist', label: 'Distribution', type: 'select', choices: ['normal', 'binomial', 'poisson'], def: 'normal' }, { id: 'p1', label: 'Normal: mean | Binomial: trials n | Poisson: rate lambda', type: 'number', def: 100 }, { id: 'p2', label: 'Normal: standard deviation | Binomial: probability p | Poisson: unused', type: 'number', def: 15 }, { id: 'lo', label: 'From (blank = minus infinity; discrete values are inclusive)', type: 'text', def: '85' }, { id: 'hi', label: 'To (blank = plus infinity)', type: 'text', def: '115' }],
  run: (_, o) => {
    const lo = o.lo === '' ? -Infinity : numOpt(o.lo, 'From'), hi = o.hi === '' ? Infinity : numOpt(o.hi, 'To'); need(lo <= hi, '"From" must not exceed "To"');
    const p1 = numOpt(o.p1, 'Parameter 1'), p2 = numOpt(o.p2, 'Parameter 2'); let prob, mean, varr, name, svg;
    if (o.dist === 'normal') {
      need(p2 > 0, 'Standard deviation must be positive'); name = `Normal(mean ${p1}, sd ${p2})`; prob = normCdf((hi - p1) / p2) - normCdf((lo - p1) / p2); mean = p1; varr = p2 * p2;
      const x0 = p1 - 4 * p2, x1 = p1 + 4 * p2, pdf = (x) => Math.exp(-0.5 * ((x - p1) / p2) ** 2) / (p2 * Math.sqrt(2 * Math.PI)), pts = Array.from({ length: 401 }, (_, i) => { const x = x0 + (x1 - x0) * i / 400; return [x, pdf(x)]; }), a = Math.max(lo, x0), b = Math.min(hi, x1);
      const sh = a < b ? [[a, 0], ...pts.filter((p) => p[0] >= a && p[0] <= b), [b, 0]] : undefined; svg = plotSvgDoc({ series: [{ name, pts }], xmin: x0, xmax: x1, ymin: 0, ymax: pdf(p1) * 1.1, shade: sh, title: `${name}, shaded probability ${fmt(prob, 6)}` });
    } else {
      let pmf, kmax; if (o.dist === 'binomial') { const n = Math.round(p1); need(n >= 1 && n <= 100000 && Number.isFinite(n), 'Trials must be 1 to 100000'); need(p2 >= 0 && p2 <= 1, 'p must be between 0 and 1'); const lf = logFactTab(n); pmf = (k) => (k < 0 || k > n ? 0 : p2 === 0 ? (k === 0 ? 1 : 0) : p2 === 1 ? (k === n ? 1 : 0) : Math.exp(lf[n] - lf[k] - lf[n - k] + k * Math.log(p2) + (n - k) * Math.log(1 - p2))); kmax = n; mean = n * p2; varr = n * p2 * (1 - p2); name = `Binomial(n ${n}, p ${p2})`; } else { need(p1 > 0 && p1 <= 5000, 'Rate lambda must be in (0, 5000]'); kmax = Math.ceil(p1 + 12 * Math.sqrt(p1) + 20); const lf = logFactTab(kmax); pmf = (k) => (k < 0 ? 0 : Math.exp(k * Math.log(p1) - p1 - lf[k])); mean = p1; varr = p1; name = `Poisson(lambda ${p1})`; }
      const a = Math.max(0, Math.ceil(lo)), b = Math.min(kmax, Math.floor(hi)); prob = 0; for (let k = a; k <= b; k++) prob += pmf(k);
      const sd = Math.sqrt(varr), v0 = Math.max(0, Math.floor(mean - 4 * sd - 1)), v1 = Math.min(kmax, Math.ceil(mean + 4 * sd + 1)), W = 640, H = 340, L = 44, bw = (W - L - 12) / (v1 - v0 + 1); let top = 0; for (let k = v0; k <= v1; k++) top = Math.max(top, pmf(k));
      let g = ''; for (let k = v0; k <= v1; k++) { const h = pmf(k) / (top * 1.1) * (H - 50); g += `<rect x="${L + (k - v0) * bw}" y="${H - 28 - h}" width="${Math.max(1, bw - 1)}" height="${h}" fill="${k >= a && k <= b ? '#d62728' : '#1f77b4'}"/>`; if (bw > 22) g += `<text x="${L + (k - v0) * bw + bw / 2}" y="${H - 14}" font-size="10" text-anchor="middle" fill="#333">${k}</text>`; }
      g += `<text x="${L}" y="${H - 2}" font-size="11" fill="#333">k from ${v0} to ${v1}; red bars are inside the interval; tallest bar ${fmt(top, 4)}</text>`; svg = svgWrap(W, H, g, `${name} probability mass, interval probability ${fmt(prob, 6)}`);
    }
    const lab = `${Number.isFinite(lo) ? lo : '-inf'} <= X <= ${Number.isFinite(hi) ? hi : 'inf'}`;
    return { html: doc('Distribution', svg + `<pre>${esc(`${name}\nP(${lab}) = ${fmt(prob, 10)}   (${fmt(prob * 100, 8)} %)\nmean = ${fmt(mean, 10)}   variance = ${fmt(varr, 10)}   standard deviation = ${fmt(Math.sqrt(varr), 10)}\nNormal CDF via a series/continued-fraction erfc (about 1e-13 absolute accuracy); discrete pmfs via log-factorials.`)}</pre>`) };
  },
});

// ---------- chemistry data: CIAAW abridged standard atomic weights 2024 (https://www.ciaaw.org/abridged-atomic-weights.htm), fetched 2026-10-23 ----------
// [symbol, name, weight, uncertainty]; weight '' = no standard atomic weight assigned (no stable isotopes / radioactive)
const EL = [["H","hydrogen","1.0080","0.0002"],["He","helium","4.0026","0.0001"],["Li","lithium","6.94","0.06"],["Be","beryllium","9.0122","0.0001"],["B","boron","10.81","0.02"],["C","carbon","12.011","0.002"],["N","nitrogen","14.007","0.001"],["O","oxygen","15.999","0.001"],["F","fluorine","18.998","0.001"],["Ne","neon","20.180","0.001"],["Na","sodium","22.990","0.001"],["Mg","magnesium","24.305","0.002"],["Al","aluminium","26.982","0.001"],["Si","silicon","28.085","0.001"],["P","phosphorus","30.974","0.001"],["S","sulfur","32.06","0.02"],["Cl","chlorine","35.45","0.01"],["Ar","argon","39.95","0.16"],["K","potassium","39.098","0.001"],["Ca","calcium","40.078","0.004"],["Sc","scandium","44.956","0.001"],["Ti","titanium","47.867","0.001"],["V","vanadium","50.942","0.001"],["Cr","chromium","51.996","0.001"],["Mn","manganese","54.938","0.001"],["Fe","iron","55.845","0.002"],["Co","cobalt","58.933","0.001"],["Ni","nickel","58.693","0.001"],["Cu","copper","63.546","0.003"],["Zn","zinc","65.38","0.02"],["Ga","gallium","69.723","0.001"],["Ge","germanium","72.630","0.008"],["As","arsenic","74.922","0.001"],["Se","selenium","78.971","0.008"],["Br","bromine","79.904","0.003"],["Kr","krypton","83.798","0.002"],["Rb","rubidium","85.468","0.001"],["Sr","strontium","87.62","0.01"],["Y","yttrium","88.906","0.001"],["Zr","zirconium","91.222","0.003"],["Nb","niobium","92.906","0.001"],["Mo","molybdenum","95.95","0.01"],["Tc","technetium","",""],["Ru","ruthenium","101.07","0.02"],["Rh","rhodium","102.91","0.01"],["Pd","palladium","106.42","0.01"],["Ag","silver","107.87","0.01"],["Cd","cadmium","112.41","0.01"],["In","indium","114.82","0.01"],["Sn","tin","118.71","0.01"],["Sb","antimony","121.76","0.01"],["Te","tellurium","127.60","0.03"],["I","iodine","126.90","0.01"],["Xe","xenon","131.29","0.01"],["Cs","caesium","132.91","0.01"],["Ba","barium","137.33","0.01"],["La","lanthanum","138.91","0.01"],["Ce","cerium","140.12","0.01"],["Pr","praseodymium","140.91","0.01"],["Nd","neodymium","144.24","0.01"],["Pm","promethium","",""],["Sm","samarium","150.36","0.02"],["Eu","europium","151.96","0.01"],["Gd","gadolinium","157.25","0.01"],["Tb","terbium","158.93","0.01"],["Dy","dysprosium","162.50","0.01"],["Ho","holmium","164.93","0.01"],["Er","erbium","167.26","0.01"],["Tm","thulium","168.93","0.01"],["Yb","ytterbium","173.05","0.02"],["Lu","lutetium","174.97","0.01"],["Hf","hafnium","178.49","0.01"],["Ta","tantalum","180.95","0.01"],["W","tungsten","183.84","0.01"],["Re","rhenium","186.21","0.01"],["Os","osmium","190.23","0.03"],["Ir","iridium","192.22","0.01"],["Pt","platinum","195.08","0.02"],["Au","gold","196.97","0.01"],["Hg","mercury","200.59","0.01"],["Tl","thallium","204.38","0.01"],["Pb","lead","207.2","1.1"],["Bi","bismuth","208.98","0.01"],["Po","polonium","",""],["At","astatine","",""],["Rn","radon","",""],["Fr","francium","",""],["Ra","radium","",""],["Ac","actinium","",""],["Th","thorium","232.04","0.01"],["Pa","protactinium","231.04","0.01"],["U","uranium","238.03","0.01"],["Np","neptunium","",""],["Pu","plutonium","",""],["Am","americium","",""],["Cm","curium","",""],["Bk","berkelium","",""],["Cf","californium","",""],["Es","einsteinium","",""],["Fm","fermium","",""],["Md","mendelevium","",""],["No","nobelium","",""],["Lr","lawrencium","",""],["Rf","rutherfordium","",""],["Db","dubnium","",""],["Sg","seaborgium","",""],["Bh","bohrium","",""],["Hs","hassium","",""],["Mt","meitnerium","",""],["Ds","darmstadtium","",""],["Rg","roentgenium","",""],["Cn","copernicium","",""],["Nh","nihonium","",""],["Fl","flerovium","",""],["Mc","moscovium","",""],["Lv","livermorium","",""],["Ts","tennessine","",""],["Og","oganesson","",""]];
const EL_SRC = 'Atomic weights: CIAAW (IUPAC) Abridged Standard Atomic Weights 2024, https://www.ciaaw.org/abridged-atomic-weights.htm';
const EL_BY_SYM = new Map(EL.map((e, i) => [e[0], i + 1]));

function parseFormula(raw) {
  const s = String(raw).replace(/\s+/g, '').replace(/\((aq|s|l|g)\)$/, '').replace(/[•∙*]/g, '·').replace(/\.(?=\d*[A-Z(])/g, '·'); need(s, 'Empty formula');
  const total = new Map();
  for (const part of s.split('·')) {
    need(part, 'Empty hydrate part'); let i = 0; const lead = /^\d+/.exec(part); const mult = lead ? parseInt(lead[0], 10) : 1; i = lead ? lead[0].length : 0;
    const group = (close) => {
      const cnt = new Map(); const addAll = (m, k) => { for (const [e, c] of m) cnt.set(e, (cnt.get(e) || 0) + c * k); };
      const num = () => { const m = /^\d+/.exec(part.slice(i)); if (!m) return 1; i += m[0].length; need(m[0].length < 7, 'Subscript too large'); return parseInt(m[0], 10); };
      while (i < part.length) {
        const ch = part[i];
        if (/[A-Z]/.test(ch)) { let sym = ch; if (/[a-z]/.test(part[i + 1] || '') && EL_BY_SYM.has(ch + part[i + 1])) sym = ch + part[i + 1]; need(EL_BY_SYM.has(sym), `Unknown element "${sym}" (symbols are case sensitive: Co is cobalt, CO is carbon monoxide)`); i += sym.length; const k = num(); cnt.set(sym, (cnt.get(sym) || 0) + k); }
        else if ('([{'.includes(ch)) { i++; const inner = group(')]}'); need(part[i] && ')]}'.includes(part[i]), 'Missing closing bracket'); i++; addAll(inner, num()); }
        else if (')]}'.includes(ch)) { need(close, 'Unmatched closing bracket'); return cnt; }
        else throw new Error(`Unexpected "${ch}" in formula (charges and radicals are not supported)`);
      }
      need(!close, 'Missing closing bracket'); return cnt;
    };
    const g = group(null); for (const [e, c] of g) total.set(e, (total.get(e) || 0) + c * mult);
  }
  return total;
}
T.push({
  id: 'molar-mass-calculator-formula', cat: MS, title: 'Molar Mass Calculator from a Chemical Formula (IUPAC Atomic Weights)',
  desc: 'Molar mass in g/mol from a formula such as Ca(OH)2 or CuSO4.5H2O, with each element contribution, percent by mass and IUPAC uncertainty.',
  inputs: 1, labels: ['Formulas, one per line (Ca(OH)2, CuSO4·5H2O, C6H12O6)'], sample: 'Ca(OH)2\nCuSO4·5H2O\nC6H12O6\nFe2(SO4)3',
  run: ([src]) => {
    const out = [];
    for (const l of lines(src).slice(0, 40)) {
      try {
        const c = parseFormula(l); let tot = 0, unc = 0; const rows = [];
        for (const [e, k] of c) { const [, name, w, u] = EL[EL_BY_SYM.get(e) - 1]; need(w, `${name} (${e}) has no standard atomic weight (no stable isotopes), so its molar mass cannot be given here`); const m = parseFloat(w) * k; tot += m; unc += parseFloat(u || '0') * k; rows.push([e, name, k, w, m]); }
        out.push(`${l}\n` + rows.map(([e, n, k, w, m]) => `  ${e.padEnd(2)} ${n.padEnd(13)} x ${String(k).padEnd(4)} ${w.padStart(9)} = ${m.toFixed(4).padStart(10)}   ${(m / tot * 100).toFixed(2).padStart(6)} %`).join('\n') + `\n  Molar mass = ${tot.toFixed(3)} g/mol  (sum of the listed uncertainties: +/- ${unc.toFixed(3)})`);
      } catch (e) { out.push(`${l}\n  ${e.message}`); }
    }
    need(out.length, 'Enter a formula'); return out.join('\n\n') + `\n\n${EL_SRC}\nWeights are the abridged conventional values, rounded as published (some to 4-5 figures), so results can differ in the last digits from tools using longer tables. The uncertainty is the plain sum of the published +/- values, a worst-case bound.`;
  },
});

// exact rational nullspace for the equation balancer
const fr = (n, d = 1n) => { if (d < 0n) { n = -n; d = -d; } const g = gcdBI(n, d) || 1n; return [n / g, d / g]; };
const fAdd = (a, b) => fr(a[0] * b[1] + b[0] * a[1], a[1] * b[1]), fMul = (a, b) => fr(a[0] * b[0], a[1] * b[1]), fDiv = (a, b) => fr(a[0] * b[1], a[1] * b[0]);
function nullspace(M) { // M rows x cols of BigInt -> basis of integer vectors
  const R = M.map((r) => r.map((x) => fr(x))), rows = R.length, cols = R[0].length, piv = []; let r0 = 0;
  for (let c = 0; c < cols && r0 < rows; c++) {
    let p = -1; for (let i = r0; i < rows; i++) if (R[i][c][0] !== 0n) { p = i; break; } if (p < 0) continue;
    [R[r0], R[p]] = [R[p], R[r0]]; const inv = R[r0][c]; R[r0] = R[r0].map((x) => fDiv(x, inv));
    for (let i = 0; i < rows; i++) if (i !== r0 && R[i][c][0] !== 0n) { const f = R[i][c]; R[i] = R[i].map((x, j) => fAdd(x, fMul([-f[0], f[1]], R[r0][j]))); }
    piv.push(c); r0++;
  }
  const free = []; for (let c = 0; c < cols; c++) if (!piv.includes(c)) free.push(c);
  return free.map((fc) => { const v = Array(cols).fill(null).map(() => fr(0n)); v[fc] = fr(1n); piv.forEach((pc, i) => { v[pc] = [-R[i][fc][0], R[i][fc][1]]; }); let L = 1n; for (const x of v) L = L / gcdBI(L, x[1]) * x[1]; const iv = v.map((x) => x[0] * (L / x[1])); let g = 0n; for (const x of iv) g = gcdBI(g, x); return iv.map((x) => x / (g || 1n)); });
}
T.push({
  id: 'chemical-equation-balancer', cat: MS, title: 'Chemical Equation Balancer (Smallest Whole-Number Coefficients)',
  desc: 'Balance a reaction such as Fe + O2 = Fe2O3 by exact linear algebra and see the atom count on both sides.',
  inputs: 1, labels: ['Unbalanced equation(s), one per line, with = or ->'], sample: 'Fe + O2 = Fe2O3\nC3H8 + O2 -> CO2 + H2O\nKMnO4 + HCl = KCl + MnCl2 + H2O + Cl2\nCuSO4.5H2O = CuSO4 + H2O',
  run: ([src]) => {
    const out = [];
    for (const l of lines(src).slice(0, 20)) {
      try {
        const sides = l.split(/<?[-=]+>|=|→|⟶|⇌|⇒/).map((x) => x.trim()).filter(Boolean); need(sides.length === 2, 'Use exactly one = or -> between reactants and products');
        need(!/\^/.test(l), 'Ions and charges are not supported');
        const sp = sides.map((sd) => sd.split(/\s+\+\s+|\s*\+\s*(?=[A-Z0-9(])/).map((x) => x.trim().replace(/^\d+\s*(?=[A-Z(])/, '')).filter(Boolean));
        const all = [...sp[0], ...sp[1]]; need(all.length >= 2 && all.length <= 12, 'Between 2 and 12 species'); const comps = all.map(parseFormula);
        const els = [...new Set(comps.flatMap((c) => [...c.keys()]))]; for (const e of els) need(sp[0].some((_, i) => comps[i].has(e)) && sp[1].some((_, i) => comps[sp[0].length + i].has(e)), `${e} appears on one side only`);
        const M = els.map((e) => comps.map((c, j) => BigInt(c.get(e) || 0) * (j < sp[0].length ? 1n : -1n))); const ns = nullspace(M);
        need(ns.length > 0, 'This cannot be balanced: check the formulas');
        const okPos = (v) => v.every((x) => x > 0n) || v.every((x) => x < 0n); let v = null, note = '';
        if (ns.length === 1) { v = ns[0]; need(okPos(v), 'No balanced solution with all-positive coefficients: check that the reaction is chemically possible'); }
        else { // search a small positive integer combination
          let best = null; const rngs = ns.length === 2 ? [[-9, 9], [-9, 9]] : [[-4, 4], [-4, 4], [-4, 4]];
          const rec = (i, coef) => { if (i === ns.length) { const w = ns[0].map((_, j) => ns.reduce((a, b, k) => a + b[j] * BigInt(coef[k]), 0n)); if (w.every((x) => x > 0n)) { let g = 0n; for (const x of w) g = gcdBI(g, x); const ww = w.map((x) => x / g); const s = ww.reduce((a, b) => a + b, 0n); if (!best || s < best.s) best = { s, w: ww }; } return; } for (let c = rngs[i][0]; c <= rngs[i][1]; c++) rec(i + 1, [...coef, c]); };
          rec(0, []); need(best, 'Several independent reactions are mixed together and no all-positive combination was found'); v = best.w; note = `\n  Note: this equation mixes ${ns.length} independent reactions, so the balance is not unique. Smallest all-positive solution shown.`;
        }
        if (v[0] < 0n) v = v.map((x) => -x);
        const term = (names, off) => names.map((nm, i) => `${v[off + i] === 1n ? '' : v[off + i] + ' '}${nm}`).join(' + ');
        const chk = els.map((e) => { const a = sp[0].reduce((s, _, i) => s + BigInt(comps[i].get(e) || 0) * v[i], 0n), b = sp[1].reduce((s, _, i) => s + BigInt(comps[sp[0].length + i].get(e) || 0) * v[sp[0].length + i], 0n); return `${e}: ${a} = ${b}`; });
        out.push(`${term(sp[0], 0)} -> ${term(sp[1], sp[0].length)}\n  Atom check: ${chk.join('; ')}${note}`);
      } catch (e) { out.push(`${l}\n  ${e.message}`); }
    }
    need(out.length, 'Enter an equation'); return out.join('\n\n') + '\n\nBalancing is atom conservation only. Ions/charges and redox half-reaction methods are not handled, and the tool cannot tell whether a reaction actually happens.';
  },
});

// ---------- periodic table ----------
const ZPOS = (() => { const m = {};
  const put = (z, r, c) => { m[z] = [r, c]; }; put(1, 1, 1); put(2, 1, 18);
  for (let z = 3; z <= 4; z++) put(z, 2, z - 2); for (let z = 5; z <= 10; z++) put(z, 2, z + 8);
  for (let z = 11; z <= 12; z++) put(z, 3, z - 10); for (let z = 13; z <= 18; z++) put(z, 3, z);
  for (let z = 19; z <= 36; z++) put(z, 4, z - 18); for (let z = 37; z <= 54; z++) put(z, 5, z - 36);
  put(55, 6, 1); put(56, 6, 2); for (let z = 57; z <= 71; z++) put(z, 9, z - 54); for (let z = 72; z <= 86; z++) put(z, 6, z - 68);
  put(87, 7, 1); put(88, 7, 2); for (let z = 89; z <= 103; z++) put(z, 10, z - 86); for (let z = 104; z <= 118; z++) put(z, 7, z - 100);
  return m; })();
const blockOf = (z) => { const [r, c] = ZPOS[z]; if (r >= 9) return 'f'; if (z === 2 || c <= 2) return 's'; return c >= 13 ? 'p' : 'd'; };
T.push({
  id: 'periodic-table-explorer-weights', cat: MS, title: 'Periodic Table with IUPAC Atomic Weights, Blocks and Search',
  desc: 'See the table colored by block or atomic weight, search elements by symbol, name or number, and read their weight, period, group and block.',
  inputs: 1, labels: ['Elements to highlight: symbols, names or atomic numbers separated by commas (blank = none)'], sample: 'Fe, oxygen, 79',
  opts: [{ id: 'color', label: 'Color by', type: 'select', choices: ['block', 'atomic weight'], def: 'block' }],
  run: ([src], o) => {
    const q = src.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean), hit = new Set(), det = [];
    for (const t of q) { let z = 0; if (/^\d+$/.test(t)) z = parseInt(t, 10); else { const k = EL.findIndex((e) => e[0].toLowerCase() === t.toLowerCase() || e[1] === t.toLowerCase()); z = k + 1; } if (z >= 1 && z <= 118) hit.add(z); else det.push(`"${t}": no such element`); }
    const wts = EL.map((e) => parseFloat(e[2])).filter(Number.isFinite), wmax = Math.max(...wts), cell = {};
    const BC = { s: '#f4b6b6', p: '#f5df8c', d: '#a9d4f5', f: '#b9e3b0' };
    EL.forEach((e, i) => { const z = i + 1, [r, c] = ZPOS[z], w = parseFloat(e[2]); const bg = o.color === 'block' ? BC[blockOf(z)] : Number.isFinite(w) ? `hsl(${210 - 190 * w / wmax},70%,${88 - 28 * w / wmax}%)` : '#eee'; cell[r + ',' + c] = `<td title="${esc(`${e[1]}, Z ${z}${e[2] ? ', ' + e[2] : ''}`)}" style="background:${bg};color:#111;text-align:center;padding:2px;min-width:38px;${hit.has(z) ? 'outline:3px solid #000;outline-offset:-3px;font-weight:bold' : ''}"><div style="font-size:9px">${z}</div><div style="font-size:14px">${e[0]}</div><div style="font-size:9px">${e[2] || '-'}</div></td>`; if (hit.has(z)) { const [pr0, g] = ZPOS[z]; det.push(`${e[0]}  ${e[1]}  Z = ${z}  atomic weight = ${e[2] ? e[2] + ' +/- ' + e[3] : 'none assigned (no stable isotopes)'}  period ${pr0 >= 9 ? (pr0 === 9 ? 6 : 7) : pr0}  group ${pr0 >= 9 ? 'f-block row' : g}  block ${blockOf(z)}`); } });
    let t = '<table style="border-collapse:separate;border-spacing:2px"><caption style="text-align:left">Periodic table, standard 18-column layout (La-Lu and Ac-Lr in the f-block rows)</caption>';
    for (let r = 1; r <= 10; r++) { if (r === 8) { t += '<tr><td colspan="18" style="border:0;height:8px"></td></tr>'; continue; } t += '<tr>'; for (let c = 1; c <= 18; c++) { if (r >= 9 && c <= 2) { t += '<td style="border:0"></td>'; continue; } t += cell[r + ',' + c] || ((r === 6 || r === 7) && c === 3 ? '<td style="border:0;text-align:center">*</td>' : '<td style="border:0"></td>'); } t += '</tr>'; }
    t += '</table>';
    const leg = o.color === 'block' ? Object.entries(BC).map(([k, v]) => `<span style="background:${v};padding:1px 8px;margin-right:6px">${k}-block</span>`).join('') : 'Darker and redder = heavier. Grey = no standard atomic weight.';
    return { html: doc('Periodic table', `<div style="overflow:auto">${t}</div><p>${leg}</p><pre>${esc(det.join('\n') || 'Type elements above to highlight them.')}\n\n${EL_SRC}\nPeriod, group and block follow the common textbook layout: whether Lu/Lr or La/Ac belong in group 3 is still debated, so f-block rows are shown without a group number. Not included: electron configuration, electronegativity, categories (no source fetched).</pre>`) };
  },
});

// ---------- geometry ----------
const PI = Math.PI;
const ellipsePerimeter = (a, b) => { const n = 4000, h = PI / 2 / n; let s = 0; const f = (t) => Math.sqrt((a * Math.sin(t)) ** 2 + (b * Math.cos(t)) ** 2); for (let i = 0; i <= n; i++) s += f(i * h) * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2); return 4 * s * h / 3; };
const SHAPES = {
  'circle (r)': { p: ['radius r'], f: ([r]) => [['Area', PI * r * r, 'pi r^2'], ['Circumference', 2 * PI * r, '2 pi r'], ['Diameter', 2 * r, '2 r']] },
  'rectangle (w, h)': { p: ['width w', 'height h'], f: ([w, h]) => [['Area', w * h, 'w h'], ['Perimeter', 2 * (w + h), '2 (w + h)'], ['Diagonal', Math.hypot(w, h), 'sqrt(w^2 + h^2)']] },
  'triangle (sides a, b, c)': { p: ['side a', 'side b', 'side c'], f: ([a, b, c]) => { need(a + b > c && a + c > b && b + c > a, 'These sides do not form a triangle'); const s = (a + b + c) / 2, A = Math.sqrt(s * (s - a) * (s - b) * (s - c)); return [['Area', A, 'Heron: sqrt(s (s-a)(s-b)(s-c)), s = (a+b+c)/2'], ['Perimeter', a + b + c, 'a + b + c'], ['Inradius', A / s, 'Area / s'], ['Circumradius', a * b * c / (4 * A), 'abc / (4 Area)']]; } },
  'triangle (base b, height h)': { p: ['base b', 'height h'], f: ([b, h]) => [['Area', b * h / 2, 'b h / 2']] },
  'trapezoid (a, b, height h, legs c, d optional)': { p: ['parallel side a', 'parallel side b', 'height h', 'leg c (optional)', 'leg d (optional)'], opt: 2, f: ([a, b, h, c, d]) => { const r = [['Area', (a + b) * h / 2, '(a + b) h / 2'], ['Midline', (a + b) / 2, '(a + b) / 2']]; if (c != null && d != null) r.push(['Perimeter', a + b + c + d, 'a + b + c + d']); return r; } },
  'parallelogram (base b, height h, side s optional)': { p: ['base b', 'height h', 'slanted side s (optional)'], opt: 1, f: ([b, h, s]) => { const r = [['Area', b * h, 'b h']]; if (s != null) { need(s >= h, 'Side s cannot be shorter than the height'); r.push(['Perimeter', 2 * (b + s), '2 (b + s)'], ['Angle at base (degrees)', Math.asin(h / s) * 180 / PI, 'asin(h / s)']); } return r; } },
  'rhombus (diagonals p, q)': { p: ['diagonal p', 'diagonal q'], f: ([p, q]) => { const s = Math.hypot(p, q) / 2; return [['Area', p * q / 2, 'p q / 2'], ['Side', s, 'sqrt(p^2 + q^2) / 2'], ['Perimeter', 4 * s, '4 side']]; } },
  'regular polygon (sides n, side length s)': { p: ['number of sides n', 'side length s'], f: ([n, s]) => { need(Number.isInteger(n) && n >= 3 && n <= 1000, 'n must be a whole number from 3 to 1000'); return [['Area', n * s * s / (4 * Math.tan(PI / n)), 'n s^2 / (4 tan(pi / n))'], ['Perimeter', n * s, 'n s'], ['Apothem', s / (2 * Math.tan(PI / n)), 's / (2 tan(pi / n))'], ['Circumradius', s / (2 * Math.sin(PI / n)), 's / (2 sin(pi / n))'], ['Interior angle (degrees)', (n - 2) * 180 / n, '(n - 2) 180 / n']]; } },
  'ellipse (semi-axes a, b)': { p: ['semi-axis a', 'semi-axis b'], f: ([a, b]) => [['Area', PI * a * b, 'pi a b'], ['Perimeter', ellipsePerimeter(a, b), 'numeric integral of the arc length (Simpson, 4000 steps)'], ['Eccentricity', Math.sqrt(1 - (Math.min(a, b) / Math.max(a, b)) ** 2), 'sqrt(1 - (b/a)^2)']] },
  'circle sector (r, angle in degrees)': { p: ['radius r', 'angle (degrees)'], f: ([r, d]) => { need(d > 0 && d <= 360, 'Angle must be between 0 and 360'); const t = d * PI / 180; return [['Area', r * r * t / 2, 'r^2 theta / 2'], ['Arc length', r * t, 'r theta'], ['Chord', 2 * r * Math.sin(t / 2), '2 r sin(theta / 2)']]; } },
  'cube (edge a)': { p: ['edge a'], f: ([a]) => [['Volume', a ** 3, 'a^3'], ['Surface area', 6 * a * a, '6 a^2'], ['Space diagonal', a * Math.sqrt(3), 'a sqrt(3)']] },
  'cuboid (l, w, h)': { p: ['length l', 'width w', 'height h'], f: ([l, w, h]) => [['Volume', l * w * h, 'l w h'], ['Surface area', 2 * (l * w + l * h + w * h), '2 (lw + lh + wh)'], ['Space diagonal', Math.sqrt(l * l + w * w + h * h), 'sqrt(l^2 + w^2 + h^2)']] },
  'sphere (r)': { p: ['radius r'], f: ([r]) => [['Volume', 4 / 3 * PI * r ** 3, '4/3 pi r^3'], ['Surface area', 4 * PI * r * r, '4 pi r^2']] },
  'cylinder (r, h)': { p: ['radius r', 'height h'], f: ([r, h]) => [['Volume', PI * r * r * h, 'pi r^2 h'], ['Lateral area', 2 * PI * r * h, '2 pi r h'], ['Total surface area', 2 * PI * r * (r + h), '2 pi r (r + h)']] },
  'cone (r, h)': { p: ['radius r', 'height h'], f: ([r, h]) => { const s = Math.hypot(r, h); return [['Volume', PI * r * r * h / 3, 'pi r^2 h / 3'], ['Slant height', s, 'sqrt(r^2 + h^2)'], ['Lateral area', PI * r * s, 'pi r s'], ['Total surface area', PI * r * (r + s), 'pi r (r + s)']]; } },
  'square pyramid (base a, height h)': { p: ['base edge a', 'height h'], f: ([a, h]) => { const s = Math.sqrt(h * h + a * a / 4); return [['Volume', a * a * h / 3, 'a^2 h / 3'], ['Slant height', s, 'sqrt(h^2 + (a/2)^2)'], ['Total surface area', a * a + 2 * a * s, 'a^2 + 2 a s']]; } },
  'torus (major R, minor r)': { p: ['major radius R', 'minor radius r'], f: ([R, r]) => [['Volume', 2 * PI * PI * R * r * r, '2 pi^2 R r^2'], ['Surface area', 4 * PI * PI * R * r, '4 pi^2 R r']] },
};
T.push({
  id: 'geometry-shape-calculator', cat: MS, title: 'Geometry Calculator: Area, Perimeter, Volume and Surface of 16 Shapes',
  desc: 'Pick a shape, enter its dimensions and get area, perimeter, volume or surface area with the formula used for each result.',
  inputs: 0, sample: '',
  opts: [{ id: 'shape', label: 'Shape (the dimensions to enter are in brackets)', type: 'select', choices: Object.keys(SHAPES), def: 'circle (r)' }, { id: 'd1', label: 'Dimension 1', type: 'number', def: 5 }, { id: 'd2', label: 'Dimension 2 (if the shape needs it)', type: 'text', def: '' }, { id: 'd3', label: 'Dimension 3', type: 'text', def: '' }, { id: 'd4', label: 'Dimension 4 (optional leg)', type: 'text', def: '' }, { id: 'd5', label: 'Dimension 5 (optional leg)', type: 'text', def: '' }],
  run: (_, o) => {
    const sh = SHAPES[o.shape]; need(sh, 'Choose a shape'); const raw = [o.d1, o.d2, o.d3, o.d4, o.d5]; const vals = []; const must = sh.p.length - (sh.opt || 0);
    for (let i = 0; i < sh.p.length; i++) { const v = raw[i]; if ((v === '' || v == null) && i >= must) { vals.push(null); continue; } const x = numOpt(v, `Dimension ${i + 1} (${sh.p[i]})`); need(x > 0, `${sh.p[i]} must be positive`); vals.push(x); }
    const rows = sh.f(vals);
    return `${o.shape}\nInputs: ${sh.p.map((p, i) => (vals[i] == null ? null : `${p} = ${fmt(vals[i])}`)).filter(Boolean).join(', ')}\n\n` + rows.map(([n, v, f]) => `${n.padEnd(26)} ${fmt(v, 12).padStart(18)}   = ${f}`).join('\n') + `\n\nUnits: lengths in your unit u; areas in u^2; volumes in u^3. Angles in the lines labelled degrees. pi = ${PI}. No diagram is drawn.`;
  },
});

// ---------- triangle solver ----------
T.push({
  id: 'triangle-solver-sss-sas-asa-ssa', cat: MS, title: 'Triangle Solver: SSS, SAS, ASA, AAS and the Ambiguous SSA Case',
  desc: 'Enter any three known sides and angles and get the missing ones with area, perimeter, radii and a scaled drawing.',
  inputs: 1, labels: ['Known values, e.g. a=7 b=10 C=40 (sides a b c, angles A B C in degrees; A is opposite a)'], sample: 'a=7 b=10 A=30',
  run: ([src]) => {
    const kv = {}; for (const m of src.matchAll(/([abcABC])\s*[=:]?\s*(-?\d*\.?\d+(?:e[+-]?\d+)?)\s*(?:°|deg)?/g)) { need(!(m[1] in kv), `${m[1]} given twice`); kv[m[1]] = parseFloat(m[2]); }
    const S = ['a', 'b', 'c'].filter((k) => k in kv), A = ['A', 'B', 'C'].filter((k) => k in kv); need(S.length + A.length === 3, 'Enter exactly three known values (sides a, b, c and angles A, B, C)'); need(S.length >= 1, 'At least one side is needed: angles alone only fix the shape');
    for (const k of S) need(kv[k] > 0, `Side ${k} must be positive`); for (const k of A) need(kv[k] > 0 && kv[k] < 180, `Angle ${k} must be between 0 and 180 degrees`);
    const rad = (d) => d * PI / 180, deg = (r) => r * 180 / PI, clamp = (x) => Math.max(-1, Math.min(1, x)); const sols = [];
    const fromSides = (a, b, c) => { need(a + b > c && a + c > b && b + c > a, 'These sides do not form a triangle'); return { a, b, c, A: deg(Math.acos(clamp((b * b + c * c - a * a) / (2 * b * c)))), B: deg(Math.acos(clamp((a * a + c * c - b * b) / (2 * a * c)))), C: deg(Math.acos(clamp((a * a + b * b - c * c) / (2 * a * b)))) }; };
    let kind;
    if (S.length === 3) { kind = 'SSS'; sols.push(fromSides(kv.a, kv.b, kv.c)); }
    else if (A.length === 2) { kind = 'ASA / AAS'; const t = {}; const miss = ['A', 'B', 'C'].find((k) => !(k in kv)); need(kv[A[0]] + kv[A[1]] < 180, 'The two angles add up to 180 degrees or more'); const ang = { ...kv }; ang[miss] = 180 - kv[A[0]] - kv[A[1]]; const s0 = S[0], k = kv[s0] / Math.sin(rad(ang[s0.toUpperCase()])); for (const x of ['a', 'b', 'c']) t[x] = k * Math.sin(rad(ang[x.toUpperCase()])); sols.push({ ...t, A: ang.A, B: ang.B, C: ang.C }); }
    else {
      const [s1, s2] = S, an = A[0]; // two sides and one angle
      if (an.toLowerCase() !== s1 && an.toLowerCase() !== s2) { kind = 'SAS'; const third = ['a', 'b', 'c'].find((k) => !S.includes(k)); const t = Math.sqrt(kv[s1] ** 2 + kv[s2] ** 2 - 2 * kv[s1] * kv[s2] * Math.cos(rad(kv[an]))); const sd = { ...kv, [third]: t }; sols.push(fromSides(sd.a, sd.b, sd.c)); }
      else {
        kind = 'SSA'; const opp = an.toLowerCase(), other = opp === s1 ? s2 : s1, a0 = kv[opp], b0 = kv[other], sB = b0 * Math.sin(rad(kv[an])) / a0; // angle opposite `other`
        need(sB <= 1 + 1e-12, `No triangle: side ${opp} = ${a0} is too short to reach (needs at least ${fmt(b0 * Math.sin(rad(kv[an])))})`);
        const cands = Math.abs(sB - 1) < 1e-12 ? [90] : [deg(Math.asin(sB)), 180 - deg(Math.asin(sB))];
        for (const Bd of cands) { const Cd = 180 - kv[an] - Bd; if (Cd <= 1e-9) continue; const ang = { [an]: kv[an], [other.toUpperCase()]: Bd }; const mC = ['A', 'B', 'C'].find((k) => !(k in ang)); ang[mC] = Cd; const k = a0 / Math.sin(rad(kv[an])); const t = {}; for (const x of ['a', 'b', 'c']) t[x] = k * Math.sin(rad(ang[x.toUpperCase()])); sols.push({ ...t, A: ang.A, B: ang.B, C: ang.C }); }
        need(sols.length, 'No triangle with these values');
      }
    }
    const out = [`Case: ${kind}${sols.length > 1 ? ' (ambiguous: two different triangles fit)' : ''}`]; let svg = '';
    sols.forEach((t, i) => {
      const s = (t.a + t.b + t.c) / 2, area = 0.5 * t.b * t.c * Math.sin(rad(t.A)), R = t.a / (2 * Math.sin(rad(t.A))), r = area / s;
      out.push('', sols.length > 1 ? `Triangle ${i + 1}:` : 'Solution:', `  a = ${fmt(t.a, 10)}   b = ${fmt(t.b, 10)}   c = ${fmt(t.c, 10)}`, `  A = ${fmt(t.A, 10)}   B = ${fmt(t.B, 10)}   C = ${fmt(t.C, 10)}   (degrees; sum ${fmt(t.A + t.B + t.C, 10)})`, `  area = ${fmt(area, 10)}   perimeter = ${fmt(2 * s, 10)}   circumradius = ${fmt(R, 10)}   inradius = ${fmt(r, 10)}`);
      const Cx = t.b * Math.cos(rad(t.A)), Cy = t.b * Math.sin(rad(t.A)), xs = [0, t.c, Cx], mn = Math.min(...xs), mx = Math.max(...xs), sc = Math.min(240 / (mx - mn || 1), 170 / (Cy || 1)), P = (x, y) => [20 + (x - mn) * sc, 195 - y * sc], p0 = P(0, 0), p1 = P(t.c, 0), p2 = P(Cx, Cy);
      svg += svgWrap(280, 215, `<polygon points="${[p0, p1, p2].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="#cfe3f7" stroke="#1f77b4" stroke-width="2"/><text x="${p0[0] - 12}" y="${p0[1] + 4}" font-size="13" fill="#111">A</text><text x="${p1[0] + 4}" y="${p1[1] + 4}" font-size="13" fill="#111">B</text><text x="${p2[0]}" y="${p2[1] - 6}" font-size="13" fill="#111">C</text><text x="${(p0[0] + p1[0]) / 2}" y="${p0[1] + 16}" font-size="12" fill="#111">c = ${fmt(t.c, 4)}</text>`, `Triangle ${i + 1} drawn to scale with vertices A, B, C; sides a ${fmt(t.a, 4)}, b ${fmt(t.b, 4)}, c ${fmt(t.c, 4)}`);
    });
    return { html: doc('Triangle', svg + '<pre>' + esc(out.join('\n') + '\n\nLaws of sines and cosines in floating point. In the SSA case with an acute given angle and a shorter opposite side, two triangles can exist; both are shown.') + '</pre>') };
  },
});

// ---------- NASA Planetary Fact Sheet (https://nssdc.gsfc.nasa.gov/planetary/factsheet/, pages updated 2024-2025, read 2026-10-23) ----------
// [name, diameter km, mass 1e24 kg, surface gravity m/s2 (1 decimal as published; null = not used)]
const BODIES = [['Sun', 1391400, 1988400, null], ['Mercury', 4879, 0.330, 3.7], ['Venus', 12104, 4.87, 8.9], ['Earth', 12756, 5.97, 9.8], ['Moon', 3475, 0.073, 1.6], ['Mars', 6792, 0.642, 3.7], ['Jupiter', 142984, 1898, 23.1], ['Saturn', 120536, 568, 9.0], ['Uranus', 51118, 86.8, 8.7], ['Neptune', 49528, 102, 11.0], ['Pluto', 2376, 0.0130, 0.7]];
const NASA_SRC = 'Data: NASA Goddard Space Flight Center, Planetary Fact Sheet (nssdc.gsfc.nasa.gov/planetary/factsheet). The Sun diameter is twice its volumetric mean radius, 695,700 km, from the Sun Fact Sheet.';

T.push({
  id: 'planet-size-comparator', cat: MS, title: 'Planet and Moon Size Comparator (True Relative Scale)',
  desc: 'Pick planets, the Moon, Pluto or the Sun and see them side by side at true relative size with diameters and size ratios.',
  inputs: 1, labels: ['Bodies, comma separated (Sun, Mercury, Venus, Earth, Moon, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto)'], sample: 'Earth, Jupiter, Moon, Mars',
  run: ([src]) => {
    const names = src.split(/[,;\n]+/).map((x) => x.trim().toLowerCase()).filter(Boolean); need(names.length >= 1 && names.length <= 11, 'Name 1 to 11 bodies');
    const sel = names.map((n) => { const b = BODIES.find((x) => x[0].toLowerCase() === n); need(b, `Unknown body "${n}"`); return b; });
    const W = 720, H = 360, big = Math.max(...sel.map((b) => b[1])), gap = 14, usable = W - gap * (sel.length + 1); const tot = sel.reduce((a, b) => a + b[1], 0), s = Math.min((H - 40) / big, usable / tot);
    let x = gap, g = ''; const cols = ['#d9a066', '#c9b27c', '#4f81bd', '#999', '#c1440e', '#c88b3a', '#e3c88a', '#8fd3d8', '#4166f5', '#b8a58c', '#f2c500'];
    sel.forEach((b) => { const r = b[1] * s / 2; g += `<circle cx="${(x + r).toFixed(1)}" cy="${(H - 24 - r).toFixed(1)}" r="${Math.max(r, 0.8).toFixed(2)}" fill="${cols[BODIES.indexOf(b)]}" stroke="#333"/><text x="${(x + r).toFixed(1)}" y="${H - 8}" font-size="11" text-anchor="middle" fill="#111">${b[0]}</text>`; x += b[1] * s + gap; });
    const ref = sel[0], rows = sel.map((b) => `${b[0].padEnd(8)} diameter ${String(b[1]).padStart(8)} km   ${(b[1] / ref[1]).toFixed(b[1] / ref[1] < 0.01 ? 4 : 3).padStart(9)} x ${ref[0]}   volume ${((b[1] / ref[1]) ** 3).toPrecision(4).padStart(10)} x ${ref[0]}   mass ${b[2]} x 10^24 kg`);
    return { html: doc('Planet sizes', svgWrap(W, H, g, `Bodies drawn at true relative size: ${sel.map((b) => `${b[0]} ${b[1]} km`).join(', ')}`) + '<pre>' + esc(rows.join('\n') + `\n\nRatios are relative to the first body. Distances between bodies are not to scale.\n${NASA_SRC}`) + '</pre>') };
  },
});

// ---------- projectile ----------
T.push({
  id: 'projectile-motion-calculator', cat: MS, title: 'Projectile Motion Calculator: Range, Height, Flight Time and Path',
  desc: 'Set launch speed, angle and height for Earth, Moon or other planets and get range, maximum height, time of flight, impact speed and the path.',
  inputs: 0, sample: '',
  opts: [{ id: 'v', label: 'Launch speed (m/s)', type: 'number', def: 25 }, { id: 'ang', label: 'Launch angle above horizontal (degrees)', type: 'number', def: 45 }, { id: 'h0', label: 'Launch height (m)', type: 'number', def: 0 }, { id: 'body', label: 'Gravity of', type: 'select', choices: ['Earth (9.80665)', ...BODIES.filter((b) => b[3] != null && b[0] !== 'Earth').map((b) => `${b[0]} (${b[3]})`), 'custom'], def: 'Earth (9.80665)' }, { id: 'g', label: 'Custom g (m/s2, used when "custom" is chosen)', type: 'number', def: 9.81 }],
  run: (_, o) => {
    const v = numOpt(o.v, 'Speed', 0, 1e6), th = numOpt(o.ang, 'Angle', -90, 90) * PI / 180, h0 = numOpt(o.h0, 'Height', 0, 1e7); let g;
    if (o.body === 'custom') g = numOpt(o.g, 'g', 1e-6, 1e4); else { const m = /\(([\d.]+)\)/.exec(o.body); g = parseFloat(m[1]); }
    const vx = v * Math.cos(th), vy = v * Math.sin(th), tf = (vy + Math.sqrt(vy * vy + 2 * g * h0)) / g, range = vx * tf, ta = Math.max(0, vy / g), hmax = h0 + (vy > 0 ? vy * vy / (2 * g) : 0), vyEnd = vy - g * tf, vEnd = Math.hypot(vx, vyEnd);
    need(Number.isFinite(tf) && tf > 0, 'The projectile does not move: use a speed or height above 0');
    const pts = Array.from({ length: 201 }, (_, i) => { const t = tf * i / 200; return [vx * t, h0 + vy * t - 0.5 * g * t * t]; });
    const W = 640, xr = Math.max(range, 1e-9) * 1.06, yr = Math.max(hmax, 1e-9) * 1.15, H = Math.round(Math.min(480, Math.max(220, 640 * yr / xr)));
    const svg = plotSvgDoc({ series: [{ name: 'path', pts }], xmin: 0, xmax: xr, ymin: 0, ymax: yr, marks: [[vx * ta, hmax, '#d62728'], [range, 0, '#000']], title: `Projectile path: range ${fmt(range, 5)} m, maximum height ${fmt(hmax, 5)} m`, W, H });
    const rows = Array.from({ length: 11 }, (_, i) => { const t = tf * i / 10; return `${fmt(t, 4).padStart(9)} s  x = ${fmt(vx * t, 6).padStart(11)} m  y = ${fmt(Math.max(0, h0 + vy * t - 0.5 * g * t * t), 6).padStart(11)} m`; });
    const txt = `g = ${g} m/s2\nTime of flight   ${fmt(tf, 8)} s\nHorizontal range ${fmt(range, 8)} m\nMaximum height   ${fmt(hmax, 8)} m (at t = ${fmt(ta, 6)} s)\nImpact speed     ${fmt(vEnd, 8)} m/s at ${fmt(Math.atan2(-vyEnd, vx) * 180 / PI, 6)} degrees below horizontal\n\n${rows.join('\n')}\n\nNo air resistance, flat ground at y = 0, constant g. Real flights with drag are shorter. Earth g is the standard value g_n = 9.80665 m/s2 (CODATA 2022, NIST). Other bodies: surface gravity as published to one decimal in the NASA Planetary Fact Sheet. The path is drawn as a static plot, not animated.`;
    return { html: doc('Projectile', svg + '<pre>' + esc(txt) + '</pre>') };
  },
});

// ---------- pendulum ----------
T.push({
  id: 'pendulum-simulator-period', cat: MS, title: 'Pendulum Simulator: Simple and Double Pendulum with Exact Period',
  desc: 'Simulate a simple or double pendulum from length, gravity and starting angle, and plot the angles over time with the period.',
  inputs: 0, sample: '',
  opts: [{ id: 'mode', label: 'Type', type: 'select', choices: ['simple', 'double'], def: 'simple' }, { id: 'L1', label: 'Length 1 (m)', type: 'number', def: 1 }, { id: 'L2', label: 'Length 2 (m, double only)', type: 'number', def: 1 }, { id: 'm1', label: 'Mass 1 (kg, double only)', type: 'number', def: 1 }, { id: 'm2', label: 'Mass 2 (kg, double only)', type: 'number', def: 1 }, { id: 'g', label: 'Gravity g (m/s2)', type: 'number', def: 9.80665 }, { id: 'a1', label: 'Start angle 1 (degrees from straight down)', type: 'number', def: 60 }, { id: 'a2', label: 'Start angle 2 (degrees, double only)', type: 'number', def: 90 }, { id: 'T', label: 'Duration (s, up to 120)', type: 'number', def: 10 }],
  run: (_, o) => {
    const L1 = numOpt(o.L1, 'Length 1', 1e-3, 1e3), L2 = numOpt(o.L2, 'Length 2', 1e-3, 1e3), m1 = numOpt(o.m1, 'Mass 1', 1e-6, 1e9), m2 = numOpt(o.m2, 'Mass 2', 1e-6, 1e9), g = numOpt(o.g, 'g', 1e-3, 1e4), a1 = numOpt(o.a1, 'Angle 1', -179.9, 179.9) * PI / 180, a2 = numOpt(o.a2, 'Angle 2', -179.9, 179.9) * PI / 180, Tm = numOpt(o.T, 'Duration', 0.1, 120);
    const dt = 0.0005, n = Math.ceil(Tm / dt), every = Math.max(1, Math.floor(n / 1500)); let txt, series;
    if (o.mode === 'simple') {
      const f = (th, w) => [w, -(g / L1) * Math.sin(th)]; let th = a1, w = 0; const pts = [[0, th * 180 / PI]], cross = []; const E = () => 0.5 * L1 * L1 * w * w + g * L1 * (1 - Math.cos(th)); const E0 = E();
      for (let i = 1; i <= n; i++) { const k1 = f(th, w), k2 = f(th + dt / 2 * k1[0], w + dt / 2 * k1[1]), k3 = f(th + dt / 2 * k2[0], w + dt / 2 * k2[1]), k4 = f(th + dt * k3[0], w + dt * k3[1]); const prev = th; th += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); w += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); if (prev > 0 && th <= 0) cross.push((i - 1 + prev / (prev - th)) * dt); if (i % every === 0) pts.push([i * dt, th * 180 / PI]); }
      let am = 1, bm = Math.cos(a1 / 2); for (let i = 0; i < 40; i++) [am, bm] = [(am + bm) / 2, Math.sqrt(am * bm)]; const Tex = 2 * PI * Math.sqrt(L1 / g) / am, T0 = 2 * PI * Math.sqrt(L1 / g);
      const Tsim = cross.length >= 2 ? (cross[cross.length - 1] - cross[0]) / (cross.length - 1) : NaN;
      txt = `Simple pendulum, length ${L1} m, g ${g} m/s2, start ${fmt(a1 * 180 / PI)} degrees\nSmall-angle period 2 pi sqrt(L/g) = ${fmt(T0, 8)} s\nExact period (AGM formula)        = ${fmt(Tex, 8)} s  (${fmt((Tex / T0 - 1) * 100, 4)} % longer than small-angle)\nSimulated period (RK4, dt ${dt} s) = ${Number.isFinite(Tsim) ? fmt(Tsim, 8) + ' s' : 'duration too short to measure'}\nEnergy drift over the run: ${((E() - E0) / (E0 || 1)).toExponential(2)} (relative)`; series = [{ name: 'angle (degrees)', pts }];
    } else {
      let s = [a1, a2, 0, 0]; const acc = ([t1, t2, w1, w2]) => { const d = t1 - t2, den = 2 * m1 + m2 - m2 * Math.cos(2 * d); return [w1, w2, (-g * (2 * m1 + m2) * Math.sin(t1) - m2 * g * Math.sin(t1 - 2 * t2) - 2 * Math.sin(d) * m2 * (w2 * w2 * L2 + w1 * w1 * L1 * Math.cos(d))) / (L1 * den), (2 * Math.sin(d) * (w1 * w1 * L1 * (m1 + m2) + g * (m1 + m2) * Math.cos(t1) + w2 * w2 * L2 * m2 * Math.cos(d))) / (L2 * den)]; };
      const En = ([t1, t2, w1, w2]) => 0.5 * (m1 + m2) * L1 * L1 * w1 * w1 + 0.5 * m2 * L2 * L2 * w2 * w2 + m2 * L1 * L2 * w1 * w2 * Math.cos(t1 - t2) - (m1 + m2) * g * L1 * Math.cos(t1) - m2 * g * L2 * Math.cos(t2); const E0 = En(s);
      const p1 = [[0, a1 * 180 / PI]], p2 = [[0, a2 * 180 / PI]];
      for (let i = 1; i <= n; i++) { const add = (a, b, k) => a.map((x, j) => x + b[j] * k); const k1 = acc(s), k2 = acc(add(s, k1, dt / 2)), k3 = acc(add(s, k2, dt / 2)), k4 = acc(add(s, k3, dt)); s = s.map((x, j) => x + dt / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])); if (i % every === 0) { p1.push([i * dt, s[0] * 180 / PI]); p2.push([i * dt, s[1] * 180 / PI]); } }
      txt = `Double pendulum: L1 ${L1} m, L2 ${L2} m, m1 ${m1} kg, m2 ${m2} kg, g ${g} m/s2\nStart angles ${fmt(a1 * 180 / PI)} and ${fmt(a2 * 180 / PI)} degrees, released from rest\nAngles are unwrapped (they can exceed 180 degrees when a bob flips over).\nAngles at t = ${Tm} s: ${fmt(s[0] * 180 / PI, 8)} and ${fmt(s[1] * 180 / PI, 8)} degrees\nEnergy drift over the run: ${((En(s) - E0) / Math.abs(E0 || 1)).toExponential(2)} (relative; RK4, dt ${dt} s)\nThe double pendulum is chaotic: after roughly 10-20 s tiny changes in the inputs or step size give a different path.`; series = [{ name: 'angle 1 (degrees)', pts: p1 }, { name: 'angle 2 (degrees)', pts: p2 }];
    }
    const ys = series.flatMap((q) => q.pts.map((p) => p[1])), lo = Math.min(...ys), hi = Math.max(...ys), pad = (hi - lo || 1) * 0.1;
    return { html: doc('Pendulum', plotSvgDoc({ series, xmin: 0, xmax: series[0].pts[series[0].pts.length - 1][0], ymin: lo - pad, ymax: hi + pad, title: `${o.mode} pendulum angle over ${Tm} seconds` }) + '<pre>' + esc(txt + '\nNo friction or air drag. The page shows a plot rather than a live animation.') + '</pre>') };
  },
});

// ---------- circuit (DC netlist) ----------
const siVal = (s) => { need(!/\dM(eg)?[A-Za-z]*$/.test(s) || /meg/i.test(s) && !/\dM(?!eg)/.test(s), 'Write milli as m and mega as meg (a capital M is ambiguous)'); const m = /^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)(meg|[kKGgmunpf])?[A-Za-z]*$/.exec(s); need(m, `Bad value "${s}"`); const f = { meg: 1e6, k: 1e3, K: 1e3, G: 1e9, g: 1e9, m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 }[m[2]] || 1; return parseFloat(m[1]) * f; };
T.push({
  id: 'dc-circuit-solver-netlist', cat: MS, title: 'DC Circuit Solver: Voltages, Currents and Power from a Netlist',
  desc: 'Describe a circuit of resistors, voltage sources and current sources as a netlist and get every node voltage, branch current and power.',
  inputs: 1, labels: ['Netlist: R1 n1 n2 100 | V1 n1 0 9 | I1 0 n2 2m   (node 0 or gnd is ground)'], sample: 'V1 in 0 9\nR1 in mid 1k\nR2 mid 0 2k\nR3 mid out 3.3k\nR4 out 0 4.7k',
  run: ([src]) => {
    const els = []; for (const l of lines(src)) { if (l.startsWith('*') || l.startsWith('#')) continue; const p = l.split(/\s+/); need(p.length >= 4, `Line "${l}": need name, two nodes and a value`); const t = p[0][0].toUpperCase(); need('RVI'.includes(t), `Line "${l}": only R, V and I elements are supported (lamps are resistors)`); const val = siVal(p[3]); if (t === 'R') need(val > 0, `${p[0]} must be positive`); els.push({ t, name: p[0], a: p[1], b: p[2], val }); }
    need(els.length, 'Enter at least one element'); const names = [...new Set(els.flatMap((e) => [e.a, e.b]))].filter((n) => !/^(0|gnd)$/i.test(n)); need(names.length >= 1, 'No nodes besides ground'); need(els.some((e) => /^(0|gnd)$/i.test(e.a) || /^(0|gnd)$/i.test(e.b)), 'Connect at least one element to ground (node 0)');
    const idx = new Map(names.map((n, i) => [n, i])), vs = els.filter((e) => e.t === 'V'), n = names.length, m = vs.length, size = n + m, A = Array.from({ length: size }, () => Array(size).fill(0)), z = Array(size).fill(0); const nd = (x) => (idx.has(x) ? idx.get(x) : -1);
    for (const e of els) { const a = nd(e.a), b = nd(e.b); if (e.t === 'R') { const gd = 1 / e.val; if (a >= 0) A[a][a] += gd; if (b >= 0) A[b][b] += gd; if (a >= 0 && b >= 0) { A[a][b] -= gd; A[b][a] -= gd; } } else if (e.t === 'I') { if (a >= 0) z[a] -= e.val; if (b >= 0) z[b] += e.val; } }
    vs.forEach((e, k) => { const a = nd(e.a), b = nd(e.b), r = n + k; if (a >= 0) { A[a][r] += 1; A[r][a] += 1; } if (b >= 0) { A[b][r] -= 1; A[r][b] -= 1; } z[r] = e.val; });
    const M = A.map((r, i) => [...r, z[i]]); for (let c = 0; c < size; c++) { let p = c; for (let i = c + 1; i < size; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i; need(Math.abs(M[p][c]) > 1e-14, 'The circuit has no unique solution (floating part, loop of voltage sources, or current source in series with nothing)'); [M[c], M[p]] = [M[p], M[c]]; for (let i = 0; i < size; i++) if (i !== c) { const f = M[i][c] / M[c][c]; if (f) for (let j = c; j <= size; j++) M[i][j] -= f * M[c][j]; } }
    const x = M.map((r, i) => r[size] / r[i]), V0 = (nm) => (idx.has(nm) ? x[idx.get(nm)] : 0), out = ['Node voltages (V, relative to ground):', ...names.map((nm) => `  ${nm.padEnd(8)} ${fmt(x[idx.get(nm)], 8)}`), '', 'Elements (current flows from the first node to the second through the element):'];
    let pDel = 0, pDis = 0; let kv = 0;
    for (const e of els) { const dv = V0(e.a) - V0(e.b); let i; if (e.t === 'R') { i = dv / e.val; pDis += dv * i; out.push(`  ${e.name.padEnd(5)} R ${fmt(e.val, 6)} ohm   V = ${fmt(dv, 6)} V   I = ${fmt(i, 6)} A   P = ${fmt(dv * i, 6)} W`); } else if (e.t === 'V') { i = x[n + kv++]; pDel += -dv * i; out.push(`  ${e.name.padEnd(5)} V source ${fmt(e.val, 6)} V   I = ${fmt(i, 6)} A   delivers ${fmt(-dv * i, 6)} W`); } else { pDel += -dv * e.val; out.push(`  ${e.name.padEnd(5)} I source ${fmt(e.val, 6)} A   V = ${fmt(dv, 6)} V   delivers ${fmt(-dv * e.val, 6)} W`); } }
    return out.join('\n') + `\n\nPower delivered by sources ${fmt(pDel, 8)} W, dissipated in resistors ${fmt(pDis, 8)} W.\nDC steady state by modified nodal analysis (Gaussian elimination with pivoting). Ideal sources and resistors only: no capacitors, inductors, diodes or switch states. A switch that is open is simply left out of the netlist. Values accept k, meg, m, u, n, p suffixes. Click-and-drag circuit building is not included.`;
  },
});

// ---------- waves ----------
T.push({
  id: 'wave-interference-superposition', cat: MS, title: 'Wave Interference Simulator: Superposition of Two Sine Waves',
  desc: 'Set amplitude, frequency and phase of two waves and see each wave and their sum, with constructive or destructive interference and beats.',
  inputs: 0, sample: '',
  opts: [{ id: 'A1', label: 'Wave 1 amplitude', type: 'number', def: 1 }, { id: 'f1', label: 'Wave 1 frequency (Hz)', type: 'number', def: 2 }, { id: 'p1', label: 'Wave 1 phase (degrees)', type: 'number', def: 0 }, { id: 'A2', label: 'Wave 2 amplitude', type: 'number', def: 1 }, { id: 'f2', label: 'Wave 2 frequency (Hz)', type: 'number', def: 2 }, { id: 'p2', label: 'Wave 2 phase (degrees)', type: 'number', def: 180 }, { id: 'T', label: 'Time span (s)', type: 'number', def: 2 }],
  run: (_, o) => {
    const A1 = numOpt(o.A1, 'Amplitude 1', 0, 1e6), A2 = numOpt(o.A2, 'Amplitude 2', 0, 1e6), f1 = numOpt(o.f1, 'Frequency 1', 0.001, 1e4), f2 = numOpt(o.f2, 'Frequency 2', 0.001, 1e4), p1 = numOpt(o.p1, 'Phase 1') * PI / 180, p2 = numOpt(o.p2, 'Phase 2') * PI / 180, Tm = numOpt(o.T, 'Time span', 0.001, 1e4);
    need(Math.max(f1, f2) * Tm <= 400, 'Too many cycles to draw: shorten the time span'); need(A1 + A2 > 0, 'At least one amplitude must be above 0');
    const n = 1500, w1 = [], w2 = [], sm = []; for (let i = 0; i <= n; i++) { const t = Tm * i / n, a = A1 * Math.sin(2 * PI * f1 * t + p1), b = A2 * Math.sin(2 * PI * f2 * t + p2); w1.push([t, a]); w2.push([t, b]); sm.push([t, a + b]); }
    const ym = (A1 + A2) * 1.1; let txt;
    if (f1 === f2) { const dphi = ((((p2 - p1) * 180 / PI) % 360) + 360) % 360, R = Math.sqrt(A1 * A1 + A2 * A2 + 2 * A1 * A2 * Math.cos(p2 - p1)); txt = `Same frequency: the sum is a sine wave of the same frequency.\nPhase difference ${fmt(dphi, 6)} degrees\nResultant amplitude = sqrt(A1^2 + A2^2 + 2 A1 A2 cos(dphi)) = ${fmt(R, 8)} (maximum possible ${fmt(A1 + A2, 8)}, minimum ${fmt(Math.abs(A1 - A2), 8)})\n${R > (A1 + A2) * 0.999 ? 'Fully constructive interference.' : R < Math.abs(A1 - A2) * 1.001 + 1e-9 ? (A1 === A2 ? 'Fully destructive interference (the waves cancel).' : 'Fully destructive interference (partial cancellation, amplitudes differ).') : 'Partial interference.'}`; }
    else txt = `Different frequencies: the sum is not a pure sine wave.\nBeat frequency |f1 - f2| = ${fmt(Math.abs(f1 - f2), 8)} Hz (beat period ${fmt(1 / Math.abs(f1 - f2), 6)} s); the loudness envelope swings between ${fmt(Math.abs(A1 - A2), 6)} and ${fmt(A1 + A2, 6)}.`;
    return { html: doc('Waves', plotSvgDoc({ series: [{ name: `wave 1: ${A1} sin(2 pi ${f1} t + ${o.p1} deg)`, pts: w1 }, { name: `wave 2: ${A2} sin(2 pi ${f2} t + ${o.p2} deg)`, pts: w2 }, { name: 'sum', pts: sm }], xmin: 0, xmax: Tm, ymin: -ym, ymax: ym, title: 'Two waves and their sum over time at one point' }) + '<pre>' + esc(txt + '\nThis is the superposition at a single point in space as time passes (time-domain plot), not an animation of the whole medium.') + '</pre>') };
  },
});

// ---------- n-body ----------
T.push({
  id: 'orbital-mechanics-nbody-sandbox', cat: MS, title: 'Orbital Mechanics Sandbox: N-Body Gravity Simulation with Orbit Trails',
  desc: 'Enter bodies with mass, position and velocity, and the tool integrates their mutual gravity and draws the orbit trails.',
  inputs: 1, labels: ['Bodies, one per line: name mass x y vx vy'], sample: 'Sun 1 0 0 0 0\nEarth 3.0034e-6 1 0 0 6.2832\nMars 3.229e-7 1.524 0 0 5.0896',
  opts: [{ id: 'units', label: 'Units', type: 'select', choices: ['AU, solar masses, years (G = 4 pi^2)', 'arbitrary (G = 1)'], def: 'AU, solar masses, years (G = 4 pi^2)' }, { id: 'dt', label: 'Time step (smaller = more accurate)', type: 'number', def: 0.0002 }, { id: 'T', label: 'Total time', type: 'number', def: 2 }],
  run: ([src], o) => {
    const G = o.units.startsWith('AU') ? 4 * PI * PI : 1, dt = numOpt(o.dt, 'Time step', 1e-6, 10), Tm = numOpt(o.T, 'Total time', dt, 1e6), steps = Math.round(Tm / dt); need(steps <= 400000, 'Too many steps (limit 400000): raise the time step or shorten the time');
    const B = lines(src).map((l) => { const p = l.split(/\s+/); need(p.length === 6, `Line "${l}": expected name mass x y vx vy`); const v = p.slice(1).map(Number); need(v.every(Number.isFinite), `Line "${l}": numbers expected`); need(v[0] > 0, `${p[0]}: mass must be positive`); return { name: p[0], m: v[0], x: v[1], y: v[2], vx: v[3], vy: v[4] }; }); need(B.length >= 2 && B.length <= 10, 'Between 2 and 10 bodies');
    const acc = () => B.map((b, i) => { let ax = 0, ay = 0; B.forEach((c, j) => { if (i === j) return; const dx = c.x - b.x, dy = c.y - b.y, r2 = dx * dx + dy * dy, r3 = r2 * Math.sqrt(r2); need(r3 > 0, 'Two bodies are at the same place'); ax += G * c.m * dx / r3; ay += G * c.m * dy / r3; }); return [ax, ay]; });
    const energy = () => { let e = 0, l = 0; B.forEach((b, i) => { e += 0.5 * b.m * (b.vx ** 2 + b.vy ** 2); l += b.m * (b.x * b.vy - b.y * b.vx); for (let j = i + 1; j < B.length; j++) e -= G * b.m * B[j].m / Math.hypot(b.x - B[j].x, b.y - B[j].y); }); return [e, l]; };
    const [E0, L0] = energy(); const trail = B.map((b) => [[b.x, b.y]]), keep = Math.max(1, Math.floor(steps / 800));
    let a = acc();
    for (let s = 1; s <= steps; s++) { B.forEach((b, i) => { b.vx += a[i][0] * dt / 2; b.vy += a[i][1] * dt / 2; b.x += b.vx * dt; b.y += b.vy * dt; }); a = acc(); B.forEach((b, i) => { b.vx += a[i][0] * dt / 2; b.vy += a[i][1] * dt / 2; }); if (s % keep === 0) B.forEach((b, i) => trail[i].push([b.x, b.y])); }
    const [E1, L1] = energy(); const all = trail.flat(), xs = all.map((p) => p[0]), ys = all.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), sp = Math.max(x1 - x0, y1 - y0) || 1, W = 560, H = 560, sc = (W - 60) / sp, X = (x) => 30 + (x - x0) * sc + ((W - 60) - (x1 - x0) * sc) / 2, Y = (y) => H - 30 - (y - y0) * sc - ((H - 60) - (y1 - y0) * sc) / 2;
    let g = ''; trail.forEach((t, i) => { g += `<polyline fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="1.5" points="${t.map((p) => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ')}"/><circle cx="${X(B[i].x).toFixed(1)}" cy="${Y(B[i].y).toFixed(1)}" r="${i === 0 ? 6 : 4}" fill="${COLORS[i % COLORS.length]}" stroke="#000"/><text x="${(X(B[i].x) + 7).toFixed(1)}" y="${(Y(B[i].y) - 6).toFixed(1)}" font-size="12" fill="#111">${esc(B[i].name)}</text>`; });
    const txt = `${steps} steps of dt ${dt} (velocity Verlet / leapfrog, 2D)\nG = ${fmt(G, 10)}${G === 1 ? '' : ' AU^3 / (solar mass year^2): 4 pi^2 is the idealised value with the Sun at 1 solar mass, so a circular orbit at 1 AU takes exactly 1 year'}\nEnergy drift ${((E1 - E0) / Math.abs(E0)).toExponential(3)}, angular momentum drift ${(L0 ? (L1 - L0) / Math.abs(L0) : L1 - L0).toExponential(3)} (relative; leapfrog keeps these bounded)\n\nFinal state:\n` + B.map((b) => `  ${b.name.padEnd(8)} x ${fmt(b.x, 8)} y ${fmt(b.y, 8)} vx ${fmt(b.vx, 8)} vy ${fmt(b.vy, 8)}`).join('\n') + '\n\nClose encounters need a smaller time step; halve it and compare to check convergence (at 1 AU, dt 0.001 gives position errors near 1e-4 after 2 years, dt 0.0002 about 1e-6). Sample masses: Earth 5.9722 / 1,988,400 and Mars 0.642 / 1,988,400 of the Sun mass (NASA Planetary Fact Sheet); sample speeds are circular-orbit values 2 pi / sqrt(a).';
    return { html: doc('Orbits', svgWrap(W, H, g, `Orbit trails of ${B.map((b) => b.name).join(', ')}; drawn to equal scale`) + '<pre>' + esc(txt) + '</pre>') };
  },
});

// ---------- game of life ----------
T.push({
  id: 'game-of-life-simulator', cat: MS, title: "Conway's Game of Life Simulator with Pattern Detection",
  desc: 'Draw a starting grid as text, run any number of generations and see the population, snapshots and whether it dies out or settles into a cycle.',
  inputs: 1, labels: ['Grid: # or O = live cell, . = dead cell (one row per line)'], sample: '.#......\n..#.....\n###.....\n........\n........\n........',
  opts: [{ id: 'gens', label: 'Generations (1-2000)', type: 'number', def: 8 }, { id: 'wrap', label: 'Wrap around the edges (torus)', type: 'checkbox', def: true }],
  run: ([src], o) => {
    const rows = lines(src); need(rows.length >= 1 && rows.length <= 120, 'Between 1 and 120 rows'); const w = Math.max(...rows.map((r) => r.length)); need(w <= 160, 'At most 160 columns'); const h = rows.length, gens = Math.round(numOpt(o.gens, 'Generations', 1, 2000));
    let g = rows.map((r) => Array.from({ length: w }, (_, i) => (/[#Oo*1]/.test(r[i] || '.') ? 1 : 0)));
    const step = (c) => c.map((r, y) => r.map((v, x) => { let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; let yy = y + dy, xx = x + dx; if (o.wrap) { yy = (yy + h) % h; xx = (xx + w) % w; } else if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue; n += c[yy][xx]; } return v ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0); }));
    const show = (c) => c.map((r) => r.map((v) => (v ? '#' : '.')).join('')).join('\n'), key = (c) => c.map((r) => r.join('')).join('/'), seen = new Map([[key(g), 0]]), pops = [g.flat().reduce((a, b) => a + b, 0)], snaps = [`Generation 0 (population ${pops[0]})\n${show(g)}`]; let note = '';
    const every = Math.max(1, Math.floor(gens / 5));
    for (let t = 1; t <= gens; t++) { g = step(g); const p = g.flat().reduce((a, b) => a + b, 0); pops.push(p); if (t % every === 0 || t === gens) snaps.push(`Generation ${t} (population ${p})\n${show(g)}`); const k = key(g); if (!note && seen.has(k)) { const per = t - seen.get(k); note = p === 0 ? `Everything died out at generation ${t}.` : per === 1 ? `Still life reached at generation ${seen.get(k)}.` : `Repeats with period ${per}, first seen at generation ${seen.get(k)}.`; } if (!seen.has(k)) seen.set(k, t); }
    return `${w} x ${h} grid, ${o.wrap ? 'torus (edges wrap)' : 'bounded (cells outside count as dead)'}\n${note || 'No exact repeat within the generations run.'}\nPopulation by generation: ${pops.slice(0, 60).join(' ')}${pops.length > 60 ? ' ...' : ''}\n\n${snaps.join('\n\n')}\n\nRules: a live cell survives with 2 or 3 live neighbours, a dead cell becomes live with exactly 3 (B3/S23). A glider on a torus returns after 4 x (grid size) generations. Elementary (1D) rules like Rule 30 are in the Elementary Cellular Automaton Generator.`;
  },
});

// ---------- molecule viewer (PDB / XYZ) ----------
const CPK = { H: '#ffffff', C: '#909090', N: '#3050f8', O: '#ff0d0d', F: '#90e050', Cl: '#1ff01f', Br: '#a62929', I: '#940094', S: '#ffff30', P: '#ff8000', Fe: '#e06633', Na: '#ab5cf2', Ca: '#3dff00', Mg: '#8aff00', Zn: '#7d80b0', Cu: '#c88033' };
const VDW = { H: 1.2, C: 1.7, N: 1.55, O: 1.52, F: 1.47, P: 1.8, S: 1.8, Cl: 1.75 }; // Bondi (1964) values as listed on Wikipedia's Van der Waals radius table (checked 2026-10-23); other elements drawn at 1.8
function parseMol(text) {
  const ls = text.replace(/\r/g, '').split('\n'); const atoms = [], bonds = []; const first = ls.find((l) => l.trim());
  if (/^\s*\d+\s*$/.test(first || '')) { const n = parseInt(first, 10), i0 = ls.indexOf(first); for (let i = i0 + 2; i < i0 + 2 + n && i < ls.length; i++) { const p = ls[i].trim().split(/\s+/); if (p.length < 4) continue; const el = p[0].replace(/[^A-Za-z]/g, ''); atoms.push({ el: el[0].toUpperCase() + el.slice(1).toLowerCase(), x: +p[1], y: +p[2], z: +p[3] }); } need(atoms.length === n, `The XYZ header says ${n} atoms but ${atoms.length} were read`); }
  else {
    const idx = new Map();
    for (const l of ls) { if (l.startsWith('ENDMDL')) break; if (/^(ATOM  |HETATM)/.test(l)) { let el = l.slice(76, 78).trim(); if (!el) el = l.slice(12, 16).replace(/[^A-Za-z]/g, '').slice(0, 1); el = el[0].toUpperCase() + el.slice(1).toLowerCase(); const a = { el, x: parseFloat(l.slice(30, 38)), y: parseFloat(l.slice(38, 46)), z: parseFloat(l.slice(46, 54)) }; need([a.x, a.y, a.z].every(Number.isFinite), `Bad coordinates in: ${l.slice(0, 54)}`); idx.set(parseInt(l.slice(6, 11), 10), atoms.length); atoms.push(a); } }
    for (const l of ls) if (l.startsWith('CONECT')) { const a = idx.get(parseInt(l.slice(6, 11), 10)); for (let k = 11; k + 5 <= l.length + 0 && k < 31; k += 5) { const b = idx.get(parseInt(l.slice(k, k + 5), 10)); if (a != null && b != null && a < b) bonds.push([a, b]); } }
  }
  need(atoms.length, 'No atoms found: paste PDB (ATOM/HETATM lines) or XYZ text'); need(atoms.length <= 4000, 'At most 4000 atoms'); return { atoms, bonds };
}
T.push({
  id: 'molecule-viewer-pdb-xyz', cat: MS, title: 'Molecule Viewer for PDB and XYZ Files (Ball-and-Stick, Space-Filling)',
  desc: 'Paste PDB or XYZ coordinates and see the molecule as a ball-and-stick or space-filling drawing that you turn with azimuth and elevation angles.',
  inputs: 1, labels: ['PDB (ATOM/HETATM lines) or XYZ text'], sample: '5\nmethane (idealised tetrahedral geometry, C-H 1.089 A)\nC 0.000 0.000 0.000\nH 0.629 0.629 0.629\nH -0.629 -0.629 0.629\nH -0.629 0.629 -0.629\nH 0.629 -0.629 -0.629',
  opts: [{ id: 'style', label: 'Style', type: 'select', choices: ['ball and stick', 'space filling', 'sticks'], def: 'ball and stick' }, { id: 'az', label: 'Azimuth (degrees)', type: 'number', def: 30 }, { id: 'el', label: 'Elevation (degrees)', type: 'number', def: 20 }],
  run: ([src], o) => {
    const { atoms, bonds } = parseMol(src), az = numOpt(o.az, 'Azimuth') * PI / 180, el = numOpt(o.el, 'Elevation', -90, 90) * PI / 180;
    if (!bonds.length) for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) { const d = Math.hypot(atoms[i].x - atoms[j].x, atoms[i].y - atoms[j].y, atoms[i].z - atoms[j].z), h = atoms[i].el === 'H' || atoms[j].el === 'H'; if (d > 0.4 && d < (h ? 1.25 : 1.9)) bonds.push([i, j]); }
    const c = atoms.reduce((a, p) => [a[0] + p.x / atoms.length, a[1] + p.y / atoms.length, a[2] + p.z / atoms.length], [0, 0, 0]);
    const P = atoms.map((a) => { const x = a.x - c[0], y = a.y - c[1], z = a.z - c[2], xr = x * Math.cos(az) - y * Math.sin(az), yr = x * Math.sin(az) + y * Math.cos(az); return { sx: xr, sy: z * Math.cos(el) + yr * Math.sin(el), d: -yr * Math.cos(el) + z * Math.sin(el), el: a.el }; });
    const ext = Math.max(...P.map((p) => Math.hypot(p.sx, p.sy))) + 2, W = 520, H = 520, S = (W / 2 - 10) / ext, X = (v) => W / 2 + v * S, Y = (v) => H / 2 - v * S;
    const rad = (e) => (o.style === 'space filling' ? (VDW[e] || 1.8) : o.style === 'sticks' ? 0.12 : (VDW[e] || 1.8) * 0.28) * S;
    const items = [...bonds.map(([i, j]) => ({ d: (P[i].d + P[j].d) / 2 - 0.001, t: 'b', i, j })), ...P.map((p, i) => ({ d: p.d, t: 'a', i }))].sort((a, b) => a.d - b.d);
    let g = ''; for (const it of items) { if (it.t === 'b') { const a = P[it.i], b = P[it.j]; g += `<line x1="${X(a.sx).toFixed(1)}" y1="${Y(a.sy).toFixed(1)}" x2="${X(b.sx).toFixed(1)}" y2="${Y(b.sy).toFixed(1)}" stroke="#555" stroke-width="${o.style === 'space filling' ? 0 : Math.max(2, 0.12 * S)}" stroke-linecap="round"/>`; } else { const p = P[it.i]; g += `<circle cx="${X(p.sx).toFixed(1)}" cy="${Y(p.sy).toFixed(1)}" r="${Math.max(2.5, rad(p.el)).toFixed(1)}" fill="${CPK[p.el] || '#ff69b4'}" stroke="#222" stroke-width="1"/>`; } }
    const counts = {}; atoms.forEach((a) => { counts[a.el] = (counts[a.el] || 0) + 1; });
    return { html: doc('Molecule', svgWrap(W, H, g, `Molecule with ${atoms.length} atoms (${Object.entries(counts).map(([k, v]) => k + v).join(' ')}) and ${bonds.length} bonds, ${o.style}, azimuth ${o.az}, elevation ${o.el}`) + `<pre>${esc(`${atoms.length} atoms: ${Object.entries(counts).map(([k, v]) => k + v).join(' ')}; ${bonds.length} bonds ${src.includes('CONECT') ? 'from CONECT records' : 'guessed from distances (under 1.9 A, or 1.25 A to hydrogen), so unusual geometries may be wrong'}.\nColors: CPK convention. Space-filling radii: Bondi (1964) van der Waals radii for H C N O F P S Cl, 1.8 A for all other elements. Turn the molecule by changing azimuth and elevation. SMILES input is not supported (it needs a 3D structure generator).`)}</pre>`) };
  },
});

// ---------- fractal ----------
function fractalIter(set, zr, zi, cr, ci, maxIt) {
  let x = zr, y = zi, i = 0; const julia = set === 'julia';
  if (!julia) { cr = zr; ci = zi; x = 0; y = 0; }
  while (i < maxIt) { const xx = x * x, yy = y * y; if (xx + yy > 256) break; if (set === 'burning ship') { y = Math.abs(2 * x * y) + ci; x = xx - yy + cr; } else { y = 2 * x * y + ci; x = xx - yy + cr; } i++; }
  if (i >= maxIt) return -1; return i + 1 - Math.log(Math.log(x * x + y * y) / 2) / Math.LN2;
}
const palette = (name, t) => { if (name === 'grey') { const v = Math.floor(255 * (0.5 + 0.5 * Math.sin(t * 0.15))); return [v, v, v]; } if (name === 'fire') return [Math.min(255, Math.floor(t * 12)), Math.min(255, Math.floor(t * 5)), Math.floor(40 * (0.5 + 0.5 * Math.sin(t * 0.1)))]; if (name === 'ocean') return [Math.floor(30 + 30 * Math.sin(t * 0.07)), Math.floor(100 + 100 * (0.5 + 0.5 * Math.sin(t * 0.11))), Math.floor(160 + 90 * (0.5 + 0.5 * Math.sin(t * 0.05)))]; const h = (t * 7) % 360, a = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (0.5 - 0.4 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [a(0), a(8), a(4)]; };
T.push({
  id: 'fractal-explorer-mandelbrot-julia', cat: MS, title: 'Fractal Explorer: Mandelbrot, Julia and Burning Ship Sets',
  desc: 'Render the Mandelbrot, Julia or Burning Ship set at any center and zoom with a chosen iteration count and palette, and save it as a PNG.',
  inputs: 0, sample: '', dom: true,
  opts: [{ id: 'set', label: 'Set', type: 'select', choices: ['mandelbrot', 'julia', 'burning ship'], def: 'mandelbrot' }, { id: 'cx', label: 'Center, real part', type: 'number', def: -0.5 }, { id: 'cy', label: 'Center, imaginary part', type: 'number', def: 0 }, { id: 'zoom', label: 'Zoom (1 = whole set; larger = closer)', type: 'number', def: 1 }, { id: 'iter', label: 'Max iterations (20-5000)', type: 'number', def: 200 }, { id: 'pal', label: 'Palette', type: 'select', choices: ['fire', 'ocean', 'rainbow', 'grey'], def: 'fire' }, { id: 'jr', label: 'Julia constant c, real part', type: 'number', def: -0.8 }, { id: 'ji', label: 'Julia constant c, imaginary part', type: 'number', def: 0.156 }, { id: 'size', label: 'Image width in pixels (100-1600)', type: 'number', def: 640 }],
  run: (_, o) => {
    const W = Math.round(numOpt(o.size, 'Width', 100, 1600)), H = Math.round(W * 0.75), zoom = numOpt(o.zoom, 'Zoom', 1e-3, 1e13), it = Math.round(numOpt(o.iter, 'Iterations', 20, 5000)), cx = numOpt(o.cx, 'Center real'), cy = numOpt(o.cy, 'Center imaginary'), jr = numOpt(o.jr, 'c real'), ji = numOpt(o.ji, 'c imaginary');
    const span = 3.5 / zoom, px = span / W, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = fractalIter(o.set, cx + (x - W / 2) * px, cy + (y - H / 2) * px, jr, ji, it), k = (y * W + x) * 4, c = v < 0 ? [0, 0, 0] : palette(o.pal, v); img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255; }
    ctx.putImageData(img, 0, 0); cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', `${o.set} set centered at ${cx} + ${cy}i, zoom ${zoom}, ${it} iterations, width ${fmt(span, 4)} in the complex plane`);
    return { canvas: cv };
  },
});

// =====================================================================
// Education & Learning
// =====================================================================
const OPS = { addition: '+', subtraction: '-', multiplication: 'x', division: '/' };
T.push({
  id: 'math-worksheet-generator', cat: LRN, title: 'Printable Math Worksheet Generator with Answer Key',
  desc: 'Make arithmetic worksheets with the operation, number range and problem count you choose, plus a separate answer page to print or save as PDF.',
  inputs: 0, sample: '',
  opts: [{ id: 'op', label: 'Operation', type: 'select', choices: ['addition', 'subtraction', 'multiplication', 'division', 'mixed'], def: 'addition' }, { id: 'min', label: 'Smallest number', type: 'number', def: 1 }, { id: 'max', label: 'Largest number', type: 'number', def: 20 }, { id: 'count', label: 'Number of problems (1-120)', type: 'number', def: 24 }, { id: 'cols', label: 'Columns (1-5)', type: 'number', def: 3 }, { id: 'seed', label: 'Seed (same seed = same worksheet)', type: 'text', def: '1' }, { id: 'title', label: 'Worksheet title', type: 'text', def: 'Math practice' }],
  run: (_, o) => {
    const lo = Math.round(numOpt(o.min, 'Smallest number', 0, 1e6)), hi = Math.round(numOpt(o.max, 'Largest number', 0, 1e6)), n = Math.round(numOpt(o.count, 'Problems', 1, 120)), cols = Math.round(numOpt(o.cols, 'Columns', 1, 5)); need(hi >= lo, 'Largest must not be below smallest'); need(o.op !== 'division' && o.op !== 'mixed' || hi >= 1, 'Division needs a largest number of at least 1');
    const rnd = seeded(o.seed), ri = (a, b) => a + Math.floor(rnd() * (b - a + 1)), kinds = o.op === 'mixed' ? Object.keys(OPS) : [o.op], P = [];
    for (let i = 0; i < n; i++) { const k = kinds[i % kinds.length]; let a, b, ans; if (k === 'addition') { a = ri(lo, hi); b = ri(lo, hi); ans = a + b; } else if (k === 'subtraction') { a = ri(lo, hi); b = ri(lo, hi); if (b > a) [a, b] = [b, a]; ans = a - b; } else if (k === 'multiplication') { a = ri(lo, hi); b = ri(lo, hi); ans = a * b; } else { b = ri(Math.max(lo, 1), hi); ans = ri(lo, hi); a = b * ans; } P.push({ a, b, k, ans }); }
    const sh = P.length ? shuf(P, rnd) : P; // mixed: shuffle so operations are not in a fixed order
    const cell = (p, i, key) => `<div class="p"><span class="n">${i + 1}.</span> ${p.a} ${OPS[p.k] === '/' ? '&divide;' : OPS[p.k] === 'x' ? '&times;' : OPS[p.k]} ${p.b} = ${key ? `<b>${p.ans}</b>` : '<span class="blank"></span>'}</div>`;
    const css = `.g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:18px 24px;font-size:20px}.p{white-space:nowrap}.n{color:#666;font-size:13px;display:inline-block;width:2em}.blank{display:inline-block;width:3.5em;border-bottom:1px solid #000}h1{font-size:22px}.name{margin:6px 0 20px}`;
    const body = `<div class="sheet"><h1>${esc(o.title)}</h1><div class="name">Name: ____________________ Date: ____________</div><div class="g">${sh.map((p, i) => cell(p, i, false)).join('')}</div></div><div class="sheet"><h1>${esc(o.title)}: answer key</h1><div class="g">${sh.map((p, i) => cell(p, i, true)).join('')}</div></div>`;
    return { html: doc(o.title, body, css) };
  },
});

T.push({
  id: 'quiz-builder-html-file', cat: LRN, title: 'Multiple-Choice Quiz Builder (Self-Contained HTML Quiz File)',
  desc: 'Write questions with answer options, mark the correct ones, and download one HTML file that anyone can open to take the quiz and see the score.',
  inputs: 1, labels: ['Quiz text. "Q: question" then options: "- wrong", "* correct". Blank line between questions. First line "Title: ..." is optional.'], sample: 'Title: Capitals quiz\n\nQ: What is the capital of France?\n- Berlin\n* Paris\n- Madrid\n\nQ: Which of these are prime numbers?\n* 2\n- 9\n* 7\n- 15',
  opts: [{ id: 'shuffle', label: 'Shuffle option order for each attempt', type: 'checkbox', def: true }],
  run: ([src], o) => {
    const blocks = src.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean); let title = 'Quiz'; const qs = [];
    for (const b of blocks) { const ls = b.split('\n').map((l) => l.trim()).filter(Boolean); if (/^Title:/i.test(ls[0])) { title = ls.shift().replace(/^Title:\s*/i, '').trim() || title; if (!ls.length) continue; } const q = { q: '', o: [] }; for (const l of ls) { if (/^Q:/i.test(l)) q.q = l.replace(/^Q:\s*/i, ''); else if (/^[-*]\s/.test(l) || /^[-*]\S/.test(l)) q.o.push({ t: l.slice(1).trim(), c: l[0] === '*' }); else throw new Error(`Cannot read the line "${l.slice(0, 40)}": start questions with Q: and options with - or *`); } need(q.q, 'A question has no "Q:" line'); need(q.o.length >= 2, `Question "${q.q.slice(0, 40)}" needs at least 2 options`); need(q.o.some((x) => x.c), `Question "${q.q.slice(0, 40)}" has no correct option (mark it with *)`); qs.push(q); }
    need(qs.length, 'Write at least one question'); need(qs.length <= 200, 'At most 200 questions');
    const data = JSON.stringify({ title, shuffle: !!o.shuffle, qs }).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, ' ');
    const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>:root{color-scheme:light dark}body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:1rem auto;padding:0 1rem}fieldset{margin:1rem 0;border:1px solid #888;border-radius:6px}legend{font-weight:600}label{display:block;padding:.2rem 0}.ok{color:#0a6b2d}.bad{color:#b00020}button{font:inherit;padding:.4rem 1rem}@media(prefers-color-scheme:dark){.ok{color:#6fdc8c}.bad{color:#ff8a80}}</style></head><body><h1 id="t"></h1><form id="f"></form><p><button type="button" id="go">Check answers</button> <button type="button" id="rs">Start again</button></p><p id="r" role="status"></p><script>
const D=${data};document.getElementById('t').textContent=D.title;document.title=D.title;const f=document.getElementById('f');let Q=[];
function sh(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function build(){f.textContent='';Q=D.qs.map(q=>({q:q.q,o:D.shuffle?sh(q.o):q.o.slice()}));Q.forEach((q,i)=>{const fs=document.createElement('fieldset'),lg=document.createElement('legend');lg.textContent=(i+1)+'. '+q.q;fs.append(lg);const multi=q.o.filter(x=>x.c).length>1;if(multi){const h=document.createElement('div');h.textContent='Choose all that apply';fs.append(h)}q.o.forEach((x,j)=>{const l=document.createElement('label'),inp=document.createElement('input');inp.type=multi?'checkbox':'radio';inp.name='q'+i;inp.value=j;l.append(inp,' '+x.t);fs.append(l)});const fb=document.createElement('div');fb.id='fb'+i;fs.append(fb);f.append(fs)});document.getElementById('r').textContent=''}
document.getElementById('go').onclick=()=>{let s=0;Q.forEach((q,i)=>{const sel=[...f.querySelectorAll('input[name=q'+i+']')].map(x=>x.checked);const right=q.o.every((x,j)=>x.c===sel[j]);if(right)s++;const fb=document.getElementById('fb'+i);fb.className=right?'ok':'bad';fb.textContent=right?'Correct':'Not quite. Correct: '+q.o.filter(x=>x.c).map(x=>x.t).join('; ')});document.getElementById('r').textContent='Score: '+s+' of '+Q.length+' ('+Math.round(100*s/Q.length)+'%)'};
document.getElementById('rs').onclick=build;build();</script></body></html>`;
    return { text: `${title}: ${qs.length} question${qs.length > 1 ? 's' : ''}\n\n` + qs.map((q, i) => `${i + 1}. ${q.q}\n` + q.o.map((x) => `   ${x.c ? '[x]' : '[ ]'} ${x.t}`).join('\n')).join('\n\n') + '\n\nDownload the HTML file below and send it or put it on any web page: it works offline, with no server. Answers are inside the file, so this is for practice, not for exams.', blob: new Blob([page], { type: 'text/html' }), filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'quiz'}.html` };
  },
});

// ---------- fraction visualiser ----------
function parseFrac(s) { const m = /^(?:(-?\d+)\s+)?(-?\d+)\s*\/\s*(\d+)$|^(-?\d+)$/.exec(s.trim()); need(m, `"${s}" is not a fraction (use 3/8, 1 3/4 or 2)`); if (m[4] != null) return [parseInt(m[4], 10), 1]; need(parseInt(m[3], 10) > 0, 'Denominator must be above 0'); const w = m[1] ? parseInt(m[1], 10) : 0, num = parseInt(m[2], 10), d = parseInt(m[3], 10); return [w < 0 ? w * d - num : w * d + num, d]; }
T.push({
  id: 'fraction-visualizer-pie-bar', cat: LRN, title: 'Fraction Visualizer: Pie and Bar Models with Comparison',
  desc: 'Draw one or more fractions such as 3/8 as shaded circle slices and bars, compare two fractions side by side, and see the equivalent decimal.',
  inputs: 1, labels: ['Fractions separated by commas (3/8, 1 3/4). Two fractions are compared.'], sample: '3/8, 1/2',
  run: ([src]) => {
    const fs = src.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).map((x) => ({ s: x, v: parseFrac(x) })); need(fs.length >= 1 && fs.length <= 6, 'Give 1 to 6 fractions');
    let out = '', svg = ''; const pie = (cx, cy, r, num, den) => { let g = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="#333"/>`; for (let k = 0; k < den; k++) { const a0 = -PI / 2 + 2 * PI * k / den, a1 = -PI / 2 + 2 * PI * (k + 1) / den, on = k < num; g += `<path d="M${cx} ${cy}L${(cx + r * Math.cos(a0)).toFixed(2)} ${(cy + r * Math.sin(a0)).toFixed(2)}A${r} ${r} 0 0 1 ${(cx + r * Math.cos(a1)).toFixed(2)} ${(cy + r * Math.sin(a1)).toFixed(2)}Z" fill="${on ? '#1f77b4' : '#fff'}" stroke="#333"/>`; } return g; };
    fs.forEach(({ s, v }, i) => { const [n, d0] = v; need(d0 <= 24, 'Denominators up to 24'); need(Math.abs(n) / d0 <= 4, 'Values up to 4'); const g = gcdBI(BigInt(Math.abs(n)), BigInt(d0)) || 1n, sn = n / Number(g), sd = d0 / Number(g), whole = Math.floor(Math.abs(n) / d0), rem = Math.abs(n) % d0; const y = 10 + i * 150;
      let x = 70; for (let p = 0; p < whole; p++) { svg += pie(x, y + 60, 55, d0, d0); x += 120; } if (rem || !whole) { svg += pie(x, y + 60, 55, rem, d0); x += 120; }
      const bw = 300 / d0; for (let k = 0; k < d0; k++) svg += `<rect x="${x + k * bw}" y="${y + 40}" width="${bw}" height="40" fill="${k < Math.min(Math.abs(n), d0) ? '#1f77b4' : '#fff'}" stroke="#333"/>`; svg += `<text x="${x}" y="${y + 100}" font-size="13" fill="#111">${esc(s)}${n < 0 ? ' (negative: drawn as its size)' : ''}</text>`;
      out += `${s} = ${n}/${d0}${sd !== d0 ? ` = ${sn}/${sd} in lowest terms` : ''}${Math.abs(n) > d0 ? ` = ${n < 0 ? '-' : ''}${whole} ${rem}/${d0} as a mixed number` : ''} = ${fmt(n / d0, 10)}\n`; });
    if (fs.length === 2) { const [a, b] = [fs[0].v, fs[1].v], l = a[0] * b[1], r = b[0] * a[1]; out += `\nCompare ${fs[0].s} and ${fs[1].s}: cross-multiply ${a[0]} x ${b[1]} = ${l} and ${b[0]} x ${a[1]} = ${r}, so ${fs[0].s} is ${l === r ? 'equal to' : l > r ? 'greater than' : 'less than'} ${fs[1].s}.`; }
    return { html: doc('Fractions', svgWrap(760, 20 + fs.length * 150, svg, `Fraction models: ${fs.map((f) => f.s).join(', ')}`) + '<pre>' + esc(out) + '</pre>') };
  },
});

T.push({
  id: 'number-line-jumps', cat: LRN, title: 'Number Line Tool: Show Addition and Subtraction as Jumps',
  desc: 'Type a problem like -3 + 5 or 2 - 7 + 4 and see each step drawn as a jump on a number line from the start to the answer.',
  inputs: 1, labels: ['Problem with + and - (-3 + 5, 2 - 7 + 4, 1.5 + 2.5)'], sample: '-3 + 5',
  run: ([src]) => {
    const t = lines(src)[0] || ''; const ms = [...t.replace(/\s+/g, '').matchAll(/([+-]?)(\d+\.?\d*|\.\d+)/g)]; need(ms.length >= 2 && ms.map((m) => m[0]).join('') === t.replace(/\s+/g, ''), 'Write numbers joined by + and -, e.g. -3 + 5'); need(ms.length <= 12, 'At most 12 numbers');
    const nums = ms.map((m) => (m[1] === '-' ? -1 : 1) * parseFloat(m[2])), pos = [nums[0]]; for (let i = 1; i < nums.length; i++) pos.push(Math.round((pos[i - 1] + nums[i]) * 1e9) / 1e9);
    const lo = Math.floor(Math.min(...pos)) - 1, hi = Math.ceil(Math.max(...pos)) + 1, span = hi - lo, st = span > 40 ? 5 : span > 20 ? 2 : 1, W = 760, X = (v) => 30 + (v - lo) / span * (W - 60), y0 = 150; let g = `<line x1="20" x2="${W - 20}" y1="${y0}" y2="${y0}" stroke="#333" stroke-width="2"/>`;
    for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) g += `<line x1="${X(v)}" x2="${X(v)}" y1="${y0 - 6}" y2="${y0 + 6}" stroke="#333"/><text x="${X(v)}" y="${y0 + 24}" font-size="13" text-anchor="middle" fill="#111">${v}</text>`;
    for (let i = 1; i < pos.length; i++) { const a = X(pos[i - 1]), b = X(pos[i]), h = 40 + 14 * (i % 2), col = nums[i] >= 0 ? '#1f77b4' : '#d62728'; g += `<path d="M${a} ${y0}Q${(a + b) / 2} ${y0 - 2 * h} ${b} ${y0}" fill="none" stroke="${col}" stroke-width="2.5"/><text x="${(a + b) / 2}" y="${y0 - h - 6}" font-size="14" text-anchor="middle" fill="${col}">${nums[i] >= 0 ? '+' : '-'}${fmt(Math.abs(nums[i]))}</text>`; }
    g += `<circle cx="${X(pos[0])}" cy="${y0}" r="5" fill="#2ca02c"/><circle cx="${X(pos[pos.length - 1])}" cy="${y0}" r="5" fill="#000"/>`;
    return { html: doc('Number line', svgWrap(W, 200, g, `Number line: start at ${fmt(pos[0])}, ${nums.slice(1).map((n, i) => `${n >= 0 ? 'jump right' : 'jump left'} ${fmt(Math.abs(n))} to ${fmt(pos[i + 1])}`).join(', ')}; answer ${fmt(pos[pos.length - 1])}`) + '<pre>' + esc(`Start at ${fmt(pos[0])} (green dot).\n` + nums.slice(1).map((n, i) => `${n >= 0 ? 'Jump right' : 'Jump left'} ${fmt(Math.abs(n))}: ${fmt(pos[i])} -> ${fmt(pos[i + 1])}`).join('\n') + `\nAnswer: ${t} = ${fmt(pos[pos.length - 1])} (black dot)`) + '</pre>') };
  },
});

// ---------- guitar / ukulele chords ----------
const PCN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHQ = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 9: [0, 4, 7, 10, 2], add9: [0, 4, 7, 2], 5: [0, 7] };
const QALIAS = { min: 'm', '-': 'm', maj: '', M: '', M7: 'maj7', Maj7: 'maj7', '△7': 'maj7', o: 'dim', o7: 'dim7', '+': 'aug', 'ø': 'm7b5', min7: 'm7', '-7': 'm7', dom7: '7' };
const INSTR = { guitar: { n: 'Guitar (EADGBE)', t: [40, 45, 50, 55, 59, 64], bass: true }, ukulele: { n: 'Ukulele (GCEA)', t: [67, 60, 64, 69], bass: false } };
function fingerings(root, tones, ins) {
  const T0 = ins.t, req = new Set(tones.map((x) => x % 12)), pcs = new Set(req); const optional = tones.length >= 4 && !ins.bass ? [] : tones.length >= 4 ? [tones[2] % 12] : []; // fifth may be omitted on guitar 4+ note chords
  const must = new Set([...req].filter((p) => !optional.includes(p) || tones.length <= 3)); const res = [];
  for (let base = 0; base <= 9; base++) {
    const frets = base === 0 ? [0, 1, 2, 3, 4] : [0, base, base + 1, base + 2, base + 3];
    const rec = (i, cur) => {
      if (i === T0.length) { const played = cur.map((f, s) => (f == null ? null : T0[s] + f)); const pl = played.filter((x) => x != null); if (pl.length < (ins.bass ? (tones.length === 2 ? 3 : 4) : 4)) return; const first = cur.findIndex((f) => f != null), last = cur.length - 1 - [...cur].reverse().findIndex((f) => f != null); if (cur.slice(first, last + 1).some((f) => f == null)) return;
        const got = new Set(pl.map((m) => m % 12)); for (const p of must) if (!got.has(p)) return; if (ins.bass && played[first] % 12 !== root) return;
        const fr = cur.filter((f) => f != null && f > 0); if (!fr.length && base > 0) return; const mn = Math.min(...fr, 99), mx = Math.max(...fr, 0); if (fr.length && mx - mn > 3) return; if (base > 0 && mn !== base && mx - 0 && mn > base + 0 && false) return;
        if (mn > 2 && cur.some((f) => f === 0)) return; const atMin = fr.filter((f) => f === mn).length, fingers = fr.length - (atMin >= 2 ? atMin - 1 : 0); if (fingers > 4) return; const lowest = fr.length ? mn : 0; res.push({ cur: [...cur], fingers, base: lowest, score: fingers * 2 + lowest * 0.35 + (T0.length - pl.length) * 0.6 + (atMin >= 2 ? 1 : 0) }); return; }
      for (const f of [null, ...frets]) { if (f != null && !pcs.has((T0[i] + f) % 12)) continue; if (f == null && !ins.bass) continue; cur.push(f); rec(i + 1, cur); cur.pop(); }
    };
    rec(0, []);
  }
  const best = new Map(); res.sort((a, b) => a.score - b.score); for (const r of res) { const k = r.cur.join(','); if (!best.has(k)) best.set(k, r); }
  const out = [], bases = new Set(); for (const r of best.values()) { const b = Math.floor(r.base / 3); if (bases.has(b)) continue; bases.add(b); out.push(r); if (out.length === 4) break; } return out;
}
T.push({
  id: 'chord-finder-guitar-ukulele', cat: LRN, title: 'Guitar and Ukulele Chord Finder with Fingering Diagrams',
  desc: 'Type chord names such as Am7, F#m or Bb and get several fingering diagrams computed from the notes of the chord for guitar or ukulele.',
  inputs: 1, labels: ['Chords separated by commas or spaces (C, Am7, F#m, Bbmaj7, Dsus4, E7)'], sample: 'C, Am7, F#m, G7',
  opts: [{ id: 'ins', label: 'Instrument', type: 'select', choices: ['guitar', 'ukulele'], def: 'guitar' }],
  run: ([src], o) => {
    const ins = INSTR[o.ins]; const names = src.split(/[,;\s]+/).filter(Boolean).slice(0, 12); need(names.length, 'Enter at least one chord'); let svg = '', txt = '';
    for (const nm of names) {
      const m = /^([A-G])([#b♯♭]?)(.*)$/.exec(nm); need(m, `"${nm}" is not a chord name`); const root = ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (/[#♯]/.test(m[2]) ? 1 : /[b♭]/.test(m[2]) ? -1 : 0) + 12) % 12; let q = m[3]; if (q in QALIAS) q = QALIAS[q]; need(q in CHQ, `Chord type "${m[3]}" is not supported (supported: ${Object.keys(CHQ).map((k) => k || 'major').join(', ')})`);
      const tones = CHQ[q].map((i) => (root + i) % 12), fs = fingerings(root, tones, ins); txt += `${nm}: notes ${tones.map((p) => PCN[p]).join(' ')}; ${fs.length ? fs.length + ' fingering' + (fs.length > 1 ? 's' : '') : 'no fingering found within a 4-fret span'}\n`;
      let x = 10; const ns = ins.t.length, sp = 18, fh = 22, w = (ns - 1) * sp + 40;
      for (const f of fs) { const b = f.base > 2 ? f.base : 1; let g = `<text x="${w / 2}" y="14" font-size="13" text-anchor="middle" fill="#111">${esc(nm)}</text>`; for (let s = 0; s < ns; s++) g += `<line x1="${20 + s * sp}" x2="${20 + s * sp}" y1="40" y2="${40 + 4 * fh}" stroke="#333"/>`; for (let k = 0; k <= 4; k++) g += `<line x1="20" x2="${20 + (ns - 1) * sp}" y1="${40 + k * fh}" y2="${40 + k * fh}" stroke="#333" stroke-width="${k === 0 && b === 1 ? 4 : 1}"/>`; if (b > 1) g += `<text x="2" y="${40 + fh * 0.7}" font-size="11" fill="#111">${b}fr</text>`;
        f.cur.forEach((fr, s) => { const cx = 20 + s * sp; if (fr == null) g += `<text x="${cx}" y="34" font-size="12" text-anchor="middle" fill="#111">x</text>`; else if (fr === 0) g += `<circle cx="${cx}" cy="30" r="4" fill="none" stroke="#111"/>`; else g += `<circle cx="${cx}" cy="${40 + (fr - b + 0.5) * fh}" r="7" fill="#1f77b4"/>`; });
        const nn = f.cur.map((fr, s) => (fr == null ? 'muted' : PCN[(ins.t[s] + fr) % 12])).join(' '); svg += `<g transform="translate(${x},${0})" role="img" aria-label="${esc(`${nm} chord, ${ins.n}: frets ${f.cur.map((fr) => (fr == null ? 'x' : fr)).join(' ')}`)}">${g}</g>`; txt += `    frets ${f.cur.map((fr) => (fr == null ? 'x' : fr)).join(' ')}  (strings low to high; notes ${nn}; ${f.fingers} finger${f.fingers > 1 ? 's' : ''})\n`; x += w + 14; }
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(x, 100)}" height="160" viewBox="0 0 ${Math.max(x, 100)} 160" role="group" aria-label="${esc(nm + ' chord diagrams')}" style="background:#fff;margin:4px 0;max-width:100%">${svg}</svg>`; if (fs.length === 0) svg = '';
      svg += '<br>';
    }
    return { html: doc('Chords', svg + '<pre>' + esc(txt + `\nFingerings are generated by searching the fretboard (${ins.n}) for playable shapes inside a 4-fret window that contain every chord tone${ins.bass ? ', start on the root and may omit the fifth in 4-note chords' : ''}. They are playable suggestions, not the only or the "standard" shapes; fret 0 is an open string, x is muted. Sound is not played here.`) + '</pre>') };
  },
});

// ---------- handwriting sheet ----------
T.push({
  id: 'handwriting-practice-sheet-maker', cat: LRN, title: 'Handwriting Tracing Worksheet Maker (Dotted Letters, Printable)',
  desc: 'Type letters, words or sentences and print a worksheet with dotted tracing text on guide lines, followed by blank practice lines.',
  inputs: 1, labels: ['Text to trace, one line per row'], sample: 'Aa Bb Cc\nthe quick brown fox',
  opts: [{ id: 'font', label: 'Letter style', type: 'select', choices: ['sans-serif', 'serif', 'monospace'], def: 'sans-serif' }, { id: 'size', label: 'Letter height (px, 30-100)', type: 'number', def: 56 }, { id: 'blank', label: 'Blank practice rows after each line (0-3)', type: 'number', def: 1 }],
  run: ([src], o) => {
    const ls = lines(src).slice(0, 14); need(ls.length, 'Enter some text'); const sz = numOpt(o.size, 'Size', 30, 100), bl = Math.round(numOpt(o.blank, 'Blank rows', 0, 3)), rowH = sz * 2, W = 720;
    const row = (txt, y) => `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="#888"/><line x1="0" x2="${W}" y1="${y - sz * 0.72}" y2="${y - sz * 0.72}" stroke="#bbb" stroke-dasharray="6 4"/><line x1="0" x2="${W}" y1="${y - sz * 1.4}" y2="${y - sz * 1.4}" stroke="#ddd"/>` + (txt ? `<text x="6" y="${y}" font-family="${o.font}" font-size="${sz * 1.4}" fill="none" stroke="#666" stroke-width="1.2" stroke-dasharray="1.5 3.5" stroke-linecap="round" textLength="${Math.min(W - 12, txt.length * sz * 0.8)}" lengthAdjust="spacing">${esc(txt)}</text>` : '');
    const per = ls.length * (1 + bl), h = per * rowH + 20; let g = '', y = sz * 1.5; for (const l of ls) { g += row(l, y); y += rowH; for (let k = 0; k < bl; k++) { g += row('', y); y += rowH; } }
    return { html: doc('Tracing sheet', `<div class="sheet">${svgWrap(W, h, g, `Handwriting worksheet with ${ls.length} tracing rows: ${ls.join(' / ')}`)}</div>`, 'svg{max-width:100%}') };
  },
});

// ---------- word search ----------
const DIRS = { easy: [[0, 1], [1, 0]], medium: [[0, 1], [1, 0], [1, 1], [-1, 1]], hard: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]] };
function buildWordSearch(words, n, level, rnd) {
  const g = Array.from({ length: n }, () => Array(n).fill('')), where = [];
  for (const w of [...words].sort((a, b) => b.length - a.length)) {
    let ok = false;
    for (let t = 0; t < 400 && !ok; t++) { const [dr, dc] = DIRS[level][Math.floor(rnd() * DIRS[level].length)], r = Math.floor(rnd() * n), c = Math.floor(rnd() * n), er = r + dr * (w.length - 1), ec = c + dc * (w.length - 1); if (er < 0 || er >= n || ec < 0 || ec >= n) continue; let fit = true; for (let i = 0; i < w.length; i++) { const v = g[r + dr * i][c + dc * i]; if (v && v !== w[i]) { fit = false; break; } } if (!fit) continue; for (let i = 0; i < w.length; i++) g[r + dr * i][c + dc * i] = w[i]; where.push({ w, r, c, dr, dc }); ok = true; }
    need(ok, `Could not fit "${w}": use a larger grid or fewer words`);
  }
  const sol = g.map((r) => r.map((v) => !!v)); for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!g[r][c]) g[r][c] = String.fromCharCode(65 + Math.floor(rnd() * 26));
  return { g, sol, where };
}
T.push({
  id: 'word-search-puzzle-maker', cat: LRN, title: 'Word Search Puzzle Maker with Answer Key',
  desc: 'Hide your word list in a letter grid in the directions you choose and print the puzzle with a word list and a marked answer key.',
  inputs: 1, labels: ['Words, one per line or comma separated (letters only)'], sample: 'planet\nmoon\nstar\ncomet\ngalaxy\norbit\nasteroid\nnebula',
  opts: [{ id: 'size', label: 'Grid size (8-30)', type: 'number', def: 12 }, { id: 'level', label: 'Directions', type: 'select', choices: ['easy', 'medium', 'hard'], def: 'medium' }, { id: 'seed', label: 'Seed', type: 'text', def: '1' }],
  run: ([src], o) => {
    const n = Math.round(numOpt(o.size, 'Size', 8, 30)), words = [...new Set(src.split(/[\n,;]+/).map((w) => w.trim().toUpperCase().replace(/[^A-Z]/g, '')).filter(Boolean))]; need(words.length >= 1 && words.length <= 40, 'Give 1 to 40 words'); need(words.every((w) => w.length >= 3 && w.length <= n), `Words must have 3 to ${n} letters (accents and spaces are removed)`);
    const { g, sol, where } = buildWordSearch(words, n, o.level, seeded(o.seed));
    for (const { w, r, c, dr, dc } of where) for (let i = 0; i < w.length; i++) need(g[r + dr * i][c + dc * i] === w[i], 'internal check failed');
    const tbl = (mark) => `<table style="font:bold 18px monospace;border:0">${g.map((r, y) => `<tr>${r.map((v, x) => `<td style="width:26px;height:26px;text-align:center;padding:0;border:0;${mark && sol[y][x] ? 'background:#ffe08a' : ''}">${v}</td>`).join('')}</tr>`).join('')}</table>`;
    const lst = `<p><b>Words to find (${words.length}):</b> ${words.map(esc).join(' &middot; ')}</p>`;
    return { html: doc('Word search', `<div class="sheet"><h1>Word search</h1>${tbl(false)}${lst}</div><div class="sheet"><h1>Answer key</h1>${tbl(true)}${lst}</div>`) };
  },
});

// ---------- crossword ----------
function buildCrossword(items, rnd) {
  let best = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const order = attempt === 0 ? [...items].sort((a, b) => b.w.length - a.w.length) : shuf(items, rnd).sort((a, b) => (b.w.length - a.w.length) * (rnd() < 0.5 ? 1 : 0.2)); const cells = new Map(), dirs = new Map(), placed = [], key = (r, c) => r + ',' + c;
    const fits = (w, r, c, d) => { const dr = d === 'down' ? 1 : 0, dc = 1 - dr; if (cells.has(key(r - dr, c - dc)) || cells.has(key(r + dr * w.length, c + dc * w.length))) return -1; let cross = 0; for (let i = 0; i < w.length; i++) { const rr = r + dr * i, cc = c + dc * i, ex = cells.get(key(rr, cc)); if (ex) { if (ex !== w[i] || dirs.get(key(rr, cc)).has(d)) return -1; cross++; } else if (cells.has(key(rr + dc, cc + dr)) || cells.has(key(rr - dc, cc - dr))) return -1; } return cross; };
    const put = (it, r, c, d) => { const dr = d === 'down' ? 1 : 0, dc = 1 - dr; for (let i = 0; i < it.w.length; i++) { const k = key(r + dr * i, c + dc * i); cells.set(k, it.w[i]); if (!dirs.has(k)) dirs.set(k, new Set()); dirs.get(k).add(d); } placed.push({ ...it, r, c, d }); };
    put(order[0], 0, 0, 'across'); let rest = order.slice(1);
    for (let pass = 0; pass < 2; pass++) { const left = []; for (const it of rest) { let bestP = null; for (const p of placed) for (let i = 0; i < p.w.length; i++) for (let j = 0; j < it.w.length; j++) { if (p.w[i] !== it.w[j]) continue; const d = p.d === 'across' ? 'down' : 'across', r = p.d === 'across' ? p.r - j : p.r + i, c = p.d === 'across' ? p.c + i : p.c - j, x = fits(it.w, r, c, d); if (x >= 1) { const rs = [...cells.keys()].map((k) => +k.split(',')[0]).concat([r, r + (d === 'down' ? it.w.length : 1)]), cs = [...cells.keys()].map((k) => +k.split(',')[1]).concat([c, c + (d === 'across' ? it.w.length : 1)]); const area = (Math.max(...rs) - Math.min(...rs)) * (Math.max(...cs) - Math.min(...cs)), sc = x * 1000 - area; if (!bestP || sc > bestP.sc) bestP = { r, c, d, sc }; } } if (bestP) put(it, bestP.r, bestP.c, bestP.d); else left.push(it); } rest = left; }
    const rs = [...cells.keys()].map((k) => +k.split(',')[0]), cs = [...cells.keys()].map((k) => +k.split(',')[1]), area = (Math.max(...rs) - Math.min(...rs) + 1) * (Math.max(...cs) - Math.min(...cs) + 1);
    if (!best || placed.length > best.placed.length || (placed.length === best.placed.length && area < best.area)) best = { placed, cells, area, left: rest };
  }
  return best;
}
T.push({
  id: 'crossword-puzzle-maker', cat: LRN, title: 'Crossword Puzzle Maker from Words and Clues',
  desc: 'Enter answer words with clues and get an interlocking crossword grid with numbered across and down clue lists and an answer grid.',
  inputs: 1, labels: ['One per line: ANSWER: clue'], sample: 'planet: Earth is one\nmoon: Natural satellite\nstar: The Sun is one\ncomet: Icy visitor with a tail\norbit: Path around a body\ngalaxy: The Milky Way is one\nsolar: Relating to the Sun',
  opts: [{ id: 'seed', label: 'Seed (try another for a different layout)', type: 'text', def: '1' }],
  run: ([src], o) => {
    const items = lines(src).map((l) => { const i = l.indexOf(':'); need(i > 0, `Line "${l.slice(0, 30)}": write ANSWER: clue`); const w = l.slice(0, i).toUpperCase().replace(/[^A-Z]/g, ''), clue = l.slice(i + 1).trim(); need(w.length >= 2 && w.length <= 20, `"${l.slice(0, i)}": answers need 2 to 20 letters`); need(clue, `"${l.slice(0, i)}" has no clue`); return { w, clue }; }); need(items.length >= 2 && items.length <= 40, 'Give 2 to 40 words'); need(new Set(items.map((x) => x.w)).size === items.length, 'Each answer must be different');
    const cw = buildCrossword(items, seeded(o.seed)); const rs = [...cw.cells.keys()].map((k) => +k.split(',')[0]), cs = [...cw.cells.keys()].map((k) => +k.split(',')[1]), r0 = Math.min(...rs), c0 = Math.min(...cs), R = Math.max(...rs) - r0 + 1, C = Math.max(...cs) - c0 + 1;
    const grid = Array.from({ length: R }, () => Array(C).fill('')); for (const [k, v] of cw.cells) { const [r, c] = k.split(',').map(Number); grid[r - r0][c - c0] = v; }
    const wordAt = new Map(cw.placed.map((p) => [`${p.r - r0},${p.c - c0},${p.d}`, p])); const num = Array.from({ length: R }, () => Array(C).fill(0)); let n = 0; const across = [], down = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { if (!grid[r][c]) continue; const a = wordAt.get(`${r},${c},across`), d = wordAt.get(`${r},${c},down`); if (a || d) { n++; num[r][c] = n; if (a) across.push([n, a]); if (d) down.push([n, d]); } }
    // self-check: every run of 2+ letters is a placed word
    for (let r = 0; r < R; r++) { let run = ''; for (let c = 0; c <= C; c++) { const v = c < C ? grid[r][c] : ''; if (v) run += v; else { if (run.length > 1) need(cw.placed.some((p) => p.w === run && p.d === 'across' && p.r - r0 === r), 'internal check failed'); run = ''; } } }
    for (let c = 0; c < C; c++) { let run = ''; for (let r = 0; r <= R; r++) { const v = r < R ? grid[r][c] : ''; if (v) run += v; else { if (run.length > 1) need(cw.placed.some((p) => p.w === run && p.d === 'down' && p.c - c0 === c), 'internal check failed'); run = ''; } } }
    const tbl = (ans) => `<table style="border-collapse:collapse">${grid.map((row, r) => `<tr>${row.map((v, c) => (v ? `<td style="width:30px;height:30px;border:1px solid #000;position:relative;padding:0;text-align:center;font:bold 16px monospace">${num[r][c] ? `<span style="position:absolute;left:2px;top:0;font:9px sans-serif">${num[r][c]}</span>` : ''}${ans ? v : ''}</td>` : '<td style="width:30px;height:30px;border:0;background:#222"></td>')).join('')}</tr>`).join('')}</table>`;
    const cl = (title, arr) => `<h2>${title}</h2><ol style="list-style:none;padding:0">${arr.map(([k, p]) => `<li>${k}. ${esc(p.clue)} (${p.w.length})</li>`).join('')}</ol>`;
    return { html: doc('Crossword', `<div class="sheet"><h1>Crossword</h1>${tbl(false)}${cl('Across', across)}${cl('Down', down)}${cw.left.length ? `<p>Not placed (no shared letters fit): ${cw.left.map((x) => esc(x.w)).join(', ')}. Add a word that shares letters, or change the seed.</p>` : ''}</div><div class="sheet"><h1>Answers</h1>${tbl(true)}</div>`) };
  },
});

// ---------- classroom seating chart ----------
T.push({
  id: 'classroom-seating-chart-generator', cat: LRN, title: 'Classroom Seating Chart Generator (Random, Printable)',
  desc: 'Paste a class list, set the number of desk rows and columns, and get a shuffled seating plan with optional aisles, ready to print.',
  inputs: 1, labels: ['Student names, one per line. Start a name with ! to seat that student in the front row.'], sample: 'Amira\nBen\nChloe\n!Dev\nElena\nFarid\nGrace\nHiro\nIvy\nJonas\nKira\nLeo',
  opts: [{ id: 'cols', label: 'Desks per row', type: 'number', def: 4 }, { id: 'aisle', label: 'Aisle after every N desks (0 = none)', type: 'number', def: 2 }, { id: 'seed', label: 'Seed (change for a new shuffle)', type: 'text', def: '1' }],
  run: ([src], o) => {
    const names = lines(src); need(names.length >= 1 && names.length <= 120, 'Give 1 to 120 names'); const cols = Math.round(numOpt(o.cols, 'Desks per row', 1, 12)), aisle = Math.round(numOpt(o.aisle, 'Aisle', 0, 12)), rows = Math.ceil(names.length / cols), rnd = seeded(o.seed);
    const front = shuf(names.filter((x) => x.startsWith('!')).map((x) => x.slice(1).trim()), rnd), others = shuf(names.filter((x) => !x.startsWith('!')), rnd); const order = [...front, ...others]; need(front.length <= cols, 'More front-row students than desks in the front row');
    const seats = Array(rows * cols).fill(''); // front row first; empty desks at the back row
    const slots = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) slots.push([r, c]); const frontSlots = slots.slice(0, front.length), restSlots = shuf(slots.slice(front.length), rnd).slice(0, others.length); [...frontSlots, ...restSlots].forEach(([r, c], i) => { seats[r * cols + c] = order[i]; });
    const t = `<table style="border-collapse:separate;border-spacing:6px"><tr><td colspan="${cols + (aisle ? Math.floor((cols - 1) / aisle) : 0)}" style="text-align:center;background:#222;color:#fff;border:0">FRONT OF CLASS</td></tr>${Array.from({ length: rows }, (_, r) => `<tr>${Array.from({ length: cols }, (_, c) => `${aisle && c && c % aisle === 0 ? '<td style="border:0;width:22px"></td>' : ''}<td style="min-width:90px;height:44px;text-align:center;border:1px solid #444;border-radius:4px;${seats[r * cols + c] ? '' : 'border-style:dashed;color:#999'}">${esc(seats[r * cols + c] || 'empty')}</td>`).join('')}</tr>`).join('')}</table>`;
    return { html: doc('Seating chart', `<div class="sheet"><h1>Seating chart</h1>${t}</div>`) };
  },
});

// =====================================================================
// Interactive tools (custom render). Controls are real buttons/inputs with names; state text is in role="status".
// =====================================================================
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'style') e.style.cssText = v; else if (k in e && k !== 'list') e[k] = v; else e.setAttribute(k, v); }
  e.append(...kids.flat().filter((x) => x != null)); return e;
};
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } } };
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const every = (root, fn, ms) => { const id = setInterval(() => { if (!root.isConnected) clearInterval(id); else fn(); }, ms); return id; };
let AC = null; const audioCtx = () => { const C = window.AudioContext || window.webkitAudioContext; if (!C) throw new Error('Web Audio is not available in this browser'); return (AC ||= new C()); };
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12); // equal temperament, A4 = 440 Hz
function playTone(hz, when, dur, type = 'sine', vol = 0.18) { const a = audioCtx(), o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + when; o.type = type; o.frequency.value = hz; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.05); }
const field = (label, input) => el('label', { style: 'display:inline-block;margin:.2rem 1rem .2rem 0' }, label + ' ', input);
const note = (txt) => el('p', { style: 'font-size:.85rem;opacity:.8;margin:.8rem 0 0' }, txt);

// ---------- multiplication trainer ----------
T.push({
  id: 'multiplication-table-trainer', cat: LRN, title: 'Multiplication Table Trainer with Timed Drills',
  desc: 'Practise chosen times tables in random order with an optional time limit, then see your score and the facts you missed most.',
  custom: true, render: (root) => {
    const chk = []; const tb = el('fieldset', {}, el('legend', {}, 'Tables to practise')); for (let n = 2; n <= 12; n++) { const c = el('input', { type: 'checkbox', checked: n <= 5, value: n }); chk.push(c); tb.append(el('label', { style: 'margin-right:.8rem' }, c, ' ' + n)); }
    const lim = el('select', {}, ...[['0', 'No time limit'], ['30', '30 seconds'], ['60', '1 minute'], ['120', '2 minutes']].map(([v, t]) => el('option', { value: v }, t))), cnt = el('input', { type: 'number', min: 5, max: 100, value: 20, style: 'width:5rem' });
    const start = el('button', { type: 'button' }, 'Start drill'), box = el('div'), status = el('p', { role: 'status' }), timer = el('p', { 'aria-hidden': 'true', style: 'font-size:1.4rem' });
    let st = null, tick = null;
    const finish = () => { clearInterval(tick); const misses = Object.entries(st.miss).sort((a, b) => b[1] - a[1]); box.replaceChildren(); status.textContent = `Finished: ${st.right} correct out of ${st.done} answered in ${Math.round((Date.now() - st.t0) / 1000)} seconds.` + (misses.length ? ' Missed most: ' + misses.slice(0, 5).map(([k, v]) => `${k} (${v}x)`).join(', ') + '.' : ' No mistakes.'); timer.textContent = ''; start.disabled = false; };
    const ask = () => { if (st.done >= st.total) return finish(); const pool = st.tables, a = pool[Math.floor(Math.random() * pool.length)], b = 1 + Math.floor(Math.random() * 12); st.cur = [a, b]; const inp = el('input', { type: 'number', inputMode: 'numeric', 'aria-label': `${a} times ${b} equals`, style: 'width:6rem;font-size:1.4rem' }), go = el('button', { type: 'button' }, 'Answer'); const submit = () => { if (inp.value === '') return; const ok = Number(inp.value) === a * b; st.done++; if (ok) st.right++; else { const k = `${a}x${b}=${a * b}`; st.miss[k] = (st.miss[k] || 0) + 1; } status.textContent = ok ? `Correct. ${st.done} of ${st.total}.` : `Not quite: ${a} x ${b} = ${a * b}. ${st.done} of ${st.total}.`; ask(); }; inp.addEventListener('keydown', (e) => e.key === 'Enter' && submit()); go.addEventListener('click', submit); box.replaceChildren(el('p', { style: 'font-size:1.6rem' }, `${a} × ${b} = `, inp), go); inp.focus(); };
    start.addEventListener('click', () => { const tables = chk.filter((c) => c.checked).map((c) => +c.value); if (!tables.length) { status.textContent = 'Choose at least one table.'; return; } const total = Math.max(5, Math.min(100, +cnt.value || 20)); st = { tables, total, done: 0, right: 0, miss: {}, t0: Date.now() }; start.disabled = true; const limit = +lim.value; if (limit) { timer.textContent = `Time left: ${limit}s`; tick = every(root, () => { const left = limit - Math.round((Date.now() - st.t0) / 1000); timer.textContent = `Time left: ${Math.max(0, left)}s`; if (left <= 0) finish(); }, 500); } else timer.textContent = ''; status.textContent = ''; ask(); });
    root.append(tb, field('Time limit', lim), field('Questions', cnt), start, timer, box, status, note('Questions are random from 1 to 12 times the tables you picked. Nothing is stored or sent.'));
  },
});

// ---------- ear trainer ----------
const IVL = [['minor 2nd', 1], ['major 2nd', 2], ['minor 3rd', 3], ['major 3rd', 4], ['perfect 4th', 5], ['tritone', 6], ['perfect 5th', 7], ['minor 6th', 8], ['major 6th', 9], ['minor 7th', 10], ['major 7th', 11], ['octave', 12]];
const CHD = [['major', [0, 4, 7]], ['minor', [0, 3, 7]], ['diminished', [0, 3, 6]], ['augmented', [0, 4, 8]], ['dominant 7th', [0, 4, 7, 10]], ['major 7th', [0, 4, 7, 11]], ['minor 7th', [0, 3, 7, 10]]];
const SCL = [['major', [0, 2, 4, 5, 7, 9, 11, 12]], ['natural minor', [0, 2, 3, 5, 7, 8, 10, 12]], ['harmonic minor', [0, 2, 3, 5, 7, 8, 11, 12]], ['dorian', [0, 2, 3, 5, 7, 9, 10, 12]], ['mixolydian', [0, 2, 4, 5, 7, 9, 10, 12]], ['major pentatonic', [0, 2, 4, 7, 9, 12]]];
T.push({
  id: 'ear-training-intervals-chords-scales', cat: LRN, title: 'Ear Training: Identify Intervals, Chords and Scales by Ear',
  desc: 'Listen to an interval, chord or scale and pick its name; the trainer tracks your accuracy for each type.',
  custom: true, render: (root) => {
    const mode = el('select', {}, ...['intervals', 'chords', 'scales'].map((m) => el('option', { value: m }, m))), sty = el('select', {}, ...['melodic (one after the other)', 'harmonic (together)'].map((m, i) => el('option', { value: i }, m))), wave = el('select', {}, ...['triangle', 'sine', 'square'].map((m) => el('option', {}, m)));
    const play = el('button', { type: 'button' }, 'Play a new sound'), again = el('button', { type: 'button', disabled: true }, 'Hear it again'), opts = el('div', { role: 'group', 'aria-label': 'Answer choices' }), fb = el('p', { role: 'status' }), stats = el('pre', { 'aria-label': 'Accuracy by type' });
    const S = store.get('ft-ear', {}); let cur = null;
    const data = () => (mode.value === 'intervals' ? IVL.map(([n, s]) => [n, [0, s]]) : mode.value === 'chords' ? CHD : SCL);
    const sound = () => { const root0 = cur.root, t = wave.value, d = cur.d; if (cur.kind === 'scales' || (cur.kind === 'intervals' && sty.value === '0')) d[1].forEach((s, i) => playTone(midiHz(root0 + s), i * 0.5, 0.45, t)); else d[1].forEach((s) => playTone(midiHz(root0 + s), 0, 1.4, t, 0.12)); };
    const show = () => { const lines = Object.entries(S).map(([k, v]) => `${k}: ${v[0]} of ${v[1]} (${Math.round(100 * v[0] / v[1])}%)`); stats.textContent = lines.length ? 'Your accuracy (saved in this browser if storage is allowed):\n' + lines.join('\n') : 'No answers yet.'; };
    const next = () => { try { const ds = data(), d = ds[Math.floor(Math.random() * ds.length)]; cur = { d, root: 48 + Math.floor(Math.random() * 13), kind: mode.value, done: false }; sound(); again.disabled = false; fb.textContent = 'Listening. Pick the answer.'; opts.replaceChildren(...ds.map(([n]) => el('button', { type: 'button', onclick: () => { if (cur.done) return; cur.done = true; const ok = n === d[0]; const key = `${mode.value} / ${d[0]}`; S[key] = S[key] || [0, 0]; S[key][1]++; if (ok) S[key][0]++; store.set('ft-ear', S); fb.textContent = ok ? `Correct: ${d[0]}.` : `Not quite. It was ${d[0]}, you chose ${n}.`; show(); } }, n))); } catch (e) { fb.textContent = e.message; fb.setAttribute('role', 'alert'); } };
    play.addEventListener('click', next); again.addEventListener('click', () => { try { sound(); } catch (e) { fb.textContent = e.message; } }); mode.addEventListener('change', () => { opts.replaceChildren(); cur = null; again.disabled = true; fb.textContent = ''; });
    root.append(field('Practise', mode), field('Interval style', sty), field('Sound', wave), el('div', {}, play, again), opts, fb, stats, note('Notes are equal-tempered, A4 = 440 Hz, starting on a random note. Needs sound on. Results are kept per type in this browser only; if storage is blocked the trainer still works for the session.')); show();
  },
});

// ---------- sight reading ----------
T.push({
  id: 'sight-reading-note-trainer', cat: LRN, title: 'Sight Reading Trainer: Name the Note on the Staff',
  desc: 'Notes appear on a treble or bass staff and you name them by button or letter key, with timing and an error summary.',
  custom: true, render: (root) => {
    const clef = el('select', {}, el('option', { value: 'treble' }, 'treble clef'), el('option', { value: 'bass' }, 'bass clef')), lim = el('select', {}, ...[['0', 'no time limit'], ['6', '6 s per note'], ['3', '3 s per note']].map(([v, t]) => el('option', { value: v }, t))), start = el('button', { type: 'button' }, 'Start 20 notes');
    const svgBox = el('div'), btns = el('div', { role: 'group', 'aria-label': 'Note names' }), fb = el('p', { role: 'status' }); let st = null, timer = null;
    const NS = 'http://www.w3.org/2000/svg', ns = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const bottom = () => (clef.value === 'treble' ? 30 : 18), letter = (s) => 'CDEFGAB'[(bottom() + s) % 7];
    const draw = (s) => { const svg = ns('svg', { viewBox: '0 0 240 150', width: 240, height: 150, role: 'img', 'aria-label': `A note on the ${clef.value} staff. Answer with its letter.` }); svg.style.cssText = 'background:#fff;border:1px solid #888;max-width:100%'; for (let i = 0; i < 5; i++) svg.append(ns('line', { x1: 20, x2: 220, y1: 40 + i * 12, y2: 40 + i * 12, stroke: '#111' })); const y = 88 - s * 6; if (s <= -2) for (let k = -2; k >= s; k -= 2) svg.append(ns('line', { x1: 100, x2: 140, y1: 88 - k * 6, y2: 88 - k * 6, stroke: '#111' })); if (s >= 10) for (let k = 10; k <= s; k += 2) svg.append(ns('line', { x1: 100, x2: 140, y1: 88 - k * 6, y2: 88 - k * 6, stroke: '#111' })); const t = ns('text', { x: 24, y: 142, 'font-size': 12, fill: '#111' }); t.textContent = clef.value + ' clef'; svg.append(t, ns('ellipse', { cx: 120, cy: y, rx: 8, ry: 6, fill: '#111', transform: `rotate(-20 120 ${y})` }), ns('line', s < 4 ? { x1: 127, x2: 127, y1: y, y2: y - 34, stroke: '#111', 'stroke-width': 2 } : { x1: 113, x2: 113, y1: y, y2: y + 34, stroke: '#111', 'stroke-width': 2 })); svgBox.replaceChildren(svg); };
    const nextNote = () => { clearTimeout(timer); if (st.n >= 20) { const avg = st.times.length ? (st.times.reduce((a, b) => a + b, 0) / st.times.length / 1000).toFixed(1) : '-'; const miss = Object.entries(st.miss).map(([k, v]) => `${k} x${v}`).join(', '); fb.textContent = `Done: ${st.right} of 20 correct, average ${avg} s per answer.` + (miss ? ` Missed notes: ${miss}.` : ' No mistakes.'); svgBox.replaceChildren(); btns.replaceChildren(); start.disabled = false; st = null; return; } st.s = -2 + Math.floor(Math.random() * 13); st.t0 = Date.now(); draw(st.s); if (+lim.value) timer = setTimeout(() => answer(null), +lim.value * 1000); };
    const answer = (ltr) => { if (!st) return; clearTimeout(timer); const want = letter(st.s); st.n++; if (ltr === want) { st.right++; st.times.push(Date.now() - st.t0); fb.textContent = `Correct, ${want}. ${st.n} of 20.`; } else { st.miss[want] = (st.miss[want] || 0) + 1; fb.textContent = `${ltr ? 'Not quite' : 'Time is up'}: it was ${want}. ${st.n} of 20.`; } nextNote(); };
    btns.append(...'ABCDEFG'.split('').map((l) => el('button', { type: 'button', style: 'font-size:1.2rem;margin:.2rem;min-width:2.6rem', onclick: () => answer(l) }, l)));
    const onKey = (e) => { if (!root.isConnected) { document.removeEventListener('keydown', onKey); return; } if (st && /^[a-gA-G]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) answer(e.key.toUpperCase()); };
    document.addEventListener('keydown', onKey);
    start.addEventListener('click', () => { st = { n: 0, right: 0, miss: {}, times: [] }; start.disabled = true; fb.textContent = ''; nextNote(); });
    root.append(field('Clef', clef), field('Time', lim), start, svgBox, btns, fb, note('Range is two ledger lines below to one above the staff (treble C4 to A5, bass E2 to C4). Press the letter keys A to G or use the buttons. Nothing is stored.'));
  },
});

// ---------- virtual piano ----------
T.push({
  id: 'virtual-piano-keyboard', cat: LRN, title: 'Virtual Piano with Computer Keyboard, Octaves and Melody Recorder',
  desc: 'Play a piano with the mouse, touch or your computer keys, switch octave and sound, and record a short melody to play back.',
  custom: true, render: (root) => {
    const WK = [['a', 0], ['s', 2], ['d', 4], ['f', 5], ['g', 7], ['h', 9], ['j', 11], ['k', 12]], BK = [['w', 1], ['e', 3], ['t', 6], ['y', 8], ['u', 10]], NN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    let oct = 4, rec = null, take = [], playing = []; const wave = el('select', {}, ...['triangle', 'sine', 'square', 'sawtooth'].map((m) => el('option', {}, m))), octl = el('span', { role: 'status', style: 'margin:0 .6rem' }), fb = el('p', { role: 'status' });
    const held = new Map(), midi = (off) => 12 * (oct + 1) + off, label = (off) => { const m = midi(off); return NN[m % 12] + (Math.floor(m / 12) - 1); };
    const on = (off) => { if (held.has(off)) return; try { const a = audioCtx(), o = a.createOscillator(), g = a.createGain(); o.type = wave.value; o.frequency.value = midiHz(midi(off)); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.2, a.currentTime + 0.01); o.connect(g).connect(a.destination); o.start(); held.set(off, { o, g }); if (rec) take.push({ m: midi(off), t: performance.now() - rec }); keys.get(off)?.setAttribute('aria-pressed', 'true'); } catch (e) { fb.textContent = e.message; } };
    const off = (k) => { const h = held.get(k); if (!h) return; const a = audioCtx(); h.g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.12); h.o.stop(a.currentTime + 0.15); held.delete(k); keys.get(k)?.setAttribute('aria-pressed', 'false'); };
    const keys = new Map(), kb = el('div', { role: 'group', 'aria-label': 'Piano keys', style: 'position:relative;height:150px;width:' + WK.length * 56 + 'px;max-width:100%;overflow-x:auto;margin:.8rem 0;user-select:none;touch-action:none' });
    const mk = (offv, ch, white, left) => { const b = el('button', { type: 'button', 'aria-pressed': 'false', 'aria-label': '', style: `position:absolute;left:${left}px;top:0;width:${white ? 54 : 34}px;height:${white ? 150 : 90}px;margin:0;padding:0 0 4px;border:1px solid #222;border-radius:0 0 6px 6px;z-index:${white ? 1 : 2};background:${white ? '#fff' : '#222'};color:${white ? '#111' : '#fff'};display:flex;align-items:flex-end;justify-content:center;font-size:12px;cursor:pointer` }, ch.toUpperCase()); b.addEventListener('pointerdown', (e) => { e.preventDefault(); on(offv); }); b.addEventListener('pointerup', () => off(offv)); b.addEventListener('pointerleave', () => off(offv)); b.addEventListener('click', (e) => { if (e.detail === 0) { on(offv); setTimeout(() => off(offv), 300); } }); keys.set(offv, b); kb.append(b); return b; };
    const relabel = () => { for (const [k, b] of keys) b.setAttribute('aria-label', `${label(k)} (key ${[...WK, ...BK].find(([, o2]) => o2 === k)[0].toUpperCase()})`); octl.textContent = `Octave ${oct}`; };
    WK.forEach(([ch, o2], i) => mk(o2, ch, true, i * 56)); BK.forEach(([ch, o2]) => { const wi = WK.findIndex(([, w]) => w === o2 - 1); mk(o2, ch, false, wi * 56 + 38); });
    const down = el('button', { type: 'button', onclick: () => { oct = Math.max(1, oct - 1); relabel(); } }, 'Octave down'), up = el('button', { type: 'button', onclick: () => { oct = Math.min(7, oct + 1); relabel(); } }, 'Octave up');
    const map = new Map([...WK, ...BK].map(([c, o2]) => [c, o2])); const kd = (e) => { if (!root.isConnected) { document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku); return; } if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return; const o2 = map.get(e.key.toLowerCase()); if (o2 != null) { e.preventDefault(); on(o2); } }, ku = (e) => { const o2 = map.get(e.key.toLowerCase()); if (o2 != null) off(o2); };
    document.addEventListener('keydown', kd); document.addEventListener('keyup', ku);
    const bRec = el('button', { type: 'button' }, 'Record'), bPlay = el('button', { type: 'button' }, 'Play back'), bClr = el('button', { type: 'button' }, 'Clear recording');
    bRec.addEventListener('click', () => { if (rec) { rec = null; bRec.textContent = 'Record'; fb.textContent = `Recorded ${take.length} notes.`; } else { take = []; rec = performance.now(); bRec.textContent = 'Stop recording'; fb.textContent = 'Recording. Play some notes.'; } });
    bPlay.addEventListener('click', () => { if (!take.length) { fb.textContent = 'Nothing recorded yet.'; return; } playing.forEach(clearTimeout); playing = take.map((n) => setTimeout(() => { try { playTone(midiHz(n.m), 0, 0.5, wave.value); } catch { /* no audio */ } }, n.t)); fb.textContent = 'Playing back.'; });
    bClr.addEventListener('click', () => { take = []; playing.forEach(clearTimeout); fb.textContent = 'Recording cleared.'; });
    relabel(); root.append(el('div', {}, down, octl, up, field('Sound', wave)), kb, el('div', {}, bRec, bPlay, bClr), fb, note('Computer keys: A S D F G H J K are the white keys, W E T Y U the black keys. Equal temperament, A4 = 440 Hz. Playback of a recording is not kept after you leave the page.'));
  },
});

// ---------- clock learner ----------
T.push({
  id: 'analog-clock-reading-trainer', cat: LRN, title: 'Learn to Read an Analog Clock (Read It or Set It)',
  desc: 'Children read the time on a clock face and type it, or set the hands with sliders to match a written time, with instant feedback.',
  custom: true, render: (root) => {
    const mode = el('select', {}, el('option', { value: 'read' }, 'Read the clock and type the time'), el('option', { value: 'set' }, 'Set the hands to the time shown')), prec = el('select', {}, ...[['15', 'quarter hours'], ['5', 'five minutes'], ['1', 'every minute']].map(([v, t]) => el('option', { value: v }, t)));
    const NS = 'http://www.w3.org/2000/svg', ns = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const area = el('div'), fb = el('p', { role: 'status', style: 'font-size:1.1rem' }), nextB = el('button', { type: 'button' }, 'New time'); let tgt = null, score = [0, 0];
    const clock = (h, m) => { const s = ns('svg', { viewBox: '-110 -110 220 220', width: 240, height: 240, role: 'img', 'aria-label': `Analog clock showing ${h}:${String(m).padStart(2, '0')}` }); s.style.cssText = 'background:#fff;max-width:100%'; s.append(ns('circle', { r: 104, fill: '#fff', stroke: '#111', 'stroke-width': 3 })); for (let i = 1; i <= 12; i++) { const a = i * PI / 6, t = ns('text', { x: 84 * Math.sin(a), y: -84 * Math.cos(a) + 5, 'text-anchor': 'middle', 'font-size': 16, fill: '#111' }); t.textContent = i; s.append(t); } for (let i = 0; i < 60; i++) { const a = i * PI / 30, r1 = i % 5 ? 98 : 94; s.append(ns('line', { x1: r1 * Math.sin(a), y1: -r1 * Math.cos(a), x2: 102 * Math.sin(a), y2: -102 * Math.cos(a), stroke: '#111' })); } const ha = ((h % 12) + m / 60) * PI / 6, ma = m * PI / 30; s.append(ns('line', { x1: 0, y1: 0, x2: 50 * Math.sin(ha), y2: -50 * Math.cos(ha), stroke: '#111', 'stroke-width': 6, 'stroke-linecap': 'round' }), ns('line', { x1: 0, y1: 0, x2: 78 * Math.sin(ma), y2: -78 * Math.cos(ma), stroke: '#1f77b4', 'stroke-width': 4, 'stroke-linecap': 'round' }), ns('circle', { r: 4, fill: '#111' })); return s; };
    const fmtT = (h, m) => `${h}:${String(m).padStart(2, '0')}`;
    const next = () => { const p = +prec.value, h = 1 + Math.floor(Math.random() * 12), m = Math.floor(Math.random() * (60 / p)) * p; tgt = { h, m }; fb.textContent = ''; if (mode.value === 'read') { const inp = el('input', { type: 'text', inputMode: 'numeric', placeholder: 'h:mm', 'aria-label': 'Time shown on the clock, as hours:minutes', style: 'width:6rem;font-size:1.3rem' }), go = el('button', { type: 'button' }, 'Check'); const chk = () => { const mm = /^(\d{1,2})[:.]?(\d{2})$/.exec(inp.value.trim()); if (!mm) { fb.textContent = 'Type the time like 3:15.'; return; } score[1]++; const ok = +mm[1] % 12 === h % 12 && +mm[2] === m; if (ok) score[0]++; fb.textContent = (ok ? 'Correct! ' : `Not quite, it shows ${fmtT(h, m)}. `) + `Score ${score[0]} of ${score[1]}.`; }; inp.addEventListener('keydown', (e) => e.key === 'Enter' && chk()); go.addEventListener('click', chk); area.replaceChildren(clock(h, m), el('div', {}, el('label', {}, 'Time: ', inp), go)); } else { let sh = 12, sm = 0; const host = el('div'), draw = () => host.replaceChildren(clock(sh, sm)); const hr = el('input', { type: 'range', min: 1, max: 12, value: 12, 'aria-label': 'Hour hand (hour)' }), mr = el('input', { type: 'range', min: 0, max: 59, step: p, value: 0, 'aria-label': 'Minute hand (minutes)' }); hr.addEventListener('input', () => { sh = +hr.value; draw(); }); mr.addEventListener('input', () => { sm = +mr.value; draw(); }); const go = el('button', { type: 'button' }, 'Check'); go.addEventListener('click', () => { score[1]++; const ok = sh % 12 === h % 12 && sm === m; if (ok) score[0]++; fb.textContent = (ok ? 'Correct! ' : `Not quite. The hands should show ${fmtT(h, m)}. `) + `Score ${score[0]} of ${score[1]}.`; }); area.replaceChildren(el('p', { style: 'font-size:1.8rem' }, `Set the clock to ${fmtT(h, m)}`), host, el('div', {}, field('Hour', hr), field('Minutes', mr), go)); draw(); } };
    nextB.addEventListener('click', next); mode.addEventListener('change', () => { score = [0, 0]; next(); }); prec.addEventListener('change', next);
    root.append(field('Mode', mode), field('Minutes', prec), nextB, area, fb, note('The short thick hand is the hour hand, the long blue hand is the minute hand. The sliders replace dragging, so the clock can be set with a keyboard.')); next();
  },
});

// ---------- spelling bee ----------
T.push({
  id: 'spelling-bee-speech-practice', cat: LRN, title: 'Spelling Practice: Hear the Word, Type the Spelling',
  desc: 'Enter a word list and your browser reads each word aloud with speech synthesis; you type the spelling and get a score at the end.',
  custom: true, render: (root) => {
    const ta = el('textarea', { rows: 6, spellcheck: false, 'aria-label': 'Word list, one word per line', style: 'width:100%;max-width:30rem' }, 'necessary\nreceive\nseparate\nbeautiful\nfriend'), start = el('button', { type: 'button' }, 'Start'), area = el('div'), fb = el('p', { role: 'status' }); let words = [], i = 0, right = 0, wrong = [];
    const synth = window.speechSynthesis, say = (w, rate = 0.9) => { if (!synth) { fb.textContent = 'This browser has no speech synthesis. Use "Show the word" instead.'; return; } synth.cancel(); const u = new SpeechSynthesisUtterance(w); u.rate = rate; u.lang = document.documentElement.lang || 'en'; synth.speak(u); };
    const nextQ = () => { if (i >= words.length) { area.replaceChildren(); fb.textContent = `Finished: ${right} of ${words.length} correct.` + (wrong.length ? ' To practise: ' + wrong.join(', ') + '.' : ' Perfect!'); start.disabled = false; return; } const w = words[i], inp = el('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': `Spelling of word ${i + 1}`, style: 'font-size:1.3rem' }), submit = () => { const ok = inp.value.trim().toLowerCase() === w.toLowerCase(); if (ok) right++; else wrong.push(w); fb.textContent = ok ? `Correct: ${w}.` : `Not quite. The word was "${w}".`; i++; nextQ(); }; inp.addEventListener('keydown', (e) => e.key === 'Enter' && submit()); area.replaceChildren(el('p', {}, `Word ${i + 1} of ${words.length}`), inp, el('div', {}, el('button', { type: 'button', onclick: () => say(w) }, 'Hear it again'), el('button', { type: 'button', onclick: () => say(w, 0.5) }, 'Hear it slowly'), el('button', { type: 'button', onclick: submit }, 'Submit'), el('button', { type: 'button', onclick: () => { fb.textContent = `The word is "${w}".`; } }, 'Show the word'))); inp.focus(); say(w); };
    start.addEventListener('click', () => { words = ta.value.split(/\n+/).map((x) => x.trim()).filter(Boolean).slice(0, 100); if (!words.length) { fb.textContent = 'Enter at least one word.'; return; } i = 0; right = 0; wrong = []; start.disabled = true; fb.textContent = ''; nextQ(); });
    root.append(el('label', {}, 'Words (one per line)'), el('br'), ta, el('div', {}, start), area, fb, note('Uses the speech voices installed in your browser or system. Some browsers fetch online voices, which would send the word to the voice provider; pick a local voice in your system settings if that matters. Nothing is stored.'));
  },
});

// ---------- reading speed ----------
T.push({
  id: 'reading-speed-test-wpm', cat: LRN, title: 'Reading Speed Test: Words per Minute',
  desc: 'Read a passage at your own pace, press stop, and get your words-per-minute; paste your own text to test with material you choose.',
  custom: true, render: (root) => {
    const sample = 'A lighthouse keeper on a small island kept a simple routine. Each evening he climbed the spiral stairs, trimmed the lamp and polished the great lens until it shone. Ships far out at sea relied on that single beam to find the safe channel between the rocks. On foggy nights he also rang a bell, one slow stroke every half minute, so that sailors who could not see the light could still hear where the land began. He rarely met the people he helped. Once a year a supply boat arrived with oil, flour and letters, and for a few hours the island felt crowded. Then the boat left, the sea grew quiet again, and the light turned slowly in the dark, doing its work without any thanks.';
    const ta = el('textarea', { rows: 6, spellcheck: false, 'aria-label': 'Text to read', style: 'width:100%;max-width:40rem' }, sample), go = el('button', { type: 'button' }, 'Start reading'), stop = el('button', { type: 'button', disabled: true }, 'I have finished reading'), view = el('div', { style: 'white-space:pre-wrap;max-width:40rem;font-size:1.1rem;line-height:1.6;margin:.8rem 0' }), fb = el('p', { role: 'status', style: 'font-size:1.2rem' }); let t0 = 0, words = 0;
    go.addEventListener('click', () => { const txt = ta.value.trim(); words = (txt.match(/\S+/g) || []).length; if (words < 20) { fb.textContent = 'Use a text of at least 20 words.'; return; } view.textContent = txt; ta.hidden = true; go.disabled = true; stop.disabled = false; fb.textContent = 'Read at your normal speed, then press the finish button.'; t0 = performance.now(); });
    stop.addEventListener('click', () => { const min = (performance.now() - t0) / 60000; fb.textContent = `${words} words in ${(min * 60).toFixed(1)} seconds = ${Math.round(words / min)} words per minute.`; ta.hidden = false; view.textContent = ''; go.disabled = false; stop.disabled = true; });
    root.append(el('label', {}, 'Text to read (replace it with your own if you like)'), el('br'), ta, el('div', {}, go, stop), view, fb, note('Speed only: there are no comprehension questions, so skimming looks the same as careful reading. Speed depends on the text, so compare results on the same text. Words are counted as runs of non-space characters. Nothing is stored.'));
  },
});

// ---------- morse trainer ----------
const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.' };
const KOCH = 'KMRSUAPTLOWI.NJEF0Y,VG5/Q9ZH38B?427C1D6X'.split('');
T.push({
  id: 'morse-code-koch-trainer', cat: LRN, title: 'Morse Code Trainer: Copy by Ear with the Koch Method',
  desc: 'Hear random Morse groups at your chosen speed, type what you hear, and add new characters one by one as your accuracy improves.',
  custom: true, render: (root) => {
    const lvl = el('input', { type: 'number', min: 2, max: KOCH.length, value: store.get('ft-koch-level', 2), style: 'width:5rem' }), wpm = el('input', { type: 'number', min: 5, max: 40, value: 15, style: 'width:5rem' }), hz = el('input', { type: 'number', min: 300, max: 1000, value: 600, style: 'width:5rem' });
    const play = el('button', { type: 'button' }, 'Play 5 new characters'), again = el('button', { type: 'button', disabled: true }, 'Hear again'), ans = el('input', { type: 'text', autocomplete: 'off', 'aria-label': 'What you heard', style: 'font-size:1.3rem;text-transform:uppercase' }), chk = el('button', { type: 'button' }, 'Check'), fb = el('p', { role: 'status' }), tab = el('pre', { 'aria-label': 'Characters in this level' }); let cur = '', tot = [0, 0];
    const lv = () => Math.max(2, Math.min(KOCH.length, Math.round(+lvl.value) || 2)), show = () => { tab.textContent = 'Characters at this level (Koch order): ' + KOCH.slice(0, lv()).join(' '); };
    const sound = () => { try { const u = 1.2 / Math.max(5, Math.min(40, +wpm.value || 15)); let t = 0.1; for (const ch of cur) { for (const s of MORSE[ch]) { const d = s === '.' ? u : 3 * u; playTone(+hz.value || 600, t, d, 'sine', 0.2); t += d + u; } t += 2 * u; } } catch (e) { fb.textContent = e.message; } };
    play.addEventListener('click', () => { const set = KOCH.slice(0, lv()); cur = Array.from({ length: 5 }, () => set[Math.floor(Math.random() * set.length)]).join(''); ans.value = ''; fb.textContent = 'Listening. Type the 5 characters you heard.'; again.disabled = false; store.set('ft-koch-level', lv()); sound(); ans.focus(); show(); });
    again.addEventListener('click', sound);
    const check = () => { if (!cur) return; const got = ans.value.toUpperCase().replace(/\s/g, ''); let ok = 0; for (let i = 0; i < cur.length; i++) if (got[i] === cur[i]) ok++; tot[0] += ok; tot[1] += cur.length; fb.textContent = `Sent: ${cur.split('').join(' ')}. You typed: ${got.split('').join(' ') || '(nothing)'}. ${ok} of ${cur.length} right. Session accuracy ${Math.round(100 * tot[0] / tot[1])}%. ${tot[1] >= 50 && tot[0] / tot[1] >= 0.9 ? 'At 90% or better, a common rule of thumb is to add the next character: raise the level by one.' : ''}`; cur = ''; again.disabled = true; };
    chk.addEventListener('click', check); ans.addEventListener('keydown', (e) => e.key === 'Enter' && check()); lvl.addEventListener('change', show);
    root.append(field('Characters learned', lvl), field('Speed (words per minute)', wpm), field('Tone (Hz)', hz), el('div', {}, play, again), el('label', {}, 'Your answer ', ans), chk, fb, tab, note('Characters are added in the order commonly used for Koch-method Morse courses (K M R S U A P T L O W I . N J E F 0 Y , V G 5 / Q 9 Z H 3 8 B ? 4 2 7 C 1 D 6 X); this order is written from memory and was not checked against a published source. Timing: dot = 1.2 / wpm seconds, dash = 3 dots, one dot between elements, three between characters. Needs sound on. The level is remembered in this browser if storage is allowed.')); show();
  },
});

// =====================================================================
// Productivity & Office
// =====================================================================
const STORE_WARN = 'Saved in this browser only (localStorage). If your browser blocks storage, the tool still works but forgets everything when you close the page.';
T.push({
  id: 'todo-list-saved-in-browser', cat: PRD, title: 'To-Do List Saved in Your Browser (No Account)',
  desc: 'A plain checklist: add items, tick them off, reorder with buttons and delete them. It is kept in this browser and also works without storage.',
  custom: true, render: (root) => {
    const KEY = 'ft-todo-list'; let items = store.get(KEY, []); if (!Array.isArray(items)) items = [];
    const list = el('ul', { style: 'list-style:none;padding:0' }), inp = el('input', { type: 'text', 'aria-label': 'New to-do item', placeholder: 'Add an item and press Enter', style: 'width:min(28rem,100%)' }), fb = el('p', { role: 'status' });
    const save = () => { const ok = store.set(KEY, items); fb.textContent = ok ? `${items.filter((x) => x.d).length} of ${items.length} done. Saved in this browser.` : `${items.filter((x) => x.d).length} of ${items.length} done. Storage is blocked, so this list is lost when you close the page.`; };
    const draw = () => { list.replaceChildren(...items.map((it, i) => el('li', { style: 'margin:.3rem 0;display:flex;gap:.4rem;align-items:center;flex-wrap:wrap' }, el('input', { type: 'checkbox', checked: it.d, 'aria-label': `Done: ${it.t}`, onchange: (e) => { it.d = e.target.checked; save(); draw(); } }), el('span', { style: it.d ? 'text-decoration:line-through;opacity:.7' : '' }, it.t), el('button', { type: 'button', 'aria-label': `Move up: ${it.t}`, disabled: i === 0, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; save(); draw(); } }, 'Up'), el('button', { type: 'button', 'aria-label': `Move down: ${it.t}`, disabled: i === items.length - 1, onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; save(); draw(); } }, 'Down'), el('button', { type: 'button', 'aria-label': `Delete: ${it.t}`, onclick: () => { items.splice(i, 1); save(); draw(); } }, 'Delete')))); };
    const add = () => { const t = inp.value.trim(); if (!t) return; items.push({ t: t.slice(0, 300), d: false }); inp.value = ''; save(); draw(); inp.focus(); };
    inp.addEventListener('keydown', (e) => e.key === 'Enter' && add());
    root.append(el('div', {}, inp, el('button', { type: 'button', onclick: add }, 'Add'), el('button', { type: 'button', onclick: () => { items = items.filter((x) => !x.d); save(); draw(); } }, 'Clear completed')), list, fb, note(STORE_WARN)); draw(); save();
  },
});

T.push({
  id: 'sticky-notes-board-local', cat: PRD, title: 'Sticky Notes Board Saved in Your Browser',
  desc: 'Add colored notes, type on them, change their color and reorder them with buttons; the board is kept in this browser.',
  custom: true, render: (root) => {
    const KEY = 'ft-sticky-notes', COL = { yellow: '#fff2a8', pink: '#ffc9de', blue: '#c6e2ff', green: '#c9f2c7' }; let notes = store.get(KEY, []); if (!Array.isArray(notes)) notes = [];
    const board = el('div', { style: 'display:flex;flex-wrap:wrap;gap:.8rem;margin:.8rem 0' }), fb = el('p', { role: 'status' });
    const save = () => { fb.textContent = store.set(KEY, notes) ? `${notes.length} note${notes.length === 1 ? '' : 's'}. Saved in this browser.` : `${notes.length} note${notes.length === 1 ? '' : 's'}. Storage is blocked, so the board is lost when you close the page.`; };
    const draw = () => { board.replaceChildren(...notes.map((n, i) => { const ta = el('textarea', { rows: 5, 'aria-label': `Note ${i + 1} text`, style: `width:100%;box-sizing:border-box;background:${COL[n.c]};color:#111;border:1px solid #0003;font:inherit;resize:vertical` }, n.t); ta.addEventListener('input', () => { n.t = ta.value; save(); }); const sel = el('select', { 'aria-label': `Note ${i + 1} color` }, ...Object.keys(COL).map((k) => el('option', { value: k, selected: k === n.c }, k))); sel.addEventListener('change', () => { n.c = sel.value; save(); draw(); }); return el('div', { style: 'width:13rem' }, ta, el('div', {}, sel, el('button', { type: 'button', 'aria-label': `Move note ${i + 1} earlier`, disabled: i === 0, onclick: () => { [notes[i - 1], notes[i]] = [notes[i], notes[i - 1]]; save(); draw(); } }, '<'), el('button', { type: 'button', 'aria-label': `Move note ${i + 1} later`, disabled: i === notes.length - 1, onclick: () => { [notes[i + 1], notes[i]] = [notes[i], notes[i + 1]]; save(); draw(); } }, '>'), el('button', { type: 'button', 'aria-label': `Delete note ${i + 1}`, onclick: () => { notes.splice(i, 1); save(); draw(); } }, 'Delete'))); })); };
    root.append(el('button', { type: 'button', onclick: () => { notes.push({ t: '', c: Object.keys(COL)[notes.length % 4] }); save(); draw(); board.querySelectorAll('textarea')[notes.length - 1]?.focus(); } }, 'Add a note'), board, fb, note(STORE_WARN + ' Notes are ordered with the < and > buttons rather than dragged, so the board works with a keyboard.')); draw(); save();
  },
});

T.push({
  id: 'webcam-mirror-check', cat: PRD, title: 'Webcam Mirror: Check Lighting and Framing Before a Call',
  desc: 'Show your camera as a mirrored live preview with an optional framing grid. Nothing is recorded, saved or uploaded.',
  custom: true, dom: true, render: (root) => {
    const vid = el('video', { autoplay: true, muted: true, playsInline: true, 'aria-label': 'Live mirrored camera preview', style: 'width:100%;max-width:640px;background:#000;transform:scaleX(-1);display:block' }); vid.muted = true;
    const start = el('button', { type: 'button' }, 'Start camera'), stop = el('button', { type: 'button', disabled: true }, 'Stop camera'), dev = el('select', { 'aria-label': 'Camera' }), grid = el('input', { type: 'checkbox' }), fb = el('p', { role: 'status' }), wrap = el('div', { style: 'position:relative;max-width:640px' }); let stream = null;
    const ov = el('div', { 'aria-hidden': 'true', hidden: true, style: 'position:absolute;inset:0;pointer-events:none;background:linear-gradient(#fff6 1px,transparent 1px) 0 33.33%/100% 33.33%,linear-gradient(90deg,#fff6 1px,transparent 1px) 33.33% 0/33.33% 100%' }); wrap.append(vid, ov); grid.addEventListener('change', () => { ov.hidden = !grid.checked; });
    const halt = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; vid.srcObject = null; start.disabled = false; stop.disabled = true; };
    const go = async () => { try { halt(); need(navigator.mediaDevices?.getUserMedia, 'Camera access is not available here (it needs a secure page and a supported browser)'); stream = await navigator.mediaDevices.getUserMedia({ video: dev.value ? { deviceId: { exact: dev.value } } : true }); vid.srcObject = stream; start.disabled = true; stop.disabled = false; fb.setAttribute('role', 'status'); fb.textContent = 'Camera on. The picture stays on this device.'; const ds = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); if (dev.options.length !== ds.length) { dev.replaceChildren(...ds.map((d, i) => el('option', { value: d.deviceId, selected: stream.getVideoTracks()[0].getSettings().deviceId === d.deviceId }, d.label || `Camera ${i + 1}`))); } } catch (e) { fb.setAttribute('role', 'alert'); fb.textContent = e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow it in the browser address bar and try again.' : e.message; } };
    start.addEventListener('click', go); stop.addEventListener('click', () => { halt(); fb.textContent = 'Camera off.'; }); dev.addEventListener('change', go); const iv = setInterval(() => { if (!root.isConnected) { halt(); clearInterval(iv); } }, 1000);
    root.append(el('div', {}, start, stop, field('Camera', dev), el('label', { style: 'margin-left:1rem' }, grid, ' Framing grid (thirds)')), wrap, fb, note('The preview is mirrored like a bathroom mirror; video-call apps often show others the unmirrored picture. Nothing is recorded or sent anywhere.'));
  },
});

T.push({
  id: 'eye-break-reminder-20-20-20', cat: PRD, title: 'Eye Break Reminder (20-20-20 Rule Timer)',
  desc: 'Every 20 minutes a prompt tells you to look at something far away for 20 seconds, then counts the break down and restarts the cycle.',
  custom: true, render: (root) => {
    const work = el('input', { type: 'number', min: 1, max: 120, value: 20, style: 'width:5rem' }), brk = el('input', { type: 'number', min: 5, max: 120, value: 20, style: 'width:5rem' }), snd = el('input', { type: 'checkbox', checked: true }), start = el('button', { type: 'button' }, 'Start reminders'), stop = el('button', { type: 'button', disabled: true }, 'Stop'), notif = el('button', { type: 'button' }, 'Allow desktop notifications (optional)');
    const big = el('p', { style: 'font-size:2rem;margin:.6rem 0', 'aria-hidden': 'true' }), msg = el('p', { role: 'status', style: 'font-size:1.2rem' }); let phase = null, until = 0, id = null;
    const stopAll = () => { clearInterval(id); phase = null; start.disabled = false; stop.disabled = true; big.textContent = ''; };
    const ping = (t) => { if (snd.checked) { try { playTone(660, 0, 0.25, 'sine', 0.15); } catch { /* no audio */ } } if (typeof Notification !== 'undefined' && Notification.permission === 'granted') { try { new Notification(t); } catch { /* ignore */ } } };
    const setPhase = (p) => { phase = p; until = Date.now() + (p === 'work' ? Math.max(1, +work.value || 20) * 60000 : Math.max(5, +brk.value || 20) * 1000); if (p === 'break') { msg.textContent = `Break: look at something about 20 feet (6 metres) away for ${brk.value} seconds.`; ping('Look at something 20 feet away for 20 seconds'); } else msg.textContent = 'Working. The next eye break is coming.'; };
    const tick = () => { const left = Math.max(0, Math.ceil((until - Date.now()) / 1000)); big.textContent = `${phase === 'work' ? 'Next break in' : 'Break ends in'} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; if (!root.isConnected) return stopAll(); if (left <= 0) setPhase(phase === 'work' ? 'break' : 'work'); };
    start.addEventListener('click', () => { start.disabled = true; stop.disabled = false; setPhase('work'); tick(); id = setInterval(tick, 500); });
    stop.addEventListener('click', () => { stopAll(); msg.textContent = 'Stopped.'; });
    notif.addEventListener('click', async () => { if (typeof Notification === 'undefined') { msg.textContent = 'Notifications are not supported in this browser.'; return; } const p = await Notification.requestPermission(); msg.textContent = p === 'granted' ? 'Desktop notifications are on while this page stays open.' : 'Notifications not allowed; the on-page prompt and sound still work.'; });
    root.append(field('Work minutes', work), field('Break seconds', brk), el('label', {}, snd, ' Play a beep'), el('div', {}, start, stop, notif), big, msg, note('The 20-20-20 rule is a common guideline: every 20 minutes, look at something about 20 feet away for 20 seconds. This is a reminder, not medical advice. Browsers slow timers in background tabs, so a break prompt may arrive a little late; keep this tab open. Nothing is sent or stored.'));
  },
});

// ---------- printable monthly calendar ----------
T.push({
  id: 'monthly-calendar-printer', cat: PRD, title: 'Printable Monthly Calendar with Your Own Dates',
  desc: 'Print a large one-month-per-page calendar for any year, with a Monday or Sunday start and your own events or holidays written into the day cells.',
  inputs: 1, labels: ['Dates to write in the cells, one per line: "2026-12-25 Christmas" or "12-25 Birthday" (every year)'], sample: '2026-12-25 Christmas\n12-31 New Year\'s Eve\n2026-12-08 Team meeting',
  opts: [{ id: 'year', label: 'Year', type: 'number', def: 2026 }, { id: 'month', label: 'Month (1-12, or 0 for all 12 months)', type: 'number', def: 12 }, { id: 'start', label: 'Week starts on', type: 'select', choices: ['Monday', 'Sunday'], def: 'Monday' }, { id: 'paper', label: 'Paper', type: 'select', choices: ['A4', 'Letter'], def: 'A4' }],
  run: ([src], o) => {
    const year = Math.round(numOpt(o.year, 'Year', 1583, 9999)), mo = Math.round(numOpt(o.month, 'Month', 0, 12)), mon = o.start === 'Monday'; const ev = new Map();
    for (const l of lines(src)) { const m = /^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})\s+(.+)$/.exec(l); need(m, `Line "${l.slice(0, 30)}": use YYYY-MM-DD text or MM-DD text`); if (m[1] && +m[1] !== year) continue; const k = `${+m[2]}-${+m[3]}`; ev.set(k, [...(ev.get(k) || []), m[4]]); }
    const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], wd = mon ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const page = (m) => { const first = new Date(Date.UTC(year, m - 1, 1)).getUTCDay(), lead = mon ? (first + 6) % 7 : first, dim = new Date(Date.UTC(year, m, 0)).getUTCDate(), rows = Math.ceil((lead + dim) / 7); let t = `<table class="cal"><tr>${wd.map((d) => `<th>${d}</th>`).join('')}</tr>`; for (let r = 0; r < rows; r++) { t += '<tr>'; for (let c = 0; c < 7; c++) { const d = r * 7 + c - lead + 1; t += d < 1 || d > dim ? '<td class="x"></td>' : `<td><b>${d}</b>${(ev.get(`${m}-${d}`) || []).map((e) => `<div class="e">${esc(e)}</div>`).join('')}</td>`; } t += '</tr>'; } return `<div class="sheet"><h1>${names[m - 1]} ${year}</h1>${t}</table></div>`; };
    const css = `@page{size:${o.paper} landscape;margin:10mm}.cal{width:100%;border-collapse:collapse;table-layout:fixed}.cal th{background:#eee;border:1px solid #444;padding:4px}.cal td{border:1px solid #444;height:${o.paper === 'A4' ? 28 : 28}mm;vertical-align:top;padding:3px;font-size:14px}.cal td.x{background:#f6f6f6}.e{font-size:11px;margin-top:2px}h1{font-size:26px;margin:0 0 8px}`;
    return { html: doc(`Calendar ${year}`, (mo === 0 ? Array.from({ length: 12 }, (_, i) => page(i + 1)).join('') : page(mo)), css) };
  },
});

// ---------- label sheet ----------
T.push({
  id: 'label-sheet-layout-printer', cat: PRD, title: 'Label Sheet Printer: Lay Out Address Labels on Any Sheet Size',
  desc: 'Enter the measurements of your label sheet, paste the label text, and print labels aligned to the grid, starting at any position on a partly used sheet.',
  inputs: 1, labels: ['Label texts. Separate labels with a blank line; lines inside a label stay together.'], sample: 'Ada Lovelace\n12 Analytical Way\nLondon\n\nGrace Hopper\n1 Compiler Road\nArlington',
  opts: [{ id: 'paper', label: 'Paper', type: 'select', choices: ['A4 (210 x 297 mm)', 'Letter (215.9 x 279.4 mm)'], def: 'A4 (210 x 297 mm)' }, { id: 'cols', label: 'Labels across', type: 'number', def: 3 }, { id: 'rows', label: 'Labels down', type: 'number', def: 7 }, { id: 'w', label: 'Label width (mm)', type: 'number', def: 63.5 }, { id: 'h', label: 'Label height (mm)', type: 'number', def: 38.1 }, { id: 'px', label: 'Distance from one label left edge to the next (mm)', type: 'number', def: 66 }, { id: 'py', label: 'Distance from one label top edge to the next (mm)', type: 'number', def: 38.1 }, { id: 'ml', label: 'Left margin to first label (mm)', type: 'number', def: 7.2 }, { id: 'mt', label: 'Top margin to first label (mm)', type: 'number', def: 15.1 }, { id: 'skip', label: 'Skip this many labels at the start (used sheet)', type: 'number', def: 0 }, { id: 'fs', label: 'Font size (pt)', type: 'number', def: 10 }, { id: 'guide', label: 'Draw outlines (for a test print on plain paper)', type: 'checkbox', def: false }],
  run: ([src], o) => {
    const [pw, ph] = o.paper.startsWith('A4') ? [210, 297] : [215.9, 279.4], cols = Math.round(numOpt(o.cols, 'Across', 1, 12)), rows = Math.round(numOpt(o.rows, 'Down', 1, 30)), w = numOpt(o.w, 'Width', 5, 300), h = numOpt(o.h, 'Height', 5, 300), px = numOpt(o.px, 'Horizontal pitch', 5, 300), py = numOpt(o.py, 'Vertical pitch', 5, 300), ml = numOpt(o.ml, 'Left margin', 0, 100), mt = numOpt(o.mt, 'Top margin', 0, 100), skip = Math.round(numOpt(o.skip, 'Skip', 0, 1000)), fs = numOpt(o.fs, 'Font size', 4, 40);
    need(ml + (cols - 1) * px + w <= pw + 0.01 && mt + (rows - 1) * py + h <= ph + 0.01, `The grid does not fit on the page: it needs ${fmt(ml + (cols - 1) * px + w, 5)} x ${fmt(mt + (rows - 1) * py + h, 5)} mm and the paper is ${pw} x ${ph} mm`);
    const labs = src.replace(/\r/g, '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean); need(labs.length >= 1 && labs.length <= 2000, 'Give 1 to 2000 labels'); const per = cols * rows; const all = [...Array(skip).fill(null), ...labs]; const pages = Math.ceil(all.length / per);
    let body = ''; for (let p = 0; p < pages; p++) { let inner = ''; for (let k = 0; k < per; k++) { const t = all[p * per + k]; if (t == null && !o.guide) continue; const c = k % cols, r = Math.floor(k / cols); inner += `<div class="l" style="left:${fmt(ml + c * px, 6)}mm;top:${fmt(mt + r * py, 6)}mm;${t == null ? 'border-style:dotted;color:#aaa' : ''}">${t == null ? '' : esc(t).replace(/\n/g, '<br>')}</div>`; } body += `<div class="sheet pg">${inner}</div>`; }
    const css = `@page{size:${pw}mm ${ph}mm;margin:0}body{margin:0}.pg{position:relative;width:${pw}mm;height:${ph}mm;overflow:hidden}.l{position:absolute;box-sizing:border-box;width:${w}mm;height:${h}mm;padding:2.5mm;overflow:hidden;font-size:${fs}pt;line-height:1.25;${o.guide ? 'border:0.2mm solid #888;' : ''}}`;
    return { html: doc('Labels', body, css) };
  },
});

// ---------- CSV helpers for badges and certificates ----------
function parseCsv(t) { const rows = []; let r = [], f = '', q = false; const s = t.replace(/^﻿/, ''); for (let i = 0; i < s.length; i++) { const c = s[i]; if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; } else if (c === '"') q = true; else if (c === ',') { r.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; r.push(f); f = ''; if (r.some((x) => x.trim())) rows.push(r); r = []; } else f += c; } r.push(f); if (r.some((x) => x.trim())) rows.push(r); return rows; }
const fillTpl = (tpl, rec) => tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => { const key = Object.keys(rec).find((x) => x.toLowerCase() === k.toLowerCase()); need(key != null, `The template uses {{${k}}} but the CSV has no "${k}" column (columns: ${Object.keys(rec).join(', ')})`); return rec[key]; });
const csvRecords = (src) => { const rows = parseCsv(src); need(rows.length >= 2, 'Paste a CSV with a header row and at least one data row'); const head = rows[0].map((h) => h.trim()); need(head.every(Boolean) && new Set(head.map((h) => h.toLowerCase())).size === head.length, 'The header row needs a unique name for every column'); return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()]))); };
T.push({
  id: 'name-badge-maker-from-csv', cat: PRD, title: 'Name Badge Maker from a CSV of Attendees',
  desc: 'Paste a CSV with names, titles and companies, set one badge layout with placeholders, and print a page of badges for every row.',
  inputs: 1, labels: ['CSV with a header row (name,title,company)'], sample: 'name,title,company\nAda Lovelace,Mathematician,Analytical Engines Ltd\nGrace Hopper,Rear Admiral,US Navy\n"Turing, Alan",Researcher,Bletchley Park',
  opts: [{ id: 'l1', label: 'Big line (placeholders like {{name}})', type: 'text', def: '{{name}}' }, { id: 'l2', label: 'Second line', type: 'text', def: '{{title}}' }, { id: 'l3', label: 'Third line', type: 'text', def: '{{company}}' }, { id: 'event', label: 'Event name at the top (optional)', type: 'text', def: 'Conference 2026' }, { id: 'w', label: 'Badge width (mm)', type: 'number', def: 90 }, { id: 'h', label: 'Badge height (mm)', type: 'number', def: 55 }, { id: 'color', label: 'Accent color', type: 'text', def: '#1f4e79' }, { id: 'paper', label: 'Paper', type: 'select', choices: ['A4', 'Letter'], def: 'A4' }],
  run: ([src], o) => {
    const recs = csvRecords(src); need(recs.length <= 500, 'At most 500 badges'); const w = numOpt(o.w, 'Width', 40, 200), h = numOpt(o.h, 'Height', 30, 200), col = /^#[0-9a-f]{3,8}$/i.test(o.color.trim()) ? o.color.trim() : '#1f4e79';
    const bs = recs.map((r) => `<div class="b"><div class="ev">${esc(o.event)}</div><div class="n">${esc(fillTpl(o.l1, r))}</div><div class="s">${esc(fillTpl(o.l2, r))}</div><div class="s">${esc(fillTpl(o.l3, r))}</div></div>`);
    const css = `@page{size:${o.paper};margin:8mm}.wrap{display:flex;flex-wrap:wrap;gap:0}.b{box-sizing:border-box;width:${w}mm;height:${h}mm;border:0.3mm dashed #888;padding:5mm;text-align:center;display:flex;flex-direction:column;justify-content:center;border-top:4mm solid ${col};page-break-inside:avoid;overflow:hidden}.ev{font-size:9pt;color:#555}.n{font-size:22pt;font-weight:bold;margin:2mm 0}.s{font-size:12pt}`;
    return { html: doc('Badges', `<div class="wrap">${bs.join('')}</div>`, css) };
  },
});

T.push({
  id: 'certificate-mail-merge-generator', cat: PRD, title: 'Certificate Generator: Mail-Merge Names into Printable Certificates',
  desc: 'Paste a list of recipients, write the certificate text with placeholders, optionally add your own background image, and print one page per person.',
  inputs: 1, labels: ['Recipients: a CSV with a header row (name,course,date) or just one name per line'], sample: 'name,course,date\nAda Lovelace,Introduction to Computing,2026-10-23\nGrace Hopper,Introduction to Computing,2026-10-23',
  file: { accept: 'image/*', optional: true, multiple: false },
  opts: [{ id: 'title', label: 'Title', type: 'text', def: 'Certificate of Achievement' }, { id: 'body', label: 'Text under the name (placeholders allowed)', type: 'text', def: 'has successfully completed {{course}}' }, { id: 'sign', label: 'Signature line label', type: 'text', def: 'Instructor' }, { id: 'datef', label: 'Date text (placeholders allowed)', type: 'text', def: '{{date}}' }, { id: 'color', label: 'Accent color', type: 'text', def: '#7a5c1e' }, { id: 'paper', label: 'Paper', type: 'select', choices: ['A4', 'Letter'], def: 'A4' }],
  run: async ([src], o, files) => {
    let recs; if (/,/.test(src.split('\n')[0]) || /^\s*name\s*$/i.test(src.split('\n')[0])) recs = csvRecords(src); else { const ns = lines(src); need(ns.length, 'Enter at least one name'); recs = ns.map((n) => ({ name: n })); }
    need(recs.length <= 300, 'At most 300 certificates'); need(recs.every((r) => Object.keys(r).some((k) => k.toLowerCase() === 'name')), 'The CSV needs a "name" column'); const col = /^#[0-9a-f]{3,8}$/i.test(o.color.trim()) ? o.color.trim() : '#7a5c1e'; let bg = '';
    if (files && files[0]) { const f = files[0]; need(/^image\/(png|jpeg|gif|webp)$/.test(f.type), 'Background must be a PNG, JPEG, GIF or WebP image'); need(f.size <= 6e6, 'Background image is larger than 6 MB'); const buf = new Uint8Array(await f.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192)); bg = `background:url(data:${f.type};base64,${btoa(bin)}) center/cover no-repeat;`; }
    const pages = recs.map((r) => { const tr = (s) => { try { return fillTpl(s, r); } catch (e) { if (/has no/.test(e.message)) return ''; throw e; } }; const nm = Object.keys(r).find((k) => k.toLowerCase() === 'name'); return `<div class="sheet cert"><div class="in"><div class="t">${esc(o.title)}</div><div class="p">This certificate is presented to</div><div class="nm">${esc(r[nm])}</div><div class="p">${esc(tr(o.body))}</div><div class="foot"><div><div class="line"></div>${esc(o.sign)}</div><div><div class="line" style="border:0;height:auto;margin-bottom:6px">${esc(tr(o.datef))}</div>Date</div></div></div></div>`; });
    const [W, H] = o.paper === 'A4' ? [297, 210] : [279.4, 215.9]; const css = `@page{size:${o.paper} landscape;margin:0}body{margin:0}.cert{width:${W}mm;height:${H}mm;box-sizing:border-box;padding:10mm;${bg}page-break-after:always;overflow:hidden}.in{height:100%;box-sizing:border-box;border:2mm double ${col};display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;font-family:Georgia,serif;color:#222;padding:8mm;${bg ? 'background:#ffffffcc;' : ''}}.t{font-size:34pt;color:${col};margin-bottom:8mm}.p{font-size:15pt;margin:3mm}.nm{font-size:30pt;font-style:italic;border-bottom:0.4mm solid ${col};padding:0 12mm 2mm;margin:4mm}.foot{display:flex;gap:50mm;margin-top:18mm;font-size:12pt}.line{width:60mm;border-top:0.3mm solid #222;margin-bottom:2mm}`;
    return { html: doc('Certificates', pages.join(''), css) };
  },
});

// ---------- shift planner ----------
const hhmm = (s) => { const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(s); need(m && +m[1] <= 24 && (m[2] == null || +m[2] < 60), `Bad time "${s}"`); return +m[1] * 60 + (m[2] ? +m[2] : 0); };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
T.push({
  id: 'weekly-shift-schedule-planner', cat: PRD, title: 'Weekly Shift Schedule Planner with Hour Totals',
  desc: 'List staff with their shifts per weekday and get a printable rota with each person total hours, unpaid breaks and daily headcount.',
  inputs: 1, labels: ['One person per line: Name: Mon 9-17, Tue 9-17 (30), Wed off, Sat 22-6  (break minutes in brackets, overnight shifts allowed)'], sample: 'Ana: Mon 9-17 (30), Tue 9-17 (30), Wed 12-20 (30), Fri 8-16 (30)\nBen: Mon 12-20 (30), Thu 9-17 (30), Fri 9:00-17:30 (45), Sat 22-6 (30)\nCleo: Tue 14-22, Wed 14-22, Sat 8-14',
  opts: [{ id: 'fmt', label: 'Hours shown as', type: 'select', choices: ['decimal (7.5)', 'hours:minutes (7:30)'], def: 'decimal (7.5)' }],
  run: ([src], o) => {
    const ppl = []; for (const l of lines(src)) { const i = l.indexOf(':'); need(i > 0 && !/^\d/.test(l), `Line "${l.slice(0, 30)}": write Name: Day start-end, ...`); const name = l.slice(0, i).trim(), sh = {}; for (const part of l.slice(i + 1).split(',').map((x) => x.trim()).filter(Boolean)) { const m = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s+(?:(off)|(\d{1,2}(?::?\d{2})?)\s*-\s*(\d{1,2}(?::?\d{2})?)(?:\s*\((\d+)\s*(?:min)?\))?)$/i.exec(part); need(m, `${name}: cannot read "${part}"`); const d = m[1][0].toUpperCase() + m[1].slice(1, 3).toLowerCase(); if (m[2]) continue; need(!(d in sh), `${name}: ${d} appears twice`); const a = hhmm(m[3]), b = hhmm(m[4]); let len = b - a; if (len <= 0) len += 1440; const br = m[5] ? +m[5] : 0; need(len > br, `${name} ${d}: break is longer than the shift`); sh[d] = { a, b: b % 1440, len: len - br, br, txt: `${m[3]}-${m[4]}` }; } ppl.push({ name, sh }); }
    need(ppl.length >= 1 && ppl.length <= 60, 'Give 1 to 60 people'); const hs = (min) => (o.fmt.startsWith('dec') ? fmt(min / 60, 4) : `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`);
    const head = `<tr><th>Name</th>${DAYS.map((d) => `<th>${d}</th>`).join('')}<th>Total hours</th></tr>`; let rows = ''; const cover = DAYS.map(() => 0);
    for (const p of ppl) { let tot = 0; rows += `<tr><td><b>${esc(p.name)}</b></td>${DAYS.map((d, i) => { const s = p.sh[d]; if (!s) return '<td style="color:#595959">off</td>'; tot += s.len; cover[i]++; return `<td>${esc(s.txt)}${s.br ? `<br><small>break ${s.br} min</small>` : ''}<br><small>${hs(s.len)} h</small></td>`; }).join('')}<td><b>${hs(tot)}</b></td></tr>`; }
    rows += `<tr><td><i>People on shift</i></td>${cover.map((c) => `<td>${c}</td>`).join('')}<td></td></tr>`;
    return { html: doc('Rota', `<h1>Weekly shift schedule</h1><table>${head}${rows}</table><p style="font-size:12px">Hours are paid hours: shift length minus the break shown. A shift where the end is earlier than the start runs past midnight and is counted on the day it starts. Overlap with the previous or next day is not checked, and no legal limits (rest periods, maximum hours) are checked.</p>`, 'td,th{text-align:center;vertical-align:top}@page{size:landscape}') };
  },
});

// ---------- time tracker log ----------
const durMin = (s) => { let m = /^(\d+(?:\.\d+)?)\s*h$/i.exec(s); if (m) return Math.round(parseFloat(m[1]) * 60); m = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i.exec(s); if (m && (m[1] || m[2])) return (+m[1] || 0) * 60 + (+m[2] || 0); m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(s); if (m) { let d = (+m[3] * 60 + +m[4]) - (+m[1] * 60 + +m[2]); if (d <= 0) d += 1440; return d; } return null; };
T.push({
  id: 'time-tracker-log-summary', cat: PRD, title: 'Time Tracker Log: Hours per Project and Day with CSV Export',
  desc: 'Paste your time entries, with start-end times or durations, and get totals per project and per day, a project-by-day grid and a CSV download.',
  inputs: 1, labels: ['One entry per line: date project time [note]. Time is 09:00-11:30 or 2.5h or 1h30m'], sample: '2026-10-19 Website 09:00-11:30 homepage\n2026-10-19 Admin 11:30-12:00 invoices\n2026-10-20 Website 2.5h forms\n2026-10-20 Support 1h30m tickets\n2026-10-21 Website 08:30-12:15',
  run: ([src]) => {
    const E = lines(src).map((l) => { const m = /^(\d{4}-\d{2}-\d{2})\s+(\S+)\s+(\d{1,2}:\d{2}-\d{1,2}:\d{2}|\d+(?:\.\d+)?\s*h|\d+\s*h\s*\d+\s*m|\d+\s*h|\d+\s*m)(?:\s+(.*))?$/i.exec(l); need(m, `Cannot read "${l.slice(0, 40)}": use date project time [note]`); const d = durMin(m[3].replace(/\s+/g, ' ').trim()); need(d != null && d > 0, `Bad time in "${l.slice(0, 40)}"`); return { date: m[1], proj: m[2], min: d, note: m[4] || '' }; });
    need(E.length, 'Enter at least one entry'); const hrs = (m) => fmt(m / 60, 4), P = {}, D = {}, G = {}; for (const e of E) { P[e.proj] = (P[e.proj] || 0) + e.min; D[e.date] = (D[e.date] || 0) + e.min; G[e.proj] = G[e.proj] || {}; G[e.proj][e.date] = (G[e.proj][e.date] || 0) + e.min; }
    const days = Object.keys(D).sort(), projs = Object.keys(P).sort(), total = E.reduce((a, e) => a + e.min, 0), pad = (s, n) => String(s).padEnd(n);
    const csv = 'date,project,minutes,hours,note\n' + E.map((e) => [e.date, e.proj, e.min, (e.min / 60).toFixed(2), '"' + e.note.replace(/"/g, '""') + '"'].join(',')).join('\n') + '\n';
    const txt = `Total: ${hrs(total)} h (${total} min) in ${E.length} entries over ${days.length} day${days.length > 1 ? 's' : ''}\n\nPer project (hours):\n` + projs.map((p) => `  ${pad(p, 16)} ${hrs(P[p]).padStart(8)}   ${(100 * P[p] / total).toFixed(1)}%`).join('\n') + '\n\nPer day (hours):\n' + days.map((d) => `  ${d}  ${hrs(D[d]).padStart(8)}`).join('\n') + '\n\nProject by day (hours):\n  ' + pad('', 16) + days.map((d) => d.slice(5).padStart(7)).join('') + '\n' + projs.map((p) => '  ' + pad(p, 16) + days.map((d) => (G[p][d] ? hrs(G[p][d]) : '-').padStart(7)).join('')).join('\n') + '\n\nThis tool adds up entries you type; it has no running timer (use the Stopwatch for that, then log the result). Entries that cross midnight are counted on the start date. Nothing is stored; the CSV is made in your browser.';
    return { text: txt, blob: new Blob([csv], { type: 'text/csv' }), filename: 'time-log.csv' };
  },
});

export default T;

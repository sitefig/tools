// Data / format / code tools (JSON, XML, YAML & TOML, CSV, Code Formatters, Code Generators).
// All hand-written, zero dependencies. Pure-text tools run under Node 22.
// Skipped: none needing server/network. (json-to-jsx, json-to-env, tailwind: not requested / not mine.)
// DOM tools: xml-validate, xpath-tester (DOMParser). Custom render tools: json-tree, csv-viewer.
// Ceilings: YAML = common subset (no tags beyond !!str, no complex ?-keys, no directives; comments are lost on
// re-format). JS formatter/minifier are token based (no AST): regex-vs-division after `)`/`}` is a heuristic.

// ---------- shared helpers ----------
const IND = (v) => (v === 'tab' ? '\t' : Math.max(0, Math.min(8, parseInt(v, 10) || 0)));
const indentOpt = { id: 'indent', label: 'Indent', type: 'select', choices: ['2', '4', '8', 'tab'], def: '2' };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const lc = (s, i) => { const b = s.slice(0, i).split('\n'); return [b.length, b[b.length - 1].length + 1]; };

function jsonErrAt(s) {
  let i = 0;
  const ws = () => { while (i < s.length && ' \t\n\r'.includes(s[i])) i++; };
  const bad = () => { throw { at: i }; };
  const num = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y, lit = /true|false|null/y;
  const str = () => {
    i++;
    for (;;) {
      if (i >= s.length) bad();
      const c = s[i];
      if (c === '"') { i++; return; }
      if (c < ' ') bad();
      if (c === '\\') {
        i++; const e = s[i];
        if (e === 'u') { if (!/^[0-9a-fA-F]{4}/.test(s.slice(i + 1, i + 5))) bad(); i += 5; }
        else if (e && '"\\/bfnrt'.includes(e)) i++; else bad();
      } else i++;
    }
  };
  const val = () => {
    ws(); const c = s[i];
    if (c === '{') {
      i++; ws(); if (s[i] === '}') { i++; return; }
      for (;;) { ws(); if (s[i] !== '"') bad(); str(); ws(); if (s[i] !== ':') bad(); i++; val(); ws(); if (s[i] === ',') { i++; continue; } if (s[i] === '}') { i++; return; } bad(); }
    }
    if (c === '[') {
      i++; ws(); if (s[i] === ']') { i++; return; }
      for (;;) { val(); ws(); if (s[i] === ',') { i++; continue; } if (s[i] === ']') { i++; return; } bad(); }
    }
    if (c === '"') return str();
    num.lastIndex = i; let m = num.exec(s);
    if (!m) { lit.lastIndex = i; m = lit.exec(s); }
    if (!m) bad();
    i += m[0].length;
  };
  try { val(); ws(); if (i < s.length) bad(); return -1; } catch (e) { if (e && typeof e.at === 'number') return e.at; throw e; }
}
function parseJ(s) {
  s = String(s);
  if (!s.trim()) throw new Error('Empty input');
  try { return JSON.parse(s); } catch (e) {
    const at = jsonErrAt(s);
    if (at < 0) throw new Error(e.message);
    const [l, c] = lc(s, at);
    throw new Error(`Invalid JSON at line ${l}, column ${c}: ${at >= s.length ? 'unexpected end of input' : `unexpected '${s[at]}'`}`);
  }
}
const sortKeys = (v, desc) => Array.isArray(v) ? v.map((x) => sortKeys(x, desc))
  : isObj(v) ? Object.fromEntries(Object.keys(v).sort((a, b) => (desc ? -1 : 1) * (a < b ? -1 : a > b ? 1 : 0)).map((k) => [k, sortKeys(v[k], desc)])) : v;
const idRe = /^[A-Za-z_$][\w$]*$/;
const jpath = (p, k) => (typeof k === 'number' ? `${p}[${k}]` : idRe.test(k) ? `${p}.${k}` : `${p}[${JSON.stringify(k)}]`);
const pascal = (s) => String(s).replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Item';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k === 'style') e.style.cssText = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k in e) e[k] = v; else e.setAttribute(k, v); }
  e.append(...kids.flat().filter((x) => x != null));
  return e;
};

// ---------- JSON ----------
const jsonSample = '{"name":"Ada Lovelace","born":1815,"tags":["math","code"],"address":{"city":"London","geo":{"lat":51.5,"lng":-0.12}},"active":true,"spouse":null,"zeta":1,"alpha":[{"id":1,"v":"x"},{"id":2,"v":"y","extra":false}]}';

function unescapeStr(s) {
  const map = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '/': '/', '\\': '\\', '"': '"', "'": "'" };
  return s.replace(/\\(u[0-9a-fA-F]{4}|[\s\S])/g, (m, g) => (g[0] === 'u' && g.length === 5 ? String.fromCharCode(parseInt(g.slice(1), 16)) : g in map ? map[g] : m));
}

function jsonDiff(a, b, path, out) {
  const ta = typeOf(a), tb = typeOf(b);
  if (ta !== tb || (ta !== 'object' && ta !== 'array')) { if (a !== b) out.push(`~ ${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`); return; }
  if (ta === 'array') {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (i >= a.length) out.push(`+ ${jpath(path, i)}: ${JSON.stringify(b[i])}`);
      else if (i >= b.length) out.push(`- ${jpath(path, i)}: ${JSON.stringify(a[i])}`);
      else jsonDiff(a[i], b[i], jpath(path, i), out);
    }
    return;
  }
  for (const k of Object.keys(a)) { if (k in b) jsonDiff(a[k], b[k], jpath(path, k), out); else out.push(`- ${jpath(path, k)}: ${JSON.stringify(a[k])}`); }
  for (const k of Object.keys(b)) if (!(k in a)) out.push(`+ ${jpath(path, k)}: ${JSON.stringify(b[k])}`);
}

const csvCell = (v, d) => { const s = v == null ? '' : String(v); return s.includes(d) || /["\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const DELIMS = { auto: 'auto', comma: ',', semicolon: ';', tab: '\t', pipe: '|' };
const delimOpt = (auto = true) => ({ id: 'delim', label: 'Delimiter', type: 'select', choices: auto ? ['auto', 'comma', 'semicolon', 'tab', 'pipe'] : ['comma', 'semicolon', 'tab', 'pipe'], def: auto ? 'auto' : 'comma' });

function flatten(v, prefix, out) {
  if (v && typeof v === 'object') {
    const ents = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);
    if (!ents.length) { out[prefix || 'value'] = Array.isArray(v) ? '[]' : '{}'; return out; }
    for (const [k, x] of ents) flatten(x, prefix === '' ? String(k) : prefix + '.' + k, out);
  } else out[prefix || 'value'] = v;
  return out;
}

function jsonToCsv(text, o) {
  const d = DELIMS[o.delim] || ',';
  let v = parseJ(text);
  if (!Array.isArray(v)) v = [v];
  const rows = v.map((r) => (o.flatten ? flatten(r, '', {}) : isObj(r) ? Object.fromEntries(Object.entries(r).map(([k, x]) => [k, x && typeof x === 'object' ? JSON.stringify(x) : x])) : { value: r }));
  const cols = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  return [cols.map((c) => csvCell(c, d)).join(d), ...rows.map((r) => cols.map((c) => csvCell(r[c], d)).join(d))].join('\n');
}

// XML name/escape helpers for json-to-xml
const xesc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const xattr = (s) => xesc(s).replace(/"/g, '&quot;');
const xname = (k) => { let n = String(k).replace(/[^\w.\-:\u00B7-\uFFFF]/g, '_'); if (!/^[A-Za-z_\u00C0-\uFFFF]/.test(n)) n = '_' + n; return n; };
function jsonToXml(v, name, ind) {
  const nl = ind ? '\n' : '';
  const node = (key, val, pad) => {
    const n = xname(key);
    if (Array.isArray(val)) return val.map((x) => node(key, x, pad)).join(nl);
    if (val === null || val === undefined) return `${pad}<${n}/>`;
    if (!isObj(val)) return `${pad}<${n}>${xesc(val)}</${n}>`;
    let attrs = '', text = '';
    const kids = [];
    for (const [k, x] of Object.entries(val)) {
      if (k[0] === '@' && !isObj(x) && !Array.isArray(x)) attrs += ` ${xname(k.slice(1))}="${xattr(x ?? '')}"`;
      else if (k === '#text') text = xesc(x);
      else kids.push(node(k, x, pad + ind));
    }
    if (!kids.length) return text ? `${pad}<${n}${attrs}>${text}</${n}>` : `${pad}<${n}${attrs}/>`;
    return `${pad}<${n}${attrs}>${text}${nl}${kids.join(nl)}${nl}${pad}</${n}>`;
  };
  const body = Array.isArray(v) ? node(name, { item: v }, '') : isObj(v) && Object.keys(v).length === 1 && !name ? node(Object.keys(v)[0], Object.values(v)[0], '') : node(name || 'root', v, '');
  return '<?xml version="1.0" encoding="UTF-8"?>' + nl + body;
}

// ---------- JSON type inference (TS / Go / Zod / JSON Schema) ----------
const P = (n) => ({ t: 'prim', n });
function infer(v) {
  if (v === null) return { t: 'null' };
  if (Array.isArray(v)) return { t: 'arr', e: v.length ? v.map(infer).reduce(mergeT) : null };
  if (typeof v === 'object') return { t: 'obj', p: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, { ty: infer(x), opt: false }])) };
  if (typeof v === 'number') return P(Number.isInteger(v) ? 'integer' : 'number');
  return P(typeof v);
}
const members = (t) => (t.t === 'union' ? t.ts : [t]);
function mergeT(a, b) {
  const all = [...members(a), ...members(b)], res = [];
  for (const m of all) {
    const same = res.find((r) => r.t === m.t && (m.t !== 'prim' || r.n === m.n));
    if (same) {
      if (m.t === 'arr') same.e = same.e && m.e ? mergeT(same.e, m.e) : same.e || m.e;
      if (m.t === 'obj') {
        for (const k of new Set([...Object.keys(same.p), ...Object.keys(m.p)])) {
          const x = same.p[k], y = m.p[k];
          same.p[k] = x && y ? { ty: mergeT(x.ty, y.ty), opt: x.opt || y.opt } : { ty: (x || y).ty, opt: true };
        }
      }
    } else if (m.t === 'prim' && (m.n === 'number' || m.n === 'integer') && res.find((r) => r.t === 'prim' && (r.n === 'number' || r.n === 'integer'))) {
      res.find((r) => r.t === 'prim' && (r.n === 'number' || r.n === 'integer')).n = 'number';
    } else res.push(structuredClone(m));
  }
  return res.length === 1 ? res[0] : { t: 'union', ts: res };
}
const singular = (k) => String(k).replace(/ies$/i, 'y').replace(/(s|x|ch|sh)es$/i, '$1').replace(/([^s])s$/i, '$1');
function namer() { const used = new Set(); return (h) => { let b = pascal(h), n = b, i = 2; while (used.has(n)) n = b + i++; used.add(n); return n; }; }
const keyQ = (k) => (idRe.test(k) ? k : JSON.stringify(k));

function toTS(v, o) {
  const t = infer(v), uniq = namer(), decls = [], iface = o.style === 'interface';
  const ty = (t, hint) => {
    if (t.t === 'prim') return t.n === 'integer' ? 'number' : t.n;
    if (t.t === 'null') return 'null';
    if (t.t === 'arr') { if (!t.e) return 'unknown[]'; const x = ty(t.e, singular(hint)); return t.e.t === 'union' ? `(${x})[]` : x + '[]'; }
    if (t.t === 'union') return t.ts.map((m) => ty(m, hint)).join(' | ');
    const name = uniq(hint), idx = decls.length; decls.push('');
    const lines = Object.entries(t.p).map(([k, p]) => `  ${keyQ(k)}${p.opt && o.optional ? '?' : ''}: ${ty(p.ty, k)};`);
    decls[idx] = iface ? `export interface ${name} {\n${lines.join('\n')}\n}` : `export type ${name} = {\n${lines.join('\n')}\n};`;
    return name;
  };
  const r = ty(t, o.root || 'Root');
  if (t.t !== 'obj') decls.unshift(`export type ${o.root || 'Root'} = ${r};`);
  return decls.join('\n\n');
}

const GOI = { Id: 'ID', Url: 'URL', Uri: 'URI', Api: 'API', Http: 'HTTP', Html: 'HTML', Json: 'JSON', Uuid: 'UUID', Ip: 'IP', Sql: 'SQL', Xml: 'XML' };
const goName = (k) => { let n = String(k).replace(/[^A-Za-z0-9]+/g, ' ').trim().replace(/([a-z])([A-Z])/g, '$1 $2').split(' ').filter(Boolean).map((w) => { w = w[0].toUpperCase() + w.slice(1).toLowerCase(); return GOI[w] || w; }).join(''); if (!n) n = 'Field'; return /^\d/.test(n) ? 'F' + n : n; };
function toGo(v, o) {
  const t = infer(v), uniq = namer(), decls = [];
  const ty = (t, hint) => {
    if (t.t === 'prim') return { string: 'string', boolean: 'bool', integer: 'int64', number: 'float64' }[t.n];
    if (t.t === 'null') return 'interface{}';
    if (t.t === 'arr') return '[]' + (t.e ? ty(t.e, singular(hint)) : 'interface{}');
    if (t.t === 'union') {
      const nn = t.ts.filter((m) => m.t !== 'null');
      if (nn.length === 1 && nn.length < t.ts.length) { const x = ty(nn[0], hint); return /^(\[|\*|interface)/.test(x) ? x : '*' + x; }
      return 'interface{}';
    }
    const name = uniq(goName(hint)), idx = decls.length; decls.push('');
    const ents = Object.entries(t.p), w = Math.max(...ents.map(([k]) => goName(k).length), 0);
    const tys = ents.map(([k, p]) => ty(p.ty, k)), tw = Math.max(...tys.map((x) => x.length), 0);
    const f = ents.map(([k, p], i) => `\t${goName(k).padEnd(w)} ${tys[i].padEnd(tw)} \`json:"${k}${p.opt ? ',omitempty' : ''}"\``);
    decls[idx] = `type ${name} struct {\n${f.join('\n')}\n}`;
    return name;
  };
  const r = ty(t, o.root || 'Root');
  if (t.t !== 'obj') decls.unshift(`type ${goName(o.root || 'Root')} ${r}`);
  return decls.join('\n\n');
}

function toZod(v, o) {
  const t = infer(v);
  const z = (t, pad) => {
    if (t.t === 'prim') return { string: 'z.string()', boolean: 'z.boolean()', integer: 'z.number().int()', number: 'z.number()' }[t.n];
    if (t.t === 'null') return 'z.null()';
    if (t.t === 'arr') return `z.array(${t.e ? z(t.e, pad) : 'z.unknown()'})`;
    if (t.t === 'union') {
      const nn = t.ts.filter((m) => m.t !== 'null'), nullable = nn.length < t.ts.length;
      const base = nn.length === 1 ? z(nn[0], pad) : `z.union([${nn.map((m) => z(m, pad)).join(', ')}])`;
      return nullable ? base + '.nullable()' : base;
    }
    const ents = Object.entries(t.p);
    if (!ents.length) return 'z.object({})';
    return `z.object({\n${ents.map(([k, p]) => `${pad}  ${keyQ(k)}: ${z(p.ty, pad + '  ')}${p.opt ? '.optional()' : ''},`).join('\n')}\n${pad}})`;
  };
  const name = o.root || 'Root';
  return `import { z } from 'zod';\n\nexport const ${name}Schema = ${z(t, '')};\n\nexport type ${name} = z.infer<typeof ${name}Schema>;`;
}

const FORMATS = [['date-time', /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/i], ['date', /^\d{4}-\d\d-\d\d$/], ['email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/], ['uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i], ['uri', /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i], ['ipv4', /^(\d{1,3}\.){3}\d{1,3}$/]];
function toSchema(v, o) {
  const t = infer(v);
  const sch = (t) => {
    if (t.t === 'prim') return { type: t.n };
    if (t.t === 'null') return { type: 'null' };
    if (t.t === 'arr') return t.e ? { type: 'array', items: sch(t.e) } : { type: 'array' };
    if (t.t === 'union') {
      const ms = t.ts.map(sch);
      if (ms.every((m) => Object.keys(m).length === 1)) return { type: ms.map((m) => m.type) };
      return { anyOf: ms };
    }
    const r = { type: 'object', properties: Object.fromEntries(Object.entries(t.p).map(([k, p]) => [k, sch(p.ty)])) };
    const req = Object.entries(t.p).filter(([, p]) => !p.opt).map(([k]) => k);
    if (o.required && req.length) r.required = req;
    if (o.strict) r.additionalProperties = false;
    return r;
  };
  const addFormats = (s, val) => {
    if (!o.formats) return;
    if (s.type === 'string' && typeof val === 'string') { const f = FORMATS.find(([, re]) => re.test(val)); if (f) s.format = f[0]; }
    else if (isObj(val) && s.properties) for (const k of Object.keys(s.properties)) addFormats(s.properties[k], val[k]);
    else if (Array.isArray(val) && s.items) for (const x of val.slice(0, 1)) addFormats(s.items, x);
  };
  const s = sch(t);
  addFormats(s, v);
  return JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', ...s }, null, 2);
}

// ---------- JSON Schema validator ----------
function validateSchema(schema, data) {
  const errs = [];
  const root = schema;
  const resolve = (ref) => {
    if (ref === '#') return root;
    if (!ref.startsWith('#/')) throw new Error(`Only local $ref supported: ${ref}`);
    let n = root;
    for (const p of ref.slice(2).split('/')) { n = n?.[decodeURIComponent(p).replace(/~1/g, '/').replace(/~0/g, '~')]; }
    if (n === undefined) throw new Error(`Unresolvable $ref: ${ref}`);
    return n;
  };
  const eq = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
  const isType = (t, v) => (t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number' : t === 'null' ? v === null : t === 'array' ? Array.isArray(v) : t === 'object' ? isObj(v) : typeof v === t);
  const fmt = (f, s) => { const x = FORMATS.find(([n]) => n === f); return !x || x[1].test(s); };
  const check = (s, v, path, depth = 0) => {
    if (s === true || s === undefined) return;
    if (s === false) { errs.push(`${path}: not allowed`); return; }
    if (depth > 100) throw new Error('Schema recursion too deep');
    const e = (m) => errs.push(`${path}: ${m}`);
    const sub = (s2, v2, p2) => { const before = errs.length; check(s2, v2, p2, depth + 1); return errs.splice(before).length === 0; };
    if (s.$ref) check(resolve(s.$ref), v, path, depth + 1);
    if (s.type !== undefined) { const ts = [].concat(s.type); if (!ts.some((t) => isType(t, v))) { e(`expected ${ts.join(' | ')}, got ${typeOf(v)}`); return; } }
    if (s.enum && !s.enum.some((x) => eq(x, v))) e(`must be one of ${JSON.stringify(s.enum)}`);
    if ('const' in s && !eq(s.const, v)) e(`must equal ${JSON.stringify(s.const)}`);
    if (typeof v === 'number') {
      if (s.minimum !== undefined && v < s.minimum) e(`must be >= ${s.minimum}`);
      if (s.maximum !== undefined && v > s.maximum) e(`must be <= ${s.maximum}`);
      if (typeof s.exclusiveMinimum === 'number' && v <= s.exclusiveMinimum) e(`must be > ${s.exclusiveMinimum}`);
      if (typeof s.exclusiveMaximum === 'number' && v >= s.exclusiveMaximum) e(`must be < ${s.exclusiveMaximum}`);
      if (s.multipleOf && Math.abs(v / s.multipleOf - Math.round(v / s.multipleOf)) > 1e-9) e(`must be a multiple of ${s.multipleOf}`);
    }
    if (typeof v === 'string') {
      const len = [...v].length;
      if (s.minLength !== undefined && len < s.minLength) e(`length must be >= ${s.minLength}`);
      if (s.maxLength !== undefined && len > s.maxLength) e(`length must be <= ${s.maxLength}`);
      if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) e(`must match pattern ${s.pattern}`);
      if (s.format && !fmt(s.format, v)) e(`must be a valid ${s.format}`);
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) e(`must have >= ${s.minItems} items`);
      if (s.maxItems !== undefined && v.length > s.maxItems) e(`must have <= ${s.maxItems} items`);
      if (s.uniqueItems && v.some((x, i) => v.findIndex((y) => eq(x, y)) !== i)) e('items must be unique');
      const tup = s.prefixItems || (Array.isArray(s.items) ? s.items : null);
      v.forEach((x, i) => {
        if (tup && i < tup.length) check(tup[i], x, `${path}[${i}]`, depth + 1);
        else if (s.items && !Array.isArray(s.items)) check(s.items, x, `${path}[${i}]`, depth + 1);
        else if (tup && s.additionalItems !== undefined) check(s.additionalItems, x, `${path}[${i}]`, depth + 1);
      });
      if (s.contains && !v.some((x, i) => sub(s.contains, x, `${path}[${i}]`))) e('no item matches "contains"');
    }
    if (isObj(v)) {
      const keys = Object.keys(v), props = s.properties || {}, pp = s.patternProperties || {};
      for (const r of s.required || []) if (!(r in v)) e(`missing required property "${r}"`);
      if (s.minProperties !== undefined && keys.length < s.minProperties) e(`must have >= ${s.minProperties} properties`);
      if (s.maxProperties !== undefined && keys.length > s.maxProperties) e(`must have <= ${s.maxProperties} properties`);
      for (const k of keys) {
        let matched = false;
        if (k in props) { matched = true; check(props[k], v[k], jpath(path, k), depth + 1); }
        for (const re of Object.keys(pp)) if (new RegExp(re, 'u').test(k)) { matched = true; check(pp[re], v[k], jpath(path, k), depth + 1); }
        if (!matched && s.additionalProperties !== undefined) {
          if (s.additionalProperties === false) errs.push(`${jpath(path, k)}: additional property not allowed`);
          else check(s.additionalProperties, v[k], jpath(path, k), depth + 1);
        }
      }
      for (const [k, d] of Object.entries(s.dependentRequired || {})) if (k in v) for (const r of d) if (!(r in v)) e(`"${k}" requires "${r}"`);
    }
    if (s.allOf) for (const x of s.allOf) check(x, v, path, depth + 1);
    if (s.anyOf && !s.anyOf.some((x) => sub(x, v, path))) e('must match at least one schema in anyOf');
    if (s.oneOf) { const n = s.oneOf.filter((x) => sub(x, v, path)).length; if (n !== 1) e(`must match exactly one schema in oneOf (matched ${n})`); }
    if (s.not && sub(s.not, v, path)) e('must not match the "not" schema');
    if (s.if !== undefined) { if (sub(s.if, v, path)) { if (s.then) check(s.then, v, path, depth + 1); } else if (s.else) check(s.else, v, path, depth + 1); }
  };
  check(schema, data, '$');
  return errs;
}

// ---------- JSONPath ----------
function unparen(x) {
  if (x[0] !== '(') return x;
  let d = 0;
  for (let k = 0; k < x.length; k++) { if (x[k] === '(') d++; else if (x[k] === ')' && --d === 0) return k === x.length - 1 ? x.slice(1, -1) : x; }
  return x;
}
function jpParse(src) {
  let i = 0;
  const s = src.trim();
  const fail = (m) => { throw new Error(`JSONPath error at ${i}: ${m}`); };
  const quoted = () => { const q = s[i++]; let r = ''; while (i < s.length && s[i] !== q) { if (s[i] === '\\') { i++; r += s[i] === 'n' ? '\n' : s[i]; } else r += s[i]; i++; } if (s[i] !== q) fail('unterminated string'); i++; return r; };
  const segs = (inFilter) => {
    const out = [];
    const nameRe = inFilter ? /[\w$\u0080-\uFFFF]+/y : /[\w$\-\u0080-\uFFFF]+/y;
    for (;;) {
      let desc = false;
      if (s[i] === '.' && s[i + 1] === '.') { desc = true; i += 2; }
      else if (s[i] === '.') i++;
      else if (s[i] !== '[') break;
      if (s[i] === '[') { out.push({ ...bracket(), desc }); continue; }
      if (s[i] === '*') { i++; out.push({ k: 'wild', desc }); continue; }
      nameRe.lastIndex = i; const m = nameRe.exec(s);
      if (!m) { if (desc) fail('expected name after ..'); break; }
      i += m[0].length; out.push({ k: 'sel', sel: [m[0]], desc });
    }
    return out;
  };
  const bracket = () => {
    i++; const sel = [];
    for (;;) {
      while (s[i] === ' ') i++;
      const c = s[i];
      if (c === '*') { i++; sel.push({ w: 1 }); }
      else if (c === '"' || c === "'") sel.push(quoted());
      else if (c === '?') {
        i++; let d = 0, j = i;
        for (; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')') d--; else if (s[j] === "'" || s[j] === '"') { const q = s[j++]; while (j < s.length && s[j] !== q) { if (s[j] === '\\') j++; j++; } } else if ((s[j] === ']' || s[j] === ',') && d <= 0) break; }
        sel.push({ f: fparse(unparen(s.slice(i, j).trim())) }); i = j;
      } else {
        const m = /(-?\d+)?\s*(:\s*(-?\d+)?\s*(:\s*(-?\d+)?)?)?/y; m.lastIndex = i; const r = m.exec(s);
        if (!r || !r[0]) fail('bad selector');
        i += r[0].length;
        if (r[2] !== undefined) sel.push({ sl: [r[1], r[3], r[5]].map((x) => (x === undefined ? undefined : +x)) }); else sel.push(+r[1]);
      }
      while (s[i] === ' ') i++;
      if (s[i] === ',') { i++; continue; }
      if (s[i] === ']') { i++; break; }
      fail("expected ',' or ']'");
    }
    return { k: 'sel', sel };
  };
  // filter expressions
  const fparse = (expr) => {
    const e = expr; let p = 0;
    const ws = () => { while (e[p] === ' ') p++; };
    const or = () => { let l = and(); for (;;) { ws(); if (e.startsWith('||', p)) { p += 2; const r = and(); const a = l; l = (c) => truthy(a(c)) || truthy(r(c)); } else return l; } };
    const and = () => { let l = cmp(); for (;;) { ws(); if (e.startsWith('&&', p)) { p += 2; const r = cmp(); const a = l; l = (c) => truthy(a(c)) && truthy(r(c)); } else return l; } };
    const truthy = (v) => (Array.isArray(v?.__nodes) ? v.__nodes.length > 0 : !!v);
    const val = (v) => (v && v.__nodes ? v.__nodes[0]?.v : v);
    const cmp = () => {
      const l = unary(); ws();
      const m = /^(===|!==|==|!=|<=|>=|=~|<|>)/.exec(e.slice(p));
      if (!m) return l;
      p += m[0].length; ws();
      let rgx = null;
      if (m[0] === '=~') { const rm = /\/((?:\\.|[^/])+)\/([a-z]*)/y; rm.lastIndex = p; const r = rm.exec(e); if (!r) fail('bad regex'); p += r[0].length; rgx = new RegExp(r[1], r[2]); }
      const r = rgx ? null : unary();
      return (c) => {
        const a = val(l(c));
        if (rgx) return typeof a === 'string' && rgx.test(a);
        const b = val(r(c));
        switch (m[0]) { case '==': case '===': return JSON.stringify(a) === JSON.stringify(b); case '!=': case '!==': return JSON.stringify(a) !== JSON.stringify(b); case '<': return a < b; case '>': return a > b; case '<=': return a <= b; default: return a >= b; }
      };
    };
    const unary = () => {
      ws();
      if (e[p] === '!') { p++; const x = unary(); return (c) => !truthy(x(c)); }
      if (e[p] === '(') { p++; const x = or(); ws(); if (e[p] !== ')') fail('missing )'); p++; return x; }
      if (e[p] === '@' || e[p] === '$') {
        const root = e[p] === '$'; p++;
        const sub = e.slice(p);
        const inner = jpFilterSegs(sub);
        p += inner.used;
        return (c) => ({ __nodes: applySegs(inner.segs, [{ v: root ? c.root : c.cur, path: '' }], c.root) });
      }
      let m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(e.slice(p));
      if (m) { p += m[0].length; const n = +m[0]; return () => n; }
      if (e[p] === '"' || e[p] === "'") { const q = e[p++]; let r = ''; while (p < e.length && e[p] !== q) { if (e[p] === '\\') p++; r += e[p++]; } p++; return () => r; }
      m = /^(true|false|null)/.exec(e.slice(p));
      if (m) { p += m[0].length; const n = JSON.parse(m[0]); return () => n; }
      fail(`unexpected '${e[p] ?? 'end'}' in filter`);
    };
    const f = or();
    ws(); if (p < e.length) fail(`unexpected '${e.slice(p)}' in filter`);
    return f;
  };
  if (s[0] === '$') i = 1;
  const out = segs(false);
  if (i < s.length) fail(`unexpected '${s[i]}'`);
  return out;
}
function jpFilterSegs(sub) {
  // parse path segments inside a filter expression; returns {segs, used}
  const wrapped = '$' + sub;
  let end = 0;
  // find extent: consume .name / ['x'] / [n] / .* repeatedly
  const re = /^(?:\.\.?[\w$\u0080-\uFFFF]+|\.\*|\[(?:'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|[^\]]*)\])/;
  let rest = sub;
  for (let m; (m = re.exec(rest)); ) { end += m[0].length; rest = sub.slice(end); }
  return { segs: jpParse(wrapped.slice(0, 1 + end)), used: end };
}
function applySegs(segs, nodes, root) {
  for (const sg of segs) {
    const next = [];
    for (const nd of nodes) {
      const scope = sg.desc ? descend(nd) : [nd];
      for (const n of scope) {
        const v = n.v, kids = isObj(v) ? Object.keys(v) : Array.isArray(v) ? v.map((_, i) => i) : [];
        const push = (k) => next.push({ v: v[k], path: jpath(n.path, k) });
        if (sg.k === 'wild') { kids.forEach(push); continue; }
        for (const s of sg.sel) {
          if (typeof s === 'string') {
            if (isObj(v) && Object.hasOwn(v, s)) push(s);
            else if (s === 'length' && (Array.isArray(v) || typeof v === 'string')) next.push({ v: v.length, path: n.path + '.length' });
          } else if (typeof s === 'number') { if (Array.isArray(v)) { const k = s < 0 ? v.length + s : s; if (k >= 0 && k < v.length) push(k); } }
          else if (s.w) kids.forEach(push);
          else if (s.sl && Array.isArray(v)) {
            const st = s.sl[2] ?? 1, len = v.length;
            if (st > 0) { let a = s.sl[0] ?? 0, b = s.sl[1] ?? len; a = a < 0 ? Math.max(len + a, 0) : Math.min(a, len); b = b < 0 ? Math.max(len + b, 0) : Math.min(b, len); for (let k = a; k < b; k += st) push(k); }
            else if (st < 0) { let a = s.sl[0] ?? len - 1, b = s.sl[1] ?? -len - 1; a = a < 0 ? len + a : Math.min(a, len - 1); b = b < 0 ? len + b : b; for (let k = a; k > b && k >= 0; k += st) push(k); }
          } else if (s.f) for (const k of kids) { const c = { cur: v[k], root: root }; const r = s.f(c); if (r && r.__nodes ? r.__nodes.length : r) push(k); }
        }
      }
    }
    nodes = next;
  }
  return nodes;
}
function descend(n) {
  const out = [n];
  const v = n.v;
  const ks = isObj(v) ? Object.keys(v) : Array.isArray(v) ? v.map((_, i) => i) : [];
  for (const k of ks) out.push(...descend({ v: v[k], path: jpath(n.path, k) }));
  return out;
}
function jsonPath(data, path) {
  const segs = jpParse(path.trim().startsWith('$') ? path.trim() : '$' + (path.trim()[0] === '[' || path.trim()[0] === '.' ? '' : '.') + path.trim());
  return applySegs(segs, [{ v: data, path: '$' }], data);
}

// ---------- CSV ----------
function detectDelim(t) {
  const first = (t.split(/\r?\n/)[0] || ''); let best = ',', bc = 0;
  for (const d of [',', ';', '\t', '|']) { let q = false, n = 0; for (const c of first) { if (c === '"') q = !q; else if (!q && c === d) n++; } if (n > bc) { bc = n; best = d; } }
  return best;
}
function parseCSV(t, delim) {
  t = String(t).replace(/^﻿/, '');
  const d = delim === 'auto' || !delim ? detectDelim(t) : delim;
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"' && f === '') q = true;
    else if (c === d) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (q) throw new Error('CSV error: unterminated quoted field');
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}
function infer1(s) {
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(s) && s.replace(/[^0-9]/g, '').length < 16) return Number(s);
  if (s === 'true' || s === 'false') return s === 'true';
  if (s === 'null') return null;
  return s;
}
function csvObjects(rows, header) {
  if (!header) return rows;
  const seen = {}, heads = (rows[0] || []).map((h, i) => { h = h.trim() || `column${i + 1}`; seen[h] = (seen[h] || 0) + 1; return seen[h] > 1 ? `${h}_${seen[h]}` : h; });
  return rows.slice(1).map((r) => { const o = {}; heads.forEach((h, i) => { o[h] = r[i] ?? ''; }); for (let i = heads.length; i < r.length; i++) o[`column${i + 1}`] = r[i]; return o; });
}

// ---------- XML / HTML trees ----------
function parseAttrs(str) {
  const out = [], re = /([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (let m; (m = re.exec(str)); ) out.push([m[1], m[2] ?? m[3] ?? m[4] ?? null]);
  return out;
}
const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };
const decodeEnt = (s) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, g) => (g[0] === '#' ? String.fromCodePoint(g[1] === 'x' ? parseInt(g.slice(2), 16) : +g.slice(1)) : ENT[g] ?? m));
const attrStr = (a) => a.map(([k, v]) => (v === null ? ` ${k}` : ` ${k}=${v.includes('"') && !v.includes("'") ? `'${v}'` : `"${v.replace(/"/g, '&quot;')}"`}`)).join('');

function parseXML(src) {
  const root = { t: 'doc', k: [] }, stack = [root];
  let i = 0;
  const err = (m, at = i) => { const [l, c] = lc(src, at); throw new Error(`XML error at line ${l}, column ${c}: ${m}`); };
  const push = (n) => stack[stack.length - 1].k.push(n);
  const nameRe = /^[A-Za-z_:À-￿][\w:.\-·-￿]*$/;
  src = src.replace(/^﻿/, '');
  while (i < src.length) {
    if (src[i] !== '<') {
      const j = src.indexOf('<', i), e = j < 0 ? src.length : j, v = src.slice(i, e);
      if (stack.length === 1 && v.trim()) err('text outside root element');
      push({ t: 'text', v }); i = e; continue;
    }
    if (src.startsWith('<!--', i)) { const j = src.indexOf('-->', i + 4); if (j < 0) err('unterminated comment'); push({ t: 'cm', v: src.slice(i + 4, j) }); i = j + 3; }
    else if (src.startsWith('<![CDATA[', i)) { const j = src.indexOf(']]>', i); if (j < 0) err('unterminated CDATA'); push({ t: 'cd', v: src.slice(i + 9, j) }); i = j + 3; }
    else if (src.startsWith('<?', i)) { const j = src.indexOf('?>', i); if (j < 0) err('unterminated processing instruction'); push({ t: 'pi', v: src.slice(i + 2, j) }); i = j + 2; }
    else if (src.startsWith('<!', i)) {
      let j = i + 2, d = 0;
      for (; j < src.length; j++) { if (src[j] === '[') d++; else if (src[j] === ']') d--; else if (src[j] === '>' && d <= 0) break; }
      if (j >= src.length) err('unterminated declaration');
      push({ t: 'dt', v: src.slice(i + 2, j) }); i = j + 1;
    } else if (src[i + 1] === '/') {
      const m = /^<\/([^\s>]+)\s*>/.exec(src.slice(i, i + 300));
      if (!m) err('malformed closing tag');
      const top = stack[stack.length - 1];
      if (stack.length === 1 || top.n !== m[1]) err(stack.length === 1 ? `unexpected closing tag </${m[1]}>` : `mismatched closing tag </${m[1]}>, expected </${top.n}>`);
      stack.pop(); i += m[0].length;
    } else {
      const m = /^<([^\s\/>]+)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/.exec(src.slice(i));
      if (!m) err('malformed tag');
      if (!nameRe.test(m[1])) err(`invalid element name "${m[1]}"`);
      if (stack.length === 1 && root.k.some((x) => x.t === 'el')) err('multiple root elements');
      const a = parseAttrs(m[2]);
      if (new Set(a.map((x) => x[0])).size !== a.length) err(`duplicate attribute in <${m[1]}>`);
      for (const [, v] of a) if (v === null) err(`attribute without value in <${m[1]}>`);
      const n = { t: 'el', n: m[1], a, k: [], sc: !!m[3] };
      push(n); if (!m[3]) stack.push(n);
      i += m[0].length;
    }
  }
  if (stack.length > 1) err(`unclosed element <${stack[stack.length - 1].n}>`, src.length);
  if (!root.k.some((x) => x.t === 'el')) err('no root element', 0);
  return root;
}
const isWs = (n) => n.t === 'text' && !n.v.trim();
function xmlSer(n, pretty, ind, depth, comments) {
  const pad = pretty ? ind.repeat(depth) : '', nl = pretty ? '\n' : '';
  switch (n.t) {
    case 'text': return n.v;
    case 'cd': return `<![CDATA[${n.v}]]>`;
    case 'cm': return comments ? `${pad}<!--${n.v}-->` : '';
    case 'pi': return `${pad}<?${n.v}?>`;
    case 'dt': return `${pad}<!${n.v}>`;
    case 'doc': return n.k.filter((x) => !isWs(x)).map((x) => xmlSer(x, pretty, ind, 0, comments)).filter(Boolean).join(nl);
  }
  const open = `<${n.n}${attrStr(n.a)}`;
  if (n.sc) return `${pad}${open}/>`;
  const hasText = n.k.some((x) => (x.t === 'text' && x.v.trim()) || x.t === 'cd');
  const kids = hasText ? n.k : n.k.filter((x) => !isWs(x));
  if (!kids.length) return `${pad}${open}></${n.n}>`;
  if (hasText) { // text or mixed content: keep children inline, exactly as written
    const inner = kids.map((x) => (x.t === 'el' ? xmlSer(x, false, '', 0, comments) : x.t === 'text' ? x.v : xmlSer(x, false, '', 0, comments).trim())).join('');
    return `${pad}${open}>${pretty && !kids.some((x) => x.t === 'el') ? inner.trim() : inner}</${n.n}>`;
  }
  const inner = kids.map((x) => xmlSer(x, pretty, ind, depth + 1, comments)).filter(Boolean).join(nl);
  if (!inner) return `${pad}${open}></${n.n}>`;
  return `${pad}${open}>${nl}${inner}${nl}${pad}</${n.n}>`;
}

function xmlToJson(n, pre) {
  const conv = (e) => {
    const o = {}; let text = '';
    for (const [k, v] of e.a) o[pre + k] = decodeEnt(v);
    const kids = e.k.filter((x) => x.t === 'el');
    for (const x of e.k) if (x.t === 'text') text += decodeEnt(x.v); else if (x.t === 'cd') text += x.v;
    for (const c of kids) {
      const v = conv(c);
      if (c.n in o) { if (!Array.isArray(o[c.n])) o[c.n] = [o[c.n]]; o[c.n].push(v); } else o[c.n] = v;
    }
    text = kids.length ? text.trim() : text.trim();
    if (!e.a.length && !kids.length) return text === '' ? null : text;
    if (text) o['#text'] = text;
    return o;
  };
  const r = n.k.find((x) => x.t === 'el');
  return { [r.n]: conv(r) };
}

const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const RAWT = new Set(['script', 'style', 'textarea']);
const INLINE = new Set('a abbr acronym b bdi bdo big button cite code data del dfn em font i img input ins kbd label mark q s samp select small span strike strong sub sup textarea time tt u var br wbr'.split(' '));
const AUTOCLOSE = { li: ['li'], dt: ['dt', 'dd'], dd: ['dt', 'dd'], option: ['option'], tr: ['tr', 'td', 'th'], td: ['td', 'th'], th: ['td', 'th'], p: ['p'], thead: ['tbody', 'tfoot'], tbody: ['thead', 'tbody'] };
function parseHTML(src) {
  const root = { t: 'doc', k: [] }, stack = [root];
  const top = () => stack[stack.length - 1];
  let i = 0;
  while (i < src.length) {
    if (src[i] !== '<') { const j = src.indexOf('<', i), e = j < 0 ? src.length : j; top().k.push({ t: 'text', v: src.slice(i, e) }); i = e; continue; }
    if (src.startsWith('<!--', i)) { const j = src.indexOf('-->', i + 4), e = j < 0 ? src.length : j; top().k.push({ t: 'cm', v: src.slice(i + 4, e) }); i = j < 0 ? src.length : j + 3; continue; }
    let m = /^<!([^>]*)>/.exec(src.slice(i, i + 2000));
    if (m) { top().k.push({ t: 'dt', v: m[1] }); i += m[0].length; continue; }
    m = /^<\/([a-zA-Z][^\s>]*)\s*>/.exec(src.slice(i, i + 300));
    if (m) {
      const l = m[1].toLowerCase();
      for (let s = stack.length - 1; s > 0; s--) if (stack[s].l === l) { stack.length = s; break; }
      i += m[0].length; continue;
    }
    m = /^<([a-zA-Z][\w:.\-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/.exec(src.slice(i));
    if (!m) { top().k.push({ t: 'text', v: '<' }); i++; continue; }
    const l = m[1].toLowerCase(), n = { t: 'el', n: m[1], l, a: parseAttrs(m[2]), k: [], sc: !!m[3] };
    if (AUTOCLOSE[l] && AUTOCLOSE[l].includes(top().l)) stack.pop();
    top().k.push(n); i += m[0].length;
    if (VOID.has(l) || n.sc) continue;
    if (RAWT.has(l)) {
      const re = new RegExp(`</${l}\\s*>`, 'i'), rest = src.slice(i), mm = re.exec(rest);
      const end = mm ? mm.index : rest.length;
      if (end) n.k.push({ t: 'raw', v: rest.slice(0, end) });
      i += end + (mm ? mm[0].length : 0); continue;
    }
    stack.push(n);
  }
  return root;
}
const collapse = (s) => s.replace(/\s+/g, ' ');
const isJsType = (n) => { const t = (n.a.find(([k]) => k.toLowerCase() === 'type') || [])[1]; return !t || /javascript|ecmascript|module/i.test(t); };
const hasSrc = (n) => n.a.some(([k]) => k.toLowerCase() === 'src');
const blockish = (n) => n.t === 'el' && !INLINE.has(n.l);
const containsBlock = (n) => n.t === 'el' && (blockish(n) || n.k.some(containsBlock) || n.k.some((x) => x.t === 'cm'));
function htmlOpen(n) { return `<${n.n}${attrStr(n.a.map(([k, v]) => [k, v === null ? null : v]))}${n.sc && !VOID.has(n.l) ? ' /' : ''}>`; }
function htmlInline(n) {
  if (n.t === 'text') return collapse(n.v);
  if (n.t === 'cm') return `<!--${n.v}-->`;
  if (n.t === 'dt') return `<!${n.v}>`;
  if (VOID.has(n.l) || n.sc) return htmlOpen(n);
  return htmlOpen(n) + n.k.map((x) => (x.t === 'raw' ? x.v : htmlInline(x))).join('') + `</${n.n}>`;
}
const htmlRawSer = (n) => (n.t === 'text' || n.t === 'raw' ? n.v : n.t === 'cm' ? `<!--${n.v}-->` : VOID.has(n.l) || n.sc ? htmlOpen(n) : htmlOpen(n) + n.k.map(htmlRawSer).join('') + `</${n.n}>`);
function htmlFmt(root, ind, width) {
  const lines = [];
  const kidsBlock = (kids, d) => {
    let run = [];
    const flush = () => { const t = run.map(htmlInline).join('').trim(); run = []; if (t) lines.push(ind.repeat(d) + t); };
    for (const k of kids) {
      if (k.t === 'text' || (k.t === 'el' && !containsBlock(k))) run.push(k);
      else { flush(); if (k.t === 'cm') lines.push(ind.repeat(d) + `<!--${k.v}-->`); else if (k.t === 'dt') lines.push(ind.repeat(d) + `<!${k.v}>`); else elLines(k, d); }
    }
    flush();
  };
  const body = (code, d) => code.replace(/^\s*\n|\s+$/g, '').split('\n').map((l) => (l.trim() ? ind.repeat(d) + l : '')).join('\n');
  const elLines = (n, d) => {
    const pad = ind.repeat(d), open = htmlOpen(n);
    if (VOID.has(n.l) || n.sc) { lines.push(pad + open); return; }
    if (n.l === 'pre' || n.l === 'textarea') { lines.push(pad + htmlRawSer(n)); return; }
    if (RAWT.has(n.l)) {
      const raw = n.k[0]?.v ?? '';
      if (!raw.trim()) { lines.push(`${pad}${open}</${n.n}>`); return; }
      let code = raw;
      try { if (n.l === 'style') code = cssFormat(raw, ind); else if (n.l === 'script' && isJsType(n) && !hasSrc(n)) code = jsFormat(raw, ind); } catch { code = raw; }
      lines.push(pad + open, body(code, d + 1), `${pad}</${n.n}>`); return;
    }
    const kids = n.k.filter((x) => !(x.t === 'text' && !x.v.trim()) || false);
    if (!kids.length) { lines.push(`${pad}${open}</${n.n}>`); return; }
    if (kids.every((x) => x.t === 'text' || (x.t === 'el' && !containsBlock(x)))) {
      const inner = kids.map(htmlInline).join('').trim(), one = `${pad}${open}${inner}</${n.n}>`;
      if (one.length <= width) { lines.push(one); return; }
    }
    lines.push(pad + open); kidsBlock(kids, d + 1); lines.push(`${pad}</${n.n}>`);
  };
  kidsBlock(root.k, 0);
  return lines.join('\n');
}
function htmlMin(root, comments) {
  const ser = (kids, parentBlock, pre) => {
    let out = '';
    kids.forEach((k, idx) => {
      const prev = kids[idx - 1], next = kids[idx + 1];
      if (k.t === 'text') {
        if (pre) { out += k.v; return; }
        let t = collapse(k.v);
        if (out.endsWith(' ')) t = t.replace(/^ /, '');
        if (prev ? blockish(prev) || prev.t === 'dt' : parentBlock) t = t.replace(/^ /, '');
        if (next ? blockish(next) || next.t === 'dt' : parentBlock) t = t.replace(/ $/, '');
        out += t;
      } else if (k.t === 'cm') { if (comments || /^\[if|^<!\[endif/i.test(k.v)) out += `<!--${k.v}-->`; }
      else if (k.t === 'dt') out += `<!${k.v}>`;
      else if (k.t === 'el') {
        const open = `<${k.n}${attrStr(k.a)}${k.sc && !VOID.has(k.l) ? '/' : ''}>`;
        if (VOID.has(k.l) || k.sc) { out += open; return; }
        let inner;
        if (RAWT.has(k.l)) {
          const raw = k.k[0]?.v ?? '';
          inner = raw;
          try { if (k.l === 'style') inner = cssMin(raw); else if (k.l === 'script' && isJsType(k) && !hasSrc(k)) inner = jsMin(raw); else if (k.l !== 'textarea') inner = raw.trim(); } catch { inner = raw.trim(); }
        } else inner = ser(k.k, blockish(k) || k.l === 'body', pre || k.l === 'pre');
        out += `${open}${inner}</${k.n}>`;
      }
    });
    return out;
  };
  return ser(root.k, true, false).trim();
}

// ---------- JSX ----------
const JSX_ATTR = { class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength', minlength: 'minLength', colspan: 'colSpan', rowspan: 'rowSpan', cellpadding: 'cellPadding', cellspacing: 'cellSpacing', frameborder: 'frameBorder', contenteditable: 'contentEditable', autocomplete: 'autoComplete', autofocus: 'autoFocus', autoplay: 'autoPlay', crossorigin: 'crossOrigin', enctype: 'encType', formaction: 'formAction', novalidate: 'noValidate', srcset: 'srcSet', srclang: 'srcLang', usemap: 'useMap', accesskey: 'accessKey', charset: 'charSet', 'http-equiv': 'httpEquiv', 'accept-charset': 'acceptCharset', datetime: 'dateTime', inputmode: 'inputMode', spellcheck: 'spellCheck', allowfullscreen: 'allowFullScreen', playsinline: 'playsInline', hreflang: 'hrefLang', referrerpolicy: 'referrerPolicy', 'clip-path': 'clipPath', viewbox: 'viewBox' };
const EVT = 'click change submit blur focus keydown keyup keypress input load error mouseover mouseout mousedown mouseup mousemove dblclick scroll resize select touchstart touchend wheel'.split(' ');
function jsxAttrName(k, svg) {
  const lower = k.toLowerCase();
  if (/^(data|aria)-/.test(lower)) return lower;
  if (!svg && JSX_ATTR[lower]) return JSX_ATTR[lower];
  if (svg && (lower === 'class' || lower === 'for' || lower === 'tabindex')) return JSX_ATTR[lower];
  if (lower.startsWith('on') && EVT.includes(lower.slice(2))) return 'on' + lower[2].toUpperCase() + lower.slice(3);
  if (/^(xlink|xml|xmlns):/.test(k)) return k.replace(/[:\-](\w)/g, (m, c) => c.toUpperCase());
  if (k.includes('-')) return k.replace(/-(\w)/g, (m, c) => c.toUpperCase());
  return k;
}
function jsxStyle(v) {
  const ents = v.split(';').map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf(':'); return [x.slice(0, i).trim(), x.slice(i + 1).trim()]; });
  const body = ents.map(([k, val]) => { const key = k.startsWith('--') ? JSON.stringify(k) : k.replace(/^-ms-/, 'ms-').replace(/-(\w)/g, (m, c) => c.toUpperCase()); return `${idRe.test(key) ? key : JSON.stringify(key)}: '${val.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`; });
  return `{{ ${body.join(', ')} }}`;
}
function jsxOpen(k, svg) {
  const attrs = k.a.map(([a, v]) => {
    const name = jsxAttrName(a, svg);
    if (v === null) return name;
    if (name === 'style') return `style=${jsxStyle(decodeEnt(v))}`;
    if (/^on[A-Z]/.test(name)) return `${name}={() => { ${decodeEnt(v).trim().replace(/;$/, '')} }}`;
    return v.includes('"') ? `${name}={${JSON.stringify(decodeEnt(v))}}` : `${name}="${v}"`;
  });
  return `<${k.n}${attrs.length ? ' ' + attrs.join(' ') : ''}`;
}
const jsxRawEl = (k) => k.l === 'script' || k.l === 'style' || k.l === 'textarea' || k.l === 'pre';
function jsxInline(k, svg) {
  if (k.t === 'text') return jsxText(collapse(k.v));
  if (k.t === 'cd') return jsxText(collapse(k.v));
  if (k.t === 'cm') return `{/*${k.v.replace(/\*\//g, '* /')}*/}`;
  if (k.t !== 'el') return '';
  const isSvg = svg || k.n.toLowerCase() === 'svg', open = jsxOpen(k, isSvg);
  if (VOID.has(k.l ?? '') || !k.k.length) return open + ' />';
  if (jsxRawEl(k)) return `${open}>{${JSON.stringify(k.k.map((x) => x.v).join(''))}}</${k.n}>`;
  return `${open}>${k.k.map((x) => jsxInline(x, isSvg)).join('')}</${k.n}>`;
}
function jsxTree(kids, svg, d, ind) {
  const out = [], pad = ind.repeat(d);
  for (const k of kids) {
    if (k.t === 'text' || k.t === 'cd') { const t = collapse(k.v).trim(); if (t) out.push(pad + jsxText(t)); continue; }
    if (k.t === 'cm') { out.push(pad + jsxInline(k)); continue; }
    if (k.t !== 'el') continue;
    const kk = k.k.filter((x) => !(x.t === 'text' && !x.v.trim()));
    if (!kk.length || jsxRawEl(k) || kk.every((x) => x.t === 'text' || x.t === 'cd')) { out.push(pad + jsxInline({ ...k, k: kk.length && !jsxRawEl(k) ? [{ t: 'text', v: kk.map((x) => x.v).join('').trim() }] : k.k }, svg)); continue; }
    if (kk.some((x) => (x.t === 'text' || x.t === 'cd') && x.v.trim())) { out.push(pad + jsxInline(k, svg)); continue; }
    const isSvg = svg || k.n.toLowerCase() === 'svg';
    out.push(`${pad}${jsxOpen(k, isSvg)}>`, ...jsxTree(k.k, isSvg, d + 1, ind), `${pad}</${k.n}>`);
  }
  return out;
}
const jsxText = (t) => t.replace(/[{}<>]/g, (c) => `{'${c}'}`);

// ---------- YAML (common subset parser + dumper) ----------
function yamlScalar(s) {
  if (s === '' || s === '~' || /^(null|Null|NULL)$/.test(s)) return null;
  if (/^(true|True|TRUE)$/.test(s)) return true;
  if (/^(false|False|FALSE)$/.test(s)) return false;
  if (/^[-+]?(0|[1-9][0-9_]*)$/.test(s)) { const n = Number(s.replace(/_/g, '')); return Number.isSafeInteger(n) ? n : s; }
  if (/^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s, 16);
  if (/^0o[0-7]+$/.test(s)) return parseInt(s.slice(2), 8);
  if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(s)) return Number(s);
  if (/^[-+]?\.(inf|Inf|INF)$/.test(s)) return s[0] === '-' ? -Infinity : Infinity;
  if (/^\.(nan|NaN|NAN)$/.test(s)) return NaN;
  return s;
}
function ystripC(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (q === '"' && c === '\\') { i++; continue; } if (c === q) { if (q === "'" && s[i + 1] === "'") { i++; continue; } q = null; } continue; }
    if ((c === '"' || c === "'") && (i === 0 || /[\s\[{,:]/.test(s[i - 1]))) { q = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
  }
  return s.trimEnd();
}
function ykeyColon(s) {
  if (!s || '[{'.includes(s[0])) return -1;
  let i = 0;
  if (s[0] === '"' || s[0] === "'") {
    const q = s[0]; i = 1;
    while (i < s.length) { if (q === '"' && s[i] === '\\') i += 2; else if (s[i] === q) { if (q === "'" && s[i + 1] === "'") i += 2; else { i++; break; } } else i++; }
    return s[i] === ':' && (i + 1 >= s.length || s[i + 1] === ' ') ? i : -1;
  }
  for (; i < s.length; i++) { if (s[i] === ':' && (i + 1 === s.length || s[i + 1] === ' ')) return i; if (s[i] === '#' && s[i - 1] === ' ') return -1; }
  return -1;
}
const ESC = { n: '\n', t: '\t', r: '\r', 0: '\0', '\\': '\\', '"': '"', '/': '/', ' ': ' ', _: '\u00a0', N: '\u0085', L: '\u2028', P: '\u2029', e: '\x1b', a: '\x07', b: '\b', f: '\f', v: '\v' };
const yfold = (s) => s.replace(/[ \t]*\n(?:[ \t]*\n)*[ \t]*/g, (m) => { const n = (m.match(/\n/g) || []).length; return n === 1 ? ' ' : '\n'.repeat(n - 1); });
function readQuoted(s) { // s starts with a quote; returns {v,end} or null if unterminated
  const q = s[0]; let i = 1;
  for (; i < s.length; i++) {
    if (q === '"' && s[i] === '\\') { i++; continue; }
    if (s[i] === q) { if (q === "'" && s[i + 1] === "'") { i++; continue; } break; }
  }
  if (i >= s.length) return null;
  let raw = s.slice(1, i);
  if (q === "'") return { v: yfold(raw).replace(/''/g, "'"), end: i + 1 };
  raw = yfold(raw.replace(/\\\n[ \t]*/g, ''));
  const v = raw.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[\s\S])/g, (m, g) => (g.length > 1 && 'xuU'.includes(g[0]) ? String.fromCodePoint(parseInt(g.slice(1), 16)) : g in ESC ? ESC[g] : m));
  return { v, end: i + 1 };
}
function yflow(s, anchors) {
  let i = 0;
  const err = (m) => { throw new Error(`YAML flow error: ${m} in "${s.slice(0, 40)}"`); };
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const val = () => {
    ws();
    let anchor = null, m;
    while (s[i] === '&' || s[i] === '!') { m = /^[&!]\S*\s*/.exec(s.slice(i)); i += m[0].length; if (m[0][0] === '&') anchor = m[0].slice(1).trim(); }
    let v;
    const c = s[i];
    if (c === '[') {
      i++; v = [];
      for (;;) { ws(); if (s[i] === ']') { i++; break; } if (i >= s.length) err('unterminated ['); let x = val(); ws(); if (s[i] === ':') { i++; ws(); const y = s[i] === ',' || s[i] === ']' ? null : val(); x = { [String(x)]: y }; ws(); } v.push(x); if (s[i] === ',') i++; else if (s[i] !== ']') err("expected ',' or ']'"); }
    } else if (c === '{') {
      i++; v = {};
      for (;;) { ws(); if (s[i] === '}') { i++; break; } if (i >= s.length) err('unterminated {'); const k = val(); ws(); let y = null; if (s[i] === ':') { i++; ws(); y = s[i] === ',' || s[i] === '}' ? null : val(); } v[String(k)] = y; ws(); if (s[i] === ',') i++; else if (s[i] !== '}') err("expected ',' or '}'"); }
    } else if (c === '"' || c === "'") {
      const r = readQuoted(s.slice(i)); if (!r) err('unterminated string'); i += r.end; v = r.v;
    } else if (c === '*') {
      m = /^\*([^\s,\]}]+)/.exec(s.slice(i)); i += m[0].length; if (!(m[1] in anchors)) err(`unknown alias *${m[1]}`); v = anchors[m[1]];
    } else {
      let j = i;
      while (j < s.length && !',[]{}'.includes(s[j]) && !(s[j] === ':' && (j + 1 >= s.length || /[\s,\]}]/.test(s[j + 1])))) j++;
      v = yamlScalar(s.slice(i, j).trim()); i = j;
    }
    if (anchor) anchors[anchor] = v;
    return v;
  };
  const v = val(); ws();
  if (i < s.length) err('unexpected trailing text');
  return v;
}
function yflowDepth(s) {
  let d = 0, q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (q === '"' && c === '\\') i++; else if (c === q) q = null; continue; }
    if ((c === '"' || c === "'") && (i === 0 || /[\s\[{,:]/.test(s[i - 1]))) q = c; else if (c === '[' || c === '{') d++; else if (c === ']' || c === '}') d--;
  }
  return d;
}
function yamlDoc(L) {
  let p = 0;
  const anchors = {};
  const err = (m, n = p) => { throw new Error(`YAML error on line ${n + 1}: ${m}`); };
  const blank = (l) => { const t = l.trim(); return !t || t[0] === '#'; };
  const indent = (l) => { let k = 0; while (l[k] === ' ') k++; if (l[k] === '\t' && l.trim()) err('tabs are not allowed for indentation'); return k; };
  const skip = () => { while (p < L.length && blank(L[p])) p++; };
  const put = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });

  function blockScalar(header, parentInd) {
    const m = /^([|>])([+-]?)(\d?)([+-]?)\s*$/.exec(header);
    if (!m) err('bad block scalar header');
    const chomp = m[2] || m[4];
    let bi = m[3] ? Math.max(parentInd, 0) + +m[3] : null;
    p++;
    const buf = [];
    while (p < L.length) {
      const l = L[p];
      if (!l.trim()) { buf.push(''); p++; continue; }
      const ind = indent(l);
      if (bi === null) { if (ind <= parentInd) break; bi = ind; }
      if (ind < bi) break;
      buf.push(l.slice(bi)); p++;
    }
    let trail = 0;
    while (buf.length && buf[buf.length - 1] === '') { buf.pop(); trail++; }
    let text = '';
    if (m[1] === '|') text = buf.join('\n');
    else buf.forEach((l, i) => {
      if (i === 0) { text = l; return; }
      const pr = buf[i - 1];
      if (l === '') text += '\n';
      else if (pr === '') text += l;
      else text += /^\s/.test(l) || /^\s/.test(pr) ? '\n' + l : ' ' + l;
    });
    if (chomp === '+') return text + (buf.length ? '\n' : '') + '\n'.repeat(trail);
    if (chomp === '-') return text;
    return buf.length ? text + '\n' : '';
  }

  function inline(rest, parentInd) {
    const c = rest[0];
    if (c === '|' || c === '>') return blockScalar(rest, parentInd);
    if (c === '[' || c === '{') {
      let acc = rest;
      while (yflowDepth(acc) > 0) { p++; if (p >= L.length) err('unterminated flow collection'); acc += ' ' + ystripC(L[p].trim()); }
      p++;
      try { return yflow(acc, anchors); } catch (e) { err(e.message.replace(/^YAML flow error: /, ''), p - 1); }
    }
    if (c === '"' || c === "'") {
      let acc = rest, r;
      while (!(r = readQuoted(acc))) { p++; if (p >= L.length) err('unterminated quoted string'); acc += '\n' + L[p]; }
      p++;
      if (ystripC(acc.slice(r.end)) !== '') err('unexpected text after quoted scalar', p - 1);
      return r.v;
    }
    const parts = [rest]; p++;
    let pendingBlank = 0;
    while (p < L.length) {
      const l = L[p];
      if (!l.trim()) { pendingBlank++; p++; continue; }
      if (l.trim()[0] === '#' || indent(l) <= parentInd) break;
      const t = ystripC(l.trim());
      parts.push(...Array(pendingBlank).fill('\n'), t); pendingBlank = 0; p++;
    }
    p -= pendingBlank; // leave trailing blanks unconsumed
    let out = '';
    parts.forEach((t, i) => { if (t === '\n') out += '\n'; else out += (i && !out.endsWith('\n') ? ' ' : '') + t; });
    return yamlScalar(out);
  }

  function value(rest, parentInd, seqOk) {
    let anchor = null, tag = null, m;
    for (;;) {
      if ((m = /^&(\S+)\s*/.exec(rest))) { anchor = m[1]; rest = rest.slice(m[0].length); }
      else if ((m = /^!(\S*)\s*/.exec(rest))) { tag = m[1]; rest = rest.slice(m[0].length); }
      else break;
    }
    let v;
    if (rest === '') {
      p++; skip();
      v = null;
      if (p < L.length) {
        const ind = indent(L[p]);
        if (ind > parentInd) v = block(ind);
        else if (seqOk && ind === parentInd && /^-(\s|$)/.test(L[p].slice(ind))) v = seq(ind);
      }
    } else if ((m = /^\*(\S+)$/.exec(rest))) {
      if (!(m[1] in anchors)) err(`unknown alias *${m[1]}`);
      v = anchors[m[1]]; p++;
    } else v = inline(rest, parentInd);
    if (tag === '!str') v = v == null ? '' : String(v);
    if (anchor) anchors[anchor] = v;
    return v;
  }

  function block(minInd) {
    skip();
    if (p >= L.length) return null;
    const ind = indent(L[p]);
    if (ind < minInd) return null;
    const t = ystripC(L[p].slice(ind));
    if (/^-(\s|$)/.test(t)) return seq(ind);
    if (ykeyColon(t) >= 0) return map(ind);
    return value(t, minInd - 1, false);
  }

  function seq(ind) {
    const out = [];
    for (;;) {
      skip();
      if (p >= L.length || indent(L[p]) !== ind) break;
      const t = L[p].slice(ind);
      if (!/^-(\s|$)/.test(t)) break;
      const after = t.slice(1), restRaw = after.trimStart(), sp = after.length - restRaw.length;
      const rest = ystripC(restRaw);
      if (rest === '') out.push(value('', ind, false));
      else if (/^-(\s|$)/.test(rest) || ykeyColon(rest) >= 0) { L[p] = ' '.repeat(ind + 1 + sp) + restRaw; out.push(block(ind + 1)); }
      else out.push(value(rest, ind, false));
    }
    return out;
  }

  function map(ind) {
    const out = {}, merges = [];
    for (;;) {
      skip();
      if (p >= L.length || indent(L[p]) !== ind) break;
      const t = ystripC(L[p].slice(ind)), c = ykeyColon(t);
      if (c < 0) { if (/^-(\s|$)/.test(t)) break; err('expected "key: value"'); }
      const kraw = t.slice(0, c).trim();
      const key = kraw[0] === '"' || kraw[0] === "'" ? (readQuoted(kraw) || err('bad quoted key')).v : kraw;
      const v = value(t.slice(c + 1).trim(), ind, true);
      if (key === '<<' && (isObj(v) || Array.isArray(v))) merges.push(v); else put(out, key, v);
    }
    for (const m of merges) for (const o of [].concat(m)) if (isObj(o)) for (const k of Object.keys(o)) if (!Object.hasOwn(out, k)) put(out, k, o[k]);
    return out;
  }

  skip();
  if (p >= L.length) return null;
  const v = block(0);
  skip();
  if (p < L.length) err('unexpected content, check indentation');
  return v;
}
function yamlParse(src) {
  const docs = [[]];
  for (const l of String(src).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (/^---(\s|$)/.test(l)) {
      if (docs[docs.length - 1].some((x) => x.trim() && x.trim()[0] !== '#')) docs.push([]);
      const rest = l.slice(3).trim();
      if (rest && rest[0] !== '#') docs[docs.length - 1].push(rest);
      continue;
    }
    if (/^\.\.\.\s*$/.test(l)) { docs.push([]); continue; }
    if (l[0] === '%' && !docs[docs.length - 1].length) continue;
    docs[docs.length - 1].push(l);
  }
  const res = docs.filter((d) => d.some((x) => x.trim() && x.trim()[0] !== '#')).map(yamlDoc);
  return res.length === 0 ? null : res.length === 1 ? res[0] : res;
}
const yNeedsQuote = (s) => s === '' || yamlScalar(s) !== s || /^(y|n|yes|no|on|off)$/i.test(s) || /^\d{4}-\d\d-\d\d/.test(s) || /^\s|\s$/.test(s) || /^[-?:,\[\]{}#&*!|>'"%@`]/.test(s) || /: |:$| #|[\x00-\x1f\x7f]/.test(s) || /^(---|\.\.\.)/.test(s);
const yStr = (s) => (yNeedsQuote(s) ? JSON.stringify(s) : s);
function yamlDump(root, ind = 2) {
  const sp = ' '.repeat(ind);
  const isColl = (x) => x !== null && typeof x === 'object';
  const fmt = (x, pad) => {
    if (x === null || x === undefined) return ' null';
    if (typeof x === 'number') return ' ' + (Number.isNaN(x) ? '.nan' : x === Infinity ? '.inf' : x === -Infinity ? '-.inf' : String(x));
    if (typeof x === 'boolean') return ' ' + x;
    if (typeof x === 'string') {
      if (x.includes('\n') && !/[\x00-\x09\x0b-\x1f\x7f]/.test(x) && !/^[ \t]/.test(x) && x.trim()) {
        const lines = (x.endsWith('\n') ? x.slice(0, -1) : x).split('\n');
        return ` |${x.endsWith('\n\n') ? '+' : x.endsWith('\n') ? '' : '-'}\n` + lines.map((l) => (l ? pad + l : '')).join('\n');
      }
      return ' ' + (x.includes('\n') ? JSON.stringify(x) : yStr(x));
    }
    if (Array.isArray(x)) {
      if (!x.length) return ' []';
      return '\n' + x.map((it) => {
        const r = fmt(it, pad + '  ');
        if (r[0] === ' ') return pad + '-' + r;
        const ls = r.slice(1).split('\n'); ls[0] = pad + '- ' + ls[0].slice(pad.length + 2);
        return ls.join('\n');
      }).join('\n');
    }
    const ents = Object.entries(x);
    if (!ents.length) return ' {}';
    return '\n' + ents.map(([k, v]) => pad + (/^[A-Za-z_][\w. -]*$/.test(k) && !yNeedsQuote(k) ? k : JSON.stringify(k)) + ':' + fmt(v, pad + sp)).join('\n');
  };
  if (!isColl(root)) return typeof root === 'string' ? (yNeedsQuote(root) || root.includes('\n') ? JSON.stringify(root) : root) : fmt(root, '').trim();
  return fmt(root, '').slice(1).replace(/^\s+(?=\[\]$|\{\}$)/, '');
}

// ---------- TOML ----------
function tomlParse(src) {
  let i = 0;
  const n = src.length, root = {};
  let cur = root;
  const err = (m, at = i) => { throw new Error(`TOML error at line ${lc(src, at)[0]}: ${m}`); };
  const ws = () => { while (src[i] === ' ' || src[i] === '\t') i++; };
  const comment = () => { if (src[i] === '#') while (i < n && src[i] !== '\n') i++; };
  const skipAll = () => { for (;;) { ws(); comment(); if (src[i] === '\n' || src[i] === '\r') { i++; continue; } break; } };
  const put = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
  const TE = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', e: '\x1b', '"': '"', '\\': '\\' };
  function basic() {
    const multi = src.startsWith('"""', i);
    i += multi ? 3 : 1;
    if (multi && src[i] === '\r') i++;
    if (multi && src[i] === '\n') i++;
    let out = '';
    for (;;) {
      if (i >= n) err('unterminated string');
      const c = src[i];
      if (c === '"') {
        if (!multi) { i++; return out; }
        if (src.startsWith('"""', i)) { i += 3; for (let q = 0; q < 2 && src[i] === '"'; q++) { out += '"'; i++; } return out; }
        out += c; i++; continue;
      }
      if (c === '\n' && !multi) err('newline in string');
      if (c === '\\') {
        const e = src[i + 1];
        if (e === 'u' || e === 'U' || e === 'x') { const len = e === 'u' ? 4 : e === 'U' ? 8 : 2, h = src.slice(i + 2, i + 2 + len); if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(h)) err('bad unicode escape'); out += String.fromCodePoint(parseInt(h, 16)); i += 2 + len; }
        else if (e in TE) { out += TE[e]; i += 2; }
        else if (multi && /[ \t\r\n]/.test(e)) { i++; while (/[ \t\r\n]/.test(src[i] || 'x') && i < n) i++; }
        else err(`bad escape \\${e}`);
        continue;
      }
      out += c; i++;
    }
  }
  function lit() {
    const multi = src.startsWith("'''", i);
    if (multi) {
      i += 3; if (src[i] === '\r') i++; if (src[i] === '\n') i++;
      const j = src.indexOf("'''", i); if (j < 0) err('unterminated string');
      let e = j; while (src[e + 3] === "'" && e - j < 2) e++;
      const out = src.slice(i, e); i = e + 3; return out;
    }
    const j = src.indexOf("'", i + 1); if (j < 0 || src.slice(i, j).includes('\n')) err('unterminated string');
    const out = src.slice(i + 1, j); i = j + 1; return out;
  }
  function key() {
    const parts = [];
    for (;;) {
      ws(); let k;
      if (src[i] === '"') k = basic(); else if (src[i] === "'") k = lit();
      else { const m = /[A-Za-z0-9_-]+/y; m.lastIndex = i; const r = m.exec(src); if (!r) err('invalid key'); k = r[0]; i += k.length; }
      parts.push(k); ws();
      if (src[i] === '.') { i++; continue; }
      return parts;
    }
  }
  const DT = /\d{4}-\d\d-\d\d(?:[Tt ]\d\d:\d\d:\d\d(?:\.\d+)?(?:[Zz]|[+-]\d\d:\d\d)?)?|\d\d:\d\d:\d\d(?:\.\d+)?/y;
  function value() {
    const c = src[i];
    if (c === '"') return basic();
    if (c === "'") return lit();
    if (c === '[') {
      i++; const arr = [];
      for (;;) { skipAll(); if (src[i] === ']') { i++; return arr; } arr.push(value()); skipAll(); if (src[i] === ',') { i++; continue; } if (src[i] === ']') { i++; return arr; } err("expected ',' or ']'"); }
    }
    if (c === '{') {
      i++; const o = {}; ws();
      if (src[i] === '}') { i++; return o; }
      for (;;) { ws(); const ks = key(); ws(); if (src[i] !== '=') err('expected ='); i++; ws(); assign(o, ks, value()); ws(); if (src[i] === ',') { i++; continue; } if (src[i] === '}') { i++; return o; } err("expected ',' or '}'"); }
    }
    DT.lastIndex = i; const d = DT.exec(src);
    if (d) { i += d[0].length; return d[0]; }
    const m = /[^\s,\]}#]+/y; m.lastIndex = i; const r = m.exec(src);
    if (!r) err('expected a value');
    const t = r[0]; i += t.length;
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (/^[+-]?inf$/.test(t)) return t[0] === '-' ? -Infinity : Infinity;
    if (/^[+-]?nan$/.test(t)) return NaN;
    if (/^[+-]?(0|[1-9](_?\d)*)$/.test(t)) return Number(t.replace(/_/g, ''));
    if (/^0x[0-9a-fA-F_]+$/.test(t)) return parseInt(t.slice(2).replace(/_/g, ''), 16);
    if (/^0o[0-7_]+$/.test(t)) return parseInt(t.slice(2).replace(/_/g, ''), 8);
    if (/^0b[01_]+$/.test(t)) return parseInt(t.slice(2).replace(/_/g, ''), 2);
    if (/^[+-]?(0|[1-9](_?\d)*)(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/.test(t)) return Number(t.replace(/_/g, ''));
    return err(`invalid value "${t}"`, i - t.length);
  }
  function assign(o, parts, v) {
    for (let k = 0; k < parts.length - 1; k++) {
      let nx = Object.hasOwn(o, parts[k]) ? o[parts[k]] : undefined;
      if (nx === undefined) { nx = {}; put(o, parts[k], nx); }
      if (Array.isArray(nx)) nx = nx[nx.length - 1];
      if (!isObj(nx)) err(`key "${parts[k]}" is not a table`);
      o = nx;
    }
    const last = parts[parts.length - 1];
    if (Object.hasOwn(o, last)) err(`duplicate key "${last}"`);
    put(o, last, v);
  }
  const defined = new Set();
  for (;;) {
    skipAll();
    if (i >= n) break;
    if (src[i] === '[') {
      const arr = src[i + 1] === '[';
      i += arr ? 2 : 1;
      const parts = key(); ws();
      if (src.slice(i, i + (arr ? 2 : 1)) !== (arr ? ']]' : ']')) err('expected closing bracket');
      i += arr ? 2 : 1;
      let o = root, viaArray = false;
      const last = parts.length - 1;
      for (let k = 0; k < (arr ? last : parts.length); k++) {
        let nx = Object.hasOwn(o, parts[k]) ? o[parts[k]] : undefined;
        if (nx === undefined) { nx = {}; put(o, parts[k], nx); }
        if (Array.isArray(nx)) { nx = nx[nx.length - 1]; viaArray = true; }
        if (!isObj(nx)) err(`"${parts[k]}" is not a table`);
        o = nx;
      }
      if (arr) {
        let a = Object.hasOwn(o, parts[last]) ? o[parts[last]] : undefined;
        if (a === undefined) { a = []; put(o, parts[last], a); }
        if (!Array.isArray(a)) err(`"${parts[last]}" is not an array of tables`);
        o = {}; a.push(o);
      } else if (!viaArray) { const id = JSON.stringify(parts); if (defined.has(id)) err(`table [${parts.join('.')}] defined twice`); defined.add(id); }
      cur = o;
    } else {
      const ks = key(); ws();
      if (src[i] !== '=') err('expected =');
      i++; ws();
      assign(cur, ks, value());
    }
    ws(); comment();
    if (i < n && src[i] !== '\n' && src[i] !== '\r') err('expected end of line');
  }
  return root;
}
function tomlDump(root) {
  if (!isObj(root)) throw new Error('TOML root must be a JSON object');
  const fk = (k) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k));
  const sc = (v) => {
    if (v === null) throw new Error('TOML cannot represent null');
    if (typeof v === 'string') return JSON.stringify(v).replace(/\x7f/g, '\\u007f');
    if (typeof v === 'number') return Number.isNaN(v) ? 'nan' : !Number.isFinite(v) ? (v > 0 ? 'inf' : '-inf') : String(v);
    if (typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return `[${v.map(sc).join(', ')}]`;
    const e = Object.entries(v);
    return e.length ? `{ ${e.map(([k, x]) => `${fk(k)} = ${sc(x)}`).join(', ')} }` : '{}';
  };
  const lines = [];
  const emit = (o, path) => {
    const subs = [];
    for (const [k, v] of Object.entries(o)) {
      if (isObj(v) || (Array.isArray(v) && v.length && v.every(isObj))) subs.push([k, v]); else lines.push(`${fk(k)} = ${sc(v)}`);
    }
    for (const [k, v] of subs) {
      const p = [...path, k], h = p.map(fk).join('.');
      if (Array.isArray(v)) for (const e of v) { lines.push('', `[[${h}]]`); emit(e, p); }
      else { lines.push('', `[${h}]`); emit(v, p); }
    }
  };
  emit(root, []);
  return lines.join('\n').replace(/^\n+/, '');
}

// ---------- JS tokenizer / formatter / minifier ----------
const RE_KW = new Set('return typeof instanceof in of new delete void throw case do else yield await'.split(' '));
const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**'];
function skipStr(s, i) { const q = s[i]; i++; while (i < s.length && s[i] !== q && s[i] !== '\n') { if (s[i] === '\\') i++; i++; } return Math.min(i + 1, s.length); }
function scanTpl(s, i) {
  i++;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (c === '`') return i + 1;
    if (c === '$' && s[i + 1] === '{') i = skipBraces(s, i + 2) - 1;
  }
  return s.length;
}
function skipBraces(s, i) {
  let d = 1;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '{') d++;
    else if (c === '}') { if (--d === 0) return i + 1; }
    else if (c === '"' || c === "'") i = skipStr(s, i) - 1;
    else if (c === '`') i = scanTpl(s, i) - 1;
    else if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; }
    else if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); if (e < 0) return s.length; i = e + 1; }
  }
  return s.length;
}
function jsTok(s) {
  const T = []; let i = 0, nl = 0; const n = s.length;
  const add = (t, v) => { T.push({ t, v, nl }); nl = 0; };
  const numRe = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)n?/y;
  const idRe2 = /[\p{ID_Start}$_#][\p{ID_Continue}$\u200c\u200d]*/uy;
  if (s.startsWith('#!')) { const j = s.indexOf('\n'); add('lc', s.slice(0, j < 0 ? n : j)); i = j < 0 ? n : j; }
  while (i < n) {
    const c = s[i];
    if (c === '\n') { nl++; i++; continue; }
    if (/\s|\ufeff/.test(c)) { i++; continue; }
    if (c === '/' && s[i + 1] === '/') { let j = s.indexOf('\n', i); if (j < 0) j = n; add('lc', s.slice(i, j).trimEnd()); i = j; continue; }
    if (c === '/' && s[i + 1] === '*') { let j = s.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; add('bc', s.slice(i, j)); i = j; continue; }
    if (c === '"' || c === "'") { const j = skipStr(s, i); add('str', s.slice(i, j)); i = j; continue; }
    if (c === '`') { const j = scanTpl(s, i); add('tpl', s.slice(i, j)); i = j; continue; }
    if (/\d/.test(c) || (c === '.' && /\d/.test(s[i + 1] || ''))) { numRe.lastIndex = i; const m = numRe.exec(s); add('num', m[0]); i += m[0].length; continue; }
    idRe2.lastIndex = i;
    const im = idRe2.exec(s);
    if (im) { add('id', im[0]); i += im[0].length; continue; }
    if (c === '/') {
      const pv = T.filter((x) => x.t !== 'lc' && x.t !== 'bc').pop();
      const allowed = !pv || (pv.t === 'id' ? RE_KW.has(pv.v) : pv.t === 'p' ? !')]}'.includes(pv.v) && pv.v !== '++' && pv.v !== '--' : false);
      if (allowed) {
        let j = i + 1, cls = false;
        for (; j < n; j++) { const d = s[j]; if (d === '\n') break; if (d === '\\') j++; else if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) break; }
        if (s[j] === '/') { j++; while (/[a-z]/i.test(s[j] || '')) j++; add('re', s.slice(i, j)); i = j; continue; }
      }
    }
    const pm = PUNCT.find((p) => s.startsWith(p, i) && !(p === '?.' && /\d/.test(s[i + 2] || '')));
    const v = pm || c;
    add('p', v); i += v.length;
  }
  return T;
}

const BIN = new Set('= == === != !== < > <= >= + - * / % ** && || ?? & | ^ << >> >>> += -= *= /= %= **= &&= ||= ??= &= |= ^= <<= >>= >>>= => ?'.split(' '));
const KW_PAREN = new Set('if for while switch catch with function return typeof throw await yield case delete void in of new do else async'.split(' '));
const KW_VAL = new Set('return typeof throw await yield case delete void in of new do else async instanceof'.split(' '));
const CONT_KW = new Set('else do try finally new typeof void delete in instanceof extends case throw var let const function class export import default'.split(' '));
const CTRL = new Set(['if', 'for', 'while', 'with', 'catch', 'switch']);
const wordLike = (t) => t.t === 'id' || t.t === 'num' || t.t === 'str' || t.t === 'tpl' || t.t === 're';

function jsFormat(src, ind = '  ') {
  const T = jsTok(src);
  let out = '', depth = 0, atStart = true, want = 0, prev = null, lastParenKw = null, prevBlockClose = null, doWhile = false;
  const stack = [];
  const ROOT = { kind: 'block', tern: 0, cases: 0 };
  const top = () => stack[stack.length - 1] || ROOT;
  const nlf = () => { if (!atStart) { out = out.replace(/[ \t]+$/, ''); out += '\n'; atStart = true; } };
  const put = (str) => { if (atStart) { out += ind.repeat(Math.max(depth, 0)); atStart = false; } out += str; };
  const valueEnd = (p) => p && (p.t === 'num' || p.t === 'str' || p.t === 'tpl' || p.t === 're' || (p.t === 'id' && !KW_VAL.has(p.v)) || (p.t === 'p' && ')]}'.includes(p.v)));
  const isUnaryCtx = (p) => !p || (p.t === 'p' && !')]}'.includes(p.v) && !(p.post)) || (p.t === 'id' && KW_VAL.has(p.v));
  const space = (p, tok) => {
    const pv = p.v, tv = tok.v;
    if (tok.t === 'p' && (tv === ',' || tv === ';' || tv === ')' || tv === ']' || tv === '.' || tv === '?.')) return false;
    if (tv === '}') return top().kind === 'inl' && pv !== '{';
    if (p.t === 'p') {
      if (pv === '(' || pv === '[' || pv === '.' || pv === '?.' || pv === '!' || pv === '~' || pv === '...') return false;
      if (pv === '++' || pv === '--') return !!p.post || false;
      if (pv === '{') return top().kind === 'inl' ? tv !== '}' : true;
      if (pv === '}') return true;
      if (pv === ',' || pv === ';' || pv === ':') return true;
      if (p.un) return false;
      if (p.gen) return true;
      if (pv === ')' || pv === ']') {
        if (tok.t !== 'p') return true;
        if (tv === '(' || tv === '[') return false;
        if (tv === '{' || BIN.has(tv) || tv === '=>') return true;
        if (tv === ':') return !!tok.tern;
        return false;
      }
      return true;
    }
    if (wordLike(p)) {
      if (wordLike(tok)) return !(tok.t === 'tpl' && p.t === 'id' && !KW_VAL.has(pv));
      if (tv === '(') return p.t === 'id' && KW_PAREN.has(pv);
      if (tv === '[') return p.t === 'id' && KW_VAL.has(pv);
      if (tv === '++' || tv === '--') return !tok.post;
      if (tv === ':') return !!tok.tern;
      if (tv === '*' && pv === 'function') return false;
      return true;
    }
    return true;
  };
  const lookInline = (k) => {
    let d = 0, cnt = 0;
    for (let j = k; j < T.length; j++) {
      const x = T[j];
      if (x.t === 'p' && '{[('.includes(x.v)) { d++; if (j > k && x.v === '{') return false; }
      else if (x.t === 'p' && '}])'.includes(x.v) && x.v.length === 1) { d--; if (d === 0) return cnt <= 16; }
      else if ((x.t === 'id' && x.v === 'function') || x.v === '=>' || x.t === 'lc' || x.t === 'bc') return false;
      if (j === k + 1 && x.nl > 0) return false;
      cnt++;
    }
    return false;
  };
  for (let k = 0; k < T.length; k++) {
    const tok = T[k], next = T[k + 1];
    const tv = tok.v;
    // comments
    if (tok.t === 'lc' || tok.t === 'bc') {
      const own = tok.nl > 0 || !prev;
      if (own && out) want = 1;
      if (want && !own) { out += ' ' + tv; if (tok.t === 'lc') want = 1; continue; }
      if (want) { nlf(); if (tok.nl >= 2 && out && !out.endsWith('{\n')) out += '\n'; want = 0; }
      else if (!atStart) out += ' ';
      put(tv);
      if (tok.t === 'lc' || /\n/.test(tv) || (next && next.nl > 0)) want = 1;
      continue;
    }
    // join rules after a closing brace
    if (prevBlockClose) {
      const e = prevBlockClose; prevBlockClose = null;
      if (tok.t === 'id' && tok.v === 'while' && e.isDo) doWhile = true;
      const join = tok.t === 'p' ? [')', ']', ',', ';', '.', '?.', ':', '(', '`'].includes(tv) || (BIN.has(tv) && tv !== '?' && false) : tok.t === 'id' && (tv === 'else' || tv === 'catch' || tv === 'finally' || (tv === 'while' && e.isDo));
      want = join ? 0 : 1;
    }
    // honour source line breaks (ASI-safe)
    if (!want && tok.nl > 0 && prev && (stack.length === 0 || top().kind === 'block')) {
      const contPrev = (prev.t === 'p' && !')]}'.includes(prev.v) && prev.v !== ';' && !((prev.v === '++' || prev.v === '--') && prev.post)) || (prev.t === 'id' && CONT_KW.has(prev.v)) || (prev.v === ')' && CTRL.has(lastParenKw));
      const contNext = (tok.t === 'p' && ([...BIN].includes(tv) || ['.', '?.', ',', ';', ')', ']', '}', ':', '(', '['].includes(tv) || (tv === '{' && (prev.v === ')' || prev.t === 'id')))) || tok.t === 'tpl';
      if (!contPrev && !contNext) want = 1;
    }
    // case / default dedent
    const tp = top();
    if (tok.t === 'id' && tp.sw && (tv === 'case' || (tv === 'default' && next && next.v === ':'))) {
      if (tp.cases > 0) { depth--; tp.cases--; }
      tp.caseLabel = true; want = 1;
    }
    if (tv === '}' && tp.kind !== 'inl' && !(prev && prev.v === '{')) want = 1;
    // classify before spacing
    if (tok.t === 'p') {
      if (tv === '+' || tv === '-' ) tok.un = isUnaryCtx(prev) && !(prev && prev.t === 'p' && (prev.v === '++' || prev.v === '--') && prev.post);
      if (tv === '!' || tv === '~') tok.un = true;
      if (tv === '++' || tv === '--') { tok.post = !!(valueEnd(prev) && tok.nl === 0); if (!tok.post) tok.un = true; }
      if (tv === '*' && prev && prev.v === 'function') tok.gen = true;
      if (tv === '?') tp.tern = (tp.tern || 0) + 1;
      if (tv === ':') { if (tp.tern > 0) { tp.tern--; tok.tern = true; } else if (tp.caseLabel) tok.caseColon = true; }
    }
    let skipSp = false;
    if (want) {
      nlf();
      if (tok.nl >= 2 && out && !out.endsWith('{\n')) out += '\n';
      want = 0; skipSp = true;
    }
    if (tv === '}' && tp.kind !== 'inl') { /* depth adjusted below */ }
    // emit
    if (tok.t === 'p' && tv === '}') {
      const inlSp = !skipSp && !atStart && prev && space(prev, tok);
      const e = stack.pop() || { kind: 'block' };
      if (e.kind === 'block' || e.kind === 'obj') { if (!e.empty) depth--; if (e.sw && e.cases > 0) depth -= e.cases; }
      if (!atStart && (e.kind === 'block' || e.kind === 'obj') && !e.empty) { nlf(); }
      if (inlSp && e.kind === 'inl') out += ' ';
      put('}');
      prevBlockClose = (e.kind === 'block' || e.kind === 'obj') ? e : null;
      if (e.kind === 'inl') prevBlockClose = null;
      if (e.kind === 'inl' && !valueEnd(null)) { /* keep */ }
      prev = tok; continue;
    }
    if (!skipSp && !atStart && prev && space(prev, tok)) out += ' ';
    put(tv);
    if (tok.t === 'p') {
      if (tv === '{') {
        const pv = prev;
        const pat = pv && pv.t === 'id' && ['const', 'let', 'var', 'import', 'export'].includes(pv.v);
        const isObj2 = pv && ((pv.t === 'p' && !')];{}'.includes(pv.v) && pv.v !== '=>') || (pv.t === 'id' && ['return', 'typeof', 'in', 'of', 'case', 'yield', 'await', 'delete', 'void', 'throw', 'default'].includes(pv.v)));
        let kind = pat ? 'inl' : isObj2 ? (lookInline(k) ? 'inl' : 'obj') : 'block';
        const e = { kind, tern: 0, sw: pv && pv.v === ')' && lastParenKw === 'switch', cases: 0, isDo: pv && pv.v === 'do', empty: next && next.v === '}' };
        stack.push(e);
        if (!e.empty && kind !== 'inl') { depth++; want = 1; }
      } else if (tv === '(') { stack.push({ kind: '(', kw: doWhile ? 'dowhile' : prev && prev.t === 'id' ? prev.v : null, tern: 0 }); doWhile = false; }
      else if (tv === '[') stack.push({ kind: '[', tern: 0 });
      else if (tv === ')' || tv === ']') { const e = stack.pop(); if (tv === ')') lastParenKw = e && e.kind === '(' ? e.kw : null; }
      else if (tv === ';') { if (top().kind !== '(') want = 1; }
      else if (tv === ',') { if (top().kind === 'obj') want = 1; }
      else if (tv === ':' && tok.caseColon) {
        tp.caseLabel = false; tp.cases++; depth++; want = 1;
      }
    }
    prev = tok;
  }
  return out.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function jsMin(src) {
  const T = jsTok(src), K = [];
  let acc = 0;
  for (const t of T) {
    if (t.t === 'lc' || (t.t === 'bc' && !t.v.startsWith('/*!'))) { acc += t.nl + (t.t === 'bc' && t.v.includes('\n') ? 1 : 0); continue; }
    K.push({ ...t, nl: t.nl + acc }); acc = 0;
  }
  const dropAfter = /^(?:[{(\[,;:=?<>*%&|^!~+\-/.]|=>|\?\.|\.\.\.|[=!]==?|&&|\|\||\?\?|<=|>=|<<|>>>?|\*\*|[+\-*/%&|^]=|&&=|\|\|=|\?\?=|\*\*=|<<=|>>=|>>>=)$/;
  const dropBefore = /^(?:[)\]}.,;:?=*%&|^<>+\-/]|\?\.|=>|[=!]==?|&&|\|\||\?\?|<=|>=|<<|>>>?|\*\*|[+\-*/%&|^]=|&&=|\|\|=|\?\?=|\*\*=|<<=|>>=|>>>=)$/;
  const wc = /[\w$\u0080-\uFFFF]/;
  let out = '', prev = null;
  for (const t of K) {
    if (prev) {
      const ea = prev.v.slice(-1), sb = t.v[0];
      if (t.nl > 0 && !((prev.t === 'p' && dropAfter.test(prev.v)) || (t.t === 'p' && dropBefore.test(t.v)))) out += '\n';
      else if ((wc.test(ea) && wc.test(sb)) || (ea === sb && '+-'.includes(ea)) || (ea === '/' && (sb === '/' || sb === '*')) || (prev.t === 'num' && /^\d+$/.test(prev.v) && sb === '.')) out += ' ';
    }
    out += t.v; prev = t;
  }
  return out;
}

// ---------- CSS ----------
function cssParse(src) {
  let i = 0; const n = src.length;
  const block = (top) => {
    const items = [];
    for (;;) {
      while (i < n && /\s/.test(src[i])) i++;
      if (i >= n) { if (!top) throw new Error('CSS error: missing closing }'); return items; }
      if (src[i] === '}') { i++; if (top) continue; return items; }
      if (src.startsWith('/*', i)) { const j = src.indexOf('*/', i + 2), e = j < 0 ? n : j + 2; items.push({ k: 'cm', text: src.slice(i, e) }); i = e; continue; }
      let j = i, par = 0, q = null, buf = '';
      for (; j < n; j++) {
        const c = src[j];
        if (q) { buf += c; if (c === '\\') { buf += src[++j] || ''; continue; } if (c === q) q = null; continue; }
        if (c === '"' || c === "'") { q = c; buf += c; continue; }
        if (c === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j + 2); j = (e < 0 ? n : e + 2) - 1; continue; }
        if (c === '(') par++; else if (c === ')') par--;
        if (par <= 0 && (c === '{' || c === ';' || c === '}')) break;
        buf += c;
      }
      const term = src[j]; i = j + (term === '}' ? 0 : 1);
      const text = buf.trim();
      if (term === '{') items.push({ k: 'rule', sel: text, kids: block(false) });
      else if (text) {
        const c = text.indexOf(':');
        if (text[0] === '@' || c < 0) items.push({ k: 'at', text });
        else items.push({ k: 'decl', prop: text.slice(0, c).trim(), val: text.slice(c + 1).trim() });
      }
    }
  };
  return block(true);
}
const CSS_PROT = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|url\([^)]*\))/i;
const mapCss = (s, fn) => s.split(CSS_PROT).map((p, i) => (i % 2 ? p : fn(p))).join('');
const cssVal = (v, min) => mapCss(v, (p) => { p = p.replace(/\s+/g, ' ').replace(/\s*,\s*/g, min ? ',' : ', ').replace(/\s*!\s*important/gi, min ? '!important' : ' !important'); return min ? p.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')') : p.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')'); }).trim();
const SELP = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\[[^\]]*\]|\((?:[^()]|\([^()]*\))*\))/;
function cssSel(sel, min) {
  if (sel[0] === '@') return mapCss(sel.replace(/\s+/g, ' '), (p) => (min ? p.replace(/\s*,\s*/g, ',') : p.replace(/\s*,\s*/g, ', '))).replace(min ? /\(\s*([\w-]+)\s*:\s*/g : /\(\s*([\w-]+)\s*:\s*/g, '($1:' + (min ? '' : ' '));
  return sel.split(SELP).map((p, i) => (i % 2 ? (min ? p.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')') : p) : p.replace(/\s+/g, ' ').replace(/\s*([>+~,])\s*/g, min ? '$1' : (m, c) => (c === ',' ? ',\u0001' : ` ${c} `)))).join('').trim();
}
function cssFormat(src, ind = '  ') {
  const out = (items, d) => {
    const pad = ind.repeat(d), lines = [];
    items.forEach((it, idx) => {
      if (it.k === 'cm') lines.push(pad + it.text);
      else if (it.k === 'decl') lines.push(`${pad}${it.prop}: ${cssVal(it.val)};`);
      else if (it.k === 'at') lines.push(`${pad}${cssSel(it.text)};`);
      else {
        const head = cssSel(it.sel).replace(/\u0001/g, '\n' + pad).replace(/ {2,}(?=\S)/g, ' ');
        const kids = out(it.kids, d + 1);
        lines.push(kids ? `${pad}${head} {\n${kids}\n${pad}}` : `${pad}${head} {}`);
      }
      if (d === 0 && it.k === 'rule' && idx < items.length - 1) lines.push('');
    });
    return lines.join('\n');
  };
  return out(cssParse(src), 0) + '\n';
}
function cssMin(src) {
  const out = (items) => {
    let s = '';
    for (const it of items) {
      if (it.k === 'cm') { if (it.text.startsWith('/*!')) s += it.text; }
      else if (it.k === 'decl') s += `${it.prop}:${cssVal(it.val, true)};`;
      else if (it.k === 'at') s += cssSel(it.text, true) + ';';
      else s += `${cssSel(it.sel, true)}{${out(it.kids).replace(/;$/, '')}}`;
    }
    return s;
  };
  return out(cssParse(src)).replace(/;$/, '');
}

// ---------- SQL ----------
const SQL_KW = new Set(('SELECT FROM WHERE AND OR NOT NULL IS IN LIKE ILIKE BETWEEN EXISTS CASE WHEN THEN ELSE END AS ON JOIN DISTINCT ALL ANY SOME LIMIT OFFSET ASC DESC BY INNER LEFT RIGHT OUTER FULL CROSS NATURAL UNION INTERSECT EXCEPT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP INDEX VIEW PRIMARY FOREIGN REFERENCES DEFAULT UNIQUE CHECK CONSTRAINT IF WITH RECURSIVE OVER PARTITION ROWS RANGE TRUE FALSE RETURNING USING HAVING GROUP ORDER ADD COLUMN CASCADE TRUNCATE BEGIN COMMIT ROLLBACK').split(' '));
const SQL_FN = new Set('COUNT SUM AVG MIN MAX COALESCE IFNULL NULLIF CAST ROUND FLOOR CEIL ABS LOWER UPPER LENGTH SUBSTRING SUBSTR TRIM CONCAT NOW DATE_TRUNC EXTRACT ROW_NUMBER RANK DENSE_RANK LAG LEAD IF'.split(' '));
const SQL_MAJOR = new Set(['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'RETURNING']);
function sqlTok(s) {
  const T = []; let i = 0; const n = s.length;
  while (i < n) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '-' && s[i + 1] === '-') { let j = s.indexOf('\n', i); if (j < 0) j = n; T.push({ t: 'cm', v: s.slice(i, j).trimEnd(), line: true }); i = j; continue; }
    if (c === '/' && s[i + 1] === '*') { let j = s.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; T.push({ t: 'cm', v: s.slice(i, j) }); i = j; continue; }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n) { if (s[j] === c) { if (s[j + 1] === c) j += 2; else break; } else j++; }
      if (j >= n) throw new Error('SQL error: unterminated quoted string');
      T.push({ t: c === "'" ? 'str' : 'id', v: s.slice(i, j + 1) }); i = j + 1; continue;
    }
    let m = /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(s.slice(i, i + 40));
    if (m) { T.push({ t: 'num', v: m[0] }); i += m[0].length; continue; }
    m = /^[:@$]?[\p{L}_#][\p{L}\p{N}_$#]*/u.exec(s.slice(i));
    if (m) { T.push({ t: 'w', v: m[0] }); i += m[0].length; continue; }
    m = /^\$\d+/.exec(s.slice(i, i + 12));
    if (m) { T.push({ t: 'num', v: m[0] }); i += m[0].length; continue; }
    m = /^(?:<=>|<>|!=|<=|>=|\|\||::|->>|->|=>|:=)/.exec(s.slice(i, i + 3));
    if (m) { T.push({ t: 'op', v: m[0] }); i += m[0].length; continue; }
    T.push({ t: '=<>+-*/%^&|~!'.includes(c) ? 'op' : 'p', v: c }); i++;
  }
  // merge multi-word keywords and uppercase
  const R = [];
  for (let k = 0; k < T.length; k++) {
    const t = T[k];
    if (t.t !== 'w') { R.push(t); continue; }
    const u = t.v.toUpperCase(), nx = (j) => (T[k + j] && T[k + j].t === 'w' ? T[k + j].v.toUpperCase() : '');
    let m = null;
    if ((u === 'GROUP' || u === 'ORDER') && nx(1) === 'BY') m = [u + ' BY', 2];
    else if (u === 'INSERT' && nx(1) === 'INTO') m = ['INSERT INTO', 2];
    else if (u === 'DELETE' && nx(1) === 'FROM') m = ['DELETE FROM', 2];
    else if (u === 'UNION' && nx(1) === 'ALL') m = ['UNION ALL', 2];
    else if ((u === 'PRIMARY' || u === 'FOREIGN') && nx(1) === 'KEY') m = [u + ' KEY', 2];
    else if (['LEFT', 'RIGHT', 'FULL', 'INNER', 'CROSS', 'NATURAL'].includes(u)) {
      if (nx(1) === 'JOIN') m = [u + ' JOIN', 2]; else if (nx(1) === 'OUTER' && nx(2) === 'JOIN') m = [u + ' OUTER JOIN', 3];
    } else if (u === 'JOIN') m = ['JOIN', 1];
    if (m) { R.push({ t: 'kw', v: m[0], major: !/KEY/.test(m[0]), join: /JOIN/.test(m[0]) }); k += m[1] - 1; continue; }
    if (SQL_KW.has(u) && !(u === 'END' && false)) R.push({ t: 'kw', v: u, major: SQL_MAJOR.has(u) });
    else if (SQL_FN.has(u) && T[k + 1] && T[k + 1].v === '(') R.push({ t: 'kw', v: u, fn: true });
    else R.push(t);
  }
  return R;
}
function sqlFormat(src, o) {
  const T = sqlTok(src), ind = o.ind, up = o.upper;
  const out = []; let line = '', lvl = 0;
  const frames = [{ base: 0, sub: true, clause: null, lb: false, open: 0 }];
  let caseD = 0, between = false, pend = false, prev = null;
  const top = () => frames[frames.length - 1];
  const nl = (l) => { if (line.trim()) out.push(line.replace(/\s+$/, '')); lvl = l; line = ind.repeat(l); };
  const add = (str, tok) => {
    if (prev && line.trim() && sp(prev, tok)) line += ' ';
    line += str;
  };
  const sp = (p, t) => {
    if (p.v === '(' || p.v === '.' || p.v === '::') return false;
    if (t.v === ')' || t.v === ',' || t.v === ';' || t.v === '.' || t.v === '::') return false;
    if (t.v === '(') return !(p.t === 'w' || p.t === 'id' || (p.t === 'kw' && p.fn)) || top().clause === 'INSERT INTO';
    if (p.t === 'op' && p.unary) return false;
    return true;
  };
  const commas = (k) => { let d = 0, c = 0; for (let j = k + 1; j < T.length; j++) { const x = T[j]; if (x.v === '(') d++; else if (x.v === ')') { if (--d < 0) break; } else if (d === 0 && x.t === 'kw' && x.major && !x.join) break; else if (d === 0 && x.v === ';') break; else if (d === 0 && x.v === ',') c++; } return c; };
  for (let k = 0; k < T.length; k++) {
    const t = T[k], f = top();
    const nextT = T[k + 1];
    if (pend && !(t.t === 'kw' && (t.v === 'DISTINCT' || t.v === 'ALL')) && t.t !== 'cm') { pend = false; nl(f.base + 1); prev = null; }
    if (t.t === 'cm') {
      if (t.line) { if (line.trim()) line += ' '; line += t.v; nl(lvl); } else { if (line.trim()) line += ' '; line += t.v; }
      continue;
    }
    if (t.t === 'kw' && t.major && caseD === 0) {
      const v = up ? t.v : t.v.toLowerCase();
      if (t.v === 'VALUES' && f.clause === 'INSERT INTO') { nl(f.base); }
      else nl(f.base);
      f.clause = t.v.startsWith('SELECT') || t.v === 'INSERT INTO' || t.v === 'VALUES' || t.v === 'FROM' || t.v === 'WHERE' || t.v === 'HAVING' || t.v === 'SET' || t.v === 'GROUP BY' || t.v === 'ORDER BY' ? t.v : t.join ? 'JOIN' : t.v;
      f.lb = ['SELECT', 'GROUP BY', 'ORDER BY', 'SET'].includes(t.v) && commas(k) >= 1;
      prev = null; add(v, { v: '' }); prev = t;
      if (f.lb) pend = true;
      continue;
    }
    if (t.t === 'kw' && (t.v === 'AND' || t.v === 'OR') && caseD === 0 && f.sub && (f.clause === 'WHERE' || f.clause === 'HAVING') && !(t.v === 'AND' && between)) {
      nl(f.base + 1); prev = null; add(up ? t.v : t.v.toLowerCase(), t); prev = t; continue;
    }
    if (t.t === 'kw' && t.v === 'AND' && between) between = false;
    if (t.v === 'BETWEEN') between = true;
    if (t.t === 'kw' && t.v === 'CASE') caseD++;
    if (t.t === 'kw' && t.v === 'END' && caseD > 0) caseD--;
    if (t.v === '(') {
      const sub = nextT && nextT.t === 'kw' && (nextT.v === 'SELECT' || nextT.v === 'WITH');
      add('(', t);
      if (sub) { frames.push({ base: lvl + 1, sub: true, subq: true, clause: null, lb: false, open: lvl }); nl(lvl + 1); prev = null; continue; }
      frames.push({ base: f.base, sub: false, clause: f.clause, lb: false, nested: true });
      prev = t; continue;
    }
    if (t.v === ')') {
      const e = frames.length > 1 ? frames.pop() : f;
      if (e.subq) { nl(e.open); prev = null; add(')', t); prev = t; continue; }
      add(')', t); prev = t; continue;
    }
    if (t.v === ',') {
      add(',', t);
      if (f.sub && f.lb && ['SELECT', 'GROUP BY', 'ORDER BY', 'SET'].includes(f.clause)) { nl(f.base + 1); prev = null; continue; }
      if (f.sub && f.clause === 'VALUES') { nl(f.base + 1); prev = null; continue; }
      prev = t; continue;
    }
    if (t.v === ';') { add(';', t); nl(0); out.push(''); frames.length = 1; frames[0].clause = null; prev = null; caseD = 0; continue; }
    let txt = t.v;
    if (t.t === 'kw') txt = up ? t.v : t.v.toLowerCase();
    if ((t.v === '-' || t.v === '+') && (!prev || prev.t === 'op' || prev.t === 'kw' || prev.v === '(' || prev.v === ',')) t.unary = true;
    add(txt, t); prev = t;
  }
  if (line.trim()) out.push(line.replace(/\s+$/, ''));
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}
function sqlMin(src) {
  const T = sqlTok(src).filter((t) => t.t !== 'cm');
  let out = '', prev = null;
  for (const t of T) {
    if (prev) {
      const ep = prev.v.slice(-1), st = t.v[0];
      const wordy = (x, c) => x.t === 'w' || x.t === 'kw' || x.t === 'num' || x.t === 'str' || x.t === 'id' || (x.t === 'p' && c === '?');
      if ((wordy(prev, ep) && wordy(t, st)) || (ep === '-' && st === '-') || (ep === '/' && st === '*')) out += ' ';
    }
    out += t.v; prev = t;
  }
  return out;
}

// ---------- curl -> code ----------
function shellSplit(s) {
  s = s.replace(/\\\r?\n/g, ' ');
  const out = []; let cur = '', has = false, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { if (has) { out.push(cur); cur = ''; has = false; } i++; continue; }
    has = true;
    if (c === "'") { const j = s.indexOf("'", i + 1); if (j < 0) throw new Error('Unterminated single quote'); cur += s.slice(i + 1, j); i = j + 1; }
    else if (c === '$' && s[i + 1] === "'") {
      i += 2;
      const m = { n: '\n', t: '\t', r: '\r', "'": "'", '\\': '\\', '"': '"' };
      while (i < s.length && s[i] !== "'") { if (s[i] === '\\') { cur += m[s[i + 1]] ?? s[i + 1]; i += 2; } else cur += s[i++]; }
      i++;
    } else if (c === '"') {
      i++;
      while (i < s.length && s[i] !== '"') { if (s[i] === '\\' && '"\\$`'.includes(s[i + 1])) { cur += s[i + 1]; i += 2; } else cur += s[i++]; }
      if (i >= s.length) throw new Error('Unterminated double quote');
      i++;
    } else if (c === '\\') { cur += s[i + 1] ?? ''; i += 2; }
    else { cur += c; i++; }
  }
  if (has) out.push(cur);
  return out;
}
const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
function parseCurl(cmd) {
  const args = shellSplit(cmd.trim());
  if (!args.length) throw new Error('Paste a curl command');
  if (args[0] === 'curl') args.shift();
  const r = { method: null, url: null, headers: [], data: [], form: [], user: null, get: false, insecure: false, compressed: false, head: false, follow: false };
  const valShort = 'XHduAFbeoumwxT';
  for (let i = 0; i < args.length; i++) {
    let a = args[i], inline = null;
    if (/^--[\w-]+=/.test(a)) { const k = a.indexOf('='); inline = a.slice(k + 1); a = a.slice(0, k); }
    else if (/^-[a-zA-Z]./.test(a) && !a.startsWith('--')) {
      if (valShort.includes(a[1])) { inline = a.slice(2); a = a.slice(0, 2); }
      else { args.splice(i, 1, ...a.slice(1).split('').map((c) => '-' + c)); a = args[i]; }
    }
    const take = () => { if (inline !== null) return inline; if (i + 1 >= args.length) throw new Error(`Option ${a} needs a value`); return args[++i]; };
    switch (a) {
      case '-X': case '--request': r.method = take().toUpperCase(); break;
      case '-H': case '--header': { const h = take(), k = h.indexOf(':'); if (k > 0) r.headers.push([h.slice(0, k).trim(), h.slice(k + 1).trim()]); break; }
      case '-d': case '--data': case '--data-raw': case '--data-binary': case '--data-ascii': r.data.push(take()); break;
      case '--data-urlencode': { const v = take(), k = v.indexOf('='); r.data.push(k < 0 ? encodeURIComponent(v) : (k ? v.slice(0, k) + '=' : '') + encodeURIComponent(v.slice(k + 1))); break; }
      case '--json': r.data.push(take()); r.headers.push(['Content-Type', 'application/json'], ['Accept', 'application/json']); break;
      case '-F': case '--form': case '--form-string': r.form.push(take()); break;
      case '-u': case '--user': r.user = take(); break;
      case '-A': case '--user-agent': r.headers.push(['User-Agent', take()]); break;
      case '-e': case '--referer': r.headers.push(['Referer', take()]); break;
      case '-b': case '--cookie': r.headers.push(['Cookie', take()]); break;
      case '-L': case '--location': r.follow = true; break;
      case '-k': case '--insecure': r.insecure = true; break;
      case '--compressed': r.compressed = true; break;
      case '-I': case '--head': r.head = true; break;
      case '-G': case '--get': r.get = true; break;
      case '--url': r.url = take(); break;
      case '-o': case '--output': case '-m': case '--max-time': case '--connect-timeout': case '-x': case '--proxy': case '-w': case '--retry': case '-T': case '--cert': case '--key': case '--cacert': case '-u2': take(); break;
      default: if (!a.startsWith('-') && !r.url) r.url = a;
    }
  }
  if (!r.url) throw new Error('No URL found in curl command');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(r.url)) r.url = 'http://' + r.url;
  r.body = r.data.length && !r.form.length ? r.data.join('&') : null;
  if (r.get && r.body) { r.url += (r.url.includes('?') ? '&' : '?') + r.body; r.body = null; }
  r.method = r.method || (r.head ? 'HEAD' : (r.body !== null || r.form.length) && !r.get ? 'POST' : 'GET');
  const hasH = (n) => r.headers.some(([k]) => k.toLowerCase() === n);
  if (r.user !== null && !hasH('authorization')) r.headers.push(['Authorization', 'Basic ' + b64(r.user)]);
  if (r.body !== null && !hasH('content-type')) r.headers.push(['Content-Type', 'application/x-www-form-urlencoded']);
  const seen = new Map(); for (const [k, v] of r.headers) seen.set(k, v);
  r.headers = [...seen];
  r.form = r.form.map((f) => { const k = f.indexOf('='); return [f.slice(0, k), f.slice(k + 1)]; });
  return r;
}
const pyRepr = (v, pad = '') => v === null ? 'None' : v === true ? 'True' : v === false ? 'False' : typeof v === 'string' ? JSON.stringify(v) : typeof v === 'number' ? String(v)
  : Array.isArray(v) ? (v.length ? `[\n${v.map((x) => pad + '    ' + pyRepr(x, pad + '    ')).join(',\n')},\n${pad}]` : '[]')
    : Object.keys(v).length ? `{\n${Object.entries(v).map(([k, x]) => `${pad}    ${JSON.stringify(k)}: ${pyRepr(x, pad + '    ')}`).join(',\n')},\n${pad}}` : '{}';
const phpQ = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
function curlToCode(cmd, target) {
  const r = parseCurl(cmd), q = JSON.stringify;
  const ct = (r.headers.find(([k]) => k.toLowerCase() === 'content-type') || [])[1] || '';
  let json; if (r.body !== null && /json/i.test(ct)) { try { json = JSON.parse(r.body); } catch { /* raw */ } }
  const isFile = (v) => v.startsWith('@');
  if (target.startsWith('fetch')) {
    const hdrs = r.headers.filter(([k]) => !(r.form.length && k.toLowerCase() === 'content-type'));
    let pre = '', body = '';
    if (r.form.length) {
      pre = 'const form = new FormData();\n' + r.form.map(([k, v]) => `form.append(${q(k)}, ${isFile(v) ? `/* file: ${v.slice(1)} */ fileInput.files[0]` : q(v)});`).join('\n') + '\n\n';
      body = 'form';
    } else if (r.body !== null) body = json !== undefined ? `JSON.stringify(${JSON.stringify(json, null, 2).replace(/\n/g, '\n  ')})` : q(r.body);
    const opts = [`  method: ${q(r.method)}`];
    if (hdrs.length) opts.push(`  headers: {\n${hdrs.map(([k, v]) => `    ${q(k)}: ${q(v)}`).join(',\n')}\n  }`);
    if (body) opts.push(`  body: ${body}`);
    if (r.follow === false) opts.push("  redirect: 'manual'");
    return `${pre}const response = await fetch(${q(r.url)}, {\n${opts.join(',\n')}\n});\n\nconsole.log(response.status);\nconsole.log(await response.text());${r.insecure ? '\n// note: -k (insecure) has no fetch equivalent; fix the certificate instead.' : ''}`;
  }
  if (target.startsWith('node')) {
    const u = new URL(r.url), mod = u.protocol === 'https:' ? 'https' : 'http';
    const body = r.form.length ? null : r.body;
    const hdrs = r.headers.filter(([k]) => !r.form.length || k.toLowerCase() !== 'content-type');
    const opts = [`  method: ${q(r.method)}`];
    if (hdrs.length) opts.push(`  headers: {\n${hdrs.map(([k, v]) => `    ${q(k)}: ${q(v)}`).join(',\n')}\n  }`);
    if (r.insecure && mod === 'https') opts.push('  rejectUnauthorized: false');
    return `const ${mod} = require('${mod}');\n\nconst req = ${mod}.request(${q(r.url)}, {\n${opts.join(',\n')}\n}, (res) => {\n  let data = '';\n  res.setEncoding('utf8');\n  res.on('data', (chunk) => (data += chunk));\n  res.on('end', () => console.log(res.statusCode, data));\n});\n\nreq.on('error', console.error);\n${body !== null ? `req.write(${json !== undefined ? `JSON.stringify(${JSON.stringify(json)})` : q(body)});\n` : ''}${r.form.length ? '// multipart/form-data bodies need to be built manually (or use fetch + FormData in Node 18+).\n' : ''}req.end();`;
  }
  if (target.startsWith('python')) {
    const lines = ['import requests', ''];
    const args = [q(r.url)];
    const hdrs = r.headers.filter(([k]) => !r.form.length || k.toLowerCase() !== 'content-type');
    if (hdrs.length) { lines.push(`headers = ${pyRepr(Object.fromEntries(hdrs))}`, ''); args.push('headers=headers'); }
    if (r.form.length) {
      const fields = r.form.filter(([, v]) => !isFile(v)), files = r.form.filter(([, v]) => isFile(v));
      if (fields.length) { lines.push(`data = ${pyRepr(Object.fromEntries(fields))}`, ''); args.push('data=data'); }
      if (files.length) { lines.push(`files = {\n${files.map(([k, v]) => `    ${q(k)}: open(${q(v.slice(1))}, 'rb')`).join(',\n')},\n}`, ''); args.push('files=files'); }
    } else if (r.body !== null) {
      if (json !== undefined && json !== null && typeof json === 'object') { lines.push(`payload = ${pyRepr(json)}`, ''); args.push('json=payload'); }
      else { lines.push(`data = ${q(r.body)}`, ''); args.push('data=data'); }
    }
    if (r.user !== null) { const k = r.user.indexOf(':'); args.push(`auth=(${q(k < 0 ? r.user : r.user.slice(0, k))}, ${q(k < 0 ? '' : r.user.slice(k + 1))})`); }
    if (r.insecure) args.push('verify=False');
    if (!r.follow) args.push('allow_redirects=False');
    const fn = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(r.method) ? `requests.${r.method.toLowerCase()}(` : `requests.request(${q(r.method)}, `;
    lines.push(`response = ${fn}${args.join(', ')})`, '', 'print(response.status_code)', 'print(response.text)');
    if (json !== undefined && r.headers.some(([k]) => k.toLowerCase() === 'content-type')) { /* json= sets content-type itself; header kept for exactness */ }
    return lines.join('\n');
  }
  // php
  const opts = [`CURLOPT_URL => ${phpQ(r.url)}`, 'CURLOPT_RETURNTRANSFER => true', `CURLOPT_CUSTOMREQUEST => ${phpQ(r.method)}`];
  if (r.head) opts.push('CURLOPT_NOBODY => true');
  const hdrs = r.headers.filter(([k]) => !r.form.length || k.toLowerCase() !== 'content-type');
  if (hdrs.length) opts.push(`CURLOPT_HTTPHEADER => [\n        ${hdrs.map(([k, v]) => phpQ(`${k}: ${v}`)).join(',\n        ')},\n    ]`);
  if (r.form.length) opts.push(`CURLOPT_POSTFIELDS => [\n        ${r.form.map(([k, v]) => `${phpQ(k)} => ${isFile(v) ? `new CURLFile(${phpQ(v.slice(1))})` : phpQ(v)}`).join(',\n        ')},\n    ]`);
  else if (r.body !== null) opts.push(`CURLOPT_POSTFIELDS => ${phpQ(r.body)}`);
  if (r.user !== null) opts.push(`CURLOPT_USERPWD => ${phpQ(r.user)}`);
  if (r.insecure) opts.push('CURLOPT_SSL_VERIFYPEER => false', 'CURLOPT_SSL_VERIFYHOST => 0');
  if (r.follow) opts.push('CURLOPT_FOLLOWLOCATION => true');
  if (r.compressed) opts.push("CURLOPT_ENCODING => ''");
  return `<?php\n$ch = curl_init();\ncurl_setopt_array($ch, [\n    ${opts.join(',\n    ')},\n]);\n\n$response = curl_exec($ch);\nif ($response === false) {\n    echo 'cURL error: ' . curl_error($ch);\n}\ncurl_close($ch);\n\necho $response;`;
}

// ---------- custom UIs ----------
function jsonTreeUI(root) {
  const mono = 'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px';
  const ta = el('textarea', { spellcheck: false, value: jsonSample, style: 'width:100%;min-height:8em;' + mono });
  const q = el('input', { type: 'search', placeholder: 'Search keys and values', style: 'margin-right:.5em' });
  const status = el('span', { role: 'status', style: 'color:var(--muted,#555)' });
  const tree = el('div', { style: mono + ';margin-top:.75em;overflow:auto;line-height:1.5' });
  let mode = 'default', data, timer;
  const colors = { string: 'light-dark(#2a7a2a,#7fd98a)', number: 'light-dark(#1a5fb4,#8ab4f8)', boolean: 'light-dark(#a5521d,#f0a070)', null: 'light-dark(#666,#aaa)' };
  const BTNL = 'border:0;background:none;padding:0;min-height:1.5rem;min-width:1.5rem;cursor:pointer;font:inherit;text-align:start;';
  const copy = (path) => { try { navigator.clipboard.writeText(path); } catch { /* clipboard unavailable */ } status.textContent = 'Path: ' + path; };
  function build(v, key, path, depth, term) {
    const isC = v !== null && typeof v === 'object';
    const keyHit = key !== null && term && String(key).toLowerCase().includes(term);
    const keyEl = key === null ? null : el('button', { type: 'button', textContent: typeof key === 'number' ? key : JSON.stringify(key), title: 'Click to copy path ' + path, 'aria-label': 'Copy path ' + path, style: BTNL + 'color:' + (keyHit ? '#000;background:#ffe08a' : 'light-dark(#7a3e9d,#d3a5f0)'), onclick: () => copy(path) });
    const colon = key === null ? null : document.createTextNode(': ');
    if (!isC) {
      const hit = term && String(v).toLowerCase().includes(term);
      if (term && !hit && !keyHit) return null;
      const t = typeOf(v);
      return el('div', { style: 'padding-left:1.2em' }, keyEl, colon, el('span', { textContent: JSON.stringify(v), style: `color:${colors[t]}` + (hit ? ';background:#ffe08a;color:#000' : '') }));
    }
    const entries = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);
    const kids = entries.map(([k, x]) => build(x, k, jpath(path, k), depth + 1, term));
    const any = kids.some(Boolean);
    if (term && !any && !keyHit) return null;
    const open = mode === 'all' ? true : mode === 'none' ? false : term ? true : depth < 2;
    const body = el('div', {}, ...kids.filter(Boolean));
    body.style.display = open ? 'block' : 'none';
    const tog = el('button', { type: 'button', textContent: open ? '\u25be' : '\u25b8', 'aria-expanded': String(open), 'aria-label': (key === null ? 'Root' : String(key)) + ' (' + entries.length + ')', style: BTNL + 'width:1.5rem;user-select:none' });
    const sum = el('span', { textContent: Array.isArray(v) ? `[${entries.length}]` : `{${entries.length}}`, style: 'color:var(--muted,#555)' });
    const head = el('div', {}, tog, keyEl, colon, sum);
    tog.addEventListener('click', () => { const o = body.style.display === 'none'; body.style.display = o ? 'block' : 'none'; tog.textContent = o ? '\u25be' : '\u25b8'; tog.setAttribute('aria-expanded', String(o)); });
    sum.style.cursor = 'pointer'; sum.addEventListener('click', () => tog.click());
    return el('div', { style: depth ? 'padding-left:1.2em' : '' }, head, body);
  }
  function draw() {
    tree.replaceChildren();
    try { data = parseJ(ta.value); } catch (e) { tree.append(el('pre', { className: 'out err', textContent: e.message })); return; }
    const term = q.value.trim().toLowerCase();
    const n = build(data, null, '$', 0, term);
    tree.append(n || el('div', { textContent: 'No matches', style: 'color:var(--muted,#555)' }));
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(draw, 150); };
  ta.addEventListener('input', later); q.addEventListener('input', later);
  root.append(el('label', {}, 'JSON'), ta,
    el('div', { className: 'row', style: 'margin-top:.5em' }, q,
      el('button', { textContent: 'Expand all', onclick: () => { mode = 'all'; draw(); } }), ' ',
      el('button', { textContent: 'Collapse all', onclick: () => { mode = 'none'; draw(); } }), ' ', status), tree);
  draw();
}

const csvSample = 'name,age,city,score\nAda,36,London,9.5\nLinus,54,"Portland, OR",8\nGrace,85,"New York",9.9\n"Bob ""B"" Smith",41,Austin,7.25\n';
function csvViewerUI(root) {
  const ta = el('textarea', { spellcheck: false, value: csvSample, style: 'width:100%;min-height:7em;font-family:ui-monospace,Menlo,Consolas,monospace' });
  const dsel = el('select', { 'aria-label': 'Delimiter' }, ...Object.keys(DELIMS).map((k) => el('option', { value: k, textContent: k })));
  const filter = el('input', { type: 'search', placeholder: 'Filter rows' });
  const file = el('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv', 'aria-label': 'Open a CSV file' });
  const info = el('span', { role: 'status', style: 'color:var(--muted,#555);margin-left:.5em' });
  const wrap = el('div', { style: 'overflow:auto;max-height:60vh;margin-top:.5em' });
  let sortCol = -1, dir = 1, timer;
  const num = (s) => (s !== '' && s.trim() !== '' && !isNaN(Number(s)) ? Number(s) : null);
  function draw() {
    wrap.replaceChildren();
    let rows;
    try { rows = parseCSV(ta.value, DELIMS[dsel.value]); } catch (e) { wrap.append(el('pre', { className: 'out err', textContent: e.message })); return; }
    if (!rows.length) { info.textContent = ''; return; }
    const head = rows[0], f = filter.value.trim().toLowerCase();
    let body = rows.slice(1);
    if (f) body = body.filter((r) => r.some((c) => c.toLowerCase().includes(f)));
    if (sortCol >= 0) body = [...body].sort((a, b) => { const x = a[sortCol] ?? '', y = b[sortCol] ?? '', nx = num(x), ny = num(y); return dir * (nx !== null && ny !== null ? nx - ny : x.localeCompare(y, undefined, { numeric: true })); });
    info.textContent = `${body.length} of ${rows.length - 1} rows, ${head.length} columns`;
    const th = head.map((h, i) => el('th', { scope: 'col', 'aria-sort': i === sortCol ? (dir > 0 ? 'ascending' : 'descending') : 'none', style: 'text-align:left;padding:.3em .6em;border-bottom:2px solid #888;position:sticky;top:0;background:Canvas' },
      el('button', { type: 'button', textContent: h + (i === sortCol ? (dir > 0 ? ' \u25b2' : ' \u25bc') : ''), title: 'Sort by ' + h, style: 'border:0;background:none;font:inherit;font-weight:bold;cursor:pointer;padding:0;min-height:1.5rem;color:inherit', onclick: () => { if (sortCol === i) dir = -dir; else { sortCol = i; dir = 1; } draw(); } })));
    wrap.append(el('table', { style: 'border-collapse:collapse' }, el('thead', {}, el('tr', {}, th)),
      el('tbody', {}, ...body.map((r) => el('tr', {}, head.map((_, i) => el('td', { textContent: r[i] ?? '', style: 'padding:.25em .6em;border-bottom:1px solid #8884' })))))));
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(draw, 150); };
  ta.addEventListener('input', later); filter.addEventListener('input', later); dsel.addEventListener('change', draw);
  file.addEventListener('change', async () => { if (file.files[0]) { ta.value = await file.files[0].text(); sortCol = -1; draw(); } });
  root.append(el('label', {}, 'CSV (paste or open a file)'), ta,
    el('div', { className: 'row', style: 'margin-top:.5em' }, file, ' Delimiter ', dsel, ' ', filter, info), wrap);
  draw();
}

// ---------- tool definitions ----------
const tools = [
  // JSON
  {
    id: 'json-format', cat: 'JSON', title: 'JSON Formatter', desc: 'Pretty-print JSON with custom indent and optional key sorting; errors show line and column.',
    labels: ['JSON'], opts: [indentOpt, { id: 'sort', label: 'Sort keys', type: 'checkbox', def: false }], sample: jsonSample,
    run: ([t], o) => { const v = parseJ(t); return JSON.stringify(o.sort ? sortKeys(v) : v, null, IND(o.indent)); },
  },
  {
    id: 'json-minify', cat: 'JSON', title: 'JSON Minifier', desc: 'Remove all whitespace from JSON (validates first).',
    labels: ['JSON'], sample: jsonSample, run: ([t]) => JSON.stringify(parseJ(t)),
  },
  {
    id: 'json-escape', cat: 'JSON', title: 'JSON String Escape', desc: 'Escape text so it can be embedded inside a JSON string.',
    labels: ['Text'], opts: [{ id: 'quotes', label: 'Wrap in quotes', type: 'checkbox', def: true }, { id: 'ascii', label: 'Escape non-ASCII', type: 'checkbox', def: false }],
    sample: 'He said "hi"\nSecond line\twith tab, backslash \\ and emoji \u{1F600}, caf\u00e9',
    run: ([t], o) => { let s = JSON.stringify(t); if (o.ascii) s = s.replace(/[\u0080-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')); return o.quotes ? s : s.slice(1, -1); },
  },
  {
    id: 'json-unescape', cat: 'JSON', title: 'JSON String Unescape', desc: 'Turn an escaped JSON string (\\n, \\", \\uXXXX) back into plain text.',
    labels: ['Escaped string'], sample: '"He said \\"hi\\"\\nSecond line\\twith tab, backslash \\\\ and emoji \\ud83d\\ude00, caf\\u00e9"',
    run: ([t]) => { const s = t.trim(); return unescapeStr(s.length >= 2 && s[0] === '"' && s.endsWith('"') ? s.slice(1, -1) : t); },
  },
  {
    id: 'json-validate', cat: 'JSON', title: 'JSON Validator', desc: 'Check whether text is valid JSON and see its structure.',
    labels: ['JSON'], sample: jsonSample,
    run: ([t]) => {
      const v = parseJ(t);
      let keys = 0, depth = 0, nodes = 0;
      const walk = (x, d) => { nodes++; depth = Math.max(depth, d); if (x && typeof x === 'object') for (const k of Object.keys(x)) { if (!Array.isArray(x)) keys++; walk(x[k], d + 1); } };
      walk(v, 1);
      return `Valid JSON\n\nRoot type: ${typeOf(v)}${Array.isArray(v) ? ` (${v.length} items)` : isObj(v) ? ` (${Object.keys(v).length} keys)` : ''}\nTotal values: ${nodes}\nObject keys: ${keys}\nMax depth: ${depth}\nSize: ${new TextEncoder().encode(t).length} bytes`;
    },
  },
  { id: 'json-tree', cat: 'JSON', title: 'JSON Tree Viewer', desc: 'Browse JSON as a collapsible tree, search keys and values, click a key to copy its path.', custom: true, render: jsonTreeUI },
  {
    id: 'json-sort-keys', cat: 'JSON', title: 'JSON Key Sorter', desc: 'Sort object keys alphabetically at every level.',
    labels: ['JSON'], opts: [{ id: 'order', label: 'Order', type: 'select', choices: ['asc', 'desc'], def: 'asc' }, indentOpt], sample: jsonSample,
    run: ([t], o) => JSON.stringify(sortKeys(parseJ(t), o.order === 'desc'), null, IND(o.indent)),
  },
  {
    id: 'json-diff', cat: 'JSON', title: 'JSON Diff', desc: 'Compare two JSON documents and list differences by path.',
    inputs: 2, labels: ['Original JSON', 'Changed JSON'],
    sample: '{"name":"Ada","age":36,"tags":["a","b"],"address":{"city":"London","zip":"N1"},"old":true}',
    sample2: '{"name":"Ada","age":37,"tags":["a","c","d"],"address":{"city":"Paris","zip":"N1"},"new":1}',
    run: ([a, b]) => {
      const out = []; jsonDiff(parseJ(a), parseJ(b), '$', out);
      return out.length ? `${out.length} difference${out.length > 1 ? 's' : ''}  (+ added, - removed, ~ changed)\n\n${out.join('\n')}` : 'No differences: the documents are equivalent.';
    },
  },
  {
    id: 'json-to-csv', cat: 'JSON', title: 'JSON to CSV', desc: 'Convert an array of JSON objects to CSV, flattening nested values into dotted columns.',
    labels: ['JSON'], opts: [delimOpt(false), { id: 'flatten', label: 'Flatten nested', type: 'checkbox', def: true }],
    sample: '[{"id":1,"name":"Ada","address":{"city":"London","geo":{"lat":51.5}},"tags":["math","code"]},{"id":2,"name":"Linus, T.","address":{"city":"Portland"},"note":"says \\"hi\\""}]',
    run: ([t], o) => jsonToCsv(t, o),
  },
  {
    id: 'json-to-xml', cat: 'JSON', title: 'JSON to XML', desc: 'Convert JSON to XML. Keys starting with @ become attributes, #text becomes text content.',
    labels: ['JSON'], opts: [{ id: 'root', label: 'Root element', type: 'text', def: 'root' }, indentOpt],
    sample: '{"book":{"@id":"42","title":"Dune & more","authors":["Frank","Brian"],"price":9.99,"stock":null,"note":{"@lang":"en","#text":"classic <sci-fi>"}}}',
    run: ([t], o) => jsonToXml(parseJ(t), o.root.trim(), o.indent === 'tab' ? '\t' : ' '.repeat(+o.indent)),
  },
  {
    id: 'json-to-yaml', cat: 'JSON', title: 'JSON to YAML', desc: 'Convert JSON to clean block-style YAML.',
    labels: ['JSON'], opts: [{ id: 'indent', label: 'Indent', type: 'select', choices: ['2', '4'], def: '2' }], sample: jsonSample,
    run: ([t], o) => yamlDump(parseJ(t), +o.indent),
  },
  {
    id: 'json-to-toml', cat: 'JSON', title: 'JSON to TOML', desc: 'Convert a JSON object to TOML (tables and arrays of tables). TOML cannot represent null.',
    labels: ['JSON'], sample: '{"title":"Demo","owner":{"name":"Ada","born":1815},"ports":[8000,8001],"servers":[{"name":"alpha","ip":"10.0.0.1"},{"name":"beta","ip":"10.0.0.2"}],"limits":{"cpu":{"max":4}},"mixed":[1,"a",true]}',
    run: ([t]) => tomlDump(parseJ(t)),
  },
  {
    id: 'json-to-typescript', cat: 'JSON', title: 'JSON to TypeScript', desc: 'Generate TypeScript interfaces or types from a JSON sample, merging array elements.',
    labels: ['JSON'], opts: [{ id: 'root', label: 'Root name', type: 'text', def: 'Root' }, { id: 'style', label: 'Style', type: 'select', choices: ['interface', 'type'], def: 'interface' }, { id: 'optional', label: 'Mark missing keys optional', type: 'checkbox', def: true }],
    sample: '{"id":1,"name":"Ada","email":null,"tags":["a","b"],"address":{"city":"London","geo":{"lat":51.5,"lng":-0.12}},"orders":[{"sku":"A1","qty":2},{"sku":"B2","qty":1,"gift":true}],"my-key":1}',
    run: ([t], o) => toTS(parseJ(t), o),
  },
  {
    id: 'json-to-go', cat: 'JSON', title: 'JSON to Go Struct', desc: 'Generate Go structs with json tags from a JSON sample.',
    labels: ['JSON'], opts: [{ id: 'root', label: 'Root name', type: 'text', def: 'Root' }],
    sample: '{"id":1,"user_name":"Ada","email":null,"tags":["a","b"],"profile":{"avatar_url":"http://x/y.png","score":9.5},"orders":[{"sku":"A1","qty":2},{"sku":"B2","qty":1,"gift":true}]}',
    run: ([t], o) => toGo(parseJ(t), o),
  },
  {
    id: 'json-to-zod', cat: 'JSON', title: 'JSON to Zod Schema', desc: 'Generate a Zod schema (and inferred type) from a JSON sample.',
    labels: ['JSON'], opts: [{ id: 'root', label: 'Root name', type: 'text', def: 'Root' }],
    sample: '{"id":1,"name":"Ada","email":null,"tags":["a","b"],"address":{"city":"London"},"orders":[{"sku":"A1","qty":2},{"sku":"B2","qty":1,"gift":true}]}',
    run: ([t], o) => toZod(parseJ(t), o),
  },
  {
    id: 'json-schema-generator', cat: 'JSON', title: 'JSON Schema Generator', desc: 'Infer a draft-07 JSON Schema from a sample document, with optional string format detection.',
    labels: ['JSON sample'], opts: [{ id: 'required', label: 'Mark keys required', type: 'checkbox', def: true }, { id: 'strict', label: 'additionalProperties: false', type: 'checkbox', def: false }, { id: 'formats', label: 'Detect formats', type: 'checkbox', def: true }],
    sample: '{"id":1,"email":"ada@example.com","created":"2024-05-01T10:00:00Z","tags":["a"],"profile":{"score":9.5,"site":"https://example.com"},"orders":[{"sku":"A1","qty":2},{"sku":"B2","qty":1,"gift":true}]}',
    run: ([t], o) => toSchema(parseJ(t), o),
  },
  {
    id: 'json-schema-validator', cat: 'JSON', title: 'JSON Schema Validator', desc: 'Validate JSON data against a schema (type, properties, required, items, enum, min/max, pattern, anyOf/oneOf/allOf, local $ref).',
    inputs: 2, labels: ['JSON Schema', 'JSON data'],
    sample: '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","required":["name","age","pet"],"properties":{"name":{"type":"string","minLength":2},"age":{"type":"integer","minimum":0,"maximum":150},"email":{"type":"string","format":"email"},"tags":{"type":"array","items":{"type":"string"},"uniqueItems":true},"pet":{"oneOf":[{"$ref":"#/definitions/cat"},{"$ref":"#/definitions/dog"}]}},"additionalProperties":false,"definitions":{"cat":{"type":"object","properties":{"kind":{"const":"cat"},"lives":{"type":"integer"}},"required":["kind"]},"dog":{"type":"object","properties":{"kind":{"const":"dog"}},"required":["kind"]}}}',
    sample2: '{"name":"A","age":200,"email":"nope","tags":["x","x"],"pet":{"kind":"cat","lives":"nine"},"extra":1}',
    run: ([s, d]) => {
      const errs = validateSchema(parseJ(s), parseJ(d));
      return errs.length ? `Invalid: ${errs.length} error${errs.length > 1 ? 's' : ''}\n\n${errs.join('\n')}` : 'Valid: the data matches the schema.';
    },
  },
  {
    id: 'jsonpath-tester', cat: 'JSON', title: 'JSONPath Tester', desc: 'Run JSONPath queries ($, ., .., [], [*], slices, unions, [?()] filters) against JSON.',
    inputs: 2, labels: ['JSON data', 'JSONPath'], opts: [{ id: 'paths', label: 'Show matched paths', type: 'checkbox', def: false }],
    sample: '{"store":{"book":[{"title":"A","price":8.95,"author":"X"},{"title":"B","price":12.99,"author":"Y"},{"title":"C","price":22.99}],"bicycle":{"color":"red","price":19.95}}}',
    sample2: '$.store.book[?(@.price < 20 && @.author)].title',
    run: ([d, p], o) => {
      if (!p.trim()) throw new Error('Enter a JSONPath expression');
      const r = jsonPath(parseJ(d), p);
      return o.paths ? `${r.length} match${r.length === 1 ? '' : 'es'}\n\n` + r.map((n) => `${n.path} = ${JSON.stringify(n.v)}`).join('\n') : JSON.stringify(r.map((n) => n.v), null, 2);
    },
  },

  // CSV
  {
    id: 'csv-to-json', cat: 'CSV', title: 'CSV to JSON', desc: 'Parse CSV (RFC 4180 quotes, any delimiter) into JSON with optional type inference.',
    labels: ['CSV'], opts: [delimOpt(), { id: 'header', label: 'First row is header', type: 'checkbox', def: true }, { id: 'types', label: 'Infer types', type: 'checkbox', def: true }, indentOpt], sample: csvSample,
    run: ([t], o) => {
      const rows = parseCSV(t, DELIMS[o.delim]);
      if (!rows.length) throw new Error('No CSV data');
      let data = csvObjects(rows, o.header);
      if (o.types) data = data.map((r) => (Array.isArray(r) ? r.map(infer1) : Object.fromEntries(Object.entries(r).map(([k, v]) => [k, infer1(v)]))));
      return JSON.stringify(data, null, IND(o.indent));
    },
  },
  { id: 'csv-viewer', cat: 'CSV', title: 'CSV Viewer', desc: 'View CSV as a sortable, filterable table. Open a file or paste text.', custom: true, render: csvViewerUI },
  {
    id: 'csv-to-sql', cat: 'CSV', title: 'CSV to SQL INSERT', desc: 'Generate INSERT statements (and optionally CREATE TABLE) from CSV.',
    labels: ['CSV (first row = column names)'],
    opts: [delimOpt(), { id: 'table', label: 'Table name', type: 'text', def: 'my_table' }, { id: 'quote', label: 'Identifier quotes', type: 'select', choices: ['double quotes', 'backticks', 'none'], def: 'double quotes' },
      { id: 'create', label: 'Include CREATE TABLE', type: 'checkbox', def: true }, { id: 'multi', label: 'Single multi-row INSERT', type: 'checkbox', def: false }, { id: 'nulls', label: 'Empty cells as NULL', type: 'checkbox', def: true }],
    sample: csvSample,
    run: ([t], o) => {
      const rows = parseCSV(t, DELIMS[o.delim]);
      if (rows.length < 2) throw new Error('Need a header row and at least one data row');
      const qc = o.quote === 'backticks' ? '`' : o.quote === 'none' ? '' : '"';
      const id = (x) => qc + x.split(qc || '\0').join(qc + qc) + qc;
      const head = rows[0].map((h) => h.trim() || 'col'), data = rows.slice(1);
      const isNum = (s) => /^-?(0|[1-9]\d*)(\.\d+)?$/.test(s);
      const lit = (s) => (s === '' && o.nulls ? 'NULL' : isNum(s) ? s : `'${s.replace(/'/g, "''")}'`);
      const types = head.map((_, i) => { const vs = data.map((r) => r[i] ?? '').filter((s) => s !== ''); return vs.length && vs.every((s) => /^-?(0|[1-9]\d*)$/.test(s)) ? 'INTEGER' : vs.length && vs.every(isNum) ? 'REAL' : 'TEXT'; });
      const tbl = id(o.table.trim() || 'my_table'), cols = head.map(id).join(', ');
      const vals = data.map((r) => `(${head.map((_, i) => lit(r[i] ?? '')).join(', ')})`);
      const out = [];
      if (o.create) out.push(`CREATE TABLE ${tbl} (\n${head.map((h, i) => `  ${id(h)} ${types[i]}`).join(',\n')}\n);\n`);
      if (o.multi) out.push(`INSERT INTO ${tbl} (${cols}) VALUES\n${vals.map((v) => '  ' + v).join(',\n')};`);
      else out.push(vals.map((v) => `INSERT INTO ${tbl} (${cols}) VALUES ${v};`).join('\n'));
      return out.join('\n');
    },
  },
  {
    id: 'csv-to-markdown-table', cat: 'CSV', title: 'CSV to Markdown Table', desc: 'Turn CSV into an aligned Markdown (GFM) table.',
    labels: ['CSV'], opts: [delimOpt(), { id: 'right', label: 'Right-align numeric columns', type: 'checkbox', def: true }], sample: csvSample,
    run: ([t], o) => {
      const rows = parseCSV(t, DELIMS[o.delim]);
      if (!rows.length) throw new Error('No CSV data');
      const w = Math.max(...rows.map((r) => r.length));
      const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>').trim();
      const R = rows.map((r) => Array.from({ length: w }, (_, i) => cell(r[i])));
      const len = (s) => [...s].length;
      const numeric = Array.from({ length: w }, (_, i) => o.right && R.length > 1 && R.slice(1).every((r) => r[i] === '' || /^-?\d+(\.\d+)?$/.test(r[i])));
      const wd = Array.from({ length: w }, (_, i) => Math.max(3, ...R.map((r) => len(r[i]))));
      const fmt = (r) => '| ' + r.map((c, i) => (numeric[i] && r !== R[0] ? ' '.repeat(wd[i] - len(c)) + c : c + ' '.repeat(wd[i] - len(c)))).join(' | ') + ' |';
      return [fmt(R[0]), '| ' + wd.map((x, i) => (numeric[i] ? '-'.repeat(x - 1) + ':' : '-'.repeat(x))).join(' | ') + ' |', ...R.slice(1).map(fmt)].join('\n');
    },
  },
  {
    id: 'csv-to-html-table', cat: 'CSV', title: 'CSV to HTML Table', desc: 'Generate an HTML table from CSV, with a live preview.',
    labels: ['CSV'], opts: [delimOpt(), { id: 'header', label: 'First row is header', type: 'checkbox', def: true }, indentOpt], sample: csvSample,
    run: ([t], o) => {
      const rows = parseCSV(t, DELIMS[o.delim]);
      if (!rows.length) throw new Error('No CSV data');
      const i1 = o.indent === 'tab' ? '\t' : ' '.repeat(+o.indent), i2 = i1 + i1, i3 = i2 + i1;
      const tr = (r, tag) => `${i2}<tr>\n${r.map((c) => `${i3}<${tag}>${esc(c).replace(/&quot;/g, '"')}</${tag}>`).join('\n')}\n${i2}</tr>`;
      const head = o.header ? `${i1}<thead>\n${tr(rows[0], 'th')}\n${i1}</thead>\n` : '';
      const text = `<table>\n${head}${i1}<tbody>\n${(o.header ? rows.slice(1) : rows).map((r) => tr(r, 'td')).join('\n')}\n${i1}</tbody>\n</table>`;
      return { text, html: `<!doctype html><meta charset="utf-8"><style>body{font:14px sans-serif;margin:1em}table{border-collapse:collapse}th,td{border:1px solid #999;padding:.3em .7em;text-align:left}th{background:#eee}</style>${text}` };
    },
  },

  // XML
  {
    id: 'xml-format', cat: 'XML', title: 'XML Formatter', desc: 'Pretty-print XML with consistent indentation (mixed content is preserved).',
    labels: ['XML'], opts: [indentOpt, { id: 'comments', label: 'Keep comments', type: 'checkbox', def: true }],
    sample: '<?xml version="1.0" encoding="UTF-8"?><!-- catalog --><catalog><book id="1" lang="en"><title>Dune &amp; Co</title><author>Frank</author><desc>A <b>classic</b> of sci-fi.</desc><empty/></book><book id="2"><title>Emma</title><![CDATA[x < y]]></book></catalog>',
    run: ([t], o) => xmlSer(parseXML(t), true, o.indent === 'tab' ? '\t' : ' '.repeat(+o.indent), 0, o.comments),
  },
  {
    id: 'xml-minify', cat: 'XML', title: 'XML Minifier', desc: 'Strip whitespace between elements and (optionally) comments.',
    labels: ['XML'], opts: [{ id: 'comments', label: 'Keep comments', type: 'checkbox', def: false }],
    sample: '<?xml version="1.0"?>\n<!-- c -->\n<root>\n  <item id="1">\n    <name>A  B</name>\n  </item>\n  <item id="2"/>\n</root>\n',
    run: ([t], o) => xmlSer(parseXML(t), false, '', 0, o.comments),
  },
  {
    id: 'xml-validate', cat: 'XML', title: 'XML Validator', desc: 'Check that XML is well-formed using the browser parser.', dom: true,
    labels: ['XML'], sample: '<?xml version="1.0"?>\n<root>\n  <item id="1">ok</item>\n  <item id="2"><sub/></item>\n</root>',
    run: ([t]) => {
      if (!t.trim()) throw new Error('Empty input');
      if (typeof DOMParser === 'undefined') { parseXML(t); return 'Well-formed XML'; }
      const doc = new DOMParser().parseFromString(t, 'application/xml');
      const pe = doc.getElementsByTagName('parsererror')[0];
      if (pe) throw new Error('Not well-formed: ' + pe.textContent.replace(/\s+/g, ' ').trim().slice(0, 300));
      const all = doc.getElementsByTagName('*');
      let attrs = 0; for (const e of all) attrs += e.attributes.length;
      return `Well-formed XML\n\nRoot element: <${doc.documentElement.nodeName}>\nElements: ${all.length}\nAttributes: ${attrs}`;
    },
  },
  {
    id: 'xml-to-json', cat: 'XML', title: 'XML to JSON', desc: 'Convert XML to JSON: attributes get a prefix, repeated elements become arrays, text goes to #text.',
    labels: ['XML'], opts: [{ id: 'prefix', label: 'Attribute prefix', type: 'text', def: '@' }, indentOpt],
    sample: '<library name="City"><book id="1"><title>Dune &amp; Co</title><tag>sci-fi</tag><tag>classic</tag></book><book id="2"><title>Emma</title></book><note lang="en">hello</note><empty/></library>',
    run: ([t], o) => JSON.stringify(xmlToJson(parseXML(t), o.prefix), null, IND(o.indent)),
  },
  {
    id: 'xpath-tester', cat: 'XML', title: 'XPath Tester', desc: 'Evaluate XPath 1.0 expressions against XML using the browser engine.', dom: true,
    inputs: 2, labels: ['XML', 'XPath'],
    sample: '<library><book id="1" year="1965"><title>Dune</title><price>9.99</price></book><book id="2" year="1815"><title>Emma</title><price>5.50</price></book></library>',
    sample2: '//book[@year > 1900]/title/text()',
    run: ([x, xp]) => {
      if (!xp.trim()) throw new Error('Enter an XPath expression');
      const doc = new DOMParser().parseFromString(x, 'application/xml');
      const pe = doc.getElementsByTagName('parsererror')[0];
      if (pe) throw new Error('XML is not well-formed: ' + pe.textContent.replace(/\s+/g, ' ').trim().slice(0, 300));
      let r;
      try { r = doc.evaluate(xp, doc, doc.createNSResolver(doc.documentElement), XPathResult.ANY_TYPE, null); } catch (e) { throw new Error('XPath error: ' + e.message); }
      if (r.resultType === XPathResult.NUMBER_TYPE) return `number: ${r.numberValue}`;
      if (r.resultType === XPathResult.STRING_TYPE) return `string: ${r.stringValue}`;
      if (r.resultType === XPathResult.BOOLEAN_TYPE) return `boolean: ${r.booleanValue}`;
      const out = [], ser = new XMLSerializer();
      for (let n; (n = r.iterateNext()); ) out.push(n.nodeType === 1 ? ser.serializeToString(n) : n.nodeType === 2 ? `${n.name}="${n.value}"` : n.nodeValue);
      return out.length ? `${out.length} node${out.length > 1 ? 's' : ''}\n\n` + out.map((s, i) => `[${i + 1}] ${s}`).join('\n') : '0 nodes';
    },
  },

  // YAML & TOML
  {
    id: 'yaml-to-json', cat: 'YAML & TOML', title: 'YAML to JSON', desc: 'Convert YAML to JSON. Supports maps, lists, flow style, | and > blocks, anchors/aliases/merge keys, multiple documents.',
    labels: ['YAML'], opts: [indentOpt],
    sample: '# Sample config\nname: demo\nversion: 1.2\nenabled: true\nnothing: ~\ntags: [a, b, "c d"]\ninline: {x: 1, y: [2, 3]}\ndb:\n  host: localhost\n  ports:\n    - 5432\n    - 5433\n  creds: &creds\n    user: admin\n    pass: \'s3cr\'\'t\'\nreplica:\n  <<: *creds\n  host: replica.local\nmotd: |\n  Hello\n  World\nfolded: >-\n  one\n  two\nitems:\n  - id: 1\n    name: first # comment\n  - id: 2\n    name: "second\\tline"\n',
    run: ([t], o) => JSON.stringify(yamlParse(t), null, IND(o.indent)),
  },
  {
    id: 'yaml-format', cat: 'YAML & TOML', title: 'YAML Formatter', desc: 'Re-indent and normalise YAML (comments are not preserved; anchors are expanded).',
    labels: ['YAML'], opts: [{ id: 'indent', label: 'Indent', type: 'select', choices: ['2', '4'], def: '2' }],
    sample: 'name:   demo\nlist:\n- a\n-   b:  1\n    c: [1,2,  3]\nnested: {x: 1, y: "two words"}\ntext: "line1\\nline2"\nempty: []\n',
    run: ([t], o) => { const v = yamlParse(t); const docs = Array.isArray(v) && /^---/m.test(t) ? v : [v]; return docs.map((d) => yamlDump(d, +o.indent)).join('\n---\n'); },
  },
  {
    id: 'toml-to-json', cat: 'YAML & TOML', title: 'TOML to JSON', desc: 'Parse TOML (tables, arrays of tables, inline tables, dotted keys, dates) into JSON.',
    labels: ['TOML'], opts: [indentOpt],
    sample: '# demo\ntitle = "TOML \\u00e9xample"\nenabled = true\nports = [8000, 8001,\n  8002]\nratio = 3.14e2\nhex = 0xFF\ndob = 1979-05-27T07:32:00Z\nsite.name = "dotted"\n\n[owner]\nname = "Tom"\npoint = { x = 1, y = 2 }\n\n[database]\nserver = \'192.168.1.1\'\n\n[[servers]]\nname = "alpha"\n\n[[servers]]\nname = "beta"\nnote = """\nmulti\nline"""\n\n[servers.meta]\nrole = "db"\n',
    run: ([t], o) => JSON.stringify(tomlParse(t), null, IND(o.indent)),
  },

  // Code formatters
  {
    id: 'html-format', cat: 'Code Formatters', title: 'HTML Formatter', desc: 'Beautify HTML with indentation; formats inline <style> and <script> too.',
    labels: ['HTML'], opts: [indentOpt, { id: 'width', label: 'Line width', type: 'number', def: 100 }],
    sample: '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Demo</title><style>body{margin:0}h1{color:red}</style></head><body><div class="a" id="x"><h1>Hello <em>world</em></h1><p>Some <b>bold</b> text and a <a href="/x?a=1&b=2">link</a>.</p><ul><li>One<li>Two</ul><img src="a.png" alt="A"><pre>  keep\n   this </pre></div><script>function f(){return 1}</script></body></html>',
    run: ([t], o) => htmlFmt(parseHTML(t), o.indent === 'tab' ? '\t' : ' '.repeat(+o.indent), o.width || 100),
  },
  {
    id: 'html-minify', cat: 'Code Formatters', title: 'HTML Minifier', desc: 'Remove comments and unnecessary whitespace from HTML (keeps <pre>, minifies inline CSS/JS).',
    labels: ['HTML'], opts: [{ id: 'comments', label: 'Keep comments', type: 'checkbox', def: false }],
    sample: '<!DOCTYPE html>\n<html>\n  <head>\n    <!-- comment -->\n    <style>\n      body { margin: 0; }\n    </style>\n  </head>\n  <body>\n    <p>Hello   <b>big</b>   <i>world</i></p>\n    <pre>  keep\n   this </pre>\n    <script>\n      // hi\n      var a = 1;\n      console.log(a)\n    </script>\n  </body>\n</html>\n',
    run: ([t], o) => htmlMin(parseHTML(t), o.comments),
  },
  {
    id: 'css-format', cat: 'Code Formatters', title: 'CSS Formatter', desc: 'Beautify CSS, including nested rules and @media blocks.',
    labels: ['CSS'], opts: [indentOpt],
    sample: '@import url("a.css");a,b>c{color:red;background:url(data:image/png;base64,AAA=) no-repeat;margin:0 auto!important}@media (min-width:600px){.x:hover{transition:opacity .3s ease,transform .3s}}/* note */.y::after{content:"a;b{"}',
    run: ([t], o) => cssFormat(t, o.indent === 'tab' ? '\t' : ' '.repeat(+o.indent)),
  },
  {
    id: 'css-minify', cat: 'Code Formatters', title: 'CSS Minifier', desc: 'Strip comments and whitespace from CSS without touching strings or url().',
    labels: ['CSS'], sample: '/* header */\n@import url("a.css");\na , b > c {\n  color : red ;\n  background: url(data:image/png;base64,AAA=) no-repeat;\n  margin: 0   auto !important;\n}\n@media (min-width: 600px) {\n  .x:hover { transition: opacity .3s ease , transform .3s; }\n}\n.y::after { content: "a;  b{"; }\n',
    run: ([t]) => cssMin(t),
  },
  {
    id: 'js-format', cat: 'Code Formatters', title: 'JavaScript Formatter', desc: 'Beautify JavaScript with sensible indentation and spacing (token based, no AST).',
    labels: ['JavaScript'], opts: [indentOpt],
    sample: 'function greet(name,greeting){const g=greeting||"Hello";if(!name){return null}else if(name==="x"){throw new Error(`bad ${name}`)}for(let i=0;i<3;i++){console.log(`${g}, ${name}! #${i}`)}const o={a:1,b:[1,2,3],c:{d:"x"}};switch(g){case "a":return 1;default:break}return /ab+c/.test(name)?o:g+name}\nconst f=async(x)=>{await x;return -x+ +1};\n// done\nexport default {greet,f}',
    run: ([t], o) => jsFormat(t, o.indent === 'tab' ? '\t' : ' '.repeat(+o.indent)),
  },
  {
    id: 'js-minify', cat: 'Code Formatters', title: 'JavaScript Minifier', desc: 'Strip comments and whitespace safely (strings, regex and template literals are preserved; no renaming).',
    labels: ['JavaScript'],
    sample: '/* header */\nfunction add(a, b) {\n  // sum\n  return a + b; /* inline */\n}\nconst re = /ab+\\/c/g, s = "a  b // not a comment", t = `x ${add(1, 2)}  y`;\nlet x = 1\nlet y = 2\nx++\n+y\nconsole.log(add(x, y), re.test(s), t)\n',
    run: ([t]) => jsMin(t),
  },
  {
    id: 'sql-format', cat: 'Code Formatters', title: 'SQL Formatter', desc: 'Uppercase keywords and lay out clauses, joins and subqueries on separate lines.',
    labels: ['SQL'], opts: [indentOpt, { id: 'upper', label: 'Uppercase keywords', type: 'checkbox', def: true }],
    sample: "select u.id, u.name, count(o.id) as orders from users u left join orders o on o.user_id = u.id where u.active = 1 and o.created_at between '2024-01-01' and '2024-12-31' and u.id in (select user_id from vip where tier = 'it''s') group by u.id, u.name having count(o.id) > 2 order by orders desc limit 10; insert into t (a, b) values (1, 'x'), (2, 'y');",
    run: ([t], o) => sqlFormat(t, { ind: o.indent === 'tab' ? '\t' : ' '.repeat(+o.indent), upper: o.upper }),
  },
  {
    id: 'sql-minify', cat: 'Code Formatters', title: 'SQL Minifier', desc: 'Strip comments and extra whitespace from SQL, keeping strings intact.',
    labels: ['SQL'], sample: "-- users report\nSELECT  u.id ,\n        u.name   /* inline */\nFROM   users u\nWHERE  u.name = 'a  -- b'\n   AND u.age >= 18 ;\n",
    run: ([t]) => sqlMin(t),
  },

  // Code generators
  {
    id: 'curl-to-code', cat: 'Code Generators', title: 'cURL to Code', desc: 'Convert a curl command to fetch, Node (http/https), Python requests or PHP cURL.',
    labels: ['curl command'], opts: [{ id: 'lang', label: 'Language', type: 'select', choices: ['fetch (JavaScript)', 'node (https)', 'python (requests)', 'php (cURL)'], def: 'fetch (JavaScript)' }],
    sample: "curl -X POST 'https://api.example.com/v1/users?x=1' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer TOKEN' \\\n  -u user:pa55 -L \\\n  -d '{\"name\":\"Ada\",\"tags\":[\"a\",\"b\"],\"admin\":false}'",
    run: ([t], o) => curlToCode(t, o.lang),
  },
  {
    id: 'svg-to-jsx', cat: 'Code Generators', title: 'SVG to JSX', desc: 'Convert SVG markup to a React JSX component (class, kebab-case attributes, style objects).',
    labels: ['SVG'], opts: [{ id: 'component', label: 'Wrap in component', type: 'checkbox', def: true }, { id: 'name', label: 'Component name', type: 'text', def: 'Icon' }, indentOpt],
    sample: '<?xml version="1.0"?>\n<!-- icon -->\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="color:red;stroke-width:3">\n  <g clip-path="url(#c)">\n    <path d="M5 12h14"/>\n    <use xlink:href="#a"/>\n    <text font-family="Arial" x="1">A {b}</text>\n  </g>\n</svg>',
    run: ([t], o) => {
      const ind = o.indent === 'tab' ? '\t' : ' '.repeat(+o.indent);
      const doc = parseXML(t), rootEl = doc.k.filter((x) => x.t === 'el');
      const lines = jsxTree(rootEl, true, o.component ? 2 : 0, ind);
      if (o.component) {
        lines[0] = lines[0].replace(/( \/)?>$/, ' {...props}$1>');
        return `export default function ${pascal(o.name) || 'Icon'}(props) {\n${ind}return (\n${lines.join('\n')}\n${ind});\n}`;
      }
      return lines.join('\n');
    },
  },
  {
    id: 'html-to-jsx', cat: 'Code Generators', title: 'HTML to JSX', desc: 'Convert HTML to JSX: className, htmlFor, style objects, self-closing tags, camelCased attributes.',
    labels: ['HTML'], opts: [{ id: 'component', label: 'Wrap in component', type: 'checkbox', def: false }, { id: 'name', label: 'Component name', type: 'text', def: 'Component' }, indentOpt],
    sample: '<!-- card -->\n<div class="card" style="margin-top:10px;background-color:#fff" onclick="go()">\n  <label for="n" tabindex="0">Name</label>\n  <input id="n" type="text" maxlength="10" disabled>\n  <br>\n  <p>Use {braces} &amp; <b>bold</b></p>\n  <svg viewBox="0 0 10 10" stroke-width="2"><path d="M0 0h10"/></svg>\n</div>',
    run: ([t], o) => {
      const ind = o.indent === 'tab' ? '\t' : ' '.repeat(+o.indent);
      const root = parseHTML(t);
      const top = root.k.filter((x) => x.t === 'el' || x.t === 'cm' || (x.t === 'text' && x.v.trim()));
      const multi = top.length > 1;
      const d = (o.component ? 2 : 0) + (multi ? 1 : 0);
      let lines = jsxTree(top, false, d, ind);
      if (multi) lines = [ind.repeat(d - 1) + '<>', ...lines, ind.repeat(d - 1) + '</>'];
      if (!o.component) return lines.join('\n');
      return `export default function ${pascal(o.name)}() {\n${ind}return (\n${lines.join('\n')}\n${ind});\n}`;
    },
  },
];

export default tools;

// gap6.js: the missing type-converter pairs.
//  - TypeScript declarations -> Go structs, Rust serde structs, Kotlin data classes, Java records, C# classes
//    (one shared engine on top of the tsToSchema parser exported by devz2.js; each language is a small spec object)
//  - Python (TypedDict, dataclass, Pydantic v2, NamedTuple, Enum, plain annotated classes) -> TypeScript
//  - Go structs (json tags, omitempty, pointers, embedded structs, const enums) -> TypeScript
// Pure text in, text out; nothing is fetched. Both readers are hand-written line/token parsers, not full language parsers:
// they read declarations only (no functions, no expressions beyond constant enum values), see each tool's desc for the ceilings.
// Skipped on purpose: TypeScript conditional/mapped types, keyof/typeof, generics other than the ones tsToSchema knows (it throws a clear error),
// Python metaclass tricks and runtime-built models, Go build tags and reflection-driven marshalers (custom MarshalJSON is not seen).
import { tsToSchema } from './devz2.js';

const T = [];
const sel = (id, label, choices, def) => ({ id, label, type: 'select', choices, def: def ?? choices[0] });
const txt = (id, label, def = '') => ({ id, label, type: 'text', def });
const chk = (id, label, def = false) => ({ id, label, type: 'checkbox', def });

// ---------- naming ----------
const words = (k) => String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean);
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const pascal = (k) => { const r = words(k).map((w) => (w === w.toUpperCase() && w.length > 1 && /[A-Z]/.test(w) ? cap(w.toLowerCase()) : cap(w))).join(''); return /^\d/.test(r) ? '_' + r : r || 'Field'; };
const camel = (k) => { const p = pascal(k); const r = p.replace(/^_?[A-Z]+(?=[A-Z][a-z]|\d|$)/, (m) => m.toLowerCase()).replace(/^([A-Z])/, (m) => m.toLowerCase()); return r || 'field'; };
const snake = (k) => words(k).map((w) => w.toLowerCase()).join('_') || 'field';
const screaming = (k) => snake(k).toUpperCase();
const GO_INIT = new Set(['id', 'url', 'uri', 'api', 'http', 'https', 'html', 'json', 'xml', 'uuid', 'ip', 'sql', 'ssh', 'tls', 'ttl', 'ui', 'uid', 'cpu', 'dns', 'css', 'tcp', 'udp', 'eof', 'rpc', 'ascii', 'utf8', 'smtp']);
const goName = (k) => { const r = words(k).map((w) => (GO_INIT.has(w.toLowerCase()) ? w.toUpperCase() : cap(w))).join('') || 'Field'; return /^\d/.test(r) ? 'X' + r : r; };
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();
const uniq = (names) => { const seen = new Map(); return names.map((n) => { const c = seen.get(n) || 0; seen.set(n, c + 1); return c ? n + (c + 1) : n; }); };

// ---------- TypeScript schema -> neutral IR ----------
const refName = (s) => s.$ref.split('/').pop();
const isAny = (s) => s === true || !s || (!s.type && !s.$ref && !s.enum && !('const' in s) && !s.anyOf && !s.oneOf && !s.allOf);
function makeNorm(defs) {
  const deref = (s) => (s && s.$ref ? deref(defs[refName(s)] || {}) : s);
  const flat = (s) => {
    if (!s || !s.allOf) return s;
    const m = { type: 'object', properties: {}, required: [] };
    for (const a of s.allOf) { const r = flat(deref(a) || {}); if (r.properties) Object.assign(m.properties, r.properties); if (r.required) m.required.push(...r.required); if (r.description && !m.description) m.description = r.description; }
    if (s.description) m.description = s.description;
    return m;
  };
  const union = (alts) => {
    const nul = alts.some((a) => a.k === 'null' || a.nul);
    const rest = alts.flatMap((a) => (a.k === 'union' ? a.ts : a.k === 'null' ? [] : [{ ...a, nul: false }]));
    if (!rest.length) return { k: 'null' };
    if (rest.length === 1) return { ...rest[0], nul };
    if (rest.every((a) => a.k === 'lit')) return { k: 'lit', v: rest.flatMap((a) => a.v), nul };
    return { k: 'union', ts: rest, nul };
  };
  const norm = (s) => {
    if (isAny(s) || s.not) return { k: 'any' };
    if (s.$ref) return { k: 'ref', n: refName(s) };
    if (s.allOf) return norm(flat(s));
    if (s.anyOf || s.oneOf) return union((s.anyOf || s.oneOf).map(norm));
    if (Array.isArray(s.type)) return union(s.type.map((t) => norm({ ...s, type: t })));
    if ('const' in s) return { k: 'lit', v: [s.const] };
    if (s.enum) return { k: 'lit', v: s.enum };
    switch (s.type) {
      case 'string': return s.format === 'date-time' ? { k: 'date' } : { k: 'str' };
      case 'number': return { k: 'num' };
      case 'integer': return { k: 'int' };
      case 'boolean': return { k: 'bool' };
      case 'null': return { k: 'null' };
      case 'array': return Array.isArray(s.items) ? { k: 'tuple', ts: s.items.map(norm) } : { k: 'arr', t: s.items ? norm(s.items) : { k: 'any' } };
      case 'object':
        if (s.properties && Object.keys(s.properties).length) return { k: 'obj', s };
        if (s.additionalProperties && s.additionalProperties !== true) return { k: 'map', t: norm(s.additionalProperties) };
        return { k: 'map', t: { k: 'any' } };
      default: return { k: 'any' };
    }
  };
  return { norm, flat, deref };
}

const litNote = (v) => v.map((x) => JSON.stringify(x)).join(' | ');
const litKind = (v) => (v.every((x) => typeof x === 'string') ? 'str' : v.every((x) => typeof x === 'number') ? (v.every(Number.isInteger) ? 'int' : 'num') : 'any');

// Generic engine: L supplies leaf types, wrappers and the struct/enum/alias text.
function gen(L, src, o) {
  const { defs, order } = tsToSchema(src, { noExtra: false });
  const { norm, flat, deref } = makeNorm(defs);
  const used = new Set(), out = [], taken = new Set(order);
  const ctx = { o, use: (x) => used.add(x), defs };
  // direct (non-container) references between declared structs, for Rust Box<T> on recursive types
  const direct = {};
  for (const n of order) { const f = flat(defs[n]); direct[n] = f && f.properties ? Object.values(f.properties).map(norm).filter((i) => i.k === 'ref').map((i) => i.n) : []; }
  ctx.reaches = (a, b, seen = new Set()) => { if (a === b) return true; if (seen.has(a)) return false; seen.add(a); return (direct[a] || []).some((x) => ctx.reaches(x, b, seen)); };
  const isEnum = (n) => defs[n] && defs[n].enum && defs[n].enum.every((v) => typeof v === 'string');
  const isStruct = (n) => { const f = flat(defs[n]); return f && f.type === 'object' && f.properties; };
  const typeOf = (ir, parent, hint, directRef) => {
    switch (ir.k) {
      case 'ref':
        if (L.inlineAlias && defs[ir.n] && !isEnum(ir.n) && !isStruct(ir.n)) return typeOf(norm(defs[ir.n]), parent, hint, directRef);
        return L.ref(ir.n, ctx, directRef, parent);
      case 'str': return L.str(ctx);
      case 'num': return L.num(ctx);
      case 'int': return L.int(ctx);
      case 'bool': return L.bool(ctx);
      case 'date': return L.date(ctx);
      case 'any': case 'null': return L.any(ctx);
      case 'arr': return L.arr(typeOf(ir.t, parent, hint, false), ctx);
      case 'map': return L.map(typeOf(ir.t, parent, hint, false), ctx);
      case 'tuple': return L.tuple(ir.ts.map((t) => typeOf(t, parent, hint, false)), ctx);
      case 'lit': { const k = litKind(ir.v); return k === 'str' ? L.str(ctx) : k === 'int' ? L.int(ctx) : k === 'num' ? L.num(ctx) : L.any(ctx); }
      case 'union': return L.union(ir.ts.map((t) => typeOf(t, parent, hint, false)), ctx);
      case 'obj': {
        let nm = pascal(parent) + pascal(hint);
        while (taken.has(nm)) nm += '_';
        taken.add(nm); emitStruct(nm, ir.s);
        return nm;
      }
      default: return L.any(ctx);
    }
  };
  const emitStruct = (name, s0) => {
    const idx = out.length; out.push('');
    const s = flat(s0), req = new Set(s.required || []);
    const fields = Object.entries(s.properties || {}).map(([k, v]) => {
      const ir = norm(v), opt = !req.has(k);
      const t = typeOf(ir, name, k, true), nul = opt || !!ir.nul;
      let ty = nul ? L.opt(t, ir, opt, ctx) : t, note = ir.k === 'lit' ? litNote(ir.v) : '';
      const cm = / ?\/\*\s*(.*?)\s*\*\/(?=>?$)/.exec(ty); if (cm) { ty = ty.replace(cm[0], ''); note = note || cm[1]; }
      return { k, ir, opt, nul, t, ty, doc: v.description, note };
    });
    out[idx] = L.struct(name, fields, s.description, ctx);
  };
  for (const n of order) {
    const s = defs[n];
    if (isEnum(n)) out.push(L.enum(n, s.enum, s.description, ctx));
    else if (isStruct(n)) emitStruct(n, s);
    else if (!L.inlineAlias) {
      const ir = norm(s);
      const t = typeOf(ir, n, 'value', false);
      out.push(L.alias(n, ir.nul ? L.opt(t, ir, false, ctx) : t, s.description, ir.k === 'lit' ? litNote(ir.v) : '', ctx));
    }
  }
  const body = out.filter(Boolean).join(L.sep || '\n\n');
  return L.file(body, used, ctx);
}
const doc = {
  slash: (d, pad = '') => (d ? oneLine(d).replace(/^/, pad + '// ') + '\n' : ''),
  rust: (d, pad = '') => (d ? String(d).split(/\n/).map((l) => `${pad}/// ${l.trim()}`).join('\n') + '\n' : ''),
  block: (d, pad = '') => (d ? `${pad}/** ${oneLine(d).replace(/\*\//g, '* /')} */\n` : ''),
  xml: (d, pad = '') => (d ? `${pad}/// <summary>${oneLine(d).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</summary>\n` : ''),
};
const pad = (arr, n) => arr.map((x) => x.padEnd(n));

// ---------- Go ----------
const GO = {
  ref: (n) => n,
  str: () => 'string', bool: () => 'bool', any: () => 'any',
  num: (c) => ({ int64: 'int64', int: 'int', float32: 'float32' }[c.o.number] || 'float64'),
  int: (c) => (c.o.number === 'float64' || !c.o.number ? 'int64' : c.o.number === 'float32' ? 'int64' : c.o.number),
  date: (c) => (c.o.time === 'string' ? 'string' : (c.use('time'), 'time.Time')),
  arr: (t) => `[]${t}`, map: (t) => `map[string]${t}`,
  tuple: (ts) => (ts.every((t) => t === ts[0]) ? `[${ts.length}]${ts[0]}` : '[]any /* heterogeneous tuple */'),
  union: () => 'any /* union */',
  opt: (t, ir, opt, c) => (!c.o.pointers || /^(\[|map\[|any)/.test(t) ? t : `*${t}`),
  enum: (n, vals, d) => {
    const names = uniq(vals.map((v) => n + goName(v)));
    const w = Math.max(...names.map((x) => x.length));
    return `${doc.slash(d)}type ${n} string\n\nconst (\n${vals.map((v, i) => `\t${names[i].padEnd(w)} ${n} = ${JSON.stringify(v)}`).join('\n')}\n)`;
  },
  alias: (n, t, d, note) => `${doc.slash(d)}type ${n} = ${t.replace(/ \/\*.*\*\/$/, '')}${note ? ' // ' + note : ''}`,
  struct: (n, fields, d, c) => {
    const names = uniq(fields.map((f) => goName(f.k)));
    const tags = fields.map((f) => `\`json:"${f.k.replace(/"/g, '')}${f.opt && c.o.omitempty ? ',omitempty' : ''}"\``);
    const seg = []; fields.forEach((f, i) => { if (f.doc || !seg.length) seg.push([]); seg[seg.length - 1].push(i); }); // gofmt aligns between comment lines only
    const nw = [], tw = []; seg.forEach((g) => g.forEach((i) => { nw[i] = Math.max(...g.map((j) => names[j].length)); tw[i] = Math.max(...g.map((j) => fields[j].ty.length)); }));
    const cw = []; // trailing comments: gofmt aligns them across consecutive commented lines of one segment
    seg.forEach((g) => { for (let a = 0; a < g.length;) { if (!fields[g[a]].note) { a++; continue; } let b = a; while (b < g.length && fields[g[b]].note) b++; const w = Math.max(...g.slice(a, b).map((j) => tags[j].length)); for (let x = a; x < b; x++) cw[g[x]] = w; a = b; } });
    const lines = fields.map((f, i) => `${doc.slash(f.doc, '\t')}\t${names[i].padEnd(nw[i])} ${f.ty.padEnd(tw[i])} ${f.note ? tags[i].padEnd(cw[i]) + ' // ' + f.note : tags[i]}`);
    return `${doc.slash(d)}type ${n} struct${lines.length ? ' {\n' + lines.join('\n') + '\n}' : '{}'}`;
  },
  file: (body, used, c) => `package ${c.o.pkg || 'models'}\n\n${used.has('time') ? 'import "time"\n\n' : ''}${body}\n`,
};

// ---------- Rust ----------
const RUST_KW = new Set(['as', 'async', 'await', 'break', 'const', 'continue', 'dyn', 'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'static', 'struct', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while', 'abstract', 'become', 'box', 'do', 'final', 'macro', 'override', 'priv', 'try', 'typeof', 'unsized', 'virtual', 'yield']);
const RUST_NORAW = new Set(['self', 'Self', 'super', 'crate']);
const rustField = (k) => { const s = snake(k); return RUST_NORAW.has(s) ? s + '_' : RUST_KW.has(s) ? 'r#' + s : /^\d/.test(s) ? '_' + s : s; };
const RUST = {
  ref: (n, c, direct, cur) => (direct && cur && c.reaches(n, cur) ? `Box<${n}>` : n),
  str: () => 'String', bool: () => 'bool',
  any: (c) => (c.use('Value'), 'serde_json::Value'),
  num: () => 'f64', int: () => 'i64',
  date: (c) => (c.o.dates === 'chrono' ? (c.use('chrono'), 'chrono::DateTime<chrono::Utc>') : 'String'),
  arr: (t) => `Vec<${t}>`, map: (t, c) => (c.use('HashMap'), `HashMap<String, ${t}>`),
  tuple: (ts) => `(${ts.join(', ')}${ts.length === 1 ? ',' : ''})`,
  union: (ts, c) => (c.use('Value'), 'serde_json::Value /* union */'),
  opt: (t) => `Option<${t}>`,
  enum: (n, vals, d, c) => {
    const names = uniq(vals.map((v) => pascal(v).replace(/^_/, 'V')));
    return `${doc.rust(d)}#[derive(${c.o.derives})]\npub enum ${n} {\n${vals.map((v, i) => `${names[i] === v ? '' : `    #[serde(rename = ${JSON.stringify(v)})]\n`}    ${names[i]},`).join('\n')}\n}`;
  },
  alias: (n, t, d, note) => `${doc.rust(d)}pub type ${n} = ${t.replace(/ \/\*.*\*\/$/, '')};${note ? ' // ' + note : ''}`,
  struct: (n, fields, d, c) => {
    const names = fields.map((f) => rustField(f.k));
    const allCamel = c.o.camel && fields.some((f, i) => names[i].replace(/^r#/, '') !== f.k) && fields.every((f, i) => camel(names[i].replace(/^r#|_$/g, '')) === f.k);
    const lines = fields.map((f, i) => {
      const at = [];
      if (!allCamel && names[i].replace(/^r#/, '') !== f.k) at.push(`rename = ${JSON.stringify(f.k)}`);
      if (f.opt) at.push('default', 'skip_serializing_if = "Option::is_none"');
      return `${doc.rust(f.doc, '    ')}${at.length ? `    #[serde(${at.join(', ')})]\n` : ''}    pub ${names[i]}: ${f.ty},${f.note ? ' // ' + f.note : ''}`;
    });
    return `${doc.rust(d)}#[derive(${c.o.derives})]\n${allCamel ? '#[serde(rename_all = "camelCase")]\n' : ''}pub struct ${n} {${lines.length ? '\n' + lines.join('\n') + '\n' : ''}}`;
  },
  file: (body, used, c) => `use serde::{Deserialize, Serialize};\n${used.has('HashMap') ? 'use std::collections::HashMap;\n' : ''}\n${body}\n`,
};

// ---------- Kotlin ----------
const KT_KW = new Set(['as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in', 'interface', 'is', 'null', 'object', 'package', 'return', 'super', 'this', 'throw', 'true', 'try', 'typealias', 'typeof', 'val', 'var', 'when', 'while']);
const ktName = (k) => { const c = camel(k); return KT_KW.has(c) ? `\`${c}\`` : c; };
const KT = {
  ref: (n) => n, str: () => 'String', bool: () => 'Boolean',
  any: (c) => (c.o.lib === 'kotlinx.serialization' ? (c.use('JsonElement'), 'JsonElement') : 'Any'),
  num: () => 'Double', int: () => 'Long',
  date: () => 'String',
  arr: (t) => `List<${t}>`, map: (t) => `Map<String, ${t}>`,
  tuple: (ts, c) => `List<${ts.every((t) => t === ts[0]) ? ts[0] : KT.any(c)}>`,
  union: (ts, c) => KT.any(c),
  opt: (t) => `${t}?`,
  enum: (n, vals, d, c) => {
    const names = uniq(vals.map((v) => pascal(v).replace(/^_/, 'V')));
    const ann = (v) => (c.o.lib === 'kotlinx.serialization' ? `@SerialName(${JSON.stringify(v)}) ` : c.o.lib === 'Jackson' ? `@JsonProperty(${JSON.stringify(v)}) ` : '');
    return `${doc.block(d)}${c.o.lib === 'kotlinx.serialization' ? '@Serializable\n' : ''}enum class ${n} {\n${vals.map((v, i) => `    ${ann(v)}${names[i]},`).join('\n')}\n}`;
  },
  alias: (n, t, d, note) => `${doc.block(d)}typealias ${n} = ${t}${note ? ' // ' + note : ''}`,
  struct: (n, fields, d, c) => {
    const kx = c.o.lib === 'kotlinx.serialization', jk = c.o.lib === 'Jackson';
    const params = fields.map((f) => {
      const nm = ktName(f.k), plain = nm.replace(/`/g, '');
      const ann = plain !== f.k ? (kx ? `@SerialName(${JSON.stringify(f.k)}) ` : jk ? `@JsonProperty(${JSON.stringify(f.k)}) ` : '') : '';
      return `${doc.block(f.doc, '    ')}    ${ann}val ${nm}: ${f.ty}${f.opt ? ' = null' : ''},${f.note ? ' // ' + f.note : ''}`;
    });
    return `${doc.block(d)}${kx ? '@Serializable\n' : ''}${fields.length ? `data class ${n}(\n${params.join('\n')}\n)` : `class ${n}`}`;
  },
  file: (body, used, c) => {
    const imp = [];
    if (c.o.lib === 'kotlinx.serialization') { imp.push('import kotlinx.serialization.SerialName', 'import kotlinx.serialization.Serializable'); if (used.has('JsonElement')) imp.push('import kotlinx.serialization.json.JsonElement'); }
    if (c.o.lib === 'Jackson') imp.push('import com.fasterxml.jackson.annotation.JsonProperty');
    return `${imp.length ? imp.join('\n') + '\n\n' : ''}${body}\n`;
  },
};

// ---------- Java records ----------
const JAVA_KW = new Set(['abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while', 'record', 'var', 'yield', 'true', 'false', 'null']);
const javaName = (k) => { const c = camel(k); return JAVA_KW.has(c) ? c + '_' : c; };
const PRIM = { Double: 'double', Long: 'long', Boolean: 'boolean' };
const indent = (s, p) => s.split('\n').map((l) => (l ? p + l : l)).join('\n');
const JAVA = {
  inlineAlias: true, sep: '\n\n',
  ref: (n) => n, str: () => 'String', bool: () => 'Boolean', any: () => 'Object',
  num: () => 'Double', int: () => 'Long',
  date: (c) => (c.o.dates === 'Instant' ? (c.use('Instant'), 'Instant') : 'String'),
  arr: (t) => `List<${t}>`, map: (t) => `Map<String, ${t}>`,
  tuple: (ts) => `List<${ts.every((t) => t === ts[0]) ? ts[0] : 'Object'}>`,
  union: () => 'Object',
  opt: (t) => t,
  enum: (n, vals, d, c) => {
    const names = uniq(vals.map((v) => screaming(v).replace(/^(\d)/, '_$1') || 'EMPTY').map((x) => (JAVA_KW.has(x.toLowerCase()) ? x : x)));
    const jk = c.o.lib === 'Jackson';
    return `${doc.block(d)}public enum ${n} {\n${vals.map((v, i) => `    ${jk ? `@JsonProperty(${JSON.stringify(v)}) ` : ''}${names[i]}${i < vals.length - 1 ? ',' : ';'}`).join('\n')}\n}`;
  },
  struct: (n, fields, d, c) => {
    const jk = c.o.lib === 'Jackson';
    const params = fields.map((f) => {
      const nm = javaName(f.k);
      const ty = !f.nul && c.o.primitives ? (PRIM[f.ty] || f.ty) : f.ty;
      return `${doc.block(f.doc, '    ')}    ${jk ? `@JsonProperty(${JSON.stringify(f.k)}) ` : ''}${ty} ${nm}`;
    });
    const nonNull = jk && fields.some((f) => f.opt) ? '@JsonInclude(JsonInclude.Include.NON_NULL)\n' : '';
    if (fields.length) c.use('rec');
    return `${doc.block(d)}${nonNull}public record ${n}(${fields.length ? '\n' + params.join(',\n') + '\n' : ''}) {}`;
  },
  file: (body, used, c) => {
    const imp = [];
    if (c.o.lib === 'Jackson') imp.push('import com.fasterxml.jackson.annotation.JsonInclude;', 'import com.fasterxml.jackson.annotation.JsonProperty;');
    if (/\b(List|Map)</.test(body)) imp.push('import java.util.List;', 'import java.util.Map;');
    if (used.has('Instant')) imp.push('import java.time.Instant;');
    const w = (c.o.wrapper || '').trim();
    const inner = w ? `public final class ${w} {\n    private ${w}() {}\n\n${indent(body, '    ')}\n}` : body.replace(/^public (record|enum)/gm, '$1');
    return `${c.o.pkg ? `package ${c.o.pkg};\n\n` : ''}${imp.length ? imp.join('\n') + '\n\n' : ''}${inner}\n`;
  },
};

// ---------- C# ----------
const CS = {
  inlineAlias: true,
  ref: (n) => n, str: () => 'string', bool: () => 'bool', any: () => 'object',
  num: () => 'double', int: () => 'long',
  date: (c) => (c.o.dates === 'string' ? 'string' : c.o.dates),
  arr: (t) => `List<${t}>`, map: (t) => `Dictionary<string, ${t}>`,
  tuple: (ts) => `List<${ts.every((t) => t === ts[0]) ? ts[0] : 'object'}>`,
  union: () => 'object',
  opt: (t) => (t.endsWith('?') ? t : `${t}?`),
  enum: (n, vals, d, c) => {
    const names = uniq(vals.map((v) => pascal(v).replace(/^_/, 'V')));
    const stj = c.o.lib === 'System.Text.Json', nj = c.o.lib === 'Newtonsoft.Json';
    return `${doc.xml(d)}${stj ? '[JsonConverter(typeof(JsonStringEnumConverter))]\n' : nj ? '[JsonConverter(typeof(StringEnumConverter))]\n' : ''}public enum ${n}\n{\n${vals.map((v, i) => `${stj ? `    [JsonStringEnumMemberName(${JSON.stringify(v)})]\n` : nj ? `    [EnumMember(Value = ${JSON.stringify(v)})]\n` : ''}    ${names[i]},`).join('\n')}\n}`;
  },
  struct: (n, fields, d, c) => {
    const stj = c.o.lib === 'System.Text.Json', nj = c.o.lib === 'Newtonsoft.Json';
    const names = fields.map((f) => { const p = pascal(f.k); return p === n ? p + 'Value' : p; });
    const acc = c.o.kind === 'record' ? '{ get; init; }' : '{ get; set; }';
    const props = fields.map((f, i) => {
      const at = stj ? `    [JsonPropertyName(${JSON.stringify(f.k)})]\n${f.opt ? '    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]\n' : ''}` : nj ? `    [JsonProperty(${JSON.stringify(f.k)}${f.opt ? ', NullValueHandling = NullValueHandling.Ignore' : ''})]\n` : '';
      return `${doc.xml(f.doc, '    ')}${at}    public ${c.o.required && !f.opt ? 'required ' : ''}${f.ty} ${names[i]} ${acc}${f.note ? ' // ' + f.note : ''}`;
    });
    return `${doc.xml(d)}public ${c.o.kind === 'record' ? 'record' : 'class'} ${n}\n{\n${props.join('\n\n')}\n}`;
  },
  file: (body, used, c) => {
    const usings = ['System.Collections.Generic'];
    if (c.o.lib === 'System.Text.Json') usings.push('System.Text.Json.Serialization');
    if (c.o.lib === 'Newtonsoft.Json') usings.push('Newtonsoft.Json', 'Newtonsoft.Json.Converters', 'System.Runtime.Serialization');
    if (c.o.dates !== 'string' && /\bDate/.test(body)) usings.unshift('System');
    const ns = (c.o.namespace || '').trim();
    return `#nullable enable\n${usings.sort().map((u) => `using ${u};`).join('\n')}\n\n${ns ? `namespace ${ns};\n\n` : ''}${body}\n`;
  },
};

const TS_SAMPLE = `/** A registered user */
export interface User {
  id: number;
  /** Login email */
  email: string;
  name?: string | null;
  role: Role;
  tags: string[];
  address: Address;
  meta: Record<string, unknown>;
  createdAt: Date;
}

export interface Address {
  street: string;
  zip?: string;
  coords: [number, number];
}

export enum Role { Admin = 'admin', Member = 'member' }
export type Status = 'active' | 'disabled';`;
const numOpt = (extra) => sel('number', 'TypeScript number maps to', extra, extra[0]);
const DEFAULT_DESC = ' Reads the same TypeScript subset as the TypeScript to JSON Schema tool: interfaces, type aliases, string enums, optional and nullable properties, literals, tuples, arrays, Record, Date, extends and intersections, JSDoc. Not supported: conditional and mapped types, keyof/typeof, function types, most utility generics.';

T.push({
  id: 'typescript-to-go-struct', cat: 'Schema Converters', title: 'TypeScript Interfaces to Go Structs',
  desc: 'Convert TypeScript interfaces and enums to Go structs with json tags: optional properties get omitempty (and pointers), nullable ones pointers, arrays become slices, Record becomes map[string]T, Date becomes time.Time, string enums become typed constants.' + DEFAULT_DESC,
  labels: ['TypeScript declarations'], sample: TS_SAMPLE,
  opts: [txt('pkg', 'Package name', 'models'), sel('number', 'number maps to', ['float64', 'int64', 'int', 'float32'], 'float64'), sel('time', 'Date maps to', ['time.Time', 'string'], 'time.Time'), chk('pointers', 'Pointers for optional and nullable fields', true), chk('omitempty', 'omitempty on optional fields', true)],
  run: ([s], o) => gen(GO, s, o),
});
T.push({
  id: 'typescript-to-rust-serde', cat: 'Schema Converters', title: 'TypeScript Interfaces to Rust Serde Structs',
  desc: 'Convert TypeScript interfaces and enums to Rust structs deriving Serialize and Deserialize: Option for optional and nullable fields, Vec, HashMap, tuples, serde rename or rename_all = "camelCase", Box on recursive fields, enums with per-variant renames.' + DEFAULT_DESC,
  labels: ['TypeScript declarations'], sample: TS_SAMPLE,
  opts: [txt('derives', 'Derives', 'Debug, Clone, Serialize, Deserialize'), chk('camel', 'Use rename_all = "camelCase" when every key fits', true), sel('dates', 'Date maps to', ['String', 'chrono'], 'String')],
  run: ([s], o) => gen(RUST, s, o),
});
T.push({
  id: 'typescript-to-kotlin-data-class', cat: 'Schema Converters', title: 'TypeScript Interfaces to Kotlin Data Classes',
  desc: 'Convert TypeScript interfaces and enums to Kotlin data classes with nullable types and = null defaults, List and Map, enum classes, and optional kotlinx.serialization (@Serializable, @SerialName) or Jackson (@JsonProperty) annotations.' + DEFAULT_DESC,
  labels: ['TypeScript declarations'], sample: TS_SAMPLE,
  opts: [sel('lib', 'Annotations', ['kotlinx.serialization', 'Jackson', 'none'], 'kotlinx.serialization')],
  run: ([s], o) => gen(KT, s, o),
});
T.push({
  id: 'typescript-to-java-record', cat: 'Schema Converters', title: 'TypeScript Interfaces to Java Records',
  desc: 'Convert TypeScript interfaces and enums to Java 17 records with List and Map, enums, boxed types for nullable fields and optional Jackson @JsonProperty annotations, wrapped in one public class so a single file compiles.' + DEFAULT_DESC,
  labels: ['TypeScript declarations'], sample: TS_SAMPLE,
  opts: [sel('lib', 'Annotations', ['Jackson', 'none'], 'Jackson'), txt('pkg', 'Package (blank for none)', ''), txt('wrapper', 'Wrapper class (blank = package-private top-level types)', 'Models'), sel('dates', 'Date maps to', ['String', 'Instant'], 'String'), chk('primitives', 'Primitive types for required fields (double, long, boolean)', true)],
  run: ([s], o) => gen(JAVA, s, o),
});
T.push({
  id: 'typescript-to-csharp-class', cat: 'Schema Converters', title: 'TypeScript Interfaces to C# Classes',
  desc: 'Convert TypeScript interfaces and enums to C# classes or records with nullable reference types, List and Dictionary, enums, and optional System.Text.Json ([JsonPropertyName]) or Newtonsoft.Json ([JsonProperty]) attributes.' + DEFAULT_DESC,
  labels: ['TypeScript declarations'], sample: TS_SAMPLE,
  opts: [sel('lib', 'Attributes', ['System.Text.Json', 'Newtonsoft.Json', 'none'], 'System.Text.Json'), sel('kind', 'Type', ['class', 'record'], 'class'), chk('required', 'required modifier on non-optional properties (C# 11)', true), sel('dates', 'Date maps to', ['DateTimeOffset', 'DateTime', 'string'], 'DateTimeOffset'), txt('namespace', 'Namespace (blank for none)', '')],
  run: ([s], o) => gen(CS, s, o),
});

// ======================================================================
// Python -> TypeScript
// ======================================================================
function pyLogicalLines(src) {
  const out = []; const n = src.length; let i = 0, cur = '', depth = 0, indent = 0, atStart = true;
  while (i < n) {
    const c = src[i];
    if (atStart && depth === 0) {
      if (c === '\n' || c === '\r') { i++; continue; }
      let j = i, w = 0;
      while (src[j] === ' ' || src[j] === '\t') { w += src[j] === '\t' ? 4 : 1; j++; }
      if (j >= n) break;
      if (src[j] === '\n' || src[j] === '\r' || src[j] === '#') { const e = src.indexOf('\n', j); if (e < 0) break; i = e + 1; continue; }
      indent = w; i = j; atStart = false; continue;
    }
    if (c === '"' || c === "'") {
      const q = src.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
      let j = i + q.length;
      while (j < n && !src.startsWith(q, j)) j += src[j] === '\\' ? 2 : 1;
      cur += src.slice(i, j + q.length); i = j + q.length; continue;
    }
    if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '\\' && src[i + 1] === '\n') { i += 2; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth = Math.max(0, depth - 1);
    if (c === '\n') {
      if (depth > 0) { cur += ' '; i++; continue; }
      if (cur.trim()) out.push({ indent, text: cur.trim() });
      cur = ''; atStart = true; i++; continue;
    }
    if (c !== '\r') cur += c;
    i++;
  }
  if (cur.trim()) out.push({ indent, text: cur.trim() });
  return out;
}
const splitTop = (s, ch) => {
  const parts = []; let d = 0, q = '', cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === '\\') cur += s[++i] ?? ''; else if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--;
    if (c === ch && d === 0 && !(ch === '=' && (s[i + 1] === '=' || '=!<>'.includes(s[i - 1] || '')))) { parts.push(cur); cur = ''; } else cur += c;
  }
  parts.push(cur);
  return parts;
};
const pyStr = (s) => { const m = /^[rbfRBF]*("""|'''|"|')([\s\S]*)\1$/.exec(s.trim()); return m ? m[2].replace(/\\(.)/g, '$1') : null; };
const pyDocText = (s) => { const t = pyStr(s); return t == null ? '' : t.replace(/\s+/g, ' ').trim(); };

const PY_TOK = /\s*("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\.\.\.|-?\d+(?:\.\d+)?|[A-Za-z_][\w.]*|[\[\](),|:=])/y;
function pyTypeParser(text, ctx) {
  const tk = []; PY_TOK.lastIndex = 0; let m;
  const rest = text.trim();
  PY_TOK.lastIndex = 0;
  while (PY_TOK.lastIndex < rest.length && (m = PY_TOK.exec(rest))) tk.push(m[1]);
  if (PY_TOK.lastIndex < rest.length && rest.slice(PY_TOK.lastIndex).trim()) throw new Error(`Cannot read the Python type "${rest}"`);
  let p = 0;
  const peek = () => tk[p];
  const eat = (c) => (tk[p] === c ? (p++, true) : false);
  const need = (c) => { if (!eat(c)) throw new Error(`Expected "${c}" in the Python type "${rest}"`); };
  const meta = { notReq: false, skip: false, alias: null, desc: null };
  const node = (s, o = {}) => ({ s, u: false, nul: false, ...o });
  const paren = (n) => (n.u ? `(${n.s})` : n.s);
  const unite = (ms) => {
    const nul = ms.some((x) => x.nul || x.s === 'null');
    const real = [...new Set(ms.filter((x) => x.s !== 'null').flatMap((x) => (x.parts || [x.s])))];
    if (!real.length) return node('null', { nul: true });
    const parts = real;
    return node(parts.join(' | ') + (nul ? ' | null' : ''), { u: parts.length + (nul ? 1 : 0) > 1, nul, parts });
  };
  const union = () => { const ms = [atom()]; while (eat('|')) ms.push(atom()); return ms.length === 1 ? ms[0] : unite(ms); };
  const args = () => { const a = []; for (;;) { if (peek() === ']') break; a.push(union()); if (!eat(',')) break; } need(']'); return a; };
  const tsLit = (t) => {
    const s = pyStr(t); if (s != null) return JSON.stringify(s);
    if (t === 'True') return 'true'; if (t === 'False') return 'false'; if (t === 'None') return 'null';
    if (/^-?\d/.test(t)) return t;
    const last = t.split('.'); const e = ctx.enums[last[last.length - 2]]; if (e && e[last[last.length - 1]] !== undefined) return JSON.stringify(e[last[last.length - 1]]);
    return JSON.stringify(last[last.length - 1]);
  };
  const skipCall = () => { if (peek() === '(') { let d = 0; do { if (tk[p] === '(') d++; else if (tk[p] === ')') d--; p++; } while (d > 0 && p < tk.length); } };
  function atom() {
    const t = tk[p++];
    if (t === undefined) throw new Error(`Unexpected end of the Python type "${rest}"`);
    if (t === '(') { const x = union(); need(')'); return x; }
    if (t[0] === '"' || t[0] === "'") { const inner = pyStr(t); return pyTypeParser(inner, ctx).node; }
    if (t === '...') return node('unknown');
    if (/^-?\d/.test(t)) return node(t);
    if (!/^[A-Za-z_]/.test(t)) throw new Error(`Unexpected "${t}" in the Python type "${rest}"`);
    const name = t.split('.').pop();
    if (peek() === '(') { skipCall(); return node(/^(conint|confloat|condecimal)$/.test(name) ? (name === 'condecimal' ? 'string' : 'number') : name === 'constr' ? 'string' : 'unknown'); }
    if (peek() !== '[') return plain(name);
    p++;
    switch (name) {
      case 'Optional': { const a = args(); return unite([a[0], node('null')]); }
      case 'Union': return unite(args());
      case 'Literal': {
        const v = []; for (;;) { if (peek() === ']') break; v.push(tsLit(tk[p++])); if (!eat(',')) break; } need(']');
        const u = [...new Set(v)];
        return unite(u.map((x) => (x === 'null' ? node('null') : node(x))));
      }
      case 'Annotated': {
        const first = union(); const from = p;
        let d = 0; while (p < tk.length && !(tk[p] === ']' && d === 0)) { if (tk[p] === '[' || tk[p] === '(') d++; else if (tk[p] === ']' || tk[p] === ')') d--; p++; }
        const extra = tk.slice(from, p).join(' ');
        const al = /alias\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/.exec(extra), de = /description\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/.exec(extra);
        if (al) meta.alias = pyStr(al[1]); if (de) meta.desc = pyStr(de[1]);
        need(']'); return first;
      }
      case 'NotRequired': { meta.notReq = true; const a = args(); return a[0]; }
      case 'Required': case 'ReadOnly': case 'Final': case 'InitVar': case 'TypeGuard': { const a = args(); return a[0]; }
      case 'ClassVar': { meta.skip = true; const a = args(); return a[0]; }
      case 'list': case 'List': case 'Sequence': case 'MutableSequence': case 'Iterable': case 'Iterator': case 'Collection': case 'set': case 'Set': case 'frozenset': case 'FrozenSet': case 'AbstractSet': case 'MutableSet': case 'deque': case 'Deque': case 'Generator': case 'AsyncIterator': { const a = args(); return node(`${paren(a[0] || node('unknown'))}[]`); }
      case 'tuple': case 'Tuple': {
        if (peek() === '(') { p++; need(')'); need(']'); return node('[]'); }
        const a = args();
        if (a.length === 2 && a[1].s === 'unknown' && tk[p - 2] === '...') return node(`${paren(a[0])}[]`);
        return node(`[${a.map((x) => x.s).join(', ')}]`);
      }
      case 'dict': case 'Dict': case 'Mapping': case 'MutableMapping': case 'DefaultDict': case 'defaultdict': case 'OrderedDict': {
        const a = args(); return node(`Record<${a[0] && a[0].s === 'number' ? 'number' : 'string'}, ${a[1] ? a[1].s : 'unknown'}>`);
      }
      case 'Counter': args(); return node('Record<string, number>');
      case 'Type': case 'type': case 'Callable': args(); return node('unknown');
      default: { const a = args(); return node(`${name}<${a.map((x) => x.s).join(', ')}>`); }
    }
  }
  function plain(name) {
    const M = {
      str: 'string', Text: 'string', bytes: 'string', bytearray: 'string', int: 'number', float: 'number', complex: 'number', bool: 'boolean',
      None: 'null', NoneType: 'null', Any: 'unknown', object: 'unknown', Decimal: 'string', UUID: 'string', UUID1: 'string', UUID3: 'string', UUID4: 'string', UUID5: 'string', Path: 'string', PurePath: 'string',
      EmailStr: 'string', NameEmail: 'string', HttpUrl: 'string', AnyUrl: 'string', AnyHttpUrl: 'string', Url: 'string', SecretStr: 'string', SecretBytes: 'string', IPv4Address: 'string', IPv6Address: 'string', IPvAnyAddress: 'string', Pattern: 'string', timedelta: 'string',
      PositiveInt: 'number', NegativeInt: 'number', NonNegativeInt: 'number', NonPositiveInt: 'number', PositiveFloat: 'number', NegativeFloat: 'number', NonNegativeFloat: 'number', StrictInt: 'number', StrictFloat: 'number', StrictStr: 'string', StrictBool: 'boolean', Json: 'unknown',
      list: 'unknown[]', List: 'unknown[]', Sequence: 'unknown[]', set: 'unknown[]', Set: 'unknown[]', frozenset: 'unknown[]', tuple: 'unknown[]', Tuple: 'unknown[]', dict: 'Record<string, unknown>', Dict: 'Record<string, unknown>', Mapping: 'Record<string, unknown>', Callable: 'unknown', Self: 'unknown',
      datetime: ctx.o.dates === 'Date' ? 'Date' : 'string', date: ctx.o.dates === 'Date' ? 'Date' : 'string', time: 'string',
    };
    if (name === 'ClassVar') { meta.skip = true; return node('unknown'); }
    if (M[name] !== undefined) return node(M[name], { nul: M[name] === 'null' });
    return node(name);
  }
  const n = union();
  if (p < tk.length) throw new Error(`Unexpected "${tk[p]}" in the Python type "${rest}"`);
  return { node: n, meta };
}

function parsePython(src, o) {
  const lines = pyLogicalLines(src);
  const classes = [], aliases = [], ctx = { enums: {}, o };
  const typevars = new Set();
  const topIndent = lines.length ? Math.min(...lines.map((l) => l.indent)) : 0;
  const pyType = (t) => pyTypeParser(t, ctx);
  const callArgs = (e) => { // text inside the outer parentheses of a call -> [positional[], keyword{}]
    const i = e.indexOf('('); const inner = e.slice(i + 1, e.lastIndexOf(')'));
    const pos = [], kw = {};
    for (const a of splitTop(inner, ',')) { const t = a.trim(); if (!t) continue; const kv = splitTop(t, '='); if (kv.length > 1 && /^\w+$/.test(kv[0].trim())) kw[kv[0].trim()] = kv.slice(1).join('=').trim(); else pos.push(t); }
    return [pos, kw];
  };
  const analyseDefault = (d) => {
    if (d == null) return { has: false };
    const cm = /^(?:[\w.]*\.)?(Field|field|Query|Body|Header|Path|FieldInfo)\s*\(/.exec(d);
    if (!cm) return { has: true };
    const [pos, kw] = callArgs(d);
    const isDef = (cm[1] === 'field' ? ('default' in kw || 'default_factory' in kw) : (('default' in kw) || ('default_factory' in kw) || (pos.length > 0 && pos[0] !== '...')));
    const res = { has: isDef };
    for (const k of ['alias', 'serialization_alias', 'validation_alias']) if (kw[k] && pyStr(kw[k]) != null && !res.alias) res.alias = pyStr(kw[k]);
    if (kw.description && pyStr(kw.description) != null) res.desc = pyStr(kw.description);
    return res;
  };
  let i = 0;
  while (i < lines.length) {
    const L = lines[i];
    if (L.indent !== topIndent) { i++; continue; }
    const cm = /^class\s+(\w+)\s*(?:\(([\s\S]*)\))?\s*:\s*(.*)$/.exec(L.text);
    if (cm) {
      const [, name, baseTxt = '', inline] = cm;
      let j = i + 1; const body = [];
      while (j < lines.length && lines[j].indent > topIndent) body.push(lines[j++]);
      classes.push(parseClass(name, baseTxt, inline, body));
      i = j; continue;
    }
    const tv = /^(\w+)\s*(?::\s*[\w.\[\]]+\s*)?=\s*(?:[\w.]*\.)?TypeVar\s*\(/.exec(L.text);
    if (tv) { typevars.add(tv[1]); i++; continue; }
    const td = /^(\w+)\s*=\s*(?:[\w.]*\.)?(TypedDict|NamedTuple)\s*\(([\s\S]*)\)$/.exec(L.text);
    if (td) { classes.push(parseFunctional(td[1], td[2], td[3])); i++; continue; }
    const nt = /^(\w+)\s*=\s*(?:[\w.]*\.)?NewType\s*\(\s*(?:"[^"]*"|'[^']*')\s*,\s*([\s\S]+)\)$/.exec(L.text);
    if (nt) { aliases.push({ name: nt[1], rhs: nt[2] }); i++; continue; }
    const ta = /^type\s+(\w+)(?:\[[^\]]*\])?\s*=\s*([\s\S]+)$/.exec(L.text) || /^(\w+)\s*:\s*(?:typing\.)?TypeAlias\s*=\s*([\s\S]+)$/.exec(L.text);
    if (ta) { aliases.push({ name: ta[1], rhs: ta[2] }); i++; continue; }
    const as = /^([A-Z]\w*)\s*=\s*((?:Literal|Union|Optional|Annotated|List|Dict|Set|Tuple|FrozenSet|Sequence|Mapping|list|dict|set|tuple|frozenset)\s*\[[\s\S]*\]|[\w.]+(?:\s*\|\s*[\w.\[\], "']+)+)$/.exec(L.text);
    if (as) { aliases.push({ name: as[1], rhs: as[2] }); i++; continue; }
    i++;
  }

  function parseFunctional(name, kind, argsTxt) {
    const parts = splitTop(argsTxt, ',');
    const fieldsTxt = parts.slice(1).join(',').trim();
    const c = { name, kind: kind === 'NamedTuple' ? 'tuple' : 'typeddict', bases: [], fields: [], doc: '', total: !/total\s*=\s*False/.test(argsTxt), tvars: [] };
    const addField = (k, t) => { const r = pyType(t.trim()); c.fields.push({ py: k, ts: r.node.s, nul: r.node.nul, opt: r.meta.notReq || (!c.total && !/^Required\[/.test(t.trim())), alias: r.meta.alias, desc: r.meta.desc }); };
    if (fieldsTxt.startsWith('{')) {
      const inner = fieldsTxt.slice(1, fieldsTxt.lastIndexOf('}'));
      for (const e of splitTop(inner, ',')) { const kv = splitTop(e, ':'); if (kv.length < 2) continue; const key = pyStr(kv[0]); if (key != null) addField(key, kv.slice(1).join(':')); }
    } else if (fieldsTxt.startsWith('[')) {
      const inner = fieldsTxt.slice(1, fieldsTxt.lastIndexOf(']'));
      for (const e of splitTop(inner, ',')) { const t = e.trim().replace(/^\(|\)$/g, ''); const kv = splitTop(t, ','); if (kv.length >= 2) { const key = pyStr(kv[0]); if (key != null) addField(key, kv.slice(1).join(',')); } }
    }
    return c;
  }

  function parseClass(name, baseTxt, inline, body) {
    const bases = splitTop(baseTxt, ',').map((b) => b.trim()).filter(Boolean);
    const c = { name, kind: 'object', bases: [], fields: [], doc: '', total: true, tvars: [], enumType: null, members: [] };
    for (const b of bases) {
      const kw = /^(\w+)\s*=\s*(.+)$/.exec(b);
      if (kw) { if (kw[1] === 'total' && kw[2].trim() === 'False') c.total = false; continue; }
      const bn = b.replace(/\[[\s\S]*$/, '').split('.').pop();
      if (bn === 'Generic' || bn === 'Protocol') { const g = /\[([\s\S]*)\]/.exec(b); if (g && bn === 'Generic') c.tvars.push(...g[1].split(',').map((x) => x.trim()).filter(Boolean)); continue; }
      if (bn === 'TypedDict') c.kind = 'typeddict';
      else if (bn === 'NamedTuple') c.kind = 'tuple';
      else if (/^(Enum|IntEnum|StrEnum|Flag|IntFlag|ReprEnum)$/.test(bn)) { c.kind = 'enum'; c.enumType = bn; }
      else if (bn === 'str' || bn === 'int') c.enumType = c.enumType || bn;
      else if (bn === 'BaseModel' || bn === 'object' || bn === 'RootModel') { if (bn === 'RootModel') c.kind = 'root'; }
      else c.bases.push({ name: bn, args: /\[([\s\S]*)\]/.exec(b)?.[1] });
    }
    if (c.kind === 'object' && c.enumType) c.kind = 'enum';
    const rows = body.length ? body : (inline && inline !== 'pass' && inline !== '...' ? [{ indent: 1, text: inline }] : []);
    if (!rows.length) return c;
    const bi = rows[0].indent; let n = 0; let nextAuto = 1;
    if (c.kind === 'enum') ctx.enums[name] = {};
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]; if (row.indent !== bi) continue;
      const t = row.text;
      if (n === 0 && /^[rbfRBF]*("""|'''|"|')/.test(t)) { c.doc = pyDocText(t); n++; continue; }
      n++;
      if (/^(def|async\s+def|class|@)/.test(t)) {
        const im = /^def\s+__init__\s*\(([\s\S]*)\)\s*(?:->\s*[^:]+)?:/.exec(t);
        if (im && c.kind === 'object') c.initParams = im[1];
        continue;
      }
      if (c.kind === 'enum') {
        const em = /^(\w+)\s*(?::[^=]+)?=\s*([\s\S]+)$/.exec(t); if (!em || /^_/.test(em[1])) continue;
        let v = pyStr(em[2]);
        if (v == null) { if (/^-?\d+(\.\d+)?$/.test(em[2].trim())) v = Number(em[2]); else if (/^(?:enum\.)?auto\s*\(\s*\)$/.test(em[2].trim())) v = c.enumType === 'StrEnum' ? em[1].toLowerCase() : nextAuto; else v = em[1]; }
        if (typeof v === 'number') nextAuto = v + 1;
        c.members.push({ name: em[1], value: v }); ctx.enums[name][em[1]] = v; continue;
      }
      const fm = /^(\w+)\s*:\s*([\s\S]+)$/.exec(t); if (!fm) continue;
      const [annTxt, ...defParts] = splitTop(fm[2], '=');
      const defTxt = defParts.length ? defParts.join('=').trim() : null;
      if (/^_/.test(fm[1]) && c.kind !== 'typeddict') continue;
      const r2 = pyType(annTxt.trim());
      if (r2.meta.skip) continue;
      const dflt = analyseDefault(defTxt);
      const optByDefault = dflt.has;
      const td = c.kind === 'typeddict';
      c.fields.push({ py: fm[1], ts: r2.node.s, nul: r2.node.nul, opt: td ? r2.meta.notReq || (!c.total && !/^Required\[/.test(annTxt.trim())) : (optByDefault && o.defaults), alias: dflt.alias || r2.meta.alias, desc: dflt.desc || r2.meta.desc });
    }
    if (c.kind === 'object' && !c.fields.length && c.initParams) {
      for (const prm of splitTop(c.initParams, ',')) {
        const q = prm.trim(); if (!q || /^(self|\*|\/)/.test(q) || q.startsWith('*')) continue;
        const [h, ...dv] = splitTop(q, '='); const [pn, ...pt] = splitTop(h, ':');
        if (!pt.length) continue;
        const r3 = pyType(pt.join(':').trim());
        c.fields.push({ py: pn.trim(), ts: r3.node.s, nul: r3.node.nul, opt: dv.length > 0 && o.defaults, alias: null, desc: null });
      }
    }
    return c;
  }
  return { classes, aliases, typevars, ctx };
}

function pythonToTs(src, o) {
  const { classes, aliases, ctx } = parsePython(src, o);
  if (!classes.length && !aliases.length) throw new Error('No class or type alias found. Paste Python class definitions (TypedDict, dataclass, Pydantic BaseModel, Enum or annotated classes).');
  const exp = o.export ? 'export ' : '';
  const known = new Set(classes.map((c) => c.name));
  const key = (f) => { const k = f.alias || (o.keys === 'camelCase' ? camel(f.py) : f.py); return /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k); };
  const jsd = (d, p = '') => (d ? `${p}/** ${d.replace(/\*\//g, '* /')} */\n` : '');
  const out = [];
  for (const c of classes) {
    if (c.kind === 'enum') {
      const strs = c.members.length && c.members.every((m) => typeof m.value === 'string');
      if (o.enums === 'enum' && c.members.length) {
        out.push(`${jsd(c.doc)}${exp}enum ${c.name} {\n${c.members.map((m) => `  ${/^[A-Za-z_$][\w$]*$/.test(m.name) ? m.name : JSON.stringify(m.name)} = ${JSON.stringify(m.value)},`).join('\n')}\n}`);
      } else out.push(`${jsd(c.doc)}${exp}type ${c.name} = ${c.members.length ? c.members.map((m) => JSON.stringify(m.value)).join(' | ') : 'never'};${strs || !c.members.length ? '' : ''}`);
      continue;
    }
    const tp = c.tvars.length ? `<${c.tvars.join(', ')}>` : '';
    if (c.kind === 'tuple') {
      out.push(`${jsd(c.doc)}${exp}type ${c.name}${tp} = [${c.fields.map((f) => `${/^[A-Za-z_$][\w$]*$/.test(f.py) ? f.py : 'item'}${f.opt ? '?' : ''}: ${f.ts}`).join(', ')}];`);
      continue;
    }
    const bases = c.bases.map((b) => (known.has(b.name) ? b.name + (b.args ? `<${pyTypeParser(b.args, ctx).node.s.replace(/^\[|\]$/g, '')}>` : '') : null)).filter(Boolean);
    const missing = c.bases.filter((b) => !known.has(b.name)).map((b) => b.name);
    const ext = bases.length ? ` extends ${bases.join(', ')}` : '';
    const lines = c.fields.map((f) => `${jsd(f.desc, '  ')}  ${key(f)}${f.opt ? '?' : ''}: ${f.ts};`);
    out.push(`${jsd(c.doc)}${missing.length ? `// base class not in the input, fields not included: ${missing.join(', ')}\n` : ''}${exp}interface ${c.name}${tp}${ext} {\n${lines.join('\n')}${lines.length ? '\n' : ''}}`);
  }
  for (const a of aliases) out.push(`${exp}type ${a.name} = ${pyTypeParser(a.rhs.trim(), ctx).node.s};`);
  return out.join('\n\n') + '\n';
}

const PY_SAMPLE = `from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Literal, Optional, TypedDict, NotRequired
from pydantic import BaseModel, Field


class Role(str, Enum):
    ADMIN = "admin"
    MEMBER = "member"


Status = Literal["active", "disabled"]


class Address(TypedDict):
    street: str
    zip: NotRequired[str]
    coords: tuple[float, float]


class User(BaseModel):
    """A registered user"""
    id: int
    email: str = Field(description="Login email")
    name: Optional[str] = None
    role: Role
    status: Status = "active"
    tags: list[str] = []
    address: Address
    meta: dict[str, object]
    created_at: datetime = Field(alias="createdAt")


@dataclass
class Page:
    items: list[User]
    total: int
    next_cursor: str | None = None
`;
T.push({
  id: 'python-to-typescript', cat: 'Schema Converters', title: 'Python Classes to TypeScript Interfaces',
  desc: 'Convert Python TypedDict, dataclass, Pydantic v2 BaseModel, NamedTuple, Enum and plain annotated classes into TypeScript interfaces and types: Optional and X | None become | null, fields with defaults become optional, Literal becomes a literal union, list/set/dict/tuple/datetime/UUID are mapped, Pydantic aliases become the property names. Reads declarations only (a line-based parser, not a Python interpreter): no runtime-built models, validators or computed fields.',
  labels: ['Python source'], sample: PY_SAMPLE,
  opts: [chk('export', 'export keyword', true), chk('defaults', 'Fields with a default become optional (?)', true), sel('enums', 'Enum becomes', ['union', 'enum'], 'union'), sel('dates', 'datetime and date map to', ['string', 'Date'], 'string'), sel('keys', 'Property names', ['as written', 'camelCase'], 'as written')],
  run: ([s], o) => pythonToTs(s, o),
});

// ======================================================================
// Go -> TypeScript
// ======================================================================
function goTokens(src) {
  const t = []; let i = 0; const n = src.length; let docBuf = [];
  const push = (k, v) => { if (k !== 'nl' && k !== 'doc') { /* keep docs for next token */ } t.push({ k, v }); };
  while (i < n) {
    const c = src[i];
    if (c === '\n') { if (t.length && t[t.length - 1].k !== 'nl') push('nl', '\n'); i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (src.startsWith('//', i)) {
      let e = src.indexOf('\n', i); if (e < 0) e = n;
      const own = !t.length || t[t.length - 1].k === 'nl';
      const text = src.slice(i + 2, e).trim();
      if (own && !/^(go:|\+build)/.test(text)) { t.push({ k: 'doc', v: text }); }
      i = e; continue;
    }
    if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); const body = src.slice(i + 2, e < 0 ? n : e); if (!t.length || t[t.length - 1].k === 'nl') t.push({ k: 'doc', v: oneLine(body.replace(/^\s*\*+/gm, '')) }); i = e < 0 ? n : e + 2; continue; }
    if (c === '"') { let j = i + 1; while (j < n && src[j] !== '"') j += src[j] === '\\' ? 2 : 1; push('str', src.slice(i + 1, j)); i = j + 1; continue; }
    if (c === '`') { const e = src.indexOf('`', i + 1); push('raw', src.slice(i + 1, e < 0 ? n : e)); i = e < 0 ? n : e + 1; continue; }
    if (c === "'") { let j = i + 1; while (j < n && src[j] !== "'") j += src[j] === '\\' ? 2 : 1; push('chr', src.slice(i + 1, j)); i = j + 1; continue; }
    const m = /^(?:0[xX][\da-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?|[A-Za-z_][\w]*)/.exec(src.slice(i, i + 80));
    if (m) { push(/^\d/.test(m[0]) ? 'num' : 'id', m[0]); i += m[0].length; continue; }
    const two = src.slice(i, i + 3);
    if (two === '...') { push('p', '...'); i += 3; continue; }
    if (src.startsWith('<<', i) || src.startsWith('>>', i)) { push('p', src.slice(i, i + 2)); i += 2; continue; }
    push('p', c); i++;
  }
  void docBuf;
  return t;
}
const GO_NUM = new Set(['int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'uintptr', 'byte', 'rune', 'float32', 'float64']);
const GO_EXT = { 'time.Time': 'string', 'time.Duration': 'number', 'json.RawMessage': 'unknown', 'json.Number': 'number', 'uuid.UUID': 'string', 'net.IP': 'string', 'decimal.Decimal': 'string', 'big.Int': 'number', 'big.Float': 'number', 'url.URL': 'string', 'netip.Addr': 'string' };

function parseGo(src, o) {
  const tk = goTokens(src); let p = 0;
  const types = [], consts = [];
  const isP = (c) => tk[p] && tk[p].k === 'p' && tk[p].v === c;
  const isId = (v) => tk[p] && tk[p].k === 'id' && (v === undefined || tk[p].v === v);
  const eatP = (c) => (isP(c) ? (p++, true) : false);
  const skipNl = () => { while (tk[p] && (tk[p].k === 'nl' || (tk[p].k === 'p' && tk[p].v === ';'))) p++; };
  const takeDoc = () => { const d = []; while (tk[p] && (tk[p].k === 'doc' || tk[p].k === 'nl')) { if (tk[p].k === 'doc') d.push(tk[p].v); else if (tk[p + 1] && tk[p + 1].k === 'nl') d.length = 0; p++; } return d.join(' '); };
  const skipBalanced = (open, close) => { let d = 0; do { if (isP(open)) d++; else if (isP(close)) d--; p++; } while (d > 0 && p < tk.length); };
  const unit = (s, extra = {}) => ({ s, nul: false, kind: 'named', ...extra });
  const wrap = (x) => (x.nul ? `(${x.s} | null)` : /\s\|\s/.test(x.s) && !/^[{[(]/.test(x.s) ? `(${x.s})` : x.s);
  function goType(tp) {
    if (eatP('*')) { const x = goType(tp); return { ...x, nul: true }; }
    if (eatP('(')) { const x = goType(tp); eatP(')'); return x; }
    if (isP('[')) {
      p++;
      if (eatP(']')) { const e = goType(tp); if (e.s === 'number' && e.byte) return unit('string', { kind: 'prim' }); return unit(`${wrap(e)}[]`, { kind: 'slice' }); }
      while (!isP(']') && p < tk.length) p++; p++;
      const e = goType(tp); return unit(`${wrap(e)}[]`, { kind: 'slice' });
    }
    if (isId('map')) {
      p++; if (!eatP('[')) throw new Error('Malformed map type');
      const k = goType(tp); if (!eatP(']')) throw new Error('Malformed map type');
      const v = goType(tp);
      const ks = k.s === 'string' ? 'string' : k.s === 'number' ? 'number' : k.s;
      const rec = `Record<${ks}, ${v.nul ? v.s + ' | null' : v.s}>`; // a map only has the keys it holds, so a union/enum key type is Partial
      return unit(ks === 'string' || ks === 'number' ? rec : `Partial<${rec}>`, { kind: 'map' });
    }
    if (isId('chan') || isId('func')) { if (isId('func')) { p++; if (isP('(')) skipBalanced('(', ')'); while (tk[p] && tk[p].k !== 'nl' && tk[p].k !== 'raw' && !isP('}') && !isP(',') && !isP(')') && !isP(';')) { if (isP('(')) skipBalanced('(', ')'); else p++; } } else { p++; if (isP('<')) p++; if (isP('-')) p++; goType(tp); } return unit('unknown', { kind: 'prim' }); }
    if (isId('interface')) { p++; if (isP('{')) skipBalanced('{', '}'); return unit('unknown', { kind: 'prim' }); }
    if (isId('struct')) { p++; return unit(inlineObj(structBody(tp)), { kind: 'obj' }); }
    if (isId()) {
      let name = tk[p++].v;
      if (isP('.') && tk[p + 1] && tk[p + 1].k === 'id') { name += '.' + tk[p + 1].v; p += 2; }
      let args = '';
      if (isP('[') && !(tk[p + 1] && (tk[p + 1].k === 'p' && tk[p + 1].v === ']'))) { // generic instantiation
        p++; const a = []; for (;;) { a.push(goType(tp)); if (!eatP(',')) break; } eatP(']'); args = `<${a.map((x) => x.s).join(', ')}>`;
      }
      if (name === 'string') return unit('string', { kind: 'prim' });
      if (name === 'bool') return unit('boolean', { kind: 'prim' });
      if (name === 'byte' || name === 'uint8') return unit('number', { kind: 'prim', byte: true });
      if (GO_NUM.has(name)) return unit('number', { kind: 'prim' });
      if (name === 'any' || name === 'error') return unit('unknown', { kind: 'prim' });
      if (name === 'time.Time') return unit(o.dates === 'Date' ? 'Date' : 'string', { kind: 'prim' });
      if (GO_EXT[name]) return unit(GO_EXT[name], { kind: 'prim' });
      if (name.includes('.')) return unit(`unknown /* ${name} */`, { kind: 'prim' });
      return unit(name + args);
    }
    throw new Error(`Cannot read Go type near "${tk[p] ? tk[p].v : 'end of input'}"`);
  }
  const inlineObj = (st) => `{ ${st.fields.map((f) => `${f.key}${f.opt ? '?' : ''}: ${f.ts}`).join('; ')} }`;
  const tagOf = (raw) => { const m = /(?:^|\s)json:"([^"]*)"/.exec(raw || ''); return m ? m[1] : null; };
  function structBody(tp) {
    if (!eatP('{')) throw new Error('Expected "{" after struct');
    const fields = [], embeds = [];
    for (;;) {
      const d = takeDoc(); skipNl();
      if (!tk[p] || isP('}')) { p++; break; }
      // embedded field: [*]Name[.Name] followed by tag/newline/}
      const save = p;
      let star = eatP('*'), nm = null;
      if (isId()) { nm = tk[p++].v; if (isP('.') && tk[p + 1] && tk[p + 1].k === 'id') { nm += '.' + tk[p + 1].v; p += 2; } }
      const endsField = () => !tk[p] || tk[p].k === 'nl' || tk[p].k === 'raw' || tk[p].k === 'str' || isP('}') || isP(';');
      if (nm && endsField()) {
        const tag = tk[p] && (tk[p].k === 'raw' || tk[p].k === 'str') ? tagOf(tk[p++].v) : null;
        const tn = tag ? tag.split(',')[0] : '';
        if (tag === '-') continue;
        const base = nm.split('.').pop();
        if (tn) fields.push({ key: tn, ts: nm.includes('.') ? 'unknown' : nm, opt: /omitempty/.test(tag), nul: star, doc: d });
        else if (nm.includes('.')) fields.push({ comment: `embedded ${nm} not resolved` });
        else embeds.push(nm);
        void base; continue;
      }
      p = save;
      const names = [];
      for (;;) { if (!isId()) throw new Error(`Cannot read struct field near "${tk[p] ? tk[p].v : 'end of input'}"`); names.push(tk[p++].v); if (!eatP(',')) break; }
      const ty = goType(tp);
      let tag = null; if (tk[p] && (tk[p].k === 'raw' || tk[p].k === 'str')) tag = tagOf(tk[p++].v);
      while (tk[p] && tk[p].k !== 'nl' && !isP('}') && !isP(';')) p++;
      if (tag === '-') continue;
      for (const nmx of names) {
        if (!tag && !/^[A-Z]/.test(nmx)) continue; // unexported: encoding/json ignores it
        if (tag === null && !/^[A-Z]/.test(nmx)) continue;
        const parts = (tag || '').split(',');
        const key = parts[0] || nmx;
        const opt = parts.includes('omitempty') || parts.includes('omitzero');
        const asStr = parts.includes('string') && (ty.kind === 'prim');
        let ts = asStr ? 'string' : ty.s, nul = ty.nul;
        if (!asStr && o.nilSlices && !opt && (ty.kind === 'slice' || ty.kind === 'map')) nul = true;
        fields.push({ key: /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key), ts, opt, nul, doc: d });
      }
    }
    return { fields, embeds };
  }
  function typeParams() {
    // after the name: "[T any, U comparable]" -> ["T","U"], only if it really is a parameter list
    if (!isP('[') || !(tk[p + 1] && tk[p + 1].k === 'id') || !(tk[p + 2] && (tk[p + 2].k === 'id' || (tk[p + 2].k === 'p' && [',', '~', '*', '['].includes(tk[p + 2].v)) ))) return [];
    p++; const names = []; let d = 0, want = true;
    while (p < tk.length) {
      if (isP('[')) d++; else if (isP(']')) { if (d === 0) { p++; break; } d--; }
      else if (d === 0 && isP(',')) want = true;
      else if (d === 0 && want && isId()) { names.push(tk[p].v); want = false; }
      p++;
    }
    return names;
  }
  function typeDecl(d) {
    const name = tk[p++].v; const tparams = typeParams(); eatP('=');
    if (isId('struct')) { p++; const st = structBody(); types.push({ name, tparams, kind: 'struct', doc: d, ...st }); return; }
    if (isId('interface')) { p++; if (isP('{')) skipBalanced('{', '}'); types.push({ name, tparams, kind: 'alias', doc: d, ts: 'unknown', nul: false }); return; }
    const ty = goType(); types.push({ name, tparams, kind: 'alias', doc: d, ts: ty.s, nul: ty.nul, base: ty.kind === 'prim' ? ty.s : null });
  }
  function constBlock() {
    const grouped = eatP('('); let iota = 0, prevType = null, prevExpr = null;
    const spec = () => {
      takeDoc(); skipNl();
      if (!tk[p] || isP(')')) return false;
      const names = []; for (;;) { if (!isId()) { p++; return true; } names.push(tk[p++].v); if (!eatP(',')) break; }
      let ty = null; if (isId() && !isP('=')) { ty = tk[p++].v; if (isP('.')) { p++; ty += '.' + tk[p++].v; } }
      let expr = null;
      if (eatP('=')) { const e = []; while (tk[p] && tk[p].k !== 'nl' && !isP(';') && !isP(')')) e.push(tk[p++]); expr = e; } else { ty = ty || prevType; expr = prevExpr; }
      if (ty) prevType = ty; prevExpr = expr;
      names.forEach((nm) => {
        let val = undefined;
        if (expr && expr.length === 1 && (expr[0].k === 'str' || expr[0].k === 'raw')) val = expr[0].v;
        else if (expr) {
          const code = expr.map((x) => (x.k === 'id' && x.v === 'iota' ? String(iota) : x.v)).join(' ');
          if (/^[\d\s+\-*/()<>x]+$/.test(code) && !/[^\d\s+\-*/()<>]/.test(code.replace(/0x[\da-f]+/gi, '0'))) { try { val = Function(`"use strict";return (${code})`)(); } catch { val = undefined; } }
        }
        consts.push({ name: nm, type: ty, value: val });
      });
      iota++; return true;
    };
    if (grouped) { while (spec()) { /* loop */ } eatP(')'); } else spec();
  }
  while (p < tk.length) {
    const d = takeDoc(); skipNl();
    if (!tk[p]) break;
    if (isId('package') || isId('import')) { p++; if (isP('(')) skipBalanced('(', ')'); else while (tk[p] && tk[p].k !== 'nl') p++; continue; }
    if (isId('type')) {
      p++;
      if (eatP('(')) { for (;;) { const dd = takeDoc(); skipNl(); if (!tk[p] || isP(')')) { p++; break; } typeDecl(dd); } } else typeDecl(d);
      continue;
    }
    if (isId('const')) { p++; constBlock(); continue; }
    if (isId('var')) { p++; if (isP('(')) skipBalanced('(', ')'); else while (tk[p] && tk[p].k !== 'nl') { if (isP('{')) skipBalanced('{', '}'); else p++; } continue; }
    if (isId('func')) { // skip the whole declaration including the body
      p++; let paren = 0;
      while (tk[p]) { if (isP('(')) paren++; else if (isP(')')) paren--; else if (isP('{') && paren === 0 && !(tk[p - 1] && tk[p - 1].k === 'id' && (tk[p - 1].v === 'interface' || tk[p - 1].v === 'struct'))) { skipBalanced('{', '}'); break; } else if (tk[p].k === 'nl' && paren === 0) break; p++; }
      continue;
    }
    p++;
  }
  return { types, consts };
}

function goToTs(src, o) {
  const { types, consts } = parseGo(src, o);
  if (!types.length) throw new Error('No Go type declaration found. Paste struct definitions such as: type User struct { ID int `json:"id"` }');
  const exp = o.export ? 'export ' : '';
  const jsd = (d, p = '') => (d ? `${p}/** ${d.replace(/\*\//g, '* /')} */\n` : '');
  const out = [];
  for (const t of types) {
    const tp = t.tparams.length ? `<${t.tparams.join(', ')}>` : '';
    if (t.kind === 'struct') {
      const lines = t.fields.map((f) => (f.comment ? `  // ${f.comment}` : `${jsd(f.doc, '  ')}  ${f.key}${f.opt ? '?' : ''}: ${f.ts}${f.nul ? ' | null' : ''};`));
      // a pointer with omitempty is just optional; the null is only kept for pointers without omitempty
      const fixed = t.fields.map((f, i) => (f.comment ? lines[i] : f.opt && f.nul ? lines[i].replace(/ \| null;$/, ';') : lines[i]));
      out.push(`${jsd(t.doc)}${exp}interface ${t.name}${tp}${t.embeds.length ? ` extends ${t.embeds.join(', ')}` : ''} {\n${fixed.join('\n')}${fixed.length ? '\n' : ''}}`);
      continue;
    }
    const cs = consts.filter((c) => c.type === t.name && c.value !== undefined);
    if (cs.length && (t.base === 'string' || t.base === 'number')) {
      const strip = (n) => (n.startsWith(t.name) && n.length > t.name.length ? n.slice(t.name.length) : n);
      if (o.enums === 'enum') out.push(`${jsd(t.doc)}${exp}enum ${t.name} {\n${cs.map((c) => `  ${strip(c.name)} = ${JSON.stringify(c.value)},`).join('\n')}\n}`);
      else out.push(`${jsd(t.doc)}${exp}type ${t.name} = ${[...new Set(cs.map((c) => JSON.stringify(c.value)))].join(' | ')};`);
    } else out.push(`${jsd(t.doc)}${exp}type ${t.name}${tp} = ${t.ts}${t.nul ? ' | null' : ''};`);
  }
  return out.join('\n\n') + '\n';
}
const GO_SAMPLE = `package models

import "time"

type Role string

const (
	RoleAdmin  Role = "admin"
	RoleMember Role = "member"
)

type Base struct {
	ID        int64     \`json:"id"\`
	CreatedAt time.Time \`json:"createdAt"\`
}

// User is a registered account.
type User struct {
	Base
	Email    string            \`json:"email"\`
	Name     *string           \`json:"name,omitempty"\`
	Role     Role              \`json:"role"\`
	Tags     []string          \`json:"tags"\`
	Meta     map[string]any    \`json:"meta,omitempty"\`
	Address  *Address          \`json:"address"\`
	Password string            \`json:"-"\`
	Scores   map[string]float64 \`json:"scores"\`
	internal int
}

type Address struct {
	Street string \`json:"street"\`
	Zip    string \`json:"zip,omitempty"\`
}
`;
T.push({
  id: 'go-struct-to-typescript', cat: 'Schema Converters', title: 'Go Structs to TypeScript Interfaces',
  desc: 'Convert Go struct definitions into TypeScript interfaces using their json tags: omitempty makes a property optional, pointers become | null, slices become arrays, map[string]T becomes Record, time.Time becomes string, embedded structs become extends, json:"-" and unexported fields are dropped, typed string and iota constants become enums or unions. Reads declarations only: custom MarshalJSON methods and build tags are not seen.',
  labels: ['Go source'], sample: GO_SAMPLE,
  opts: [chk('export', 'export keyword', true), sel('enums', 'Constant groups become', ['union', 'enum'], 'union'), sel('dates', 'time.Time maps to', ['string', 'Date'], 'string'), chk('nilSlices', 'Slices and maps without omitempty may be null', false)],
  run: ([s], o) => goToTs(s, o),
});

export { gen, GO, RUST, KT, JAVA, CS, pythonToTs, goToTs };
export default T;

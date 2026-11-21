// Dev config generators, formatters and CSS helpers. Pure text in/out (no DOM, no network); preview HTML
// is returned as a sandboxed srcdoc string. Hand-written, no third-party code.
// Deliberate simplifications: the compose/apache/toml formatters are line-based (they keep comments and
// never re-parse values); protobuf formatting is token-based; generated configs target current stable syntax.

const sel = (id, label, choices, def) => ({ id, label, type: 'select', choices, def: def ?? choices[0] });
const txt = (id, label, def = '') => ({ id, label, type: 'text', def });
const num = (id, label, def) => ({ id, label, type: 'number', def });
const chk = (id, label, def = false) => ({ id, label, type: 'checkbox', def });
const col = (id, label, def) => ({ id, label, type: 'color', def });
const lines = (s) => String(s ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const csv = (s) => String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const need = (v, m) => { if (v == null || String(v).trim() === '') throw new Error(m); return v; };
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const rd = (n, d = 2) => String(+Number(n).toFixed(d));
const page = (body, css = '') => `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:16px;font:14px system-ui,sans-serif;background:#f4f4f5;color:#222}${css}</style>${body}`;
const YRES = /^(true|false|null|yes|no|on|off|y|n|~)$/i;
// YAML scalar: bare when safe, JSON-quoted otherwise.
const yq = (s) => { s = String(s); return s !== '' && /^[A-Za-z_./][A-Za-z0-9_./ -]*$/.test(s) && !/\s$/.test(s) && !YRES.test(s) && isNaN(Number(s)) ? s : JSON.stringify(s); };
const yv = (s) => (/^-?\d+$/.test(String(s)) && String(s).length < 16 ? String(s) : yq(s));
const kvLines = (s) => lines(s).filter((l) => !l.startsWith('#')).map((l) => { const i = l.indexOf('='); if (i < 1) throw new Error(`Expected KEY=VALUE, got "${l}"`); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, '$2')]; });
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

// ---------- Apache conf formatter ----------
function apacheFmt(src, ind) {
  const out = []; let depth = 0, blank = false;
  const raw = src.replace(/\\\r?\n\s*/g, ' \\\n').split(/\r?\n/); // keep continuation markers as separate lines below
  const merged = [];
  for (let i = 0; i < raw.length; i++) { let l = raw[i]; while (/\\\s*$/.test(l) && i + 1 < raw.length) l = l.replace(/\\\s*$/, '') + ' ' + raw[++i].trim(); merged.push(l); }
  for (const line of merged) {
    const t = line.trim();
    if (!t) { blank = out.length > 0; continue; }
    if (blank && out.length) out.push(''); blank = false;
    if (t.startsWith('#')) { out.push(ind.repeat(depth) + t); continue; }
    if (/^<\//.test(t)) depth = Math.max(0, depth - 1);
    // collapse whitespace outside quotes
    let r = '', q = '';
    for (const c of t) { if (q) { r += c; if (c === q) q = ''; } else if (c === '"' || c === "'") { q = c; r += c; } else r += /\s/.test(c) ? (r.endsWith(' ') ? '' : ' ') : c; }
    out.push(ind.repeat(depth) + r);
    if (/^<[A-Za-z]/.test(t) && !/\/>$/.test(t)) depth++;
  }
  return out.join('\n') + '\n';
}

// ---------- docker-compose / YAML re-indenter (comment preserving) ----------
function yamlReindent(text, N) {
  const src = text.replace(/\t/g, '  ').split(/\r?\n/);
  const res = []; // {raw:string} | {comment:true,text} | {blank:true}
  let stack = [{ o: -1, out: -N }], prevOpen = null, bump = null, scalar = null, lastOut = 0;
  const pending = [];
  const flushComments = (ind) => { for (const c of pending) res.push(' '.repeat(ind) + c); pending.length = 0; };
  for (const line of src) {
    const t = line.trim(), r = line.length - line.trimStart().length;
    if (scalar) {
      if (!t) { res.push(''); continue; }
      if (r > scalar.key) { if (scalar.first == null) scalar.first = r; res.push(' '.repeat(Math.max(0, scalar.out + r - scalar.first)) + t); continue; }
      scalar = null;
    }
    if (!t) { if (res.length && res.at(-1) !== '' && !pending.length) res.push(''); else if (pending.length) pending.push(''); continue; }
    if (t.startsWith('#')) { pending.push(t); continue; }
    if (t === '---' || t === '...' || t.startsWith('--- ')) { flushComments(0); res.push(t); stack = [{ o: -1, out: -N }]; prevOpen = bump = null; continue; }
    let i = r;
    if (bump != null) { if (r > bump || (r === bump && /^-(\s|$)/.test(t))) i = r + 1; else bump = null; }
    if (bump == null && prevOpen != null && r === prevOpen && /^-(\s|$)/.test(t)) { bump = r; i = r + 1; }
    while (stack.length > 1 && stack.at(-1).o > i) stack.pop();
    let out;
    if (stack.at(-1).o === i) out = stack.at(-1).out; else { out = stack.at(-1).out + N; stack.push({ o: i, out }); }
    let cur = i, outc = out, rest = t, pre = '';
    while (/^-(\s+|$)/.test(rest) && rest !== '-') {
      const m = rest.match(/^-\s+/); cur += m[0].length; outc += 2; stack.push({ o: cur, out: outc }); pre += '- '; rest = rest.slice(m[0].length);
    }
    if (rest === '-') pre += '-';
    flushComments(out);
    res.push(' '.repeat(out) + pre + rest);
    const body = rest.replace(/\s+#.*$/, '');
    prevOpen = !pre && /:$/.test(body) ? r : null;
    if (/(^|:\s+|^-\s+)[|>][+-]?\d*$/.test(body) || /^[|>][+-]?\d*$/.test(body)) scalar = { key: /^[|>]/.test(rest) ? r : cur === i ? r : cur, out: (/^[|>]/.test(rest) ? out : outc) + N, first: null };
    lastOut = out;
  }
  flushComments(lastOut);
  while (res.at(-1) === '') res.pop();
  return res;
}
const COMPOSE_TOP = ['name', 'version', 'include', 'services', 'networks', 'volumes', 'configs', 'secrets'];
const COMPOSE_SVC = ['image', 'build', 'container_name', 'platform', 'command', 'entrypoint', 'working_dir', 'user', 'env_file', 'environment', 'ports', 'expose', 'volumes', 'networks', 'depends_on', 'healthcheck', 'restart', 'deploy', 'labels', 'logging', 'profiles'];
function sortChunks(ls, c, order) {
  const chunks = []; let pend = [];
  for (const l of ls) {
    const t = l.trim(), ind = l.length - l.trimStart().length;
    if (t && !t.startsWith('#') && ind === c) { chunks.push({ key: t.replace(/^["']?([^:"']*)["']?:.*$/, '$1'), lines: [...pend, l] }); pend = []; }
    else if (!t || t.startsWith('#')) pend.push(l);
    else { if (!chunks.length) return ls; chunks.at(-1).lines.push(...pend, l); pend = []; }
  }
  const rank = (k) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
  chunks.sort((a, b) => rank(a.key) - rank(b.key));
  return [...chunks.flatMap((x) => x.lines), ...pend];
}
function composeSort(ls, N) {
  ls = sortChunks(ls, 0, COMPOSE_TOP);
  // locate the services block and sort each service's keys
  const si = ls.findIndex((l) => /^services:\s*$/.test(l));
  if (si < 0) return ls;
  let end = si + 1; while (end < ls.length && (!ls[end].trim() || ls[end].startsWith(' '))) end++;
  const block = ls.slice(si + 1, end), names = [];
  let cur = null; const groups = []; let pend = [];
  for (const l of block) {
    const t = l.trim(), ind = l.length - l.trimStart().length;
    if (t && !t.startsWith('#') && ind === N) { cur = { head: [...pend, l], body: [] }; groups.push(cur); pend = []; }
    else if (!cur) pend.push(l); else cur.body.push(l);
  }
  void names;
  const sortedBody = groups.flatMap((g) => [...g.head, ...sortChunks(g.body, 2 * N, COMPOSE_SVC)]);
  return [...ls.slice(0, si + 1), ...(groups.length ? sortedBody : block), ...ls.slice(end)];
}

// ---------- TOML formatter (line based, keeps comments and values verbatim) ----------
function tomlScan(line, st) {
  let eq = -1, i = 0; const clean = !st.ml && st.depth === 0;
  while (i < line.length) {
    if (st.ml) { const j = line.indexOf(st.ml, i); if (j < 0) return eq; i = j + 3; st.ml = null; continue; }
    const c = line[i];
    if (c === '#') break;
    if (line.startsWith('"""', i) || line.startsWith("'''", i)) { st.ml = line.substr(i, 3); i += 3; continue; }
    if (c === '"') { i++; while (i < line.length && line[i] !== '"') { if (line[i] === '\\') i++; i++; } i++; continue; }
    if (c === "'") { const j = line.indexOf("'", i + 1); i = j < 0 ? line.length : j + 1; continue; }
    if (c === '[' || c === '{') st.depth++; else if (c === ']' || c === '}') st.depth--;
    else if (c === '=' && eq < 0 && clean && st.depth === 0) eq = i;
    i++;
  }
  return eq;
}
function tomlFmt(src, doSort) {
  const st = { ml: null, depth: 0 }, segs = [];
  for (const line of src.split(/\r?\n/)) {
    const wasMl = !!st.ml, wasDepth = st.depth > 0;
    const eq = tomlScan(line, st), t = line.trim();
    if (wasMl) { segs.at(-1).lines.push(line.replace(/\s+$/, '')); continue; }
    if (wasDepth) { segs.at(-1).lines.push(t === '' ? null : (/^[\]}]/.test(t) ? '' : '  ') + t); continue; }
    if (!t) { segs.push({ kind: 'blank', lines: [''] }); continue; }
    if (t.startsWith('#')) { segs.push({ kind: 'comment', lines: [t] }); continue; }
    if (t.startsWith('[')) { segs.push({ kind: 'header', lines: [t.replace(/\s+$/, '')] }); continue; }
    if (eq < 0) { segs.push({ kind: 'other', lines: [t] }); continue; }
    const key = line.slice(0, eq).trim(), val = line.slice(eq + 1).trim();
    segs.push({ kind: 'entry', key, lines: [`${key} = ${val}`] });
  }
  if (doSort) {
    const out = []; let run = [];
    const flush = () => {
      const ents = []; let lead = [];
      for (const s of run) { if (s.kind === 'entry') { ents.push({ key: s.key, lines: [...lead.flatMap((x) => x.lines), ...s.lines] }); lead = []; } else if (s.kind === 'blank' && !lead.length) continue; else lead.push(s); }
      ents.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      out.push(...ents.map((e) => ({ kind: 'entry', lines: e.lines })), ...lead);
      run = [];
    };
    for (const s of segs) { if (s.kind === 'header') { flush(); out.push(s); } else run.push(s); }
    flush(); segs.length = 0; segs.push(...out);
  }
  const res = [];
  for (const s of segs) {
    for (const l of s.lines) {
      if (l == null) continue;
      if (s.kind === 'header' && res.length && res.at(-1) !== '' && l === s.lines[0]) res.push('');
      if (l === '' && s.kind === 'blank' && (res.at(-1) === '' || !res.length)) continue;
      res.push(l);
    }
  }
  while (res.at(-1) === '') res.pop();
  return res.join('\n') + '\n';
}

// ---------- Protobuf formatter ----------
function protoFmt(src, ind) {
  const toks = []; let i = 0, nl = 0;
  const re = /0[xX][\da-fA-F]+|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|-?\.\d+(?:[eE][+-]?\d+)?|[A-Za-z_.][\w.]*/y;
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { nl++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    const push = (t, v) => { toks.push({ t, v, nl }); nl = 0; };
    if (src.startsWith('//', i)) { let j = src.indexOf('\n', i); if (j < 0) j = src.length; push('lc', src.slice(i, j).trimEnd()); i = j; continue; }
    if (src.startsWith('/*', i)) { let j = src.indexOf('*/', i + 2); if (j < 0) throw new Error('Unterminated block comment'); j += 2; const v = src.slice(i, j); push('bc', v); nl += (v.match(/\n/g) || []).length ? 0 : 0; i = j; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; if (src[j] === '\n') throw new Error('Unterminated string'); j++; } if (j >= src.length) throw new Error('Unterminated string'); push('s', src.slice(i, j + 1)); i = j + 1; continue; }
    re.lastIndex = i; const m = re.exec(src);
    if (m) { push('w', m[0]); i = re.lastIndex; continue; }
    push('p', c); i++;
  }
  const out = []; let cur = [], depth = 0, prev = null;
  const pad = () => ind.repeat(depth);
  const flush = () => { if (cur.length) { out.push(pad() + cur.join('')); cur = []; prev = null; } };
  const gap = (nlb) => { if (!cur.length && nlb >= 2 && out.length && out.at(-1) !== '' && !/\{$/.test(out.at(-1))) out.push(''); };
  const add = (tok) => {
    const v = tok.v; let sp = cur.length > 0;
    if (/^[;,)\]>:]$/.test(v) || v === '<') sp = false;
    if (prev && /^[(\[<]$/.test(prev)) sp = false;
    if (v === '(') sp = prev === 'returns' || prev === 'option';
    if (v === '}') sp = false;
    cur.push((sp ? ' ' : '') + v); prev = v;
  };
  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k], v = tk.v;
    if ((tk.t === 'lc' || tk.t === 'bc') && !cur.length && tk.nl === 0 && k > 0 && out.length && out.at(-1) !== '') { out[out.length - 1] += '  ' + v; continue; }
    if (tk.t === 'lc') { if (cur.length && tk.nl === 0) { cur.push('  ' + v); flush(); } else { flush(); gap(tk.nl); out.push(pad() + v); } continue; }
    if (tk.t === 'bc') { if (cur.length && tk.nl === 0) { cur.push(' ' + v); } else { flush(); gap(tk.nl); out.push(pad() + v); } continue; }
    if (!cur.length) gap(tk.nl);
    if (tk.t === 'p' && v === '{') {
      const nx = toks[k + 1];
      if (nx && nx.t === 'p' && nx.v === '}') { cur.push(' {}'); k++; if (toks[k + 1]?.v === ';') k++; flush(); continue; }
      cur.push(cur.length ? ' {' : '{'); flush(); depth++; continue;
    }
    if (tk.t === 'p' && v === '}') { flush(); depth = Math.max(0, depth - 1); cur = ['}']; prev = '}'; if (toks[k + 1]?.v !== ';') flush(); continue; }
    add(tk);
    if (tk.t === 'p' && v === ';') flush();
  }
  flush();
  return out.join('\n') + '\n';
}

// ---------- colour math (OKLCH) ----------
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function parseHex(h) {
  h = String(h).trim().replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(h)) h = [...h].map((c) => c + c).join('');
  if (!/^[\da-f]{6}$/i.test(h)) throw new Error('Enter a hex colour such as #3b82f6');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
function hex2ok(h) {
  const [r, g, b] = parseHex(h).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180 / Math.PI) + 360) % 360];
}
function ok2lin(L, C, H) {
  const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const inGamut = (v) => v.every((x) => x >= -0.0005 && x <= 1.0005);
function fit(L, C, H) { // reduce chroma until the colour fits in sRGB
  let lo = 0, hi = C;
  if (inGamut(ok2lin(L, C, H))) return C;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(ok2lin(L, mid, H))) lo = mid; else hi = mid; }
  return lo;
}
const ok2hex = (L, C, H) => '#' + ok2lin(L, fit(L, C, H), H).map((x) => Math.round(Math.min(1, Math.max(0, gam(Math.max(0, x)))) * 255).toString(16).padStart(2, '0')).join('');
const okStr = (L, C, H, alpha) => `oklch(${rd(L, 3)} ${rd(fit(L, C, H), 3)} ${rd(H, 2)}${alpha ? ` / ${alpha}` : ''})`;
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const STEP_L = [0.97, 0.936, 0.885, 0.808, 0.704, 0.637, 0.577, 0.505, 0.444, 0.396, 0.258];
const STEP_C = [0.1, 0.22, 0.42, 0.68, 0.9, 1, 0.97, 0.82, 0.68, 0.55, 0.38];
function scale(hexIn) {
  const [L, C, H] = hex2ok(hexIn);
  let a = 0; STEP_L.forEach((v, i) => { if (Math.abs(v - L) < Math.abs(STEP_L[a] - L)) a = i; });
  const cMax = C / STEP_C[a]; // chroma at the "peak" step so the anchor reproduces the base colour exactly
  return STEPS.map((s, i) => (i === a ? { s, L, C, H, base: true } : { s, L: STEP_L[i], C: cMax * STEP_C[i], H }));
}

// ---------- CSS helpers ----------
const mulberry = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
function blobPath(n, grow, seed, size) {
  const r = mulberry(seed), c = size / 2, pts = [];
  for (let i = 0; i < n; i++) { const ang = (i / n) * Math.PI * 2, rad = (c * 0.55) + r() * (c * 0.4) * grow / 10 + (c * 0.35) * (1 - grow / 10); pts.push([c + Math.cos(ang) * rad, c + Math.sin(ang) * rad]); }
  // closed Catmull-Rom -> cubic Bezier
  let d = `M${rd(pts[0][0], 1)},${rd(pts[0][1], 1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${rd(p1[0] + (p2[0] - p0[0]) / 6, 1)},${rd(p1[1] + (p2[1] - p0[1]) / 6, 1)} ${rd(p2[0] - (p3[0] - p1[0]) / 6, 1)},${rd(p2[1] - (p3[1] - p1[1]) / 6, 1)} ${rd(p2[0], 1)},${rd(p2[1], 1)}`;
  }
  return d + 'Z';
}
const sc = (l) => (/(: | #)|^[\[\]{}&*!|>'"%@`#-]|:$/.test(l) ? JSON.stringify(l) : l); // YAML plain-scalar guard for script lines
const yb = (v) => (v === 'true' || v === 'false' || /^-?\d+$/.test(v) ? v : yq(v));
const pyRepr = (v, ind = 0) => {
  const p = '    '.repeat(ind + 1), q = '    '.repeat(ind);
  if (v === null) return 'None'; if (v === true) return 'True'; if (v === false) return 'False';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => p + pyRepr(x, ind + 1)).join(',\n')},\n${q}]` : '[]';
  const k = Object.keys(v); return k.length ? `{\n${k.map((x) => `${p}${JSON.stringify(x)}: ${pyRepr(v[x], ind + 1)}`).join(',\n')},\n${q}}` : '{}';
};
const dayISO = new Date().toISOString().slice(0, 10);

const T = [];

// ======================= FORMATTERS =======================
T.push({
  id: 'apache-conf-formatter', cat: 'Formatters+', title: 'Apache Config Formatter', desc: 'Indent httpd.conf / .htaccess sections (<VirtualHost>, <Directory>...), tidy spacing, keep comments.',
  labels: ['Apache config'], opts: [sel('indent', 'Indent', ['2 spaces', '4 spaces', 'tab'], '4 spaces')],
  sample: '<VirtualHost *:80>\nServerName   example.com\n# docs\nDocumentRoot /var/www/html\n<Directory "/var/www/html">\nOptions -Indexes   +FollowSymLinks\nAllowOverride All\n<IfModule mod_rewrite.c>\nRewriteEngine On\nRewriteRule ^(.*)$ /index.php/$1 [L]\n</IfModule>\nRequire all granted\n</Directory>\n\n\nErrorLog ${APACHE_LOG_DIR}/error.log\n</VirtualHost>\n',
  run: ([t], o) => apacheFmt(need(t, 'Paste an Apache config'), o.indent === 'tab' ? '\t' : ' '.repeat(parseInt(o.indent))),
});
T.push({
  id: 'docker-compose-formatter', cat: 'Formatters+', title: 'Docker Compose Formatter', desc: 'Re-indent a compose file consistently (comments kept) and optionally order top-level and service keys the conventional way.',
  labels: ['docker-compose.yml'], opts: [sel('indent', 'Indent', ['2', '4'], '2'), chk('order', 'Reorder keys (image, build, ports, environment, ...)', true)],
  sample: 'version: "3.8"\nservices:\n    web:\n        ports:\n        - "8080:80"\n        # the app\n        image: nginx:alpine\n        environment:\n            - A=1\n        depends_on:\n          - db\n        command: >\n            sh -c "echo hi\n            && nginx"\n    db:\n        image: postgres:16\n        volumes:\n            - data:/var/lib/postgresql/data\nvolumes:\n    data: {}\n',
  run: ([t], o) => {
    need(t, 'Paste a compose file');
    const N = +o.indent; let ls = yamlReindent(t, N);
    if (o.order) ls = composeSort(ls, N);
    return ls.join('\n') + '\n';
  },
});
T.push({
  id: 'toml-formatter', cat: 'Formatters+', title: 'TOML Formatter', desc: 'Normalise "key = value" spacing, blank lines before tables, array indentation; optionally sort keys inside each table.',
  labels: ['TOML'], opts: [chk('sort', 'Sort keys within each table')],
  sample: '# config\ntitle="Demo"\nname   =   "x"\n\n\n[server]\nport=8080\nhost = "0.0.0.0"   # bind\nhosts=[\n"a",\n  "b"\n]\n[database]\nurl = """\nmulti\n  line"""\n[[plugins]]\nname="one"\n[[plugins]]\nname = "two"\n',
  run: ([t], o) => tomlFmt(need(t, 'Paste TOML'), o.sort),
});
T.push({
  id: 'protobuf-formatter', cat: 'Formatters+', title: 'Protobuf Formatter', desc: 'Format .proto files: one statement per line, consistent indentation and spacing; comments are kept.',
  labels: ['.proto'], opts: [sel('indent', 'Indent', ['2 spaces', '4 spaces', 'tab'], '2 spaces')],
  sample: 'syntax="proto3";package demo.v1;import "google/protobuf/timestamp.proto";\n// A user\nmessage User{string name=1;int32 age = 2 [deprecated=true]; // years\nrepeated string tags=3;map<string,int32> scores=4;\nenum Role{UNKNOWN=0;ADMIN=1;}\noneof contact{string email=5;string phone=6;}}\n\nservice Users{rpc Get(GetReq) returns (User);rpc Watch(stream GetReq) returns (stream User){}\n}\nmessage GetReq{string id=1;}',
  run: ([t], o) => protoFmt(need(t, 'Paste a .proto file'), o.indent === 'tab' ? '\t' : ' '.repeat(parseInt(o.indent))),
});

// ======================= DB / SEARCH BUILDERS =======================
T.push({
  id: 'mongodb-aggregate-builder', cat: 'Dev Config+', title: 'MongoDB Aggregation Pipeline Builder', desc: 'Fill in $match, $unwind, $lookup, $group, $sort, $project, $skip, $limit and get a pipeline for mongosh, Node, PyMongo or plain JSON.',
  inputs: 0, sample: '',
  opts: [txt('collection', 'Collection', 'orders'), sel('format', 'Output', ['mongosh', 'Node.js driver', 'PyMongo', 'JSON only']),
    txt('match', '$match (JSON)', '{"status":"paid"}'), txt('unwind', '$unwind field', ''),
    txt('lkFrom', '$lookup from', 'customers'), txt('lkLocal', '$lookup localField', 'customerId'), txt('lkForeign', '$lookup foreignField', '_id'), txt('lkAs', '$lookup as', 'customer'),
    txt('groupBy', '$group by field (blank = none, "null" = all)', 'customerId'), txt('acc', 'Accumulators name:op:field, ...', 'total:sum:amount, orders:count, avg:avg:amount'),
    txt('sort', '$sort (field:1|-1, ...)', 'total:-1'), txt('project', '$project (fields, prefix - to exclude)', ''), num('skip', '$skip', 0), num('limit', '$limit', 10)],
  run: (_, o) => {
    const p = [];
    if (o.match.trim()) { let m; try { m = JSON.parse(o.match); } catch (e) { throw new Error('$match is not valid JSON: ' + e.message); } p.push({ $match: m }); }
    const ref = (f) => (f.startsWith('$') ? f : '$' + f);
    if (o.unwind.trim()) p.push({ $unwind: ref(o.unwind.trim()) });
    if (o.lkAs.trim() && o.lkFrom.trim()) p.push({ $lookup: { from: o.lkFrom.trim(), localField: o.lkLocal.trim(), foreignField: o.lkForeign.trim(), as: o.lkAs.trim() } });
    if (o.groupBy.trim()) {
      const g = { _id: o.groupBy.trim() === 'null' ? null : ref(o.groupBy.trim()) };
      for (const a of csv(o.acc)) {
        const [n, op, f] = a.split(':').map((x) => x.trim());
        if (!n || !op) throw new Error(`Bad accumulator "${a}" (use name:op:field)`);
        if (op === 'count') g[n] = { $sum: 1 };
        else if (['sum', 'avg', 'min', 'max', 'first', 'last', 'push', 'addToSet'].includes(op)) { if (!f) throw new Error(`Accumulator "${n}" needs a field`); g[n] = { ['$' + op]: ref(f) }; }
        else throw new Error(`Unknown accumulator op "${op}"`);
      }
      p.push({ $group: g });
    }
    if (o.sort.trim()) { const s = {}; for (const x of csv(o.sort)) { const [f, d] = x.split(':'); s[f.trim()] = d && d.trim() === '-1' ? -1 : 1; } p.push({ $sort: s }); }
    if (o.project.trim()) { const pr = {}; for (const f of csv(o.project)) { if (f.startsWith('-')) pr[f.slice(1)] = 0; else pr[f] = 1; } p.push({ $project: pr }); }
    if (+o.skip > 0) p.push({ $skip: Math.floor(+o.skip) });
    if (+o.limit > 0) p.push({ $limit: Math.floor(+o.limit) });
    if (!p.length) throw new Error('Add at least one stage');
    const j = JSON.stringify(p, null, 2), c = o.collection.trim() || 'collection';
    return { 'mongosh': `db.${/^[A-Za-z_]\w*$/.test(c) ? c : `getCollection(${JSON.stringify(c)})`}.aggregate(${j})`, 'Node.js driver': `const cursor = db.collection(${JSON.stringify(c)}).aggregate(${j});\nconst docs = await cursor.toArray();`, 'PyMongo': `docs = list(db[${JSON.stringify(c)}].aggregate(${pyRepr(p)}))`, 'JSON only': j }[o.format];
  },
});

const CH_TYPES = { string: 'String', int: 'Int32', int8: 'Int8', int16: 'Int16', int32: 'Int32', int64: 'Int64', bigint: 'Int64', uint8: 'UInt8', uint16: 'UInt16', uint32: 'UInt32', uint64: 'UInt64', float: 'Float64', float32: 'Float32', float64: 'Float64', double: 'Float64', bool: 'Bool', boolean: 'Bool', date: 'Date', date32: 'Date32', datetime: 'DateTime', timestamp: 'DateTime', datetime64: 'DateTime64(3)', uuid: 'UUID', ipv4: 'IPv4', ipv6: 'IPv6', json: 'JSON' };
T.push({
  id: 'clickhouse-ddl-generator', cat: 'Dev Config+', title: 'ClickHouse CREATE TABLE Generator', desc: 'Column list to ClickHouse DDL: MergeTree family engines, ORDER BY, PARTITION BY, TTL, settings, Nullable via "?".',
  labels: ['Columns: name type [DEFAULT/CODEC...] [-- comment] (type? = Nullable)'],
  sample: 'id UInt64\nts DateTime CODEC(Delta, ZSTD)\nuser_id uint32\ncountry string -- ISO country\nreferrer string? DEFAULT \'\'\namount float64',
  opts: [txt('table', 'Table (db.table)', 'analytics.events'), sel('engine', 'Engine', ['MergeTree', 'ReplacingMergeTree', 'SummingMergeTree', 'AggregatingMergeTree', 'CollapsingMergeTree', 'ReplicatedMergeTree', 'Log', 'TinyLog', 'Memory']),
    txt('engineArg', 'Engine argument (ver / sign column)', ''), txt('order', 'ORDER BY (blank = first column)', ''), txt('partition', 'PARTITION BY', 'toYYYYMM(ts)'), txt('ttl', 'TTL expression', 'ts + INTERVAL 90 DAY'),
    num('gran', 'index_granularity', 8192), txt('cluster', 'ON CLUSTER (name)', ''), chk('ine', 'IF NOT EXISTS', true)],
  run: ([t], o) => {
    const cols = lines(t).map((l) => {
      let comment = ''; const ci = l.indexOf('--'); if (ci >= 0) { comment = l.slice(ci + 2).trim(); l = l.slice(0, ci).trim(); }
      const m = l.match(/^(\S+)\s+(\S+)\s*(.*)$/); if (!m) throw new Error(`Column "${l}" needs "name type"`);
      let ty = m[2], nullable = false; if (ty.endsWith('?')) { nullable = true; ty = ty.slice(0, -1); }
      ty = CH_TYPES[ty.toLowerCase()] ?? ty; if (nullable) ty = `Nullable(${ty})`;
      return { name: m[1], line: `    \`${m[1]}\` ${ty}${m[3] ? ' ' + m[3] : ''}${comment ? ` COMMENT '${comment.replace(/'/g, "\\'")}'` : ''}` };
    });
    if (!cols.length) throw new Error('Add at least one column');
    const e = o.engine, merge = /MergeTree$/.test(e);
    const arg = o.engineArg.trim();
    if (e === 'CollapsingMergeTree' && !arg) throw new Error('CollapsingMergeTree needs the sign column as engine argument');
    const eng = e === 'ReplicatedMergeTree' ? `ReplicatedMergeTree('/clickhouse/tables/{shard}/{database}/{table}', '{replica}')` : arg && /^(Replacing|Summing|Collapsing)MergeTree$/.test(e) ? `${e}(${arg})` : e;
    const out = [`CREATE TABLE ${o.ine ? 'IF NOT EXISTS ' : ''}${o.table.trim() || 'my_table'}${o.cluster.trim() ? ` ON CLUSTER ${o.cluster.trim()}` : ''}`, '(', cols.map((c) => c.line).join(',\n'), ')', `ENGINE = ${eng}`];
    if (merge) {
      if (o.partition.trim()) out.push(`PARTITION BY ${o.partition.trim()}`);
      const ord = o.order.trim() || cols[0].name; out.push(`ORDER BY ${ord.includes(',') && !ord.startsWith('(') ? `(${ord})` : ord}`);
      if (o.ttl.trim()) out.push(`TTL ${o.ttl.trim()}`);
      out.push(`SETTINGS index_granularity = ${Math.floor(+o.gran) || 8192}`);
    }
    return out.join('\n') + ';\n';
  },
});

T.push({
  id: 'elasticsearch-query-builder', cat: 'Dev Config+', title: 'Elasticsearch Query DSL Builder', desc: 'Write bool-query clauses one per line and get the JSON body plus a curl command.',
  labels: ['Clauses: occur type field value  (occur = must|filter|should|must_not)'],
  sample: 'must match title quick brown fox\nfilter term status published\nfilter range price gte=10 lte=100\nfilter terms tags news,tech\nshould match_phrase body "lazy dog"\nmust_not exists deleted_at\nmust multi_match title,body search text',
  opts: [txt('index', 'Index', 'articles'), num('size', 'size', 10), num('from', 'from', 0), txt('sort', 'Sort (field:asc|desc, ...)', 'published_at:desc'), txt('source', '_source includes', 'title,status,price'), txt('agg', 'Terms aggregation on field', 'tags'), sel('hl', 'Highlight field', ['none', 'title', 'body']), chk('total', 'track_total_hits', true)],
  run: ([t], o) => {
    const val = (v) => { v = v.trim().replace(/^"(.*)"$/, '$1'); return v === 'true' ? true : v === 'false' ? false : v !== '' && !isNaN(Number(v)) ? Number(v) : v; };
    const bool = {};
    for (const l of lines(t)) {
      const m = l.match(/^(must_not|must|filter|should)\s+(\w+)\s+(\S+)\s*(.*)$/) || l.match(/^(must_not|must|filter|should)\s+(exists)\s+(\S+)()$/);
      if (!m) throw new Error(`Cannot parse "${l}" (expected: occur type field value)`);
      const [, occ, ty, f, rest] = m; let c;
      if (['match', 'match_phrase', 'prefix', 'wildcard', 'fuzzy'].includes(ty)) c = { [ty]: { [f]: ty === 'match' || ty === 'match_phrase' ? rest.trim().replace(/^"(.*)"$/, '$1') : val(rest) } };
      else if (ty === 'term') c = { term: { [f]: val(rest) } };
      else if (ty === 'terms') c = { terms: { [f]: csv(rest).map(val) } };
      else if (ty === 'exists') c = { exists: { field: f } };
      else if (ty === 'range') { const r = {}; for (const kv of rest.split(/\s+/).filter(Boolean)) { const [k, v] = kv.split('='); if (!['gt', 'gte', 'lt', 'lte', 'format', 'time_zone'].includes(k) || v == null) throw new Error(`Bad range part "${kv}" (use gte=10 lte=20)`); r[k] = val(v); } c = { range: { [f]: r } }; }
      else if (ty === 'multi_match') c = { multi_match: { query: rest.trim(), fields: csv(f) } };
      else throw new Error(`Unsupported clause type "${ty}"`);
      (bool[occ] ||= []).push(c);
    }
    const body = { query: Object.keys(bool).length ? { bool } : { match_all: {} } };
    if (o.total) body.track_total_hits = true;
    if (+o.size >= 0) body.size = Math.floor(+o.size);
    if (+o.from > 0) body.from = Math.floor(+o.from);
    if (o.sort.trim()) body.sort = csv(o.sort).map((s) => { const [f, d] = s.split(':'); return { [f.trim()]: { order: d && d.trim() === 'desc' ? 'desc' : 'asc' } }; });
    if (o.source.trim()) body._source = csv(o.source);
    if (o.agg.trim()) body.aggs = { [`by_${o.agg.trim().replace(/\W+/g, '_')}`]: { terms: { field: o.agg.trim(), size: 10 } } };
    if (o.hl !== 'none') body.highlight = { fields: { [o.hl]: {} } };
    const j = JSON.stringify(body, null, 2);
    return `GET /${o.index.trim() || '_all'}/_search\n${j}\n\n# curl\ncurl -X GET ${shq(`http://localhost:9200/${o.index.trim() || '_all'}/_search`)} -H 'Content-Type: application/json' -d ${shq(JSON.stringify(body))}`;
  },
});

T.push({
  id: 'react-hook-form-generator', cat: 'Dev Config+', title: 'React Hook Form Generator', desc: 'Turn a field list into a typed React Hook Form component with validation rules (optionally Zod).',
  labels: ['Fields: name type [required] [min=] [max=] [minLength=] [maxLength=] [pattern=] [options=a|b|c]'],
  sample: 'fullName text required minLength=2\nemail email required\nage number min=18 max=120\nplan select required options=free|pro|team\nbio textarea maxLength=200\nterms checkbox required',
  opts: [txt('name', 'Component name', 'SignupForm'), chk('ts', 'TypeScript', true), chk('zod', 'Zod resolver (@hookform/resolvers/zod)')],
  run: ([t], o) => {
    const f = lines(t).map((l) => {
      const [name, type = 'text', ...rest] = l.split(/\s+/); if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new Error(`Invalid field name "${name}"`);
      if (!['text', 'email', 'password', 'number', 'tel', 'url', 'date', 'textarea', 'checkbox', 'select'].includes(type)) throw new Error(`Unknown type "${type}"`);
      const r = { name, type, rules: {} };
      for (const x of rest) { if (x === 'required') r.rules.required = true; else { const i = x.indexOf('='); if (i < 1) throw new Error(`Bad option "${x}"`); const k = x.slice(0, i), v = x.slice(i + 1); if (k === 'options') r.options = v.split('|'); else if (['min', 'max', 'minLength', 'maxLength'].includes(k)) r.rules[k] = Number(v); else if (k === 'pattern') r.rules.pattern = v; else throw new Error(`Unknown option "${k}"`); } }
      if (type === 'select' && !r.options) throw new Error(`Field "${name}": select needs options=a|b`);
      return r;
    });
    if (!f.length) throw new Error('Add at least one field');
    const label = (n) => n.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()), ts = o.ts, C = o.name.trim() || 'MyForm';
    const tsType = (x) => (x.type === 'number' ? 'number' : x.type === 'checkbox' ? 'boolean' : 'string');
    const L = [`import { useForm${ts ? ', type SubmitHandler' : ''} } from 'react-hook-form';`];
    if (o.zod) L.push("import { z } from 'zod';", "import { zodResolver } from '@hookform/resolvers/zod';");
    L.push('');
    if (o.zod) {
      L.push('const schema = z.object({');
      for (const x of f) {
        let z = x.type === 'number' ? 'z.coerce.number()' : x.type === 'checkbox' ? 'z.boolean()' : x.type === 'email' ? 'z.string().email()' : x.type === 'url' ? 'z.string().url()' : x.type === 'select' ? `z.enum([${x.options.map((v) => JSON.stringify(v)).join(', ')}])` : 'z.string()';
        const r = x.rules;
        if (r.min != null) z += `.min(${r.min})`; if (r.max != null) z += `.max(${r.max})`;
        if (r.minLength != null) z += `.min(${r.minLength})`; if (r.maxLength != null) z += `.max(${r.maxLength})`;
        if (r.pattern) z += `.regex(new RegExp(${JSON.stringify(r.pattern)}))`;
        if (x.type === 'checkbox' && r.required) z += '.refine((v) => v, { message: "Required" })';
        else if (x.type === 'text' || x.type === 'textarea' || x.type === 'password' || x.type === 'tel') { if (r.required && r.minLength == null) z += '.min(1, "Required")'; if (!r.required) z += '.optional()'; }
        else if (!r.required && x.type !== 'checkbox') z += '.optional()';
        L.push(`  ${x.name}: ${z},`);
      }
      L.push('});', '');
      if (ts) L.push('type FormValues = z.infer<typeof schema>;', '');
    } else if (ts) { L.push('type FormValues = {', ...f.map((x) => `  ${x.name}${x.rules.required ? '' : '?'}: ${x.type === 'select' ? x.options.map((v) => JSON.stringify(v)).join(' | ') : tsType(x)};`), '};', ''); }
    L.push(`export default function ${C}() {`, `  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm${ts ? '<FormValues>' : ''}(${o.zod ? '{ resolver: zodResolver(schema) }' : ''});`, `  const onSubmit${ts ? ': SubmitHandler<FormValues>' : ''} = async (data) => {`, '    console.log(data); // send to your API', '  };', '', '  return (', '    <form onSubmit={handleSubmit(onSubmit)} noValidate>');
    for (const x of f) {
      const r = x.rules, opts = [];
      if (!o.zod) {
        if (r.required) opts.push(`required: ${JSON.stringify(`${label(x.name)} is required`)}`);
        if (r.min != null) opts.push(`min: { value: ${r.min}, message: ${JSON.stringify(`Minimum is ${r.min}`)} }`);
        if (r.max != null) opts.push(`max: { value: ${r.max}, message: ${JSON.stringify(`Maximum is ${r.max}`)} }`);
        if (r.minLength != null) opts.push(`minLength: { value: ${r.minLength}, message: ${JSON.stringify(`At least ${r.minLength} characters`)} }`);
        if (r.maxLength != null) opts.push(`maxLength: { value: ${r.maxLength}, message: ${JSON.stringify(`At most ${r.maxLength} characters`)} }`);
        if (r.pattern) opts.push(`pattern: { value: new RegExp(${JSON.stringify(r.pattern)}), message: "Invalid format" }`);
      }
      if (x.type === 'number' && !o.zod) opts.push('valueAsNumber: true');
      const reg = `{...register(${JSON.stringify(x.name)}${opts.length ? `, { ${opts.join(', ')} }` : ''})}`;
      const id = x.name;
      L.push('      <div>');
      if (x.type === 'checkbox') L.push(`        <label><input type="checkbox" ${reg} /> ${label(x.name)}</label>`);
      else {
        L.push(`        <label htmlFor="${id}">${label(x.name)}</label>`);
        if (x.type === 'textarea') L.push(`        <textarea id="${id}" ${reg} />`);
        else if (x.type === 'select') L.push(`        <select id="${id}" ${reg}>`, ...x.options.map((v) => `          <option value=${JSON.stringify(v)}>${label(v)}</option>`), '        </select>');
        else L.push(`        <input id="${id}" type="${x.type}" ${reg} />`);
      }
      L.push(`        {errors.${id} && <p role="alert">{errors.${id}.message}</p>}`, '      </div>');
    }
    L.push('      <button type="submit" disabled={isSubmitting}>Submit</button>', '    </form>', '  );', '}');
    return L.join('\n') + '\n';
  },
});

// ======================= CI/CD =======================
T.push({
  id: 'gitlab-ci-generator', cat: 'Dev Config+', title: 'GitLab CI Generator', desc: 'Generate a .gitlab-ci.yml (lint, test, build, deploy) for Node, Python, Go, Maven, Ruby, PHP or Docker builds, with caching and merge-request pipelines.',
  inputs: 0, sample: '',
  opts: [sel('stack', 'Stack', ['node', 'python', 'go', 'java-maven', 'ruby', 'php', 'docker-build']), txt('ver', 'Version / tag', '22'),
    chk('lint', 'Lint stage', true), chk('test', 'Test stage', true), chk('build', 'Build stage', true), sel('deploy', 'Deploy job', ['none', 'GitLab Pages', 'manual to production', 'auto on default branch']),
    txt('out', 'Build output dir', 'dist'), chk('cache', 'Cache dependencies', true), chk('mr', 'Merge-request pipelines (workflow rules)', true)],
  run: (_, o) => {
    const v = o.ver.trim() || 'latest', s = o.stack, L = [];
    const P = {
      node: { image: `node:${v}`, pre: ['npm ci --cache .npm --prefer-offline'], lint: 'npm run lint', test: 'npm test', build: 'npm run build', cache: ['.npm/'] },
      python: { image: `python:${v}`, vars: { PIP_CACHE_DIR: '$CI_PROJECT_DIR/.cache/pip' }, pre: ['pip install -r requirements.txt'], lint: 'pip install ruff && ruff check .', test: 'pip install pytest && pytest', build: 'pip install build && python -m build', cache: ['.cache/pip'] },
      go: { image: `golang:${v}`, vars: { GOPATH: '$CI_PROJECT_DIR/.go' }, pre: [], lint: 'go vet ./...', test: 'go test ./...', build: 'go build -o bin/app .', cache: ['.go/pkg/mod/'] },
      'java-maven': { image: `maven:3.9-eclipse-temurin-${v}`, vars: { MAVEN_OPTS: '-Dmaven.repo.local=$CI_PROJECT_DIR/.m2/repository' }, pre: [], lint: null, test: 'mvn -B test', build: 'mvn -B package -DskipTests', cache: ['.m2/repository/'] },
      ruby: { image: `ruby:${v}`, vars: { BUNDLE_PATH: 'vendor/bundle' }, pre: ['bundle install --jobs 4'], lint: 'bundle exec rubocop', test: 'bundle exec rspec', build: null, cache: ['vendor/bundle/'] },
      php: { image: `php:${v}-cli`, pre: ['apt-get update -yqq && apt-get install -yqq git unzip', 'curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer', 'composer install --no-interaction --prefer-dist'], lint: 'composer validate --strict', test: 'vendor/bin/phpunit', build: null, cache: ['vendor/'] },
      'docker-build': { image: 'docker:27', vars: { DOCKER_TLS_CERTDIR: '/certs' }, services: ['docker:27-dind'], pre: [], lint: null, test: null, build: 'docker build -t "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA" .', cache: [] },
    }[s];
    const stages = [];
    if (o.lint && P.lint) stages.push('lint'); if (o.test && P.test) stages.push('test'); if (o.build && P.build) stages.push('build'); if (o.deploy !== 'none') stages.push('deploy');
    if (!stages.length) throw new Error('Nothing to generate for this selection');
    if (o.mr) L.push('workflow:', '  rules:', '    - if: $CI_PIPELINE_SOURCE == "merge_request_event"', '    - if: $CI_COMMIT_BRANCH && $CI_OPEN_MERGE_REQUESTS', '      when: never', '    - if: $CI_COMMIT_BRANCH', '');
    L.push('stages:', ...stages.map((x) => `  - ${x}`), '', 'default:', `  image: ${sc(P.image)}`);
    if (P.services) L.push('  services:', ...P.services.map((x) => `    - ${x}`));
    if (o.cache && P.cache.length) L.push('  cache:', '    key:', '      files:', `        - ${{ node: 'package-lock.json', python: 'requirements.txt', go: 'go.sum', 'java-maven': 'pom.xml', ruby: 'Gemfile.lock', php: 'composer.lock' }[s] || 'Dockerfile'}`, '    paths:', ...P.cache.map((x) => `      - ${x}`));
    if (P.vars) L.push('', 'variables:', ...Object.entries(P.vars).map(([k, x]) => `  ${k}: ${sc(x)}`));
    const job = (name, stage, cmd, extra = []) => { L.push('', `${name}:`, `  stage: ${stage}`); if (s === 'docker-build' && stage === 'build') L.push('  before_script:', '    - echo "$CI_REGISTRY_PASSWORD" | docker login -u "$CI_REGISTRY_USER" --password-stdin "$CI_REGISTRY"'); else if (P.pre.length) L.push('  before_script:', ...P.pre.map((x) => `    - ${sc(x)}`)); L.push('  script:', ...(Array.isArray(cmd) ? cmd : [cmd]).map((x) => `    - ${sc(x)}`), ...extra); };
    if (stages.includes('lint')) job('lint', 'lint', P.lint);
    if (stages.includes('test')) job('test', 'test', P.test, ['  coverage: /(?:Total|TOTAL|coverage)[^\\n]*?(\\d+(?:\\.\\d+)?)%/']);
    if (stages.includes('build')) job('build', 'build', s === 'docker-build' ? [P.build, 'docker push "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA"'] : P.build, s === 'docker-build' ? [] : ['  artifacts:', '    expire_in: 1 week', '    paths:', `      - ${s === 'java-maven' ? 'target/*.jar' : s === 'go' ? 'bin/' : o.out.trim() || 'dist'}${s === 'node' || s === 'python' ? '/' : ''}`]);
    if (o.deploy === 'GitLab Pages') { const d = (o.out.trim() || 'dist').replace(/\/$/, ''); L.push('', 'pages:', '  stage: deploy', '  script:', '    - mkdir -p public', `    - cp -r ${d}/. public/`, '  artifacts:', '    paths:', '      - public', '  rules:', '    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'); }
    else if (o.deploy !== 'none') L.push('', 'deploy_production:', '  stage: deploy', '  script:', '    - echo "Deploying $CI_COMMIT_SHORT_SHA"  # replace with your deploy command', '  environment:', '    name: production', '  rules:', '    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH', ...(o.deploy.startsWith('manual') ? ['      when: manual'] : []));
    return L.join('\n') + '\n';
  },
});

const MATRIX_SETUP = {
  node: { key: 'node', use: 'actions/setup-node@v4', w: 'node-version', install: 'npm ci', test: 'npm test' },
  python: { key: 'python', use: 'actions/setup-python@v5', w: 'python-version', install: 'pip install -r requirements.txt', test: 'pytest' },
  go: { key: 'go', use: 'actions/setup-go@v5', w: 'go-version', install: 'go mod download', test: 'go test ./...' },
  java: { key: 'java', use: 'actions/setup-java@v4', w: 'java-version', extra: ['distribution: temurin'], install: '', test: 'mvn -B verify' },
  ruby: { key: 'ruby', use: 'ruby/setup-ruby@v1', w: 'ruby-version', extra: ['bundler-cache: true'], install: '', test: 'bundle exec rake' },
  dotnet: { key: 'dotnet', use: 'actions/setup-dotnet@v4', w: 'dotnet-version', install: 'dotnet restore', test: 'dotnet test --no-restore' },
  none: { key: 'version', install: '', test: 'echo "tests here"' },
};
T.push({
  id: 'github-actions-matrix-builder', cat: 'Dev Config+', title: 'GitHub Actions Matrix Builder', desc: 'Describe matrix dimensions (os, node, python...) with include/exclude rows and get a ready workflow with strategy.matrix.',
  labels: ['Dimensions (name: v1, v2) plus "include k=v k=v" / "exclude k=v k=v" lines'],
  sample: 'os: ubuntu-latest, windows-latest, macos-latest\nnode: 20, 22\nexclude os=macos-latest node=20\ninclude os=ubuntu-latest node=24 experimental=true',
  opts: [sel('lang', 'Setup action', Object.keys(MATRIX_SETUP)), txt('install', 'Install command (blank = default)', ''), txt('test', 'Test command (blank = default)', ''), chk('failfast', 'fail-fast', false), num('par', 'max-parallel (0 = unlimited)', 0), txt('branch', 'Branch', 'main')],
  run: ([t], o) => {
    const dims = [], inc = [], exc = [];
    for (const l of lines(t)) {
      const m = l.match(/^(include|exclude)\s+(.*)$/);
      if (m) { const row = {}; for (const kv of m[2].split(/\s+/)) { const i = kv.indexOf('='); if (i < 1) throw new Error(`Bad ${m[1]} entry "${kv}" (use key=value)`); row[kv.slice(0, i)] = kv.slice(i + 1); } (m[1] === 'include' ? inc : exc).push(row); continue; }
      const i = l.indexOf(':'); if (i < 1) throw new Error(`Bad dimension "${l}" (use name: a, b)`);
      const vals = csv(l.slice(i + 1)); if (!vals.length) throw new Error(`Dimension "${l.slice(0, i)}" has no values`);
      dims.push([l.slice(0, i).trim(), vals]);
    }
    if (!dims.length) throw new Error('Add at least one dimension');
    const S = MATRIX_SETUP[o.lang], hasOs = dims.some(([k]) => k === 'os'), verKey = S.key;
    const hasVer = dims.some(([k]) => k === verKey);
    const L = ['name: CI', 'on:', '  push:', `    branches: [${yq(o.branch || 'main')}]`, '  pull_request:', '', 'jobs:', '  test:', `    runs-on: ${hasOs ? '${{ matrix.os }}' : 'ubuntu-latest'}`];
    if (inc.some((r) => 'experimental' in r)) L.push('    continue-on-error: ${{ matrix.experimental == true }}');
    L.push('    strategy:', `      fail-fast: ${o.failfast}`);
    if (+o.par > 0) L.push(`      max-parallel: ${Math.floor(+o.par)}`);
    L.push('      matrix:', ...dims.map(([k, v]) => `        ${k}: [${v.map(yb).join(', ')}]`));
    const rows = (name, rs) => { if (rs.length) L.push(`        ${name}:`, ...rs.flatMap((r) => Object.entries(r).map(([k, v], i) => `          ${i ? '  ' : '- '}${k}: ${yb(v)}`))); };
    rows('include', inc); rows('exclude', exc);
    L.push('    steps:', '      - uses: actions/checkout@v4');
    if (S.use) {
      if (hasVer) L.push(`      - uses: ${S.use}`, '        with:', `          ${S.w}: \${{ matrix.${verKey} }}`, ...(S.extra || []).map((x) => `          ${x}`));
      else L.push(`      - uses: ${S.use}`, ...(S.extra ? ['        with:', ...S.extra.map((x) => `          ${x}`)] : []));
    }
    const inst = o.install.trim() || S.install, tst = o.test.trim() || S.test;
    if (inst) L.push(`      - run: ${sc(inst)}`);
    L.push(`      - run: ${sc(tst)}`);
    return L.join('\n') + '\n';
  },
});

// ======================= KUBERNETES =======================
const k8sLabels = (n, ind) => [`${ind}app.kubernetes.io/name: ${yq(n)}`];
T.push({
  id: 'kubernetes-deployment-generator', cat: 'Infra', title: 'Kubernetes Deployment Generator', desc: 'Deployment with probes, resources, hardened securityContext, plus optional Service, HPA and Ingress in one multi-document YAML.',
  inputs: 1, labels: ['Environment variables (KEY=VALUE per line)'], sample: 'LOG_LEVEL=info\nPORT=8080',
  opts: [txt('name', 'App name', 'web'), txt('ns', 'Namespace (blank = default)', 'production'), txt('image', 'Image', 'ghcr.io/acme/web:1.0.0'), num('replicas', 'Replicas', 3), num('port', 'Container port', 8080),
    txt('cpuReq', 'CPU request', '100m'), txt('memReq', 'Memory request', '128Mi'), txt('cpuLim', 'CPU limit (blank = none)', ''), txt('memLim', 'Memory limit', '256Mi'),
    txt('probe', 'HTTP probe path (blank = none)', '/healthz'), chk('harden', 'Hardened securityContext', true), sel('svc', 'Service', ['ClusterIP', 'NodePort', 'LoadBalancer', 'none']), num('svcPort', 'Service port', 80),
    chk('hpa', 'HorizontalPodAutoscaler'), num('hpaMax', 'HPA max replicas', 10), num('cpuTarget', 'HPA CPU target %', 70), txt('host', 'Ingress host (blank = none)', '')],
  run: ([t], o) => {
    const n = need(o.name, 'App name required').trim(); if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(n)) throw new Error('App name must be a lowercase DNS label (a-z, 0-9, -)');
    const ns = o.ns.trim(), meta = (ind = '  ') => [`${ind}name: ${n}`, ...(ns ? [`${ind}namespace: ${yq(ns)}`] : []), `${ind}labels:`, ...k8sLabels(n, ind + '  ')];
    const env = kvLines(t), L = ['apiVersion: apps/v1', 'kind: Deployment', 'metadata:', ...meta(), 'spec:', `  replicas: ${Math.floor(+o.replicas) || 1}`, '  selector:', '    matchLabels:', ...k8sLabels(n, '      '), '  template:', '    metadata:', '      labels:', ...k8sLabels(n, '        '), '    spec:', '      containers:', `        - name: ${n}`, `          image: ${yq(o.image)}`, '          imagePullPolicy: IfNotPresent', '          ports:', '            - name: http', `              containerPort: ${Math.floor(+o.port)}`];
    if (env.length) L.push('          env:', ...env.flatMap(([k, v]) => [`            - name: ${k}`, `              value: ${JSON.stringify(v)}`]));
    L.push('          resources:', '            requests:', `              cpu: ${yq(o.cpuReq || '100m')}`, `              memory: ${yq(o.memReq || '128Mi')}`);
    if (o.cpuLim.trim() || o.memLim.trim()) L.push('            limits:', ...(o.cpuLim.trim() ? [`              cpu: ${yq(o.cpuLim.trim())}`] : []), ...(o.memLim.trim() ? [`              memory: ${yq(o.memLim.trim())}`] : []));
    if (o.probe.trim()) L.push('          readinessProbe:', '            httpGet:', `              path: ${yq(o.probe.trim())}`, '              port: http', '            initialDelaySeconds: 5', '            periodSeconds: 10', '          livenessProbe:', '            httpGet:', `              path: ${yq(o.probe.trim())}`, '              port: http', '            initialDelaySeconds: 15', '            periodSeconds: 20');
    if (o.harden) L.push('          securityContext:', '            allowPrivilegeEscalation: false', '            readOnlyRootFilesystem: true', '            runAsNonRoot: true', '            capabilities:', '              drop: ["ALL"]', '      securityContext:', '        seccompProfile:', '          type: RuntimeDefault');
    if (o.svc !== 'none') L.push('---', 'apiVersion: v1', 'kind: Service', 'metadata:', ...meta(), 'spec:', `  type: ${o.svc}`, '  selector:', ...k8sLabels(n, '    '), '  ports:', '    - name: http', `      port: ${Math.floor(+o.svcPort) || 80}`, '      targetPort: http');
    if (o.hpa) L.push('---', 'apiVersion: autoscaling/v2', 'kind: HorizontalPodAutoscaler', 'metadata:', ...meta(), 'spec:', '  scaleTargetRef:', '    apiVersion: apps/v1', '    kind: Deployment', `    name: ${n}`, `  minReplicas: ${Math.floor(+o.replicas) || 1}`, `  maxReplicas: ${Math.max(Math.floor(+o.hpaMax) || 10, Math.floor(+o.replicas) || 1)}`, '  metrics:', '    - type: Resource', '      resource:', '        name: cpu', '        target:', '          type: Utilization', `          averageUtilization: ${Math.floor(+o.cpuTarget) || 70}`);
    if (o.host.trim()) { if (o.svc === 'none') throw new Error('Ingress needs a Service'); L.push('---', 'apiVersion: networking.k8s.io/v1', 'kind: Ingress', 'metadata:', ...meta(), 'spec:', '  rules:', `    - host: ${yq(o.host.trim())}`, '      http:', '        paths:', '          - path: /', '            pathType: Prefix', '            backend:', '              service:', `                name: ${n}`, '                port:', '                  name: http'); }
    return L.join('\n') + '\n';
  },
});

T.push({
  id: 'kubernetes-ingress-generator', cat: 'Infra', title: 'Kubernetes Ingress Generator', desc: 'Ingress (networking.k8s.io/v1) from host/path/service lines, with TLS, ingress class and common nginx / cert-manager annotations.',
  labels: ['Rules: host path service:port [Prefix|Exact|ImplementationSpecific]'], sample: 'app.example.com / web:80\napp.example.com /api api:8080 Prefix\napi.example.com / api:8080',
  opts: [txt('name', 'Ingress name', 'web-ingress'), txt('ns', 'Namespace (blank = default)', ''), txt('cls', 'ingressClassName (blank = none)', 'nginx'), txt('tls', 'TLS secret name (blank = no TLS)', 'web-tls'), txt('issuer', 'cert-manager ClusterIssuer (blank = none)', 'letsencrypt-prod'),
    chk('ssl', 'nginx: force SSL redirect', true), txt('body', 'nginx: proxy-body-size (e.g. 20m)', ''), chk('rewrite', 'nginx: rewrite-target /$1 (use regex paths)', false)],
  run: ([t], o) => {
    const rules = new Map();
    for (const l of lines(t)) {
      const [host, path, be, pt = 'Prefix'] = l.split(/\s+/);
      const m = (be || '').match(/^([a-z0-9-]+):(\d+|[a-z0-9-]+)$/); if (!host || !path || !m) throw new Error(`Bad rule "${l}" (use: host /path service:port)`);
      if (!path.startsWith('/')) throw new Error(`Path "${path}" must start with /`); if (!['Prefix', 'Exact', 'ImplementationSpecific'].includes(pt)) throw new Error(`Bad pathType "${pt}"`);
      if (!rules.has(host)) rules.set(host, []); rules.get(host).push({ path, m, pt });
    }
    if (!rules.size) throw new Error('Add at least one rule');
    const ann = [];
    if (o.issuer.trim()) ann.push(`cert-manager.io/cluster-issuer: ${yq(o.issuer.trim())}`);
    if (o.cls.trim() === 'nginx') { if (o.ssl) ann.push('nginx.ingress.kubernetes.io/ssl-redirect: "true"'); if (o.body.trim()) ann.push(`nginx.ingress.kubernetes.io/proxy-body-size: ${yq(o.body.trim())}`); if (o.rewrite) ann.push('nginx.ingress.kubernetes.io/rewrite-target: /$1'); }
    const L = ['apiVersion: networking.k8s.io/v1', 'kind: Ingress', 'metadata:', `  name: ${yq(o.name.trim() || 'ingress')}`, ...(o.ns.trim() ? [`  namespace: ${yq(o.ns.trim())}`] : [])];
    if (ann.length) L.push('  annotations:', ...ann.map((a) => `    ${a}`));
    L.push('spec:'); if (o.cls.trim()) L.push(`  ingressClassName: ${yq(o.cls.trim())}`);
    if (o.tls.trim()) L.push('  tls:', '    - hosts:', ...[...rules.keys()].map((h) => `        - ${yq(h)}`), `      secretName: ${yq(o.tls.trim())}`);
    L.push('  rules:');
    for (const [h, rs] of rules) { L.push(`    - host: ${yq(h)}`, '      http:', '        paths:'); for (const r of rs) L.push(`          - path: ${yq(r.path)}`, `            pathType: ${r.pt}`, '            backend:', '              service:', `                name: ${r.m[1]}`, '                port:', `                  ${/^\d+$/.test(r.m[2]) ? 'number' : 'name'}: ${r.m[2]}`); }
    return L.join('\n') + '\n';
  },
});

T.push({
  id: 'kubernetes-configmap-secret-builder', cat: 'Infra', title: 'Kubernetes ConfigMap / Secret Builder', desc: 'Turn KEY=VALUE lines (.env) into a ConfigMap or Secret manifest; Secrets can use stringData or base64 data.',
  labels: ['KEY=VALUE per line'], sample: 'DATABASE_URL=postgres://user:pass@db:5432/app\nLOG_LEVEL=info\nFEATURE_X=true',
  opts: [sel('kind', 'Kind', ['ConfigMap', 'Secret']), txt('name', 'Name', 'app-config'), txt('ns', 'Namespace (blank = default)', ''), sel('enc', 'Secret encoding', ['stringData', 'base64 data']), chk('immutable', 'immutable: true')],
  run: ([t], o) => {
    const kv = kvLines(t); if (!kv.length) throw new Error('Add KEY=VALUE lines');
    for (const [k] of kv) if (!/^[-._a-zA-Z0-9]+$/.test(k)) throw new Error(`Invalid key "${k}"`);
    const sec = o.kind === 'Secret', raw = sec && o.enc === 'stringData';
    const L = ['apiVersion: v1', `kind: ${o.kind}`, 'metadata:', `  name: ${yq(o.name.trim() || 'config')}`, ...(o.ns.trim() ? [`  namespace: ${yq(o.ns.trim())}`] : [])];
    if (sec) L.push('type: Opaque');
    if (o.immutable) L.push('immutable: true');
    L.push(!sec ? 'data:' : raw ? 'stringData:' : 'data:');
    for (const [k, v] of kv) L.push(`  ${k}: ${JSON.stringify(sec && !raw ? b64(new TextEncoder().encode(v)) : v)}`);
    return L.join('\n') + '\n';
  },
});

// ======================= LLM / EDGE =======================
const OLLAMA_TPL = {
  none: '',
  'llama3 / chat': '{{ if .System }}<|start_header_id|>system<|end_header_id|>\n\n{{ .System }}<|eot_id|>{{ end }}{{ if .Prompt }}<|start_header_id|>user<|end_header_id|>\n\n{{ .Prompt }}<|eot_id|>{{ end }}<|start_header_id|>assistant<|end_header_id|>\n\n{{ .Response }}<|eot_id|>',
  chatml: '{{ if .System }}<|im_start|>system\n{{ .System }}<|im_end|>\n{{ end }}{{ if .Prompt }}<|im_start|>user\n{{ .Prompt }}<|im_end|>\n{{ end }}<|im_start|>assistant\n{{ .Response }}<|im_end|>',
  mistral: '[INST] {{ if .System }}{{ .System }} {{ end }}{{ .Prompt }} [/INST] {{ .Response }}',
};
T.push({
  id: 'ollama-modelfile-generator', cat: 'Dev Config+', title: 'Ollama Modelfile Generator', desc: 'Build an Ollama Modelfile: FROM, PARAMETERs, SYSTEM prompt, TEMPLATE presets, ADAPTER, stop tokens and example MESSAGEs.',
  labels: ['System prompt', 'Extra lines: stop tokens (one per line) or "user: ..." / "assistant: ..." example messages'], inputs: 2,
  sample: 'You are a concise assistant that answers in plain English.', sample2: 'stop: <|eot_id|>\nuser: What is 2+2?\nassistant: 4',
  opts: [txt('from', 'FROM (model or .gguf path)', 'llama3.2'), num('temp', 'temperature', 0.7), num('ctx', 'num_ctx (0 = default)', 4096), num('topp', 'top_p (0 = default)', 0.9), num('topk', 'top_k (0 = default)', 40), num('rep', 'repeat_penalty (0 = default)', 1.1), num('pred', 'num_predict (0 = default)', 0), num('seed', 'seed (0 = random)', 0), sel('tpl', 'TEMPLATE preset', Object.keys(OLLAMA_TPL)), txt('adapter', 'ADAPTER path', '')],
  run: ([sys, extra], o) => {
    const L = [`FROM ${need(o.from, 'FROM is required').trim()}`, ''];
    const P = (k, v) => L.push(`PARAMETER ${k} ${v}`);
    P('temperature', +o.temp); if (+o.ctx) P('num_ctx', Math.floor(+o.ctx)); if (+o.topp) P('top_p', +o.topp); if (+o.topk) P('top_k', Math.floor(+o.topk)); if (+o.rep) P('repeat_penalty', +o.rep); if (+o.pred) P('num_predict', Math.floor(+o.pred)); if (+o.seed) P('seed', Math.floor(+o.seed));
    const msgs = [];
    for (const l of lines(extra)) { const m = l.match(/^(stop|user|assistant|system)\s*:\s*(.*)$/i); if (!m) throw new Error(`Bad line "${l}" (use stop:, user: or assistant:)`); if (m[1].toLowerCase() === 'stop') P('stop', JSON.stringify(m[2].trim())); else msgs.push(`MESSAGE ${m[1].toLowerCase()} ${m[2]}`); }
    if (o.adapter.trim()) L.push('', `ADAPTER ${o.adapter.trim()}`);
    if (OLLAMA_TPL[o.tpl]) { if (OLLAMA_TPL[o.tpl].includes('"""')) throw new Error('bad template'); L.push('', `TEMPLATE """${OLLAMA_TPL[o.tpl]}"""`); }
    if (sys.trim()) { if (sys.includes('"""')) throw new Error('System prompt cannot contain """'); L.push('', `SYSTEM """${sys.trim()}"""`); }
    if (msgs.length) L.push('', ...msgs);
    return L.join('\n') + '\n';
  },
});

const tq = (s) => JSON.stringify(String(s));
T.push({
  id: 'cloudflare-wrangler-builder', cat: 'Dev Config+', title: 'Cloudflare wrangler.toml Builder', desc: 'Generate wrangler.toml for a Worker: compatibility, routes, vars, KV, R2, D1, Durable Objects, queues, AI, cron triggers, assets.',
  labels: ['Bindings, one per line: kv:BIND:id | r2:BIND:bucket | d1:BIND:name:id | do:BIND:Class | queue:BIND:queue | ai:BIND | var:KEY=value | cron:*/5 * * * *'],
  sample: 'var:ENVIRONMENT=production\nkv:CACHE:0123456789abcdef0123456789abcdef\nr2:UPLOADS:my-bucket\nd1:DB:app-db:00000000-0000-0000-0000-000000000000\ndo:COUNTER:Counter\nai:AI\ncron:*/15 * * * *',
  opts: [txt('name', 'Worker name', 'my-worker'), txt('main', 'Entry point', 'src/index.ts'), txt('date', 'compatibility_date', dayISO), chk('node', 'nodejs_compat flag', true), chk('obs', 'Observability enabled', true), chk('wd', 'workers_dev', false), txt('route', 'Route pattern (blank = none)', 'example.com/*'), txt('zone', 'zone_name', 'example.com'), txt('assets', 'Static assets directory (blank = none)', '')],
  run: ([t], o) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date.trim())) throw new Error('compatibility_date must be YYYY-MM-DD');
    const top = [`name = ${tq(need(o.name, 'Worker name required').trim())}`, `main = ${tq(need(o.main, 'Entry point required').trim())}`, `compatibility_date = ${tq(o.date.trim())}`];
    if (o.node) top.push('compatibility_flags = ["nodejs_compat"]'); top.push(`workers_dev = ${o.wd}`);
    if (o.route.trim()) top.push(`routes = [{ pattern = ${tq(o.route.trim())}${o.zone.trim() ? `, zone_name = ${tq(o.zone.trim())}` : ''} }]`);
    const vars = [], crons = [], tabs = [];
    for (const l of lines(t)) {
      const i = l.indexOf(':'); const kind = l.slice(0, i), rest = l.slice(i + 1), p = rest.split(':');
      if (i < 1) throw new Error(`Bad line "${l}"`);
      if (kind === 'var') { const j = rest.indexOf('='); if (j < 1) throw new Error(`var needs KEY=value: "${l}"`); vars.push(`${rest.slice(0, j).trim()} = ${tq(rest.slice(j + 1).trim())}`); }
      else if (kind === 'cron') crons.push(tq(rest.trim()));
      else if (kind === 'kv') { if (p.length < 2) throw new Error('kv:BINDING:id'); tabs.push(['[[kv_namespaces]]', `binding = ${tq(p[0])}`, `id = ${tq(p[1])}`]); }
      else if (kind === 'r2') { if (p.length < 2) throw new Error('r2:BINDING:bucket'); tabs.push(['[[r2_buckets]]', `binding = ${tq(p[0])}`, `bucket_name = ${tq(p[1])}`]); }
      else if (kind === 'd1') { if (p.length < 3) throw new Error('d1:BINDING:name:id'); tabs.push(['[[d1_databases]]', `binding = ${tq(p[0])}`, `database_name = ${tq(p[1])}`, `database_id = ${tq(p[2])}`]); }
      else if (kind === 'do') { if (p.length < 2) throw new Error('do:BINDING:ClassName'); tabs.push(['[[durable_objects.bindings]]', `name = ${tq(p[0])}`, `class_name = ${tq(p[1])}`], ['[[migrations]]', `tag = ${tq('v' + (tabs.filter((x) => x[0] === '[[migrations]]').length + 1))}`, `new_sqlite_classes = [${tq(p[1])}]`]); }
      else if (kind === 'queue') { if (p.length < 2) throw new Error('queue:BINDING:queue'); tabs.push(['[[queues.producers]]', `binding = ${tq(p[0])}`, `queue = ${tq(p[1])}`]); }
      else if (kind === 'ai') { tabs.push(['[ai]', `binding = ${tq(p[0] || 'AI')}`]); }
      else throw new Error(`Unknown binding kind "${kind}"`);
    }
    const L = [...top, ''];
    if (o.assets.trim()) L.push('[assets]', `directory = ${tq(o.assets.trim())}`, '');
    if (o.obs) L.push('[observability]', 'enabled = true', '');
    if (vars.length) L.push('[vars]', ...vars, '');
    if (crons.length) L.push('[triggers]', `crons = [${crons.join(', ')}]`, '');
    for (const tb of tabs) L.push(...tb, '');
    return L.join('\n').replace(/\n+$/, '\n');
  },
});

// ======================= SECURITY / NETWORK =======================
T.push({
  id: 'subresource-integrity-generator', cat: 'Dev Config+', title: 'Subresource Integrity (SRI) Generator', desc: 'Compute the integrity attribute (sha256/384/512, base64) of a script or stylesheet you paste, and get the ready-made tag.',
  labels: ['File content (exact bytes of the file you serve)'], sample: 'console.log("hello");\n',
  opts: [sel('algo', 'Algorithm', ['sha384', 'sha256', 'sha512', 'all three']), txt('url', 'URL (optional)', 'https://cdn.example.com/app.js'), sel('tag', 'Tag', ['script', 'stylesheet link'])],
  run: async ([t], o) => {
    need(t, 'Paste the file content');
    const data = new TextEncoder().encode(t), algos = o.algo === 'all three' ? ['sha256', 'sha384', 'sha512'] : [o.algo];
    const vals = []; for (const a of algos) vals.push(`${a}-${b64(await crypto.subtle.digest(a.replace('sha', 'SHA-'), data))}`);
    const integ = vals.join(' '), u = o.url.trim();
    const tag = !u ? '' : o.tag === 'script' ? `<script src="${esc(u)}" integrity="${integ}" crossorigin="anonymous"></script>` : `<link rel="stylesheet" href="${esc(u)}" integrity="${integ}" crossorigin="anonymous">`;
    return `integrity="${integ}"\n\n${tag ? tag + '\n\n' : ''}Bytes hashed: ${data.length}\nNote: the hash covers the exact bytes, including line endings. The server must send CORS headers for cross-origin files.`;
  },
});

T.push({
  id: 'nginx-rate-limit-calculator', cat: 'Infra', title: 'Nginx Rate Limit Calculator', desc: 'Work out limit_req_zone rate, burst, delay and zone memory for a request rate, and see how traffic will be queued or rejected.',
  inputs: 0, sample: '',
  opts: [num('rate', 'Allowed rate', 10), sel('per', 'per', ['second', 'minute']), num('burst', 'burst', 20), sel('mode', 'Burst handling', ['nodelay', 'queue (delay all)', 'delay=N (two-stage)']), num('delay', 'delay=N (two-stage)', 8), num('clients', 'Expected unique clients (keys)', 50000),
    sel('key', 'Key', ['$binary_remote_addr', '$server_name', '$http_authorization', '$request_uri']), txt('zone', 'Zone name', 'api'), txt('loc', 'location', '/api/'), num('status', 'limit_req_status', 429)],
  run: (_, o) => {
    let r = +o.rate; if (!(r > 0)) throw new Error('Rate must be positive');
    const perSec = o.per === 'second' ? r : r / 60, burst = Math.max(0, Math.floor(+o.burst)), clients = Math.max(1, Math.floor(+o.clients));
    let rateStr = o.per === 'second' && Number.isInteger(r) ? `${r}r/s` : `${Math.max(1, Math.round(perSec * 60))}r/m`;
    const note = o.per === 'second' && !Number.isInteger(r) ? `\nNote: nginx only accepts whole r/s, so ${r}r/s was converted to ${rateStr}.` : '';
    const interval = 1000 / perSec, per = o.key === '$binary_remote_addr' ? 64 : 128;
    const needMB = (clients * per * 1.5) / 1048576, size = Math.max(1, Math.ceil(needMB));
    const lim = ({ nodelay: ' nodelay', 'queue (delay all)': '', 'delay=N (two-stage)': ` delay=${Math.min(burst, Math.floor(+o.delay))}` })[o.mode];
    const L = [`# http {} context`, `limit_req_zone ${o.key} zone=${o.zone.trim() || 'api'}:${size}m rate=${rateStr};`, '', `# server {} context`, `location ${o.loc.trim() || '/'} {`, `    limit_req zone=${o.zone.trim() || 'api'}${burst ? ` burst=${burst}` : ''}${burst ? lim : ''};`, `    limit_req_status ${Math.floor(+o.status) || 429};`, '}', ''];
    L.push('Analysis', `- Sustained rate per key: ${rd(perSec, 3)} req/s (${rd(perSec * 60, 1)} req/min); one request is admitted every ${rd(interval, 1)} ms.`);
    if (burst) {
      const recover = burst * interval / 1000;
      if (o.mode === 'nodelay') L.push(`- A client can send ${burst + 1} requests at once; all are served immediately. The rest get HTTP ${Math.floor(+o.status) || 429} until slots refill (${rd(recover, 2)} s to refill the whole burst).`);
      else if (o.mode.startsWith('queue')) L.push(`- Up to ${burst} excess requests are queued and released at the allowed rate, so the last queued request waits about ${rd(recover, 2)} s. Beyond that: HTTP ${Math.floor(+o.status) || 429}.`);
      else L.push(`- The first ${Math.min(burst, Math.floor(+o.delay))} excess requests are served immediately, the next ${burst - Math.min(burst, Math.floor(+o.delay))} are delayed (up to ${rd((burst - Math.min(burst, Math.floor(+o.delay))) * interval / 1000, 2)} s), anything beyond is rejected.`);
      L.push(`- Max requests in the first T seconds from an idle client: about ${burst + 1} + ${rd(perSec, 3)} x T.`);
    } else L.push('- No burst: any request arriving sooner than the interval is rejected.');
    L.push(`- Zone memory: ${clients.toLocaleString('en-US')} keys x ~${per} bytes x 1.5 headroom = ${rd(needMB, 2)} MB, rounded up to ${size}m (nginx stores roughly 16,000 64-byte states per MB; when full it evicts old entries and rejects with ${Math.floor(+o.status) || 429} if it cannot).`);
    if (o.key === '$binary_remote_addr') L.push('- Clients behind one NAT/proxy share a key; behind a CDN use the real client IP (realip module) or the key will be the CDN address.');
    return L.join('\n') + note;
  },
});

const humanSec = (s) => (s % 31536000 === 0 && s ? `${s / 31536000} year(s)` : s % 86400 === 0 && s ? `${s / 86400} day(s)` : s % 3600 === 0 && s ? `${s / 3600} hour(s)` : s % 60 === 0 && s ? `${s / 60} minute(s)` : `${s} second(s)`);
const CC_PRESETS = { custom: null, 'static asset (hashed filename)': 'public, max-age=31536000, immutable', 'HTML page (always revalidate)': 'no-cache', 'private API response': 'private, max-age=0, must-revalidate', 'sensitive data (never store)': 'no-store', 'CDN-cached, browser revalidates': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=60' };
T.push({
  id: 'cache-control-builder', cat: 'Dev Config+', title: 'Cache-Control Header Builder', desc: 'Compose a Cache-Control header from directives or a preset, with conflict warnings and snippets for nginx, Apache and Express.',
  inputs: 0, sample: '',
  opts: [sel('preset', 'Preset', Object.keys(CC_PRESETS)), sel('vis', 'Visibility', ['(none)', 'public', 'private']), txt('maxage', 'max-age (seconds, blank = omit)', '3600'), txt('smaxage', 's-maxage (seconds)', ''), txt('swr', 'stale-while-revalidate (s)', ''), txt('sie', 'stale-if-error (s)', ''),
    chk('nocache', 'no-cache'), chk('nostore', 'no-store'), chk('mustrev', 'must-revalidate'), chk('prox', 'proxy-revalidate'), chk('immutable', 'immutable'), chk('notrans', 'no-transform')],
  run: (_, o) => {
    const num0 = (v, n) => { v = String(v).trim(); if (!v) return null; if (!/^\d+$/.test(v)) throw new Error(`${n} must be a whole number of seconds`); return +v; };
    let val, w = [];
    if (CC_PRESETS[o.preset]) val = CC_PRESETS[o.preset];
    else {
      const d = []; if (o.vis !== '(none)') d.push(o.vis); const ma = num0(o.maxage, 'max-age'), sm = num0(o.smaxage, 's-maxage'), sw = num0(o.swr, 'stale-while-revalidate'), si = num0(o.sie, 'stale-if-error');
      if (o.nocache) d.push('no-cache'); if (o.nostore) d.push('no-store'); if (ma != null) d.push(`max-age=${ma}`); if (sm != null) d.push(`s-maxage=${sm}`);
      if (o.mustrev) d.push('must-revalidate'); if (o.prox) d.push('proxy-revalidate'); if (o.immutable) d.push('immutable'); if (o.notrans) d.push('no-transform'); if (sw != null) d.push(`stale-while-revalidate=${sw}`); if (si != null) d.push(`stale-if-error=${si}`);
      if (!d.length) throw new Error('Select at least one directive');
      if (o.nostore && (ma || sm || o.immutable)) w.push('no-store makes max-age/s-maxage/immutable pointless.');
      if (o.nocache && ma) w.push('no-cache forces revalidation on every use, so max-age has no useful effect.');
      if (o.vis === 'private' && sm != null) w.push('s-maxage is ignored for private responses (shared caches must not store them).');
      if (o.immutable && ma == null) w.push('immutable is only useful together with a long max-age.');
      if (o.immutable && o.mustrev) w.push('immutable plus must-revalidate is contradictory for a fresh response.');
      if (sw != null && ma == null && sm == null) w.push('stale-while-revalidate needs a freshness lifetime (max-age or s-maxage).');
      val = d.join(', ');
    }
    const ma = val.match(/max-age=(\d+)/);
    return `Cache-Control: ${val}\n\n${ma ? `Browser freshness: ${humanSec(+ma[1])}\n` : ''}${w.length ? '\nWarnings:\n' + w.map((x) => '- ' + x).join('\n') + '\n' : ''}\nnginx:    add_header Cache-Control "${val}" always;\nApache:   Header set Cache-Control "${val}"\nExpress:  res.set('Cache-Control', '${val}');\nNetlify/Cloudflare _headers:\n  /*\n    Cache-Control: ${val}`;
  },
});

T.push({
  id: 'dmarc-generator', cat: 'Dev Config+', title: 'DMARC Record Generator', desc: 'Build the _dmarc TXT record: policy, subdomain policy, percentage, aggregate/forensic reports, alignment modes.',
  inputs: 0, sample: '',
  opts: [txt('domain', 'Domain', 'example.com'), sel('p', 'Policy (p)', ['none', 'quarantine', 'reject']), sel('sp', 'Subdomain policy (sp)', ['same as p', 'none', 'quarantine', 'reject']), num('pct', 'pct (% of mail the policy applies to)', 100), txt('rua', 'Aggregate report emails (rua), comma separated', 'dmarc@example.com'), txt('ruf', 'Forensic report emails (ruf)', ''), sel('adkim', 'DKIM alignment', ['relaxed', 'strict']), sel('aspf', 'SPF alignment', ['relaxed', 'strict']), sel('fo', 'Failure options (fo)', ['0', '1', 'd', 's']), txt('ri', 'Report interval seconds (blank = 86400)', ''), chk('defs', 'Write default values explicitly')],
  run: (_, o) => {
    const dom = need(o.domain, 'Domain required').trim().toLowerCase(); if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dom)) throw new Error('Enter a valid domain');
    const mails = (s, n) => csv(s).map((m) => { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) throw new Error(`${n}: "${m}" is not an email`); return 'mailto:' + m; }).join(',');
    const pct = Math.floor(+o.pct); if (!(pct >= 0 && pct <= 100)) throw new Error('pct must be 0-100');
    const parts = ['v=DMARC1', `p=${o.p}`]; if (o.sp !== 'same as p') parts.push(`sp=${o.sp}`);
    if (pct !== 100 || o.defs) parts.push(`pct=${pct}`);
    const rua = mails(o.rua, 'rua'), ruf = mails(o.ruf, 'ruf'); if (rua) parts.push(`rua=${rua}`); if (ruf) parts.push(`ruf=${ruf}`);
    if (o.adkim === 'strict' || o.defs) parts.push(`adkim=${o.adkim === 'strict' ? 's' : 'r'}`); if (o.aspf === 'strict' || o.defs) parts.push(`aspf=${o.aspf === 'strict' ? 's' : 'r'}`);
    if (o.fo !== '0' || o.defs) parts.push(`fo=${o.fo}`);
    if (o.ri.trim()) { if (!/^\d+$/.test(o.ri.trim())) throw new Error('ri must be seconds'); parts.push(`ri=${o.ri.trim()}`); }
    const w = []; if (!rua) w.push('No rua address: you will not receive aggregate reports, which you need to tune the policy.'); if (o.p === 'none') w.push('p=none only monitors. Move to quarantine/reject once reports show legitimate mail passes.'); if (pct < 100 && o.p === 'none') w.push('pct has no effect with p=none.');
    for (const m of [...csv(o.rua), ...csv(o.ruf)]) { const d = m.split('@')[1].toLowerCase(); if (d !== dom && !d.endsWith('.' + dom)) w.push(`${m} is on another domain: that domain must publish ${dom}._report._dmarc.${d} TXT "v=DMARC1" to accept reports.`); }
    const rec = parts.join('; ');
    return `Host:  _dmarc.${dom}\nType:  TXT\nValue: ${rec}\n\nZone file:\n_dmarc.${dom}. IN TXT "${rec}"${w.length ? '\n\nNotes:\n' + w.map((x) => '- ' + x).join('\n') : ''}`;
  },
});

T.push({
  id: 'spf-record-generator', cat: 'Dev Config+', title: 'SPF Record Generator', desc: 'Compose an SPF TXT record from mechanisms, count DNS lookups against the 10-lookup limit and check the length.',
  labels: ['Mechanisms, one per line (include:..., ip4:..., ip6:..., a, mx, exists:...)'], sample: 'include:_spf.google.com\ninclude:spf.protection.outlook.com\nip4:203.0.113.0/24\nip6:2001:db8::/32',
  opts: [txt('domain', 'Domain', 'example.com'), chk('mx', 'Add mx', false), chk('a', 'Add a', false), sel('all', 'Default for everything else', ['~all (soft fail)', '-all (hard fail)', '?all (neutral)', '+all (allow all, unsafe)'])],
  run: ([t], o) => {
    const ms = lines(t).flatMap((l) => l.split(/\s+/)).filter((x) => x && x !== 'v=spf1');
    if (o.mx) ms.push('mx'); if (o.a) ms.push('a');
    let looks = 0; const w = [];
    for (const m of ms) {
      const b = m.replace(/^[+\-~?]/, '');
      if (/^all$/.test(b)) throw new Error('Do not add "all" yourself, choose it in the options');
      if (/^include:[^\s:]+$/i.test(b) || /^exists:\S+$/i.test(b) || /^redirect=\S+$/i.test(b)) looks++;
      else if (/^(a|mx)(:[^\s/]+)?(\/\d+)?(\/\/\d+)?$/i.test(b)) looks++;
      else if (/^ptr(:\S+)?$/i.test(b)) { looks++; w.push('ptr is deprecated (RFC 7208): remove it.'); }
      else if (/^ip4:(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(b)) { if (b.slice(4).split('/')[0].split('.').some((x) => +x > 255)) throw new Error(`Bad IPv4 in "${m}"`); }
      else if (/^ip6:[0-9a-fA-F:]+(\/\d{1,3})?$/.test(b)) { /* ok */ }
      else if (/^exp=\S+$/.test(b)) { /* no lookup counted */ }
      else throw new Error(`Unknown mechanism "${m}"`);
    }
    if (o.all.startsWith('+')) w.push('+all lets anyone send as your domain.');
    if (looks > 10) w.push(`${looks} DNS lookups: SPF allows at most 10, receivers will return permerror. Flatten includes or drop providers. (Nested lookups inside includes also count and are not visible here.)`);
    else if (looks >= 8) w.push(`${looks} lookups used directly; includes add their own, so you may be near the limit of 10.`);
    const rec = ['v=spf1', ...ms, o.all.split(' ')[0]].join(' ');
    const chunks = rec.match(/.{1,255}/g);
    return `Host:  ${o.domain.trim() || 'example.com'}  (apex, or the sending subdomain)\nType:  TXT\nValue: ${rec}\n\nLength: ${rec.length} chars${rec.length > 255 ? ` (over 255: store as several quoted strings: ${chunks.map((c) => `"${c}"`).join(' ')})` : ''}\nDNS lookups counted: ${looks}/10${w.length ? '\n\nNotes:\n' + w.map((x) => '- ' + x).join('\n') : ''}\n\nOnly one SPF record per domain is allowed; merge with any existing v=spf1 record.`;
  },
});

T.push({
  id: 'dkim-record-generator', cat: 'Dev Config+', title: 'DKIM Record Generator', desc: 'Make a DKIM DNS TXT record from a public key, or generate a fresh RSA key pair in your browser.',
  labels: ['Public key PEM (leave empty to generate a new key pair)'], sample: '',
  opts: [txt('selector', 'Selector', 'mail'), txt('domain', 'Domain', 'example.com'), sel('bits', 'New key size', ['2048', '1024', '4096']), chk('testing', 't=y (testing mode)')],
  run: async ([t], o) => {
    let priv = '';
    if (!t.trim()) {
      const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: +o.bits, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
      t = `-----BEGIN PUBLIC KEY-----\n${b64(await crypto.subtle.exportKey('spki', kp.publicKey)).match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
      priv = `-----BEGIN PRIVATE KEY-----\n${b64(await crypto.subtle.exportKey('pkcs8', kp.privateKey)).match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
    }
    const m = t.match(/-----BEGIN PUBLIC KEY-----([\s\S]+?)-----END PUBLIC KEY-----/);
    const p = (m ? m[1] : t).replace(/\s+/g, ''); if (!/^[A-Za-z0-9+/]+=*$/.test(p) || p.length < 100) throw new Error('Paste a PEM "BEGIN PUBLIC KEY" block (SPKI)');
    const rec = `v=DKIM1; k=rsa; ${o.testing ? 't=y; ' : ''}p=${p}`, host = `${o.selector.trim() || 'mail'}._domainkey.${o.domain.trim() || 'example.com'}`;
    const chunks = rec.match(/.{1,255}/g).map((c) => `"${c}"`).join(' ');
    return `Host:  ${host}\nType:  TXT\nValue: ${rec}\n\nZone file (split into 255-char strings):\n${host}. IN TXT ( ${chunks} )\n${priv ? `\nPrivate key (keep secret, configure it in your mail server / signer; never publish):\n${priv}\n` : ''}\nSigning header looks like: DKIM-Signature: v=1; a=rsa-sha256; d=${o.domain.trim() || 'example.com'}; s=${o.selector.trim() || 'mail'}; ...`;
  },
});

T.push({
  id: 'curl-builder', cat: 'Dev Config+', title: 'cURL Command Builder', desc: 'Fill in method, URL, headers, body, auth and flags to get a correctly quoted curl command.',
  inputs: 2, labels: ['Headers (Name: value per line)', 'Request body'], sample: 'Content-Type: application/json\nAccept: application/json', sample2: '{"name":"Ada","tags":["a","b"]}',
  opts: [sel('method', 'Method', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'], 'POST'), txt('url', 'URL', 'https://api.example.com/v1/users'), sel('auth', 'Auth', ['none', 'bearer', 'basic']), txt('cred', 'Token or user:password', ''),
    chk('L', 'Follow redirects (-L)', true), chk('s', 'Silent (-sS)'), chk('i', 'Show response headers (-i)'), chk('k', 'Skip TLS verification (-k)'), chk('z', 'Compressed (--compressed)'), chk('fail', 'Fail on HTTP errors (--fail-with-body)'), num('t', 'Max time seconds (0 = none)', 30), txt('out', 'Save to file (-o)', ''), chk('multi', 'Multi-line output', true)],
  run: ([hd, body], o) => {
    const url = need(o.url, 'URL required').trim(); if (!/^https?:\/\//i.test(url)) throw new Error('URL must start with http:// or https://');
    const a = [`curl`]; const f = [];
    if (o.s) f.push('-sS'); if (o.L) f.push('-L'); if (o.i) f.push('-i'); if (o.k) f.push('-k'); if (o.z) f.push('--compressed'); if (o.fail) f.push('--fail-with-body');
    if (f.length) a.push(f.join(' '));
    if (o.method === 'HEAD') a.push('-I'); else if (o.method !== 'GET') a.push(`-X ${o.method}`);
    for (const h of lines(hd)) { if (!/^[^:\s]+:\s*.*$/.test(h)) throw new Error(`Header "${h}" must look like Name: value`); a.push(`-H ${shq(h)}`); }
    if (o.auth === 'bearer') a.push(`-H ${shq('Authorization: Bearer ' + need(o.cred, 'Token required'))}`); else if (o.auth === 'basic') { if (!o.cred.includes(':')) throw new Error('Basic auth needs user:password'); a.push(`-u ${shq(o.cred)}`); }
    if (body.trim()) a.push(`--data-raw ${shq(body)}`);
    if (+o.t > 0) a.push(`--max-time ${Math.floor(+o.t)}`); if (o.out.trim()) a.push(`-o ${shq(o.out.trim())}`);
    a.push(shq(url));
    return o.multi ? a.join(' \\\n  ') : a.join(' ');
  },
});

// ======================= COLOUR / THEME =======================
// text colour with the better contrast on a #rrggbb background
const fgFor = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.184 ? '#111' : '#fff'; };
T.push({
  id: 'tailwind-v4-color-palette', cat: 'CSS+', title: 'Tailwind v4 Color Palette (OKLCH)', desc: 'Generate a 50-950 scale from one base colour as OKLCH, emitted as an @theme block for Tailwind CSS v4 (hex fallback list included).',
  inputs: 0, sample: '',
  opts: [txt('name', 'Colour name', 'brand'), col('base', 'Base colour', '#3b82f6'), sel('fmt', 'Values', ['oklch', 'hex'])],
  run: (_, o) => {
    const name = (o.name.trim() || 'brand').toLowerCase().replace(/[^a-z0-9-]+/g, '-'), sc2 = scale(o.base);
    const css = sc2.map((x) => `  --color-${name}-${x.s}: ${o.fmt === 'hex' ? ok2hex(x.L, x.C, x.H) : okStr(x.L, x.C, x.H)};${x.base ? '  /* base */' : ''}`);
    const html = page(`<div style="display:flex;flex-wrap:wrap;gap:8px">${sc2.map((x) => { const h = ok2hex(x.L, x.C, x.H); return `<div style="width:80px;height:64px;border-radius:8px;background:${h};color:${fgFor(h)};font:12px monospace;padding:6px;box-sizing:border-box">${x.s}<br>${h}</div>`; }).join('')}</div>`);
    return { text: `@theme {\n${css.join('\n')}\n}\n\n/* hex: ${sc2.map((x) => `${x.s} ${ok2hex(x.L, x.C, x.H)}`).join(', ')} */\n`, html };
  },
});

T.push({
  id: 'shadcn-theme-generator', cat: 'CSS+', title: 'shadcn/ui Theme Generator', desc: 'Generate the CSS variables (light and dark, OKLCH) for a shadcn/ui theme from a primary colour, neutral tint and radius, plus the @theme inline mapping.',
  inputs: 0, sample: '',
  opts: [col('primary', 'Primary colour', '#6d28d9'), sel('tint', 'Neutral tint', ['neutral', 'slate', 'zinc', 'stone', 'match primary']), txt('radius', 'Radius', '0.625rem'), chk('inline', 'Include @theme inline block', true)],
  run: (_, o) => {
    const [pl, pc, ph] = hex2ok(o.primary);
    const [nh, nc] = { neutral: [0, 0], slate: [255, 0.035], zinc: [286, 0.006], stone: [60, 0.01], 'match primary': [ph, 0.015] }[o.tint];
    const n = (L, k = 1) => okStr(L, nc * k, nh), fg = (L) => (L > 0.62 ? n(0.205) : n(0.985, 0.2));
    const dkL = Math.min(0.8, Math.max(0.62, pl + 0.12));
    const chart = (L) => [0, 1, 2, 3, 4].map((i) => okStr(L, Math.max(0.12, pc), (ph + i * 55) % 360));
    const light = { background: n(1, 0), foreground: n(0.145), card: n(1, 0), 'card-foreground': n(0.145), popover: n(1, 0), 'popover-foreground': n(0.145), primary: okStr(pl, pc, ph), 'primary-foreground': fg(pl), secondary: n(0.97, 0.4), 'secondary-foreground': n(0.205), muted: n(0.97, 0.4), 'muted-foreground': n(0.556), accent: n(0.97, 0.4), 'accent-foreground': n(0.205), destructive: 'oklch(0.577 0.245 27.325)', border: n(0.922, 0.6), input: n(0.922, 0.6), ring: okStr(Math.min(0.75, Math.max(0.55, pl)), pc * 0.8, ph) };
    const dark = { background: n(0.145), foreground: n(0.985, 0.2), card: n(0.205), 'card-foreground': n(0.985, 0.2), popover: n(0.205), 'popover-foreground': n(0.985, 0.2), primary: okStr(dkL, pc, ph), 'primary-foreground': fg(dkL), secondary: n(0.269), 'secondary-foreground': n(0.985, 0.2), muted: n(0.269), 'muted-foreground': n(0.708), accent: n(0.269), 'accent-foreground': n(0.985, 0.2), destructive: 'oklch(0.704 0.191 22.216)', border: 'oklch(1 0 0 / 10%)', input: 'oklch(1 0 0 / 15%)', ring: okStr(dkL, pc * 0.8, ph) };
    const block = (sel2, vars, extra) => `${sel2} {\n${extra || ''}${Object.entries(vars).map(([k, v]) => `  --${k}: ${v};`).join('\n')}\n${chart(sel2 === '.dark' ? 0.7 : 0.62).map((c, i) => `  --chart-${i + 1}: ${c};`).join('\n')}\n}`;
    let css = `${block(':root', light, `  --radius: ${o.radius.trim() || '0.625rem'};\n`)}\n\n${block('.dark', dark)}\n`;
    if (o.inline) css += `\n@theme inline {\n${[...Object.keys(light), 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'].map((k) => `  --color-${k}: var(--${k});`).join('\n')}\n  --radius-sm: calc(var(--radius) - 4px);\n  --radius-md: calc(var(--radius) - 2px);\n  --radius-lg: var(--radius);\n  --radius-xl: calc(var(--radius) + 4px);\n}\n`;
    const sw = (v, bg) => `<div style="background:${v.background};color:${v.foreground};padding:12px;border-radius:10px;border:1px solid ${v.border};flex:1;min-width:220px"><b>Card title</b><p style="margin:6px 0;color:${v['muted-foreground']}">Muted description text</p><span style="display:inline-block;background:${v.primary};color:${v['primary-foreground']};padding:6px 12px;border-radius:8px">Primary</span> <span style="display:inline-block;background:${v.secondary};color:${v['secondary-foreground']};padding:6px 12px;border-radius:8px">Secondary</span> <span style="display:inline-block;background:${v.destructive};color:#fff;padding:6px 12px;border-radius:8px">Destructive</span></div>`;
    return { text: css, html: page(`<div style="display:flex;gap:12px;flex-wrap:wrap">${sw(light)}${sw(dark)}</div>`) };
  },
});

// ======================= CSS GENERATORS =======================
T.push({
  id: 'css-clamp-calculator', cat: 'CSS+', title: 'CSS clamp() Calculator', desc: 'Fluid sizing: give min/max size and viewport range, get clamp(min, preferred, max) in rem with the math shown.',
  inputs: 0, sample: '',
  opts: [num('min', 'Min size (px)', 16), num('max', 'Max size (px)', 32), num('minVp', 'Min viewport width (px)', 375), num('maxVp', 'Max viewport width (px)', 1280), num('root', 'Root font size (px)', 16), sel('prop', 'Property', ['font-size', 'padding', 'margin', 'gap', 'width', 'line-height'])],
  run: (_, o) => {
    const a = +o.min, b = +o.max, v1 = +o.minVp, v2 = +o.maxVp, root = +o.root || 16;
    if (![a, b, v1, v2].every(Number.isFinite) || v2 <= v1) throw new Error('Max viewport must be larger than min viewport');
    const slope = (b - a) / (v2 - v1), inter = a - slope * v1, lo = Math.min(a, b), hi = Math.max(a, b), r4 = (n) => rd(n, 4);
    const pref = `${r4(inter / root)}rem + ${r4(slope * 100)}vw`.replace('+ -', '- ');
    const val = `clamp(${r4(lo / root)}rem, ${pref}, ${r4(hi / root)}rem)`;
    const rows = [320, 480, 768, 1024, 1280, 1536, 1920].map((w) => `${String(w).padStart(5)}px -> ${rd(Math.min(hi, Math.max(lo, inter + slope * w)), 2)}px`);
    const html = page(`<p style="margin:0 0 8px;color:#666">Resize the preview pane: text scales between ${a}px and ${b}px.</p><p style="margin:0;${o.prop === 'font-size' ? '' : 'font-size:16px;'}${o.prop === 'width' ? `width:${val};background:#6366f1;color:#fff;padding:8px;box-sizing:border-box` : `${o.prop}:${val}`}">The quick brown fox</p>`);
    return { text: `${o.prop}: ${val};\n\nMath:\n  slope = (${b} - ${a}) / (${v2} - ${v1}) = ${rd(slope, 6)}\n  intercept = ${a} - ${rd(slope, 6)} x ${v1} = ${rd(inter, 4)}px\n  preferred = ${r4(inter / root)}rem + ${r4(slope * 100)}vw\n\nComputed size at common widths:\n${rows.join('\n')}\n\nNote: rem units respect the user's font-size setting, which keeps the text zoomable (WCAG 1.4.4).`, html };
  },
});

T.push({
  id: 'css-triangle-generator', cat: 'CSS+', title: 'CSS Triangle Generator', desc: 'CSS triangles in 8 directions using the border technique, plus a clip-path alternative; live preview.',
  inputs: 0, sample: '',
  opts: [sel('dir', 'Direction', ['up', 'down', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right']), num('w', 'Width px', 100), num('h', 'Height px', 80), col('color', 'Colour', '#e11d48')],
  run: (_, o) => {
    const w = Math.max(1, Math.round(+o.w)), h = Math.max(1, Math.round(+o.h)), c = o.color, T0 = 'transparent', hw = rd(w / 2, 1), hh = rd(h / 2, 1);
    const b = {
      up: [`border-left: ${hw}px solid ${T0};`, `border-right: ${hw}px solid ${T0};`, `border-bottom: ${h}px solid ${c};`],
      down: [`border-left: ${hw}px solid ${T0};`, `border-right: ${hw}px solid ${T0};`, `border-top: ${h}px solid ${c};`],
      left: [`border-top: ${hh}px solid ${T0};`, `border-bottom: ${hh}px solid ${T0};`, `border-right: ${w}px solid ${c};`],
      right: [`border-top: ${hh}px solid ${T0};`, `border-bottom: ${hh}px solid ${T0};`, `border-left: ${w}px solid ${c};`],
      'top-left': [`border-top: ${h}px solid ${c};`, `border-right: ${w}px solid ${T0};`],
      'top-right': [`border-top: ${h}px solid ${c};`, `border-left: ${w}px solid ${T0};`],
      'bottom-left': [`border-bottom: ${h}px solid ${c};`, `border-right: ${w}px solid ${T0};`],
      'bottom-right': [`border-bottom: ${h}px solid ${c};`, `border-left: ${w}px solid ${T0};`],
    }[o.dir];
    const poly = { up: '50% 0, 100% 100%, 0 100%', down: '0 0, 100% 0, 50% 100%', left: '100% 0, 100% 100%, 0 50%', right: '0 0, 100% 50%, 0 100%', 'top-left': '0 0, 100% 0, 0 100%', 'top-right': '0 0, 100% 0, 100% 100%', 'bottom-left': '0 0, 0 100%, 100% 100%', 'bottom-right': '100% 0, 100% 100%, 0 100%' }[o.dir];
    const css = `/* border technique */\n.triangle {\n  width: 0;\n  height: 0;\n  ${b.join('\n  ')}\n}\n\n/* clip-path alternative (can hold content, background, gradients) */\n.triangle-clip {\n  width: ${w}px;\n  height: ${h}px;\n  background: ${c};\n  clip-path: polygon(${poly});\n}\n`;
    return { text: css, html: page(`<style>.triangle{width:0;height:0;${b.join('')}}</style><div class="triangle"></div>`) };
  },
});

T.push({
  id: 'css-scrollbar-generator', cat: 'CSS+', title: 'CSS Scrollbar Generator', desc: 'Style scrollbars with ::-webkit-scrollbar and the standard scrollbar-color / scrollbar-width properties; live preview.',
  inputs: 0, sample: '',
  opts: [txt('sel', 'Selector', '.scroll'), num('w', 'Width px', 10), col('thumb', 'Thumb', '#6366f1'), col('hover', 'Thumb hover', '#4f46e5'), col('track', 'Track', '#e5e7eb'), num('r', 'Thumb radius px', 8), sel('std', 'Standard scrollbar-width', ['thin', 'auto', 'none'])],
  run: (_, o) => {
    const s = o.sel.trim() || '.scroll', w = Math.max(2, Math.round(+o.w));
    const css = `${s} {\n  scrollbar-width: ${o.std};\n  scrollbar-color: ${o.thumb} ${o.track};\n}\n\n/* Chromium / Safari (ignored when scrollbar-color is supported in modern Chrome; keep for older browsers) */\n${s}::-webkit-scrollbar {\n  width: ${w}px;\n  height: ${w}px;\n}\n${s}::-webkit-scrollbar-track {\n  background: ${o.track};\n  border-radius: ${Math.round(+o.r)}px;\n}\n${s}::-webkit-scrollbar-thumb {\n  background: ${o.thumb};\n  border-radius: ${Math.round(+o.r)}px;\n}\n${s}::-webkit-scrollbar-thumb:hover {\n  background: ${o.hover};\n}\n`;
    const body = Array.from({ length: 14 }, (_, i) => `<p>Scrollable line ${i + 1}</p>`).join('');
    return { text: css, html: page(`<style>${css.replace(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '.demo')}.demo{height:140px;overflow:auto;background:#fff;padding:0 12px;border:1px solid #ccc;border-radius:8px}</style><div class="demo">${body}</div>`) };
  },
});

T.push({
  id: 'css-pattern-generator', cat: 'CSS+', title: 'CSS Pattern Generator', desc: 'Pure-CSS background patterns (stripes, dots, grid, checkerboard, zigzag, polka) from gradients; pick colours and size.',
  inputs: 0, sample: '',
  opts: [sel('type', 'Pattern', ['stripes', 'diagonal stripes', 'dots', 'polka (offset dots)', 'grid', 'checkerboard', 'zigzag']), col('c1', 'Pattern colour', '#6366f1'), col('c2', 'Background colour', '#eef2ff'), num('s', 'Size px', 24)],
  run: (_, o) => {
    const s = Math.max(4, Math.round(+o.s)), h = s / 2, a = o.c1, b = o.c2;
    const P = {
      stripes: [`repeating-linear-gradient(90deg, ${a} 0 ${h}px, ${b} ${h}px ${s}px)`],
      'diagonal stripes': [`repeating-linear-gradient(45deg, ${a} 0 ${h / 2}px, ${b} ${h / 2}px ${h}px)`],
      dots: [`radial-gradient(${a} ${rd(s * 0.15, 1)}px, transparent ${rd(s * 0.15 + 1, 1)}px)`, `${s}px ${s}px`],
      'polka (offset dots)': [`radial-gradient(${a} ${rd(s * 0.12, 1)}px, transparent ${rd(s * 0.12 + 1, 1)}px) 0 0 / ${s}px ${s}px, radial-gradient(${a} ${rd(s * 0.12, 1)}px, transparent ${rd(s * 0.12 + 1, 1)}px) ${h}px ${h}px / ${s}px ${s}px`],
      grid: [`linear-gradient(${a} 1px, transparent 1px), linear-gradient(90deg, ${a} 1px, transparent 1px)`, `${s}px ${s}px`],
      checkerboard: [`linear-gradient(45deg, ${a} 25%, transparent 25%), linear-gradient(-45deg, ${a} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${a} 75%), linear-gradient(-45deg, transparent 75%, ${a} 75%)`, `${s}px ${s}px`, `0 0, 0 ${h}px, ${h}px -${h}px, -${h}px 0`],
      zigzag: [`linear-gradient(135deg, ${a} 25%, transparent 25%) -${h}px 0 / ${s}px ${s}px, linear-gradient(225deg, ${a} 25%, transparent 25%) -${h}px 0 / ${s}px ${s}px, linear-gradient(315deg, ${a} 25%, transparent 25%) 0 0 / ${s}px ${s}px, linear-gradient(45deg, ${a} 25%, transparent 25%) 0 0 / ${s}px ${s}px`],
    }[o.type];
    const decl = [`background-color: ${b};`, `background-image: ${P[0]};`, ...(P[1] ? [`background-size: ${P[1]};`] : []), ...(P[2] ? [`background-position: ${P[2]};`] : [])];
    const css = `.pattern {\n  ${decl.join('\n  ')}\n}\n`;
    return { text: css, html: page(`<style>.pattern{height:220px;border-radius:10px;${decl.join('')}}</style><div class="pattern"></div>`) };
  },
});

T.push({
  id: 'css-blob-generator', cat: 'CSS+', title: 'SVG Blob Generator', desc: 'Random organic blob shapes as an SVG path (seedable), with ready-to-use SVG and CSS clip-path.',
  inputs: 0, sample: '',
  opts: [num('n', 'Points (3-12)', 6), num('grow', 'Randomness (1-10)', 6), num('seed', 'Seed', 42), num('size', 'Size px', 400), col('fill', 'Fill', '#8b5cf6')],
  run: (_, o) => {
    const n = Math.min(12, Math.max(3, Math.round(+o.n))), size = Math.max(20, Math.round(+o.size)), g = Math.min(10, Math.max(1, +o.grow));
    const d = blobPath(n, g, Math.floor(+o.seed) || 0, size);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">\n  <path fill="${o.fill}" d="${d}"/>\n</svg>`;
    return { text: `${svg}\n\n/* CSS clip-path (absolute px, element should be ${size}x${size}) */\nclip-path: path('${d}');\n\nPath: ${d}\n`, html: page(`<div style="text-align:center">${svg}</div>`) };
  },
});
export default T;

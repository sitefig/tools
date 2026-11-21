// devz3.js: converters, generators, network inspectors and crypto helpers (slice 02 of the devstools.app gap list).
// Zero dependencies, client-side only, hand-written. Pure tools run under Node 22; dom:true tools need a browser.
//
// SKIPPED slugs (with reason):
//  generators/dockerfile-ai-optimized-generator   - dockerfile-generator (multi-stage) + dockerfile-linter already cover it.
//  generators/helm-chart-yaml-generator           - helm-chart-scaffolder exists.
//  generators/gitlab-ci-pipeline-builder          - gitlab-ci-generator exists.
//  generators/opa-rego-policy-builder             - rego-snippet-helper exists.
//  generators/caddyfile-production-generator      - caddyfile-generator exists.
//  generators/tailwind-v4-mesh-gradient-generator - mesh-gradient-generator exists (CSS output is what Tailwind v4 arbitrary values take).
//  generators/ansible-playbook-scaffolder         - ansible-playbook-generator exists.
//  generators/terraform-module-scaffolder         - terraform-scaffolder exists.
//  generators/kubernetes-deployment-generator, kubernetes-configmap-secret-builder - exist already.
//  converters/css-grid-to-tailwind                - tailwind-converter + grid-generator already cover CSS -> Tailwind.
//  utilities/opengraph-tag-inspector              - meta-analyzer / seo-inspector / social-preview already inspect OG tags.
//  utilities/network-port-reference, mime-type-extension-lookup, color-blindness-simulator, viewport-size-tester - exist already
//                                                   (port-reference, mime-type-lookup, color-blindness-simulator, responsive-breakpoint-previewer).
//  utilities/semver-range-evaluator               - semver-calculator already evaluates ranges.
//  utilities/unicode-glyph-category-inspector     - char-info already reports code point, general category and script.
//  crypto/hmac-sha384-sha512-calculator           - hmac-generator already supports SHA-384/512.
//  crypto/rsa-pkcs1-pkcs8-converter, crypto/pbkdf2-key-derivation, crypto/uuid-v7-timestamp-extractor, crypto/base64-pem-certificate-parser
//                                                   - exist (same ids / x509-viewer).
//  encoding/* (punycode, crockford-base32, bcd, ieee754-hex-float, rot47), json/json-key-sorter, json/json-array-splitter-chunker,
//  text/* (prefix-suffix, duplicate-line-counter, column-splitter) - all exist already.
//  Partial: dns-spf-record-flattener needs live DNS; it is built as an offline flattener (you paste the included records).
//  Partial: argon2-parameter-tuner does not run Argon2 (no reference implementation to verify against here); it is a parameter calculator.
//  Partial: http2-http3-frame-inspector decodes HPACK without Huffman strings (Huffman table not hand-reproducible with certainty).
//  webhook-payload-simulator cannot POST (no network): it builds the exact body, signature headers and a curl command.

const T = [];
const enc = new TextEncoder();
const dec = new TextDecoder();
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => {
  s = s.trim().replace(/^0x/i, '').replace(/[\s:,]|0x/gi, '');
  if (!/^[0-9a-f]*$/i.test(s) || s.length % 2) throw new Error('Invalid hex (need an even number of hex digits)');
  return Uint8Array.from(s.match(/../g) || [], (h) => parseInt(h, 16));
};
const cat = (...a) => { const r = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { r.set(x, o); o += x.length; } return r; };
const b64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const pem = (label, u) => `-----BEGIN ${label}-----\n${b64(u).match(/.{1,64}/g).join('\n')}\n-----END ${label}-----`;
const lines = (s) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const parseJ = (s) => { try { return JSON.parse(s); } catch (e) { throw new Error('Invalid JSON: ' + e.message); } };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sel = (id, label, def, choices) => ({ id, label, type: 'select', def, choices });
const num = (id, label, def) => ({ id, label, type: 'number', def });
const txt = (id, label, def) => ({ id, label, type: 'text', def });
const chk = (id, label, def) => ({ id, label, type: 'checkbox', def });
const pascal = (s) => (String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Icon');
const fmt = (n) => String(+Number(n).toFixed(4));
const tbl = (rows) => { const w = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length))); return rows.map((r) => r.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd()).join('\n'); };

// ============================================================ curl -> Rust / Go
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
      while (i < s.length && s[i] !== "'") {
        if (s[i] === '\\') { const n = s[i + 1]; cur += { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' }[n] ?? n; i += 2; } else cur += s[i++];
      }
      i++;
    } else if (c === '"') {
      i++;
      while (i < s.length && s[i] !== '"') { if (s[i] === '\\' && /["\\$`]/.test(s[i + 1])) { cur += s[i + 1]; i += 2; } else cur += s[i++]; }
      if (i >= s.length) throw new Error('Unterminated double quote');
      i++;
    } else if (c === '\\') { cur += s[i + 1] ?? ''; i += 2; } else { cur += c; i++; }
  }
  if (has) out.push(cur);
  return out;
}
const CURL_ARG = { X: 'method', request: 'method', H: 'header', header: 'header', d: 'data', data: 'data', 'data-raw': 'dataRaw', 'data-binary': 'data', 'data-ascii': 'data', 'data-urlencode': 'dataUrlenc', F: 'form', form: 'form', u: 'user', user: 'user', A: 'ua', 'user-agent': 'ua', e: 'referer', referer: 'referer', b: 'cookie', cookie: 'cookie', json: 'json', url: 'url', m: 'skip', 'max-time': 'skip', o: 'skip', output: 'skip', x: 'skip', proxy: 'skip', 'connect-timeout': 'skip', 'retry': 'skip', 'cacert': 'skip', 'cert': 'skip', 'key': 'skip', 'http1.1': 'flag' };
const CURL_FLAG = { k: 'insecure', insecure: 'insecure', L: 'follow', location: 'follow', I: 'head', head: 'head', G: 'get', get: 'get', compressed: 'compressed' };
function parseCurl(cmd) {
  const t = shellSplit(cmd.trim());
  if (!t.length) throw new Error('Paste a curl command');
  if (t[0] === 'curl') t.shift();
  const r = { method: '', url: '', headers: [], data: [], form: [], user: '', insecure: false, follow: false, head: false, get: false };
  const take = (key, val) => {
    switch (CURL_ARG[key]) {
      case 'method': r.method = val.toUpperCase(); break;
      case 'header': { const k = val.indexOf(':'); if (k < 0) break; r.headers.push([val.slice(0, k).trim(), val.slice(k + 1).trim()]); break; }
      case 'data': case 'dataRaw': r.data.push(val); break;
      case 'dataUrlenc': { const k = val.indexOf('='); r.data.push(k < 0 ? encodeURIComponent(val) : (k ? val.slice(0, k) + '=' : '') + encodeURIComponent(val.slice(k + 1))); break; }
      case 'form': { const k = val.indexOf('='); if (k < 0) throw new Error('Bad -F value: ' + val); r.form.push([val.slice(0, k), val.slice(k + 1)]); break; }
      case 'user': r.user = val; break;
      case 'ua': r.headers.push(['User-Agent', val]); break;
      case 'referer': r.headers.push(['Referer', val]); break;
      case 'cookie': r.headers.push(['Cookie', val]); break;
      case 'json': r.data.push(val); r.json = true; break;
      case 'url': r.url = val; break;
      default: break;
    }
  };
  for (let i = 0; i < t.length; i++) {
    const a = t[i];
    if (a.startsWith('--')) {
      let [k, v] = a.slice(2).split(/=(.*)/s);
      if (CURL_FLAG[k]) { r[CURL_FLAG[k]] = true; continue; }
      if (k in CURL_ARG) { if (v === undefined) v = t[++i]; if (v === undefined) throw new Error('Missing value for --' + k); take(k, v); }
    } else if (a.startsWith('-') && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const f = a[j];
        if (CURL_FLAG[f]) { r[CURL_FLAG[f]] = true; continue; }
        if (f in CURL_ARG) { const v = a.slice(j + 1) || t[++i]; if (v === undefined) throw new Error('Missing value for -' + f); take(f, v); break; }
      }
    } else if (!r.url) r.url = a;
  }
  if (!r.url) throw new Error('No URL found in the curl command');
  if (!/^[a-z]+:\/\//i.test(r.url)) r.url = 'http://' + r.url;
  r.body = r.data.length ? r.data.join(r.json ? '' : '&') : '';
  if (r.json) { if (!r.headers.some((h) => /^content-type$/i.test(h[0]))) r.headers.push(['Content-Type', 'application/json']); if (!r.headers.some((h) => /^accept$/i.test(h[0]))) r.headers.push(['Accept', 'application/json']); }
  if (r.get && r.body) { r.url += (r.url.includes('?') ? '&' : '?') + r.body; r.body = ''; }
  if (!r.method) r.method = r.head ? 'HEAD' : (r.body || r.form.length) && !r.get ? 'POST' : 'GET';
  if (r.body && !r.form.length && !r.headers.some((h) => /^content-type$/i.test(h[0])) && !r.json) r.headers.push(['Content-Type', 'application/x-www-form-urlencoded']);
  return r;
}
const rsStr = (s) => '"' + s.replace(/[\\"]|[\x00-\x1f\x7f]/g, (c) => ({ '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t' }[c] || `\\u{${c.charCodeAt(0).toString(16)}}`)) + '"';
const goStr = (s) => JSON.stringify(s);
const CURL_SAMPLE = `curl -X POST 'https://api.example.com/v1/items?draft=1' \\
  -H 'Authorization: Bearer abc123' \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"Widget","qty":3}'`;
T.push({
  id: 'curl-to-rust-reqwest', cat: 'Converters++', title: 'curl to Rust (reqwest)', desc: 'Convert a curl command to async Rust using the reqwest crate: method, headers, body, basic auth, multipart -F, -k, -L. Not every curl flag is supported (proxies, certs, retries are ignored).',
  labels: ['curl command'], sample: CURL_SAMPLE,
  run: ([s]) => {
    const r = parseCurl(s), m = r.method;
    const L = ['// Cargo.toml: reqwest = { version = "0.12", features = ["json"' + (r.form.length ? ', "multipart"' : '') + '] }, tokio = { version = "1", features = ["full"] }', ''];
    L.push('#[tokio::main]', 'async fn main() -> Result<(), Box<dyn std::error::Error>> {');
    L.push('    let client = reqwest::Client::builder()');
    if (r.insecure) L.push('        .danger_accept_invalid_certs(true)');
    if (!r.follow) L.push('        .redirect(reqwest::redirect::Policy::none())');
    L.push('        .build()?;', '');
    if (r.form.length) {
      L.push('    let form = reqwest::multipart::Form::new()');
      for (const [k, v] of r.form) L.push(v.startsWith('@') ? `        .file(${rsStr(k)}, ${rsStr(v.slice(1).split(';')[0])}).await?` : `        .text(${rsStr(k)}, ${rsStr(v)})`);
      L[L.length - 1] += ';'; L.push('');
    }
    const std = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'];
    L.push('    let response = client');
    L.push(std.includes(m) ? `        .${m.toLowerCase()}(${rsStr(r.url)})` : `        .request(reqwest::Method::from_bytes(b${rsStr(m)}.as_slice())?, ${rsStr(r.url)})`.replace('.as_slice()', ''));
    for (const [k, v] of r.headers) L.push(`        .header(${rsStr(k)}, ${rsStr(v)})`);
    if (r.user) { const k = r.user.indexOf(':'); L.push(`        .basic_auth(${rsStr(k < 0 ? r.user : r.user.slice(0, k))}, ${k < 0 ? 'None::<&str>' : `Some(${rsStr(r.user.slice(k + 1))})`})`); }
    if (r.form.length) L.push('        .multipart(form)');
    else if (r.body) L.push(`        .body(${rsStr(r.body)})`);
    L.push('        .send()', '        .await?;', '');
    L.push('    println!("{}", response.status());', '    println!("{}", response.text().await?);', '    Ok(())', '}');
    return L.join('\n');
  },
});
T.push({
  id: 'curl-to-go-http', cat: 'Converters++', title: 'curl to Go (net/http)', desc: 'Convert a curl command to Go using only the standard library net/http: method, headers, body, basic auth, multipart -F, -k, -L. Proxies, certs and retries are ignored.',
  labels: ['curl command'], sample: CURL_SAMPLE,
  run: ([s]) => {
    const r = parseCurl(s);
    const imp = new Set(['fmt', 'io', 'log', 'net/http']);
    const B = [];
    if (r.insecure) { imp.add('crypto/tls'); }
    let bodyVar = 'nil';
    if (r.form.length) {
      imp.add('bytes'); imp.add('mime/multipart');
      B.push('\tvar buf bytes.Buffer', '\tw := multipart.NewWriter(&buf)');
      r.form.forEach(([k, v], i) => {
        if (v.startsWith('@')) { imp.add('os'); B.push(`\tf${i}, err := os.Open(${goStr(v.slice(1).split(';')[0])})`, '\tif err != nil {', '\t\tlog.Fatal(err)', '\t}', `\tfw${i}, _ := w.CreateFormFile(${goStr(k)}, f${i}.Name())`, `\tio.Copy(fw${i}, f${i})`); }
        else B.push(`\tw.WriteField(${goStr(k)}, ${goStr(v)})`);
      });
      B.push('\tw.Close()', '');
      bodyVar = '&buf';
    } else if (r.body) { imp.add('strings'); B.push(`\tbody := strings.NewReader(${goStr(r.body)})`); bodyVar = 'body'; }
    const out = ['package main', '', 'import ('];
    for (const i of [...imp].sort()) out.push(`\t"${i}"`);
    out.push(')', '', 'func main() {');
    const tr = r.insecure ? '&http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}' : '';
    const cl = [];
    if (tr) cl.push(`Transport: ${tr}`);
    if (!r.follow) cl.push('CheckRedirect: func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }');
    out.push(cl.length ? `\tclient := &http.Client{\n\t\t${cl.join(',\n\t\t')},\n\t}` : '\tclient := &http.Client{}');
    out.push(...B);
    out.push(`\treq, err := http.NewRequest(${goStr(r.method)}, ${goStr(r.url)}, ${bodyVar})`, '\tif err != nil {', '\t\tlog.Fatal(err)', '\t}');
    for (const [k, v] of r.headers) out.push(`\treq.Header.Set(${goStr(k)}, ${goStr(v)})`);
    if (r.form.length) out.push('\treq.Header.Set("Content-Type", w.FormDataContentType())');
    if (r.user) { const k = r.user.indexOf(':'); out.push(`\treq.SetBasicAuth(${goStr(k < 0 ? r.user : r.user.slice(0, k))}, ${goStr(k < 0 ? '' : r.user.slice(k + 1))})`); }
    out.push('\tresp, err := client.Do(req)', '\tif err != nil {', '\t\tlog.Fatal(err)', '\t}', '\tdefer resp.Body.Close()', '\tdata, err := io.ReadAll(resp.Body)', '\tif err != nil {', '\t\tlog.Fatal(err)', '\t}', '\tfmt.Printf("%s\\n%s\\n", resp.Status, data)', '}');
    return out.join('\n') + '\n';
  },
});

// ============================================================ SVG helpers (Android VectorDrawable, SwiftUI Shape)
const xmlAttrs = (s) => { const a = {}; s.replace(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_, k, v1, v2) => { a[k] = v1 ?? v2; }); return a; };
function svgParse(src) {
  src = src.replace(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(style|script|defs|metadata|title|desc)\b[\s\S]*?<\/\1>/gi, '');
  const root = { tag: '#root', a: {}, kids: [] }, st = [root];
  const re = /<(\/?)([\w:-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1]) { if (st.length > 1) st.pop(); continue; }
    const n = { tag: m[2].toLowerCase(), a: xmlAttrs(m[3]), kids: [] };
    st[st.length - 1].kids.push(n);
    if (!m[4]) st.push(n);
  }
  const svg = root.kids.find((k) => k.tag === 'svg');
  if (!svg) throw new Error('No <svg> root element found');
  let vb = (svg.a.viewBox || '').trim().split(/[\s,]+/).map(Number);
  const wh = (k) => { const v = parseFloat(svg.a[k]); return Number.isFinite(v) ? v : NaN; };
  if (vb.length !== 4 || vb.some((x) => !Number.isFinite(x))) { const w = wh('width') || 24, h = wh('height') || 24; vb = [0, 0, w, h]; }
  return { svg, vb, w: wh('width') || vb[2], h: wh('height') || vb[3] };
}
function shapeD(n) {
  const a = n.a, f = (k, d = 0) => { const v = parseFloat(a[k]); return Number.isFinite(v) ? v : d; };
  const ell = (cx, cy, rx, ry) => `M${fmt(cx - rx)} ${fmt(cy)}A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx + rx)} ${fmt(cy)}A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx - rx)} ${fmt(cy)}Z`;
  switch (n.tag) {
    case 'path': return a.d || '';
    case 'rect': {
      const x = f('x'), y = f('y'), w = f('width'), h = f('height');
      let rx = f('rx', f('ry')), ry = f('ry', rx);
      rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (!w || !h) return '';
      if (!rx && !ry) return `M${fmt(x)} ${fmt(y)}H${fmt(x + w)}V${fmt(y + h)}H${fmt(x)}Z`;
      const A = (dx, dy) => `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(dx)} ${fmt(dy)}`;
      return `M${fmt(x + rx)} ${fmt(y)}H${fmt(x + w - rx)}${A(x + w, y + ry)}V${fmt(y + h - ry)}${A(x + w - rx, y + h)}H${fmt(x + rx)}${A(x, y + h - ry)}V${fmt(y + ry)}${A(x + rx, y)}Z`;
    }
    case 'circle': return f('r') > 0 ? ell(f('cx'), f('cy'), f('r'), f('r')) : '';
    case 'ellipse': return f('rx') > 0 && f('ry') > 0 ? ell(f('cx'), f('cy'), f('rx'), f('ry')) : '';
    case 'line': return `M${fmt(f('x1'))} ${fmt(f('y1'))}L${fmt(f('x2'))} ${fmt(f('y2'))}`;
    case 'polyline': case 'polygon': {
      const p = (a.points || '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
      if (p.length < 4) return '';
      let d = 'M' + p[0] + ' ' + p[1];
      for (let i = 2; i + 1 < p.length; i += 2) d += 'L' + p[i] + ' ' + p[i + 1];
      return d + (n.tag === 'polygon' ? 'Z' : '');
    }
    default: return null;
  }
}
// SVG path data -> absolute M/L/C/Q/Z segments (arcs converted to cubic Beziers)
function arcToC(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  if (rx === 0 || ry === 0) return [['L', x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const p = phi * Math.PI / 180, cp = Math.cos(p), sp = Math.sin(p);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  const lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const nu = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, de = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, nu / de)); if (fa === fs) co = -co;
  const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dth > 0) dth -= 2 * Math.PI; else if (fs && dth < 0) dth += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9)), d = dth / n, t = 4 / 3 * Math.tan(d / 4);
  const P = (a) => [cx + cp * rx * Math.cos(a) - sp * ry * Math.sin(a), cy + sp * rx * Math.cos(a) + cp * ry * Math.sin(a)];
  const D = (a) => [-cp * rx * Math.sin(a) - sp * ry * Math.cos(a), -sp * rx * Math.sin(a) + cp * ry * Math.cos(a)];
  const out = [];
  for (let k = 0; k < n; k++) {
    const a1 = th1 + k * d, a2 = a1 + d, p1 = P(a1), p2 = P(a2), d1 = D(a1), d2 = D(a2);
    out.push(['C', p1[0] + t * d1[0], p1[1] + t * d1[1], p2[0] - t * d2[0], p2[1] - t * d2[1], k === n - 1 ? x2 : p2[0], k === n - 1 ? y2 : p2[1]]);
  }
  return out;
}
function pathSegs(d) {
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, lx = 0, ly = 0, prev = '', cmd = '';
  const out = [];
  const ws = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const nm = () => { ws(); const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(d.slice(i, i + 40)); if (!m) throw new Error('Bad path data near "' + d.slice(i, i + 12) + '"'); i += m[0].length; return +m[0]; };
  const fl = () => { ws(); const c = d[i++]; if (c !== '0' && c !== '1') throw new Error('Bad arc flag in path data'); return +c; };
  for (;;) {
    ws(); if (i >= d.length) break;
    if (/[a-zA-Z]/.test(d[i])) cmd = d[i++];
    else if (!cmd || /z/i.test(cmd)) throw new Error('Bad path data near "' + d.slice(i, i + 12) + '"');
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (C === 'M') { const x = nm() + ox, y = nm() + oy; out.push(['M', x, y]); cx = sx = x; cy = sy = y; cmd = rel ? 'l' : 'L'; prev = 'M'; continue; }
    if (C === 'L') { const x = nm() + ox, y = nm() + oy; out.push(['L', x, y]); cx = x; cy = y; }
    else if (C === 'H') { const x = nm() + ox; out.push(['L', x, cy]); cx = x; }
    else if (C === 'V') { const y = nm() + oy; out.push(['L', cx, y]); cy = y; }
    else if (C === 'C') { const a = [nm() + ox, nm() + oy, nm() + ox, nm() + oy, nm() + ox, nm() + oy]; out.push(['C', ...a]); lx = a[2]; ly = a[3]; cx = a[4]; cy = a[5]; }
    else if (C === 'S') { const x1 = prev === 'C' ? 2 * cx - lx : cx, y1 = prev === 'C' ? 2 * cy - ly : cy; const a = [nm() + ox, nm() + oy, nm() + ox, nm() + oy]; out.push(['C', x1, y1, ...a]); lx = a[0]; ly = a[1]; cx = a[2]; cy = a[3]; }
    else if (C === 'Q') { const a = [nm() + ox, nm() + oy, nm() + ox, nm() + oy]; out.push(['Q', ...a]); lx = a[0]; ly = a[1]; cx = a[2]; cy = a[3]; }
    else if (C === 'T') { const x1 = prev === 'Q' ? 2 * cx - lx : cx, y1 = prev === 'Q' ? 2 * cy - ly : cy; const x = nm() + ox, y = nm() + oy; out.push(['Q', x1, y1, x, y]); lx = x1; ly = y1; cx = x; cy = y; }
    else if (C === 'A') { const rx = nm(), ry = nm(), ph = nm(), fa = fl(), fs = fl(), x = nm() + ox, y = nm() + oy; out.push(...arcToC(cx, cy, rx, ry, ph, fa, fs, x, y)); cx = x; cy = y; }
    else if (C === 'Z') { out.push(['Z']); cx = sx; cy = sy; }
    else throw new Error('Unknown path command "' + cmd + '"');
    prev = C === 'S' ? 'C' : C === 'T' ? 'Q' : C;
  }
  return out;
}
const svgColor = (v, op = 1) => {
  if (v == null) return null;
  v = String(v).trim().toLowerCase();
  if (v === 'none' || v === 'transparent' || v === '') return null;
  if (v === 'currentcolor') v = '#000000';
  const NAMES = { black: '000000', white: 'ffffff', red: 'ff0000', green: '008000', lime: '00ff00', blue: '0000ff', yellow: 'ffff00', gray: '808080', grey: '808080', orange: 'ffa500', purple: '800080', pink: 'ffc0cb', cyan: '00ffff', aqua: '00ffff', magenta: 'ff00ff', fuchsia: 'ff00ff', brown: 'a52a2a', navy: '000080', teal: '008080', silver: 'c0c0c0', maroon: '800000', olive: '808000' };
  let r, g, b, a = 1, m;
  if (NAMES[v]) v = '#' + NAMES[v];
  if ((m = /^#([0-9a-f]{3,8})$/.exec(v))) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return undefined;
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16); if (h.length === 8) a = parseInt(h.slice(6), 16) / 255;
  } else if ((m = /^rgba?\(([^)]+)\)/.exec(v))) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map((x) => (x.endsWith('%') ? parseFloat(x) * (x === m[1].split(/[\s,/]+/)[3] ? 0.01 : 2.55) : parseFloat(x)));
    [r, g, b] = p; if (p.length > 3) a = p[3];
  } else return undefined;
  const h2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase();
  return '#' + h2(a * op * 255) + h2(r) + h2(g) + h2(b);
};
const PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'fill-rule', 'fill-opacity', 'stroke-opacity', 'opacity'];
const effProps = (n, inh) => {
  const p = { ...inh };
  for (const k of PROPS) if (n.a[k] != null) p[k] = n.a[k];
  if (n.a.style) for (const decl of n.a.style.split(';')) { const k = decl.indexOf(':'); if (k > 0) { const key = decl.slice(0, k).trim(); if (PROPS.includes(key)) p[key] = decl.slice(k + 1).trim(); } }
  if (n.a.display === 'none' || /display\s*:\s*none/.test(n.a.style || '')) p.hidden = true;
  return p;
};
const parseTransform = (s) => {
  const out = [];
  (s || '').replace(/(\w+)\s*\(([^)]*)\)/g, (_, f, a) => { out.push([f, a.split(/[\s,]+/).filter(Boolean).map(Number)]); });
  return out;
};
const SKIP_TAGS = new Set(['defs', 'clippath', 'mask', 'symbol', 'lineargradient', 'radialgradient', 'filter', 'style', 'title', 'desc', 'metadata']);

T.push({
  id: 'svg-to-android-vector', cat: 'Converters++', title: 'SVG to Android VectorDrawable', desc: 'Convert SVG path/rect/circle/ellipse/line/polyline/polygon and groups (translate/scale/rotate) to an Android VectorDrawable XML. Solid fills/strokes only; gradients, clip paths, masks and CSS <style> are not converted (warnings are listed).',
  labels: ['SVG'], sample: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><g transform="translate(2 2)"><path d="M12 2L2 7l10 5 10-5-10-5z" fill="#1565C0"/></g><circle cx="12" cy="16" r="4" fill="none" stroke="#e91e63" stroke-width="2" stroke-linecap="round"/><rect x="1" y="1" width="6" height="6" rx="1" fill-opacity="0.5" fill="red"/></svg>',
  opts: [txt('dp', 'Size unit', 'dp'), chk('tint', 'Add android:tint="?attr/colorControlNormal" (single-color icons)', false)],
  run: ([s], o) => {
    const { svg, vb, w, h } = svgParse(s);
    const warn = [];
    if (/<style\b/i.test(s)) warn.push('CSS <style> rules are ignored; use presentation attributes.');
    if (/<(linearGradient|radialGradient)/i.test(s)) warn.push('Gradients are not converted; elements referencing url(#...) fill are dropped or shown as no fill.');
    if (/<(clipPath|mask)/i.test(s)) warn.push('clipPath/mask are ignored.');
    const out = [];
    const walk = (n, inh, depth) => {
      const ind = '    '.repeat(depth);
      if (SKIP_TAGS.has(n.tag)) return;
      const p = effProps(n, inh);
      if (p.hidden) return;
      const tf = parseTransform(n.a.transform);
      let open = 0;
      for (const [f, a] of tf) {
        const I = '    '.repeat(depth + open);
        if (f === 'translate') out.push(`${I}<group android:translateX="${fmt(a[0] || 0)}" android:translateY="${fmt(a[1] || 0)}">`);
        else if (f === 'scale') out.push(`${I}<group android:scaleX="${fmt(a[0] ?? 1)}" android:scaleY="${fmt(a[1] ?? a[0] ?? 1)}">`);
        else if (f === 'rotate') out.push(`${I}<group android:rotation="${fmt(a[0] || 0)}" android:pivotX="${fmt(a[1] || 0)}" android:pivotY="${fmt(a[2] || 0)}">`);
        else { warn.push(`transform ${f}() is not supported on <${n.tag}> and was skipped.`); continue; }
        open++;
      }
      const I = '    '.repeat(depth + open);
      if (n.tag === 'g' || n.tag === 'svg' || n.tag === 'a') for (const k of n.kids) walk(k, p, depth + open);
      else {
        const d = shapeD(n);
        if (d === null) warn.push(`<${n.tag}> is not supported and was skipped.`);
        else if (d) {
          const op = p.opacity != null ? parseFloat(p.opacity) : 1;
          const fillRaw = p.fill == null ? '#000' : p.fill, fill = /^url\(/.test(fillRaw) ? null : svgColor(fillRaw, op * (p['fill-opacity'] != null ? parseFloat(p['fill-opacity']) : 1));
          const stroke = p.stroke == null || /^url\(/.test(p.stroke) ? null : svgColor(p.stroke, op * (p['stroke-opacity'] != null ? parseFloat(p['stroke-opacity']) : 1));
          if (fill === undefined || stroke === undefined) warn.push(`Unrecognised color on <${n.tag}> was dropped.`);
          const at = [`android:pathData="${d.replace(/\s+/g, ' ').replace(/&/g, '&amp;')}"`];
          if (fill) at.push(`android:fillColor="${fill}"`);
          if (p['fill-rule'] === 'evenodd') at.push('android:fillType="evenOdd"');
          if (stroke) {
            at.push(`android:strokeColor="${stroke}"`, `android:strokeWidth="${fmt(parseFloat(p['stroke-width'] ?? 1))}"`);
            if (p['stroke-linecap'] && p['stroke-linecap'] !== 'butt') at.push(`android:strokeLineCap="${p['stroke-linecap']}"`);
            if (p['stroke-linejoin'] && p['stroke-linejoin'] !== 'miter') at.push(`android:strokeLineJoin="${p['stroke-linejoin']}"`);
            if (p['stroke-miterlimit']) at.push(`android:strokeMiterLimit="${p['stroke-miterlimit']}"`);
          }
          if (fill || stroke) out.push(`${I}<path\n${I}    ${at.join('\n' + I + '    ')} />`);
        }
      }
      for (let k = open - 1; k >= 0; k--) out.push(`${'    '.repeat(depth + k)}</group>`);
    };
    walk(svg, {}, 1);
    if (!out.length) throw new Error('No convertible shapes found in the SVG');
    const u = o.dp || 'dp';
    const head = ['<vector xmlns:android="http://schemas.android.com/apk/res/android"', `    android:width="${fmt(w)}${u}"`, `    android:height="${fmt(h)}${u}"`, `    android:viewportWidth="${fmt(vb[2])}"`, `    android:viewportHeight="${fmt(vb[3])}"` + (o.tint ? '\n    android:tint="?attr/colorControlNormal">' : '>')];
    if (vb[0] || vb[1]) { out.unshift(`    <group android:translateX="${fmt(-vb[0])}" android:translateY="${fmt(-vb[1])}">`); out.push('    </group>'); }
    return head.join('\n') + '\n' + out.join('\n') + '\n</vector>' + (warn.length ? '\n\n<!-- Warnings:\n' + [...new Set(warn)].map((x) => ' - ' + x).join('\n') + '\n-->' : '');
  },
});

const matMul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const tfMatrix = (list) => {
  let m = [1, 0, 0, 1, 0, 0];
  for (const [f, a] of list) {
    let n;
    if (f === 'translate') n = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
    else if (f === 'scale') n = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (f === 'rotate') { const r = (a[0] || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), cx = a[1] || 0, cy = a[2] || 0; n = [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]; }
    else if (f === 'matrix' && a.length === 6) n = a;
    else if (f === 'skewX') n = [1, 0, Math.tan((a[0] || 0) * Math.PI / 180), 1, 0, 0];
    else if (f === 'skewY') n = [1, Math.tan((a[0] || 0) * Math.PI / 180), 0, 1, 0, 0];
    else continue;
    m = matMul(m, n);
  }
  return m;
};
T.push({
  id: 'svg-to-swiftui-shape', cat: 'Converters++', title: 'SVG to SwiftUI Shape', desc: 'Convert SVG shapes and paths (all commands incl. arcs, which become cubic curves; transforms are baked in) into a SwiftUI Shape struct that scales to its frame. Fill/stroke colors are not copied: style the Shape in SwiftUI.',
  labels: ['SVG'], sample: '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><circle cx="12" cy="17" r="3"/><path d="M4 12a8 8 0 0 0 16 0" /></svg>',
  opts: [txt('name', 'Struct name', 'IconShape')],
  run: ([s], o) => {
    const { svg, vb } = svgParse(s);
    const body = [];
    const P = (m, x, y) => { const X = m[0] * x + m[2] * y + m[4] - vb[0], Y = m[1] * x + m[3] * y + m[5] - vb[1]; return `p(${fmt(X)}, ${fmt(Y)})`; };
    let eo = false, nPaths = 0;
    const walk = (n, mat) => {
      if (SKIP_TAGS.has(n.tag)) return;
      const m = matMul(mat, tfMatrix(parseTransform(n.a.transform)));
      if (n.tag === 'g' || n.tag === 'svg' || n.tag === 'a') { for (const k of n.kids) walk(k, m); return; }
      const d = shapeD(n);
      if (!d) return;
      if (/evenodd/.test(n.a['fill-rule'] || '') || /evenodd/.test(n.a.style || '')) eo = true;
      nPaths++;
      for (const g of pathSegs(d)) {
        if (g[0] === 'M') body.push(`path.move(to: ${P(m, g[1], g[2])})`);
        else if (g[0] === 'L') body.push(`path.addLine(to: ${P(m, g[1], g[2])})`);
        else if (g[0] === 'C') body.push(`path.addCurve(to: ${P(m, g[5], g[6])}, control1: ${P(m, g[1], g[2])}, control2: ${P(m, g[3], g[4])})`);
        else if (g[0] === 'Q') body.push(`path.addQuadCurve(to: ${P(m, g[3], g[4])}, control: ${P(m, g[1], g[2])})`);
        else body.push('path.closeSubpath()');
      }
    };
    walk(svg, [1, 0, 0, 1, 0, 0]);
    if (!nPaths) throw new Error('No convertible shapes found in the SVG');
    const name = pascal(o.name || 'IconShape');
    return `import SwiftUI

struct ${name}: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let sx = rect.width / ${fmt(vb[2])}
        let sy = rect.height / ${fmt(vb[3])}
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + x * sx, y: rect.minY + y * sy)
        }
${body.map((l) => '        ' + l).join('\n')}
        return path
    }
}
${eo ? '\n// This SVG used fill-rule="evenodd": draw it with .fill(style: FillStyle(eoFill: true))\n' : ''}
// Usage: ${name}().fill(Color.blue).frame(width: 48, height: 48)`;
  },
});

// ============================================================ Crypto: Keccak helpers, BLAKE3, storage slots, bech32, EIP-191, Ed25519, CSR, Argon2 planner
const M64 = (1n << 64n) - 1n;
const K_RC = [], K_ROT = new Array(25).fill(0);
{
  let R = 1;
  for (let i = 0; i < 24; i++) {
    let c = 0n;
    for (let j = 0; j < 7; j++) { const bit = R & 1; R = R & 0x80 ? ((R << 1) ^ 0x71) & 0xff : (R << 1) & 0xff; if (bit) c |= 1n << BigInt((1 << j) - 1); }
    K_RC.push(c);
  }
  let x = 1, y = 0;
  for (let t = 0; t < 24; t++) { K_ROT[x + 5 * y] = (((t + 1) * (t + 2)) / 2) % 64; [x, y] = [y, (2 * x + 3 * y) % 5]; }
}
const rotl64 = (v, n) => { n = BigInt(n); return n ? ((v << n) | (v >> (64n - n))) & M64 : v; };
function keccakF(A) {
  for (let r = 0; r < 24; r++) {
    const C = [0, 1, 2, 3, 4].map((x) => A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20]);
    for (let x = 0; x < 5; x++) { const D = C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1); for (let y = 0; y < 5; y++) A[x + 5 * y] ^= D; }
    const B = new Array(25);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl64(A[x + 5 * y], K_ROT[x + 5 * y]);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A[x + 5 * y] = B[x + 5 * y] ^ (~B[(x + 1) % 5 + 5 * y] & B[(x + 2) % 5 + 5 * y]);
    A[0] ^= K_RC[r];
  }
}
function keccak256(u) {
  const rate = 136, n = Math.floor(u.length / rate) + 1, buf = new Uint8Array(n * rate);
  buf.set(u); buf[u.length] ^= 1; buf[n * rate - 1] ^= 0x80;
  const A = new Array(25).fill(0n);
  for (let off = 0; off < buf.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) { let v = 0n; for (let j = 7; j >= 0; j--) v = (v << 8n) | BigInt(buf[off + i * 8 + j]); A[i] ^= v; }
    keccakF(A);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = Number((A[i >> 3] >> BigInt(8 * (i & 7))) & 0xffn);
  return out;
}
const big2bytes = (v, n = 32) => { const o = new Uint8Array(n); for (let i = n - 1; i >= 0; i--) { o[i] = Number(v & 0xffn); v >>= 8n; } return o; };
const bytes2big = (u) => u.reduce((a, b) => (a << 8n) | BigInt(b), 0n);
const checksumAddr = (a20) => {
  const h = hex(a20), k = hex(keccak256(enc.encode(h)));
  return '0x' + [...h].map((c, i) => (parseInt(k[i], 16) >= 8 ? c.toUpperCase() : c)).join('');
};

// ---- BLAKE3
const B3IV = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19];
const B3PERM = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];
const rotr32 = (x, n) => (x >>> n) | (x << (32 - n));
function b3compress(cv, m, ctr, blen, flags) {
  const s = new Uint32Array(16);
  s.set(cv.slice(0, 8)); s.set(B3IV.slice(0, 4), 8);
  s[12] = ctr % 4294967296; s[13] = Math.floor(ctr / 4294967296); s[14] = blen; s[15] = flags;
  let w = Uint32Array.from(m);
  const g = (a, b, c, d, x, y) => {
    s[a] = s[a] + s[b] + x; s[d] = rotr32(s[d] ^ s[a], 16); s[c] = s[c] + s[d]; s[b] = rotr32(s[b] ^ s[c], 12);
    s[a] = s[a] + s[b] + y; s[d] = rotr32(s[d] ^ s[a], 8); s[c] = s[c] + s[d]; s[b] = rotr32(s[b] ^ s[c], 7);
  };
  for (let r = 0; r < 7; r++) {
    g(0, 4, 8, 12, w[0], w[1]); g(1, 5, 9, 13, w[2], w[3]); g(2, 6, 10, 14, w[4], w[5]); g(3, 7, 11, 15, w[6], w[7]);
    g(0, 5, 10, 15, w[8], w[9]); g(1, 6, 11, 12, w[10], w[11]); g(2, 7, 8, 13, w[12], w[13]); g(3, 4, 9, 14, w[14], w[15]);
    if (r < 6) w = Uint32Array.from(B3PERM, (p) => w[p]);
  }
  for (let i = 0; i < 8; i++) { s[i] ^= s[i + 8]; s[i + 8] ^= cv[i]; }
  return s;
}
const b3words = (blk) => { const p = new Uint8Array(64); p.set(blk); const dv = new DataView(p.buffer); return Array.from({ length: 16 }, (_, i) => dv.getUint32(i * 4, true)); };
function blake3(data, { key = B3IV, flags = 0, outLen = 32 } = {}) {
  const chunkOut = (idx, d) => {
    let cv = key;
    const nb = Math.max(1, Math.ceil(d.length / 64));
    for (let b = 0; b < nb; b++) {
      const blk = d.subarray(b * 64, b * 64 + 64), words = b3words(blk), fl = flags | (b === 0 ? 1 : 0) | (b === nb - 1 ? 2 : 0);
      if (b === nb - 1) return { cv, m: words, ctr: idx, blen: blk.length, fl };
      cv = Array.from(b3compress(cv, words, idx, 64, fl).subarray(0, 8));
    }
  };
  const cvOf = (o) => Array.from(b3compress(o.cv, o.m, o.ctr, o.blen, o.fl).subarray(0, 8));
  const sub = (i, n) => {
    if (n === 1) return chunkOut(i, data.subarray(i * 1024, i * 1024 + 1024));
    const l = 1 << (31 - Math.clz32(n - 1));
    return { cv: key, m: [...cvOf(sub(i, l)), ...cvOf(sub(i + l, n - l))], ctr: 0, blen: 64, fl: flags | 4 };
  };
  const root = sub(0, Math.max(1, Math.ceil(data.length / 1024)));
  const out = new Uint8Array(Math.ceil(outLen / 64) * 64), dv = new DataView(out.buffer);
  for (let t = 0; t * 64 < outLen; t++) {
    const w = b3compress(root.cv, root.m, t, root.blen, root.fl | 8);
    for (let i = 0; i < 16; i++) dv.setUint32(t * 64 + i * 4, w[i], true);
  }
  return out.slice(0, outLen);
}
const b3derive = (ctx, material, outLen) => {
  const ck = blake3(enc.encode(ctx), { flags: 32 });
  const dv = new DataView(ck.buffer);
  return blake3(material, { key: Array.from({ length: 8 }, (_, i) => dv.getUint32(i * 4, true)), flags: 64, outLen });
};
T.push({
  id: 'blake3-hash-generator', cat: 'Crypto+', title: 'BLAKE3 Hash Generator', desc: 'Hand-written BLAKE3 (hash, keyed_hash and derive_key modes, extendable output of any length). Input as UTF-8 text or hex bytes.',
  labels: ['Input'], sample: 'hello world',
  opts: [sel('mode', 'Mode', 'hash', ['hash', 'keyed_hash', 'derive_key']), sel('inp', 'Input is', 'text', ['text', 'hex']), num('len', 'Output length (bytes)', 32), txt('key', 'Key (64 hex chars, keyed_hash)', ''), txt('ctx', 'Context string (derive_key)', 'my-app 2024 session tokens')],
  run: ([s], o) => {
    const data = o.inp === 'hex' ? unhex(s) : enc.encode(s), len = Math.floor(o.len);
    if (!(len >= 1 && len <= 1 << 20)) throw new Error('Output length must be between 1 and 1048576 bytes');
    let out;
    if (o.mode === 'keyed_hash') {
      const k = unhex(o.key);
      if (k.length !== 32) throw new Error('Key must be exactly 32 bytes (64 hex characters)');
      const dv = new DataView(k.buffer);
      out = blake3(data, { key: Array.from({ length: 8 }, (_, i) => dv.getUint32(i * 4, true)), flags: 16, outLen: len });
    } else if (o.mode === 'derive_key') out = b3derive(o.ctx, data, len);
    else out = blake3(data, { outLen: len });
    return `BLAKE3 (${o.mode}, ${len} bytes)\n${hex(out)}`;
  },
});

// ---- Solidity storage slot calculator
const keyBytes = (k) => {
  if (k.startsWith('s:')) return { raw: enc.encode(k.slice(2)) };
  if (k.startsWith('r:')) { const u = unhex(k.slice(2)); if (u.length > 32) throw new Error('bytesN key longer than 32 bytes'); const o = new Uint8Array(32); o.set(u); return { word: o }; }
  if (/^0x/i.test(k)) { const u = unhex(k); if (u.length > 32) throw new Error('Key longer than 32 bytes: ' + k); const o = new Uint8Array(32); o.set(u, 32 - u.length); return { word: o }; }
  if (/^-?\d+$/.test(k)) { let v = BigInt(k); if (v < 0n) v += 1n << 256n; return { word: big2bytes(v) }; }
  if (k === 'true' || k === 'false') return { word: big2bytes(k === 'true' ? 1n : 0n) };
  throw new Error(`Cannot parse key "${k}" (use 0x.., decimal, true/false, s:text for string keys, r:0x.. for bytesN)`);
};
const slotWord = (x) => { if (x instanceof Uint8Array) return x; if (/^0x/i.test(x)) { const u = unhex(x); const o = new Uint8Array(32); o.set(u, 32 - u.length); return o; } return big2bytes(BigInt(x)); };
T.push({
  id: 'ethereum-abi-storage-slot-calculator', cat: 'Crypto+', title: 'Solidity Storage Slot Calculator', desc: 'Compute storage slots: mapping (nested keys), dynamic array elements, string/bytes data start, struct offsets, EIP-1967 proxy slots and ERC-7201 namespaced storage. Keccak-256 is hand-written.',
  labels: ['Slot expressions (one per line)'],
  placeholder: ['mapping 0 0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B'],
  sample: 'mapping 0 0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B\nmapping 1 5 0x0000000000000000000000000000000000000001\narray 2 3\narray 2 3 2\ndata 3\nadd 7 2\neip1967 implementation\nerc7201 example.main\nmapping 4 s:alice',
  run: ([s]) => {
    const rows = [];
    for (const l of lines(s)) {
      const p = l.split(/\s+/), cmd = p[0].toLowerCase();
      let r;
      if (cmd === 'mapping') {
        if (p.length < 3) throw new Error(`"${l}": usage  mapping <slot> <key> [key2 ...]`);
        let slot = slotWord(p[1]);
        for (const k of p.slice(2)) { const kb = keyBytes(k); slot = keccak256(cat(kb.raw || kb.word, slot)); }
        r = slot;
      } else if (cmd === 'array') {
        if (p.length < 3) throw new Error(`"${l}": usage  array <slot> <index> [slotsPerElement]`);
        r = big2bytes((bytes2big(keccak256(slotWord(p[1]))) + BigInt(p[2]) * BigInt(p[3] || 1)) % (1n << 256n));
      } else if (cmd === 'data') r = keccak256(slotWord(p[1]));
      else if (cmd === 'add') r = big2bytes((bytes2big(slotWord(p[1])) + BigInt(p[2])) % (1n << 256n));
      else if (cmd === 'eip1967') {
        const id = { implementation: 'eip1967.proxy.implementation', admin: 'eip1967.proxy.admin', beacon: 'eip1967.proxy.beacon', rollback: 'eip1967.proxy.rollback' }[p[1]];
        if (!id) throw new Error('eip1967 <implementation|admin|beacon|rollback>');
        r = big2bytes(bytes2big(keccak256(enc.encode(id))) - 1n);
      } else if (cmd === 'erc7201') {
        if (p.length < 2) throw new Error('erc7201 <namespace id>');
        const inner = big2bytes(bytes2big(keccak256(enc.encode(l.slice(8).trim()))) - 1n);
        r = big2bytes(bytes2big(keccak256(inner)) & ~0xffn);
      } else if (cmd === 'minus1') r = big2bytes(bytes2big(keccak256(enc.encode(l.slice(7).trim()))) - 1n);
      else throw new Error(`Unknown command "${p[0]}" (mapping, array, data, add, eip1967, erc7201, minus1)`);
      rows.push(`${l}\n  => 0x${hex(r)}   (decimal ${bytes2big(r)})`);
    }
    if (!rows.length) throw new Error('Enter at least one expression');
    return rows.join('\n\n') + '\n\nRules: mapping slot = keccak256(pad32(key) ++ pad32(slot)); string keys use raw bytes (s:text). Array element = keccak256(slot) + index * slotsPerElement. minus1 = keccak256(text) - 1.';
  },
});

// ---- Bech32 / Bech32m / SegWit
const B32A = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const b32poly = (v) => { const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; let c = 1; for (const x of v) { const b = c >>> 25; c = (((c & 0x1ffffff) << 5) ^ x) >>> 0; for (let i = 0; i < 5; i++) if ((b >> i) & 1) c = (c ^ G[i]) >>> 0; } return c; };
const b32exp = (h) => [...h].map((c) => c.charCodeAt(0) >> 5).concat([0], [...h].map((c) => c.charCodeAt(0) & 31));
const b32cs = (hrp, data, k) => { const p = (b32poly(b32exp(hrp).concat(data, [0, 0, 0, 0, 0, 0])) ^ k) >>> 0; return Array.from({ length: 6 }, (_, i) => (p >>> (5 * (5 - i))) & 31); };
const convBits = (data, from, to, pad) => {
  let acc = 0, bits = 0; const out = [], mx = (1 << to) - 1;
  for (const v of data) { if (v >> from) return null; acc = (acc << from) | v; bits += from; while (bits >= to) { bits -= to; out.push((acc >> bits) & mx); } acc &= (1 << bits) - 1; }
  if (pad) { if (bits) out.push((acc << (to - bits)) & mx); } else if (bits >= from || (acc << (to - bits)) & mx) return null;
  return out;
};
function bech32Decode(str) {
  if (str !== str.toLowerCase() && str !== str.toUpperCase()) throw new Error('Mixed-case string is invalid');
  str = str.toLowerCase();
  const pos = str.lastIndexOf('1');
  if (pos < 1 || pos + 7 > str.length) throw new Error('Missing separator "1", empty HRP or checksum too short');
  const hrp = str.slice(0, pos), d = [];
  for (const c of str.slice(pos + 1)) { const i = B32A.indexOf(c); if (i < 0) throw new Error(`Invalid character "${c}"`); d.push(i); }
  for (const c of hrp) if (c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126) throw new Error('Invalid HRP character');
  const pm = b32poly(b32exp(hrp).concat(d));
  const kind = pm === 1 ? 'bech32' : pm === 0x2bc830a3 ? 'bech32m' : null;
  if (!kind) throw new Error('Invalid checksum');
  return { hrp, data: d.slice(0, -6), kind };
}
T.push({
  id: 'bitcoin-bech32-address-encoder', cat: 'Crypto+', title: 'Bech32 / SegWit Address Encoder & Decoder', desc: 'Decode or encode Bech32 (BIP-173) and Bech32m (BIP-350) strings: Bitcoin SegWit/Taproot addresses (bc1, tb1), also generic bech32 such as npub or lightning HRPs. Shows witness version, program and scriptPubKey.',
  labels: ['Address(es) to decode, or hex witness programs to encode'], sample: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4\nbc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0',
  opts: [sel('mode', 'Mode', 'decode', ['decode', 'encode']), txt('hrp', 'HRP (encode)', 'bc'), num('ver', 'Witness version (encode)', 0)],
  run: ([s], o) => {
    const out = [];
    for (const l of lines(s)) {
      if (o.mode === 'encode') {
        const prog = unhex(l), v = Math.floor(o.ver);
        if (!(v >= 0 && v <= 16)) throw new Error('Witness version must be 0..16');
        if (prog.length < 2 || prog.length > 40) throw new Error('Witness program must be 2..40 bytes');
        if (v === 0 && prog.length !== 20 && prog.length !== 32) throw new Error('Version 0 programs must be 20 bytes (P2WPKH) or 32 bytes (P2WSH)');
        const data = [v, ...convBits(prog, 8, 5, true)], k = v === 0 ? 1 : 0x2bc830a3, hrp = (o.hrp || 'bc').toLowerCase();
        out.push(hrp + '1' + data.concat(b32cs(hrp, data, k)).map((x) => B32A[x]).join(''));
        continue;
      }
      const { hrp, data, kind } = bech32Decode(l);
      const L = [`${l}`, `  HRP: ${hrp}   checksum: ${kind}   data length: ${data.length} five-bit groups`];
      const ver = data[0], prog = data.length ? convBits(data.slice(1), 5, 8, false) : null;
      if ((hrp === 'bc' || hrp === 'tb' || hrp === 'bcrt') && prog && ver <= 16) {
        if (prog.length < 2 || prog.length > 40) throw new Error('Invalid witness program length ' + prog.length);
        if (ver === 0 && kind !== 'bech32') throw new Error('Version 0 requires Bech32 (got Bech32m)');
        if (ver > 0 && kind !== 'bech32m') throw new Error('Version 1+ requires Bech32m (got Bech32)');
        if (ver === 0 && prog.length !== 20 && prog.length !== 32) throw new Error('Version 0 program must be 20 or 32 bytes');
        const type = ver === 0 ? (prog.length === 20 ? 'P2WPKH' : 'P2WSH') : ver === 1 && prog.length === 32 ? 'P2TR (Taproot)' : 'future witness version';
        const spk = [ver ? 0x50 + ver : 0, prog.length, ...prog];
        L.push(`  Network: ${{ bc: 'mainnet', tb: 'testnet/signet', bcrt: 'regtest' }[hrp]}   witness version: ${ver}   type: ${type}`, `  Witness program: ${hex(Uint8Array.from(prog))}`, `  scriptPubKey: ${hex(Uint8Array.from(spk))}`);
      } else {
        const raw = convBits(data, 5, 8, false);
        L.push('  Not a SegWit address; payload as 8-bit bytes: ' + (raw ? hex(Uint8Array.from(raw)) : '(5-bit data does not pad cleanly)'));
      }
      out.push(L.join('\n'));
    }
    if (!out.length) throw new Error('Enter at least one value');
    return out.join('\n\n');
  },
});

// ---- secp256k1 + EIP-191 recover
const SP = 2n ** 256n - 2n ** 32n - 977n, SN = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const SG = [0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n, 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n];
const mod = (a, m = SP) => ((a % m) + m) % m;
const inv = (a, m = SP) => { let [r0, r1, s0, s1] = [mod(a, m), m, 1n, 0n]; while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; } return mod(s0, m); };
const powm = (b, e, m) => { let r = 1n; b %= m; while (e) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; };
const padd = (p, q) => {
  if (!p) return q; if (!q) return p;
  let l;
  if (p[0] === q[0]) { if (mod(p[1] + q[1]) === 0n) return null; l = mod(3n * p[0] * p[0] * inv(2n * p[1])); } else l = mod((q[1] - p[1]) * inv(q[0] - p[0]));
  const x = mod(l * l - p[0] - q[0]);
  return [x, mod(l * (p[0] - x) - p[1])];
};
const pmul = (k, p) => { let r = null; while (k > 0n) { if (k & 1n) r = padd(r, p); p = padd(p, p); k >>= 1n; } return r; };
function eth191Recover(msgBytes, sig) {
  if (sig.length !== 65) throw new Error('Signature must be 65 bytes (r || s || v) = 130 hex characters');
  const r = bytes2big(sig.slice(0, 32)), s = bytes2big(sig.slice(32, 64));
  let v = sig[64]; if (v >= 27) v -= 27;
  if (v > 1) throw new Error('Recovery id v must be 0/1 or 27/28');
  if (!(r > 0n && r < SN && s > 0n && s < SN)) throw new Error('r or s out of range');
  const y2 = mod(r ** 3n + 7n); let y = powm(y2, (SP + 1n) / 4n, SP);
  if (mod(y * y) !== y2) throw new Error('r is not a valid curve x-coordinate');
  if (Number(y & 1n) !== v) y = SP - y;
  const hash = keccak256(cat(enc.encode('\x19Ethereum Signed Message:\n' + msgBytes.length), msgBytes));
  const e = bytes2big(hash), ri = inv(r, SN);
  const Q = padd(pmul(mod(s * ri, SN), [r, y]), pmul(mod(-e * ri, SN), SG));
  if (!Q) throw new Error('Recovery failed');
  const pub = cat(big2bytes(Q[0]), big2bytes(Q[1]));
  return { hash, pub, addr: keccak256(pub).slice(12) };
}
T.push({
  id: 'ethereum-eip191-signature-verifier', cat: 'Crypto+', title: 'Ethereum Signed Message (EIP-191) Verifier', desc: 'Recover the signer address of a personal_sign / eth_sign (EIP-191 version 0x45) signature using hand-written secp256k1 and Keccak-256, and compare with an expected address.',
  inputs: 2, labels: ['Message', 'Signature (65 bytes hex: r, s, v)'],
  sample: 'hello', sample2: '0xf0669b520c8d103b26159c4f64a11d27d676e4f256aa980b351e9da4a666418146bc7f7c764ab84d788d6591e5f0b460259d237553d7a3e50db309865bfd36c01b',
  opts: [sel('fmt', 'Message is', 'text', ['text', 'hex bytes']), txt('addr', 'Expected address (optional)', '')],
  run: ([m, sg], o) => {
    if (!sg.trim()) throw new Error('Paste the 65-byte signature as hex');
    const msg = o.fmt === 'text' ? enc.encode(m) : unhex(m), r = eth191Recover(msg, unhex(sg));
    const addr = checksumAddr(r.addr), L = [`Recovered signer: ${addr}`, `Message hash (EIP-191): 0x${hex(r.hash)}`, `Public key (uncompressed, no 04 prefix): 0x${hex(r.pub)}`];
    if (o.addr.trim()) L.push(o.addr.trim().toLowerCase() === addr.toLowerCase() ? 'MATCH: the signature was made by the expected address.' : 'MISMATCH: the recovered signer differs from the expected address.');
    return L.join('\n');
  },
});

// ---- Ed25519 sign / verify
const ED_PKCS8 = unhex('302e020100300506032b657004220420');
T.push({
  id: 'ed25519-sign-verify', cat: 'Crypto+', title: 'Ed25519 Sign & Verify', desc: 'Generate an Ed25519 key pair, sign a message from a 32-byte hex seed, or verify a signature against a public key, using WebCrypto (needs a browser/runtime with Ed25519 support).',
  labels: ['Message'], sample: 'hello world',
  opts: [sel('mode', 'Mode', 'sign', ['sign', 'verify', 'generate']), sel('fmt', 'Message is', 'text', ['text', 'hex']), txt('seed', 'Private key seed (64 hex, sign)', '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'), txt('pub', 'Public key (64 hex, verify)', ''), txt('sig', 'Signature (128 hex, verify)', '')],
  run: async ([s], o) => {
    const sub = globalThis.crypto?.subtle;
    if (!sub) throw new Error('WebCrypto is not available');
    const msg = o.fmt === 'hex' ? unhex(s) : enc.encode(s);
    const rawPub = async (priv) => { const j = await sub.exportKey('jwk', priv); return Uint8Array.from(atob(j.x.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (j.x.length % 4)) % 4)), (c) => c.charCodeAt(0)); };
    try {
      if (o.mode === 'generate') {
        const kp = await sub.generateKey('Ed25519', true, ['sign', 'verify']);
        const p8 = new Uint8Array(await sub.exportKey('pkcs8', kp.privateKey));
        return `Seed (private): ${hex(p8.slice(-32))}\nPublic key:     ${hex(new Uint8Array(await sub.exportKey('raw', kp.publicKey)))}\n\n${pem('PRIVATE KEY', p8)}`;
      }
      if (o.mode === 'verify') {
        const pub = unhex(o.pub), sig = unhex(o.sig);
        if (pub.length !== 32) throw new Error('Public key must be 32 bytes (64 hex)');
        if (sig.length !== 64) throw new Error('Signature must be 64 bytes (128 hex)');
        const k = await sub.importKey('raw', pub, 'Ed25519', true, ['verify']);
        return (await sub.verify('Ed25519', k, sig, msg)) ? 'VALID signature' : 'INVALID signature';
      }
      const seed = unhex(o.seed);
      if (seed.length !== 32) throw new Error('Seed must be 32 bytes (64 hex)');
      const k = await sub.importKey('pkcs8', cat(ED_PKCS8, seed), 'Ed25519', true, ['sign']);
      const sig = new Uint8Array(await sub.sign('Ed25519', k, msg));
      return `Public key: ${hex(await rawPub(k))}\nSignature:  ${hex(sig)}\n(Ed25519 is deterministic: the same seed and message always give this signature.)`;
    } catch (e) { if (e.name === 'NotSupportedError') throw new Error('This browser does not support Ed25519 in WebCrypto yet'); throw e; }
  },
});

// ---- X.509 CSR builder
const dLen = (n) => (n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255]);
const der = (tag, ...c) => { const b = cat(...c); return cat(Uint8Array.of(tag, ...dLen(b.length)), b); };
const dOid = (s) => { const a = s.split('.').map(Number), b = [a[0] * 40 + a[1]]; for (const n of a.slice(2)) { const t = [n & 127]; let v = n >> 7; while (v) { t.unshift((v & 127) | 128); v >>= 7; } b.push(...t); } return der(6, Uint8Array.from(b)); };
const dSeq = (...c) => der(0x30, ...c), dSet = (...c) => der(0x31, ...c);
const dInt = (u) => { let i = 0; while (i < u.length - 1 && u[i] === 0) i++; u = u.slice(i); return der(2, u[0] & 0x80 ? cat(Uint8Array.of(0), u) : u); };
function ipBytes(s) {
  let m;
  if ((m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s))) { const a = m.slice(1).map(Number); if (a.some((x) => x > 255)) return null; return Uint8Array.from(a); }
  if (!/^[0-9a-f:.]+$/i.test(s) || !s.includes(':')) return null;
  let [h, t] = s.split('::');
  const side = (x) => (x ? x.split(':') : []);
  const hh = side(h), tt = t === undefined ? [] : side(t);
  if (t === undefined && hh.length !== 8) return null;
  const mid = t === undefined ? [] : Array(8 - hh.length - tt.length).fill('0');
  const g = [...hh, ...mid, ...tt];
  if (g.length !== 8 || g.some((x) => !/^[0-9a-f]{1,4}$/i.test(x))) return null;
  return Uint8Array.from(g.flatMap((x) => [parseInt(x, 16) >> 8, parseInt(x, 16) & 255]));
}
T.push({
  id: 'x509-san-csr-builder', cat: 'Crypto+', title: 'CSR Builder (with SAN)', desc: 'Generate a new key pair in your browser and a PKCS#10 certificate signing request with Subject Alternative Names (DNS, IP, email, URI). Output is the CSR PEM and the private key (PKCS#8 PEM); nothing leaves the page.',
  labels: ['Subject Alternative Names (one per line; DNS:, IP:, email:, URI: prefixes optional)'], sample: 'example.com\nwww.example.com\nIP:192.0.2.10\nemail:admin@example.com',
  opts: [sel('alg', 'Key', 'ECDSA P-256', ['ECDSA P-256', 'ECDSA P-384', 'RSA 2048', 'RSA 3072', 'RSA 4096']), txt('cn', 'Common name (blank = first DNS SAN)', ''), txt('o', 'Organization', 'Example Ltd'), txt('ou', 'Organizational unit', ''), txt('c', 'Country (2 letters)', 'BE'), txt('st', 'State / province', ''), txt('l', 'Locality', '')],
  run: async ([s], o) => {
    const sub = globalThis.crypto?.subtle;
    if (!sub) throw new Error('WebCrypto is not available');
    const gn = [], dns0 = [];
    for (const l of lines(s)) {
      let m;
      if ((m = /^(dns|ip|email|uri):\s*(.+)$/i.exec(l))) {
        const k = m[1].toLowerCase(), v = m[2].trim();
        if (k === 'ip') { const b = ipBytes(v); if (!b) throw new Error('Invalid IP: ' + v); gn.push(der(0x87, b)); } else if (k === 'dns') { gn.push(der(0x82, enc.encode(v))); dns0.push(v); } else gn.push(der(k === 'email' ? 0x81 : 0x86, enc.encode(v)));
      } else if (l.includes('@')) gn.push(der(0x81, enc.encode(l)));
      else if (ipBytes(l)) gn.push(der(0x87, ipBytes(l)));
      else { if (/\s/.test(l)) throw new Error('Invalid DNS name: ' + l); gn.push(der(0x82, enc.encode(l))); dns0.push(l); }
    }
    const cn = o.cn.trim() || dns0[0];
    if (!cn && !gn.length) throw new Error('Enter at least one SAN or a common name');
    const isEC = o.alg.startsWith('ECDSA'), curve = o.alg.endsWith('384') ? 'P-384' : 'P-256';
    const bits = +o.alg.replace(/\D/g, '');
    const kp = await sub.generateKey(isEC ? { name: 'ECDSA', namedCurve: curve } : { name: 'RSASSA-PKCS1-v1_5', modulusLength: bits, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const spki = new Uint8Array(await sub.exportKey('spki', kp.publicKey)), pk8 = new Uint8Array(await sub.exportKey('pkcs8', kp.privateKey));
    const rdn = (oid, v, tag = 12) => dSet(dSeq(dOid(oid), der(tag, enc.encode(v))));
    const name = [];
    if (o.c.trim()) { if (!/^[A-Za-z]{2}$/.test(o.c.trim())) throw new Error('Country must be 2 letters'); name.push(rdn('2.5.4.6', o.c.trim().toUpperCase(), 19)); }
    if (o.st.trim()) name.push(rdn('2.5.4.8', o.st.trim()));
    if (o.l.trim()) name.push(rdn('2.5.4.7', o.l.trim()));
    if (o.o.trim()) name.push(rdn('2.5.4.10', o.o.trim()));
    if (o.ou.trim()) name.push(rdn('2.5.4.11', o.ou.trim()));
    if (cn) name.push(rdn('2.5.4.3', cn));
    const attrs = gn.length ? der(0xa0, dSeq(dOid('1.2.840.113549.1.9.14'), dSet(dSeq(dSeq(dOid('2.5.29.17'), der(4, dSeq(...gn))))))) : der(0xa0);
    const info = dSeq(dInt(Uint8Array.of(0)), dSeq(...name), spki, attrs);
    const sigAlg = isEC ? dSeq(dOid(curve === 'P-384' ? '1.2.840.10045.4.3.3' : '1.2.840.10045.4.3.2')) : dSeq(dOid('1.2.840.113549.1.1.11'), der(5));
    let sig = new Uint8Array(await sub.sign(isEC ? { name: 'ECDSA', hash: curve === 'P-384' ? 'SHA-384' : 'SHA-256' } : 'RSASSA-PKCS1-v1_5', kp.privateKey, info));
    if (isEC) { const h = sig.length / 2; sig = dSeq(dInt(sig.slice(0, h)), dInt(sig.slice(h))); }
    const csr = dSeq(info, sigAlg, der(3, cat(Uint8Array.of(0), sig)));
    return `${pem('CERTIFICATE REQUEST', csr)}\n\n${pem('PRIVATE KEY', pk8)}\n\nKeep the private key secret. Check the CSR with: openssl req -in csr.pem -noout -text -verify`;
  },
});

// ---- Argon2 parameter planner
T.push({
  id: 'argon2-parameter-tuner', cat: 'Crypto+', title: 'Argon2 Parameter Tuner', desc: 'Pick Argon2id memory, iterations and parallelism for a target hashing time and memory budget. A calculator, not a benchmark: it does not run Argon2; calibrate the throughput value by timing one hash in your stack.',
  inputs: 0, sample: '',
  opts: [num('time', 'Target time per hash (ms)', 250), num('mem', 'Memory budget per hash (MiB)', 64), num('par', 'Parallelism (lanes p)', 2), num('cores', 'CPU cores available per hash', 2), num('thr', 'Measured throughput per core (MiB/s of memory filled per pass)', 800), num('conc', 'Concurrent logins to survive', 20)],
  run: (_i, o) => {
    for (const k of ['time', 'mem', 'par', 'cores', 'thr', 'conc']) if (!(o[k] > 0)) throw new Error('All values must be positive numbers');
    const m = Math.floor(o.mem * 1024), p = Math.floor(o.par), eff = Math.min(p, o.cores);
    const perPass = (o.mem / (o.thr * eff)) * 1000;
    const t = Math.max(1, Math.round(o.time / perPass));
    const est = t * perPass;
    const L = [`Recommended for your inputs: Argon2id  m=${m} KiB (${o.mem} MiB)  t=${t}  p=${p}`, `Estimated time: ~${est.toFixed(0)} ms (model: t x memory / (throughput x min(p, cores)); one pass fills ~${perPass.toFixed(1)} ms)`, `Peak memory for ${Math.floor(o.conc)} concurrent logins: ${(o.mem * o.conc).toFixed(0)} MiB`];
    if (t === 1 && perPass > o.time * 1.5) L.push(`Warning: a single pass already exceeds the time target; lower memory to about ${Math.floor((o.time / 1000) * o.thr * eff)} MiB or accept the slower hash.`);
    if (o.mem < 19) L.push('Warning: less than 19 MiB is below the OWASP minimum profile.');
    L.push('', `PHC string shape: $argon2id$v=19$m=${m},t=${t},p=${p}$<salt, base64>$<hash, base64>`, '', 'Reference profiles (all Argon2id, p=1 unless stated):', tbl([['Source', 'm', 't', 'p'], ['OWASP option 1', '47104 KiB (46 MiB)', '1', '1'], ['OWASP option 2', '19456 KiB (19 MiB)', '2', '1'], ['OWASP option 3', '12288 KiB (12 MiB)', '3', '1'], ['OWASP option 4', '9216 KiB (9 MiB)', '4', '1'], ['OWASP option 5', '7168 KiB (7 MiB)', '5', '1'], ['RFC 9106 first choice', '2097152 KiB (2 GiB)', '1', '4'], ['RFC 9106 second choice', '65536 KiB (64 MiB)', '3', '4']]), '', 'Guidance: prefer more memory over more iterations (memory is what limits GPU/ASIC attackers); use a 16-byte random salt and a 32-byte output; re-benchmark on production hardware.');
    return L.join('\n');
  },
});

// ============================================================ Generators
const hash32 = (s) => { let h = 2166136261; for (const c of enc.encode(String(s))) { h ^= c; h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => { let a = typeof seed === 'number' ? seed : hash32(seed); return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const yq = (s) => (/^[\w./@-][\w ./@()-]*$/.test(s) && !/^(true|false|null|yes|no|on|off|~)$/i.test(s) && !/^[\d.+-]+$/.test(s) && !/\s$/.test(s) ? s : JSON.stringify(s));
const lowerFirst = (s) => s[0].toLowerCase() + s.slice(1);
const lc = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

// ---- GitHub issue / PR templates
const GH_BUG_FORM = (p, labels) => `name: Bug report
description: Something is not working as expected in ${p}
title: "[Bug]: "
labels: [${labels}]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for taking the time to report a bug in **${p}**. Please search existing issues first.
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: Describe the bug and what you expected to happen instead.
      placeholder: Tell us what you see
    validations:
      required: true
  - type: textarea
    id: repro
    attributes:
      label: Steps to reproduce
      value: |
        1. Go to '...'
        2. Click on '...'
        3. See error
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: Version
      placeholder: e.g. 1.4.2
    validations:
      required: true
  - type: dropdown
    id: os
    attributes:
      label: Operating system
      multiple: true
      options:
        - Linux
        - macOS
        - Windows
        - Other
  - type: textarea
    id: logs
    attributes:
      label: Relevant log output
      description: This is rendered as code, no backticks needed.
      render: shell
  - type: checkboxes
    id: terms
    attributes:
      label: Checklist
      options:
        - label: I searched existing issues and this is not a duplicate
          required: true
        - label: I can reproduce this on the latest version
          required: false
`;
const GH_FEAT_FORM = (p, labels) => `name: Feature request
description: Suggest an idea for ${p}
title: "[Feature]: "
labels: [${labels}]
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem
      description: What problem would this solve? Who is affected?
    validations:
      required: true
  - type: textarea
    id: solution
    attributes:
      label: Proposed solution
      description: Describe what you would like to happen.
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
  - type: dropdown
    id: contribute
    attributes:
      label: Would you like to implement this?
      options:
        - "Yes"
        - Maybe, with guidance
        - "No"
`;
T.push({
  id: 'github-issue-pr-template-generator', cat: 'Dev Config+', title: 'GitHub Issue & PR Template Generator', desc: 'Generate .github issue forms (YAML), classic Markdown issue templates, a pull request template, ISSUE_TEMPLATE/config.yml and a SECURITY.md stub.',
  inputs: 0, sample: '',
  opts: [sel('kind', 'Template', 'Bug report (issue form)', ['Bug report (issue form)', 'Feature request (issue form)', 'Bug report (Markdown)', 'Feature request (Markdown)', 'Pull request template', 'config.yml (disable blank issues)', 'SECURITY.md', 'All of them']), txt('project', 'Project name', 'my-project'), txt('labels', 'Labels (comma separated)', 'bug, triage'), txt('contact', 'Security contact / URL', 'security@example.com')],
  run: (_i, o) => {
    const p = o.project.trim() || 'this project', labels = o.labels.split(',').map((x) => JSON.stringify(x.trim())).filter((x) => x !== '""').join(', ');
    const files = {
      'Bug report (issue form)': ['.github/ISSUE_TEMPLATE/bug_report.yml', GH_BUG_FORM(p, labels)],
      'Feature request (issue form)': ['.github/ISSUE_TEMPLATE/feature_request.yml', GH_FEAT_FORM(p, '"enhancement"')],
      'Bug report (Markdown)': ['.github/ISSUE_TEMPLATE/bug_report.md', `---\nname: Bug report\nabout: Report a problem in ${p}\ntitle: "[Bug] "\nlabels: ${o.labels.trim() || 'bug'}\nassignees: ''\n---\n\n**Describe the bug**\nA clear description of what is wrong.\n\n**To reproduce**\n1. ...\n2. ...\n\n**Expected behavior**\n\n**Environment**\n- Version:\n- OS:\n\n**Logs / screenshots**\n`],
      'Feature request (Markdown)': ['.github/ISSUE_TEMPLATE/feature_request.md', `---\nname: Feature request\nabout: Suggest an idea for ${p}\ntitle: "[Feature] "\nlabels: enhancement\nassignees: ''\n---\n\n**Is your feature request related to a problem?**\n\n**Describe the solution you'd like**\n\n**Alternatives considered**\n\n**Additional context**\n`],
      'Pull request template': ['.github/PULL_REQUEST_TEMPLATE.md', `## Summary\n\n<!-- What does this PR change and why? Link issues: Fixes #123 -->\n\n## Type of change\n\n- [ ] Bug fix\n- [ ] New feature\n- [ ] Breaking change\n- [ ] Documentation / chore\n\n## How was this tested?\n\n<!-- Commands run, screenshots, test cases -->\n\n## Checklist\n\n- [ ] Tests added or updated\n- [ ] Docs updated\n- [ ] No secrets or credentials committed\n- [ ] CI is green\n`],
      'config.yml (disable blank issues)': ['.github/ISSUE_TEMPLATE/config.yml', `blank_issues_enabled: false\ncontact_links:\n  - name: Questions and discussion\n    url: https://github.com/OWNER/REPO/discussions\n    about: Ask questions here instead of opening an issue\n  - name: Security vulnerability\n    url: https://github.com/OWNER/REPO/security/advisories/new\n    about: Please report vulnerabilities privately\n`],
      'SECURITY.md': ['SECURITY.md', `# Security Policy\n\n## Supported versions\n\n| Version | Supported |\n| ------- | --------- |\n| latest  | yes       |\n| older   | no        |\n\n## Reporting a vulnerability\n\nPlease do not open a public issue. Report privately to ${o.contact.trim() || 'the maintainers'} with steps to reproduce. We aim to acknowledge reports within 3 working days.\n`],
    };
    const pick = o.kind === 'All of them' ? Object.values(files) : [files[o.kind]];
    return pick.map(([f, c]) => `# ===== ${f} =====\n${c}`).join('\n');
  },
});

// ---- Prometheus recording rules
T.push({
  id: 'prometheus-recording-rules-generator', cat: 'Infra+', title: 'Prometheus Recording Rules Generator', desc: 'Build a rule-group YAML from "record = expr" lines, or from shortcuts (@rate, @ratio, @quantile) that follow the level:metric:operations naming convention. Checks metric names and parentheses.',
  labels: ['Rules: "record = expr" or @rate metric by a,b | @ratio errors total by a | @quantile bucket_metric 0.99 by a'],
  sample: '@rate http_requests_total by job,instance\n@ratio http_requests_errors_total http_requests_total by job\n@quantile http_request_duration_seconds_bucket 0.99 by job\ninstance:node_cpu_utilisation:rate5m = 1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))',
  opts: [txt('group', 'Group name', 'example-rules'), txt('interval', 'Evaluation interval', '30s'), txt('labels', 'Extra labels (k=v,k=v)', ''), txt('window', 'Rate window', '5m')],
  run: ([s], o) => {
    const W = o.window || '5m', rules = [];
    const by = (x) => (x ? x.split(',').map((y) => y.trim()).filter(Boolean) : []);
    for (const l of lines(s)) {
      if (l.startsWith('#')) continue;
      let m;
      if (l[0] === '@') {
        const p = l.split(/\s+/), kind = p[0].slice(1), bi = p.indexOf('by'), lab = by(bi > 0 ? p.slice(bi + 1).join('') : ''), lv = lab.length ? lab.join('_') : 'global';
        const bys = lab.length ? ` by (${lab.join(', ')})` : '', stem = (x) => x.replace(/_(total|bucket|count|sum)$/, '');
        if (kind === 'rate') { if (!p[1]) throw new Error('@rate needs a metric'); rules.push([`${lv}:${stem(p[1])}:rate${W}`, `sum${bys}(rate(${p[1]}[${W}]))`]); }
        else if (kind === 'ratio') { if (!p[2]) throw new Error('@ratio needs <errors metric> <total metric>'); rules.push([`${lv}:${stem(p[1])}_per_${stem(p[2])}:ratio_rate${W}`, `sum${bys}(rate(${p[1]}[${W}])) / sum${bys}(rate(${p[2]}[${W}]))`]); }
        else if (kind === 'quantile') {
          const q = parseFloat(p[2]); if (!p[1] || !(q > 0 && q < 1)) throw new Error('@quantile needs <bucket metric> <0..1>');
          rules.push([`${lv}:${stem(p[1])}:histogram_quantile${String(q).replace('0.', '')}_rate${W}`, `histogram_quantile(${q}, sum by (${[...lab, 'le'].join(', ')}) (rate(${p[1]}[${W}])))`]);
        } else throw new Error('Unknown shortcut @' + kind);
      } else if ((m = /^([A-Za-z_:][\w:]*)\s*=\s*(.+)$/.exec(l))) rules.push([m[1], m[2]]);
      else throw new Error(`Cannot parse line: ${l}`);
    }
    if (!rules.length) throw new Error('Enter at least one rule');
    const notes = [];
    for (const [r, e] of rules) {
      let d = 0; for (const c of e) { if (c === '(') d++; else if (c === ')') d--; if (d < 0) break; }
      if (d !== 0) throw new Error(`Unbalanced parentheses in expression for ${r}`);
      if ((e.match(/\[/g) || []).length !== (e.match(/\]/g) || []).length || (e.match(/\{/g) || []).length !== (e.match(/\}/g) || []).length) throw new Error(`Unbalanced brackets in expression for ${r}`);
      if (!/^[^:]+:[^:]+:[^:]+$/.test(r)) notes.push(`${r}: convention is level:metric:operations (e.g. job:http_requests:rate5m)`);
    }
    const lbl = o.labels.split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf('='); if (i < 1) throw new Error('Labels must be k=v'); return [x.slice(0, i).trim(), x.slice(i + 1).trim()]; });
    const y = ['groups:', `  - name: ${yq(o.group || 'rules')}`, `    interval: ${o.interval || '30s'}`, '    rules:'];
    for (const [r, e] of rules) { y.push(`      - record: ${r}`, `        expr: ${JSON.stringify(e)}`); if (lbl.length) { y.push('        labels:'); for (const [k, v] of lbl) y.push(`          ${k}: ${yq(v)}`); } }
    return y.join('\n') + (notes.length ? '\n\n# Notes:\n' + notes.map((n) => '# - ' + n).join('\n') : '') + '\n\n# Validate with: promtool check rules rules.yml';
  },
});

// ---- CSS isometric grid / ribbon / SVG wave divider
const previewDoc = (css, body) => `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%}${css}</style>${body}`;
T.push({
  id: 'css-isometric-grid-generator', cat: 'CSS+', title: 'CSS Isometric Grid Generator', desc: 'Pure-CSS isometric (30/150/90 degree) grid background from layered linear gradients. Pick tile size and colors; copy the CSS.',
  inputs: 0, sample: '',
  opts: [num('size', 'Tile width (px)', 80), txt('bg', 'Background', '#1b1b1b'), txt('line', 'Line color', '#222222'), txt('line2', 'Secondary line color', '#2a2a2a')],
  run: (_i, o) => {
    const w = Math.round(o.size), hgt = Math.round(w * 1.75), c = o.line, c2 = o.line2;
    if (!(w >= 8 && w <= 600)) throw new Error('Tile width must be between 8 and 600 px');
    const g = (a, col) => `linear-gradient(${a}deg, ${col} 12%, transparent 12.5%, transparent 87%, ${col} 87.5%, ${col})`;
    const g60 = `linear-gradient(60deg, ${c2} 25%, transparent 25.5%, transparent 75%, ${c2} 75%, ${c2})`;
    const h2 = Math.round(w / 2), v2 = Math.round(hgt / 2);
    const css = `.isometric-grid {\n  background-color: ${o.bg};\n  background-image:\n    ${g(30, c)},\n    ${g(150, c)},\n    ${g(30, c)},\n    ${g(150, c)},\n    ${g60},\n    ${g60};\n  background-size: ${w}px ${hgt}px;\n  background-position: 0 0, 0 0, ${h2}px ${v2}px, ${h2}px ${v2}px, 0 0, ${h2}px ${v2}px;\n}`;
    return { text: css, html: previewDoc(css.replace(/\.isometric-grid/, '.g') + '.g{width:100%;height:100%}', '<div class="g"></div>') };
  },
});
T.push({
  id: 'css-ribbon-banner-generator', cat: 'CSS+', title: 'CSS Ribbon & Banner Generator', desc: 'Generate CSS-only ribbons: corner sash, folded-end banner or arrow banner, with your text and colors. Output is HTML + CSS with a live preview.',
  inputs: 0, sample: '',
  opts: [sel('style', 'Style', 'corner sash', ['corner sash', 'folded banner', 'arrow banner']), txt('text', 'Text', 'NEW'), txt('color', 'Color', '#c62833'), txt('fg', 'Text color', '#ffffff'), num('size', 'Height (px)', 40)],
  run: (_i, o) => {
    const t = esc(o.text || ''), sz = Math.max(16, Math.min(120, Math.round(o.size)));
    let css, html;
    if (o.style === 'corner sash') {
      css = `.card{position:relative;overflow:hidden;width:260px;height:160px;background:#f1f3f5;border-radius:8px}\n.ribbon{position:absolute;top:${Math.round(sz * 0.55)}px;left:-${Math.round(sz * 1.5)}px;width:${Math.round(sz * 5)}px;padding:${Math.round(sz / 6)}px 0;text-align:center;background:${o.color};color:${o.fg};font:700 ${Math.round(sz / 2.5)}px/1.2 system-ui,sans-serif;letter-spacing:.08em;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.25)}`;
      html = `<div class="card"><div class="ribbon">${t}</div></div>`;
    } else if (o.style === 'folded banner') {
      const f = Math.round(sz / 2);
      css = `.banner{position:relative;display:inline-block;margin:${f}px ${f * 2}px;padding:0 ${sz}px;height:${sz}px;line-height:${sz}px;background:${o.color};color:${o.fg};font:700 ${Math.round(sz / 2.4)}px/${sz}px system-ui,sans-serif;letter-spacing:.06em}\n.banner::before,.banner::after{content:"";position:absolute;top:${f}px;width:${sz}px;height:${sz}px;background:${o.color};filter:brightness(.8);z-index:-1}\n.banner::before{left:-${f * 2}px;clip-path:polygon(0 0,100% 0,100% 100%,0 100%,${f}px 50%)}\n.banner::after{right:-${f * 2}px;clip-path:polygon(0 0,100% 0,${sz - f}px 50%,100% 100%,0 100%)}\nbody{isolation:isolate}`;
      html = `<div class="banner">${t}</div>`;
    } else {
      css = `.arrow{display:inline-block;padding:0 ${Math.round(sz * 1.2)}px 0 ${sz}px;height:${sz}px;line-height:${sz}px;background:${o.color};color:${o.fg};font:700 ${Math.round(sz / 2.4)}px/${sz}px system-ui,sans-serif;letter-spacing:.06em;clip-path:polygon(0 0,calc(100% - ${Math.round(sz / 2)}px) 0,100% 50%,calc(100% - ${Math.round(sz / 2)}px) 100%,0 100%,${Math.round(sz / 3)}px 50%)}`;
      html = `<div class="arrow">${t}</div>`;
    }
    return { text: `<!-- HTML -->\n${html}\n\n/* CSS */\n${css}`, html: previewDoc('body{display:grid;place-items:center;font-family:system-ui;background:#fff}' + css, html) };
  },
});
T.push({
  id: 'svg-wavy-divider-generator', cat: 'SVG', title: 'SVG Wavy Divider Generator', desc: 'Generate a layered, seeded SVG wave divider (smooth curves) for section transitions. Choose layers, amplitude, number of waves, color, flip; copy the SVG or an inline CSS background.',
  inputs: 0, sample: '',
  opts: [num('layers', 'Layers', 3), num('height', 'Height', 120), num('amp', 'Amplitude', 40), num('waves', 'Waves per layer', 4), txt('color', 'Color', '#3b82f6'), num('opacity', 'Opacity of back layers', 0.35), num('seed', 'Seed', 7), chk('flip', 'Flip vertically (divider on top)', false)],
  run: (_i, o) => {
    const L = Math.max(1, Math.min(6, Math.round(o.layers))), H = Math.max(20, o.height), W = 1440, n = Math.max(1, Math.min(16, Math.round(o.waves)));
    if (!Number.isFinite(o.amp) || o.amp < 0) throw new Error('Amplitude must be zero or more');
    const parts = [];
    for (let l = 0; l < L; l++) {
      const r = rng(o.seed * 101 + l * 977), pts = [];
      const base = H - (H - o.amp) * ((L - l) / (L + 0.0001)) * 0.5 - o.amp / 2;
      for (let i = 0; i <= n; i++) pts.push([(W * i) / n, Math.max(0, Math.min(H, base + (r() - 0.5) * o.amp))]);
      let d = `M0 ${fmt(pts[0][1])}`;
      for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2; d += `C${fmt(mx)} ${fmt(y0)} ${fmt(mx)} ${fmt(y1)} ${fmt(x1)} ${fmt(y1)}`; }
      d += `V${H}H0Z`;
      parts.push(`<path d="${d}" fill="${esc(o.color)}" fill-opacity="${l === L - 1 ? 1 : fmt(o.opacity + (1 - o.opacity) * (l / L) * 0.5)}"/>`);
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="${H}"${o.flip ? ' style="transform:scaleY(-1)"' : ''}>\n  ${parts.join('\n  ')}\n</svg>`;
    return { text: svg, html: previewDoc('body{background:#f8fafc;display:flex;flex-direction:column;justify-content:flex-end}', svg) };
  },
});

// ---- OpenGraph banner (canvas)
T.push({
  id: 'opengraph-banner-canvas-generator', cat: 'Images', title: 'OpenGraph Banner Generator', desc: 'Draw a 1200x630 social share image (title, subtitle, brand, gradient background) on a canvas and download it as PNG.',
  dom: true, labels: ['Title'], sample: 'Ship faster with free developer tools',
  opts: [txt('sub', 'Subtitle', 'Everything runs in your browser'), txt('brand', 'Brand / site', 'example.com'), txt('c1', 'Gradient from', '#1e3a8a'), txt('c2', 'Gradient to', '#7c3aed'), txt('fg', 'Text color', '#ffffff'), sel('size', 'Size', '1200x630', ['1200x630', '1200x675', '1080x1080'])],
  run: ([s], o) => {
    const [W, H] = o.size.split('x').map(Number), cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, o.c1); grad.addColorStop(1, o.c2);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.arc(W * 0.9, H * 0.1, H * 0.55, 0, 7); g.fill();
    const pad = Math.round(W * 0.07), font = 'system-ui, -apple-system, "Segoe UI", sans-serif';
    const wrap = (text, px, w, weight) => {
      g.font = `${weight} ${px}px ${font}`;
      const out = []; let cur = '';
      for (const word of text.split(/\s+/)) { const t = cur ? cur + ' ' + word : word; if (g.measureText(t).width > w && cur) { out.push(cur); cur = word; } else cur = t; }
      if (cur) out.push(cur);
      return out;
    };
    let px = Math.round(W * 0.075), ls = wrap(s, px, W - pad * 2, 800);
    while (ls.length > 3 && px > 28) { px -= 4; ls = wrap(s, px, W - pad * 2, 800); }
    g.fillStyle = o.fg; g.textBaseline = 'top';
    const blockH = ls.length * px * 1.15, y0 = Math.max(pad, (H - blockH) / 2 - (o.sub ? px * 0.4 : 0));
    g.font = `800 ${px}px ${font}`;
    ls.forEach((l, i) => g.fillText(l, pad, y0 + i * px * 1.15));
    if (o.sub) { g.globalAlpha = 0.85; g.font = `400 ${Math.round(px * 0.45)}px ${font}`; wrap(o.sub, Math.round(px * 0.45), W - pad * 2, 400).slice(0, 2).forEach((l, i) => g.fillText(l, pad, y0 + blockH + px * 0.2 + i * px * 0.55)); g.globalAlpha = 1; }
    if (o.brand) { g.font = `700 ${Math.round(W * 0.026)}px ${font}`; g.textBaseline = 'bottom'; g.fillText(o.brand, pad, H - pad * 0.7); }
    return { canvas: cv };
  },
});

// ---- Faker + Prisma seed
const fakerFor = (name, kind, val) => {
  const n = lc(name);
  if (kind === 'string') {
    if (/(^|_)e?mail/.test(n)) return 'faker.internet.email()';
    if (/first_?name/.test(n)) return 'faker.person.firstName()';
    if (/last_?name|surname/.test(n)) return 'faker.person.lastName()';
    if (/user_?name|handle|nick/.test(n)) return 'faker.internet.username()';
    if (/(^|_)(full_?)?name$/.test(n) && !/(file|company|product)/.test(n)) return 'faker.person.fullName()';
    if (/company|org/.test(n)) return 'faker.company.name()';
    if (/phone|mobile|tel/.test(n)) return 'faker.phone.number()';
    if (/avatar|image|photo|picture|thumbnail/.test(n)) return 'faker.image.url()';
    if (/url|website|link|homepage/.test(n)) return 'faker.internet.url()';
    if (/uuid|(^|_)id$/.test(n)) return 'faker.string.uuid()';
    if (/slug/.test(n)) return 'faker.helpers.slugify(faker.lorem.words(3))';
    if (/pass(word)?(_?hash)?$/.test(n)) return 'faker.internet.password()';
    if (/token|secret|api_?key/.test(n)) return 'faker.string.alphanumeric(32)';
    if (/city/.test(n)) return 'faker.location.city()';
    if (/country/.test(n)) return 'faker.location.country()';
    if (/zip|postal/.test(n)) return 'faker.location.zipCode()';
    if (/street|address/.test(n)) return 'faker.location.streetAddress()';
    if (/title|subject|headline/.test(n)) return 'faker.lorem.sentence()';
    if (/desc|bio|body|content|text|summary|comment|message/.test(n)) return 'faker.lorem.paragraph()';
    if (/color|colour/.test(n)) return 'faker.color.rgb()';
    if (/ip(_?addr)?$/.test(n)) return 'faker.internet.ip()';
    if (typeof val === 'string') {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) return 'faker.string.uuid()';
      if (/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(val)) return 'faker.date.recent().toISOString()';
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return 'faker.date.past().toISOString().slice(0, 10)';
      if (/^https?:\/\//.test(val)) return 'faker.internet.url()';
      if (/^[^@\s]+@[^@\s]+\.\w+$/.test(val)) return 'faker.internet.email()';
    }
    return 'faker.lorem.words(2)';
  }
  if (kind === 'int') return /age/.test(n) ? 'faker.number.int({ min: 18, max: 90 })' : /year/.test(n) ? 'faker.number.int({ min: 1990, max: 2025 })' : /(price|amount|cost|total)/.test(n) ? 'faker.number.int({ min: 100, max: 100000 })' : 'faker.number.int({ min: 1, max: 1000 })';
  if (kind === 'float') return /(price|amount|cost|total|balance)/.test(n) ? 'faker.number.float({ min: 1, max: 1000, fractionDigits: 2 })' : /lat/.test(n) ? 'faker.location.latitude()' : /lon|lng/.test(n) ? 'faker.location.longitude()' : 'faker.number.float({ min: 0, max: 1000, fractionDigits: 2 })';
  if (kind === 'bool') return 'faker.datatype.boolean()';
  if (kind === 'date') return 'faker.date.past()';
  return 'null';
};
T.push({
  id: 'faker-js-mock-schema-generator', cat: 'Code Generators', title: 'Faker.js Mock Factory Generator', desc: 'Turn a sample JSON object into a @faker-js/faker factory function. Field names and value shapes pick the faker call (email, uuid, dates, urls, names...). Nested objects and arrays are supported.',
  labels: ['Sample JSON object'], sample: '{"id":"3f2b8c1e-5d1a-4a7b-9c11-6d1c2e9f0a11","firstName":"Ada","email":"ada@example.com","age":36,"balance":120.5,"active":true,"createdAt":"2024-05-01T10:00:00Z","website":"https://ada.dev","address":{"city":"London","zip":"N1 9GU"},"tags":["math","code"]}',
  opts: [sel('lang', 'Output', 'TypeScript', ['TypeScript', 'JavaScript']), num('count', 'List helper default count', 10)],
  run: ([s], o) => {
    const v = parseJ(s);
    if (!isObj(v) && !Array.isArray(v)) throw new Error('Provide a JSON object (or array whose first item is an object)');
    const sample = Array.isArray(v) ? v[0] : v;
    if (!isObj(sample)) throw new Error('Array items must be objects');
    const ex = (val, key, ind) => {
      const pad = '  '.repeat(ind);
      if (Array.isArray(val)) { const inner = val.length ? ex(val[0], key, ind + 1) : 'faker.lorem.word()'; return `Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => ${inner})`; }
      if (isObj(val)) return '{\n' + Object.entries(val).map(([k, x]) => `${pad}  ${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${ex(x, k, ind + 1)},`).join('\n') + `\n${pad}}`;
      if (val === null) return 'null';
      if (typeof val === 'number') return fakerFor(key, Number.isInteger(val) ? 'int' : 'float');
      if (typeof val === 'boolean') return fakerFor(key, 'bool');
      return fakerFor(key, 'string', val);
    };
    const ts = o.lang === 'TypeScript';
    return `import { faker } from '@faker-js/faker';\n\nexport function createMock()${ts ? ': Record<string, unknown>' : ''} {\n  return ${ex(sample, '', 1)};\n}\n\nexport const createMockList = (n = ${Math.max(1, Math.floor(o.count))}) => Array.from({ length: n }, createMock);\n\n// Reproducible data: faker.seed(123) before calling createMock()\n// Install: npm i -D @faker-js/faker`;
  },
});

function parsePrisma(src) {
  const models = {}, enums = {};
  src = src.replace(/\/\/[^\n]*/g, '');
  for (const m of src.matchAll(/\b(model|enum)\s+(\w+)\s*\{([^}]*)\}/g)) {
    if (m[1] === 'enum') { enums[m[2]] = m[3].split(/\s+/).filter((x) => /^\w+$/.test(x)); continue; }
    const fields = [];
    for (const l of m[3].split('\n').map((x) => x.trim()).filter(Boolean)) {
      if (l.startsWith('@@')) continue;
      const f = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(l);
      if (f) fields.push({ name: f[1], type: f[2], list: !!f[3], opt: !!f[4], attrs: f[5] });
    }
    models[m[2]] = { name: m[2], fields };
  }
  return { models, enums };
}
T.push({
  id: 'prisma-seed-generator', cat: 'Code Generators', title: 'Prisma Seed Script Generator', desc: 'Read a Prisma schema and write prisma/seed.ts using @faker-js/faker: models are seeded in foreign-key order, relations pick existing rows, enums and defaults are respected.',
  labels: ['schema.prisma'], sample: 'enum Role {\n  USER\n  ADMIN\n}\n\nmodel User {\n  id        Int      @id @default(autoincrement())\n  email     String   @unique\n  name      String?\n  role      Role     @default(USER)\n  createdAt DateTime @default(now())\n  posts     Post[]\n}\n\nmodel Post {\n  id        Int     @id @default(autoincrement())\n  title     String\n  content   String?\n  published Boolean @default(false)\n  views     Int\n  author    User    @relation(fields: [authorId], references: [id])\n  authorId  Int\n}\n',
  opts: [num('count', 'Rows per model', 10), chk('wipe', 'Delete existing rows first', true)],
  run: ([s], o) => {
    const { models, enums } = parsePrisma(s), names = Object.keys(models);
    if (!names.length) throw new Error('No "model" blocks found in the schema');
    const fk = {}, deps = {};
    for (const mn of names) {
      fk[mn] = {}; deps[mn] = new Set();
      for (const f of models[mn].fields) {
        const r = /@relation\(([^)]*)\)/.exec(f.attrs);
        if (!models[f.type] || !r) continue;
        const fs = /fields:\s*\[([^\]]*)\]/.exec(r[1]), rs = /references:\s*\[([^\]]*)\]/.exec(r[1]);
        if (!fs) continue;
        const a = fs[1].split(',').map((x) => x.trim()), b = rs ? rs[1].split(',').map((x) => x.trim()) : ['id'];
        a.forEach((x, i) => { fk[mn][x] = { model: f.type, ref: b[i] || 'id' }; });
        if (f.type !== mn) deps[mn].add(f.type);
      }
    }
    const order = [], seen = new Set();
    const visit = (n, st = new Set()) => { if (seen.has(n) || st.has(n)) return; st.add(n); for (const d of deps[n]) visit(d, st); seen.add(n); order.push(n); };
    names.forEach((n) => visit(n));
    const cnt = Math.max(1, Math.floor(o.count));
    const L = ["import { PrismaClient } from '@prisma/client';", "import { faker } from '@faker-js/faker';", '', 'const prisma = new PrismaClient();', '', 'async function main() {'];
    if (o.wipe) for (const n of [...order].reverse()) L.push(`  await prisma.${lowerFirst(n)}.deleteMany();`);
    if (o.wipe) L.push('');
    for (const n of order) {
      const rows = [];
      for (const f of models[n].fields) {
        if (models[f.type]) continue;
        if (/@updatedAt|@default\s*\(\s*(autoincrement|uuid|cuid|now|dbgenerated|auto)\s*\(/.test(f.attrs)) continue;
        if (/@default\(/.test(f.attrs) && !fk[n][f.name]) continue;
        let e;
        if (fk[n][f.name]) { const d = fk[n][f.name]; e = `faker.helpers.arrayElement(${lowerFirst(d.model)}Rows).${d.ref}`; if (d.model === n) continue; }
        else if (enums[f.type]) e = `faker.helpers.arrayElement(${JSON.stringify(enums[f.type])})`;
        else {
          const kind = { String: 'string', Int: 'int', BigInt: 'int', Float: 'float', Decimal: 'float', Boolean: 'bool', DateTime: 'date' }[f.type];
          e = f.type === 'Json' ? '{}' : f.type === 'Bytes' ? 'Buffer.from(faker.string.alphanumeric(16))' : fakerFor(f.name, kind || 'string');
          if (f.type === 'BigInt') e = `BigInt(${e})`;
          if (f.type === 'Decimal') e = `String(${e})`;
          if (/@unique|@id/.test(f.attrs) && kind === 'string') e = '`${i}_${' + e + '}`';
          if (f.list) e = `[${e}]`;
        }
        rows.push(`${f.name}: ${e}`);
      }
      const v = lowerFirst(n) + 'Rows';
      L.push(`  const ${v} = [];`, `  for (let i = 0; i < ${cnt}; i++) {`, `    ${v}.push(await prisma.${lowerFirst(n)}.create({`, `      data: {${rows.length ? '\n' + rows.map((r) => `        ${r},`).join('\n') + '\n      ' : ''}},`, '    }));', '  }', `  console.log(\`Seeded \${${v}.length} ${n} rows\`);`, '');
    }
    L.push('}', '', 'main()', '  .catch((e) => { console.error(e); process.exit(1); })', '  .finally(() => prisma.$disconnect());', '', '// package.json: "prisma": { "seed": "tsx prisma/seed.ts" }   then run: npx prisma db seed');
    return L.join('\n');
  },
});

// ---- LLM prompt tools
T.push({
  id: 'llm-few-shot-prompt-formatter', cat: 'AI & LLM', title: 'Few-Shot Prompt Formatter', desc: 'Format input => output example pairs as a few-shot prompt: plain labels, XML tags, Markdown, or ready-to-send OpenAI / Anthropic message JSON. Use \\n inside an example for line breaks.',
  inputs: 2, labels: ['Examples (one per line: input ||| output)', 'New input to complete'], placeholder: ['The food was great ||| positive'],
  sample: 'The food was amazing and the staff were lovely ||| positive\nI waited an hour and it arrived cold ||| negative\nIt was fine, nothing special ||| neutral', sample2: 'Best pizza I have had in years',
  opts: [sel('fmt', 'Format', 'plain', ['plain', 'xml', 'markdown', 'openai-messages', 'anthropic-messages']), txt('inst', 'Instruction', 'Classify the sentiment of the review as positive, negative or neutral.'), txt('il', 'Input label', 'Review'), txt('ol', 'Output label', 'Sentiment')],
  run: ([ex, q], o) => {
    const pairs = lines(ex).map((l) => { const i = l.indexOf('|||'); if (i < 0) throw new Error(`Missing "|||" separator in: ${l}`); return [l.slice(0, i).trim().replace(/\\n/g, '\n'), l.slice(i + 3).trim().replace(/\\n/g, '\n')]; });
    if (!pairs.length) throw new Error('Add at least one example');
    q = q.trim(); if (!q) throw new Error('Enter the new input to complete');
    const I = o.il || 'Input', O = o.ol || 'Output', inst = o.inst.trim();
    if (o.fmt === 'plain') return [inst, ...pairs.map(([a, b]) => `${I}: ${a}\n${O}: ${b}`), `${I}: ${q}\n${O}:`].filter(Boolean).join('\n\n');
    if (o.fmt === 'xml') return `${inst ? `<instruction>${inst}</instruction>\n` : ''}<examples>\n${pairs.map(([a, b]) => `  <example>\n    <input>${a}</input>\n    <output>${b}</output>\n  </example>`).join('\n')}\n</examples>\n\n<input>${q}</input>`;
    if (o.fmt === 'markdown') return `${inst ? `## Task\n${inst}\n\n` : ''}## Examples\n\n${pairs.map(([a, b], i) => `### Example ${i + 1}\n**${I}:** ${a}\n\n**${O}:** ${b}`).join('\n\n')}\n\n## Now you\n**${I}:** ${q}\n\n**${O}:**`;
    const msgs = pairs.flatMap(([a, b]) => [{ role: 'user', content: a }, { role: 'assistant', content: b }]).concat({ role: 'user', content: q });
    if (o.fmt === 'openai-messages') return JSON.stringify({ messages: (inst ? [{ role: 'system', content: inst }] : []).concat(msgs) }, null, 2);
    return JSON.stringify({ ...(inst ? { system: inst } : {}), messages: msgs }, null, 2);
  },
});
T.push({
  id: 'cot-chain-of-thought-prompt-builder', cat: 'AI & LLM', title: 'Chain-of-Thought Prompt Builder', desc: 'Wrap a task in a reasoning prompt pattern: zero-shot CoT, structured steps, plan-and-solve, self-consistency, step-back, tree-of-thought panel or scratchpad tags, with a choice of answer format.',
  labels: ['Task or question'], sample: 'A train leaves at 14:10 and arrives at 16:45 after stopping 12 minutes at a station. How long was it moving?',
  opts: [sel('tech', 'Technique', 'structured steps', ['zero-shot CoT', 'structured steps', 'plan-and-solve', 'self-consistency', 'step-back', 'tree-of-thought panel', 'scratchpad tags']), sel('ans', 'Answer format', 'final line', ['free text', 'final line', 'JSON']), num('n', 'Paths / experts (self-consistency, panel)', 3)],
  run: ([s], o) => {
    s = s.trim(); if (!s) throw new Error('Enter a task');
    const n = Math.max(2, Math.min(10, Math.floor(o.n)));
    const body = {
      'zero-shot CoT': `${s}\n\nLet's think step by step.`,
      'structured steps': `${s}\n\nSolve this in numbered steps:\n1. Restate the problem and list the known facts.\n2. Identify what must be found.\n3. Work through the reasoning one step at a time, checking each step.\n4. Verify the result against the original question.`,
      'plan-and-solve': `${s}\n\nFirst, devise a plan: list the sub-tasks needed to solve the problem. Then carry out the plan step by step, showing intermediate results.`,
      'self-consistency': `${s}\n\nSolve this ${n} independent times using different approaches, each with its own step-by-step reasoning. Then compare the ${n} answers and report the one that most approaches agree on, noting any disagreement.`,
      'step-back': `${s}\n\nBefore answering, step back: state the general principle, concept or formula that governs this kind of problem. Then apply it to the specific case step by step.`,
      'tree-of-thought panel': `${s}\n\nImagine ${n} different experts solving this. Each writes one reasoning step, then all experts share their step with the group. Every expert continues with the next step, and an expert who realises their path is wrong leaves the panel. Continue until the remaining experts agree, then state the conclusion.`,
      'scratchpad tags': `${s}\n\nThink through the problem inside <scratchpad> tags first. Then give only the finished response outside the tags.`,
    }[o.tech];
    const tail = { 'free text': '', 'final line': '\n\nEnd with a single line in the form "Answer: <your final answer>".', JSON: '\n\nAfter reasoning, output a JSON object: {"reasoning": "<short summary>", "answer": "<final answer>"}.' }[o.ans];
    return body + tail;
  },
});

// ---- SQL stored procedures
function parseCreateTable(src) {
  const m = /create\s+table\s+(?:if\s+not\s+exists\s+)?([`"\[\]\w.]+)\s*\(([\s\S]*)\)\s*;?/i.exec(src) || /^\s*([\w.]+)\s*\(([\s\S]*)\)\s*;?\s*$/.exec(src);
  if (!m) throw new Error('Paste a CREATE TABLE statement (or: table_name(col type, ...))');
  const table = m[1].replace(/[`"\[\]]/g, ''), parts = []; let d = 0, cur = '';
  for (const c of m[2]) { if (c === '(') d++; if (c === ')') d--; if (c === ',' && !d) { parts.push(cur); cur = ''; } else cur += c; }
  parts.push(cur);
  const cols = []; let pk = [];
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    let mm;
    if ((mm = /^(?:constraint\s+\S+\s+)?primary\s+key\s*\(([^)]+)\)/i.exec(p))) { pk = mm[1].split(',').map((x) => x.trim().replace(/[`"\[\]]/g, '')); continue; }
    if (/^(constraint|unique|foreign|check|index|key|fulltext)\b/i.test(p)) continue;
    const c = /^[`"\[]?(\w+)[`"\]]?\s+(\w+(?:\s*\([^)]*\))?(?:\s+varying|\s+precision)?)\s*(.*)$/is.exec(p);
    if (!c) continue;
    const rest = c[3];
    cols.push({ name: c[1], type: c[2].replace(/\s+/g, ' '), auto: /\b(serial|bigserial|auto_increment|identity|generated)\b/i.test(c[2] + ' ' + rest), pk: /primary\s+key/i.test(rest) });
  }
  if (!cols.length) throw new Error('No columns found');
  for (const c of cols) if (pk.includes(c.name)) c.pk = true;
  if (!cols.some((c) => c.pk)) cols[0].pk = true;
  return { table, cols };
}
const MS_TYPE = (t) => { const b = t.toLowerCase().replace(/\(.*/, ''); const arg = (/\(.*\)/.exec(t) || [''])[0]; return { text: 'NVARCHAR(MAX)', varchar: 'NVARCHAR' + (arg || '(255)'), character: 'NVARCHAR' + (arg || '(255)'), boolean: 'BIT', bool: 'BIT', timestamp: 'DATETIME2', timestamptz: 'DATETIME2', datetime: 'DATETIME2', serial: 'INT', integer: 'INT', int: 'INT', bigserial: 'BIGINT', uuid: 'UNIQUEIDENTIFIER', jsonb: 'NVARCHAR(MAX)', json: 'NVARCHAR(MAX)', numeric: 'DECIMAL' + (arg || '(18,2)'), decimal: 'DECIMAL' + (arg || '(18,2)'), double: 'FLOAT', real: 'REAL' }[b] || t.toUpperCase(); };
const PG_TYPE = (t) => t.replace(/^serial$/i, 'integer').replace(/^bigserial$/i, 'bigint').replace(/^smallserial$/i, 'smallint');
T.push({
  id: 'sql-stored-procedure-generator', cat: 'SQL & Data', title: 'SQL Stored Procedure / CRUD Generator', desc: 'From a CREATE TABLE statement, generate CRUD stored routines for PostgreSQL (functions), MySQL (procedures) or SQL Server (T-SQL procedures): create, get by key, list, update, delete.',
  labels: ['CREATE TABLE statement'], sample: 'CREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  email VARCHAR(255) NOT NULL UNIQUE,\n  name TEXT,\n  is_active BOOLEAN DEFAULT true,\n  created_at TIMESTAMP DEFAULT now()\n);',
  opts: [sel('dialect', 'Dialect', 'PostgreSQL', ['PostgreSQL', 'MySQL', 'SQL Server']), chk('create', 'Create', true), chk('get', 'Get by key', true), chk('list', 'List', true), chk('update', 'Update', true), chk('del', 'Delete', true)],
  run: ([s], o) => {
    const { table, cols } = parseCreateTable(s), pks = cols.filter((c) => c.pk), ins = cols.filter((c) => !c.auto), upd = cols.filter((c) => !c.pk);
    const T0 = table.split('.').pop(), out = [];
    const pg = o.dialect === 'PostgreSQL', my = o.dialect === 'MySQL';
    const par = (c) => (pg ? `p_${c.name}` : my ? `p_${c.name}` : `@${c.name}`);
    const ty = (c) => (pg ? PG_TYPE(c.type) : my ? c.type.replace(/^serial$/i, 'INT').replace(/^text$/i, 'TEXT') : MS_TYPE(c.type));
    const args = (cs) => cs.map((c) => (pg ? `${par(c)} ${ty(c)}` : my ? `IN ${par(c)} ${ty(c)}` : `${par(c)} ${ty(c)}`)).join(pg || my ? ', ' : ',\n    ');
    const where = pks.map((c) => `${c.name} = ${par(c)}`).join(' AND ');
    if (pg) {
      if (o.create) out.push(`CREATE OR REPLACE FUNCTION ${T0}_create(${args(ins)})\nRETURNS ${table}\nLANGUAGE sql\nAS $$\n  INSERT INTO ${table} (${ins.map((c) => c.name).join(', ')})\n  VALUES (${ins.map(par).join(', ')})\n  RETURNING *;\n$$;`);
      if (o.get) out.push(`CREATE OR REPLACE FUNCTION ${T0}_get(${args(pks)})\nRETURNS SETOF ${table}\nLANGUAGE sql STABLE\nAS $$\n  SELECT * FROM ${table} WHERE ${where};\n$$;`);
      if (o.list) out.push(`CREATE OR REPLACE FUNCTION ${T0}_list(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)\nRETURNS SETOF ${table}\nLANGUAGE sql STABLE\nAS $$\n  SELECT * FROM ${table} ORDER BY ${pks.map((c) => c.name).join(', ')} LIMIT p_limit OFFSET p_offset;\n$$;`);
      if (o.update && upd.length) out.push(`CREATE OR REPLACE FUNCTION ${T0}_update(${args(pks.concat(upd))})\nRETURNS ${table}\nLANGUAGE sql\nAS $$\n  UPDATE ${table}\n  SET ${upd.map((c) => `${c.name} = ${par(c)}`).join(', ')}\n  WHERE ${where}\n  RETURNING *;\n$$;`);
      if (o.del) out.push(`CREATE OR REPLACE PROCEDURE ${T0}_delete(${args(pks)})\nLANGUAGE sql\nAS $$\n  DELETE FROM ${table} WHERE ${where};\n$$;`);
      return out.join('\n\n') + `\n\n-- Usage: SELECT * FROM ${T0}_get(1);   CALL ${T0}_delete(1);`;
    }
    if (my) {
      const P = (name, a, body) => `CREATE PROCEDURE ${T0}_${name}(${a})\nBEGIN\n${body.map((x) => '  ' + x).join('\n')}\nEND$$`;
      if (o.create) out.push(P('create', args(ins), [`INSERT INTO ${table} (${ins.map((c) => c.name).join(', ')})`, `VALUES (${ins.map(par).join(', ')});`, 'SELECT LAST_INSERT_ID() AS id;']));
      if (o.get) out.push(P('get', args(pks), [`SELECT * FROM ${table} WHERE ${where};`]));
      if (o.list) out.push(P('list', 'IN p_limit INT, IN p_offset INT', [`SELECT * FROM ${table} ORDER BY ${pks.map((c) => c.name).join(', ')} LIMIT p_limit OFFSET p_offset;`]));
      if (o.update && upd.length) out.push(P('update', args(pks.concat(upd)), [`UPDATE ${table}`, `SET ${upd.map((c) => `${c.name} = ${par(c)}`).join(', ')}`, `WHERE ${where};`, 'SELECT ROW_COUNT() AS affected;']));
      if (o.del) out.push(P('delete', args(pks), [`DELETE FROM ${table} WHERE ${where};`, 'SELECT ROW_COUNT() AS affected;']));
      return 'DELIMITER $$\n\n' + out.join('\n\n') + '\n\nDELIMITER ;';
    }
    const P = (name, a, body) => `CREATE OR ALTER PROCEDURE dbo.usp_${T0}_${name}${a ? '\n    ' + a : ''}\nAS\nBEGIN\n    SET NOCOUNT ON;\n${body.map((x) => '    ' + x).join('\n')}\nEND\nGO`;
    if (o.create) out.push(P('create', args(ins), [`INSERT INTO ${table} (${ins.map((c) => c.name).join(', ')})`, `OUTPUT INSERTED.*`, `VALUES (${ins.map(par).join(', ')});`]));
    if (o.get) out.push(P('get', args(pks), [`SELECT * FROM ${table} WHERE ${where};`]));
    if (o.list) out.push(P('list', '@Offset INT = 0,\n    @Limit INT = 100', [`SELECT * FROM ${table} ORDER BY ${pks.map((c) => c.name).join(', ')} OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;`]));
    if (o.update && upd.length) out.push(P('update', args(pks.concat(upd)), [`UPDATE ${table}`, `SET ${upd.map((c) => `${c.name} = ${par(c)}`).join(', ')}`, `OUTPUT INSERTED.*`, `WHERE ${where};`]));
    if (o.del) out.push(P('delete', args(pks), [`DELETE FROM ${table} WHERE ${where};`, 'SELECT @@ROWCOUNT AS affected;']));
    return out.join('\n\n');
  },
});

// ---- Redis Lua
const LUA = {
  'fixed-window rate limiter': { keys: ['rate:{user}'], argv: ['10', '60'], lua: `-- KEYS[1] counter key | ARGV[1] limit | ARGV[2] window seconds\n-- returns {allowed (1/0), current count, ttl seconds}\nlocal current = redis.call('INCR', KEYS[1])\nif current == 1 then\n  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))\nend\nlocal ttl = redis.call('TTL', KEYS[1])\nif current > tonumber(ARGV[1]) then\n  return {0, current, ttl}\nend\nreturn {1, current, ttl}` },
  'sliding-window log rate limiter': { keys: ['rate:{user}'], argv: ['1700000000000', '60000', '10', 'req-1'], lua: `-- KEYS[1] sorted set | ARGV[1] now (ms) | ARGV[2] window (ms) | ARGV[3] limit | ARGV[4] unique request id\n-- returns {allowed (1/0), count in window}\nlocal now = tonumber(ARGV[1])\nlocal window = tonumber(ARGV[2])\nredis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)\nlocal count = redis.call('ZCARD', KEYS[1])\nif count >= tonumber(ARGV[3]) then\n  return {0, count}\nend\nredis.call('ZADD', KEYS[1], now, ARGV[4])\nredis.call('PEXPIRE', KEYS[1], window)\nreturn {1, count + 1}` },
  'token bucket': { keys: ['bucket:{user}'], argv: ['10', '2', '1700000000000', '1'], lua: `-- KEYS[1] hash | ARGV[1] capacity | ARGV[2] refill tokens/second | ARGV[3] now (ms) | ARGV[4] cost\n-- returns {allowed (1/0), tokens left (string)}\nlocal cap = tonumber(ARGV[1])\nlocal rate = tonumber(ARGV[2])\nlocal now = tonumber(ARGV[3])\nlocal cost = tonumber(ARGV[4])\nlocal b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')\nlocal tokens = tonumber(b[1])\nlocal ts = tonumber(b[2])\nif tokens == nil then\n  tokens = cap\n  ts = now\nend\ntokens = math.min(cap, tokens + math.max(0, now - ts) / 1000 * rate)\nlocal ok = 0\nif tokens >= cost then\n  tokens = tokens - cost\n  ok = 1\nend\nredis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', now)\nredis.call('PEXPIRE', KEYS[1], math.ceil(cap / rate * 1000) * 2)\nreturn {ok, tostring(tokens)}` },
  'lock release (compare-and-delete)': { keys: ['lock:order-42'], argv: ['owner-token'], lua: `-- KEYS[1] lock key | ARGV[1] owner token\n-- deletes the lock only if we still own it; returns 1 if released\nif redis.call('GET', KEYS[1]) == ARGV[1] then\n  return redis.call('DEL', KEYS[1])\nend\nreturn 0` },
  'lock extend': { keys: ['lock:order-42'], argv: ['owner-token', '30000'], lua: `-- KEYS[1] lock key | ARGV[1] owner token | ARGV[2] new ttl (ms)\nif redis.call('GET', KEYS[1]) == ARGV[1] then\n  return redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]))\nend\nreturn 0` },
  'compare-and-set': { keys: ['config:version'], argv: ['v1', 'v2'], lua: `-- KEYS[1] key | ARGV[1] expected value | ARGV[2] new value\n-- returns 1 if swapped, 0 otherwise\nif redis.call('GET', KEYS[1]) == ARGV[1] then\n  redis.call('SET', KEYS[1], ARGV[2])\n  return 1\nend\nreturn 0` },
  'increment with cap': { keys: ['stock:sku-1'], argv: ['1', '100'], lua: `-- KEYS[1] counter | ARGV[1] increment | ARGV[2] maximum\n-- returns the new value, or -1 if it would exceed the maximum\nlocal v = tonumber(redis.call('GET', KEYS[1]) or '0')\nif v + tonumber(ARGV[1]) > tonumber(ARGV[2]) then\n  return -1\nend\nreturn redis.call('INCRBY', KEYS[1], tonumber(ARGV[1]))` },
};
T.push({
  id: 'redis-lua-script-generator', cat: 'Dev Config+', title: 'Redis Lua Script Generator', desc: 'Atomic Redis Lua script templates (rate limiters, token bucket, lock release/extend, compare-and-set, capped increment) with ready-to-run EVAL / client code. Scripts are not executed here; test them on a dev Redis.',
  inputs: 0, sample: '',
  opts: [sel('pattern', 'Pattern', 'fixed-window rate limiter', Object.keys(LUA)), sel('client', 'Usage snippet for', 'redis-cli', ['redis-cli', 'Node (ioredis)', 'Python (redis-py)', 'Go (go-redis)'])],
  run: (_i, o) => {
    const p = LUA[o.pattern], lua = p.lua, nk = p.keys.length, q = (x) => JSON.stringify(x);
    let use;
    if (o.client === 'redis-cli') use = `redis-cli EVAL "$(cat script.lua)" ${nk} ${p.keys.join(' ')} ${p.argv.join(' ')}\n# or load once: redis-cli SCRIPT LOAD "$(cat script.lua)"  then EVALSHA <sha1> ${nk} ...`;
    else if (o.client === 'Node (ioredis)') use = `const script = \`${lua.replace(/`/g, '\\`')}\`;\nredis.defineCommand('myScript', { numberOfKeys: ${nk}, lua: script });\nconst res = await redis.myScript(${[...p.keys, ...p.argv].map(q).join(', ')});`;
    else if (o.client === 'Python (redis-py)') use = `script = r"""${lua}"""\nrun = r.register_script(script)\nres = run(keys=[${p.keys.map(q).join(', ')}], args=[${p.argv.map(q).join(', ')}])`;
    else use = `var script = redis.NewScript(\`${lua}\`)\nres, err := script.Run(ctx, rdb, []string{${p.keys.map(q).join(', ')}}, ${p.argv.map(q).join(', ')}).Result()`;
    return `-- ${o.pattern} (script.lua)\n${lua}\n\n=== Usage: ${o.client} ===\n${use}\n\nNotes: scripts run atomically; pass every key via KEYS (needed for Redis Cluster hash slots; use {hash tags} to co-locate keys).`;
  },
});

// ---- crontab with randomized (stable-hash) times
T.push({
  id: 'crontab-randomized-generator', cat: 'Date & Time', title: 'Randomized Crontab Generator', desc: 'Spread many cron jobs across minutes/hours so they do not all fire at :00. Stable per job (hash of seed + command, like Jenkins "H"), or evenly spaced across a window.',
  labels: ['Jobs (one command per line)'], sample: '/usr/local/bin/backup-db.sh\n/usr/local/bin/rotate-logs.sh\n/usr/local/bin/sync-assets.sh\n/usr/local/bin/send-digest.sh',
  opts: [sel('freq', 'Frequency', 'daily', ['hourly', 'every N minutes', 'daily', 'weekly', 'monthly']), num('every', 'N (minutes, for "every N minutes"; divisor of 60)', 15), num('from', 'Window start hour', 1), num('to', 'Window end hour', 5), sel('mode', 'Placement', 'stable hash', ['stable hash', 'evenly spaced']), txt('seed', 'Seed', 'my-servers'), txt('user', 'User column (for /etc/cron.d, blank for user crontab)', '')],
  run: ([s], o) => {
    const jobs = lines(s).filter((l) => !l.startsWith('#'));
    if (!jobs.length) throw new Error('Enter at least one job command');
    const a = Math.floor(o.from), b = Math.floor(o.to);
    if (!(a >= 0 && b <= 23 && a <= b)) throw new Error('Window hours must satisfy 0 <= start <= end <= 23');
    const ev = Math.floor(o.every);
    if (o.freq === 'every N minutes' && !(ev >= 1 && ev <= 30 && 60 % ev === 0)) throw new Error('N must divide 60 (1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30)');
    const span = (b - a + 1) * 60, u = o.user.trim() ? o.user.trim() + ' ' : '';
    const out = jobs.map((cmd, i) => {
      const h = hash32(o.seed + '|' + cmd), r = rng(h);
      const slot = o.mode === 'evenly spaced' ? Math.floor((i * span) / jobs.length) : Math.floor(r() * span);
      const hr = a + Math.floor(slot / 60), mn = slot % 60;
      let f;
      if (o.freq === 'hourly') f = `${o.mode === 'evenly spaced' ? Math.floor((i * 60) / jobs.length) : h % 60} * * * *`;
      else if (o.freq === 'every N minutes') { const off = (o.mode === 'evenly spaced' ? i : h) % ev; const ms = []; for (let m = off; m < 60; m += ev) ms.push(m); f = `${ms.join(',')} * * * *`; }
      else if (o.freq === 'daily') f = `${mn} ${hr} * * *`;
      else if (o.freq === 'weekly') f = `${mn} ${hr} * * ${o.mode === 'evenly spaced' ? i % 7 : Math.floor(r() * 7)}`;
      else f = `${mn} ${hr} ${o.mode === 'evenly spaced' ? 1 + (i % 28) : 1 + Math.floor(r() * 28)} * *`;
      return `${f} ${u}${cmd}`;
    });
    return `# generated ${o.freq}, ${o.mode}${o.freq === 'hourly' || o.freq === 'every N minutes' ? '' : `, window ${a}:00-${b}:59`}\n${out.join('\n')}`;
  },
});

// ---- hardened nginx
T.push({
  id: 'nginx-security-conf-generator', cat: 'Infra+', title: 'Nginx Security Hardening Config', desc: 'Generate a hardened nginx server block: modern TLS, HSTS, security headers, hidden version, request limits, rate limiting, dotfile/backup file blocking and method allow-list. Review before production.',
  inputs: 0, sample: '',
  opts: [txt('host', 'Server name', 'example.com'), txt('root', 'Web root', '/var/www/example.com/public'), chk('tls', 'TLS + HTTP->HTTPS redirect', true), chk('hsts', 'HSTS (1 year, includeSubDomains)', true), sel('csp', 'Content-Security-Policy', 'self only', ['none', 'self only', 'self + inline styles']), num('rate', 'Rate limit (requests/second per IP, 0 = off)', 10), txt('body', 'client_max_body_size', '1m'), chk('methods', 'Allow only GET, HEAD, POST', true)],
  run: (_i, o) => {
    const h = o.host.trim(); if (!/^[\w.*-]+(\s+[\w.*-]+)*$/.test(h)) throw new Error('Invalid server name');
    const cspv = { 'self only': "default-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'", 'self + inline styles': "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'" }[o.csp];
    const L = ['# http{} level', 'server_tokens off;', `client_max_body_size ${o.body};`, 'client_body_timeout 12s;', 'client_header_timeout 12s;', 'keepalive_timeout 15s;', 'send_timeout 10s;', 'large_client_header_buffers 4 8k;'];
    if (o.rate > 0) L.push(`limit_req_zone $binary_remote_addr zone=perip:10m rate=${Math.floor(o.rate)}r/s;`, 'limit_req_status 429;');
    if (o.tls) L.push('', 'ssl_protocols TLSv1.2 TLSv1.3;', 'ssl_prefer_server_ciphers off;', 'ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;', 'ssl_session_timeout 1d;', 'ssl_session_cache shared:SSL:10m;', 'ssl_session_tickets off;', 'ssl_stapling on;', 'ssl_stapling_verify on;');
    L.push('');
    if (o.tls) L.push('server {', '    listen 80;', '    listen [::]:80;', `    server_name ${h};`, '    return 301 https://$host$request_uri;', '}', '');
    L.push('server {');
    L.push(o.tls ? '    listen 443 ssl;\n    listen [::]:443 ssl;\n    http2 on;' : '    listen 80;\n    listen [::]:80;', `    server_name ${h};`, `    root ${o.root};`, '    index index.html;', '');
    if (o.tls) L.push(`    ssl_certificate     /etc/letsencrypt/live/${h.split(' ')[0]}/fullchain.pem;`, `    ssl_certificate_key /etc/letsencrypt/live/${h.split(' ')[0]}/privkey.pem;`, '');
    L.push('    add_header X-Content-Type-Options "nosniff" always;', '    add_header X-Frame-Options "SAMEORIGIN" always;', '    add_header Referrer-Policy "strict-origin-when-cross-origin" always;', '    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;', '    add_header Cross-Origin-Opener-Policy "same-origin" always;');
    if (cspv) L.push(`    add_header Content-Security-Policy "${cspv}" always;`);
    if (o.tls && o.hsts) L.push('    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;');
    L.push('');
    if (o.methods) L.push('    if ($request_method !~ ^(GET|HEAD|POST)$) {', '        return 405;', '    }', '');
    L.push('    # never serve dotfiles (except ACME) or backup/source leftovers', '    location ~ /\\.(?!well-known) {', '        deny all;', '    }', '    location ~* \\.(bak|old|orig|save|swp|sql|log|ini|conf|env|git|svn)$ {', '        deny all;', '    }', '', '    location / {');
    if (o.rate > 0) L.push('        limit_req zone=perip burst=20 nodelay;');
    L.push('        try_files $uri $uri/ =404;', '    }', '}');
    return L.join('\n') + '\n\n# Test: nginx -t && systemctl reload nginx   |   Check headers: curl -sI https://' + h.split(' ')[0];
  },
});

// ============================================================ Utilities / network / DNS / HTTP inspectors
const parseHeaders = (s) => {
  const h = [];
  for (const l of s.split(/\r?\n/)) { const i = l.indexOf(':'); if (i > 0 && /^[\w-]+$/.test(l.slice(0, i).trim())) h.push([l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim()]); }
  return h;
};
const hget = (h, k) => h.filter((x) => x[0] === k).map((x) => x[1]);
const human = (sec) => {
  sec = Math.round(Math.abs(sec)); if (sec < 60) return sec + 's';
  const u = [['y', 31536000], ['d', 86400], ['h', 3600], ['m', 60], ['s', 1]], o = [];
  for (const [n, v] of u) { if (sec >= v) { o.push(Math.floor(sec / v) + n); sec %= v; } if (o.length === 3) break; }
  return o.join(' ');
};

// ---- Cache-Control tester
T.push({
  id: 'http-cache-control-tester', cat: 'Network & HTTP', title: 'HTTP Cache-Control Tester', desc: 'Paste response headers and see whether a browser or shared cache (CDN) may store the response, how long it stays fresh, and when it must revalidate. Follows RFC 9111 rules for max-age, s-maxage, Expires and heuristic freshness.',
  labels: ['Response headers'], sample: 'HTTP/1.1 200 OK\nCache-Control: public, max-age=600, s-maxage=3600, stale-while-revalidate=30\nDate: Tue, 15 Oct 2024 10:00:00 GMT\nLast-Modified: Mon, 14 Oct 2024 10:00:00 GMT\nETag: "abc123"\nVary: Accept-Encoding\nAge: 120',
  opts: [sel('cache', 'Cache type', 'shared (CDN / proxy)', ['shared (CDN / proxy)', 'private (browser)']), num('status', 'Status code (if not in the first line)', 200), sel('method', 'Request method', 'GET', ['GET', 'HEAD', 'POST'])],
  run: ([s], o) => {
    const h = parseHeaders(s), shared = o.cache.startsWith('shared');
    const sm = /HTTP\/[\d.]+\s+(\d{3})/.exec(s), status = sm ? +sm[1] : Math.floor(o.status);
    const cc = {}, notes = [], warn = [];
    for (const v of hget(h, 'cache-control')) for (const m of v.matchAll(/([a-z-]+)\s*(?:=\s*(?:"([^"]*)"|([^,\s]*)))?/gi)) cc[m[1].toLowerCase()] = m[2] ?? m[3] ?? true;
    const secs = (k) => { if (cc[k] === undefined || cc[k] === true) return null; const n = parseInt(cc[k], 10); if (!(n >= 0) || !/^\d+$/.test(cc[k])) { warn.push(`${k}=${cc[k]} is not a valid non-negative integer; caches treat it as stale`); return 0; } return n; };
    const date = hget(h, 'date')[0] ? Date.parse(hget(h, 'date')[0]) : NaN, exp = hget(h, 'expires')[0] ? Date.parse(hget(h, 'expires')[0]) : NaN, lm = hget(h, 'last-modified')[0] ? Date.parse(hget(h, 'last-modified')[0]) : NaN;
    const age = parseInt(hget(h, 'age')[0] || '0', 10) || 0, etag = hget(h, 'etag')[0];
    let store = true, why = [];
    if (!['GET', 'HEAD'].includes(o.method)) { store = false; why.push(`${o.method} responses are normally not cached`); }
    if (cc['no-store']) { store = false; why.push('no-store forbids storing'); }
    if (shared && cc.private) { store = false; why.push('private: only a browser cache may store it'); }
    if (shared && hget(h, 'authorization').length) why.push('Authorization header seen');
    const heurStatus = [200, 203, 204, 206, 300, 301, 308, 404, 405, 410, 414, 501].includes(status);
    const mx = secs('max-age'), smx = secs('s-maxage');
    let lifetime = null, src = '';
    if (shared && smx !== null) { lifetime = smx; src = 's-maxage'; } else if (mx !== null) { lifetime = mx; src = 'max-age'; }
    else if (!Number.isNaN(exp)) { lifetime = Math.max(0, (exp - (Number.isNaN(date) ? Date.now() : date)) / 1000); src = 'Expires - Date'; }
    else if (!Number.isNaN(lm) && !Number.isNaN(date)) { lifetime = Math.max(0, ((date - lm) / 1000) * 0.1); src = 'heuristic (10% of Date - Last-Modified)'; }
    const explicit = src && !src.startsWith('heuristic');
    if (store && !explicit && !cc.public && !heurStatus) { store = false; why.push(`status ${status} is not cacheable by default and there is no explicit freshness information`); }
    if (store && !explicit && !src && !cc['no-cache']) why.push('no freshness information: caches may heuristically cache this, or revalidate every time');
    const noCache = !!cc['no-cache'];
    const rem = lifetime === null ? null : lifetime - age;
    if (cc['max-age'] !== undefined && !Number.isNaN(exp) && cc['no-store'] === undefined) notes.push('max-age takes precedence over Expires');
    if (cc['no-store'] && (mx !== null || cc.public)) warn.push('no-store together with max-age/public: no-store wins, the other directives are pointless');
    if (cc.public && cc.private) warn.push('public and private are contradictory');
    if (noCache && mx) warn.push('no-cache forces revalidation on every use even though max-age is set (use max-age=0 or no-cache, not both, unless you need stale-while-revalidate)');
    if (smx !== null && !shared) notes.push('s-maxage is ignored by private (browser) caches');
    if (cc.immutable) notes.push('immutable: the browser will not revalidate during the freshness lifetime, even on reload');
    if (cc['must-revalidate']) notes.push('must-revalidate: once stale, the cache may not serve it without successful revalidation');
    if (cc['proxy-revalidate']) notes.push('proxy-revalidate: same as must-revalidate but only for shared caches');
    if (hget(h, 'pragma').some((p) => /no-cache/i.test(p)) && !h.some((x) => x[0] === 'cache-control')) warn.push('Pragma: no-cache is only a legacy HTTP/1.0 request header; use Cache-Control');
    if (hget(h, 'vary').some((v) => v.trim() === '*')) { store = false; why.push('Vary: * can never match, so it is effectively uncacheable'); }
    if (shared && hget(h, 'set-cookie').length && store) warn.push('Set-Cookie present: many CDNs refuse to cache or strip it; use Cache-Control: private or remove the cookie');
    if (!etag && Number.isNaN(lm)) warn.push('No ETag or Last-Modified: after expiry the whole body is refetched (no 304)');
    const L = [`Cache: ${o.cache}   Status: ${status}   Method: ${o.method}`, '', `Can be stored: ${store ? 'YES' : 'NO'}${why.length ? '  (' + why.join('; ') + ')' : ''}`];
    if (store) {
      if (noCache) L.push('Freshness: may be stored but MUST be revalidated before every reuse (no-cache)' + (etag || !Number.isNaN(lm) ? '; validators available, expect 304 responses' : ''));
      else if (lifetime !== null) {
        L.push(`Freshness lifetime: ${human(lifetime)} (${Math.round(lifetime)} s) from ${src}`, `Current Age: ${human(age)}   remaining fresh time: ${rem > 0 ? human(rem) : 'expired ' + human(-rem) + ' ago'}`);
        if (rem <= 0) L.push('State: STALE (needs revalidation' + (cc['stale-while-revalidate'] ? `, but stale-while-revalidate allows serving stale for ${cc['stale-while-revalidate']} s while refreshing` : '') + ')');
        else L.push('State: FRESH (served from cache without contacting the origin)');
      }
      if (cc['stale-if-error']) L.push(`stale-if-error: may serve stale for ${cc['stale-if-error']} s when the origin fails`);
      L.push(`Validators: ${[etag ? 'ETag ' + etag : '', !Number.isNaN(lm) ? 'Last-Modified' : ''].filter(Boolean).join(', ') || 'none'}`);
    }
    const vary = hget(h, 'vary')[0];
    if (vary) L.push(`Vary: ${vary} (separate cache entries per these request headers)`);
    if (notes.length) L.push('', 'Notes:', ...notes.map((x) => ' - ' + x));
    if (warn.length) L.push('', 'Warnings:', ...warn.map((x) => ' - ' + x));
    return L.join('\n');
  },
});

// ---- DNS SOA / DNSSEC record inspector
const DNS_ALG = { 1: 'RSAMD5 (obsolete)', 3: 'DSA (obsolete)', 5: 'RSASHA1 (deprecated)', 6: 'DSA-NSEC3-SHA1 (obsolete)', 7: 'RSASHA1-NSEC3-SHA1 (deprecated)', 8: 'RSASHA256', 10: 'RSASHA512', 12: 'ECC-GOST', 13: 'ECDSAP256SHA256', 14: 'ECDSAP384SHA384', 15: 'ED25519', 16: 'ED448' };
const DS_DIG = { 1: 'SHA-1', 2: 'SHA-256', 3: 'GOST R 34.11-94', 4: 'SHA-384' };
const dnsWire = (name) => { name = name.toLowerCase().replace(/\.$/, ''); if (!name) return Uint8Array.of(0); const b = []; for (const p of name.split('.')) { const e = enc.encode(p); b.push(e.length, ...e); } b.push(0); return Uint8Array.from(b); };
const ttlSecs = (x) => { const m = /^(\d+)([smhdw]?)$/i.exec(x); if (!m) return NaN; return +m[1] * ({ '': 1, s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[m[2].toLowerCase()]); };
const keyTag = (rd) => { let ac = 0; for (let i = 0; i < rd.length; i++) ac += i & 1 ? rd[i] : rd[i] << 8; ac += (ac >> 16) & 0xffff; return ac & 0xffff; };
const dnsTime = (s) => { if (/^\d{14}$/.test(s)) return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14)); if (/^\d+$/.test(s)) return +s * 1000; return NaN; };
const RTYPES = ['SOA', 'DNSKEY', 'DS', 'CDS', 'CDNSKEY', 'RRSIG', 'NSEC3PARAM'];
T.push({
  id: 'dns-soa-dnssec-inspector', cat: 'Network & HTTP', title: 'DNS SOA & DNSSEC Record Inspector', desc: 'Decode pasted SOA, DNSKEY, DS/CDS, RRSIG and NSEC3PARAM records: timers vs RFC 1912 guidance, key tags, KSK/ZSK roles, algorithms, signature validity windows, and whether a DS digest really matches the DNSKEY (SHA-1/256/384 computed locally).',
  labels: ['Records (zone-file or dig output, one per line; parentheses allowed)'],
  sample: '. 86400 IN SOA a.root-servers.net. nstld.verisign-grs.com. 2024101500 1800 900 604800 86400\n. 172800 IN DNSKEY 257 3 8 AwEAAaz/tAm8yTn4Mfeh5eyI96WSVexTBAvkMgJzkKTOiW1vkIbzxeF3 +/4RgWOq7HrxRixHlFlExOLAJr5emLvN7SWXgnLh4+B5xQlNVz8Og8kv ArMtNROxVQuCaSnIDdD5LKyWbRd2n9WGe2R8PzgCmr3EgVLrjyBxWezF 0jLHwVN8efS3rCj/EWgvIWgb9tarpVUDK/b58Da+sqqls3eNbuv7pr+e oZG+SrDK6nWeL3c6H5Apxz7LjVc1uTIdsIXxuOLYA4/ilBmSVIzuDWfd RUfhHdY6+cn8HFRm+2hM8AnXGXws9555KrUB5qihylGa8subX2Nn6UwN R1AkUTV74bU=\n. 86400 IN DS 20326 8 2 E06D44B80B8F1D39A95C0B0D7C65D08458E880409BBC683457104237C7F8EC8D\n. 86400 IN RRSIG SOA 8 0 86400 20301201000000 20241101000000 61809 . dGVzdA==',
  run: async ([s]) => {
    const text = s.replace(/;[^\n]*/g, '').replace(/\(([^)]*)\)/g, (_, x) => ' ' + x.replace(/\s+/g, ' ') + ' ');
    const recs = [];
    for (const l of text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
      const t = l.split(/\s+/), i = t.findIndex((x, k) => k <= 3 && RTYPES.includes(x.toUpperCase()));
      if (i < 0) throw new Error(`Unrecognised record (expected SOA, DNSKEY, DS, CDS, CDNSKEY, RRSIG or NSEC3PARAM): ${l.slice(0, 60)}`);
      const owner = i >= 1 && !/^\d+$/.test(t[0]) && t[0].toUpperCase() !== 'IN' ? t[0] : '';
      recs.push({ owner, type: t[i].toUpperCase(), rd: t.slice(i + 1) });
    }
    if (!recs.length) throw new Error('Paste at least one record');
    const keys = [], L = [], now = Date.now();
    for (const r of recs.filter((x) => x.type === 'DNSKEY' || x.type === 'CDNSKEY')) {
      const [fl, pr, al, ...kb] = r.rd, flags = +fl, alg = +al;
      if (!Number.isInteger(flags) || !Number.isInteger(alg)) throw new Error('Bad DNSKEY record: ' + r.rd.join(' ').slice(0, 50));
      let key; try { key = Uint8Array.from(atob(kb.join('')), (c) => c.charCodeAt(0)); } catch { throw new Error('DNSKEY public key is not valid Base64'); }
      const rd = cat(Uint8Array.of(flags >> 8, flags & 255, +pr, alg), key), tag = keyTag(rd);
      keys.push({ owner: r.owner, rd, tag, flags, alg });
      const role = flags & 1 ? 'KSK / SEP (secure entry point)' : flags & 0x100 ? 'ZSK (zone key)' : 'not a zone key', rev = flags & 0x80 ? ' REVOKED' : '';
      let size = `${key.length * 8} bits`;
      if ([5, 7, 8, 10].includes(alg)) { const el = key[0] ? key[0] : (key[1] << 8) | key[2], mb = key.length - (key[0] ? 1 : 3) - el; size = `RSA modulus ~${mb * 8} bits, exponent ${el} bytes`; } else if (alg === 13) size = 'ECDSA P-256'; else if (alg === 14) size = 'ECDSA P-384'; else if (alg === 15) size = 'Ed25519 (256 bit)';
      L.push(`${r.type} ${r.owner || '(owner not given)'}\n  flags ${flags}: ${role}${rev}   protocol ${pr}${+pr !== 3 ? ' (must be 3!)' : ''}\n  algorithm ${alg}: ${DNS_ALG[alg] || 'unknown'}   key: ${size}\n  key tag: ${tag}`);
      if (DNS_ALG[alg] && /deprecated|obsolete/.test(DNS_ALG[alg])) L.push('  WARNING: weak/deprecated algorithm, plan a rollover to 13 (ECDSAP256SHA256) or 8');
    }
    for (const r of recs) {
      if (r.type === 'SOA') {
        const [mn, rn, ser, ref, ret, expi, min] = r.rd, v = [ref, ret, expi, min].map(ttlSecs);
        if (r.rd.length < 7 || v.some(Number.isNaN) || !/^\d+$/.test(ser)) throw new Error('SOA needs: mname rname serial refresh retry expire minimum');
        const em = rn.replace(/\.$/, '').replace(/^((?:[^.\\]|\\.)*)\./, '$1@').replace(/\\\./g, '.');
        const sm = /^((?:19|20)\d{2})(\d{2})(\d{2})(\d{2})$/.exec(ser);
        L.push(`SOA ${r.owner || '(owner not given)'}\n  primary NS: ${mn}\n  admin mailbox: ${em}\n  serial: ${ser}${sm ? ` (looks like YYYYMMDDnn = ${sm[1]}-${sm[2]}-${sm[3]} revision ${sm[4]})` : ' (not date-formatted; fine if monotonic)'}\n  refresh ${human(v[0])}, retry ${human(v[1])}, expire ${human(v[2])}, negative-cache TTL ${human(v[3])}`);
        const adv = [];
        if (v[0] < 1200 || v[0] > 43200) adv.push('refresh outside the 20 min - 12 h range RFC 1912 suggests');
        if (v[1] < 120 || v[1] > 7200) adv.push('retry outside 2 min - 2 h');
        if (v[2] < 1209600 || v[2] > 2419200) adv.push('expire outside 2 - 4 weeks');
        if (v[3] > 86400) adv.push('negative TTL above 1 day (RFC 2308 caps useful values at 3 h; long values make new records slow to appear)');
        if (v[1] >= v[0]) adv.push('retry should be shorter than refresh');
        if (v[2] < v[0] + v[1]) adv.push('expire should exceed refresh + retry');
        L.push(adv.length ? '  Notes: ' + adv.join('; ') : '  Timers are within the RFC 1912 recommended ranges');
      } else if (r.type === 'DS' || r.type === 'CDS') {
        const [tg, al, dt, ...dg] = r.rd, digest = dg.join('').toLowerCase();
        L.push(`${r.type} ${r.owner || '(owner not given)'}\n  key tag ${tg}, algorithm ${al}: ${DNS_ALG[al] || 'unknown'}, digest type ${dt}: ${DS_DIG[dt] || 'unknown'}${+dt === 1 ? ' (SHA-1 is deprecated, publish SHA-256)' : ''}\n  digest: ${digest} (${digest.length / 2} bytes)`);
        const cand = keys.filter((k) => k.tag === +tg && k.alg === +al && (!r.owner || !k.owner || k.owner.toLowerCase() === r.owner.toLowerCase()));
        const algo = { 1: 'SHA-1', 2: 'SHA-256', 4: 'SHA-384' }[dt];
        if (!cand.length) L.push('  (no DNSKEY with this key tag in the pasted records, so the digest was not checked)');
        else if (!algo) L.push('  (digest type cannot be computed locally)');
        else for (const k of cand) {
          const d = hex(new Uint8Array(await crypto.subtle.digest(algo, cat(dnsWire(r.owner || k.owner || '.'), k.rd))));
          L.push(d === digest ? `  MATCH: digest equals ${algo}(owner || DNSKEY) for key tag ${k.tag}` : `  MISMATCH: computed ${d}`);
        }
      } else if (r.type === 'RRSIG') {
        const [cov, al, lab, ottl, ex, inc, tg, signer] = r.rd, e = dnsTime(ex), i = dnsTime(inc);
        if (Number.isNaN(e) || Number.isNaN(i)) throw new Error('RRSIG expiration/inception must be YYYYMMDDHHmmSS or epoch seconds');
        const st = now > e ? `EXPIRED ${human((now - e) / 1000)} ago` : now < i ? `NOT YET VALID (starts in ${human((i - now) / 1000)})` : `valid, expires in ${human((e - now) / 1000)}`;
        L.push(`RRSIG ${r.owner || '(owner not given)'} covers ${cov}\n  algorithm ${al}: ${DNS_ALG[al] || 'unknown'}, labels ${lab}, original TTL ${ottl}, signer ${signer}, key tag ${tg}\n  inception ${new Date(i).toISOString()}\n  expiration ${new Date(e).toISOString()}\n  status now: ${st} (signature itself is not cryptographically verified here)`);
        if (keys.length && !keys.some((k) => k.tag === +tg)) L.push('  note: no pasted DNSKEY has this key tag');
      } else if (r.type === 'NSEC3PARAM') {
        const [ha, fl, it, salt] = r.rd;
        L.push(`NSEC3PARAM ${r.owner || ''}\n  hash algorithm ${ha}${+ha === 1 ? ' (SHA-1)' : ''}, flags ${fl}, iterations ${it}, salt ${salt === '-' ? '(empty)' : salt}${+it > 0 ? '\n  WARNING: RFC 9276 recommends 0 additional iterations (and an empty salt)' : '\n  OK: 0 iterations as recommended by RFC 9276'}`);
      }
    }
    return L.join('\n\n').replace(/\n\n  /g, '\n  ');
  },
});

// ---- IP supernetting
const ipBig = (s) => { const b = ipBytes(s); if (!b) throw new Error('Invalid IP address: ' + s); return { v: b.length === 4 ? 4 : 6, n: bytes2big(b) }; };
const bigIp = (n, v) => {
  if (v === 4) return [24n, 16n, 8n, 0n].map((x) => (n >> x) & 255n).join('.');
  const g = Array.from({ length: 8 }, (_, i) => Number((n >> BigInt(112 - i * 16)) & 0xffffn).toString(16));
  let bs = -1, bl = 0;
  for (let i = 0; i < 8;) { if (g[i] === '0') { let j = i; while (j < 8 && g[j] === '0') j++; if (j - i > bl && j - i > 1) { bs = i; bl = j - i; } i = j; } else i++; }
  return bs < 0 ? g.join(':') : g.slice(0, bs).join(':') + '::' + g.slice(bs + bl).join(':');
};
const rangeToCidrs = (lo, hi, bits) => {
  const out = [];
  while (lo <= hi) {
    let size = 1n, len = bits;
    while (len > 0 && lo % (size * 2n) === 0n && lo + size * 2n - 1n <= hi) { size *= 2n; len--; }
    out.push([lo, len]); lo += size;
  }
  return out;
};
T.push({
  id: 'ip-supernetting-calculator', cat: 'Network & HTTP', title: 'IP Supernetting (CIDR Aggregation)', desc: 'Aggregate IPv4/IPv6 addresses, CIDR blocks and ranges (a-b) into the smallest set of CIDR prefixes, plus the single smallest supernet that covers everything and how much address space it wastes.',
  labels: ['Addresses, CIDRs or ranges (one per line)'], sample: '192.168.0.0/24\n192.168.1.0/24\n192.168.2.0/25\n192.168.2.128/25\n192.168.3.0-192.168.3.63\n10.0.0.1\n10.0.0.2\n2001:db8::/33\n2001:db8:8000::/33',
  run: ([s]) => {
    const ivs = { 4: [], 6: [] };
    for (const l of lines(s)) {
      let m;
      if ((m = /^(.+?)\s*-\s*(.+)$/.exec(l)) && !l.includes('/')) { const a = ipBig(m[1].trim()), b = ipBig(m[2].trim()); if (a.v !== b.v) throw new Error('Range mixes IPv4 and IPv6: ' + l); if (a.n > b.n) throw new Error('Range start is after end: ' + l); ivs[a.v].push([a.n, b.n]); }
      else if ((m = /^(.+?)\/(\d+)$/.exec(l))) {
        const a = ipBig(m[1].trim()), len = +m[2], bits = a.v === 4 ? 32 : 128;
        if (len > bits) throw new Error('Prefix too long: ' + l);
        const size = 1n << BigInt(bits - len), lo = (a.n / size) * size; ivs[a.v].push([lo, lo + size - 1n]);
      } else { const a = ipBig(l); ivs[a.v].push([a.n, a.n]); }
    }
    const out = [];
    for (const v of [4, 6]) {
      const arr = ivs[v].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
      if (!arr.length) continue;
      const merged = [];
      for (const iv of arr) { const last = merged[merged.length - 1]; if (last && iv[0] <= last[1] + 1n) { if (iv[1] > last[1]) last[1] = iv[1]; } else merged.push([...iv]); }
      const bits = v === 4 ? 32 : 128, cidrs = merged.flatMap(([a, b]) => rangeToCidrs(a, b, bits));
      const lo = merged[0][0], hi = merged[merged.length - 1][1];
      let len = bits; while (len > 0 && lo >> BigInt(bits - len) !== hi >> BigInt(bits - len)) len--;
      const sn = (lo >> BigInt(bits - len)) << BigInt(bits - len), total = merged.reduce((t, [a, b]) => t + (b - a + 1n), 0n), cover = 1n << BigInt(bits - len);
      const waste = Number(((cover - total) * 10000n) / cover) / 100;
      out.push(`IPv${v} aggregated (${cidrs.length} prefix${cidrs.length === 1 ? '' : 'es'}):\n${cidrs.map(([a, l]) => `  ${bigIp(a, v)}/${l}`).join('\n')}\nSingle covering supernet: ${bigIp(sn, v)}/${len}  (${total} of ${cover} addresses used, ${waste}% wasted)`);
    }
    if (!out.length) throw new Error('Enter at least one address, CIDR or range');
    return out.join('\n\n');
  },
});

// ---- JWT expiry calculator
T.push({
  id: 'jwt-expiry-calculator', cat: 'Hashing & JWT', title: 'JWT Expiry Calculator', desc: 'Check exp / nbf / iat of one or more JWTs against now (or a time you choose) with optional clock-skew leeway: remaining lifetime, total lifetime, and warnings. The signature is not verified.',
  labels: ['JWT(s), one per line'], sample: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNzAwMDAwMDAwLCJuYmYiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDAwMzYwMH0.c2lnbmF0dXJl',
  opts: [txt('now', 'Evaluate at (ISO date or epoch seconds, blank = now)', ''), num('leeway', 'Clock skew leeway (seconds)', 60)],
  run: ([s], o) => {
    let now = Date.now();
    if (o.now.trim()) { now = /^\d+$/.test(o.now.trim()) ? +o.now.trim() * 1000 : Date.parse(o.now); if (Number.isNaN(now)) throw new Error('Cannot parse the evaluation time'); }
    const lw = Math.max(0, o.leeway || 0), out = [];
    for (const tok of lines(s)) {
      const p = tok.replace(/^Bearer\s+/i, '').split('.');
      if (p.length < 2) throw new Error('Not a JWT (expected header.payload.signature)');
      let pl; try { pl = JSON.parse(dec.decode(Uint8Array.from(atob(p[1].replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (p[1].length % 4)) % 4)), (c) => c.charCodeAt(0)))); } catch { throw new Error('Cannot decode the JWT payload'); }
      const t = (k) => (typeof pl[k] === 'number' ? pl[k] * 1000 : null), iso = (ms) => new Date(ms).toISOString(), L = [`${tok.slice(0, 24)}...  (sub: ${pl.sub ?? 'n/a'}, iss: ${pl.iss ?? 'n/a'})`];
      for (const k of ['iat', 'nbf', 'exp']) if (t(k) !== null) L.push(`  ${k}: ${iso(t(k))}  (${t(k) > now ? 'in ' + human((t(k) - now) / 1000) : human((now - t(k)) / 1000) + ' ago'})`);
      else if (pl[k] !== undefined) L.push(`  ${k}: invalid (must be a numeric date)`);
      let status = 'VALID';
      if (t('exp') === null) status = 'NO EXPIRY (never expires)';
      else if (now >= t('exp') + lw * 1000) status = `EXPIRED ${human((now - t('exp')) / 1000)} ago`;
      else if (now >= t('exp')) status = `expired but inside the ${lw}s leeway`;
      if (t('nbf') !== null && now < t('nbf') - lw * 1000) status = `NOT YET VALID (nbf in ${human((t('nbf') - now) / 1000)})`;
      L.push(`  Status: ${status}`);
      if (t('exp') !== null && t('iat') !== null) { const life = (t('exp') - t('iat')) / 1000; L.push(`  Lifetime (exp - iat): ${human(life)}`); if (life < 0) L.push('  WARNING: exp is before iat'); else if (life > 86400 * 30) L.push('  WARNING: lifetime over 30 days; long-lived bearer tokens are risky'); }
      if (t('iat') !== null && t('iat') > now + lw * 1000) L.push('  WARNING: iat is in the future (clock skew or forged token)');
      if (t('exp') === null) L.push('  WARNING: tokens without exp cannot be expired server-side');
      out.push(L.join('\n'));
    }
    if (!out.length) throw new Error('Paste at least one JWT');
    return out.join('\n\n');
  },
});

// ---- Regex benchmark
T.push({
  id: 'regex-benchmark-simulator', cat: 'Regex', title: 'Regex Benchmark & ReDoS Simulator', desc: 'Time a JavaScript regex against your text: ops/second, plus a scaling test (input repeated 1x-16x) that reveals polynomial or exponential backtracking. A static check flags nested quantifiers. A catastrophic pattern can freeze the tab: start with short input.',
  inputs: 2, labels: ['Regex (/pattern/flags or plain pattern)', 'Test text'], sample: '^(a+)+$', sample2: 'aaaaaaaaaaaa!',
  opts: [num('iter', 'Iterations', 2000), txt('flags', 'Flags (if pattern is not /.../flags)', 'i')],
  run: ([p, text], o) => {
    p = p.trim(); if (!p) throw new Error('Enter a regex');
    let re; const m = /^\/(.*)\/([a-z]*)$/s.exec(p);
    try { re = m ? new RegExp(m[1], m[2].replace(/[gy]/g, '')) : new RegExp(p, (o.flags || '').replace(/[gy]/g, '')); } catch (e) { throw new Error('Invalid regex: ' + e.message); }
    const src = re.source, now = () => performance.now();
    const iters = Math.max(1, Math.min(200000, Math.floor(o.iter)));
    const L = [`Pattern: /${src}/${re.flags}   input: ${text.length} chars   result: ${re.test(text) ? 'matches' : 'no match'}`];
    const risky = [];
    if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/.test(src)) risky.push('nested quantifier like (a+)+ or (\\w+\\s?)* : classic catastrophic backtracking shape');
    if (/\((?:[^()\\|]|\\.)*\|(?:[^()\\]|\\.)*\)[+*]/.test(src) && /\.\*|\\w\+|\\S\+|\\s\*/.test(src)) risky.push('alternation inside a repeated group with overlapping branches can backtrack heavily');
    if (/(\.\*|\.\+)[^)]*\1/.test(src)) risky.push('multiple .* / .+ in one pattern cause polynomial backtracking on failure');
    if (risky.length) L.push('Static warnings:', ...risky.map((x) => ' - ' + x));
    let t0 = now(); re.test(text); const first = now() - t0;
    if (first > 1500) { L.push(`A single run already took ${first.toFixed(0)} ms: very likely catastrophic backtracking. Aborting the benchmark.`); return L.join('\n'); }
    const n = first > 20 ? Math.min(iters, 20) : first > 2 ? Math.min(iters, 200) : iters;
    t0 = now(); for (let i = 0; i < n; i++) re.test(text); const el = now() - t0;
    L.push(`Benchmark: ${n} runs in ${el.toFixed(1)} ms = ${(el / n * 1000).toFixed(1)} us/run, ${Math.round(n / (el / 1000)).toLocaleString('en-US')} runs/s`);
    const times = [];
    if (first > 0.1) L.push('', `Scaling test skipped: one run already takes ${first.toFixed(2)} ms and a longer input could freeze the tab. Shorten the text to a few characters to see how the time grows.`);
    else {
      for (const k of [1, 2, 3, 4, 6, 8, 12, 16]) {
        const prevT = times[times.length - 1], prev2 = times[times.length - 2];
        if (prevT && prev2 && prevT[2] > 0.5 && (prevT[2] / prev2[2]) * prevT[2] > 800) { L.push(`Stopped before ${k}x: the previous growth (x${(prevT[2] / prev2[2]).toFixed(0)}) would take over a second.`); break; }
        const big = text.slice(0, -1).repeat(k) + text.slice(-1); t0 = now(); re.test(big); const d = now() - t0; times.push([k, big.length, d]);
        if (d > 800) { L.push('Stopped scaling at ' + k + 'x (too slow).'); break; }
      }
      L.push('', 'Scaling (all but the last character repeated k times, then the last character; one run each):', ...times.map(([k, len, d], i) => `  ${String(k).padStart(2)}x  ${String(len).padStart(6)} chars  ${d.toFixed(2).padStart(9)} ms${i && times[i - 1][2] > 0.05 ? `   x${(d / times[i - 1][2]).toFixed(1)} vs previous` : ''}`));
      const lt = times[times.length - 1], pt = times[times.length - 2];
      if (pt && lt[2] > 1 && pt[2] > 0.001) { const r = lt[2] / pt[2], dr = lt[0] / pt[0]; L.push(r > dr * dr * 2 ? '=> Time grows faster than quadratically: exponential backtracking is likely. Rewrite the pattern.' : r > dr * 1.6 ? '=> Time grows roughly quadratically (or worse): check overlapping quantifiers.' : '=> Time grows about linearly with input size.'); }
      else L.push('=> Too fast to measure scaling on this input; try longer text, or text that almost matches (failing inputs trigger backtracking).');
    }
    L.push('Note: timings are for this browser\'s regex engine (V8 Irregexp), other engines differ.');
    return L.join('\n');
  },
});

// ---- LLM context shrinker, embedding cost
const STOP = new Set('the a an and or but of to in on at for with by from as is are was were be been it its this that these those i you he she we they not no so if then than also can will would should could have has had do does did'.split(' '));
T.push({
  id: 'llm-context-window-shrinker', cat: 'AI & LLM', title: 'LLM Context Window Shrinker', desc: 'Shrink text to fit a token budget: keep head, tail, both ends, drop duplicate lines, or keep the most informative sentences in original order (frequency-based extractive summary). Token counts are estimates (characters / ratio), not a real tokenizer.',
  labels: ['Text'], sample: 'Release notes for version 2.4.\nThe export module now supports streaming CSV output.\nThe export module now supports streaming CSV output.\nA memory leak in the scheduler was fixed. The leak appeared when jobs were cancelled during startup.\nThe dashboard gained dark mode. Dark mode follows the system setting by default.\nSeveral dependencies were updated.\nKnown issue: the importer rejects files larger than 2 GB.\nThanks to all contributors for the feedback and the bug reports that shaped this release.\nUpgrade notes: run the migration script before starting the new version.',
  opts: [num('budget', 'Token budget', 60), num('ratio', 'Characters per token', 4), sel('mode', 'Strategy', 'extractive (key sentences)', ['keep start', 'keep end', 'keep start + end', 'dedupe lines then keep start', 'extractive (key sentences)'])],
  run: ([s], o) => {
    if (!s.trim()) throw new Error('Paste some text');
    const ratio = o.ratio > 0 ? o.ratio : 4, max = Math.max(1, Math.floor(o.budget * ratio)), est = (x) => Math.ceil(x.length / ratio);
    if (s.length <= max) return `${s}\n\n---\nAlready within budget: ~${est(s)} of ${o.budget} tokens.`;
    let out;
    const cutS = (x, n) => { const c = x.slice(0, n), k = Math.max(c.lastIndexOf('\n'), c.lastIndexOf('. ')); return (k > n * 0.6 ? c.slice(0, k + 1) : c).trimEnd(); };
    const cutE = (x, n) => { const c = x.slice(-n), k = Math.min(...['\n', '. '].map((d) => { const i = c.indexOf(d); return i < 0 ? Infinity : i; })); return (k < n * 0.4 ? c.slice(k + 1) : c).trimStart(); };
    if (o.mode === 'keep start') out = cutS(s, max);
    else if (o.mode === 'keep end') out = cutE(s, max);
    else if (o.mode === 'keep start + end') { const mk = '\n[... middle omitted ...]\n', h = Math.floor((max - mk.length) / 2); out = cutS(s, h) + mk + cutE(s, h); }
    else if (o.mode === 'dedupe lines then keep start') { const seen = new Set(); out = cutS(s.split('\n').filter((l) => { const k = l.trim().toLowerCase(); if (!k) return true; if (seen.has(k)) return false; seen.add(k); return true; }).join('\n'), max); }
    else {
      const sents = s.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean), freq = new Map();
      const toks = (x) => x.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
      for (const x of sents) for (const w of toks(x)) if (!STOP.has(w) && w.length > 2) freq.set(w, (freq.get(w) || 0) + 1);
      const seen = new Set(), scored = sents.map((x, i) => {
        const ws = toks(x).filter((w) => !STOP.has(w) && w.length > 2), key = x.toLowerCase();
        const dup = seen.has(key); seen.add(key);
        return { x, i, sc: dup ? -1 : (ws.reduce((a, w) => a + freq.get(w), 0) / Math.sqrt(ws.length + 1)) * (i === 0 ? 1.5 : 1) + (/\b(known issue|warning|must|required|note|error|breaking)\b/i.test(x) ? 2 : 0) };
      }).sort((a, b) => b.sc - a.sc);
      let used = 0; const keep = [];
      for (const c of scored) { if (c.sc < 0) continue; if (used + c.x.length + 1 > max) continue; keep.push(c); used += c.x.length + 1; }
      out = keep.sort((a, b) => a.i - b.i).map((c) => c.x).join(' ');
      if (!out) out = cutS(s, max);
    }
    return `${out}\n\n---\n~${est(out)} of ${o.budget} tokens (${Math.round((out.length / s.length) * 100)}% of the original ${est(s)}-token text). Estimates assume ${ratio} characters per token.`;
  },
});
const EMB = { 'OpenAI text-embedding-3-small': [0.02, 1536, 8191], 'OpenAI text-embedding-3-large': [0.13, 3072, 8191], 'OpenAI text-embedding-ada-002': [0.10, 1536, 8191], 'Cohere embed-english-v3.0': [0.10, 1024, 512], 'Voyage voyage-3': [0.06, 1024, 32000], 'Voyage voyage-3-lite': [0.02, 512, 32000], 'Mistral mistral-embed': [0.10, 1024, 8192], 'Google gemini-embedding-001': [0.15, 3072, 2048] };
T.push({
  id: 'embedding-token-cost-estimator', cat: 'AI & LLM', title: 'Embedding Token & Cost Estimator', desc: 'Estimate tokens, chunk count, API cost and vector storage for embedding your corpus across popular embedding models. Token counts are estimates (characters / ratio) and the price table is a built-in snapshot: override it with your own price.',
  labels: ['Representative text (or paste a sample document)'], sample: 'Embeddings turn text into vectors so that similar meanings end up close together. A retrieval pipeline splits documents into chunks, embeds each chunk once, stores the vectors, and embeds every query at search time.',
  opts: [num('docs', 'Number of documents like this', 10000), num('chunk', 'Chunk size (tokens)', 512), num('overlap', 'Chunk overlap (tokens)', 64), num('ratio', 'Characters per token', 4), num('custom', 'Custom price $ per 1M tokens (0 = none)', 0), num('dims', 'Custom vector dimensions', 1024), num('reembed', 'Full re-embeds per year', 1)],
  run: ([s], o) => {
    if (!s.trim()) throw new Error('Paste some text');
    if (!(o.chunk > o.overlap && o.overlap >= 0)) throw new Error('Chunk size must be larger than the overlap');
    const per = Math.ceil(s.length / (o.ratio > 0 ? o.ratio : 4)), docs = Math.max(1, Math.floor(o.docs));
    const chunks = (t) => (t <= o.chunk ? 1 : 1 + Math.ceil((t - o.chunk) / (o.chunk - o.overlap))), cPer = chunks(per), totalChunks = cPer * docs;
    const billed = (per + (cPer - 1) * o.overlap) * docs, models = { ...EMB };
    if (o.custom > 0) models['Custom'] = [o.custom, Math.floor(o.dims), Infinity];
    const rows = [['Model', 'Dims', 'Cost / run', 'Cost / year', 'float32 index', 'int8 index']];
    for (const [n, [price, dims, mx]] of Object.entries(models)) {
      const c = (billed / 1e6) * price, gb = (totalChunks * dims * 4) / 1e9;
      rows.push([n + (o.chunk > mx ? ' (!chunk > max input)' : ''), dims, '$' + c.toFixed(c < 1 ? 4 : 2), '$' + (c * o.reembed).toFixed(c < 1 ? 4 : 2), gb.toFixed(2) + ' GB', (gb / 4).toFixed(2) + ' GB']);
    }
    return `Per document: ~${per} tokens -> ${cPer} chunk(s)\nCorpus: ${docs.toLocaleString('en-US')} docs -> ${totalChunks.toLocaleString('en-US')} chunks, ~${billed.toLocaleString('en-US')} billed tokens (incl. overlap)\n\n${tbl(rows)}\n\nPrices (USD per 1M tokens) are a snapshot and change often: verify on the provider's pricing page or enter your own above. Index size excludes ANN graph overhead (HNSW adds roughly 20-50%) and metadata. Query embeddings are billed separately.`;
  },
});

// ---- webhook payload simulator
const hmacHex = async (secret, msg, algo = 'SHA-256') => {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: algo }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
};
const WH_SAMPLES = {
  GitHub: { ref: 'refs/heads/main', repository: { full_name: 'octo/demo' }, pusher: { name: 'octocat' }, commits: [{ id: 'a1b2c3d', message: 'Fix bug' }] },
  Stripe: { id: 'evt_1Nxxxxxxxx', object: 'event', type: 'payment_intent.succeeded', data: { object: { id: 'pi_123', amount: 2000, currency: 'eur', status: 'succeeded' } } },
  Slack: { type: 'event_callback', team_id: 'T123', event: { type: 'message', user: 'U123', text: 'hello', channel: 'C123', ts: '1700000000.000100' } },
  Shopify: { id: 820982911946154500, email: 'jon@example.com', total_price: '199.00', currency: 'EUR', financial_status: 'paid' },
  Generic: { event: 'user.created', data: { id: 42, email: 'a@example.com' } },
};
T.push({
  id: 'webhook-payload-simulator', cat: 'Network & HTTP', title: 'Webhook Payload & Signature Simulator', desc: 'Build a signed webhook request for GitHub, Stripe, Slack, Shopify or a generic HMAC scheme: exact body, headers, HMAC signature and a curl command to replay it against your endpoint. Nothing is sent from the browser.',
  labels: ['JSON payload (blank = sample event)'], sample: '',
  opts: [sel('provider', 'Provider', 'GitHub', ['GitHub', 'Stripe', 'Slack', 'Shopify', 'Generic (X-Signature)']), txt('secret', 'Signing secret', 'whsec_test_secret'), txt('url', 'Endpoint URL', 'https://example.com/webhooks'), txt('event', 'Event name (GitHub/Shopify)', 'push'), txt('ts', 'Timestamp (epoch seconds, blank = now)', '')],
  run: async ([s], o) => {
    const key = o.provider.split(' ')[0];
    const body = JSON.stringify(s.trim() ? parseJ(s) : WH_SAMPLES[key]);
    const ts = o.ts.trim() ? String(Math.floor(+o.ts)) : String(Math.floor(Date.now() / 1000)), hdr = [['Content-Type', 'application/json'], ['User-Agent', ({ GitHub: 'GitHub-Hookshot/simulated', Stripe: 'Stripe/1.0 (+https://stripe.com/docs/webhooks)', Slack: 'Slackbot 1.0 (+https://api.slack.com/robots)', Shopify: 'Shopify-Captain-Hook', Generic: 'webhook-simulator/1.0' })[key]]];
    let how;
    if (key === 'GitHub') { hdr.push(['X-GitHub-Event', o.event || 'push'], ['X-GitHub-Delivery', crypto.randomUUID()], ['X-Hub-Signature-256', 'sha256=' + hex(await hmacHex(o.secret, body))]); how = 'X-Hub-Signature-256 = "sha256=" + hex(HMAC_SHA256(secret, rawBody))'; }
    else if (key === 'Stripe') { hdr.push(['Stripe-Signature', `t=${ts},v1=${hex(await hmacHex(o.secret, ts + '.' + body))}`]); how = 'Stripe-Signature = t=<ts>,v1=hex(HMAC_SHA256(secret, ts + "." + rawBody)); reject if |now - t| > 5 min'; }
    else if (key === 'Slack') { hdr.push(['X-Slack-Request-Timestamp', ts], ['X-Slack-Signature', 'v0=' + hex(await hmacHex(o.secret, `v0:${ts}:${body}`))]); how = 'X-Slack-Signature = "v0=" + hex(HMAC_SHA256(secret, "v0:" + ts + ":" + rawBody)); reject if timestamp older than 5 min'; }
    else if (key === 'Shopify') { hdr.push(['X-Shopify-Topic', o.event === 'push' ? 'orders/create' : o.event], ['X-Shopify-Hmac-Sha256', b64(await hmacHex(o.secret, body))], ['X-Shopify-Shop-Domain', 'demo.myshopify.com']); how = 'X-Shopify-Hmac-Sha256 = base64(HMAC_SHA256(secret, rawBody))'; }
    else { hdr.push(['X-Signature', 'sha256=' + hex(await hmacHex(o.secret, body))], ['X-Timestamp', ts]); how = 'X-Signature = "sha256=" + hex(HMAC_SHA256(secret, rawBody))'; }
    const q = (x) => "'" + x.replace(/'/g, "'\\''") + "'";
    return `POST ${o.url}\n${hdr.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${body}\n\nSignature scheme: ${how}\nVerify against the RAW request bytes, compare in constant time.\n\ncurl -X POST ${q(o.url)} \\\n${hdr.map(([k, v]) => `  -H ${q(k + ': ' + v)} \\`).join('\n')}\n  --data-binary ${q(body)}`;
  },
});

// ---- TLS handshake simulator
T.push({
  id: 'ssl-tls-handshake-simulator', cat: 'Network & HTTP', title: 'TLS Handshake Simulator', desc: 'Step through TLS 1.2 and TLS 1.3 handshakes (full, resumption, mutual TLS, 0-RTT): messages, what each carries, round trips, and time before the first request byte at your RTT. An explanatory model, not a packet capture.',
  inputs: 0, sample: '',
  opts: [sel('ver', 'Version', 'TLS 1.3', ['TLS 1.3', 'TLS 1.2']), sel('sc', 'Scenario', 'full handshake', ['full handshake', 'resumption', 'mutual TLS (client certificate)', '0-RTT resumption (TLS 1.3 only)']), num('rtt', 'Round-trip time (ms)', 80), chk('tcp', 'Include TCP handshake', true)],
  run: (_i, o) => {
    const v13 = o.ver === 'TLS 1.3', mtls = o.sc.startsWith('mutual'), res = o.sc === 'resumption' || o.sc.startsWith('0-RTT'), zero = o.sc.startsWith('0-RTT');
    if (zero && !v13) throw new Error('0-RTT is a TLS 1.3 feature');
    const S = []; let rt;
    if (v13) {
      S.push(['C->S', 'ClientHello', `supported_versions=1.3, cipher_suites (TLS_AES_128_GCM_SHA256, ...), key_share (X25519 public key), SNI, ALPN, signature_algorithms${res ? ', pre_shared_key (session ticket + binder), psk_key_exchange_modes' : ''}${zero ? ', early_data' : ''}`]);
      if (zero) S.push(['C->S', '(0-RTT) Application data', 'Encrypted with early traffic secret from the PSK, sent immediately. Replayable by an attacker: only for idempotent requests.']);
      S.push(['S->C', 'ServerHello', `chosen cipher suite, key_share (server X25519 key)${res ? ', pre_shared_key (accepted)' : ''}. Both sides now derive handshake traffic secrets; everything after this is encrypted.`]);
      S.push(['S->C', '{EncryptedExtensions}', 'ALPN result, other extensions' + (zero ? ', early_data accepted' : '')]);
      if (mtls) S.push(['S->C', '{CertificateRequest}', 'asks the client for a certificate']);
      if (!res) S.push(['S->C', '{Certificate} + {CertificateVerify}', 'server certificate chain and a signature over the transcript proving key ownership']);
      S.push(['S->C', '{Finished}', 'MAC over the whole handshake transcript']);
      if (mtls) S.push(['C->S', '{Certificate} + {CertificateVerify}', 'client certificate chain and proof of key ownership']);
      S.push(['C->S', '{Finished}' + (zero ? ' + {EndOfEarlyData}' : ''), 'client MAC; application traffic keys are now in use. The client can send the real request in this same flight.']);
      S.push(['S->C', '{NewSessionTicket}', 'post-handshake: ticket enabling later resumption / 0-RTT']);
      rt = zero ? 0 : 1;
    } else {
      S.push(['C->S', 'ClientHello', `TLS 1.2, cipher suites (e.g. ECDHE-RSA-AES128-GCM-SHA256), client_random, extensions (SNI, ALPN, supported_groups)${res ? ', session ID / session ticket' : ''}`]);
      if (res) {
        S.push(['S->C', 'ServerHello + ChangeCipherSpec + Finished', 'server accepts the session; keys come from the cached master secret, no certificate or key exchange needed']);
        S.push(['C->S', 'ChangeCipherSpec + Finished', 'client confirms; application data can follow']);
        rt = 1;
      } else {
        S.push(['S->C', 'ServerHello', 'chosen cipher suite, server_random, session ID']);
        S.push(['S->C', 'Certificate', 'server certificate chain']);
        S.push(['S->C', 'ServerKeyExchange', 'ephemeral ECDHE parameters signed with the certificate key (forward secrecy)']);
        if (mtls) S.push(['S->C', 'CertificateRequest', 'asks the client for a certificate']);
        S.push(['S->C', 'ServerHelloDone', 'end of the server flight']);
        if (mtls) S.push(['C->S', 'Certificate', 'client certificate chain']);
        S.push(['C->S', 'ClientKeyExchange', 'client ECDHE public value; both sides compute the pre-master and master secrets']);
        if (mtls) S.push(['C->S', 'CertificateVerify', 'signature proving possession of the client key']);
        S.push(['C->S', 'ChangeCipherSpec + Finished', 'switch to encrypted records, MAC over the transcript']);
        S.push(['S->C', '[NewSessionTicket] + ChangeCipherSpec + Finished', 'server confirms; application data can now flow']);
        rt = 2;
      }
    }
    const tcp = o.tcp ? 1 : 0, rtt = o.rtt;
    const L = [`${o.ver} - ${o.sc}`, '', ...S.map((s, i) => `${String(i + 1).padStart(2)}. ${s[0]}  ${s[1]}\n      ${s[2]}`), '', `TLS round trips before the client can send its request: ${rt}${zero ? ' (request rides along with the ClientHello)' : ''}`, `Time to request sent: ${(tcp + rt) * rtt} ms${tcp ? ` (TCP ${rtt} ms + TLS ${rt * rtt} ms)` : ''};  time to first response byte: ~${(tcp + rt + 1) * rtt} ms + server time`, '', v13 ? 'TLS 1.3 removes the RSA key exchange and the separate ChangeCipherSpec round trip; all handshake messages after ServerHello are encrypted.' : 'TLS 1.2 needs 2 round trips for a full handshake (1 with resumption). TLS 1.3 saves one round trip.'];
    if (mtls && v13) L.push('Mutual TLS adds no extra round trip in TLS 1.3 because the client certificate travels in the client Finished flight.');
    return L.join('\n');
  },
});

// ---- HTTP/2 + HTTP/3 frame inspector
const H2_TYPES = ['DATA', 'HEADERS', 'PRIORITY', 'RST_STREAM', 'SETTINGS', 'PUSH_PROMISE', 'PING', 'GOAWAY', 'WINDOW_UPDATE', 'CONTINUATION'];
const H2_SET = { 1: 'HEADER_TABLE_SIZE', 2: 'ENABLE_PUSH', 3: 'MAX_CONCURRENT_STREAMS', 4: 'INITIAL_WINDOW_SIZE', 5: 'MAX_FRAME_SIZE', 6: 'MAX_HEADER_LIST_SIZE', 8: 'ENABLE_CONNECT_PROTOCOL' };
const H2_ERR = ['NO_ERROR', 'PROTOCOL_ERROR', 'INTERNAL_ERROR', 'FLOW_CONTROL_ERROR', 'SETTINGS_TIMEOUT', 'STREAM_CLOSED', 'FRAME_SIZE_ERROR', 'REFUSED_STREAM', 'CANCEL', 'COMPRESSION_ERROR', 'CONNECT_ERROR', 'ENHANCE_YOUR_CALM', 'INADEQUATE_SECURITY', 'HTTP_1_1_REQUIRED'];
const HPACK_STATIC = [[':authority'], [':method', 'GET'], [':method', 'POST'], [':path', '/'], [':path', '/index.html'], [':scheme', 'http'], [':scheme', 'https'], [':status', '200'], [':status', '204'], [':status', '206'], [':status', '304'], [':status', '400'], [':status', '404'], [':status', '500'], ['accept-charset'], ['accept-encoding', 'gzip, deflate'], ['accept-language'], ['accept-ranges'], ['accept'], ['access-control-allow-origin'], ['age'], ['allow'], ['authorization'], ['cache-control'], ['content-disposition'], ['content-encoding'], ['content-language'], ['content-length'], ['content-location'], ['content-range'], ['content-type'], ['cookie'], ['date'], ['etag'], ['expect'], ['expires'], ['from'], ['host'], ['if-match'], ['if-modified-since'], ['if-none-match'], ['if-range'], ['if-unmodified-since'], ['last-modified'], ['link'], ['location'], ['max-forwards'], ['proxy-authenticate'], ['proxy-authorization'], ['range'], ['referer'], ['refresh'], ['retry-after'], ['server'], ['set-cookie'], ['strict-transport-security'], ['transfer-encoding'], ['user-agent'], ['vary'], ['via'], ['www-authenticate']];
function hpackDecode(u, dyn) {
  const out = []; let i = 0;
  const int = (pre) => { let v = u[i++] & ((1 << pre) - 1); if (v < (1 << pre) - 1) return v; let m = 0, b; do { b = u[i++]; if (b === undefined) throw new Error('truncated HPACK integer'); v += (b & 127) * 2 ** m; m += 7; } while (b & 128); return v; };
  const str = () => { const hf = u[i] & 0x80, n = int(7); if (i + n > u.length) throw new Error('truncated HPACK string'); const b = u.subarray(i, i + n); i += n; return hf ? `<huffman:${hex(b)}>` : dec.decode(b); };
  const entry = (idx) => { const e = idx <= 61 ? HPACK_STATIC[idx - 1] : dyn[idx - 62]; if (!idx || !e) throw new Error('HPACK index out of range: ' + idx); return e; };
  while (i < u.length) {
    const b = u[i];
    if (b & 0x80) { const e = entry(int(7)); out.push(`${e[0]}: ${e[1] ?? ''}   [indexed]`); }
    else if ((b & 0xe0) === 0x20) out.push(`(dynamic table size update: ${int(5)})`);
    else {
      const inc = (b & 0xc0) === 0x40, pre = inc ? 6 : 4, idx = int(pre), name = idx ? entry(idx)[0] : str(), val = str();
      out.push(`${name}: ${val}   [literal${inc ? ', added to dynamic table' : (b & 0x10) ? ', never indexed' : ''}]`);
      if (inc) dyn.unshift([name, val]);
    }
  }
  return out;
}
const flagNames = (t, f) => { const m = { 0: [[1, 'END_STREAM'], [8, 'PADDED']], 1: [[1, 'END_STREAM'], [4, 'END_HEADERS'], [8, 'PADDED'], [0x20, 'PRIORITY']], 4: [[1, 'ACK']], 5: [[4, 'END_HEADERS'], [8, 'PADDED']], 6: [[1, 'ACK']], 9: [[4, 'END_HEADERS']] }[t] || []; return m.filter(([b]) => f & b).map(([, n]) => n).join('|') || '-'; };
const readVarint = (u, i) => { const l = 1 << (u[i] >> 6); if (i + l > u.length) throw new Error('truncated varint'); let v = BigInt(u[i] & 0x3f); for (let k = 1; k < l; k++) v = (v << 8n) | BigInt(u[i + k]); return [Number(v), i + l]; };
T.push({
  id: 'http2-http3-frame-inspector', cat: 'Network & HTTP', title: 'HTTP/2 & HTTP/3 Frame Inspector', desc: 'Decode hex dumps of HTTP/2 frames (with the client preface, SETTINGS, HEADERS with HPACK, DATA, GOAWAY ...) or HTTP/3 frames (varint type/length, SETTINGS). HPACK Huffman-coded strings are shown as hex and QPACK blocks are not decoded.',
  labels: ['Hex bytes'], sample: '505249202a20485454502f322e300d0a0d0a534d0d0a0d0a00000c04000000000000030000006400040000ffff000014010500000001828684410f7777772e6578616d706c652e636f6d00000500010000000168656c6c6f00000b0700000000000000000000000000627965',
  opts: [sel('proto', 'Protocol', 'HTTP/2', ['HTTP/2', 'HTTP/3'])],
  run: ([s], o) => {
    let u = unhex(s); const L = [];
    if (o.proto === 'HTTP/2') {
      const pre = enc.encode('PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n');
      if (u.length >= 24 && pre.every((b, k) => u[k] === b)) { L.push('Connection preface: "PRI * HTTP/2.0 \\r\\n\\r\\nSM\\r\\n\\r\\n" (24 bytes, client -> server)'); u = u.subarray(24); }
      const dyn = []; let i = 0, n = 0;
      while (i < u.length) {
        if (u.length - i < 9) { L.push(`(trailing ${u.length - i} bytes, incomplete frame header)`); break; }
        const len = (u[i] << 16) | (u[i + 1] << 8) | u[i + 2], t = u[i + 3], f = u[i + 4], sid = ((u[i + 5] & 0x7f) << 24) | (u[i + 6] << 16) | (u[i + 7] << 8) | u[i + 8];
        const dv = new DataView(u.buffer, u.byteOffset + i + 9), name = H2_TYPES[t] || `UNKNOWN(0x${t.toString(16)})`;
        n++; L.push(`#${n} ${name}  stream=${sid}  length=${len}  flags=0x${f.toString(16).padStart(2, '0')} [${flagNames(t, f)}]`);
        if (i + 9 + len > u.length) { L.push(`   (payload truncated: only ${u.length - i - 9} of ${len} bytes present)`); break; }
        let p = u.subarray(i + 9, i + 9 + len);
        if ([0, 1, 5].includes(t) && f & 8) { const pad = p[0]; L.push(`   padding: ${pad} bytes`); p = p.subarray(1, p.length - pad); }
        if (t === 4) { if (f & 1) L.push('   SETTINGS ACK'); else for (let k = 0; k + 6 <= p.length; k += 6) { const id = (p[k] << 8) | p[k + 1], v = new DataView(p.buffer, p.byteOffset + k + 2).getUint32(0); L.push(`   ${H2_SET[id] || 'UNKNOWN(' + id + ')'} = ${v}`); } }
        else if (t === 1 || t === 9 || t === 5) {
          let q = p;
          if (t === 5) { L.push(`   promised stream: ${new DataView(p.buffer, p.byteOffset).getUint32(0) & 0x7fffffff}`); q = p.subarray(4); }
          if (t === 1 && f & 0x20) { const dep = new DataView(p.buffer, p.byteOffset).getUint32(0); L.push(`   priority: depends on ${dep & 0x7fffffff}${dep >>> 31 ? ' (exclusive)' : ''}, weight ${p[4] + 1}`); q = p.subarray(5); }
          try { for (const l of hpackDecode(q, dyn)) L.push('   ' + l); } catch (e) { L.push('   (HPACK decode failed: ' + e.message + ') ' + hex(q)); }
          if (!(f & 4)) L.push('   (header block continues in a CONTINUATION frame)');
        }
        else if (t === 0) L.push(`   data: ${p.length} bytes  ${/^[\x20-\x7e\r\n\t]*$/.test(dec.decode(p)) ? JSON.stringify(dec.decode(p).slice(0, 80)) : hex(p.subarray(0, 32))}`);
        else if (t === 2) { const d = dv.getUint32(0); L.push(`   depends on ${d & 0x7fffffff}${d >>> 31 ? ' (exclusive)' : ''}, weight ${p[4] + 1}`); }
        else if (t === 3) { const e = dv.getUint32(0); L.push(`   error: ${H2_ERR[e] || '0x' + e.toString(16)}`); }
        else if (t === 6) L.push(`   opaque data: ${hex(p)}`);
        else if (t === 7) { const e = dv.getUint32(4); L.push(`   last stream id: ${dv.getUint32(0) & 0x7fffffff}   error: ${H2_ERR[e] || '0x' + e.toString(16)}${p.length > 8 ? '   debug: ' + JSON.stringify(dec.decode(p.subarray(8))) : ''}`); }
        else if (t === 8) L.push(`   window size increment: ${dv.getUint32(0) & 0x7fffffff}`);
        i += 9 + len;
      }
    } else {
      const T3 = { 0: 'DATA', 1: 'HEADERS', 3: 'CANCEL_PUSH', 4: 'SETTINGS', 5: 'PUSH_PROMISE', 7: 'GOAWAY', 13: 'MAX_PUSH_ID' }, S3 = { 1: 'QPACK_MAX_TABLE_CAPACITY', 6: 'MAX_FIELD_SECTION_SIZE', 7: 'QPACK_BLOCKED_STREAMS', 8: 'ENABLE_CONNECT_PROTOCOL', 51: 'H3_DATAGRAM' };
      let i = 0, n = 0;
      while (i < u.length) {
        let t, len; [t, i] = readVarint(u, i); [len, i] = readVarint(u, i);
        n++; L.push(`#${n} ${T3[t] || (t >= 0x21 && (t - 0x21) % 0x1f === 0 ? 'GREASE (reserved)' : 'UNKNOWN(0x' + t.toString(16) + ')')}  length=${len}`);
        if (i + len > u.length) { L.push(`   (payload truncated: ${u.length - i} of ${len} bytes)`); break; }
        const p = u.subarray(i, i + len);
        if (t === 4) { let k = 0; while (k < p.length) { let id, v; [id, k] = readVarint(p, k); [v, k] = readVarint(p, k); L.push(`   ${S3[id] || 'UNKNOWN(0x' + id.toString(16) + ')'} = ${v}`); } }
        else if (t === 0) L.push(`   data: ${p.length} bytes  ${/^[\x20-\x7e\r\n\t]*$/.test(dec.decode(p)) ? JSON.stringify(dec.decode(p).slice(0, 80)) : hex(p.subarray(0, 32))}`);
        else if (t === 1) L.push(`   QPACK field section (not decoded): required insert count=${p[0]}, base delta byte=0x${(p[1] ?? 0).toString(16)}, encoded lines: ${hex(p.subarray(2))}`);
        else if (t === 7 || t === 3 || t === 13) L.push(`   id: ${readVarint(p, 0)[0]}`);
        i += len;
      }
    }
    if (!L.length) throw new Error('No frames found');
    return L.join('\n');
  },
});

// ---- SPF flattener (offline)
T.push({
  id: 'dns-spf-record-flattener', cat: 'Network & HTTP', title: 'SPF Record Flattener (offline)', desc: 'Flatten an SPF record by inlining include:/redirect= records that you paste (lines "domain: v=spf1 ..."), de-duplicating ip4/ip6, counting DNS lookups against the limit of 10, and splitting long TXT strings. The tool never queries DNS: resolve each include yourself (dig +short TXT domain).',
  inputs: 2, labels: ['Your SPF record', 'Included records ("domain: v=spf1 ..." one per line)'],
  sample: 'v=spf1 include:_spf.example.net include:mail.example.org ip4:203.0.113.5 a mx -all', sample2: '_spf.example.net: v=spf1 ip4:198.51.100.0/24 ip4:203.0.113.5 include:deep.example.net ~all\ndeep.example.net: v=spf1 ip4:192.0.2.0/25 ip6:2001:db8::/32 -all',
  run: ([root, extra]) => {
    const db = {};
    for (const l of lines(extra)) { const i = l.indexOf(':'); if (i < 1) throw new Error('Included records must look like "domain: v=spf1 ..."'); db[l.slice(0, i).trim().toLowerCase().replace(/\.$/, '')] = l.slice(i + 1).trim().replace(/^"|"$/g, '').replace(/"\s*"/g, ''); }
    const r0 = root.trim().replace(/^"|"$/g, '').replace(/"\s*"/g, '');
    if (!/^v=spf1\b/i.test(r0)) throw new Error('Your record must start with v=spf1');
    const ip4 = new Set(), ip6 = new Set(), keep = new Set(), missing = new Set(), seen = new Set();
    let lookups = 0, all = '', bad = false;
    const walk = (rec, depth) => {
      if (depth > 10) { bad = true; return; }
      for (const t of rec.split(/\s+/).slice(1)) {
        const m = /^([+\-~?]?)([a-z0-9]+)(?:[:=](.+))?$/i.exec(t) || [];
        const q = m[1] || '', k = (m[2] || '').toLowerCase(), v = m[3];
        if (k === 'ip4') ip4.add(`${q === '-' ? '-' : ''}${v}`.replace(/^-/, '')); else if (k === 'ip6') ip6.add(v);
        else if (k === 'include' || k === 'redirect') {
          lookups++; const d = v.toLowerCase().replace(/\.$/, '');
          if (seen.has(d) && depth) { bad = true; continue; }
          seen.add(d);
          if (db[d]) walk(db[d], depth + 1); else { missing.add(d); keep.add(t); }
        } else if (['a', 'mx', 'ptr', 'exists'].includes(k)) { lookups++; keep.add(t); }
        else if (k === 'all') { if (!depth) all = t; }
        else if (t && !/^v=spf1$/i.test(t)) keep.add(t);
      }
    };
    walk(r0, 0);
    const parts = ['v=spf1', ...[...ip4].map((x) => 'ip4:' + x), ...[...ip6].map((x) => 'ip6:' + x), ...keep, all || '~all'];
    const flat = parts.join(' '), strs = flat.match(/.{1,255}/g);
    const L = [`Flattened record (${flat.length} characters):`, flat, ''];
    L.push(strs.length > 1 ? `TXT strings (split at 255 chars; ${strs.length} strings in one record):\n${strs.map((x) => '"' + x + '"').join(' ')}` : `TXT value:\n"${flat}"`);
    L.push('', `DNS lookups in the original (include/redirect/a/mx/ptr/exists): ${lookups} of 10 allowed${lookups > 10 ? ' - OVER THE LIMIT (permerror)' : ''}`);
    const remaining = keep.size; L.push(`Lookups left in the flattened record: ${remaining} of 10`);
    if (missing.size) L.push('', `Not flattened (paste their records in the second box): ${[...missing].join(', ')}`);
    if (keep.size) L.push('a / mx / exists / ptr mechanisms cannot be flattened offline (they need A/MX lookups); they were kept as-is.');
    if (flat.length > 450) L.push('Warning: the record is over ~450 characters; a UDP DNS response may truncate. Consider splitting by sending service or using fewer providers.');
    if (bad) L.push('Warning: include loop or nesting deeper than 10 detected.');
    L.push('', 'Caveat: flattening freezes provider IPs. Providers change them, so re-flatten regularly (automated flattening services exist for this) or you will break delivery.');
    return L.join('\n');
  },
});

// ---- robots / noindex simulator
const robotsMatch = (txt, ua, path) => {
  const groups = []; let cur = null, lastWasUA = false;
  for (const raw of txt.split(/\r?\n/)) {
    const l = raw.replace(/#.*/, '').trim(); const i = l.indexOf(':'); if (i < 0) continue;
    const k = l.slice(0, i).trim().toLowerCase(), v = l.slice(i + 1).trim();
    if (k === 'user-agent') { if (!cur || !lastWasUA) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasUA = true; }
    else if (cur && (k === 'allow' || k === 'disallow')) { cur.rules.push([k, v]); lastWasUA = false; }
  }
  const u = ua.toLowerCase();
  let best = null, bl = -1;
  for (const g of groups) for (const a of g.agents) if (a !== '*' && u.includes(a) && a.length > bl) { best = g; bl = a.length; }
  if (!best) best = groups.find((g) => g.agents.includes('*')) || null;
  if (!best) return { allowed: true, rule: 'no matching group: allowed' };
  let win = null, wl = -1;
  for (const [k, v] of best.rules) {
    if (!v) continue;
    const re = new RegExp('^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(path)) { const len = v.length; if (len > wl || (len === wl && k === 'allow')) { win = [k, v]; wl = len; } }
  }
  return win ? { allowed: win[0] === 'allow', rule: `${win[0]}: ${win[1]}` } : { allowed: true, rule: 'no rule matches: allowed' };
};
T.push({
  id: 'seo-robots-noindex-simulator', cat: 'SEO – Technical', title: 'Robots / Noindex Indexability Simulator', desc: 'Combine robots.txt, X-Robots-Tag headers, meta robots and canonical to see whether a URL can be crawled and indexed, and warn about the classic mistake of blocking a noindex page in robots.txt.',
  inputs: 2, labels: ['robots.txt', 'Response headers, a blank line, then the page HTML (head is enough)'],
  sample: 'User-agent: *\nDisallow: /private/\nAllow: /private/public-report.html\n\nUser-agent: Googlebot\nDisallow: /tmp/', sample2: 'HTTP/1.1 200 OK\nContent-Type: text/html\nX-Robots-Tag: googlebot: noarchive\n\n<html><head>\n<meta name="robots" content="noindex, follow">\n<link rel="canonical" href="https://example.com/page">\n</head><body></body></html>',
  opts: [txt('path', 'URL path to test', '/page'), txt('ua', 'User agent', 'Googlebot')],
  run: ([robots, page], o) => {
    const path = o.path.startsWith('/') ? o.path : '/' + o.path, r = robotsMatch(robots, o.ua, path);
    const [head, ...bodyP] = page.split(/\r?\n\r?\n/), body = bodyP.join('\n\n') || (/<[a-z]/i.test(head) ? head : '');
    const hdr = /<[a-z]/i.test(head) && !bodyP.length ? [] : parseHeaders(head);
    const L = [`URL path: ${path}   user agent: ${o.ua}`, `robots.txt: ${r.allowed ? 'CRAWLING ALLOWED' : 'CRAWLING BLOCKED'}  (${r.rule})`];
    const status = /^HTTP\/[\d.]+\s+(\d{3})/m.exec(head);
    const dirs = [], src = [];
    const addDir = (txt, from) => { for (const d of txt.toLowerCase().split(',').map((x) => x.trim()).filter(Boolean)) { dirs.push(d); src.push(`${d}  (${from})`); } };
    for (const [, v] of hdr.filter((x) => x[0] === 'x-robots-tag')) {
      const m = /^([\w-]+)\s*:\s*(.+)$/.exec(v);
      if (m && !/^(noindex|nofollow|none|noarchive|nosnippet|all|noimageindex|notranslate|unavailable_after|max-)/i.test(m[1])) { if (o.ua.toLowerCase().includes(m[1].toLowerCase()) || m[1] === '*') addDir(m[2], 'X-Robots-Tag for ' + m[1]); } else addDir(v, 'X-Robots-Tag');
    }
    for (const m of body.matchAll(/<meta\s+[^>]*name\s*=\s*["']?(robots|googlebot|bingbot)["']?[^>]*>/gi)) {
      const c = /content\s*=\s*["']([^"']*)["']/i.exec(m[0]);
      if (c && (m[1].toLowerCase() === 'robots' || o.ua.toLowerCase().includes(m[1].toLowerCase()))) addDir(c[1], `meta ${m[1]}`);
    }
    const noindex = dirs.some((d) => d === 'noindex' || d === 'none'), nofollow = dirs.some((d) => d === 'nofollow' || d === 'none');
    const canon = /<link\s+[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.exec(body), href = canon && /href\s*=\s*["']([^"']+)/i.exec(canon[0]);
    if (status && +status[1] >= 400) L.push(`HTTP status ${status[1]}: error pages are dropped from the index.`);
    if (status && +status[1] >= 300 && +status[1] < 400) L.push(`HTTP status ${status[1]}: redirect, the target is indexed instead.`);
    L.push(src.length ? 'Directives found:\n' + src.map((x) => '  - ' + x).join('\n') : 'Directives found: none (defaults to index, follow)');
    let verdict;
    if (!r.allowed) {
      verdict = noindex ? 'AMBIGUOUS / PROBLEM: the page is blocked in robots.txt, so crawlers never fetch it and never see the noindex. The bare URL can still be indexed (without content) if other sites link to it. Allow crawling and keep noindex to remove it from results.' : 'NOT CRAWLED: the content is not fetched. The URL may still appear in results as a bare link if it is linked from elsewhere; use noindex (with crawling allowed) to keep it out of the index.';
    } else if (noindex) verdict = 'NOT INDEXED: noindex is honored because the page is crawlable.' + (nofollow ? ' Links on it are not followed.' : ' Links are still followed (for now: Google treats long-term noindex as nofollow).');
    else verdict = 'INDEXABLE: crawling is allowed and nothing forbids indexing' + (dirs.length ? ' (other directives: ' + dirs.join(', ') + ').' : '.');
    L.push('', verdict);
    if (href) { const c = href[1], other = /^https?:\/\//i.test(c) && !c.split('?')[0].endsWith(path); L.push(`Canonical: ${c}${other ? '  -> signals that a different URL should be indexed instead' : '  (self-referencing)'}`); if (noindex && other) L.push('Warning: noindex combined with a canonical to another URL sends mixed signals; use one.'); }
    const au = dirs.find((d) => d.startsWith('unavailable_after')); if (au) L.push(`${au}: the page drops out of the index after that date.`);
    return L.join('\n');
  },
});

// ---- CORS preflight inspector
const SAFE_H = new Set(['accept', 'accept-language', 'content-language', 'content-type', 'range']);
T.push({
  id: 'cors-preflight-inspector', cat: 'Network & HTTP', title: 'CORS Preflight Inspector', desc: 'Describe the browser request (method, Origin, headers) and paste the server\'s response headers: see whether a preflight is needed, what the OPTIONS request would contain, and exactly why the response would be accepted or blocked.',
  inputs: 2, labels: ['Request (Method:, Origin:, then other request headers)', 'Preflight / actual response headers'],
  sample: 'Method: PUT\nOrigin: https://app.example.com\nContent-Type: application/json\nAuthorization: Bearer abc\nX-Request-Id: 1', sample2: 'HTTP/1.1 204 No Content\nAccess-Control-Allow-Origin: https://app.example.com\nAccess-Control-Allow-Methods: GET, POST, PUT\nAccess-Control-Allow-Headers: content-type, x-request-id\nAccess-Control-Max-Age: 600\nVary: Origin',
  opts: [chk('cred', 'Request includes credentials (cookies / fetch credentials: include)', false)],
  run: ([rq, rs], o) => {
    const reqH = parseHeaders(rq), method = (hget(reqH, 'method')[0] || 'GET').toUpperCase(), origin = hget(reqH, 'origin')[0];
    if (!origin) throw new Error('The request needs an "Origin: https://..." line');
    const custom = reqH.filter(([k]) => !['method', 'origin'].includes(k)), unsafe = [];
    for (const [k, v] of custom) {
      if (!SAFE_H.has(k)) unsafe.push(k);
      else if (k === 'content-type' && !/^(application\/x-www-form-urlencoded|multipart\/form-data|text\/plain)\s*(;|$)/i.test(v)) unsafe.push(k + ' (value ' + v.split(';')[0] + ' is not safelisted)');
    }
    const simpleMethod = ['GET', 'HEAD', 'POST'].includes(method), pre = !simpleMethod || unsafe.length > 0;
    const h = parseHeaders(rs), g = (k) => hget(h, k)[0], L = [];
    L.push(`Request: ${method} from ${origin}${o.cred ? ' with credentials' : ''}`, pre ? `Preflight REQUIRED because: ${[!simpleMethod ? `method ${method} is not GET/HEAD/POST` : '', unsafe.length ? 'non-safelisted header(s): ' + unsafe.join(', ') : ''].filter(Boolean).join('; ')}` : 'Simple request: no preflight, the browser sends it directly and checks the response headers.');
    if (pre) {
      const names = [...new Set(custom.map((x) => x[0]).filter((k) => !SAFE_H.has(k) || k === 'content-type'))].filter((k) => unsafe.some((u) => u.startsWith(k))).sort();
      L.push('', 'Preflight the browser will send:', `  OPTIONS <url>\n  Origin: ${origin}\n  Access-Control-Request-Method: ${method}${names.length ? '\n  Access-Control-Request-Headers: ' + names.join(', ') : ''}`);
    }
    const problems = [], ok = [];
    const st = /^HTTP\/[\d.]+\s+(\d{3})/m.exec(rs);
    if (pre && st && !(+st[1] >= 200 && +st[1] < 300)) problems.push(`preflight status ${st[1]} is not 2xx (redirects are also not allowed on preflights)`);
    else if (pre && st) ok.push(`preflight status ${st[1]} OK`);
    const acao = g('access-control-allow-origin'), acac = g('access-control-allow-credentials');
    if (!acao) problems.push('Access-Control-Allow-Origin is missing');
    else if (acao === '*') { if (o.cred) problems.push('Access-Control-Allow-Origin: * is not allowed with credentials; echo the exact origin'); else ok.push('Allow-Origin: * matches'); }
    else if (acao.trim() === 'null' && origin !== 'null') problems.push('Allow-Origin is "null" but the origin is ' + origin);
    else if (acao.trim() !== origin) problems.push(`Allow-Origin "${acao}" does not equal the request origin "${origin}" (must be an exact string match; only one origin is allowed per response)`);
    else ok.push('Allow-Origin matches the origin');
    if (o.cred) { if (acac !== 'true') problems.push('Access-Control-Allow-Credentials: true is required for credentialed requests'); else ok.push('Allow-Credentials: true'); }
    else if (acac && acac !== 'true') problems.push('Access-Control-Allow-Credentials must be exactly "true" (or omitted)');
    if (pre) {
      const am = (g('access-control-allow-methods') || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
      if (!['GET', 'HEAD', 'POST'].includes(method)) { if (am.includes(method) || (am.includes('*') && !o.cred)) ok.push(`Allow-Methods covers ${method}`); else problems.push(`Access-Control-Allow-Methods does not include ${method}${am.includes('*') && o.cred ? ' ("*" is a literal with credentials)' : ''}`); }
      const ah = (g('access-control-allow-headers') || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
      for (const hn of custom.map((x) => x[0]).filter((k) => !SAFE_H.has(k) && k !== 'method' && k !== 'origin')) {
        if (ah.includes(hn) || (ah.includes('*') && !o.cred && hn !== 'authorization')) ok.push(`Allow-Headers covers ${hn}`);
        else problems.push(`Access-Control-Allow-Headers does not allow "${hn}"${hn === 'authorization' && ah.includes('*') ? ' (the * wildcard never covers Authorization: list it explicitly)' : ''}`);
      }
      if (unsafe.some((x) => x.startsWith('content-type')) && !ah.includes('content-type') && !ah.includes('*')) problems.push('Access-Control-Allow-Headers must include content-type for this Content-Type value');
      const mxa = g('access-control-max-age'); L.length; if (mxa) ok.push(`Max-Age ${mxa}s (browsers cap it: Chrome 2 h, Firefox 24 h)`); else ok.push('no Max-Age: browsers cache the preflight for only ~5 s, add Access-Control-Max-Age to cut OPTIONS traffic');
    }
    if (acao && acao !== '*' && !/origin/i.test(g('vary') || '')) problems.push('Warning: Vary: Origin is missing; shared caches may serve one origin\'s Allow-Origin to another');
    L.push('', ...ok.map((x) => 'PASS  ' + x), ...problems.map((x) => (x.startsWith('Warning') ? 'WARN  ' + x.slice(9) : 'FAIL  ' + x)));
    L.push('', problems.some((x) => !x.startsWith('Warning')) ? 'RESULT: the browser would BLOCK this request/response.' : 'RESULT: the browser would ALLOW it.');
    if (pre) L.push('Remember: the actual (non-preflight) response must also carry Access-Control-Allow-Origin (and Allow-Credentials when used).');
    return L.join('\n');
  },
});

// ---- CSS selector profiler (needs DOM)
T.push({
  id: 'css-selector-speed-profiler', cat: 'CSS', title: 'CSS Selector Speed Profiler', desc: 'Time querySelectorAll for each selector against your HTML in this browser and rate its structural cost (key selector, descendant depth, :has(), attribute substring matches). Real style-matching cost differs by engine; use this for relative comparison.',
  dom: true, inputs: 2, labels: ['HTML', 'Selectors (one per line)'],
  sample: '<ul id="menu"><li class="item"><a href="/a" class="link">A</a></li><li class="item active"><a href="/b" class="link ext">B</a></li><li class="item"><a href="https://x.dev" class="link">C</a></li></ul>', sample2: '#menu .item > a.link\nul li a\n*\n[href*="x.dev"]\nli:not(.active):nth-child(odd)\n.item:has(> a.ext)',
  opts: [num('iter', 'Iterations per selector', 2000)],
  run: ([html, sels], o) => {
    const doc = new DOMParser().parseFromString(html, 'text/html'), iters = Math.max(1, Math.min(100000, Math.floor(o.iter)));
    const rows = [['Selector', 'Matches', 'us / query', 'Cost', 'Why']];
    const out = [];
    for (const sel of lines(sels)) {
      let n;
      try { n = doc.querySelectorAll(sel).length; } catch { throw new Error('Invalid selector: ' + sel); }
      const t0 = performance.now(); for (let i = 0; i < iters; i++) doc.querySelectorAll(sel); const us = ((performance.now() - t0) / iters) * 1000;
      const key = (sel.trim().split(/\s*[>+~]\s*|\s+/).pop() || '').replace(/\[[^\]]*\]/g, '[]').replace(/:{1,2}[\w-]+\([^)]*\)/g, ''), why = []; let score = 0;
      if (/^\*/.test(key) || sel.trim() === '*') { score += 3; why.push('universal key selector'); }
      else if (/#[\w-]/.test(key)) { why.push('ID key selector'); } else if (/\.[\w-]/.test(key)) { score += 1; why.push('class key selector'); } else if (/^[a-z][\w-]*/i.test(key)) { score += 2; why.push('tag key selector (matches many elements)'); } else { score += 2; why.push('attribute/pseudo-only key selector (tests every element)'); }
      const desc = (sel.match(/\s+(?![>+~])/g) || []).length; if (desc > 2) { score += 1; why.push(desc + ' descendant combinators'); }
      if (/\[[^\]]*[*^$|~]=/.test(sel)) { score += 2; why.push('attribute substring match'); }
      if (/:has\(/.test(sel)) { score += 3; why.push(':has() relational selector'); }
      if (/:(not|is|where|nth-[\w-]+|last-child|only-child)/.test(sel)) { score += 1; why.push('structural / functional pseudo-class'); }
      if (/::?(before|after)/.test(sel)) why.push('pseudo-element');
      out.push([sel, n, us, score >= 5 ? 'expensive' : score >= 3 ? 'medium' : 'cheap', why.join('; ') || '-']);
    }
    if (!out.length) throw new Error('Enter at least one selector');
    out.sort((a, b) => b[2] - a[2]);
    return tbl([rows[0], ...out.map((r) => [r[0], r[1], r[2].toFixed(2), r[3], r[4]])]) + `\n\nBrowsers match selectors right to left, so the rightmost compound (key selector) decides how many elements must be tested. Timings use querySelectorAll over ${doc.querySelectorAll('*').length} elements, ${iters} iterations.`;
  },
});

// ---- git conflict marker cleaner
T.push({
  id: 'git-conflict-marker-cleaner', cat: 'Text', title: 'Git Conflict Marker Cleaner', desc: 'Resolve every <<<<<<< / ======= / >>>>>>> block in pasted text by keeping ours, theirs, both, or the diff3 base, or just list the conflicts. Understands diff3 (|||||||) style.',
  labels: ['Text with conflict markers'], sample: 'function greet() {\n<<<<<<< HEAD\n  return "Hello, " + name;\n||||||| merged common ancestors\n  return "Hi " + name;\n=======\n  return `Hello, ${name}!`;\n>>>>>>> feature/template-strings\n}\n\nconst a = 1;\n<<<<<<< HEAD\nconst b = 2;\n=======\nconst b = 3;\n>>>>>>> feature/template-strings\n',
  opts: [sel('take', 'Keep', 'ours (HEAD)', ['ours (HEAD)', 'theirs (incoming)', 'both (ours then theirs)', 'both (theirs then ours)', 'base (diff3 only)', 'report only'])],
  run: ([s], o) => {
    const ls = s.split('\n'), out = [], rep = []; let st = 0, ours = [], base = [], theirs = [], n = 0, start = 0;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      if (st === 0 && /^<{7}(\s|$)/.test(l)) { st = 1; ours = []; base = []; theirs = []; start = i + 1; n++; continue; }
      if (st === 1 && /^\|{7}(\s|$)/.test(l)) { st = 3; continue; }
      if ((st === 1 || st === 3) && /^={7}$/.test(l.trimEnd())) { st = 2; continue; }
      if (st === 2 && /^>{7}(\s|$)/.test(l)) {
        st = 0; rep.push(`Conflict ${n} at line ${start}: ours ${ours.length} line(s), theirs ${theirs.length} line(s)${base.length ? `, base ${base.length}` : ''}  [incoming: ${l.slice(8).trim() || '?'}]`);
        if (o.take.startsWith('ours')) out.push(...ours); else if (o.take.startsWith('theirs')) out.push(...theirs);
        else if (o.take === 'both (ours then theirs)') out.push(...ours, ...theirs); else if (o.take === 'both (theirs then ours)') out.push(...theirs, ...ours);
        else if (o.take.startsWith('base')) { if (!base.length && theirs.length + ours.length) rep.push('  (no diff3 base section: nothing kept for this block)'); out.push(...base); }
        else { out.push('<<<<<<<', ...ours, '=======', ...theirs, '>>>>>>>'); }
        continue;
      }
      if (st === 1) ours.push(l); else if (st === 3) base.push(l); else if (st === 2) theirs.push(l); else out.push(l);
    }
    if (st !== 0) throw new Error(`Unterminated conflict block starting at line ${start}`);
    if (!n) return 'No conflict markers found.\n\n' + s;
    return o.take === 'report only' ? rep.join('\n') : out.join('\n') + `\n\n---\n${n} conflict(s) resolved with: ${o.take}\n${rep.join('\n')}`;
  },
});

// ---- package.json / lockfile license checker
const LIC_GROUP = (id) => {
  const u = id.toUpperCase().replace(/\+$/, '');
  if (/^(AGPL|GPL|SSPL|OSL|EUPL|CC-BY-SA|CC-BY-NC)/.test(u)) return 'strong copyleft';
  if (/^(LGPL|MPL|EPL|CDDL|CPL|MS-RL)/.test(u)) return 'weak copyleft';
  if (/^(MIT|ISC|BSD|APACHE|0BSD|UNLICENSE|CC0|ZLIB|BLUEOAK|PYTHON|CC-BY-[0-9]|WTFPL|X11|ARTISTIC|BSL-1\.0|UPL|POSTGRESQL|MIT-0)/.test(u)) return 'permissive';
  if (/^(UNLICENSED|SEE LICENSE|PROPRIETARY|COMMERCIAL)/.test(u)) return 'proprietary';
  return 'unknown';
};
const RANK = { permissive: 0, 'weak copyleft': 1, 'strong copyleft': 2, proprietary: 3, unknown: 4 };
const licExpr = (expr) => {
  expr = expr.replace(/[()]/g, ' ').trim();
  const alts = expr.split(/\s+OR\s+/i).map((alt) => alt.split(/\s+AND\s+/i).map((x) => x.trim().replace(/\s+WITH\s+.*/i, '')).filter(Boolean));
  let best = null;
  for (const al of alts) { const g = al.map(LIC_GROUP).sort((a, b) => RANK[b] - RANK[a])[0] || 'unknown'; if (!best || RANK[g] < RANK[best]) best = g; }
  return best || 'unknown';
};
T.push({
  id: 'package-json-license-checker', cat: 'Dev Config+', title: 'package.json / Lockfile License Checker', desc: 'Group dependency licenses from a package-lock.json (v2/v3 records a license per package) and flag copyleft, proprietary or unknown ones against a policy. A plain package.json has no per-dependency license data, so only its own license and dependency list are shown.',
  labels: ['package-lock.json (preferred) or package.json'],
  sample: '{"name":"demo","version":"1.0.0","license":"MIT","lockfileVersion":3,"packages":{"":{"name":"demo","version":"1.0.0"},"node_modules/left-pad":{"version":"1.3.0","license":"WTFPL"},"node_modules/express":{"version":"4.19.2","license":"MIT"},"node_modules/chalk":{"version":"5.3.0","license":"MIT"},"node_modules/some-gpl-lib":{"version":"2.0.0","license":"GPL-3.0-only"},"node_modules/dual":{"version":"1.0.0","license":"(MIT OR GPL-2.0)"},"node_modules/mystery":{"version":"0.1.0"},"node_modules/libx":{"version":"3.1.0","license":"LGPL-2.1"}}}',
  opts: [sel('policy', 'Allowed', 'permissive only', ['permissive only', 'permissive + weak copyleft', 'anything except proprietary/unknown'])],
  run: ([s], o) => {
    const j = parseJ(s), rows = [];
    if (isObj(j.packages)) {
      for (const [p, v] of Object.entries(j.packages)) { if (!p) continue; const name = v.name || p.replace(/^.*node_modules\//, ''); let lic = v.license; if (isObj(lic)) lic = lic.type; if (Array.isArray(v.licenses)) lic = v.licenses.map((x) => x.type || x).join(' OR '); rows.push([name, v.version || '?', lic ? String(lic) : null, !!v.dev]); }
    } else if (isObj(j.dependencies) && Object.values(j.dependencies).some((d) => isObj(d) && d.version)) {
      throw new Error('lockfileVersion 1 does not record licenses. Use a v2/v3 package-lock.json (npm 7+), or run "npx license-checker" locally.');
    } else {
      const own = isObj(j.license) ? j.license.type : j.license;
      const deps = { ...j.dependencies, ...j.devDependencies, ...j.peerDependencies, ...j.optionalDependencies };
      return `Package: ${j.name || '(unnamed)'}  license: ${own || 'NOT SET'} (${own ? LIC_GROUP(String(own)) : 'missing license field'})\n\n${Object.keys(deps).length} declared dependencies:\n${Object.entries(deps).map(([n, v]) => `  ${n}@${v}`).join('\n')}\n\nA package.json does not contain the licenses of its dependencies. Paste package-lock.json (v2/v3) for a full report.`;
    }
    if (!rows.length) throw new Error('No packages found in the lockfile');
    const allowed = { 'permissive only': ['permissive'], 'permissive + weak copyleft': ['permissive', 'weak copyleft'], 'anything except proprietary/unknown': ['permissive', 'weak copyleft', 'strong copyleft'] }[o.policy];
    const byLic = {}, bad = [], groups = {};
    for (const [n, v, lic] of rows) { const k = lic || '(none declared)', g = lic ? licExpr(lic) : 'unknown'; byLic[k] = (byLic[k] || 0) + 1; groups[g] = (groups[g] || 0) + 1; if (!allowed.includes(g)) bad.push(`${n}@${v}  ${k}  [${g}]`); }
    const L = [`${rows.length} packages in ${j.name || 'lockfile'}${j.license ? ' (project license: ' + (isObj(j.license) ? j.license.type : j.license) + ')' : ''}`, '', 'By license:', ...Object.entries(byLic).sort((a, b) => b[1] - a[1]).map(([k, c]) => `  ${String(c).padStart(4)}  ${k}  [${k === '(none declared)' ? 'unknown' : licExpr(k)}]`), '', 'By category: ' + Object.entries(groups).map(([k, c]) => `${k} ${c}`).join(', '), '', `Policy "${o.policy}": ${bad.length ? bad.length + ' package(s) need review' : 'all packages pass'}`, ...bad.map((x) => '  ! ' + x)];
    L.push('', 'For OR expressions the most permissive alternative is assumed to be chosen; for AND the most restrictive applies. This is a screening aid, not legal advice.');
    return L.join('\n');
  },
});

// ---- API rate limit / cost
T.push({
  id: 'api-rate-limit-cost-calculator', cat: 'Network & HTTP', title: 'API Rate Limit & Cost Calculator', desc: 'Given a rate limit and price plan, calculate how long a bulk job takes, how many API keys you need to hit a deadline, the monthly ceiling and the cost including plan fee, included quota and overage.',
  inputs: 0, sample: '',
  opts: [num('limit', 'Rate limit (requests per window)', 60), sel('win', 'Window', 'minute', ['second', 'minute', 'hour', 'day']), num('items', 'Items to process', 250000), num('batch', 'Items per request (batch size)', 1), num('keys', 'API keys / accounts in parallel', 1), num('retry', '429 retry overhead (%)', 5), num('hours', 'Deadline (hours, 0 = none)', 0), num('fee', 'Plan fee per month ($)', 49), num('incl', 'Included requests per month', 100000), num('over', 'Overage price per 1000 requests ($)', 0.5), num('lat', 'Request latency (ms)', 300)],
  run: (_i, o) => {
    for (const k of ['limit', 'items', 'batch', 'keys']) if (!(o[k] > 0)) throw new Error('Limit, items, batch size and keys must be positive');
    const W = { second: 1, minute: 60, hour: 3600, day: 86400 }[o.win], keys = Math.floor(o.keys);
    const reqs = Math.ceil(o.items / o.batch), withRetry = Math.ceil(reqs * (1 + Math.max(0, o.retry) / 100)), rps = (o.limit / W) * keys;
    const secs = withRetry / rps, latBound = (withRetry * o.lat) / 1000 / Math.max(1, keys);
    const total = Math.max(secs, latBound);
    const over = Math.max(0, withRetry - o.incl), cost = o.fee + (over / 1000) * o.over;
    const L = [`Requests needed: ${reqs.toLocaleString('en-US')} (${o.items.toLocaleString('en-US')} items / batch ${o.batch}) + ${o.retry}% retries = ${withRetry.toLocaleString('en-US')}`, `Throughput cap: ${(o.limit / W).toFixed(3)} req/s per key x ${keys} key(s) = ${rps.toFixed(3)} req/s  (${Math.floor(rps * 3600).toLocaleString('en-US')}/hour, ${Math.floor(rps * 86400).toLocaleString('en-US')}/day)`, `Time to finish: ${human(total)}${latBound > secs ? ' (limited by latency/concurrency, not the rate limit)' : ''}`, `Monthly ceiling at full speed: ${Math.floor(rps * 86400 * 30).toLocaleString('en-US')} requests`, '', `Cost for this job: $${cost.toFixed(2)} (plan $${o.fee}${over ? ` + ${over.toLocaleString('en-US')} overage requests x $${o.over}/1000 = $${((over / 1000) * o.over).toFixed(2)}` : ', within the included quota'})`, `Cost per 1000 items: $${((cost / o.items) * 1000).toFixed(4)}`];
    if (o.hours > 0) { const need = Math.ceil(withRetry / (o.limit / W) / (o.hours * 3600)); L.push('', `To finish within ${o.hours} h you need ${need} key(s) at this limit${need > keys ? ` (you have ${keys})` : ' (you already have enough)'}.`); if (o.batch === 1) L.push(`Or batch items: with batch size 10 you would need ${Math.ceil(Math.ceil(o.items / 10) * (1 + o.retry / 100) / (o.limit / W) / (o.hours * 3600))} key(s), if the API supports batching.`); }
    L.push('', 'Tips: respect Retry-After on 429s, add jitter to backoff, and prefer batching/bulk endpoints. Multiple keys may violate the provider\'s terms: check before pooling accounts.');
    return L.join('\n');
  },
});

// blake3-hash and solidity-storage-slot live in crypto2.js (verified against independent implementations); drop the duplicates.
export default T.filter((t) => !['blake3-hash-generator', 'ethereum-abi-storage-slot-calculator'].includes(t.id));

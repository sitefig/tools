// Diagrams, SQL & Data, Images - Extra.
// All hand-written, zero dependencies; every tool except heic-to-jpg runs under Node 22 (no DOM needed:
// text is measured with a character-width estimate, so label boxes can be a few px off in a real browser).
// Tools: mermaid-lite-renderer, graphviz-dot-lite, sql-on-csv, sql-ddl-to-diagram, heic-to-jpg.
// Ceilings: layered layout = longest-path ranking + barycenter ordering + PAV coordinate assignment (no network
// simplex, no edge-label collision avoidance beyond a reserved label slot); self loops reserve no space.
// SQL engine = in-memory nested-loop evaluator (fine for thousands of rows, not millions); no eval/Function.

// ---------- shared SVG helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f = (n) => { const r = Math.round(n * 10) / 10; return String(Object.is(r, -0) ? 0 : r); };
const FS = 14;
function tw(s, fs = FS) {
  let w = 0;
  for (const ch of String(s)) w += /[iljtf.,:;|!'()\[\] ]/.test(ch) ? 0.3 : /[mwMW@%]/.test(ch) ? 0.9 : /[A-Z0-9]/.test(ch) ? 0.64 : ch.charCodeAt(0) > 0x2e80 ? 1 : 0.55;
  return w * fs;
}
const splitLines = (s) => String(s).split(/<br\s*\/?>|\\n|\n/i);
const twMax = (s, fs) => Math.max(0, ...splitLines(s).map((l) => tw(l, fs)));
function txt(x, y, s, o = {}) {
  const fs = o.fs || FS;
  return `<text x="${f(x)}" y="${f(y + fs * 0.35)}" text-anchor="${o.anchor || 'middle'}"${o.fs ? ` font-size="${fs}"` : ''}${o.fill ? ` fill="${esc(o.fill)}"` : ''}${o.bold ? ' font-weight="bold"' : ''}${o.italic ? ' font-style="italic"' : ''}>${esc(s)}</text>`;
}
function mtxt(x, y, s, o = {}) {
  const L = splitLines(s), lh = (o.fs || FS) * 1.25;
  return L.map((l, i) => txt(x, y + (i - (L.length - 1) / 2) * lh, l, o)).join('');
}
function svgDoc(w, h, body, defs = '') {
  w = Math.ceil(w); h = Math.ceil(h);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Helvetica, Arial, sans-serif" font-size="14"><rect width="100%" height="100%" fill="#fff"/>${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
}
function svgResult(svg, name = 'diagram') {
  return { html: `<!doctype html><meta charset="utf-8"><body style="margin:8px;background:#fff"><div style="overflow:auto">${svg}</div></body>`, text: svg, blob: new Blob([svg], { type: 'image/svg+xml' }), filename: name + '.svg' };
}
const PALETTE = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];

// ---------- layered layout engine ----------
// layout({nodes:[{id,w,h}], edges:[{id,from,to,lw?,lh?}], dir:'TB'|'BT'|'LR'|'RL'}) ->
//   {pos:{id:{x,y}} (centres), edges:{id:{pts,label,t0,t1,rev,self}}, W, H}. Every edge spans >= 2 layers so each
//   gets a dummy node per intermediate layer; the label (if any) lives in the middle dummy.
function layout(g) {
  const dir = g.dir || 'TB', horiz = dir === 'LR' || dir === 'RL';
  const NS = g.nodesep ?? 36, RS = g.ranksep ?? 56;
  const N = [], idx = new Map();
  for (const n of g.nodes) { idx.set(n.id, N.length); N.push({ id: n.id, cs: horiz ? n.h : n.w, ls: horiz ? n.w : n.h, real: true }); }
  const E = [], selfs = [];
  for (const e of g.edges) {
    const a = idx.get(e.from), b = idx.get(e.to);
    if (a == null || b == null) continue;
    (a === b ? selfs : E).push({ e, a, b });
  }
  const adj = N.map(() => []);
  E.forEach((x, k) => adj[x.a].push(k));
  const st = new Array(N.length).fill(0);
  const dfs = (u) => { st[u] = 1; for (const k of adj[u]) { const x = E[k]; if (st[x.b] === 1) x.rev = true; else if (st[x.b] === 0) dfs(x.b); } st[u] = 2; };
  N.forEach((_, i) => { if (!st[i]) dfs(i); });
  const W = E.map((x) => (x.rev ? { s: x.b, t: x.a, x } : { s: x.a, t: x.b, x }));
  // longest-path ranking with minlen 2
  const rank = new Array(N.length).fill(0), indeg = new Array(N.length).fill(0), out = N.map(() => []);
  for (const w of W) { indeg[w.t]++; out[w.s].push(w.t); }
  const topo = [], q = [];
  indeg.forEach((d, i) => { if (!d) q.push(i); });
  const deg = indeg.slice();
  while (q.length) { const u = q.shift(); topo.push(u); for (const v of out[u]) { rank[v] = Math.max(rank[v], rank[u] + 2); if (!--deg[v]) q.push(v); } }
  for (let i = topo.length - 1; i >= 0; i--) { const u = topo[i]; if (!indeg[u] && out[u].length) rank[u] = Math.min(...out[u].map((v) => rank[v])) - 2; }
  // dummy chains
  const up = N.map(() => []), down = N.map(() => []);
  const link = (a, b) => { down[a].push(b); up[b].push(a); };
  for (const w of W) {
    const e = w.x.e, span = rank[w.t] - rank[w.s];
    let prev = w.s;
    const chain = [], mid = Math.floor(span / 2);
    for (let r = 1; r < span; r++) {
      const lab = r === mid && e.lw > 0;
      N.push({ id: null, cs: lab ? (horiz ? e.lh : e.lw) : 2, ls: lab ? (horiz ? e.lw : e.lh) : 0, real: false, lab });
      const d = N.length - 1; rank.push(rank[w.s] + r); up.push([]); down.push([]);
      link(prev, d); chain.push(d); prev = d;
    }
    link(prev, w.t); w.chain = chain; w.mid = chain.find((d) => N[d].lab);
  }
  const nl = Math.max(0, ...rank) + 1;
  const L = Array.from({ length: nl }, () => []);
  N.forEach((n, i) => { if (g.nodes.length) L[rank[i]].push(i); });
  const posIn = new Array(N.length);
  const setPos = () => L.forEach((l) => l.forEach((n, i) => { posIn[n] = i; }));
  setPos();
  const crossings = () => {
    let c = 0;
    for (let r = 0; r < L.length - 1; r++) {
      const es = [];
      for (const u of L[r]) for (const v of down[u]) es.push([posIn[u], posIn[v]]);
      for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) if ((es[i][0] - es[j][0]) * (es[i][1] - es[j][1]) < 0) c++;
    }
    return c;
  };
  const sweep = (dn) => {
    for (let k = 1; k < L.length; k++) {
      const r = dn ? k : L.length - 1 - k, nb = dn ? up : down, bc = new Map();
      L[r].forEach((n, i) => { const a = nb[n]; bc.set(n, a.length ? a.reduce((s, m) => s + posIn[m], 0) / a.length : i); });
      L[r].sort((a, b) => bc.get(a) - bc.get(b));
      L[r].forEach((n, i) => { posIn[n] = i; });
    }
  };
  let best = L.map((l) => l.slice()), bestC = crossings();
  const iters = N.length > 500 ? 2 : 14;
  for (let it = 0; it < iters && bestC > 0; it++) {
    sweep(it % 2 === 0);
    const c = crossings();
    if (c < bestC) { bestC = c; best = L.map((l) => l.slice()); }
  }
  best.forEach((l, i) => { L[i] = l; });
  setPos();
  // cross-axis coordinates
  const cpos = new Array(N.length).fill(0);
  const sep = (a, b) => (N[a].cs + N[b].cs) / 2 + (N[a].real && N[b].real ? NS : 12);
  const widths = L.map((l) => l.reduce((s, n, i) => s + N[n].cs + (i ? sep(l[i - 1], n) - (N[l[i - 1]].cs + N[n].cs) / 2 : 0), 0));
  const maxW = Math.max(0, ...widths);
  L.forEach((l, r) => { let x = (maxW - widths[r]) / 2; l.forEach((n, i) => { if (i) x += sep(l[i - 1], n) - (N[l[i - 1]].cs + N[n].cs) / 2; cpos[n] = x + N[n].cs / 2; x += N[n].cs; }); });
  const place = (r, nb) => {
    const l = L[r]; if (!l.length) return;
    const off = [0], d = l.map((n) => (nb[n].length ? nb[n].reduce((s, m) => s + cpos[m], 0) / nb[n].length : cpos[n]));
    for (let i = 1; i < l.length; i++) off.push(off[i - 1] + sep(l[i - 1], l[i]));
    const blocks = [];
    d.forEach((v, i) => {
      blocks.push({ sum: v - off[i], n: 1, from: i });
      while (blocks.length > 1) {
        const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
        if (a.sum / a.n <= b.sum / b.n) break;
        a.sum += b.sum; a.n += b.n; blocks.pop();
      }
    });
    for (const b of blocks) for (let i = b.from; i < b.from + b.n; i++) cpos[l[i]] = b.sum / b.n + off[i];
  };
  for (let it = 0; it < 4; it++) {
    for (let r = 1; r < L.length; r++) place(r, up);
    for (let r = L.length - 2; r >= 0; r--) place(r, down);
  }
  let cmin = Infinity, cmax = -Infinity;
  N.forEach((n, i) => { cmin = Math.min(cmin, cpos[i] - n.cs / 2); cmax = Math.max(cmax, cpos[i] + n.cs / 2); });
  if (!N.length) { cmin = 0; cmax = 0; }
  // layer-axis coordinates
  const th = L.map((l) => Math.max(0, ...l.map((n) => N[n].ls)));
  const lpos = [];
  th.forEach((t, r) => { lpos[r] = r ? lpos[r - 1] + th[r - 1] / 2 + RS / 2 + t / 2 : t / 2; });
  const lenL = nl && g.nodes.length ? lpos[nl - 1] + th[nl - 1] / 2 : 0, lenC = cmax - cmin;
  const WW = horiz ? lenL : lenC, HH = horiz ? lenC : lenL;
  const map = (c, l) => { c -= cmin; return dir === 'TB' ? { x: c, y: l } : dir === 'BT' ? { x: c, y: HH - l } : dir === 'LR' ? { x: l, y: c } : { x: WW - l, y: c }; };
  const dv = { TB: { x: 0, y: 1 }, BT: { x: 0, y: -1 }, LR: { x: 1, y: 0 }, RL: { x: -1, y: 0 } }[dir], neg = { x: -dv.x, y: -dv.y };
  const pos = {};
  g.nodes.forEach((n, i) => { pos[n.id] = map(cpos[i], lpos[rank[i]]); });
  const edges = {};
  for (const w of W) {
    const s = w.s, t = w.t;
    const pts = [map(cpos[s], lpos[rank[s]] + N[s].ls / 2)];
    for (const d of w.chain) pts.push(map(cpos[d], lpos[rank[d]]));
    pts.push(map(cpos[t], lpos[rank[t]] - N[t].ls / 2));
    const lab = w.mid != null ? map(cpos[w.mid], lpos[rank[w.mid]]) : null;
    const rev = !!w.x.rev;
    if (rev) pts.reverse();
    edges[w.x.e.id] = { pts, label: lab, t0: rev ? neg : dv, t1: rev ? dv : neg, rev };
  }
  for (const x of selfs) edges[x.e.id] = { self: true, label: null };
  return { pos, edges, W: WW, H: HH };
}

// ---------- graph model + SVG renderer (flowchart, state, class, ER, DOT, DDL all build this) ----------
const newModel = (dir = 'TB') => ({ dir, nodes: new Map(), edges: [], groups: new Map() });
const addNode = (M, id, p = {}) => { let n = M.nodes.get(id); if (!n) { n = { id, label: id, shape: 'rect', group: '' }; M.nodes.set(id, n); } Object.assign(n, p); return n; };
const unq = (s) => { s = String(s).trim(); const m = s.match(/^"([\s\S]*)"$/) || s.match(/^'([\s\S]*)'$/) || s.match(/^`([\s\S]*)`$/); return m ? m[1] : s; };
const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

function sizeNode(n) {
  if (n.w) return;
  const L = splitLines(n.label), th = L.length * 17.5, tw0 = twMax(n.label);
  const s = n.shape;
  if (s === 'start') { n.w = n.h = 16; return; }
  if (s === 'end') { n.w = n.h = 24; return; }
  if (s === 'choice') { n.w = n.h = 30; return; }
  if (s === 'fork') { n.w = 80; n.h = 8; return; }
  let w = tw0 + 30, h = th + 20;
  if (s === 'circle') w = h = Math.hypot(tw0 + 8, th) + 10;
  else if (s === 'diamond') { w = (tw0 + 16) * 1.8; h = (th + 10) * 1.8; }
  else if (s === 'ellipse') { w *= 1.3; h *= 1.2; }
  else if (s === 'hexagon') w += 30;
  else if (s === 'stadium') w += h / 2;
  else if (s === 'subroutine') w += 16;
  else if (s === 'cylinder') h += 18;
  else if (s === 'parallelogram') w += 26;
  n.w = Math.max(w, 40); n.h = Math.max(h, 36);
}
const stNum = (st, k, d) => (st && st[k] != null ? num(st[k], d) : d);
function drawNode(n) {
  const { x, y, w, h } = n, st = n.style || {};
  const fill = st.fill || '#ececff', stroke = st.stroke || '#9370db', sw = stNum(st, 'stroke-width', 1.5);
  const attr = `fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${sw}"${st['stroke-dasharray'] ? ` stroke-dasharray="${esc(st['stroke-dasharray'])}"` : ''}`;
  const x0 = x - w / 2, y0 = y - h / 2, s = n.shape;
  let sh;
  if (n.body) return n.body(n);
  if (s === 'start') return `<circle cx="${f(x)}" cy="${f(y)}" r="8" fill="#333"/>`;
  if (s === 'end') return `<circle cx="${f(x)}" cy="${f(y)}" r="11" fill="#fff" stroke="#333" stroke-width="1.5"/><circle cx="${f(x)}" cy="${f(y)}" r="6.5" fill="#333"/>`;
  if (s === 'choice') sh = `<polygon points="${f(x)},${f(y0)} ${f(x + w / 2)},${f(y)} ${f(x)},${f(y + h / 2)} ${f(x0)},${f(y)}" ${attr}/>`;
  else if (s === 'fork') return `<rect x="${f(x0)}" y="${f(y0)}" width="${w}" height="${h}" fill="#333"/>`;
  else if (s === 'circle') sh = `<circle cx="${f(x)}" cy="${f(y)}" r="${f(w / 2)}" ${attr}/>`;
  else if (s === 'ellipse') sh = `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(w / 2)}" ry="${f(h / 2)}" ${attr}/>`;
  else if (s === 'diamond') sh = `<polygon points="${f(x)},${f(y0)} ${f(x + w / 2)},${f(y)} ${f(x)},${f(y + h / 2)} ${f(x0)},${f(y)}" ${attr}/>`;
  else if (s === 'hexagon') { const k = 15; sh = `<polygon points="${f(x0 + k)},${f(y0)} ${f(x0 + w - k)},${f(y0)} ${f(x0 + w)},${f(y)} ${f(x0 + w - k)},${f(y0 + h)} ${f(x0 + k)},${f(y0 + h)} ${f(x0)},${f(y)}" ${attr}/>`; }
  else if (s === 'parallelogram') { const k = 13; sh = `<polygon points="${f(x0 + k)},${f(y0)} ${f(x0 + w)},${f(y0)} ${f(x0 + w - k)},${f(y0 + h)} ${f(x0)},${f(y0 + h)}" ${attr}/>`; }
  else if (s === 'cylinder') {
    const ry = 8;
    sh = `<path d="M${f(x0)},${f(y0 + ry)} A${f(w / 2)},${ry} 0 0 1 ${f(x0 + w)},${f(y0 + ry)} V${f(y0 + h - ry)} A${f(w / 2)},${ry} 0 0 1 ${f(x0)},${f(y0 + h - ry)} Z" ${attr}/><path d="M${f(x0)},${f(y0 + ry)} A${f(w / 2)},${ry} 0 0 0 ${f(x0 + w)},${f(y0 + ry)}" fill="none" stroke="${esc(stroke)}" stroke-width="${sw}"/>`;
  } else if (s === 'stadium' || s === 'round') sh = `<rect x="${f(x0)}" y="${f(y0)}" width="${f(w)}" height="${f(h)}" rx="${s === 'stadium' ? f(h / 2) : 10}" ${attr}/>`;
  else if (s === 'none') sh = '';
  else {
    sh = `<rect x="${f(x0)}" y="${f(y0)}" width="${f(w)}" height="${f(h)}" rx="${s === 'rect' ? 3 : 0}" ${attr}/>`;
    if (s === 'subroutine') sh += `<line x1="${f(x0 + 8)}" y1="${f(y0)}" x2="${f(x0 + 8)}" y2="${f(y0 + h)}" stroke="${esc(stroke)}"/><line x1="${f(x0 + w - 8)}" y1="${f(y0)}" x2="${f(x0 + w - 8)}" y2="${f(y0 + h)}" stroke="${esc(stroke)}"/>`;
  }
  return sh + mtxt(x, y, n.label, { fill: st.color });
}
const DECO_LEN = { tri: 14, dia: 18, odia: 18, circle: 8 };
function deco(type, P, d, col) {
  const p = { x: -d.y, y: d.x }, at = (a, b) => `${f(P.x + d.x * a + p.x * b)},${f(P.y + d.y * a + p.y * b)}`;
  const ln = (a1, b1, a2, b2) => `<line x1="${at(a1, b1).replace(',', '" y1="')}" x2="${at(a2, b2).replace(',', '" y2="')}" stroke="${col}" stroke-width="1.5"/>`;
  const circ = (a) => { const c = at(a, 0).split(','); return `<circle cx="${c[0]}" cy="${c[1]}" r="5" fill="#fff" stroke="${col}" stroke-width="1.5"/>`; };
  switch (type) {
    case 'arrow': return `<polygon points="${at(0, 0)} ${at(11, 4.5)} ${at(11, -4.5)}" fill="${col}" stroke="${col}"/>`;
    case 'tri': return `<polygon points="${at(0, 0)} ${at(14, 7)} ${at(14, -7)}" fill="#fff" stroke="${col}" stroke-width="1.5"/>`;
    case 'dia': return `<polygon points="${at(0, 0)} ${at(9, 5.5)} ${at(18, 0)} ${at(9, -5.5)}" fill="${col}" stroke="${col}"/>`;
    case 'odia': return `<polygon points="${at(0, 0)} ${at(9, 5.5)} ${at(18, 0)} ${at(9, -5.5)}" fill="#fff" stroke="${col}" stroke-width="1.5"/>`;
    case 'circle': return `<circle cx="${at(4, 0).split(',')[0]}" cy="${at(4, 0).split(',')[1]}" r="4" fill="#fff" stroke="${col}" stroke-width="1.5"/>`;
    case 'x': return ln(3, 4, 11, -4) + ln(3, -4, 11, 4);
    case 'one': return ln(8, -7, 8, 7) + ln(13, -7, 13, 7);
    case 'zeroone': return ln(8, -7, 8, 7) + circ(17);
    case 'many': return ln(14, 0, 0, 7) + ln(14, 0, 0, -7) + ln(14, 0, 0, 0);
    case 'onemany': return ln(14, 0, 0, 7) + ln(14, 0, 0, -7) + ln(18, -7, 18, 7);
    case 'zeromany': return ln(14, 0, 0, 7) + ln(14, 0, 0, -7) + circ(20);
    default: return '';
  }
}
function pathD(pts, curve, horiz) {
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (curve === 'straight' || (a.x === b.x && a.y === b.y)) d += ` L${f(b.x)},${f(b.y)}`;
    else if (horiz) { const m = (a.x + b.x) / 2; d += curve === 'orthogonal' ? ` L${f(m)},${f(a.y)} L${f(m)},${f(b.y)} L${f(b.x)},${f(b.y)}` : ` C${f(m)},${f(a.y)} ${f(m)},${f(b.y)} ${f(b.x)},${f(b.y)}`; }
    else { const m = (a.y + b.y) / 2; d += curve === 'orthogonal' ? ` L${f(a.x)},${f(m)} L${f(b.x)},${f(m)} L${f(b.x)},${f(b.y)}` : ` C${f(a.x)},${f(m)} ${f(b.x)},${f(m)} ${f(b.x)},${f(b.y)}`; }
  }
  return d;
}

function renderModel(M, o = {}) {
  const curve = o.curve || 'curved', horiz = M.dir === 'LR' || M.dir === 'RL';
  const PAD = 16, TITLE = 24, MARGIN = 20;
  for (const n of M.nodes.values()) sizeNode(n);
  const parentOf = (k) => (k.startsWith('g:') ? M.groups.get(k.slice(2)).parent : M.nodes.get(k).group);
  const pathOf = (k) => { const p = [k]; let g = parentOf(k); while (g) { p.unshift('g:' + g); g = M.groups.get(g).parent; } return p; };
  const lv = new Map(), LV = (g) => { if (!lv.has(g)) lv.set(g, { items: [], edges: [] }); return lv.get(g); };
  for (const n of M.nodes.values()) LV(n.group || '').items.push(n.id);
  for (const g of M.groups.values()) LV(g.parent || '').items.push('g:' + g.id);
  M.edges.forEach((e, i) => {
    e.i = i;
    if (e.from === e.to && M.nodes.has(e.from)) { e.res = { self: true }; return; }
    if (!(e.from.startsWith('g:') || M.nodes.has(e.from)) || !(e.to.startsWith('g:') || M.nodes.has(e.to))) { e.skip = true; return; }
    const pu = pathOf(e.from), pv = pathOf(e.to), mx = Math.min(pu.length, pv.length) - 1;
    let k = 0; while (k < mx && pu[k] === pv[k]) k++;
    if (pu[k] === pv[k]) { e.skip = true; return; }
    e.a = pu[k]; e.b = pv[k];
    LV(k > 0 ? pu[k - 1].slice(2) : '').edges.push({ id: i, from: e.a, to: e.b, lw: e.label ? twMax(e.label, 13) + 12 : 0, lh: e.label ? splitLines(e.label).length * 16 + 8 : 0 });
  });
  const lays = new Map();
  const doLevel = (g) => {
    const rec = lv.get(g) || { items: [], edges: [] };
    const nodes = rec.items.map((k) => {
      if (k.startsWith('g:')) {
        const grp = M.groups.get(k.slice(2)), lay = doLevel(grp.id);
        grp.lay = lay; grp.w = Math.max(lay.W + 2 * PAD, tw(grp.title || '', 13) + 28, 90); grp.h = lay.H + 2 * PAD + TITLE;
        return { id: k, w: grp.w, h: grp.h };
      }
      const n = M.nodes.get(k); return { id: k, w: n.w, h: n.h };
    });
    const lay = layout({ nodes, edges: rec.edges, dir: M.dir, nodesep: o.nodesep, ranksep: o.ranksep });
    lays.set(g, lay); return lay;
  };
  const root = doLevel('');
  const placeLevel = (g, ox, oy) => {
    const rec = lv.get(g); if (!rec) return;
    const lay = lays.get(g);
    for (const k of rec.items) {
      const p = lay.pos[k];
      if (k.startsWith('g:')) {
        const grp = M.groups.get(k.slice(2));
        grp.x = ox + p.x - grp.w / 2; grp.y = oy + p.y - grp.h / 2;
        placeLevel(grp.id, grp.x + (grp.w - grp.lay.W) / 2, grp.y + TITLE + PAD);
      } else { const n = M.nodes.get(k); n.x = ox + p.x; n.y = oy + p.y; }
    }
    for (const e of rec.edges) {
      const r = lay.edges[e.id];
      M.edges[e.id].res = r.self ? r : { ...r, pts: r.pts.map((q) => ({ x: q.x + ox, y: q.y + oy })), label: r.label && { x: r.label.x + ox, y: r.label.y + oy } };
    }
  };
  placeLevel('', MARGIN, MARGIN);
  let W = root.W + 2 * MARGIN, H = root.H + 2 * MARGIN, body = '';
  const groups = [...M.groups.values()].filter((g) => g.x != null).sort((a, b) => pathOf('g:' + a.id).length - pathOf('g:' + b.id).length);
  for (const g of groups) {
    const st = g.style || {};
    body += `<rect x="${f(g.x)}" y="${f(g.y)}" width="${f(g.w)}" height="${f(g.h)}" rx="4" fill="${esc(st.fill || '#ffffde')}" stroke="${esc(st.stroke || '#aaaa33')}" stroke-width="1.2"/>${g.title ? txt(g.x + g.w / 2, g.y + 13, g.title, { fs: 13, bold: true, fill: st.color }) : ''}`;
  }
  let lbl = '', eds = '';
  for (const e of M.edges) {
    const r = e.res; if (e.skip || !r || e.hidden) continue;
    const col = esc((e.style && e.style.stroke) || '#444'), sw = stNum(e.style, 'stroke-width', e.kind === 'thick' ? 3 : 1.5);
    const dash = e.kind === 'dotted' ? ' stroke-dasharray="5 4"' : '';
    let d, a0 = e.tail, a1 = e.head;
    if (r.self) {
      const nd = M.nodes.get(e.from); if (!nd) continue;
      const sx = nd.x + nd.w / 2, sy = nd.y;
      d = `M${f(sx)},${f(sy - 8)} C${f(sx + 38)},${f(sy - 30)} ${f(sx + 38)},${f(sy + 30)} ${f(sx)},${f(sy + 8)}`;
      eds += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}"${dash}/>` + (a1 ? deco(a1, { x: sx, y: sy + 8 }, { x: 1, y: 0 }, col) : '');
      if (e.label) lbl += `<rect x="${f(sx + 30)}" y="${f(sy - 9)}" width="${f(twMax(e.label, 13) + 8)}" height="18" fill="#fff"/>${txt(sx + 34, sy, e.label, { fs: 13, anchor: 'start' })}`;
      W = Math.max(W, sx + 50 + twMax(e.label || '', 13)); continue;
    }
    const pts = r.pts.map((p) => ({ ...p }));
    const fix = (k, key, t) => {
      if (key.startsWith('g:') || key === (k === 0 ? e.a : e.b)) return;
      const nd = M.nodes.get(key); if (!nd) return;
      pts[k] = { x: nd.x + t.x * nd.w / 2, y: nd.y + t.y * nd.h / 2 };
    };
    fix(0, e.from, r.t0); fix(pts.length - 1, e.to, r.t1);
    if (e.kind === 'invisible') continue;
    const l0 = DECO_LEN[a0] || 0, l1 = DECO_LEN[a1] || 0, P0 = pts[0], P1 = pts[pts.length - 1];
    pts[0] = { x: P0.x + r.t0.x * l0, y: P0.y + r.t0.y * l0 };
    pts[pts.length - 1] = { x: P1.x + r.t1.x * l1, y: P1.y + r.t1.y * l1 };
    eds += `<path d="${pathD(pts, curve, horiz)}" fill="none" stroke="${col}" stroke-width="${sw}"${dash}/>`;
    if (a0) eds += deco(a0, P0, r.t0, col);
    if (a1) eds += deco(a1, P1, r.t1, col);
    if (e.label && r.label) {
      const lw = twMax(e.label, 13) + 10, lh = splitLines(e.label).length * 16 + 4;
      lbl += `<rect x="${f(r.label.x - lw / 2)}" y="${f(r.label.y - lh / 2)}" width="${f(lw)}" height="${f(lh)}" rx="3" fill="#fff" fill-opacity=".92"/>${mtxt(r.label.x, r.label.y, e.label, { fs: 13 })}`;
    }
    if (e.ends) { for (const [k, v] of e.ends) { const p = k === 0 ? P0 : P1, t = k === 0 ? r.t0 : r.t1; lbl += txt(p.x + t.x * 14 - t.y * 10, p.y + t.y * 14 + t.x * 10, v, { fs: 12 }); } }
  }
  body += eds;
  for (const n of M.nodes.values()) if (n.x != null) body += drawNode(n);
  body += lbl;
  return svgDoc(W, H, body);
}

// ---------- Mermaid: flowchart ----------
const OPEN = [['(((', ')))', 'circle'], ['([', '])', 'stadium'], ['[[', ']]', 'subroutine'], ['[(', ')]', 'cylinder'], ['((', '))', 'circle'], ['{{', '}}', 'hexagon'],
  ['[/', '/]', 'parallelogram'], ['[\\', '\\]', 'parallelogram'], ['[/', '\\]', 'parallelogram'], ['[\\', '/]', 'parallelogram'], ['>', ']', 'rect'], ['[', ']', 'rect'], ['(', ')', 'round'], ['{', '}', 'diamond']];
function parseShape(s, i) {
  const ent = OPEN.filter(([o]) => s.startsWith(o, i));
  if (!ent.length) return null;
  const o = ent[0][0], grp = ent.filter((e) => e[0] === o);
  let j = i + o.length, label;
  const ws = () => { while (j < s.length && /\s/.test(s[j])) j++; };
  ws();
  if (s[j] === '"') {
    const k = s.indexOf('"', j + 1);
    if (k < 0) throw new Error('Unclosed quote in: ' + s);
    label = s.slice(j + 1, k); j = k + 1; ws();
    const hit = grp.find((e) => s.startsWith(e[1], j));
    if (!hit) throw new Error(`Expected "${grp[0][1]}" after label in: ${s}`);
    return { label: label.replace(/^`|`$/g, ''), shape: hit[2], end: j + hit[1].length };
  }
  let bestI = -1, hit;
  for (const e of grp) { const k = s.indexOf(e[1], j); if (k >= 0 && (bestI < 0 || k < bestI)) { bestI = k; hit = e; } }
  if (bestI < 0) throw new Error(`Unclosed "${o}" in: ${s}`);
  return { label: s.slice(j, bestI).trim(), shape: hit[2], end: bestI + hit[1].length };
}
function parseStyle(str) {
  const o = {};
  for (const part of String(str).split(',')) { const k = part.indexOf(':'); if (k > 0) o[part.slice(0, k).trim()] = part.slice(k + 1).trim().replace(/;$/, ''); }
  return o;
}
function splitStmts(line) {
  const out = []; let cur = '', q = null;
  for (const ch of line) {
    if (q) { if (ch === q) q = null; cur += ch; } else if (ch === '"') { q = ch; cur += ch; } else if (ch === ';') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}
const DIRS = { TD: 'TB', TB: 'TB', BT: 'BT', LR: 'LR', RL: 'RL' };
function mmFlow(lines, head) {
  const M = newModel(DIRS[(head.match(/\b(TD|TB|BT|LR|RL)\b/i) || [])[1]?.toUpperCase()] || 'TB');
  const gids = new Set(), classDefs = {}, stack = [], applied = [];
  for (const l of lines) { const m = l.trim().match(/^subgraph\s+(.*)$/i); if (m) gids.add(subId(m[1]).id); }
  function subId(rest) {
    rest = rest.trim();
    const m = rest.match(/^([\w. -￿-]+)\s*\[(.*)\]\s*$/);
    if (m) return { id: m[1], title: unq(m[2]) };
    const t = unq(rest); return { id: t.replace(/\s+/g, '_'), title: t };
  }
  const cur = () => stack[stack.length - 1] || '';
  const mk = (id, sh, cls) => {
    if (gids.has(id)) return 'g:' + id;
    let n = M.nodes.get(id);
    if (!n) n = addNode(M, id, { group: cur() }); else if (!n.group && cur()) n.group = cur();
    if (sh) { n.label = sh.label || id; n.shape = sh.shape; }
    if (cls) (n.cls ||= []).push(cls);
    return id;
  };
  const chain = (s) => {
    let i = 0;
    const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const group = () => {
      const keys = [];
      for (;;) {
        ws();
        const m = /^[\w -￿]+/.exec(s.slice(i));
        if (!m) throw new Error(`Cannot parse flowchart statement: "${s}" (near "${s.slice(i, i + 14)}")`);
        const id = m[0]; i += id.length;
        let sh = null, cls = null;
        sh = parseShape(s, i);
        if (sh) i = sh.end;
        if (s.startsWith(':::', i)) { const c = /^:::([\w-]+)/.exec(s.slice(i)); cls = c[1]; i += c[0].length; }
        keys.push(mk(id, sh, cls));
        ws();
        if (s[i] === '&') { i++; continue; }
        return keys;
      }
    };
    let prev = group();
    ws();
    while (i < s.length) {
      const rest = s.slice(i);
      let m = /^(<)?(-{2,}>|-{3,}|={2,}>|={3,}|-\.+->|-\.+-|--[xo](?![\w])|~~~)/.exec(rest), label = '';
      if (!m) {
        const m2 = /^(<)?(--|==|-\.)\s+(.+?)\s+(-{2,}>|-{3,}|={2,}>|={3,}|\.+->|\.+-)/.exec(rest);
        if (!m2) throw new Error(`Unrecognised edge syntax near "${rest.slice(0, 20)}" in: ${s}`);
        label = unq(m2[3]); m = [m2[0], m2[1], m2[2] + m2[4]];
      }
      i += m[0].length;
      const op = m[2];
      ws();
      if (s[i] === '|') { const j = s.indexOf('|', i + 1); if (j < 0) throw new Error('Unclosed |label| in: ' + s); label = unq(s.slice(i + 1, j)); i = j + 1; }
      const next = group();
      const kind = op.includes('=') ? 'thick' : op.includes('.') ? 'dotted' : op === '~~~' ? 'invisible' : 'solid';
      const head = /[>xo]$/.test(op) && op !== '~~~' ? (op.endsWith('x') ? 'x' : op.endsWith('o') ? 'circle' : 'arrow') : '';
      for (const a of prev) for (const b of next) M.edges.push({ from: a, to: b, label, kind, head, tail: m[1] ? 'arrow' : '' });
      prev = next; ws();
    }
  };
  const targets = (names) => names.split(',').map((x) => x.trim()).filter(Boolean);
  for (const raw of lines) {
    for (const stmt of splitStmts(raw)) {
      const s = stmt.trim(); if (!s) continue;
      let m;
      if ((m = s.match(/^subgraph\s+(.*)$/i))) {
        const { id, title } = subId(m[1]);
        M.groups.set(id, { id, title, parent: cur() }); stack.push(id); continue;
      }
      if (/^end$/i.test(s)) { stack.pop(); continue; }
      if (/^direction\s/i.test(s) || /^(click|accTitle|accDescr|%%)/.test(s)) continue;
      if ((m = s.match(/^classDef\s+(\S+)\s+(.*)$/))) { for (const n of targets(m[1])) classDefs[n] = parseStyle(m[2]); continue; }
      if ((m = s.match(/^class\s+(\S+)\s+(\S+)$/))) { for (const n of targets(m[1])) applied.push([n, 'cls', m[2]]); continue; }
      if ((m = s.match(/^style\s+(\S+)\s+(.*)$/))) { applied.push([m[1], 'style', parseStyle(m[2])]); continue; }
      if ((m = s.match(/^linkStyle\s+([\d,\s]+|default)\s+(.*)$/))) { applied.push([m[1].trim(), 'link', parseStyle(m[2])]); continue; }
      chain(s);
    }
  }
  if (stack.length) throw new Error('Missing "end" for subgraph "' + stack[stack.length - 1] + '"');
  for (const [n, kind, v] of applied) {
    if (kind === 'link') { const idxs = n === 'default' ? M.edges.map((_, i) => i) : n.split(',').map((x) => +x); for (const i of idxs) if (M.edges[i]) M.edges[i].style = { ...M.edges[i].style, ...v }; continue; }
    const tgt = M.nodes.get(n) || M.groups.get(n); if (!tgt) continue;
    if (kind === 'cls') (tgt.cls ||= []).push(v); else tgt.style2 = { ...tgt.style2, ...v };
  }
  for (const t of [...M.nodes.values(), ...M.groups.values()]) {
    t.style = {};
    for (const c of t.cls || []) Object.assign(t.style, classDefs[c]);
    Object.assign(t.style, t.style2);
  }
  if (!M.nodes.size && !M.groups.size) throw new Error('Empty flowchart');
  return M;
}

// ---------- Mermaid: stateDiagram-v2 ----------
function mmState(lines, head) {
  const M = newModel('TB');
  const gids = new Set(), stack = [];
  for (const l of lines) { const m = l.trim().match(/^state\s+(?:"([^"]*)"\s+as\s+)?([\w.-]+)\s*\{$/); if (m) gids.add(m[2]); }
  const cur = () => stack[stack.length - 1] || '';
  const key = (id) => {
    if (id === '[*]') return null;
    if (gids.has(id)) return 'g:' + id;
    let n = M.nodes.get(id);
    if (!n) n = addNode(M, id, { shape: 'round', group: cur(), style: { fill: '#ececff' } });
    return id;
  };
  let noteN = 0, inNote = null;
  for (const raw of lines) {
    const s = raw.trim(); if (!s) continue;
    let m;
    if (inNote) {
      if (/^end\s+note$/i.test(s)) { inNote = null; } else inNote.n.label += (inNote.n.label ? '\n' : '') + s;
      continue;
    }
    if (/^direction\s+(\w+)/i.test(s) && !stack.length) { M.dir = DIRS[s.split(/\s+/)[1].toUpperCase()] || M.dir; continue; }
    if (/^direction\s/i.test(s) || s === '--') continue;
    if ((m = s.match(/^state\s+(?:"([^"]*)"\s+as\s+)?([\w.-]+)\s*\{$/))) {
      M.groups.set(m[2], { id: m[2], title: m[1] || m[2], parent: cur() }); stack.push(m[2]); continue;
    }
    if (s === '}') { stack.pop(); continue; }
    if ((m = s.match(/^state\s+([\w.-]+)\s*<<(\w+)>>$/))) { const k = key(m[1]); const sh = /choice/i.test(m[2]) ? 'choice' : 'fork'; addNode(M, m[1], { shape: sh, label: '' }); continue; }
    if ((m = s.match(/^state\s+"([^"]*)"\s+as\s+([\w.-]+)$/))) { key(m[2]); addNode(M, m[2], { label: m[1] }); continue; }
    if ((m = s.match(/^state\s+([\w.-]+)$/))) { key(m[1]); continue; }
    if ((m = s.match(/^note\s+(?:left|right)\s+of\s+([\w.-]+)\s*:\s*(.*)$/i)) || (m = s.match(/^note\s+(?:left|right)\s+of\s+([\w.-]+)$/i))) {
      const id = '__note' + noteN++, target = key(m[1]);
      const n = addNode(M, id, { label: m[2] || '', shape: 'rect', group: cur(), style: { fill: '#fff5ad', stroke: '#aaaa33' } });
      M.edges.push({ from: target, to: id, label: '', kind: 'dotted', head: '', tail: '' });
      if (m[2] == null) inNote = { n };
      continue;
    }
    if ((m = s.match(/^(\[\*\]|[\w.-]+)\s*-->\s*(\[\*\]|[\w.-]+)(?:\s*:\s*(.*))?$/))) {
      const mkEnd = (id, isSrc) => {
        if (id !== '[*]') return key(id);
        const nid = (isSrc ? '__start_' : '__end_') + (cur() || 'root');
        if (!M.nodes.has(nid)) addNode(M, nid, { shape: isSrc ? 'start' : 'end', label: '', group: cur() });
        return nid;
      };
      M.edges.push({ from: mkEnd(m[1], true), to: mkEnd(m[2], false), label: m[3] || '', kind: 'solid', head: 'arrow', tail: '' });
      continue;
    }
    if ((m = s.match(/^([\w.-]+)\s*:\s*(.*)$/))) {
      const k = key(m[1]);
      if (k.startsWith('g:')) M.groups.get(m[1]).title = m[2]; else { const n = M.nodes.get(m[1]); n.label = n.described ? n.label + '\n' + m[2] : m[2]; n.described = true; }
      continue;
    }
    throw new Error('Unsupported stateDiagram line: ' + s);
  }
  if (stack.length) throw new Error('Unclosed composite state "' + stack.pop() + '"');
  return M;
}

// ---------- table-shaped nodes (class boxes, ER entities, SQL tables) ----------
// sections: [{rows:[{cols:[...], right?}]}] ; header lines centred bold
function boxNode(M, id, headLines, sections, o = {}) {
  const hLH = 18, rLH = 18;
  const colW = [];
  for (const s of sections) for (const r of s.rows) r.cols.forEach((c, i) => { colW[i] = Math.max(colW[i] || 0, tw(c, 13)); });
  const gap = 14;
  const rowsW = colW.length ? colW.reduce((a, b) => a + b, 0) + gap * (colW.length - 1) : 0;
  const w = Math.max(...headLines.map((l) => tw(l, 14) + 24), rowsW + 20, 80);
  const hh = headLines.length * hLH + 10;
  let h = hh; for (const s of sections) h += Math.max(s.rows.length, 1) * rLH + 8;
  const n = addNode(M, id, { w, h, label: id, ...o.node });
  n.body = (n) => {
    const x0 = n.x - n.w / 2, y0 = n.y - n.h / 2, st = n.style || {};
    let out = `<rect x="${f(x0)}" y="${f(y0)}" width="${f(n.w)}" height="${f(n.h)}" fill="#fff" stroke="${esc(st.stroke || '#9370db')}" stroke-width="1.5"/>`;
    out += `<rect x="${f(x0)}" y="${f(y0)}" width="${f(n.w)}" height="${hh}" fill="${esc(st.fill || '#ececff')}" stroke="${esc(st.stroke || '#9370db')}" stroke-width="1.5"/>`;
    headLines.forEach((l, i) => { out += txt(n.x, y0 + 5 + hLH * (i + 0.5), l, { bold: i === headLines.length - 1, italic: i < headLines.length - 1 && headLines.length > 1, fs: i < headLines.length - 1 && headLines.length > 1 ? 12 : 14 }); });
    let y = y0 + hh;
    for (const s of sections) {
      const hgt = Math.max(s.rows.length, 1) * rLH + 8;
      out += `<line x1="${f(x0)}" y1="${f(y)}" x2="${f(x0 + n.w)}" y2="${f(y)}" stroke="${esc(st.stroke || '#9370db')}"/>`;
      s.rows.forEach((r, ri) => {
        let x = x0 + 10;
        r.cols.forEach((c, ci) => {
          const last = ci === r.cols.length - 1 && r.right;
          out += txt(last ? x0 + n.w - 10 : x, y + 4 + rLH * (ri + 0.5), c, { fs: 13, anchor: last ? 'end' : 'start', bold: r.bold });
          x += colW[ci] + gap;
        });
      });
      y += hgt;
    }
    return out;
  };
  return n;
}

// ---------- Mermaid: classDiagram ----------
function mmClass(lines) {
  const M = newModel('TB'), cls = new Map();
  const base = (n) => n.replace(/~.*~$/, '');
  const get = (name) => { const gen = (name.match(/~(.*)~$/) || [])[1], key = base(name); if (!cls.has(key)) cls.set(key, { name: key, ann: '', attrs: [], methods: [] }); const c = cls.get(key); if (gen) c.name = `${key}<${gen}>`; return c; };
  const addMember = (c, t) => { t = t.trim(); if (!t) return; const a = t.match(/^<<(.+)>>$/); if (a) c.ann = a[1]; else (t.includes('(') ? c.methods : c.attrs).push(t.replace(/~([^~]+)~/g, '<$1>')); };
  const rels = [];
  let open = null;
  const OPS = { '<|--': ['tri', '', 0], '*--': ['dia', '', 0], 'o--': ['odia', '', 0], '<--': ['arrow', '', 0], '-->': ['', 'arrow', 0], '--*': ['', 'dia', 0], '--o': ['', 'odia', 0], '--|>': ['', 'tri', 0], '..>': ['', 'arrow', 1], '..|>': ['', 'tri', 1], '<|..': ['tri', '', 1], '<..': ['arrow', '', 1], '--': ['', '', 0], '..': ['', '', 1] };
  const relRe = /^(\S+?)\s*(?:"([^"]*)"\s*)?(<\|--|--\|>|<\|\.\.|\.\.\|>|\*--|--\*|o--|--o|<--|-->|<\.\.|\.\.>|--|\.\.)\s*(?:"([^"]*)"\s*)?(\S+?)\s*(?::\s*(.*))?$/;
  for (const raw of lines) {
    const s = raw.trim(); if (!s) continue;
    let m;
    if (open) { if (s === '}') open = null; else addMember(open, s); continue; }
    if (/^direction\s/i.test(s)) { M.dir = DIRS[s.split(/\s+/)[1].toUpperCase()] || 'TB'; continue; }
    if ((m = s.match(/^class\s+(\S+?)\s*\{$/))) { open = get(m[1]); continue; }
    if ((m = s.match(/^class\s+(\S+?)$/))) { get(m[1]); continue; }
    if ((m = s.match(/^(\S+?)\s*:\s*(.+)$/)) && !relRe.test(s)) { addMember(get(m[1]), m[2]); continue; }
    if ((m = s.match(relRe))) { rels.push(m); continue; }
    throw new Error('Unsupported classDiagram line: ' + s);
  }
  for (const m of rels) { get(m[1]); get(m[5]); }
  if (!cls.size) throw new Error('No classes found');
  for (const [key, c] of cls) {
    const secs = [{ rows: c.attrs.map((a) => ({ cols: [a] })) }, { rows: c.methods.map((a) => ({ cols: [a] })) }];
    boxNode(M, key, c.ann ? ['<<' + c.ann + '>>', c.name] : [c.name], secs);
  }
  for (const m of rels) {
    let [tail, head, dotted] = OPS[m[3]], a = base(m[1]), b = base(m[5]), c1 = m[2], c2 = m[4];
    if (m[3].startsWith('--') && (head === 'tri' || head === 'dia' || head === 'odia')) { [a, b] = [b, a]; [tail, head] = [head, tail]; [c1, c2] = [c2, c1]; }
    const ends = []; if (c1) ends.push([0, c1]); if (c2) ends.push([1, c2]);
    M.edges.push({ from: a, to: b, label: m[6] || '', kind: dotted ? 'dotted' : 'solid', head, tail, ends });
  }
  return M;
}

// ---------- Mermaid: erDiagram ----------
const ER_L = { '||': 'one', '|o': 'zeroone', '}o': 'zeromany', '}|': 'onemany' }, ER_R = { '||': 'one', 'o|': 'zeroone', 'o{': 'zeromany', '|{': 'onemany' };
function erEntity(M, name, attrs) {
  const rows = attrs.map((a) => ({ cols: [a.type, a.name, a.keys], right: true }));
  boxNode(M, name, [name], [{ rows }]);
}
function mmER(lines) {
  const M = newModel('TB'), ents = new Map(), rels = [];
  const ent = (n) => { if (!ents.has(n)) ents.set(n, []); return ents.get(n); };
  let open = null;
  const relRe = /^("[^"]+"|[\w-]+)\s+([|}][|o])(--|\.\.)([|o][|{])\s+("[^"]+"|[\w-]+)\s*(?::\s*(.*))?$/;
  for (const raw of lines) {
    const s = raw.trim(); if (!s) continue;
    let m;
    if (open) {
      if (s === '}') { open = null; continue; }
      const mm = s.match(/^(\S+)\s+(\S+)((?:\s+(?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*)*)?\s*(?:"([^"]*)")?\s*$/);
      if (!mm) throw new Error('Bad entity attribute: ' + s);
      open.push({ type: mm[1], name: mm[2], keys: (mm[3] || '').trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',') });
      continue;
    }
    if (/^direction\s/i.test(s)) { M.dir = DIRS[s.split(/\s+/)[1].toUpperCase()] || 'TB'; continue; }
    if ((m = s.match(/^("[^"]+"|[\w-]+)\s*\{$/))) { open = ent(unq(m[1])); continue; }
    if ((m = s.match(/^("[^"]+"|[\w-]+)\s*\{\s*\}$/)) || (m = s.match(/^("[^"]+"|[\w-]+)$/))) { ent(unq(m[1])); continue; }
    if ((m = s.match(relRe))) {
      if (!ER_L[m[2]] || !ER_R[m[4]]) throw new Error('Bad cardinality in: ' + s);
      ent(unq(m[1])); ent(unq(m[5])); rels.push(m); continue;
    }
    throw new Error('Unsupported erDiagram line: ' + s);
  }
  if (!ents.size) throw new Error('No entities found');
  for (const [n, a] of ents) erEntity(M, n, a);
  for (const m of rels) M.edges.push({ from: unq(m[1]), to: unq(m[5]), label: unq(m[6] || ''), kind: m[3] === '..' ? 'dotted' : 'solid', tail: ER_L[m[2]], head: ER_R[m[4]] });
  return M;
}

// ---------- Mermaid: sequenceDiagram ----------
function mmSeq(lines) {
  const parts = new Map(), ev = [];
  let auto = false;
  const P = (id, label, actor) => {
    if (!parts.has(id)) parts.set(id, { id, label: id, actor: false });
    const p = parts.get(id); if (label != null) p.label = label; if (actor) p.actor = true; return p;
  };
  const msgRe = /^(\S+?)\s*(--?>>|--?>|--?x|--?\))\s*([+-])?\s*(\S+?)\s*:\s*(.*)$/;
  const depth = [];
  for (const raw of lines) {
    const s = raw.trim(); if (!s) continue;
    let m;
    if (/^autonumber/i.test(s)) { auto = true; continue; }
    if (/^(title|accTitle|accDescr|box|link|links|properties)\b/i.test(s)) { if (/^box\b/i.test(s)) throw new Error('"box" groups are not supported'); continue; }
    if ((m = s.match(/^(participant|actor)\s+(\S+?)(?:\s+as\s+(.+))?$/i))) { P(m[2], m[3] ? m[3].trim() : null, m[1].toLowerCase() === 'actor'); continue; }
    if ((m = s.match(/^(activate|deactivate)\s+(\S+)$/i))) { P(m[2]); ev.push({ t: m[1].toLowerCase(), id: m[2] }); continue; }
    if ((m = s.match(/^note\s+(left of|right of|over)\s+([^:]+?)\s*:\s*(.*)$/i))) {
      const ids = m[2].split(',').map((x) => x.trim()); ids.forEach((i) => P(i));
      ev.push({ t: 'note', pos: m[1].toLowerCase().split(' ')[0], ids, text: m[3] }); continue;
    }
    if ((m = s.match(/^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i))) { depth.push(m[1]); ev.push({ t: 'begin', kind: m[1].toLowerCase(), text: m[2] }); continue; }
    if ((m = s.match(/^(else|and|option)\b\s*(.*)$/i))) { if (!depth.length) throw new Error(`"${m[1]}" outside a block`); ev.push({ t: 'else', kind: m[1].toLowerCase(), text: m[2] }); continue; }
    if (/^end$/i.test(s)) { if (!depth.length) throw new Error('Unexpected "end"'); depth.pop(); ev.push({ t: 'end' }); continue; }
    if ((m = s.match(msgRe))) {
      P(m[1]); P(m[4]);
      const a = m[2];
      ev.push({ t: 'msg', from: m[1], to: m[4], text: m[5], dashed: a.startsWith('--'), head: a.endsWith('>>') ? 'arrow' : a.endsWith('>') ? 'open' : a.endsWith('x') ? 'x' : 'async', act: m[3] === '+' ? 1 : m[3] === '-' ? -1 : 0 });
      continue;
    }
    throw new Error('Unsupported sequenceDiagram line: ' + s);
  }
  if (depth.length) throw new Error('Missing "end" for ' + depth.pop() + ' block');
  if (!parts.size) throw new Error('No participants or messages');
  const ids = [...parts.keys()], ix = new Map(ids.map((id, i) => [id, i]));
  const ps = ids.map((id) => parts.get(id));
  const bw = ps.map((p) => Math.max(90, twMax(p.label) + 28));
  const bh = Math.max(...ps.map((p) => splitLines(p.label).length * 17 + 18), 36);
  const gap = []; for (let i = 0; i < ps.length - 1; i++) gap.push((bw[i] + bw[i + 1]) / 2 + 24);
  const req = [];
  for (const e of ev) {
    if (e.t === 'msg') {
      const a = ix.get(e.from), b = ix.get(e.to), w = twMax(e.text, 13) + 44;
      if (a === b) { if (a < ps.length - 1) req.push([a, a + 1, w + 40]); } else req.push([Math.min(a, b), Math.max(a, b), w]);
    } else if (e.t === 'note') {
      const w = twMax(e.text, 13) + 24, i = Math.min(...e.ids.map((x) => ix.get(x))), j = Math.max(...e.ids.map((x) => ix.get(x)));
      if (e.pos === 'over') { if (i !== j) req.push([i, j, w - 20]); }
      else if (e.pos === 'right') { if (i < ps.length - 1) req.push([i, i + 1, w + 30]); } else if (i > 0) req.push([i - 1, i, w + 30]);
    }
  }
  req.sort((a, b) => a[1] - a[0] - (b[1] - b[0]));
  for (const [i, j, need] of req) {
    let cur = 0; for (let k = i; k < j; k++) cur += gap[k];
    if (cur < need) for (let k = i; k < j; k++) gap[k] += (need - cur) / (j - i);
  }
  const X = [bw[0] / 2]; for (let i = 1; i < ps.length; i++) X.push(X[i - 1] + gap[i - 1]);
  let minX = 0, maxX = X[X.length - 1] + bw[bw.length - 1] / 2;
  const grow = (a, b) => { minX = Math.min(minX, a); maxX = Math.max(maxX, b); };
  const top = 10; let y = top + bh + 22;
  let msgs = '', notes = '', frames = '', acts = '', numN = 0;
  const open = [], act = ids.map(() => []), bars = [];
  const touch = (...is) => { for (const b of open) for (const i of is) { b.lo = Math.min(b.lo, i); b.hi = Math.max(b.hi, i); } };
  for (const e of ev) {
    if (e.t === 'msg') {
      const a = ix.get(e.from), b = ix.get(e.to), L = splitLines((auto ? `${++numN}. ` : '') + e.text);
      touch(a, b);
      if (e.act === 1) act[b].push(y + 14 + L.length * 16);
      const lvA = act[a].length, lvB = act[b].length;
      const ly = y + 12 + L.length * 16;
      const col = '#333', dash = e.dashed ? ' stroke-dasharray="6 4"' : '';
      if (a === b) {
        const x = X[a] + (lvA ? 5 + (lvA - 1) * 4 : 0), hh = 20;
        msgs += `<path d="M${f(x)},${f(ly)} H${f(x + 34)} V${f(ly + hh)} H${f(x + 1)}" fill="none" stroke="${col}" stroke-width="1.5"${dash}/>` + deco(e.head === 'arrow' ? 'arrow' : e.head === 'x' ? 'x' : 'arrow', { x: x, y: ly + hh }, { x: 1, y: 0 }, col).replace(/^/, '');
        L.forEach((l, i) => { msgs += txt(x + 42, y + 8 + (i + 0.5) * 16, l, { fs: 13, anchor: 'start' }); });
        grow(x, x + 42 + twMax(L.join('\n'), 13));
        y += 32 + L.length * 16 + (hh - 10);
      } else {
        const dirn = Math.sign(X[b] - X[a]);
        const x1 = X[a] + dirn * (lvA ? 5 + (lvA - 1) * 4 : 0), x2 = X[b] - dirn * (lvB ? 5 + (lvB - 1) * 4 : 0);
        const end = e.head === 'open' ? [x2, ly] : null;
        msgs += `<line x1="${f(x1)}" y1="${f(ly)}" x2="${f(x2)}" y2="${f(ly)}" stroke="${col}" stroke-width="1.5"${dash}/>`;
        const d = { x: -dirn, y: 0 };
        if (e.head === 'arrow' || e.head === 'async') msgs += deco('arrow', { x: x2, y: ly }, d, col);
        else if (e.head === 'x') msgs += deco('x', { x: x2, y: ly }, d, col);
        else msgs += `<path d="M${f(x2 - dirn * 9)},${f(ly - 5)} L${f(x2)},${f(ly)} L${f(x2 - dirn * 9)},${f(ly + 5)}" fill="none" stroke="${col}" stroke-width="1.5"/>`;
        L.forEach((l, i) => { msgs += txt((x1 + x2) / 2, y + 8 + (i + 0.5) * 16, l, { fs: 13 }); });
        y += 28 + L.length * 16;
      }
      if (e.act === -1 && act[a].length) bars.push({ i: a, y1: act[a].pop(), y2: ly, lv: act[a].length });
      if (e.act === 1) { /* bar start already pushed */ }
    } else if (e.t === 'activate') { act[ix.get(e.id)].push(y - 4); }
    else if (e.t === 'deactivate') { const i = ix.get(e.id); if (act[i].length) bars.push({ i, y1: act[i].pop(), y2: y - 8, lv: act[i].length }); }
    else if (e.t === 'note') {
      const L = splitLines(e.text), w = Math.max(60, twMax(e.text, 13) + 20), h = L.length * 16 + 12;
      const i = Math.min(...e.ids.map((x) => ix.get(x))), j = Math.max(...e.ids.map((x) => ix.get(x)));
      touch(i, j);
      let x0;
      if (e.pos === 'over') { const wc = Math.max(w, i === j ? w : X[j] - X[i] + 40); x0 = (X[i] + X[j]) / 2 - wc / 2; e.w = wc; } else if (e.pos === 'right') { x0 = X[j] + 12; e.w = w; } else { x0 = X[i] - 12 - w; e.w = w; }
      grow(x0, x0 + e.w);
      notes += `<rect x="${f(x0)}" y="${f(y)}" width="${f(e.w)}" height="${f(h)}" fill="#fff5ad" stroke="#aaaa33"/>`;
      L.forEach((l, k) => { notes += txt(x0 + e.w / 2, y + 6 + (k + 0.5) * 16, l, { fs: 13 }); });
      y += h + 12;
    } else if (e.t === 'begin') {
      open.push({ kind: e.kind, text: e.text, y, lo: 99999, hi: -1, depth: open.length, divs: [] });
      y += e.kind === 'rect' ? 6 : 30;
    } else if (e.t === 'else') { open[open.length - 1].divs.push({ y: y + 2, kind: e.kind, text: e.text }); y += 26; }
    else if (e.t === 'end') {
      const b = open.pop(); b.y2 = y + 2; y += 14;
      if (b.hi < 0) { b.lo = 0; b.hi = ps.length - 1; }
      const pad = 26 - b.depth * 7, x1 = X[b.lo] - pad - (b.lo === 0 ? 0 : 0), x2 = X[b.hi] + pad;
      grow(x1, x2);
      let fr = '';
      if (b.kind === 'rect') fr = `<rect x="${f(x1)}" y="${f(b.y)}" width="${f(x2 - x1)}" height="${f(b.y2 - b.y)}" fill="${esc(/^(rgba?\([^)]*\)|#[0-9a-f]+|\w+)$/i.test(b.text.trim()) ? b.text.trim() : '#eef')}" fill-opacity=".5"/>`;
      else {
        const tab = tw(b.kind, 12) + 16;
        fr = `<rect x="${f(x1)}" y="${f(b.y)}" width="${f(x2 - x1)}" height="${f(b.y2 - b.y)}" fill="none" stroke="#888" stroke-width="1.2"/><path d="M${f(x1)},${f(b.y)} h${f(tab)} v10 l-6,6 h${f(-tab + 6)} z" fill="#e8e8f4" stroke="#888"/>${txt(x1 + tab / 2 - 1, b.y + 8, b.kind, { fs: 12, bold: true })}`;
        if (b.text) fr += txt(x1 + tab + 10, b.y + 9, `[${b.text}]`, { fs: 12, anchor: 'start' });
        for (const d of b.divs) fr += `<line x1="${f(x1)}" y1="${f(d.y)}" x2="${f(x2)}" y2="${f(d.y)}" stroke="#888" stroke-dasharray="6 4"/>` + (d.text ? txt(x1 + 10, d.y + 12, `[${d.text}]`, { fs: 12, anchor: 'start' }) : '');
      }
      frames = fr + frames;
    }
  }
  for (const [i, a] of act.entries()) for (const y1 of a) bars.push({ i, y1, y2: y, lv: 0 });
  for (const b of bars) acts += `<rect x="${f(X[b.i] - 5 + b.lv * 4)}" y="${f(b.y1)}" width="10" height="${f(Math.max(4, b.y2 - b.y1))}" fill="#eef" stroke="#555"/>`;
  y += 8;
  const boxes = (yy) => ps.map((p, i) => {
    const st = p.actor ? `rx="${bh / 2}"` : 'rx="3"';
    return `<rect x="${f(X[i] - bw[i] / 2)}" y="${f(yy)}" width="${f(bw[i])}" height="${f(bh)}" ${st} fill="#ececff" stroke="#9370db" stroke-width="1.5"/>` + mtxt(X[i], yy + bh / 2, p.label);
  }).join('');
  const lifelines = X.map((x) => `<line x1="${f(x)}" y1="${f(top + bh)}" x2="${f(x)}" y2="${f(y)}" stroke="#999" stroke-dasharray="5 5"/>`).join('');
  const total = maxX - minX + 40, H = y + bh + 14;
  const body = `<g transform="translate(${f(20 - minX)},0)">${lifelines}${frames}${acts}${msgs}${notes}${boxes(top)}${boxes(y)}</g>`;
  return svgDoc(total, H, body);
}

// ---------- Mermaid: pie ----------
function mmPie(lines, head) {
  let title = (head.match(/title\s+(.*)$/i) || [])[1] || '', showData = /\bshowData\b/i.test(head);
  const data = [];
  for (const raw of lines) {
    const s = raw.trim(); let m;
    if (!s) continue;
    if ((m = s.match(/^title\s+(.*)$/i))) { title = m[1]; continue; }
    if (/^showData$/i.test(s)) { showData = true; continue; }
    if ((m = s.match(/^"([^"]*)"\s*:\s*(-?[\d.]+)\s*$/))) { if (+m[2] < 0) throw new Error('Pie values cannot be negative'); data.push([m[1], +m[2]]); continue; }
    throw new Error('Unsupported pie line: ' + s);
  }
  const total = data.reduce((a, d) => a + d[1], 0);
  if (!data.length || total <= 0) throw new Error('Pie needs at least one positive "label" : value');
  const r = 130, cx = 20 + r, top = title ? 50 : 20, cy = top + r;
  let body = title ? txt(cx + 80, 26, title, { fs: 18, bold: true }) : '';
  let a0 = -Math.PI / 2, legend = '';
  const pt = (a, rr) => `${f(cx + rr * Math.cos(a))},${f(cy + rr * Math.sin(a))}`;
  let lw = 0;
  data.forEach(([lab, v], i) => {
    const col = PALETTE[i % PALETTE.length], fr = v / total, a1 = a0 + fr * 2 * Math.PI;
    if (v > 0) {
      body += fr >= 0.9999 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}" stroke="#fff" stroke-width="2"/>`
        : `<path d="M${cx},${cy} L${pt(a0, r)} A${r},${r} 0 ${fr > 0.5 ? 1 : 0} 1 ${pt(a1, r)} Z" fill="${col}" stroke="#fff" stroke-width="2"/>`;
      if (fr >= 0.04) body += txt(cx + r * 0.68 * Math.cos((a0 + a1) / 2), cy + r * 0.68 * Math.sin((a0 + a1) / 2), Math.round(fr * 1000) / 10 + '%', { fill: '#fff', bold: true, fs: 13 });
    }
    const L = showData ? `${lab} [${v}]` : lab;
    lw = Math.max(lw, tw(L)); legend += `<rect x="${cx + r + 30}" y="${top + 6 + i * 24}" width="16" height="16" fill="${col}"/>${txt(cx + r + 54, top + 14 + i * 24, L, { anchor: 'start' })}`;
    a0 = a1;
  });
  return svgDoc(cx + r + 70 + lw, Math.max(cy + r + 20, top + data.length * 24 + 20), body + legend);
}

// ---------- Mermaid: gantt ----------
function mmGantt(lines) {
  let title = '';
  const tasks = [], byId = new Map();
  let section = '', prevEnd = null;
  const day = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
  const UN = { s: 1 / 86400, m: 1 / 1440, h: 1 / 24, d: 1, w: 7, M: 30, y: 365 };
  const isDate = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x), isDur = (x) => /^\d+(\.\d+)?[smhdwMy]$/.test(x);
  const dur = (x) => parseFloat(x) * UN[x.slice(-1)];
  for (const raw of lines) {
    const s = raw.trim(); let m;
    if (!s) continue;
    if ((m = s.match(/^title\s+(.*)$/i))) { title = m[1]; continue; }
    if (/^(dateFormat|axisFormat|excludes|includes|todayMarker|tickInterval|weekday|accTitle|accDescr)\b/i.test(s)) {
      if ((m = s.match(/^dateFormat\s+(.*)$/i)) && m[1].trim() !== 'YYYY-MM-DD') throw new Error('Only dateFormat YYYY-MM-DD is supported');
      continue;
    }
    if ((m = s.match(/^section\s+(.*)$/i))) { section = m[1]; continue; }
    const k = s.indexOf(':');
    if (k < 0) throw new Error('Unsupported gantt line: ' + s);
    const name = s.slice(0, k).trim(), parts = s.slice(k + 1).split(',').map((x) => x.trim()).filter(Boolean);
    const tags = []; while (parts.length && /^(done|active|crit|milestone)$/.test(parts[0])) tags.push(parts.shift());
    let id = null;
    if (parts.length >= 2 && !isDate(parts[0]) && !isDur(parts[0]) && !/^after\s/.test(parts[0]) && (parts.length === 3 || !/^after\s/.test(parts[0]))) id = parts.shift();
    let start, end;
    const resolveStart = (x) => {
      const a = x.match(/^after\s+(.+)$/);
      if (a) { const ends = a[1].split(/\s+/).map((i) => { const t = byId.get(i); if (!t) throw new Error(`Unknown task id "${i}" in: ${s}`); return t.end; }); return Math.max(...ends); }
      return day(x);
    };
    if (parts.length === 1) { start = prevEnd; const x = parts[0]; end = isDate(x) ? day(x) : isDur(x) ? null : NaN; if (Number.isNaN(end)) throw new Error('Bad task timing in: ' + s); if (end === null) end = start + dur(x); if (start == null) throw new Error(`Task "${name}" has no start date`); }
    else if (parts.length === 2) { if (!isDate(parts[0]) && !/^after\s/.test(parts[0])) throw new Error('Bad task timing in: ' + s); start = resolveStart(parts[0]); end = isDate(parts[1]) ? day(parts[1]) : isDur(parts[1]) ? start + dur(parts[1]) : NaN; if (Number.isNaN(end)) throw new Error('Bad task timing in: ' + s); }
    else if (parts.length === 0 && tags.includes('milestone')) { start = prevEnd; end = start; }
    else throw new Error('Bad task timing in: ' + s);
    if (start == null || end < start) throw new Error(`Bad dates for task "${name}"`);
    const t = { name, section, start, end, tags, ms: tags.includes('milestone') };
    tasks.push(t); if (id) byId.set(id, t); prevEnd = end;
  }
  if (!tasks.length) throw new Error('No tasks');
  const tmin = Math.min(...tasks.map((t) => t.start)), tmax = Math.max(...tasks.map((t) => t.end), tmin + 1);
  const labW = Math.max(120, ...tasks.map((t) => tw(t.name, 13) + 24), ...tasks.map((t) => tw(t.section, 13) + 24)), cw = 640, x0 = 20 + labW, sc = cw / (tmax - tmin);
  const top = title ? 70 : 44, RH = 28;
  let rows = [], cursor = top, lastSec = null;
  for (const t of tasks) { if (t.section && t.section !== lastSec) { rows.push({ sec: t.section, y: cursor }); cursor += RH; lastSec = t.section; } rows.push({ t, y: cursor }); cursor += RH; }
  const H = cursor + 16, W = x0 + cw + 24;
  let body = title ? txt(W / 2, 24, title, { fs: 18, bold: true }) : '';
  const span = tmax - tmin, ticks = [];
  if (span <= 21) for (let d = Math.floor(tmin); d <= tmax; d++) ticks.push(d);
  else if (span <= 120) for (let d = Math.ceil(tmin); d <= tmax; d++) { if (new Date(d * 864e5).getUTCDay() === 1) ticks.push(d); }
  else { const dt = new Date(tmin * 864e5); let y = dt.getUTCFullYear(), m = dt.getUTCMonth(); for (;;) { const d = Date.UTC(y, m, 1) / 864e5; if (d > tmax) break; if (d >= tmin) ticks.push(d); if (++m > 11) { m = 0; y++; } } }
  const fmtD = (d) => { const s = new Date(d * 864e5).toISOString(); return span > 120 ? s.slice(0, 7) : s.slice(5, 10); };
  for (const d of ticks) { const x = x0 + (d - tmin) * sc; body += `<line x1="${f(x)}" y1="${top - 6}" x2="${f(x)}" y2="${f(cursor)}" stroke="#ddd"/>${txt(x, top - 14, fmtD(d), { fs: 11, fill: '#555' })}`; }
  rows.forEach((r, i) => {
    if (r.sec) { body += `<rect x="10" y="${r.y}" width="${W - 20}" height="${RH}" fill="#e9e9f7"/>${txt(18, r.y + RH / 2, r.sec, { anchor: 'start', bold: true, fs: 13 })}`; return; }
    const t = r.t, x = x0 + (t.start - tmin) * sc, w = Math.max((t.end - t.start) * sc, t.ms ? 0 : 3), yb = r.y + 5;
    if (i % 2) body += `<rect x="10" y="${r.y}" width="${W - 20}" height="${RH}" fill="#f6f6fb" opacity=".6"/>`;
    body += txt(18, r.y + RH / 2, t.name, { anchor: 'start', fs: 13 });
    const crit = t.tags.includes('crit'), done = t.tags.includes('done'), actv = t.tags.includes('active');
    const fill = crit ? (done ? '#ffd0d0' : actv ? '#ffb0b0' : '#ff8888') : done ? '#d3d3d3' : actv ? '#bfc7ff' : '#8a90dd', stroke = crit ? '#d33' : done ? '#888' : '#534fbc';
    body += t.ms ? `<polygon points="${f(x)},${r.y + 3} ${f(x + 11)},${r.y + RH / 2} ${f(x)},${r.y + RH - 3} ${f(x - 11)},${r.y + RH / 2}" fill="${fill}" stroke="${stroke}"/>`
      : `<rect x="${f(x)}" y="${yb}" width="${f(w)}" height="${RH - 10}" rx="3" fill="${fill}" stroke="${stroke}"/>`;
  });
  return svgDoc(W, H, body);
}

// ---------- Mermaid dispatcher ----------
const MM_SAMPLES = {
  flowchart: `flowchart TD
    A([Start]) --> B{Valid input?}
    B -- yes --> C[Process data]
    B -->|no| D[/Show error/]
    C --> E[(Database)]
    C & D --> F((Done))
    subgraph Backend [Backend services]
        E --> G[[Audit log]]
        G -.-> H>Notify]
    end
    F ==> G
    classDef good fill:#d4f7d4,stroke:#2a8a2a
    class C,E good
    style D fill:#ffe0e0,stroke:#c33`,
  sequence: `sequenceDiagram
    autonumber
    actor User
    participant Web as Web App
    participant API
    participant DB
    User->>Web: Click "Buy"
    Web->>+API: POST /order
    API->>DB: INSERT order
    DB-->>API: ok
    alt stock available
        API-->>-Web: 201 Created
        Note right of Web: show receipt
    else sold out
        API-->>Web: 409 Conflict
    end
    loop every 5s
        Web->>API: poll status
    end
    Note over User,Web: Done`,
  pie: `pie showData title Browser share
    "Chrome" : 64
    "Safari" : 19
    "Firefox" : 6.5
    "Edge" : 5
    "Other" : 5.5`,
  gantt: `gantt
    title Website launch
    dateFormat YYYY-MM-DD
    section Design
    Wireframes      :done, des1, 2025-01-06, 7d
    Visual design   :active, des2, after des1, 10d
    section Build
    Frontend        :crit, dev1, after des2, 14d
    Backend         :dev2, 2025-01-20, 20d
    section Launch
    QA              :after dev1, 5d
    Go live         :milestone, 2025-03-01, 0d`,
  er: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "is in"
    CUSTOMER {
        int id PK
        string name
        string email UK
    }
    ORDER {
        int id PK
        int customer_id FK
        date placed_at
    }
    PRODUCT {
        int id PK
        string title
        float price
    }
    LINE_ITEM {
        int order_id FK
        int product_id FK
        int qty
    }`,
  state: `stateDiagram-v2
    [*] --> Idle
    Idle --> Running : start
    Running --> Paused : pause
    Paused --> Running : resume
    Running --> Done : finish
    state Running {
        [*] --> Working
        Working --> Checking : tick
        Checking --> Working : more
        Checking --> [*] : ok
    }
    Done --> [*]`,
  class: `classDiagram
    class Animal {
        <<abstract>>
        +String name
        +int age
        +eat() void
        +move() void
    }
    class Dog {
        +bark() void
    }
    class Cat {
        +purr() void
    }
    class Owner {
        +String name
    }
    Animal <|-- Dog
    Animal <|-- Cat
    Owner "1" --> "*" Animal : owns`,
};
const MM_TYPES = Object.keys(MM_SAMPLES);
function mermaidToSvg(src, o = {}) {
  let text = String(src).replace(/\r/g, '');
  text = text.replace(/^\s*---[\s\S]*?\n---\s*\n/, '');
  const lines = text.split('\n').map((l) => l.replace(/(^|\s)%%.*$/, '').replace(/\s+$/, '')).filter((l) => l.trim() && !/^\s*%%/.test(l));
  if (!lines.length) throw new Error('Empty diagram');
  const head = lines[0].trim(), rest = lines.slice(1), kw = head.split(/\s+/)[0];
  const opts = { curve: o.curve };
  if (/^(flowchart|graph)(-elk)?$/i.test(kw)) return renderModel(mmFlow(rest, head), opts);
  if (/^sequenceDiagram$/i.test(kw)) return mmSeq(rest);
  if (/^pie$/i.test(kw)) return mmPie(rest, head);
  if (/^gantt$/i.test(kw)) return mmGantt(rest);
  if (/^erDiagram$/i.test(kw)) return renderModel(mmER(rest), opts);
  if (/^stateDiagram(-v2)?$/i.test(kw)) return renderModel(mmState(rest, head), opts);
  if (/^classDiagram(-v2)?$/i.test(kw)) return renderModel(mmClass(rest), opts);
  throw new Error(`Unsupported diagram type "${kw}". Supported: flowchart/graph, sequenceDiagram, pie, gantt, erDiagram, stateDiagram-v2, classDiagram.`);
}

// ---------- SQL engine (tokenizer, parser, evaluator; no eval/Function) ----------
function sqlLex(src) {
  const T = []; let i = 0; const n = src.length;
  const push = (k, v, s, e, extra) => T.push({ k, v, s, e, ...extra });
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '-' && src[i + 1] === '-') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; continue; }
    if (c === "'") {
      let j = i + 1, s = '';
      for (;;) { if (j >= n) throw new Error('Unterminated string literal'); if (src[j] === "'") { if (src[j + 1] === "'") { s += "'"; j += 2; continue; } break; } s += src[j++]; }
      push('str', s, i, j + 1); i = j + 1; continue;
    }
    if (c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c, j = src.indexOf(close, i + 1);
      if (j < 0) throw new Error('Unterminated quoted identifier');
      push('id', src.slice(i + 1, j), i, j + 1, { q: true, u: src.slice(i + 1, j).toUpperCase() }); i = j + 1; continue;
    }
    let m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i, i + 40));
    if (m) { push('num', parseFloat(m[0]), i, i + m[0].length); i += m[0].length; continue; }
    m = /^[A-Za-z_\u0080-￿][\w$\u0080-￿]*/.exec(src.slice(i, i + 200));
    if (m) { push('id', m[0], i, i + m[0].length, { u: m[0].toUpperCase() }); i += m[0].length; continue; }
    const two = src.slice(i, i + 2);
    if (['<>', '!=', '<=', '>=', '||', '=='].includes(two)) { push('op', two === '==' ? '=' : two === '!=' ? '<>' : two, i, i + 2); i += 2; continue; }
    if ('=<>+-*/%(),.;'.includes(c)) { push('op', c, i, i + 1); i++; continue; }
    throw new Error(`Unexpected character "${c}" at position ${i}`);
  }
  return T;
}
const SQL_RESERVED = new Set('SELECT FROM WHERE GROUP HAVING ORDER LIMIT OFFSET UNION INTERSECT EXCEPT JOIN INNER LEFT RIGHT FULL CROSS NATURAL ON USING AS AND OR NOT NULL CASE WHEN THEN ELSE END IN IS LIKE GLOB BETWEEN EXISTS DISTINCT ALL BY ASC DESC SET VALUES INTO OUTER WITH ESCAPE CAST'.split(' '));
const AGG = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'TOTAL', 'GROUP_CONCAT']);

class SqlParser {
  constructor(T, src) { this.T = T; this.i = 0; this.src = src; }
  get tok() { return this.T[this.i]; }
  atEnd() { return this.i >= this.T.length; }
  desc() { const t = this.tok; return t ? `"${this.src.slice(t.s, t.e)}"` : 'end of input'; }
  err(m) { return new Error(m || `Syntax error near ${this.desc()}`); }
  isKw(w, o = 0) { const t = this.T[this.i + o]; return !!t && t.k === 'id' && !t.q && t.u === w; }
  eatKw(w) { if (this.isKw(w)) { this.i++; return true; } return false; }
  expectKw(w) { if (!this.eatKw(w)) throw this.err(`Expected ${w} but found ${this.desc()}`); }
  isOp(v, o = 0) { const t = this.T[this.i + o]; return !!t && t.k === 'op' && t.v === v; }
  eatOp(v) { if (this.isOp(v)) { this.i++; return true; } return false; }
  expectOp(v) { if (!this.eatOp(v)) throw this.err(`Expected "${v}" but found ${this.desc()}`); }
  ident() { const t = this.tok; if (!t || t.k !== 'id') throw this.err(`Expected a name but found ${this.desc()}`); this.i++; return t.v; }
  text(a, b) { return this.src.slice(this.T[a].s, this.T[b - 1].e); }

  stmt() {
    if (this.isKw('WITH') || this.isKw('SELECT') || this.isOp('(')) return { t: 'query', q: this.query() };
    if (this.eatKw('CREATE')) return this.create();
    if (this.eatKw('INSERT') || (this.isKw('REPLACE') && (this.i++, true))) return this.insert();
    if (this.eatKw('UPDATE')) return this.update();
    if (this.eatKw('DELETE')) { this.expectKw('FROM'); const name = this.ident(); const where = this.eatKw('WHERE') ? this.expr() : null; return { t: 'delete', name, where }; }
    if (this.eatKw('DROP')) {
      const kind = this.isKw('VIEW') ? 'view' : 'table'; this.i++;
      let ifx = false; if (this.eatKw('IF')) { this.expectKw('EXISTS'); ifx = true; }
      return { t: 'drop', kind, name: this.ident(), ifx };
    }
    if (this.isKw('BEGIN') || this.isKw('COMMIT') || this.isKw('END') || this.isKw('ROLLBACK')) { this.i = this.T.length; return { t: 'noop' }; }
    throw this.err(`Unsupported statement: ${this.desc()}`);
  }
  create() {
    this.eatKw('TEMP') || this.eatKw('TEMPORARY');
    if (this.eatKw('UNIQUE')) { /* index */ }
    if (this.eatKw('INDEX')) { this.i = this.T.length; return { t: 'noop' }; }
    if (this.eatKw('VIEW')) { let ine = false; if (this.eatKw('IF')) { this.expectKw('NOT'); this.expectKw('EXISTS'); ine = true; } const name = this.ident(); this.expectKw('AS'); return { t: 'view', name, q: this.query(), ine }; }
    this.expectKw('TABLE');
    let ine = false; if (this.eatKw('IF')) { this.expectKw('NOT'); this.expectKw('EXISTS'); ine = true; }
    let name = this.ident(); if (this.eatOp('.')) name = this.ident();
    if (this.eatKw('AS')) return { t: 'ctas', name, q: this.query(), ine };
    this.expectOp('(');
    const cols = [];
    const skipItem = () => { let d = 0; while (!this.atEnd()) { if (this.isOp('(')) d++; else if (this.isOp(')')) { if (!d) return; d--; } else if (this.isOp(',') && !d) return; this.i++; } };
    for (;;) {
      if (['PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK', 'CONSTRAINT', 'KEY'].some((k) => this.isKw(k))) skipItem();
      else {
        const col = { name: this.ident(), type: '', pk: false, def: null };
        const words = [];
        while (this.tok && this.tok.k === 'id' && !['NOT', 'NULL', 'PRIMARY', 'REFERENCES', 'DEFAULT', 'UNIQUE', 'CHECK', 'CONSTRAINT', 'COLLATE', 'AUTOINCREMENT', 'AUTO_INCREMENT', 'GENERATED'].includes(this.tok.u)) {
          words.push(this.tok.v); this.i++;
          if (this.isOp('(')) { let d = 0; do { if (this.isOp('(')) d++; if (this.isOp(')')) d--; this.i++; } while (d && !this.atEnd()); }
        }
        col.type = words.join(' ');
        while (!this.atEnd() && !this.isOp(',') && !this.isOp(')')) {
          if (this.eatKw('PRIMARY')) { this.expectKw('KEY'); col.pk = true; }
          else if (this.eatKw('DEFAULT')) col.def = this.unary();
          else if (this.isOp('(')) skipItem();
          else this.i++;
        }
        cols.push(col);
      }
      if (this.eatOp(',')) continue;
      break;
    }
    this.expectOp(')');
    while (!this.atEnd()) this.i++;
    return { t: 'create', name, cols, ine };
  }
  insert() {
    let replace = false;
    if (this.eatKw('OR')) { replace = this.isKw('REPLACE'); this.i++; }
    this.expectKw('INTO');
    const name = this.ident(); let cols = null;
    if (this.isOp('(') && !this.isKw('SELECT', 1)) { this.i++; cols = [this.ident()]; while (this.eatOp(',')) cols.push(this.ident()); this.expectOp(')'); }
    if (this.eatKw('VALUES')) {
      const rows = [];
      do { this.expectOp('('); const r = [this.expr()]; while (this.eatOp(',')) r.push(this.expr()); this.expectOp(')'); rows.push(r); } while (this.eatOp(','));
      return { t: 'insert', name, cols, rows, replace };
    }
    return { t: 'insert', name, cols, q: this.query(), replace };
  }
  update() {
    const name = this.ident(); this.expectKw('SET');
    const sets = [];
    do { const c = this.ident(); this.expectOp('='); sets.push([c, this.expr()]); } while (this.eatOp(','));
    return { t: 'update', name, sets, where: this.eatKw('WHERE') ? this.expr() : null };
  }

  query() {
    let ctes = null;
    if (this.eatKw('WITH')) {
      if (this.isKw('RECURSIVE')) throw this.err('WITH RECURSIVE is not supported');
      ctes = [];
      do {
        const name = this.ident(); let cols = null;
        if (this.eatOp('(')) { cols = [this.ident()]; while (this.eatOp(',')) cols.push(this.ident()); this.expectOp(')'); }
        this.expectKw('AS'); this.expectOp('('); const q = this.query(); this.expectOp(')');
        ctes.push({ name, cols, q });
      } while (this.eatOp(','));
    }
    const parts = [this.core()], ops = [];
    while (this.isKw('UNION') || this.isKw('INTERSECT') || this.isKw('EXCEPT')) {
      let op = this.tok.u; this.i++;
      if (op === 'UNION' && this.eatKw('ALL')) op = 'UNION ALL';
      ops.push(op); parts.push(this.core());
    }
    let order = null, limit = null, offset = null;
    if (this.eatKw('ORDER')) {
      this.expectKw('BY'); order = [];
      do { const e = this.expr(); let desc = false; if (this.eatKw('DESC')) desc = true; else this.eatKw('ASC'); let nf = null; if (this.eatKw('NULLS')) nf = this.isKw('FIRST'), this.i++; order.push({ e, desc, nf }); } while (this.eatOp(','));
    }
    if (this.eatKw('LIMIT')) {
      limit = this.expr();
      if (this.eatKw('OFFSET')) offset = this.expr(); else if (this.eatOp(',')) { offset = limit; limit = this.expr(); }
    }
    return { ctes, parts, ops, order, limit, offset };
  }
  core() {
    if (this.eatOp('(')) { const q = this.query(); this.expectOp(')'); return { paren: q }; }
    this.expectKw('SELECT');
    const sel = { distinct: false, items: [], from: null, where: null, group: null, having: null };
    if (this.eatKw('DISTINCT')) sel.distinct = true; else this.eatKw('ALL');
    do {
      if (this.isOp('*')) { this.i++; sel.items.push({ star: true, q: null }); continue; }
      if (this.tok && this.tok.k === 'id' && this.isOp('.', 1) && this.isOp('*', 2)) { sel.items.push({ star: true, q: this.tok.v }); this.i += 3; continue; }
      const a = this.i, e = this.expr(), text = this.text(a, this.i);
      let alias = null;
      if (this.eatKw('AS')) alias = this.tok.k === 'str' ? this.T[this.i++].v : this.ident();
      else if (this.tok && (this.tok.k === 'id') && (this.tok.q || !SQL_RESERVED.has(this.tok.u))) alias = this.ident();
      sel.items.push({ e, alias, text });
    } while (this.eatOp(','));
    if (this.eatKw('FROM')) sel.from = this.fromClause();
    if (this.eatKw('WHERE')) sel.where = this.expr();
    if (this.eatKw('GROUP')) { this.expectKw('BY'); sel.group = [this.expr()]; while (this.eatOp(',')) sel.group.push(this.expr()); }
    if (this.eatKw('HAVING')) sel.having = this.expr();
    return sel;
  }
  alias() {
    if (this.eatKw('AS')) return this.ident();
    if (this.tok && this.tok.k === 'id' && (this.tok.q || !SQL_RESERVED.has(this.tok.u))) return this.ident();
    return null;
  }
  source() {
    if (this.eatOp('(')) {
      if (!(this.isKw('SELECT') || this.isKw('WITH') || this.isOp('('))) throw this.err('Only subqueries may be parenthesised in FROM');
      const q = this.query(); this.expectOp(')'); return { sub: q, alias: this.alias() };
    }
    let name = this.ident(); if (this.eatOp('.')) name = this.ident();
    return { name, alias: this.alias() };
  }
  fromClause() {
    const first = this.source(), joins = [];
    for (;;) {
      if (this.eatOp(',')) { joins.push({ type: 'cross', src: this.source() }); continue; }
      if (this.isKw('NATURAL')) throw this.err('NATURAL JOIN is not supported');
      let type = null;
      if (this.eatKw('INNER')) type = 'inner'; else if (this.eatKw('CROSS')) type = 'cross';
      else if (this.isKw('LEFT') || this.isKw('RIGHT') || this.isKw('FULL')) { type = this.tok.u.toLowerCase(); this.i++; this.eatKw('OUTER'); }
      if (!type && !this.isKw('JOIN')) break;
      this.expectKw('JOIN');
      const src = this.source(); let on = null, using = null;
      if (this.eatKw('ON')) on = this.expr();
      else if (this.eatKw('USING')) { this.expectOp('('); using = [this.ident()]; while (this.eatOp(',')) using.push(this.ident()); this.expectOp(')'); }
      joins.push({ type: type || 'inner', src, on, using });
    }
    return { first, joins };
  }

  expr() { return this.or(); }
  or() { let a = this.and(); while (this.eatKw('OR')) a = { t: 'bin', op: 'OR', a, b: this.and() }; return a; }
  and() { let a = this.not(); while (this.eatKw('AND')) a = { t: 'bin', op: 'AND', a, b: this.not() }; return a; }
  not() { if (this.isKw('NOT') && !this.isKw('EXISTS', 1)) { this.i++; return { t: 'un', op: 'NOT', a: this.not() }; } return this.cmp(); }
  cmp() {
    let a = this.add();
    for (;;) {
      const t = this.tok; if (!t) return a;
      if (t.k === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(t.v)) { this.i++; a = { t: 'bin', op: t.v, a, b: this.add() }; continue; }
      if (this.isKw('IS')) {
        this.i++; const neg = this.eatKw('NOT');
        if (this.eatKw('NULL')) a = { t: 'isnull', a, neg }; else a = { t: 'is', a, b: this.add(), neg };
        continue;
      }
      if (this.isKw('ISNULL')) { this.i++; a = { t: 'isnull', a, neg: false }; continue; }
      if (this.isKw('NOTNULL')) { this.i++; a = { t: 'isnull', a, neg: true }; continue; }
      let neg = false;
      if (this.isKw('NOT') && (this.isKw('IN', 1) || this.isKw('LIKE', 1) || this.isKw('GLOB', 1) || this.isKw('BETWEEN', 1))) { this.i++; neg = true; }
      if (this.eatKw('IN')) {
        this.expectOp('(');
        if (this.isKw('SELECT') || this.isKw('WITH')) { const q = this.query(); this.expectOp(')'); a = { t: 'in', a, q, neg }; }
        else { const list = []; if (!this.isOp(')')) { list.push(this.expr()); while (this.eatOp(',')) list.push(this.expr()); } this.expectOp(')'); a = { t: 'in', a, list, neg }; }
        continue;
      }
      if (this.isKw('LIKE') || this.isKw('GLOB')) {
        const glob = this.tok.u === 'GLOB'; this.i++;
        const p = this.add(); let esc = null; if (this.eatKw('ESCAPE')) esc = this.add();
        a = { t: 'like', a, p, esc, neg, glob }; continue;
      }
      if (this.eatKw('BETWEEN')) { const lo = this.add(); this.expectKw('AND'); const hi = this.add(); a = { t: 'between', a, lo, hi, neg }; continue; }
      if (neg) throw this.err();
      return a;
    }
  }
  add() { let a = this.mul(); while (this.isOp('+') || this.isOp('-')) { const op = this.tok.v; this.i++; a = { t: 'bin', op, a, b: this.mul() }; } return a; }
  mul() { let a = this.cat(); while (this.isOp('*') || this.isOp('/') || this.isOp('%')) { const op = this.tok.v; this.i++; a = { t: 'bin', op, a, b: this.cat() }; } return a; }
  cat() { let a = this.unary(); while (this.eatOp('||')) a = { t: 'bin', op: '||', a, b: this.unary() }; return a; }
  unary() {
    if (this.eatOp('-')) return { t: 'un', op: '-', a: this.unary() };
    if (this.eatOp('+')) return { t: 'un', op: '+', a: this.unary() };
    return this.primary();
  }
  primary() {
    const t = this.tok;
    if (!t) throw this.err('Unexpected end of expression');
    if (t.k === 'num') { this.i++; return { t: 'num', v: t.v }; }
    if (t.k === 'str') { this.i++; return { t: 'str', v: t.v }; }
    if (t.k === 'op' && t.v === '(') {
      this.i++;
      if (this.isKw('SELECT') || this.isKw('WITH')) { const q = this.query(); this.expectOp(')'); return { t: 'sub', q }; }
      const e = this.expr(); this.expectOp(')'); return e;
    }
    if (t.k === 'id' && !t.q) {
      switch (t.u) {
        case 'NULL': this.i++; return { t: 'null' };
        case 'TRUE': this.i++; return { t: 'num', v: 1 };
        case 'FALSE': this.i++; return { t: 'num', v: 0 };
        case 'CASE': {
          this.i++; const base = this.isKw('WHEN') ? null : this.expr(), whens = [];
          while (this.eatKw('WHEN')) { const c = this.expr(); this.expectKw('THEN'); whens.push([c, this.expr()]); }
          if (!whens.length) throw this.err('CASE needs at least one WHEN');
          const els = this.eatKw('ELSE') ? this.expr() : null; this.expectKw('END');
          return { t: 'case', base, whens, els };
        }
        case 'CAST': {
          this.i++; this.expectOp('('); const a = this.expr(); this.expectKw('AS');
          let ty = this.ident(); if (this.eatOp('(')) { while (!this.eatOp(')')) this.i++; }
          this.expectOp(')'); return { t: 'cast', a, type: ty.toUpperCase() };
        }
        case 'EXISTS': case 'NOT':
          if (t.u === 'NOT') { this.i++; this.expectKw('EXISTS'); this.expectOp('('); const q = this.query(); this.expectOp(')'); return { t: 'exists', q, neg: true }; }
          if (this.isOp('(', 1)) { this.i += 2; const q = this.query(); this.expectOp(')'); return { t: 'exists', q, neg: false }; }
      }
    }
    if (t.k === 'id') {
      if (this.isOp('(', 1) && !t.q) {
        const name = t.u; this.i += 2;
        const fn = { t: 'fn', name, args: [], distinct: false, star: false };
        if (this.eatOp('*')) fn.star = true;
        else if (!this.isOp(')')) { if (this.eatKw('DISTINCT')) fn.distinct = true; fn.args.push(this.expr()); while (this.eatOp(',')) fn.args.push(this.expr()); }
        this.expectOp(')');
        return fn;
      }
      if (!t.q && SQL_RESERVED.has(t.u)) throw this.err();
      this.i++;
      if (this.isOp('.') && this.T[this.i + 1] && this.T[this.i + 1].k === 'id') { this.i++; const n = this.ident(); return { t: 'col', q: t.v, n }; }
      return { t: 'col', q: null, n: t.v };
    }
    throw this.err();
  }
}

// ----- values -----
const isNumStr = (s) => /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(s);
const toNum = (v) => { if (v === null) return null; if (typeof v === 'number') return v; const m = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(v); return m ? parseFloat(m[0]) : 0; };
function fmtNum(n) {
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n > 0 ? 'Inf' : '-Inf';
  if (Number.isInteger(n)) return Object.is(n, -0) ? '0' : String(n);
  return String(parseFloat(n.toPrecision(15)));
}
const toStr = (v) => (v === null ? null : typeof v === 'number' ? fmtNum(v) : String(v));
const truthy = (v) => v !== null && (typeof v === 'number' ? v !== 0 : toNum(v) !== 0);
const rank = (v) => (v === null ? 0 : typeof v === 'number' ? 1 : 2);
function cmpOrder(a, b) {
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  return a < b ? -1 : a > b ? 1 : 0;
}
function cmpLoose(a, b) { // both non-null
  if (typeof a === 'number' && typeof b === 'string' && isNumStr(b)) b = parseFloat(b);
  else if (typeof b === 'number' && typeof a === 'string' && isNumStr(a)) a = parseFloat(a);
  return cmpOrder(a, b);
}
const keyOf = (v) => (v === null ? '\0n' : typeof v === 'number' ? 'n' + v : 's' + v);
const rowKey = (r) => r.map(keyOf).join('\u0001');
function likeToRe(p, esc, glob) {
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (!glob && esc && c === esc && i + 1 < p.length) { re += p[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
    if (glob) re += c === '*' ? '.*' : c === '?' ? '.' : c === '[' ? '[' : c === ']' ? ']' : c.replace(/[.+^${}()|\\]/g, '\\$&');
    else re += c === '%' ? '.*' : c === '_' ? '.' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', glob ? 's' : 'is');
}
function affinity(type, v) {
  if (v === null) return v;
  const t = String(type || '').toUpperCase();
  if (/INT/.test(t) || /REAL|FLOA|DOUB|NUM|DEC/.test(t)) { if (typeof v === 'string' && isNumStr(v)) return parseFloat(v); return v; }
  if (/CHAR|CLOB|TEXT/.test(t) && typeof v === 'number') return fmtNum(v);
  return v;
}

// ----- evaluation -----
function findCol(scope, q, n) {
  const key = (q || '') + '\0' + n;
  let v = scope.cache.get(key);
  if (v !== undefined) return v;
  const ql = q && q.toLowerCase(), nl = n.toLowerCase();
  let idx = -1, cnt = 0;
  scope.cols.forEach((c, i) => { if (c.n.toLowerCase() === nl && (!ql || (c.q || '').toLowerCase() === ql)) { if (idx < 0) idx = i; cnt++; } });
  if (cnt > 1) idx = -2;
  scope.cache.set(key, idx); return idx;
}
function colVal(e, c) {
  for (let k = c; k; k = k.outer) {
    const i = findCol(k.scope, e.q, e.n);
    if (i === -2) throw new Error(`ambiguous column name: ${e.q ? e.q + '.' : ''}${e.n}`);
    if (i >= 0) return k.row[i];
  }
  throw new Error(`no such column: ${e.q ? e.q + '.' : ''}${e.n}`);
}
function kids(e) {
  switch (e.t) {
    case 'bin': return [e.a, e.b];
    case 'un': case 'isnull': case 'cast': return [e.a];
    case 'is': return [e.a, e.b];
    case 'fn': return e.args;
    case 'case': return [e.base, ...e.whens.flat(), e.els].filter(Boolean);
    case 'in': return [e.a, ...(e.list || [])];
    case 'between': return [e.a, e.lo, e.hi];
    case 'like': return [e.a, e.p, e.esc].filter(Boolean);
    default: return [];
  }
}
function hasAgg(e) {
  if (e._ha !== undefined) return e._ha;
  const isA = e.t === 'fn' && AGG.has(e.name) && !(e.args.length > 1 && (e.name === 'MIN' || e.name === 'MAX'));
  return (e._ha = isA || kids(e).some(hasAgg));
}
const isAggFn = (e) => AGG.has(e.name) && !(e.args.length > 1 && (e.name === 'MIN' || e.name === 'MAX'));
function runSub(e, c) {
  if (e._res) return e._res;
  if (!e._corr) {
    try { return (e._res = execQuery(e.q, c.env, null)); } catch (err) { if (/^(no such column|ambiguous)/.test(err.message)) e._corr = true; else throw err; }
  }
  return execQuery(e.q, c.env, c);
}
const roundTo = (x, d) => { const m = 10 ** d; return (Math.sign(x) * Math.round(Math.abs(x) * m)) / m; };
const caseMap = (s, up) => [...s].map((c) => { const u = up ? c.toUpperCase() : c.toLowerCase(); return [...u].length === 1 ? u : c; }).join('');
const FN = {
  UPPER: ([a]) => (a === null ? null : caseMap(toStr(a), true)),
  LOWER: ([a]) => (a === null ? null : caseMap(toStr(a), false)),
  LENGTH: ([a]) => (a === null ? null : [...toStr(a)].length),
  SUBSTR: ([a, y, z]) => {
    if (a === null || y === null) return null;
    const s = [...toStr(a)], L = s.length; y = Math.trunc(toNum(y));
    let zz = z === undefined ? Infinity : z === null ? null : Math.trunc(toNum(z));
    if (zz === null) return null;
    if (y < 0) y = L + y + 1;
    let b = y, e = y + zz;
    if (zz < 0) { e = y; b = y + zz; }
    b = Math.max(b, 1); e = Math.min(e, L + 1);
    return e > b ? s.slice(b - 1, e - 1).join('') : '';
  },
  COALESCE: (a) => { for (const v of a) if (v !== null) return v; return null; },
  IFNULL: ([a, b]) => (a !== null ? a : b),
  NULLIF: ([a, b]) => (a !== null && b !== null && cmpLoose(a, b) === 0 ? null : a),
  ROUND: ([a, d]) => (a === null ? null : roundTo(toNum(a), d === undefined || d === null ? 0 : Math.max(0, Math.trunc(toNum(d))))),
  ABS: ([a]) => (a === null ? null : Math.abs(toNum(a))),
  TRIM: ([a, c]) => trimStr(a, c, 3), LTRIM: ([a, c]) => trimStr(a, c, 1), RTRIM: ([a, c]) => trimStr(a, c, 2),
  REPLACE: ([a, b, c]) => (a === null || b === null || c === null ? null : toStr(b) === '' ? toStr(a) : toStr(a).split(toStr(b)).join(toStr(c))),
  INSTR: ([a, b]) => (a === null || b === null ? null : toStr(a).indexOf(toStr(b)) + 1),
  TYPEOF: ([a]) => (a === null ? 'null' : typeof a === 'number' ? (Number.isInteger(a) ? 'integer' : 'real') : 'text'),
  IIF: ([c, a, b]) => (truthy(c) ? a : b),
  FLOOR: ([a]) => (a === null ? null : Math.floor(toNum(a))), CEIL: ([a]) => (a === null ? null : Math.ceil(toNum(a))), CEILING: ([a]) => (a === null ? null : Math.ceil(toNum(a))),
  SQRT: ([a]) => (a === null ? null : toNum(a) < 0 ? null : Math.sqrt(toNum(a))),
  POWER: ([a, b]) => (a === null || b === null ? null : toNum(a) ** toNum(b)), POW: ([a, b]) => (a === null || b === null ? null : toNum(a) ** toNum(b)),
  MOD: ([a, b]) => (a === null || b === null || toNum(b) === 0 ? null : toNum(a) % toNum(b)),
  SIGN: ([a]) => (a === null ? null : Math.sign(toNum(a))),
  CONCAT: (a) => a.map((v) => (v === null ? '' : toStr(v))).join(''),
  CONCAT_WS: ([s, ...a]) => (s === null ? null : a.filter((v) => v !== null).map(toStr).join(toStr(s))),
  MIN: (a) => (a.includes(null) ? null : a.reduce((x, y) => (cmpOrder(y, x) < 0 ? y : x))),
  MAX: (a) => (a.includes(null) ? null : a.reduce((x, y) => (cmpOrder(y, x) > 0 ? y : x))),
};
function trimStr(a, c, mode) {
  if (a === null) return null;
  const s = toStr(a), set = c === undefined || c === null ? ' ' : toStr(c);
  let i = 0, j = s.length;
  if (mode & 1) while (i < j && set.includes(s[i])) i++;
  if (mode & 2) while (j > i && set.includes(s[j - 1])) j--;
  return s.slice(i, j);
}
function ev(e, c) {
  switch (e.t) {
    case 'num': case 'str': return e.v;
    case 'null': return null;
    case 'col': return colVal(e, c);
    case 'un': {
      const v = ev(e.a, c);
      if (e.op === '+') return v;
      if (e.op === '-') return v === null ? null : -toNum(v);
      return v === null ? null : truthy(v) ? 0 : 1;
    }
    case 'bin': {
      const op = e.op;
      if (op === 'AND') { const l = ev(e.a, c); if (l !== null && !truthy(l)) return 0; const r = ev(e.b, c); if (r !== null && !truthy(r)) return 0; return l === null || r === null ? null : 1; }
      if (op === 'OR') { const l = ev(e.a, c); if (l !== null && truthy(l)) return 1; const r = ev(e.b, c); if (r !== null && truthy(r)) return 1; return l === null || r === null ? null : 0; }
      const a = ev(e.a, c), b = ev(e.b, c);
      if (a === null || b === null) return null;
      switch (op) {
        case '=': return cmpLoose(a, b) === 0 ? 1 : 0;
        case '<>': return cmpLoose(a, b) !== 0 ? 1 : 0;
        case '<': return cmpLoose(a, b) < 0 ? 1 : 0;
        case '>': return cmpLoose(a, b) > 0 ? 1 : 0;
        case '<=': return cmpLoose(a, b) <= 0 ? 1 : 0;
        case '>=': return cmpLoose(a, b) >= 0 ? 1 : 0;
        case '||': return toStr(a) + toStr(b);
        case '+': return toNum(a) + toNum(b);
        case '-': return toNum(a) - toNum(b);
        case '*': return toNum(a) * toNum(b);
        case '/': return toNum(b) === 0 ? null : toNum(a) / toNum(b);
        case '%': return toNum(b) === 0 ? null : toNum(a) % toNum(b);
      }
      throw new Error('Unknown operator ' + op);
    }
    case 'isnull': { const n = ev(e.a, c) === null; return (e.neg ? !n : n) ? 1 : 0; }
    case 'is': { const a = ev(e.a, c), b = ev(e.b, c); const eq = a === null || b === null ? a === b : cmpLoose(a, b) === 0; return (e.neg ? !eq : eq) ? 1 : 0; }
    case 'in': {
      const v = ev(e.a, c); if (v === null) return null;
      const vals = e.q ? runSub(e, c).rows.map((r) => r[0]) : e.list.map((x) => ev(x, c));
      let found = false, sawNull = false;
      for (const x of vals) { if (x === null) sawNull = true; else if (cmpLoose(v, x) === 0) { found = true; break; } }
      if (found) return e.neg ? 0 : 1;
      return sawNull ? null : e.neg ? 1 : 0;
    }
    case 'between': {
      const v = ev(e.a, c), lo = ev(e.lo, c), hi = ev(e.hi, c);
      const ge = v === null || lo === null ? null : cmpLoose(v, lo) >= 0 ? 1 : 0, le = v === null || hi === null ? null : cmpLoose(v, hi) <= 0 ? 1 : 0;
      let r = ge === 0 || le === 0 ? 0 : ge === null || le === null ? null : 1;
      if (r !== null && e.neg) r = 1 - r; return r;
    }
    case 'like': {
      const v = ev(e.a, c), p = ev(e.p, c); if (v === null || p === null) return null;
      const esc = e.esc ? ev(e.esc, c) : null;
      const m = likeToRe(toStr(p), esc === null ? null : toStr(esc), e.glob).test(toStr(v));
      return (e.neg ? !m : m) ? 1 : 0;
    }
    case 'case': {
      const base = e.base ? ev(e.base, c) : undefined;
      for (const [w, r] of e.whens) {
        const wv = ev(w, c);
        if (base === undefined ? truthy(wv) : base !== null && wv !== null && cmpLoose(base, wv) === 0) return ev(r, c);
      }
      return e.els ? ev(e.els, c) : null;
    }
    case 'cast': {
      const v = ev(e.a, c); if (v === null) return null;
      const t = e.type;
      if (/INT/.test(t)) return Math.trunc(toNum(v));
      if (/REAL|FLOA|DOUB|NUM|DEC/.test(t)) return toNum(v);
      if (/CHAR|TEXT|CLOB|STRING/.test(t)) return toStr(v);
      return v;
    }
    case 'exists': { const n = runSub(e, c).rows.length > 0; return (e.neg ? !n : n) ? 1 : 0; }
    case 'sub': { const r = runSub(e, c); return r.rows.length ? r.rows[0][0] : null; }
    case 'fn': {
      if (isAggFn(e)) return evalAgg(e, c);
      const fn = FN[e.name === 'SUBSTRING' ? 'SUBSTR' : e.name];
      if (!fn) throw new Error(`no such function: ${e.name.toLowerCase()}`);
      return fn(e.args.map((a) => ev(a, c)));
    }
  }
  throw new Error('Cannot evaluate ' + e.t);
}
function evalAgg(e, c) {
  if (!c.group) throw new Error(`misuse of aggregate function ${e.name.toLowerCase()}()`);
  const g = c.group;
  if (e.name === 'COUNT' && e.star) return g.length;
  if (!e.args.length) throw new Error(`wrong number of arguments to function ${e.name.toLowerCase()}()`);
  let vals = g.map((r) => ev(e.args[0], { scope: c.scope, row: r, group: null, outer: c.outer, env: c.env })).filter((v) => v !== null);
  if (e.distinct) { const seen = new Set(); vals = vals.filter((v) => { const k = keyOf(v); if (seen.has(k)) return false; seen.add(k); return true; }); }
  switch (e.name) {
    case 'COUNT': return vals.length;
    case 'SUM': return vals.length ? vals.reduce((s, v) => s + toNum(v), 0) : null;
    case 'TOTAL': return vals.reduce((s, v) => s + toNum(v), 0);
    case 'AVG': return vals.length ? vals.reduce((s, v) => s + toNum(v), 0) / vals.length : null;
    case 'MIN': return vals.length ? vals.reduce((x, y) => (cmpOrder(y, x) < 0 ? y : x)) : null;
    case 'MAX': return vals.length ? vals.reduce((x, y) => (cmpOrder(y, x) > 0 ? y : x)) : null;
    case 'GROUP_CONCAT': {
      const sep = e.args[1] && g.length ? toStr(ev(e.args[1], { scope: c.scope, row: g[0], group: null, outer: c.outer, env: c.env })) : ',';
      return vals.length ? vals.map(toStr).join(sep) : null;
    }
  }
  throw new Error('Unknown aggregate ' + e.name);
}

const MAX_ROWS = 2e6;
function srcData(src, env, outer) {
  if (src.sub) {
    const r = execQuery(src.sub, env, outer);
    return { cols: r.cols.map((n) => ({ q: src.alias, n })), rows: r.rows };
  }
  const key = src.name.toLowerCase();
  const q = src.alias || src.name;
  if (env.ctes && env.ctes.has(key)) { const r = env.ctes.get(key); return { cols: r.cols.map((n) => ({ q, n })), rows: r.rows }; }
  if (env.db.views.has(key)) { const r = execQuery(env.db.views.get(key), env, null); return { cols: r.cols.map((n) => ({ q, n })), rows: r.rows }; }
  const t = env.db.tables.get(key);
  if (!t) throw new Error(`no such table: ${src.name}`);
  return { cols: t.cols.map((c) => ({ q, n: c.name })), rows: t.rows };
}
function execFrom(fr, env, outer) {
  let left = srcData(fr.first, env, outer);
  for (const j of fr.joins) {
    const right = srcData(j.src, env, outer);
    const cols = left.cols.concat(right.cols), scope = { cols, cache: new Map() }, ln = left.cols.length;
    let test = () => true;
    if (j.on) test = (row) => truthy(ev(j.on, { scope, row, group: null, outer, env }));
    else if (j.using) {
      const pairs = j.using.map((u) => {
        const a = left.cols.findIndex((c) => c.n.toLowerCase() === u.toLowerCase()), b = right.cols.findIndex((c) => c.n.toLowerCase() === u.toLowerCase());
        if (a < 0 || b < 0) throw new Error(`cannot join using column ${u} - column not present in both tables`);
        return [a, ln + b];
      });
      test = (row) => pairs.every(([a, b]) => row[a] !== null && row[b] !== null && cmpLoose(row[a], row[b]) === 0);
    }
    const rows = [], hit = new Array(right.rows.length).fill(false), nullR = right.cols.map(() => null), nullL = left.cols.map(() => null);
    for (const l of left.rows) {
      let any = false;
      for (let ri = 0; ri < right.rows.length; ri++) {
        const row = l.concat(right.rows[ri]);
        if (test(row)) { rows.push(row); any = true; hit[ri] = true; }
      }
      if (rows.length > MAX_ROWS) throw new Error('Join result too large');
      if (!any && (j.type === 'left' || j.type === 'full')) rows.push(l.concat(nullR));
    }
    if (j.type === 'right' || j.type === 'full') right.rows.forEach((r, ri) => { if (!hit[ri]) rows.push(nullL.concat(r)); });
    left = { cols, rows };
  }
  return left;
}
function sortEntries(entries, terms, keyFn) {
  const keyed = entries.map((en) => ({ en, k: terms.map((t, i) => keyFn(t, en, i)) }));
  keyed.sort((a, b) => {
    for (let i = 0; i < terms.length; i++) {
      const x = a.k[i], y = b.k[i];
      if (x === null || y === null) {
        if (x === y) continue;
        const nullFirst = terms[i].nf != null ? terms[i].nf : !terms[i].desc;
        return (x === null) === nullFirst ? -1 : 1;
      }
      const d = cmpOrder(x, y);
      if (d) return terms[i].desc ? -d : d;
    }
    return 0;
  });
  return keyed.map((k) => k.en);
}
const constEnv = (env) => ({ scope: { cols: [], cache: new Map() }, row: [], group: null, outer: null, env });
function execCore(sel, env, outer, ol) {
  if (sel.paren) return execQuery(sel.paren, env, outer);
  const ds = sel.from ? execFrom(sel.from, env, outer) : { cols: [], rows: [[]] };
  const scope = { cols: ds.cols, cache: new Map() };
  const mk = (row, group) => ({ scope, row, group, outer, env });
  let rows = ds.rows;
  if (sel.where) rows = rows.filter((r) => truthy(ev(sel.where, mk(r, null))));
  const items = [];
  for (const it of sel.items) {
    if (it.star) {
      const cs = ds.cols.filter((c) => !it.q || (c.q || '').toLowerCase() === it.q.toLowerCase());
      if (!cs.length) throw new Error(it.q ? `no such table: ${it.q}` : 'SELECT * with no tables specified');
      for (const c of cs) items.push({ e: { t: 'col', q: c.q, n: c.n }, name: c.n });
    } else items.push({ e: it.e, name: it.alias || (it.e.t === 'col' ? it.e.n : it.text) });
  }
  const orderAgg = ol && ol.order && ol.order.some((t) => hasAgg(t.e));
  const grouped = sel.group || sel.having || items.some((i) => hasAgg(i.e)) || orderAgg;
  let entries = [];
  if (grouped) {
    const gexprs = (sel.group || []).map((g) => {
      if (g.t === 'num' && Number.isInteger(g.v) && items[g.v - 1]) return items[g.v - 1].e;
      if (g.t === 'col' && !g.q && findCol(scope, null, g.n) === -1) { const it = items.find((i) => i.name.toLowerCase() === g.n.toLowerCase()); if (it) return it.e; }
      return g;
    });
    const groups = new Map();
    for (const r of rows) {
      const k = gexprs.map((g) => keyOf(ev(g, mk(r, null)))).join('\u0001');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    if (!sel.group && !groups.size) groups.set('', []);
    for (const g of groups.values()) {
      const ctx = mk(g[0] || ds.cols.map(() => null), g);
      if (sel.having && !truthy(ev(sel.having, ctx))) continue;
      entries.push({ out: items.map((i) => ev(i.e, ctx)), ctx });
    }
  } else entries = rows.map((r) => { const ctx = mk(r, null); return { out: items.map((i) => ev(i.e, ctx)), ctx }; });
  if (sel.distinct) { const seen = new Set(); entries = entries.filter((en) => { const k = rowKey(en.out); if (seen.has(k)) return false; seen.add(k); return true; }); }
  const names = items.map((i) => i.name);
  if (ol && ol.order) {
    entries = sortEntries(entries, ol.order, (t, en) => {
      const e = t.e;
      if (e.t === 'num' && Number.isInteger(e.v)) { if (e.v < 1 || e.v > names.length) throw new Error(`ORDER BY term out of range - should be between 1 and ${names.length}`); return en.out[e.v - 1]; }
      if (e.t === 'col' && !e.q) { const i = names.findIndex((n) => n.toLowerCase() === e.n.toLowerCase()); if (i >= 0) return en.out[i]; }
      return ev(e, en.ctx);
    });
  }
  return { cols: names, rows: entries.map((en) => en.out), entries };
}
function applyLimit(res, q, env) {
  let rows = res.rows;
  const lim = q.limit ? toNum(ev(q.limit, constEnv(env))) : null, off = q.offset ? toNum(ev(q.offset, constEnv(env))) : 0;
  if (off) rows = rows.slice(Math.max(0, off));
  if (lim !== null && lim >= 0) rows = rows.slice(0, lim);
  return { cols: res.cols, rows };
}
function execQuery(q, env, outer) {
  if (q.ctes) {
    env = { db: env.db, ctes: new Map(env.ctes || []) };
    for (const c of q.ctes) {
      const r = execQuery(c.q, env, null);
      env.ctes.set(c.name.toLowerCase(), { cols: c.cols || r.cols, rows: r.rows });
    }
  }
  if (q.parts.length === 1) {
    const r = execCore(q.parts[0], env, outer, q);
    return applyLimit(r, q, env);
  }
  let acc = execCore(q.parts[0], env, outer, null);
  const cols = acc.cols; let rows = acc.rows;
  q.ops.forEach((op, i) => {
    const r = execCore(q.parts[i + 1], env, outer, null);
    if (r.cols.length !== cols.length) throw new Error('SELECTs to the left and right of ' + op + ' do not have the same number of result columns');
    const dd = (rs) => { const s = new Set(); return rs.filter((x) => { const k = rowKey(x); if (s.has(k)) return false; s.add(k); return true; }); };
    if (op === 'UNION ALL') rows = rows.concat(r.rows);
    else if (op === 'UNION') rows = dd(rows.concat(r.rows));
    else { const rk = new Set(r.rows.map(rowKey)); rows = dd(rows.filter((x) => (op === 'INTERSECT') === rk.has(rowKey(x)))); }
  });
  if (q.order) {
    const scope = { cols: cols.map((n) => ({ q: null, n })), cache: new Map() };
    const entries = rows.map((out) => ({ out, ctx: { scope, row: out, group: null, outer: null, env } }));
    rows = sortEntries(entries, q.order, (t, en) => {
      const e = t.e;
      if (e.t === 'num' && Number.isInteger(e.v)) { if (e.v < 1 || e.v > cols.length) throw new Error('ORDER BY term out of range'); return en.out[e.v - 1]; }
      return ev(e, en.ctx);
    }).map((en) => en.out);
  }
  return applyLimit({ cols, rows }, q, env);
}

// ----- database + statements -----
const newDb = () => ({ tables: new Map(), views: new Map() });
function getTable(db, name) { const t = db.tables.get(name.toLowerCase()); if (!t) throw new Error(`no such table: ${name}`); return t; }
function insertRows(t, colNames, valueRows, replace) {
  const idx = colNames ? colNames.map((n) => { const i = t.cols.findIndex((c) => c.name.toLowerCase() === n.toLowerCase()); if (i < 0) throw new Error(`table ${t.name} has no column named ${n}`); return i; }) : t.cols.map((_, i) => i);
  let n = 0;
  for (const vr of valueRows) {
    if (vr.length !== idx.length) throw new Error(`${vr.length} values for ${idx.length} columns`);
    const row = t.cols.map((c) => (c.def ? ev(c.def, constEnv({ db: null })) : null));
    idx.forEach((ci, k) => { row[ci] = vr[k]; });
    t.cols.forEach((c, i) => {
      if (row[i] === null && c.pk && /^INTEGER$/i.test(c.type)) row[i] = t.rows.reduce((m, r) => Math.max(m, typeof r[i] === 'number' ? r[i] : 0), 0) + 1;
      row[i] = affinity(c.type, row[i]);
    });
    const pki = t.cols.findIndex((c) => c.pk);
    if (replace && pki >= 0) { const ex = t.rows.findIndex((r) => r[pki] !== null && r[pki] === row[pki]); if (ex >= 0) t.rows.splice(ex, 1); }
    t.rows.push(row); n++;
  }
  return n;
}
function execStmt(db, st) {
  const env = { db, ctes: null };
  switch (st.t) {
    case 'query': { const r = execQuery(st.q, env, null); return { kind: 'rows', cols: r.cols, rows: r.rows }; }
    case 'noop': return { kind: 'msg', msg: 'OK' };
    case 'create': {
      const key = st.name.toLowerCase();
      if (db.tables.has(key)) { if (st.ine) return { kind: 'msg', msg: `Table ${st.name} already exists (skipped)` }; throw new Error(`table ${st.name} already exists`); }
      db.tables.set(key, { name: st.name, cols: st.cols, rows: [] });
      return { kind: 'msg', msg: `Created table ${st.name} (${st.cols.length} columns)` };
    }
    case 'ctas': {
      const key = st.name.toLowerCase();
      if (db.tables.has(key)) { if (st.ine) return { kind: 'msg', msg: `Table ${st.name} already exists (skipped)` }; throw new Error(`table ${st.name} already exists`); }
      const r = execQuery(st.q, env, null);
      db.tables.set(key, { name: st.name, cols: r.cols.map((name) => ({ name, type: '', pk: false, def: null })), rows: r.rows.map((x) => x.slice()) });
      return { kind: 'msg', msg: `Created table ${st.name} with ${r.rows.length} rows` };
    }
    case 'view': db.views.set(st.name.toLowerCase(), st.q); return { kind: 'msg', msg: `Created view ${st.name}` };
    case 'drop': {
      const m = st.kind === 'view' ? db.views : db.tables;
      if (!m.delete(st.name.toLowerCase()) && !st.ifx) throw new Error(`no such ${st.kind}: ${st.name}`);
      return { kind: 'msg', msg: `Dropped ${st.kind} ${st.name}` };
    }
    case 'insert': {
      const t = getTable(db, st.name);
      const vrs = st.rows ? st.rows.map((r) => r.map((e) => ev(e, constEnv(env)))) : execQuery(st.q, env, null).rows;
      return { kind: 'msg', msg: `Inserted ${insertRows(t, st.cols, vrs, st.replace)} row(s) into ${t.name}` };
    }
    case 'update': {
      const t = getTable(db, st.name), scope = { cols: t.cols.map((c) => ({ q: t.name, n: c.name })), cache: new Map() };
      const sets = st.sets.map(([c, e]) => { const i = t.cols.findIndex((x) => x.name.toLowerCase() === c.toLowerCase()); if (i < 0) throw new Error(`no such column: ${c}`); return [i, e]; });
      let n = 0;
      t.rows = t.rows.map((row) => {
        const ctx = { scope, row, group: null, outer: null, env };
        if (st.where && !truthy(ev(st.where, ctx))) return row;
        const nr = row.slice(); for (const [i, e] of sets) nr[i] = affinity(t.cols[i].type, ev(e, ctx)); n++; return nr;
      });
      return { kind: 'msg', msg: `Updated ${n} row(s) in ${t.name}` };
    }
    case 'delete': {
      const t = getTable(db, st.name), scope = { cols: t.cols.map((c) => ({ q: t.name, n: c.name })), cache: new Map() };
      const before = t.rows.length;
      t.rows = st.where ? t.rows.filter((row) => !truthy(ev(st.where, { scope, row, group: null, outer: null, env }))) : [];
      return { kind: 'msg', msg: `Deleted ${before - t.rows.length} row(s) from ${t.name}` };
    }
  }
  throw new Error('Unsupported statement');
}
function sqlRun(db, src) {
  const T = sqlLex(src), stmts = [[]];
  for (const t of T) { if (t.k === 'op' && t.v === ';') stmts.push([]); else stmts[stmts.length - 1].push(t); }
  const out = [], list = stmts.filter((s) => s.length);
  list.forEach((toks, n) => {
    try {
      const p = new SqlParser(toks, src), st = p.stmt();
      if (!p.atEnd()) throw p.err();
      out.push(execStmt(db, st));
    } catch (e) { throw new Error(list.length > 1 ? `Statement ${n + 1}: ${e.message}` : e.message); }
  });
  return out;
}

// ----- CSV/JSON loading + output -----
function parseCsv(s) {
  s = String(s).replace(/^﻿/, '');
  const first = s.split('\n')[0] || '';
  const delim = [',', '\t', ';', '|'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cur = '', q = false, i = 0, any = false;
  for (; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"' && cur === '') { q = true; any = true; } else if (c === delim) { row.push(cur); cur = ''; any = true; } else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; if (any || cur !== '') { row.push(cur); rows.push(row); } row = []; cur = ''; any = false; } else { cur += c; any = true; }
  }
  if (q) throw new Error('Unterminated quote in CSV');
  if (any || cur !== '') { row.push(cur); rows.push(row); }
  return rows;
}
const inferCell = (s) => { if (s === '') return null; const t = s.trim(); return /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(t) && t.length < 16 ? parseFloat(t) : s; };
function addTable(db, name, header, rows) {
  const seen = new Map();
  const cols = header.map((h, i) => { let n = String(h).trim() || 'col' + (i + 1); const k = n.toLowerCase(); if (seen.has(k)) { const c = seen.get(k) + 1; seen.set(k, c); n += '_' + c; } else seen.set(k, 1); return { name: n, type: '', pk: false, def: null }; });
  db.tables.set(name.toLowerCase(), { name, cols, rows: rows.map((r) => cols.map((_, i) => (r[i] === undefined ? null : r[i]))) });
}
function loadBlocks(db, text) {
  const log = [];
  const blocks = String(text).split(/^\s*-{3,}\s*$/m).map((b) => b.trim()).filter(Boolean);
  let n = 0;
  for (const b0 of blocks) {
    let b = b0, name = null;
    const m = b.match(/^--\s*name\s*:\s*(\S+)\s*\n?/i) || b.match(/^#\s*name\s*:\s*(\S+)\s*\n?/i);
    if (m) { name = m[1]; b = b.slice(m[0].length).trim(); }
    if (/^(create|insert|drop|with|select|update|delete|replace)\b/i.test(b)) { sqlRun(db, b); continue; }
    n++;
    let header, rows;
    if (/^[[{]/.test(b)) {
      let j; try { j = JSON.parse(b); } catch (e) { throw new Error(`Table ${n}: invalid JSON (${e.message})`); }
      if (!Array.isArray(j)) j = [j];
      if (j.length && Array.isArray(j[0])) { header = j[0].map(String); rows = j.slice(1); }
      else { header = []; for (const o of j) { if (o === null || typeof o !== 'object') throw new Error(`Table ${n}: JSON must be an array of objects`); for (const k of Object.keys(o)) if (!header.includes(k)) header.push(k); } rows = j.map((o) => header.map((k) => { const v = o[k]; return v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? +v : v; })); }
    } else {
      const all = parseCsv(b); if (!all.length) continue;
      header = all[0]; rows = all.slice(1).map((r) => r.map(inferCell));
    }
    addTable(db, 't' + n, header, rows);
    if (name) addTable(db, name, header, rows);
    log.push(`Loaded t${n}${name ? ' (' + name + ')' : ''}: ${rows.length} rows, columns: ${header.join(', ')}`);
  }
  return log;
}
const csvCell = (v) => { if (v === null) return ''; const s = toStr(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCsv = (r) => [r.cols.map(csvCell).join(','), ...r.rows.map((x) => x.map(csvCell).join(','))].join('\n');
function textTable(r) {
  const cell = (v) => (v === null ? 'NULL' : toStr(v).replace(/\n/g, '\\n'));
  const body = r.rows.map((x) => x.map(cell));
  const w = r.cols.map((c, i) => Math.max([...c].length, ...body.map((x) => [...x[i]].length)));
  const line = (a) => '| ' + a.map((s, i) => s + ' '.repeat(w[i] - [...s].length)).join(' | ') + ' |';
  const sep = '+' + w.map((n) => '-'.repeat(n + 2)).join('+') + '+';
  return [sep, line(r.cols), sep, ...body.map(line), sep, `(${r.rows.length} row${r.rows.length === 1 ? '' : 's'})`].join('\n');
}
function sqlTool(data, query, o = {}) {
  const db = newDb(), log = loadBlocks(db, data);
  if (!String(query).trim()) throw new Error('Enter a SQL query in the second box');
  const res = sqlRun(db, query);
  const parts = [...(o.showLoad === false ? [] : log.map((l) => '-- ' + l))];
  let last = null;
  for (const r of res) { if (r.kind === 'rows') { last = r; parts.push(textTable(r)); } else parts.push('-- ' + r.msg); }
  const out = { text: parts.join('\n\n') };
  if (last) {
    const csv = toCsv(last);
    if (o.csv !== false) out.text += '\n\n-- CSV (last result) --\n' + csv;
    out.blob = new Blob([csv], { type: 'text/csv' }); out.filename = 'result.csv';
  }
  return out;
}
export const _sql = { newDb, sqlRun, loadBlocks, toCsv, textTable, parseCsv, mermaidToSvg: (s, o) => mermaidToSvg(s, o) };

// ---------- Graphviz DOT subset ----------
function dotLex(src) {
  const T = []; let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; continue; }
    if (c === '#' && (i === 0 || src[i - 1] === '\n')) { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '"') {
      let j = i + 1, s = '';
      for (;;) { if (j >= n) throw new Error('Unterminated string in DOT'); if (src[j] === '\\' && src[j + 1] === '"') { s += '"'; j += 2; } else if (src[j] === '"') break; else s += src[j++]; }
      T.push({ k: 'id', v: s, q: true }); i = j + 1; continue;
    }
    if (c === '<') throw new Error('HTML-like labels (<...>) are not supported');
    if ((c === '-' && (src[i + 1] === '>' || src[i + 1] === '-'))) { T.push({ k: 'edge', v: src.slice(i, i + 2) }); i += 2; continue; }
    let m = /^-?(?:\.\d+|\d+(?:\.\d*)?)/.exec(src.slice(i, i + 40)) || /^[A-Za-z_\u0080-￿][\w\u0080-￿]*/.exec(src.slice(i, i + 200));
    if (m) { T.push({ k: 'id', v: m[0] }); i += m[0].length; continue; }
    if ('{}[];=,:+'.includes(c)) { T.push({ k: 'p', v: c }); i++; continue; }
    throw new Error(`Unexpected character "${c}" in DOT`);
  }
  return T;
}
const DOT_SHAPES = { box: 'rect', rect: 'rect', rectangle: 'rect', square: 'rect', record: 'rect', mrecord: 'round', ellipse: 'ellipse', oval: 'ellipse', circle: 'circle', doublecircle: 'circle', diamond: 'diamond', mdiamond: 'diamond', hexagon: 'hexagon', cylinder: 'cylinder', plaintext: 'none', plain: 'none', none: 'none', parallelogram: 'parallelogram', egg: 'ellipse', note: 'rect', tab: 'rect', folder: 'rect', component: 'rect', box3d: 'rect', octagon: 'hexagon', invhouse: 'rect', house: 'rect', triangle: 'diamond' };
const DOT_ARROWS = { normal: 'arrow', vee: 'arrow', open: 'arrow', empty: 'tri', onormal: 'tri', diamond: 'dia', odiamond: 'odia', ediamond: 'odia', dot: 'circle', odot: 'circle', inv: 'arrow', crow: 'many', tee: 'one', none: '' };
function parseDot(src) {
  const T = dotLex(src); let i = 0;
  const isP = (v) => T[i] && T[i].k === 'p' && T[i].v === v;
  const isKw = (w) => T[i] && T[i].k === 'id' && !T[i].q && T[i].v.toLowerCase() === w;
  const fail = (m) => new Error(m || `DOT syntax error near "${T[i] ? T[i].v : 'end of input'}"`);
  if (isKw('strict')) i++;
  let directed;
  if (isKw('digraph')) directed = true; else if (isKw('graph')) directed = false; else throw fail('Expected "graph" or "digraph"');
  i++;
  if (T[i] && T[i].k === 'id') i++;
  if (!isP('{')) throw fail(); i++;
  const M = newModel('TB'), gattrs = {};
  const val = () => { if (!T[i] || T[i].k !== 'id') throw fail(); let v = T[i++].v; while (isP('+') && T[i + 1]) { i++; v += T[i++].v; } return v; };
  const attrList = () => {
    const a = {};
    while (isP('[')) {
      i++;
      while (!isP(']')) {
        if (!T[i]) throw fail('Unclosed [ ]');
        if (isP(',') || isP(';')) { i++; continue; }
        const k = val(); let v = 'true'; if (isP('=')) { i++; v = val(); }
        a[k.toLowerCase()] = v;
      }
      i++;
    }
    return a;
  };
  let anon = 0;
  const ensure = (id, sc) => {
    let n = M.nodes.get(id);
    if (!n) n = addNode(M, id, { dot: { ...sc.node }, group: sc.group });
    else if (!n.group && sc.group) n.group = sc.group;
    sc.seen.push(id); return id;
  };
  function endpoint(sc) {
    if (isKw('subgraph') || isP('{')) return subgraph(sc);
    const id = val();
    if (isP(':')) { i++; val(); if (isP(':')) { i++; val(); } }
    return [ensure(id, sc)];
  }
  function subgraph(sc) {
    let name = '';
    if (isKw('subgraph')) { i++; if (T[i] && T[i].k === 'id') name = T[i++].v; }
    if (!isP('{')) throw fail(); i++;
    const cluster = /^cluster/i.test(name);
    const gid = cluster ? name : sc.group;
    const sub = { node: { ...sc.node }, edge: { ...sc.edge }, group: gid, seen: [], graph: {} };
    if (cluster) M.groups.set(gid, { id: gid, title: '', parent: sc.group });
    stmts(sub);
    if (cluster) { const g = M.groups.get(gid); g.title = sub.graph.label ? dotText(sub.graph.label, '') : ''; if (sub.graph.fillcolor || sub.graph.bgcolor) g.style = { fill: sub.graph.fillcolor || sub.graph.bgcolor, stroke: sub.graph.color }; else if (sub.graph.color) g.style = { stroke: sub.graph.color, fill: '#fff' }; }
    sc.seen.push(...sub.seen);
    return [...new Set(sub.seen)];
  }
  function stmts(sc) {
    for (;;) {
      if (!T[i]) throw fail('Missing closing }');
      if (isP('}')) { i++; return; }
      if (isP(';')) { i++; continue; }
      const kw = ['graph', 'node', 'edge'].find((w) => isKw(w) && T[i + 1] && T[i + 1].k === 'p' && T[i + 1].v === '[');
      if (kw) { i++; const a = attrList(); if (kw === 'graph') Object.assign(sc.graph, a); else Object.assign(sc[kw], a); continue; }
      if (T[i].k === 'id' && !T[i].q && T[i + 1] && T[i + 1].k === 'p' && T[i + 1].v === '=') { const k = T[i].v.toLowerCase(); i += 2; sc.graph[k] = val(); continue; }
      let left = endpoint(sc);
      if (T[i] && T[i].k === 'edge') {
        const chain = [left];
        while (T[i] && T[i].k === 'edge') { i++; chain.push(endpoint(sc)); }
        const a = { ...sc.edge, ...attrList() };
        for (let k = 0; k < chain.length - 1; k++) for (const x of chain[k]) for (const y of chain[k + 1]) M.edges.push({ from: x, to: y, dot: a });
      } else {
        const a = attrList();
        for (const id of left) { const n = M.nodes.get(id); n.dot = { ...n.dot, ...a }; }
      }
    }
  }
  const root = { node: {}, edge: {}, group: '', seen: [], graph: gattrs };
  stmts(root);
  if (T[i]) throw fail('Unexpected content after closing }');
  const rd = (gattrs.rankdir || 'TB').toUpperCase();
  M.dir = DIRS[rd] || 'TB';
  const wide = M.dir === 'LR' || M.dir === 'RL';
  for (const n of M.nodes.values()) {
    const a = n.dot || {};
    n.label = a.label != null ? dotText(a.label, n.id) : n.id;
    n.shape = DOT_SHAPES[(a.shape || 'ellipse').toLowerCase()] || 'rect';
    const filled = /filled/.test(a.style || ''), stroke = a.color || '#000';
    n.style = { fill: filled ? a.fillcolor || a.color || 'lightgrey' : '#fff', stroke, 'stroke-width': /bold/.test(a.style || '') ? 2.5 : 1, color: a.fontcolor };
    if (/dashed/.test(a.style || '')) n.style['stroke-dasharray'] = '6 4'; else if (/dotted/.test(a.style || '')) n.style['stroke-dasharray'] = '2 3';
    if (n.shape === 'ellipse') { /* sized in sizeNode via rect math; widen for ellipse */ }
  }
  for (const e of M.edges) {
    const a = e.dot || {};
    e.label = a.label != null ? dotText(a.label, '') : '';
    const dir = (a.dir || (directed ? 'forward' : 'none')).toLowerCase();
    const ah = a.arrowhead ? DOT_ARROWS[a.arrowhead.toLowerCase().replace(/^o(?=dot|diamond)/, (m) => m)] ?? 'arrow' : 'arrow', at = a.arrowtail ? DOT_ARROWS[a.arrowtail.toLowerCase()] ?? 'arrow' : 'arrow';
    e.head = dir === 'forward' || dir === 'both' ? ah : '';
    e.tail = dir === 'back' || dir === 'both' ? at : '';
    const st = a.style || '';
    e.kind = /dashed/.test(st) ? 'dotted' : /dotted/.test(st) ? 'dotted' : /bold/.test(st) ? 'thick' : 'solid';
    if (/invis/.test(st)) e.hidden = true;
    e.style = { stroke: a.color, 'stroke-width': a.penwidth };
    const ends = []; if (a.taillabel) ends.push([0, dotText(a.taillabel, '')]); if (a.headlabel) ends.push([1, dotText(a.headlabel, '')]);
    if (ends.length) e.ends = ends;
  }
  if (!M.nodes.size) throw new Error('DOT graph has no nodes');
  void wide;
  return M;
}
const dotText = (s, id) => String(s).replace(/\\N/g, id).replace(/\\[nlr]/g, '\n').replace(/\\(.)/g, '$1');

// ---------- SQL DDL -> ER diagram ----------
function parseDDL(src) {
  const T = sqlLex(src), stmts = [[]];
  for (const t of T) { if (t.k === 'op' && t.v === ';') stmts.push([]); else stmts[stmts.length - 1].push(t); }
  const tables = new Map(), fks = [];
  const U = (t) => (t && t.k === 'id' && !t.q ? t.u : t && t.k === 'op' ? t.v : null);
  const nameAt = (S, k) => { let name = S[k].v; while (S[k + 1] && U(S[k + 1]) === '.' && S[k + 2]) { k += 2; name = S[k].v; } return [name, k + 1]; };
  const parenList = (S, k) => { const out = []; if (U(S[k]) !== '(') return [out, k]; k++; while (S[k] && U(S[k]) !== ')') { if (S[k].k === 'id') out.push(S[k].v); k++; } return [out, k + 1]; };
  const refs = (S, k, cols, tname) => { // at REFERENCES
    const [rt, k2] = nameAt(S, k + 1), [rc, k3] = parenList(S, k2);
    fks.push({ table: tname, cols, ref: rt, refCols: rc }); return k3;
  };
  const tableLevel = (items, t) => {
    for (let S of items) {
      let k = 0;
      if (U(S[0]) === 'CONSTRAINT') { k = 2; }
      const u = U(S[k]);
      if (u === 'PRIMARY') { const [cols] = parenList(S, k + 2); for (const c of cols) { const col = t.cols.find((x) => x.name.toLowerCase() === c.toLowerCase()); if (col) col.pk = true; } }
      else if (u === 'FOREIGN') { const [cols, k2] = parenList(S, k + 2); if (U(S[k2]) === 'REFERENCES') refs(S, k2, cols, t.name); }
      else if (u === 'UNIQUE') { const [cols] = parenList(S, k + (U(S[k + 1]) === 'KEY' ? 2 : 1)); if (cols.length === 1) { const col = t.cols.find((x) => x.name.toLowerCase() === cols[0].toLowerCase()); if (col) col.unique = true; } }
    }
  };
  for (const S of stmts) {
    if (!S.length) continue;
    if (U(S[0]) === 'CREATE') {
      let k = 1; while (S[k] && U(S[k]) !== 'TABLE') { if (U(S[k]) === 'INDEX' || U(S[k]) === 'VIEW') { k = -1; break; } k++; }
      if (k < 0 || !S[k]) continue;
      k++;
      if (U(S[k]) === 'IF') k += 3;
      if (!S[k]) continue;
      let name; [name, k] = nameAt(S, k);
      if (U(S[k]) !== '(') continue;
      let d = 0, j = k; const items = [[]];
      for (; j < S.length; j++) {
        const u = U(S[j]);
        if (u === '(') { d++; if (d === 1) continue; } else if (u === ')') { d--; if (d === 0) break; }
        if (u === ',' && d === 1) { items.push([]); continue; }
        items[items.length - 1].push(S[j]);
      }
      const t = { name, cols: [] }; tables.set(name.toLowerCase(), t);
      const tl = [];
      for (const S2 of items) {
        if (!S2.length) continue;
        const f0 = U(S2[0]);
        if (['PRIMARY', 'FOREIGN', 'UNIQUE', 'CONSTRAINT', 'CHECK', 'KEY', 'INDEX', 'FULLTEXT'].includes(f0) && !(f0 === 'KEY' && false)) { tl.push(S2); continue; }
        const col = { name: S2[0].v, type: '', pk: false, notnull: false, unique: false };
        let k2 = 1;
        const STOP = ['NOT', 'NULL', 'PRIMARY', 'REFERENCES', 'DEFAULT', 'UNIQUE', 'CHECK', 'CONSTRAINT', 'COLLATE', 'AUTOINCREMENT', 'AUTO_INCREMENT', 'GENERATED', 'COMMENT'];
        let ty = '';
        while (S2[k2] && !(S2[k2].k === 'id' && !S2[k2].q && STOP.includes(S2[k2].u))) { const tk = S2[k2], isW = tk.k === 'id'; ty += (isW && /\w$/.test(ty) ? ' ' : '') + (tk.k === 'str' ? `'${tk.v}'` : tk.v); k2++; }
        col.type = ty;
        for (; k2 < S2.length; k2++) {
          const u = U(S2[k2]);
          if (u === 'PRIMARY') col.pk = true;
          else if (u === 'NOT' && U(S2[k2 + 1]) === 'NULL') col.notnull = true;
          else if (u === 'UNIQUE') col.unique = true;
          else if (u === 'REFERENCES') k2 = refs(S2, k2, [col.name], name) - 1;
        }
        t.cols.push(col);
      }
      tableLevel(tl, t);
    } else if (U(S[0]) === 'ALTER' && U(S[1]) === 'TABLE') {
      let [name, k] = nameAt(S, 2);
      const t = tables.get(name.toLowerCase()); if (!t) continue;
      for (; k < S.length; k++) {
        if (U(S[k]) === 'FOREIGN') { const [cols, k2] = parenList(S, k + 2); if (U(S[k2]) === 'REFERENCES') k = refs(S, k2, cols, name) - 1; }
        else if (U(S[k]) === 'PRIMARY') { const [cols] = parenList(S, k + 2); for (const c of cols) { const col = t.cols.find((x) => x.name.toLowerCase() === c.toLowerCase()); if (col) col.pk = true; } }
      }
    }
  }
  if (!tables.size) throw new Error('No CREATE TABLE statements found');
  return { tables, fks };
}
function ddlToSvg(src, o = {}) {
  const { tables, fks } = parseDDL(src), M = newModel(o.dir || 'LR');
  const fkcols = new Map();
  for (const fk of fks) for (const c of fk.cols) fkcols.set(fk.table.toLowerCase() + '.' + c.toLowerCase(), true);
  for (const fk of fks) if (!tables.has(fk.ref.toLowerCase())) tables.set(fk.ref.toLowerCase(), { name: fk.ref, cols: [], stub: true });
  for (const t of tables.values()) {
    const rows = t.cols.map((c) => ({ cols: [c.type || '', c.name, [c.pk ? 'PK' : '', fkcols.has(t.name.toLowerCase() + '.' + c.name.toLowerCase()) ? 'FK' : '', c.unique && !c.pk ? 'UK' : ''].filter(Boolean).join(',')], right: true, bold: c.pk }));
    boxNode(M, t.name, [t.name], [{ rows }]);
  }
  for (const fk of fks) {
    const t = tables.get(fk.table.toLowerCase()), single = fk.cols.length === 1 ? t.cols.find((c) => c.name.toLowerCase() === fk.cols[0].toLowerCase()) : null;
    const one = single && (single.unique || (single.pk && t.cols.filter((c) => c.pk).length === 1));
    const parent = tables.get(fk.ref.toLowerCase());
    const pcol = parent && fk.refCols.length === 1 ? parent.cols.find((c) => c.name.toLowerCase() === fk.refCols[0].toLowerCase()) : null;
    M.edges.push({ from: parent.name, to: t.name, label: fk.cols.join(', '), kind: 'solid', tail: pcol && !pcol.notnull && !pcol.pk ? 'zeroone' : 'one', head: single && single.notnull ? (one ? 'one' : 'onemany') : (one ? 'zeroone' : 'zeromany') });
  }
  return renderModel(M, { curve: o.curve });
}

// ---------- tools ----------
const DOT_SAMPLE = `digraph G {
  rankdir=LR;
  node [shape=box, style=filled, fillcolor="#e8f0ff"];
  client [label="Browser"];
  cdn [label="CDN", shape=ellipse];
  api [label="API\\nserver"];
  db [label="Postgres", shape=cylinder];
  cache [label="Redis", shape=diamond];
  client -> cdn [label="static"];
  client -> api [label="JSON"];
  api -> db;
  api -> cache [style=dashed, label="get/set"];
  cache -> db [label="miss"];
  subgraph cluster_infra {
    label="Infrastructure";
    db; cache;
  }
}`;
const DDL_SAMPLE = `CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name TEXT
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  placed_at TIMESTAMP,
  total DECIMAL(10,2)
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  price DECIMAL(10,2)
);
CREATE TABLE order_items (
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty INTEGER DEFAULT 1,
  PRIMARY KEY (order_id, product_id),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);`;
const SQL_DATA_SAMPLE = `-- name: users
id,name,city,age
1,Alice,Paris,34
2,Bob,Berlin,28
3,Carol,Paris,41
4,Dave,Rome,
---
-- name: orders
id,user_id,total,status
10,1,25.5,paid
11,1,99,paid
12,2,10,refunded
13,3,45.25,paid
14,9,5,paid`;
const SQL_QUERY_SAMPLE = `-- t1 = users, t2 = orders (also available by the names above)
SELECT u.name, u.city,
       COUNT(o.id) AS orders,
       COALESCE(SUM(o.total), 0) AS spent,
       CASE WHEN SUM(o.total) > 50 THEN 'big' ELSE 'small' END AS tier
FROM t1 u
LEFT JOIN t2 o ON o.user_id = u.id AND o.status = 'paid'
GROUP BY u.id, u.name, u.city
HAVING COUNT(o.id) >= 0
ORDER BY spent DESC, u.name
LIMIT 10;`;

const MM_DESC = 'Renders a practical Mermaid subset to SVG, fully offline with a hand-written layered layout. Supported: flowchart/graph (TD TB LR RL BT; shapes [] () ([ ]) [[ ]] [( )] (( )) {} {{ }} [/ /]; edges --> --- -.-> ==> with |label| or -- text -->; chains A-->B-->C; & fan-out; subgraph...end (nested, edges into subgraphs); classDef/class/:::/style/linkStyle), sequenceDiagram (participant/actor aliases, ->> -->> -> --> -x -), +/- activations, notes, loop/alt/else/opt/par/and/critical/break/rect blocks, autonumber), pie (title, showData), gantt (sections, YYYY-MM-DD, durations d/w/h, after id, done/active/crit/milestone), erDiagram (entities with attributes, cardinalities, labels), stateDiagram-v2 (transitions, [*], composite states, choice/fork, notes, descriptions) and classDiagram (members, <<annotations>>, inheritance/composition/aggregation/association/dependency/realization, cardinalities). Not supported: themes/init directives, click/links, icons, markdown/KaTeX text, WITH-style styling beyond basics, mindmap/timeline/journey/git/quadrant/C4/etc. Text widths are estimated, so very tight labels can differ slightly from a browser render.';

function resultOf(svg, name) { return svgResult(svg, name); }
const heicErr = () => new Error('This browser cannot decode HEIC/HEIF images. HEIC (HEVC) decoding works natively in Safari on macOS/iOS, and in some Chrome/Edge builds on Windows (with the HEVC/HEIF system extensions installed) or recent macOS; Firefox generally cannot. Try Safari, or convert on the device that created the photo.');
async function decodeImage(file) {
  try { return await createImageBitmap(file); } catch { /* fall through to <img> */ }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch { return null; } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}
async function isHeic(file) {
  const b = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const s = String.fromCharCode(...b.slice(4, 32));
  return s.startsWith('ftyp') && /(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(s);
}

function mermaidUI(el) {
  const mk = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids.flat().filter((x) => x != null)); return e; };
  const sel = mk('select', {}, ...MM_TYPES.map((t) => mk('option', { value: t, textContent: t })));
  const curveSel = mk('select', {}, ...['curved', 'orthogonal', 'straight'].map((t) => mk('option', { value: t, textContent: t })));
  const ta = mk('textarea', { spellcheck: false, value: MM_SAMPLES.flowchart });
  const out = mk('div');
  let sampleShown = MM_SAMPLES.flowchart, timer;
  const go = () => {
    out.replaceChildren();
    try {
      const r = mermaidToSvg(ta.value, { curve: curveSel.value });
      const res = svgResult(r, 'diagram');
      const hm = /height="(\d+)"/.exec(r);
      const fr = mk('iframe', { className: 'prev', sandbox: '', srcdoc: res.html });
      fr.style.width = '100%'; fr.style.height = Math.min(1400, (hm ? +hm[1] : 400) + 40) + 'px'; fr.style.background = '#fff';
      const dl = mk('a', { className: 'btn', href: URL.createObjectURL(res.blob), download: 'diagram.svg', textContent: 'Download SVG' });
      out.append(fr, mk('div', { className: 'row' }, dl, mk('button', { textContent: 'Copy SVG source', onclick: () => navigator.clipboard?.writeText(r) })));
    } catch (e) { out.append(mk('pre', { className: 'out err', textContent: String(e.message || e) })); }
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(go, 150); };
  sel.addEventListener('input', () => {
    if (!ta.value.trim() || ta.value === sampleShown) { sampleShown = MM_SAMPLES[sel.value]; ta.value = sampleShown; }
    go();
  });
  ta.addEventListener('input', later); curveSel.addEventListener('input', later);
  el.append(mk('label', {}, 'Sample (replaces the text only while it is untouched)'), sel, mk('label', {}, 'Mermaid source'), ta,
    mk('div', { className: 'opts' }, mk('label', {}, 'Edge style', curveSel)), mk('div', { className: 'row' }, mk('button', { textContent: 'Run', onclick: go })), out);
  go();
}

export default [
  {
    id: 'mermaid-lite-renderer', cat: 'Diagrams', title: 'Mermaid Diagram Renderer (lite)', desc: MM_DESC,
    custom: true, render: mermaidUI, sample: MM_SAMPLES.flowchart,
    run: ([t], o = {}) => resultOf(mermaidToSvg(t, o), 'diagram'),
  },
  {
    id: 'graphviz-dot-lite', cat: 'Diagrams', title: 'Graphviz DOT Renderer (lite)',
    desc: 'Renders a simple DOT subset to SVG offline with the built-in layered layout (not the real Graphviz engine, so positions differ). Supported: digraph/graph, rankdir, node/edge/graph default attributes, node and edge statements with chains and {a b} sets, quoted ids, label (with \\n), shape (box ellipse circle diamond hexagon cylinder plaintext parallelogram), style (filled dashed dotted bold invis), color/fillcolor/fontcolor, arrowhead/arrowtail/dir, headlabel/taillabel, cluster subgraphs. Not supported: HTML labels, record ports, ports/compass points, splines/ratio/size/nodesep and other layout attributes (ignored).',
    labels: ['DOT source'], sample: DOT_SAMPLE,
    opts: [{ id: 'curve', label: 'Edge style', type: 'select', choices: ['curved', 'orthogonal', 'straight'], def: 'curved' }],
    run: ([t], o) => resultOf(renderModel(parseDot(t), { curve: o.curve }), 'graph'),
  },
  {
    id: 'sql-ddl-to-diagram', cat: 'Diagrams', title: 'SQL DDL to ER Diagram',
    desc: 'Paste CREATE TABLE statements (columns, PRIMARY KEY, FOREIGN KEY ... REFERENCES, inline REFERENCES, UNIQUE, NOT NULL, ALTER TABLE ... ADD FOREIGN KEY) and get an entity-relationship diagram as SVG with crow\'s-foot notation. Generic SQL, MySQL, PostgreSQL and SQLite syntax work; other statements are ignored.',
    labels: ['CREATE TABLE statements'], sample: DDL_SAMPLE,
    opts: [{ id: 'dir', label: 'Direction', type: 'select', choices: ['LR', 'TB'], def: 'LR' }, { id: 'curve', label: 'Edge style', type: 'select', choices: ['curved', 'orthogonal', 'straight'], def: 'curved' }],
    run: ([t], o) => resultOf(ddlToSvg(t, o), 'er-diagram'),
  },
  {
    id: 'sql-on-csv', cat: 'SQL & Data', title: 'SQL on CSV / JSON (in-browser SQL)',
    desc: 'Run SQL against pasted CSV or JSON. Box 1: tables separated by a line of ---, each CSV (first row = header) or a JSON array of objects, optionally starting with "-- name: users"; they become t1, t2, ... (and the name). You can also put CREATE TABLE / INSERT statements in either box. Box 2: statements separated by ;. Supported: SELECT with expressions, aliases, DISTINCT, WHERE (AND OR NOT, comparisons, LIKE, GLOB, IN, BETWEEN, IS [NOT] NULL, EXISTS), INNER/LEFT/RIGHT/FULL/CROSS JOIN with ON or USING, GROUP BY/HAVING, COUNT SUM AVG MIN MAX TOTAL GROUP_CONCAT (DISTINCT ok), ORDER BY (aliases, ordinals, NULLS FIRST/LAST), LIMIT/OFFSET, subqueries (FROM, IN, EXISTS, scalar, correlated), WITH (non-recursive), UNION [ALL]/INTERSECT/EXCEPT, CASE, CAST, string and math functions, CREATE TABLE [AS], CREATE VIEW, INSERT, UPDATE, DELETE, DROP. Differences from SQLite: "/" is always true division, numeric-looking text compares as a number, empty CSV cells are NULL, no constraint enforcement (PRIMARY KEY/UNIQUE/NOT NULL), no window functions, recursive CTEs, triggers or date functions. Output is a text table plus CSV; nothing leaves your browser.',
    inputs: 2, labels: ['Data: CSV / JSON tables separated by ---, and/or CREATE + INSERT', 'SQL query (statements separated by ;)'],
    sample: SQL_DATA_SAMPLE, sample2: SQL_QUERY_SAMPLE,
    opts: [{ id: 'csv', label: 'Append CSV to output', type: 'checkbox', def: true }],
    run: ([d, q], o) => sqlTool(d, q, o),
  },
  {
    id: 'heic-to-jpg', cat: 'Images – Extra', title: 'HEIC to JPG / PNG / WebP',
    desc: 'Converts HEIC/HEIF photos using the browser\'s own image decoder, so it only works where the browser can already decode HEIC: Safari (macOS, iOS), and some Chrome/Edge builds on Windows or macOS that have the system HEVC/HEIF codecs installed. Firefox and most other setups cannot, and the tool will say so; there is no bundled software HEVC decoder (that cannot sensibly be hand-written). Files never leave your browser.',
    dom: true, file: { accept: 'image/heic,image/heif,.heic,.heif,image/*', multiple: true }, inputs: 0,
    opts: [{ id: 'format', label: 'Format', type: 'select', choices: ['jpeg', 'png', 'webp'], def: 'jpeg' }, { id: 'quality', label: 'Quality (0.1-1)', type: 'number', def: 0.92 }],
    run: async (_i, o, files) => {
      if (!files.length) throw new Error('Choose a HEIC/HEIF file');
      const type = 'image/' + (o.format || 'jpeg'), ext = { jpeg: 'jpg', png: 'png', webp: 'webp' }[o.format || 'jpeg'];
      const q = Math.min(1, Math.max(0.1, Number(o.quality) || 0.92));
      const outs = [];
      for (const file of files) {
        const img = await decodeImage(file);
        if (!img) throw (await isHeic(file)) ? heicErr() : new Error(`${file.name}: not a readable image`);
        const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d');
        if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
        g.drawImage(img, 0, 0);
        const blob = await new Promise((r) => c.toBlob(r, type, q));
        if (!blob || blob.type !== type) throw new Error(`This browser cannot encode ${o.format}; pick another format`);
        outs.push(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type }));
      }
      return { blob: outs };
    },
  },
];

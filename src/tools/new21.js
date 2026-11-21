// Tools from free-browser-tools.md, batch 21: charts, spreadsheet cleaning, offline geo. See TOOLS.md for the contract.
// Skipped on purpose (need a server, API or tiles): geocoding, reverse geocoding, tile maps, routing, isochrones,
// weather, air quality, elevation lookup, earthquake and Wikipedia feeds, Overpass, Wikidata. Details: peerreview/new-list/21.md
const T = [];
const CH = 'Charts & Data Visualization', SP = 'Spreadsheet & Data Cleaning', GEO = 'Maps & Geo';

// ---------------------------------------------------------------- shared helpers
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PAL = ['#0072B2', '#E69F00', '#009E73', '#D55E00', '#CC79A7', '#56B4E9', '#8C564B', '#666666', '#B8860B', '#2E8B57'];
const FONT = 'system-ui,Segoe UI,Arial,sans-serif';
const need = (t, what = 'some data') => { if (!String(t ?? '').trim()) throw new Error(`Paste ${what} first.`); return String(t); };
const fmt = (n) => (Number.isFinite(n) ? String(+n.toPrecision(6)) : '');
const round = (n, d = 2) => +n.toFixed(d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const optNum = (v, d, lo = -Infinity, hi = Infinity) => { const n = Number(v); return v === '' || v == null || !Number.isFinite(n) ? d : clamp(n, lo, hi); };
const numv = (s) => { s = String(s ?? '').trim().replace(/^[$€£]\s?/, '').replace(/\s?%$/, ''); return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? +s : NaN; };
const px = (s, size) => String(s).length * size * 0.56;
const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
const sum = (a) => a.reduce((x, y) => x + y, 0);

// CSV parser: delimiter comma, semicolon, tab or pipe (auto from the first line unless given); "" escapes.
function detectDelim(t) { const first = (t.replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim()) || ''); return [',', ';', '\t', '|'].map((c) => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0]; }
function parseCsv(text, delim) {
  const t = String(text).replace(/^﻿/, ''), d = delim || detectDelim(t), rows = []; let row = [], f = '', q = false, quoted = false;
  const endRow = () => { row.push(f); f = ''; quoted = false; if (row.length > 1 || row[0] !== '' || quoted) rows.push(row); row = []; };
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"' && f === '') { q = true; quoted = true; }
    else if (c === d) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; endRow(); }
    else f += c;
  }
  if (f !== '' || row.length) endRow();
  return rows;
}
const csvCell = (v, d = ',') => { v = String(v ?? ''); return v.includes(d) || /["\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const toCsv = (rows, d = ',') => rows.map((r) => r.map((v) => csvCell(v, d)).join(d)).join('\n') + '\n';
const DELIMS = { comma: ',', semicolon: ';', tab: '\t', pipe: '|' };
const delimOpt = { id: 'delim', label: 'Delimiter', type: 'select', choices: ['auto', 'comma', 'semicolon', 'tab', 'pipe'], def: 'auto' };
const readTable = (text, o, what = 'a table') => { const rows = parseCsv(need(text, what), DELIMS[o?.delim]); if (!rows.length) throw new Error('No rows found.'); return rows; };
const width = (rows) => rows.reduce((m, r) => Math.max(m, r.length), 0);
const pad = (rows) => { const w = width(rows); return rows.map((r) => (r.length < w ? r.concat(Array(w - r.length).fill('')) : r)); };
// header + body; resolves a column spec (name or 1-based number) to an index
function colIdx(head, spec, what = 'column') {
  const s = String(spec ?? '').trim(); if (!s) throw new Error(`Enter a ${what}.`);
  const i = head.findIndex((h) => h.trim().toLowerCase() === s.toLowerCase());
  if (i >= 0) return i;
  if (/^\d+$/.test(s) && +s >= 1 && +s <= head.length) return +s - 1;
  throw new Error(`No ${what} named "${s}". Columns: ${head.join(', ')}`);
}
const colList = (head, spec, what) => String(spec ?? '').split(/[,;]/).map((x) => x.trim()).filter(Boolean).map((x) => colIdx(head, x, what));
const out = { csv: (rows, extra = {}) => ({ text: toCsv(rows), blob: new Blob([toCsv(rows)], { type: 'application/octet-stream' }), filename: extra.filename || 'table.csv' }) };
const tableText = (rows) => { const w = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i] ?? '').length), 1)); return rows.map((r) => r.map((v, i) => String(v ?? '').padEnd(w[i])).join('  ').trimEnd()).join('\n'); };

// nice axis ticks
function niceTicks(lo, hi, n = 5) {
  if (!(hi > lo)) { hi = lo + 1; }
  const raw = (hi - lo) / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p, step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step, t = [];
  for (let v = a; v <= b + step / 2; v += step) t.push(+v.toPrecision(12));
  return t;
}
const sizeOpts = (w = 720, h = 420) => [{ id: 'w', label: 'Width (px)', type: 'number', def: w }, { id: 'h', label: 'Height (px)', type: 'number', def: h }];
const dims = (o, w = 720, h = 420) => [Math.round(optNum(o.w, w, 240, 2400)), Math.round(optNum(o.h, h, 160, 1800))];

function svgDoc(W, H, title, desc, body, bg = '#ffffff') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" font-family="${FONT}" font-size="12"><title>${esc(title)}</title><desc>${esc(desc)}</desc><rect width="${W}" height="${H}" fill="${bg}"/><g fill="#1a1a1a">${body}</g></svg>`;
}
const titleEl = (W, title) => (title ? `<text x="${W / 2}" y="22" font-size="16" font-weight="600" text-anchor="middle">${esc(title)}</text>` : '');
// result: SVG in a sandboxed page together with a data table (text alternative); the SVG source is the copyable text.
function chartResult(svg, filename, head, rows, note = '') {
  const tbl = `<table><thead><tr>${head.map((h) => `<th scope="col">${esc(h) || "Row"}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 500).map((r) => `<tr>${r.map((c, i) => (i ? `<td${/^[-+\d.,%\s]*$/.test(String(c)) ? '' : ' class="t"'}>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join('')}</tr>`).join('')}</tbody></table>`;
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(filename)}</title><style>body{font:14px system-ui,sans-serif;margin:12px;background:#fff;color:#1a1a1a}svg{max-width:100%;height:auto}table{border-collapse:collapse;margin-top:8px}th,td{border:1px solid #999;padding:2px 8px;text-align:right}th[scope=row],th:first-child,td.t{text-align:left}h2{font-size:15px;margin:16px 0 4px}</style><body>${svg}<h2>Data table (text alternative)</h2>${note ? `<p>${esc(note)}</p>` : ''}${tbl}</body></html>`;
  return { html, text: svg, blob: new Blob([svg], { type: 'application/octet-stream' }), filename };
}
const legendRow = (items, x, y, W) => { // items: [color,label]; wraps
  let cx = x, cy = y, s = '';
  for (const [c, l] of items) { const w = 16 + px(l, 12) + 14; if (cx + w > W - 10 && cx > x) { cx = x; cy += 18; } s += `<rect x="${cx}" y="${cy - 10}" width="11" height="11" fill="${c}"/><text x="${cx + 15}" y="${cy}">${esc(l)}</text>`; cx += w; }
  return [s, cy];
};
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (r) => '#' + r.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (h) => { const [r, g, b] = hex2rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const inkOn = (bg) => (lum(bg) > 0.179 ? '#111111' : '#ffffff');
const okColor = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v ?? '').trim()) ? String(v).trim() : d);
// seeded PRNG
const rng = (seed) => { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };

// ---------------------------------------------------------------- 1399 bar chart
T.push({
  id: 'bar-chart-maker', cat: CH, title: 'Bar Chart Maker (Vertical, Horizontal, Stacked, SVG)',
  desc: 'Paste labels and values and get an accessible SVG bar chart: vertical or horizontal, grouped or stacked, one colour or a palette, with a data table as text alternative.',
  inputs: 1, labels: ['Data: label, value (add more columns for more series; header row optional)'], sample: 'Region,2024,2025\nNorth,120,150\nSouth,90,110\nEast,60,95\nWest,140,130\n',
  opts: [{ id: 'header', label: 'First row is a header', type: 'checkbox', def: true }, { id: 'orient', label: 'Direction', type: 'select', choices: ['vertical', 'horizontal'], def: 'vertical' }, { id: 'mode', label: 'Several series', type: 'select', choices: ['grouped', 'stacked'], def: 'grouped' }, { id: 'sort', label: 'Sort by first series', type: 'select', choices: ['none', 'descending', 'ascending'], def: 'none' }, { id: 'color', label: 'Colour of a single series (#rrggbb, blank = palette)', type: 'text', def: '' }, { id: 'values', label: 'Print values on bars', type: 'checkbox', def: true }, { id: 'title', label: 'Title', type: 'text', def: 'Sales by region' }, ...sizeOpts()],
  run: ([src], o) => {
    let rows = pad(parseCsv(need(src, 'two or more columns')));
    if (rows[0].length < 2) throw new Error('Need at least two columns: a label and a value.');
    const header = o.header !== false;
    let head = header ? rows.shift() : ['Label', ...rows[0].slice(1).map((_, i) => `Series ${i + 1}`)];
    if (!rows.length) throw new Error('No data rows.'); if (rows.length > 200) throw new Error('At most 200 bars.');
    let data = rows.map((r) => ({ l: r[0], v: r.slice(1).map((c) => { const n = numv(c); return Number.isFinite(n) ? n : 0; }) }));
    if (o.sort !== 'none') data.sort((a, b) => (o.sort === 'ascending' ? a.v[0] - b.v[0] : b.v[0] - a.v[0]));
    const ns = head.length - 1, stacked = o.mode === 'stacked' && ns > 1, horiz = o.orient === 'horizontal', [W, H] = dims(o);
    const single = okColor(o.color, '') && ns === 1, col = (k) => (single ? okColor(o.color) : PAL[k % PAL.length]);
    const pos = data.map((d) => (stacked ? sum(d.v.filter((v) => v > 0)) : Math.max(0, ...d.v))), neg = data.map((d) => (stacked ? sum(d.v.filter((v) => v < 0)) : Math.min(0, ...d.v)));
    const ticks = niceTicks(Math.min(0, ...neg), Math.max(0, ...pos) || 1), vlo = ticks[0], vhi = ticks[ticks.length - 1];
    const lw = horiz ? Math.min(160, Math.max(...data.map((d) => px(cut(d.l, 22), 12))) + 12) : 54;
    const m = { t: o.title ? 38 : 14, r: 18, b: horiz ? 30 : 56, l: horiz ? lw : 54 }; const legendH = ns > 1 ? 22 : 0; m.b += legendH;
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const V = (v) => (horiz ? m.l + ((v - vlo) / (vhi - vlo)) * pw : m.t + ph - ((v - vlo) / (vhi - vlo)) * ph);
    let g = '';
    for (const t of ticks) { const p = V(t); g += horiz ? `<line x1="${p}" x2="${p}" y1="${m.t}" y2="${m.t + ph}" stroke="#888" stroke-opacity=".35"/><text x="${p}" y="${m.t + ph + 15}" text-anchor="middle">${fmt(t)}</text>` : `<line x1="${m.l}" x2="${m.l + pw}" y1="${p}" y2="${p}" stroke="#888" stroke-opacity=".35"/><text x="${m.l - 6}" y="${p + 4}" text-anchor="end">${fmt(t)}</text>`; }
    const band = (horiz ? ph : pw) / data.length;
    data.forEach((d, i) => {
      const c0 = (horiz ? m.t : m.l) + i * band, inner = band * 0.78, off = band * 0.11, bw = stacked || ns === 1 ? inner : inner / ns;
      let up = 0, dn = 0;
      d.v.forEach((v, k) => {
        let a, b, p0;
        if (stacked) { if (v >= 0) { a = up; b = up + v; up = b; } else { a = dn; b = dn + v; dn = b; } p0 = c0 + off; } else { a = 0; b = v; p0 = c0 + off + k * bw; }
        const x0 = V(a), x1 = V(b), len = Math.abs(x1 - x0), s = Math.min(x0, x1);
        const lab = `${d.l}${ns > 1 ? ' / ' + head[k + 1] : ''}: ${fmt(v)}`;
        g += horiz ? `<rect x="${s.toFixed(1)}" y="${p0.toFixed(1)}" width="${len.toFixed(1)}" height="${(bw - (ns > 1 && !stacked ? 1 : 0)).toFixed(1)}" fill="${col(k)}"><title>${esc(lab)}</title></rect>` : `<rect x="${p0.toFixed(1)}" y="${s.toFixed(1)}" width="${(bw - (ns > 1 && !stacked ? 1 : 0)).toFixed(1)}" height="${len.toFixed(1)}" fill="${col(k)}"><title>${esc(lab)}</title></rect>`;
        if (o.values && (!stacked || len > 18) && bw > 14) { const t = fmt(v); g += horiz ? `<text x="${(v >= 0 ? s + len + 4 : s - 4).toFixed(1)}" y="${(p0 + bw / 2 + 4).toFixed(1)}" font-size="11" text-anchor="${v >= 0 ? 'start' : 'end'}">${t}</text>` : `<text x="${(p0 + bw / 2).toFixed(1)}" y="${(v >= 0 ? s - 4 : s + len + 12).toFixed(1)}" font-size="11" text-anchor="middle">${t}</text>`; }
      });
      const lbl = cut(d.l, horiz ? 22 : 12);
      g += horiz ? `<text x="${m.l - 6}" y="${(c0 + band / 2 + 4).toFixed(1)}" text-anchor="end">${esc(lbl)}</text>` : (data.length > 8 ? `<text transform="translate(${(c0 + band / 2).toFixed(1)} ${m.t + ph + 14}) rotate(-35)" text-anchor="end">${esc(lbl)}</text>` : `<text x="${(c0 + band / 2).toFixed(1)}" y="${m.t + ph + 16}" text-anchor="middle">${esc(lbl)}</text>`);
    });
    const zero = V(0); g += horiz ? `<line x1="${zero}" x2="${zero}" y1="${m.t}" y2="${m.t + ph}" stroke="#333"/>` : `<line x1="${m.l}" x2="${m.l + pw}" y1="${zero}" y2="${zero}" stroke="#333"/>`;
    if (ns > 1) g += legendRow(head.slice(1).map((h, k) => [col(k), h]), m.l, H - 10, W)[0];
    const desc = `${horiz ? 'Horizontal' : 'Vertical'} ${stacked ? 'stacked ' : ''}bar chart. ` + data.map((d) => `${d.l}: ${d.v.map((v, k) => `${ns > 1 ? head[k + 1] + ' ' : ''}${fmt(v)}`).join(', ')}`).join('; ');
    const svg = svgDoc(W, H, o.title || 'Bar chart', desc, titleEl(W, o.title) + g);
    return chartResult(svg, 'bar-chart.svg', head, data.map((d) => [d.l, ...d.v.map(fmt)]));
  },
});

// ---------------------------------------------------------------- 1400 line chart
const parseX = (s) => { // -> {t:number, kind}
  s = String(s).trim(); let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s)) || (m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s))) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if ((m = /^(\d{4})-(\d{1,2})$/.exec(s))) return Date.UTC(+m[1], +m[2] - 1, 1);
  return NaN;
};
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
T.push({
  id: 'line-chart-maker', cat: CH, title: 'Line Chart Maker (Multi-Series Time Series to SVG)',
  desc: 'Plot one or more series as lines from a pasted table. The first column can be dates (YYYY-MM-DD), numbers or labels; gaps in the data break the line. Accessible SVG plus data table.',
  inputs: 1, labels: ['Table: x column (date, number or label), then one column per series'], sample: 'date,visits,signups\n2026-01-01,120,8\n2026-02-01,150,11\n2026-03-01,170,9\n2026-04-01,160,14\n2026-05-01,210,19\n2026-06-01,260,22\n',
  opts: [{ id: 'points', label: 'Show point markers', type: 'checkbox', def: true }, { id: 'zero', label: 'Start the y axis at zero', type: 'checkbox', def: false }, { id: 'title', label: 'Title', type: 'text', def: 'Visits and signups' }, { id: 'ylabel', label: 'Y axis label', type: 'text', def: '' }, ...sizeOpts()],
  run: ([src], o) => {
    let rows = pad(parseCsv(need(src, 'a table')));
    if (rows[0].length < 2 || rows.length < 3) throw new Error('Need a header row, at least two data rows and at least two columns.');
    const head = rows.shift(), ns = head.length - 1; if (rows.length > 2000) throw new Error('At most 2000 rows.');
    const xt = rows.map((r) => parseX(r[0])), xn = rows.map((r) => numv(r[0]));
    const kind = xt.every(Number.isFinite) ? 'date' : xn.every(Number.isFinite) ? 'number' : 'label';
    const xs = kind === 'date' ? xt : kind === 'number' ? xn : rows.map((_, i) => i);
    const ys = head.slice(1).map((_, k) => rows.map((r) => { const n = numv(r[k + 1]); return r[k + 1].trim() === '' ? null : Number.isFinite(n) ? n : null; }));
    const all = ys.flat().filter((v) => v !== null); if (!all.length) throw new Error('No numeric values found in the series columns.');
    const [W, H] = dims(o), lg = legendRow(head.slice(1).map((h, k) => [PAL[k % PAL.length], h]), 0, 0, W - 54), legH = ns > 1 ? 18 * (1 + Math.round(lg[1] / 18)) + 4 : 0;
    const m = { t: o.title ? 38 : 14, r: 24, b: 40 + legH, l: o.ylabel ? 64 : 54 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const lo = o.zero ? Math.min(0, ...all) : Math.min(...all), tk = niceTicks(lo, Math.max(...all), 5), vlo = tk[0], vhi = tk[tk.length - 1];
    const x0 = Math.min(...xs), x1 = Math.max(...xs), X = (x) => m.l + (x1 === x0 ? pw / 2 : ((x - x0) / (x1 - x0)) * pw), Y = (v) => m.t + ph - ((v - vlo) / (vhi - vlo)) * ph;
    let g = '';
    for (const t of tk) g += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(t)}" y2="${Y(t)}" stroke="#888" stroke-opacity=".35"/><text x="${m.l - 6}" y="${Y(t) + 4}" text-anchor="end">${fmt(t)}</text>`;
    const nt = Math.max(2, Math.min(rows.length, Math.floor(pw / 90))), lab = (i) => (kind === 'date' ? isoDay(xs[i]) : rows[i][0]);
    const idx = kind === 'label' ? [...new Set(Array.from({ length: nt }, (_, k) => Math.round((k * (rows.length - 1)) / (nt - 1))))] : kind === 'date' ? Array.from({ length: nt }, (_, k) => k) : [];
    if (kind === 'date') for (let k = 0; k < nt; k++) { const t = x0 + ((x1 - x0) * k) / (nt - 1); g += `<text x="${X(t).toFixed(1)}" y="${m.t + ph + 16}" text-anchor="${k === 0 ? 'start' : k === nt - 1 ? 'end' : 'middle'}">${isoDay(t)}</text>`; }
    else if (kind === 'number') for (const t of niceTicks(x0, x1, nt)) { if (t >= x0 && t <= x1) g += `<text x="${X(t).toFixed(1)}" y="${m.t + ph + 16}" text-anchor="middle">${fmt(t)}</text>`; }
    else for (const i of idx) g += `<text x="${X(xs[i]).toFixed(1)}" y="${m.t + ph + 16}" text-anchor="middle">${esc(cut(rows[i][0], 12))}</text>`;
    g += `<line x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${m.t + ph}" stroke="#333"/><line x1="${m.l}" x2="${m.l + pw}" y1="${m.t + ph}" y2="${m.t + ph}" stroke="#333"/>`;
    const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
    ys.forEach((s, k) => {
      const c = PAL[k % PAL.length]; let seg = [];
      const flush = () => { if (seg.length > 1) g += `<polyline fill="none" stroke="${c}" stroke-width="2" points="${seg.join(' ')}"/>`; seg = []; };
      for (const i of order) { if (s[i] === null) { flush(); continue; } seg.push(`${X(xs[i]).toFixed(1)},${Y(s[i]).toFixed(1)}`); }
      flush();
      if (o.points || rows.length <= 40) for (const i of order) if (s[i] !== null) g += `<circle cx="${X(xs[i]).toFixed(1)}" cy="${Y(s[i]).toFixed(1)}" r="3" fill="${c}"><title>${esc(head[k + 1])}, ${esc(lab(i))}: ${fmt(s[i])}</title></circle>`;
    });
    if (o.ylabel) g += `<text transform="translate(14 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle">${esc(o.ylabel)}</text>`;
    if (ns > 1) g += legendRow(head.slice(1).map((h, k) => [PAL[k % PAL.length], h]), m.l, H - legH + 12, W)[0];
    const desc = `Line chart of ${head.slice(1).join(', ')} by ${head[0]}, ${rows.length} points from ${lab(order[0])} to ${lab(order[order.length - 1])}. ` + head.slice(1).map((h, k) => `${h}: min ${fmt(Math.min(...ys[k].filter((v) => v !== null)))}, max ${fmt(Math.max(...ys[k].filter((v) => v !== null)))}`).join('; ');
    return chartResult(svgDoc(W, H, o.title || 'Line chart', desc, titleEl(W, o.title) + g), 'line-chart.svg', head, order.map((i) => [lab(i), ...ys.map((s) => (s[i] === null ? '' : fmt(s[i])))]));
  },
});

// ---------------------------------------------------------------- 1401 pie and donut
T.push({
  id: 'pie-donut-chart-maker', cat: CH, title: 'Pie and Donut Chart Maker with Percentages',
  desc: 'Enter category names with values and get an SVG pie or donut chart with each slice labelled by its percentage, a legend and a data table.',
  inputs: 1, labels: ['Data: category, value (one per line)'], sample: 'Organic search,48\nDirect,22\nSocial,14\nEmail,9\nReferral,7\n',
  opts: [{ id: 'hole', label: 'Hole size % (0 = pie)', type: 'number', def: 55 }, { id: 'sort', label: 'Sort largest first', type: 'checkbox', def: false }, { id: 'decimals', label: 'Percent decimals', type: 'number', def: 1 }, { id: 'title', label: 'Title', type: 'text', def: 'Traffic by channel' }, ...sizeOpts(640, 400)],
  run: ([src], o) => {
    let d = parseCsv(need(src, 'category and value pairs')).map((r) => ({ l: r[0], v: numv(r[1]) }));
    if (d.some((x) => !Number.isFinite(x.v))) throw new Error('Every row needs a number in the second column.'); if (d.some((x) => x.v < 0)) throw new Error('Pie slices cannot be negative.');
    d = d.filter((x) => x.v > 0); const tot = sum(d.map((x) => x.v)); if (!tot) throw new Error('All values are zero.'); if (d.length > 40) throw new Error('At most 40 slices.');
    if (o.sort) d.sort((a, b) => b.v - a.v);
    const [W, H] = dims(o, 640, 400), dec = Math.round(optNum(o.decimals, 1, 0, 3)), hole = optNum(o.hole, 55, 0, 90) / 100;
    const items = d.map((x, i) => [PAL[i % PAL.length], `${x.l} (${round((100 * x.v) / tot, dec)}%)`]);
    const lw = Math.min(W * 0.45, Math.max(...items.map((i) => px(i[1], 12))) + 30), cx = (W - lw) / 2, cy = (H + (o.title ? 24 : 0)) / 2, r = Math.min((W - lw) / 2, (H - (o.title ? 50 : 20)) / 2) - 6, ri = r * hole;
    let g = '', a0 = -Math.PI / 2;
    const P = (R, a) => `${(cx + R * Math.cos(a)).toFixed(2)} ${(cy + R * Math.sin(a)).toFixed(2)}`;
    d.forEach((x, i) => {
      const a1 = a0 + (x.v / tot) * 2 * Math.PI, big = a1 - a0 > Math.PI ? 1 : 0, c = PAL[i % PAL.length], tip = `<title>${esc(x.l)}: ${fmt(x.v)} (${round((100 * x.v) / tot, dec)}%)</title>`;
      if (d.length === 1) g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>${ri ? `<circle cx="${cx}" cy="${cy}" r="${ri}" fill="#fff"/>` : ''}`;
      else g += `<path d="M${P(r, a0)} A${r} ${r} 0 ${big} 1 ${P(r, a1)} ${ri ? `L${P(ri, a1)} A${ri} ${ri} 0 ${big} 0 ${P(ri, a0)}` : `L${cx} ${cy}`} Z" fill="${c}" stroke="#fff" stroke-width="1.5">${tip}</path>`;
      if (x.v / tot >= 0.04) { const am = (a0 + a1) / 2, rr = ri ? (r + ri) / 2 : r * 0.66, tc = inkOn(c); g += `<text x="${(cx + rr * Math.cos(am)).toFixed(1)}" y="${(cy + rr * Math.sin(am) + 4).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="600" fill="${tc}">${round((100 * x.v) / tot, dec)}%</text>`; }
      a0 = a1;
    });
    items.forEach(([c, l], i) => { g += `<rect x="${W - lw}" y="${(o.title ? 44 : 20) + i * 20}" width="12" height="12" fill="${c}"/><text x="${W - lw + 18}" y="${(o.title ? 44 : 20) + i * 20 + 10}">${esc(cut(l, 34))}</text>`; });
    const desc = `${ri ? 'Donut' : 'Pie'} chart: ` + d.map((x) => `${x.l} ${round((100 * x.v) / tot, dec)}%`).join(', ');
    return chartResult(svgDoc(W, H, o.title || 'Pie chart', desc, titleEl(W, o.title) + g), 'pie-chart.svg', ['Category', 'Value', 'Share %'], d.map((x) => [x.l, fmt(x.v), String(round((100 * x.v) / tot, dec))]));
  },
});

// ---------------------------------------------------------------- 1402 scatter plot
function ols(pts) {
  const n = pts.length, mx = sum(pts.map((p) => p[0])) / n, my = sum(pts.map((p) => p[1])) / n;
  let sxx = 0, sxy = 0, syy = 0; for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
  const slope = sxx ? sxy / sxx : NaN, r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
  return { n, slope, intercept: my - slope * mx, r, r2: r * r };
}
T.push({
  id: 'scatter-plot-maker', cat: CH, title: 'Scatter Plot Maker with Trendline and Pearson Correlation',
  desc: 'Paste X and Y columns to draw a scatter plot with a least-squares trendline, slope, intercept, Pearson r and R squared. Accessible SVG with a data table.',
  inputs: 1, labels: ['Data: x, y per line (header row optional)'], sample: 'hours,score\n1,52\n2,55\n3,61\n4,64\n5,72\n6,70\n7,81\n8,85\n',
  opts: [{ id: 'trend', label: 'Draw trendline', type: 'checkbox', def: true }, { id: 'title', label: 'Title', type: 'text', def: 'Score by study hours' }, ...sizeOpts(640, 440)],
  run: ([src], o) => {
    let rows = parseCsv(need(src, 'x,y pairs')), head = ['x', 'y'];
    if (rows[0].length >= 2 && (isNaN(numv(rows[0][0])) || isNaN(numv(rows[0][1])))) head = rows.shift().slice(0, 2);
    const pts = rows.map((r) => [numv(r[0]), numv(r[1])]); if (pts.some((p) => !p.every(Number.isFinite))) throw new Error('Every row needs two numbers (x and y).'); if (pts.length < 2) throw new Error('Need at least 2 points.'); if (pts.length > 5000) throw new Error('At most 5000 points.');
    const f = ols(pts), [W, H] = dims(o, 640, 440), m = { t: o.title ? 38 : 14, r: 20, b: 50, l: 58 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const tx = niceTicks(Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))), ty = niceTicks(Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1])));
    const X = (v) => m.l + ((v - tx[0]) / (tx[tx.length - 1] - tx[0])) * pw, Y = (v) => m.t + ph - ((v - ty[0]) / (ty[ty.length - 1] - ty[0])) * ph;
    let g = '';
    for (const t of ty) g += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(t)}" y2="${Y(t)}" stroke="#888" stroke-opacity=".3"/><text x="${m.l - 6}" y="${Y(t) + 4}" text-anchor="end">${fmt(t)}</text>`;
    for (const t of tx) g += `<line x1="${X(t)}" x2="${X(t)}" y1="${m.t}" y2="${m.t + ph}" stroke="#888" stroke-opacity=".3"/><text x="${X(t)}" y="${m.t + ph + 16}" text-anchor="middle">${fmt(t)}</text>`;
    g += `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="none" stroke="#333"/><text x="${m.l + pw / 2}" y="${H - 8}" text-anchor="middle">${esc(head[0])}</text><text transform="translate(14 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle">${esc(head[1])}</text>`;
    if (o.trend && Number.isFinite(f.slope)) { const a = tx[0], b = tx[tx.length - 1]; g += `<line x1="${X(a)}" y1="${Y(f.intercept + f.slope * a)}" x2="${X(b)}" y2="${Y(f.intercept + f.slope * b)}" stroke="#D55E00" stroke-width="2" stroke-dasharray="6 4"/>`; }
    for (const [x, y] of pts) g += `<circle cx="${X(x).toFixed(1)}" cy="${Y(y).toFixed(1)}" r="4" fill="#0072B2" fill-opacity=".75" stroke="#fff" stroke-width=".8"><title>${esc(head[0])} ${fmt(x)}, ${esc(head[1])} ${fmt(y)}</title></circle>`;
    const stat = Number.isFinite(f.r) ? `y = ${fmt(f.slope)} x ${f.intercept < 0 ? '-' : '+'} ${fmt(Math.abs(f.intercept))};  r = ${fmt(f.r)};  R² = ${fmt(f.r2)};  n = ${f.n}` : 'x or y is constant: no trendline or correlation.';
    if (o.trend) g += `<text x="${m.l + 8}" y="${m.t + 16}" font-size="12">${esc(stat)}</text>`;
    const res = chartResult(svgDoc(W, H, o.title || 'Scatter plot', `Scatter plot of ${head[1]} against ${head[0]}, ${pts.length} points. ${stat}`, titleEl(W, o.title) + g), 'scatter-plot.svg', head, pts.map((p) => p.map(fmt)), stat);
    return res;
  },
});

// ---------------------------------------------------------------- 1403 histogram
const quantile = (s, p) => { const h = (s.length - 1) * p, i = Math.floor(h); return s[i] + (h - i) * ((s[i + 1] ?? s[i]) - s[i]); }; // linear, type 7 / Excel QUARTILE.INC
function numbersIn(text) { const v = String(text).split(/[\s,;]+/).filter(Boolean).map(numv); if (v.some((x) => !Number.isFinite(x))) throw new Error('Found something that is not a number. Use numbers separated by spaces, commas or new lines.'); return v; }
function histBins(vals, width, start) {
  const mn = Math.min(...vals), mx = Math.max(...vals);
  if (start == null || !Number.isFinite(start)) start = Math.floor(mn / width) * width; if (start > mn) throw new Error('The start value is above the smallest number.');
  const nb = Math.max(1, Math.floor((mx - start) / width + 1e-9) + 1); if (nb > 1000) throw new Error('That bin width gives more than 1000 bins.');
  const bins = Array.from({ length: nb }, (_, i) => ({ lo: start + i * width, hi: start + (i + 1) * width, n: 0 }));
  for (const v of vals) bins[Math.min(nb - 1, Math.floor((v - start) / width + 1e-9))].n++;
  return bins;
}
T.push({
  id: 'histogram-builder', cat: CH, title: 'Histogram Builder with Adjustable Bin Width',
  desc: 'Bin a list of numbers into a histogram with a bin width you choose (or an automatic Sturges width), see the counts per bin, and copy the SVG.',
  inputs: 1, labels: ['Numbers (spaces, commas or new lines)'], sample: '12 15 15 18 21 22 22 22 25 27 28 30 31 31 33 35 38 41 44 52 58 63',
  opts: [{ id: 'bin', label: 'Bin width (0 = automatic)', type: 'number', def: 10 }, { id: 'start', label: 'First bin starts at (blank = automatic)', type: 'text', def: '' }, { id: 'title', label: 'Title', type: 'text', def: 'Distribution' }, { id: 'xlabel', label: 'X axis label', type: 'text', def: 'value' }, ...sizeOpts(640, 400)],
  run: ([src], o) => {
    const vals = numbersIn(need(src, 'some numbers')); if (vals.length < 2) throw new Error('Need at least two numbers.'); if (vals.length > 100000) throw new Error('At most 100000 numbers.');
    const mn = Math.min(...vals), mx = Math.max(...vals); let w = Number(o.bin);
    if (!(w > 0)) w = niceTicks(mn, mx, Math.max(1, Math.ceil(Math.log2(vals.length) + 1)))[1] - niceTicks(mn, mx, Math.max(1, Math.ceil(Math.log2(vals.length) + 1)))[0] || 1;
    const bins = histBins(vals, w, o.start === '' ? null : numv(o.start)), [W, H] = dims(o, 640, 400), m = { t: o.title ? 38 : 14, r: 18, b: 56, l: 52 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const ty = niceTicks(0, Math.max(...bins.map((b) => b.n))), Y = (v) => m.t + ph - (v / ty[ty.length - 1]) * ph, bw = pw / bins.length;
    let g = ''; for (const t of ty) g += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(t)}" y2="${Y(t)}" stroke="#888" stroke-opacity=".3"/><text x="${m.l - 6}" y="${Y(t) + 4}" text-anchor="end">${fmt(t)}</text>`;
    bins.forEach((b, i) => { g += `<rect x="${(m.l + i * bw).toFixed(1)}" y="${Y(b.n).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${(m.t + ph - Y(b.n)).toFixed(1)}" fill="#0072B2"><title>${fmt(b.lo)} to ${fmt(b.hi)}: ${b.n}</title></rect>`; if (b.n && bw > 22) g += `<text x="${(m.l + i * bw + bw / 2).toFixed(1)}" y="${Y(b.n) - 3}" text-anchor="middle" font-size="11">${b.n}</text>`; });
    const step = Math.ceil(bins.length / Math.max(1, Math.floor(pw / 56))); bins.forEach((b, i) => { if (i % step === 0) g += `<text x="${(m.l + i * bw).toFixed(1)}" y="${m.t + ph + 16}" text-anchor="middle" font-size="11">${fmt(b.lo)}</text>`; });
    g += `<text x="${m.l + bins.length * bw}" y="${m.t + ph + 16}" text-anchor="middle" font-size="11">${fmt(bins[bins.length - 1].hi)}</text><line x1="${m.l}" x2="${m.l + pw}" y1="${m.t + ph}" y2="${m.t + ph}" stroke="#333"/><text x="${m.l + pw / 2}" y="${H - 10}" text-anchor="middle">${esc(o.xlabel || '')}</text><text transform="translate(14 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle">count</text>`;
    return chartResult(svgDoc(W, H, o.title || 'Histogram', `Histogram of ${vals.length} values in ${bins.length} bins of width ${fmt(w)}. Tallest bin: ${fmt(bins.reduce((a, b) => (b.n > a.n ? b : a)).lo)} to ${fmt(bins.reduce((a, b) => (b.n > a.n ? b : a)).hi)}.`, titleEl(W, o.title) + g), 'histogram.svg', ['Bin (from, up to but not including; last bin includes its end)', 'Count'], bins.map((b, i) => [`${fmt(b.lo)} to ${fmt(b.hi)}${i === bins.length - 1 ? ' (inclusive)' : ''}`, String(b.n)]), `Bin width ${fmt(w)}. Each bin includes its lower edge and excludes its upper edge.`);
  },
});

// ---------------------------------------------------------------- 1404 box plot
function boxStats(v) {
  const s = [...v].sort((a, b) => a - b), q1 = quantile(s, 0.25), med = quantile(s, 0.5), q3 = quantile(s, 0.75), iqr = q3 - q1, lf = q1 - 1.5 * iqr, uf = q3 + 1.5 * iqr;
  const inside = s.filter((x) => x >= lf && x <= uf);
  return { n: s.length, min: s[0], q1, med, q3, max: s[s.length - 1], lw: inside[0], uw: inside[inside.length - 1], out: s.filter((x) => x < lf || x > uf), mean: sum(s) / s.length };
}
T.push({
  id: 'box-plot-maker', cat: CH, title: 'Box and Whisker Plot Maker (Quartiles and Outliers)',
  desc: 'Paste one column per group to draw box plots with median, quartiles, 1.5 IQR whiskers and outlier points, plus a table of the five-number summary.',
  inputs: 1, labels: ['Table: header row with group names, one column of numbers per group'], sample: 'Control,Drug A,Drug B\n5.1,6.2,4.8\n5.4,6.8,5.0\n5.9,7.0,5.1\n6.1,7.4,5.3\n6.3,7.9,5.9\n6.8,8.1,6.2\n7.0,8.4,6.4\n9.8,12.5,6.6\n',
  opts: [{ id: 'horizontal', label: 'Horizontal boxes', type: 'checkbox', def: false }, { id: 'title', label: 'Title', type: 'text', def: 'Response by group' }, ...sizeOpts(640, 420)],
  run: ([src], o) => {
    const rows = pad(parseCsv(need(src, 'a table with one column per group'))), head = rows.shift(); if (!rows.length) throw new Error('Need a header row and numbers below it.');
    const groups = head.map((h, i) => ({ name: h || `Group ${i + 1}`, v: rows.map((r) => numv(r[i])).filter(Number.isFinite) })).filter((g) => g.v.length); if (!groups.length) throw new Error('No numbers found.');
    groups.forEach((g) => { g.s = boxStats(g.v); });
    const [W, H] = dims(o, 640, 420), hz = o.horizontal, m = { t: o.title ? 38 : 14, r: 18, b: hz ? 30 : 40, l: hz ? Math.min(140, Math.max(...groups.map((g) => px(cut(g.name, 18), 12))) + 14) : 52 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const all = groups.flatMap((g) => g.v), tk = niceTicks(Math.min(...all), Math.max(...all)), V = (v) => (hz ? m.l + ((v - tk[0]) / (tk[tk.length - 1] - tk[0])) * pw : m.t + ph - ((v - tk[0]) / (tk[tk.length - 1] - tk[0])) * ph);
    let g = ''; for (const t of tk) g += hz ? `<line x1="${V(t)}" x2="${V(t)}" y1="${m.t}" y2="${m.t + ph}" stroke="#888" stroke-opacity=".3"/><text x="${V(t)}" y="${m.t + ph + 16}" text-anchor="middle">${fmt(t)}</text>` : `<line x1="${m.l}" x2="${m.l + pw}" y1="${V(t)}" y2="${V(t)}" stroke="#888" stroke-opacity=".3"/><text x="${m.l - 6}" y="${V(t) + 4}" text-anchor="end">${fmt(t)}</text>`;
    const band = (hz ? ph : pw) / groups.length, bx = Math.min(70, band * 0.55);
    groups.forEach((gr, i) => {
      const c = PAL[i % PAL.length], s = gr.s, mid = (hz ? m.t : m.l) + band * (i + 0.5), A = (a, b, c2, d) => (hz ? [a, b, c2, d] : [b, a, d, c2]); // helper for orientation
      const line = (v1, v2, p1, p2, st = '#222', w = 1.5) => { const [x1, y1, x2, y2] = hz ? [V(v1), p1, V(v2), p2] : [p1, V(v1), p2, V(v2)]; return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${st}" stroke-width="${w}"/>`; };
      void A;
      g += line(s.lw, s.q1, mid, mid) + line(s.q3, s.uw, mid, mid) + line(s.lw, s.lw, mid - bx / 4, mid + bx / 4) + line(s.uw, s.uw, mid - bx / 4, mid + bx / 4);
      const a = V(s.q1), b = V(s.q3), lo = Math.min(a, b), len = Math.abs(b - a);
      g += hz ? `<rect x="${lo.toFixed(1)}" y="${(mid - bx / 2).toFixed(1)}" width="${len.toFixed(1)}" height="${bx.toFixed(1)}" fill="${c}" fill-opacity=".35" stroke="#222" stroke-width="1.5"><title>${esc(gr.name)}: Q1 ${fmt(s.q1)}, median ${fmt(s.med)}, Q3 ${fmt(s.q3)}</title></rect>` : `<rect x="${(mid - bx / 2).toFixed(1)}" y="${lo.toFixed(1)}" width="${bx.toFixed(1)}" height="${len.toFixed(1)}" fill="${c}" fill-opacity=".35" stroke="#222" stroke-width="1.5"><title>${esc(gr.name)}: Q1 ${fmt(s.q1)}, median ${fmt(s.med)}, Q3 ${fmt(s.q3)}</title></rect>`;
      g += line(s.med, s.med, mid - bx / 2, mid + bx / 2, '#111', 3);
      for (const x of s.out) g += `<circle cx="${(hz ? V(x) : mid).toFixed(1)}" cy="${(hz ? mid : V(x)).toFixed(1)}" r="3.5" fill="none" stroke="#222" stroke-width="1.5"><title>outlier ${fmt(x)}</title></circle>`;
      g += hz ? `<text x="${m.l - 6}" y="${mid + 4}" text-anchor="end">${esc(cut(gr.name, 18))}</text>` : `<text x="${mid}" y="${m.t + ph + 18}" text-anchor="middle">${esc(cut(gr.name, 16))}</text>`;
    });
    g += `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="none" stroke="#333"/>`;
    const desc = 'Box plot. ' + groups.map((x) => `${x.name}: median ${fmt(x.s.med)}, quartiles ${fmt(x.s.q1)} to ${fmt(x.s.q3)}, whiskers ${fmt(x.s.lw)} to ${fmt(x.s.uw)}, ${x.s.out.length} outliers`).join('; ');
    return chartResult(svgDoc(W, H, o.title || 'Box plot', desc, titleEl(W, o.title) + g), 'box-plot.svg', ['Group', 'n', 'Min', 'Q1', 'Median', 'Q3', 'Max', 'Lower whisker', 'Upper whisker', 'Outliers'], groups.map((x) => [x.name, x.s.n, x.s.min, x.s.q1, x.s.med, x.s.q3, x.s.max, x.s.lw, x.s.uw, x.s.out.join(' ') || '-'].map((c) => (typeof c === 'number' ? fmt(c) : c))), 'Quartiles use linear interpolation (Excel QUARTILE.INC, R type 7). Whiskers reach the most extreme value within 1.5 x IQR of the box; points beyond are outliers.');
  },
});

// ---------------------------------------------------------------- 1405 heatmap
const SCALES = { blue: ['#f1f6fb', '#9ecae1', '#2171b5', '#08306b'], viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'], heat: ['#fff7ec', '#fdbb84', '#e34a33', '#7f0000'], diverging: ['#2166ac', '#f7f7f7', '#b2182b'], gray: ['#ffffff', '#000000'] };
const ramp = (stops, t) => { t = clamp(t, 0, 1); const p = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)); return mix(stops[i], stops[i + 1], p - i); };
T.push({
  id: 'heatmap-maker', cat: CH, title: 'Heatmap Maker (Colour a Matrix by Value)',
  desc: 'Turn a grid of numbers with row and column labels into a coloured heatmap with a legend and optional cell values. Choose a colour scale; the table is the text alternative.',
  inputs: 1, labels: ['Grid: first row = column labels, first column = row labels'], sample: ',Mon,Tue,Wed,Thu,Fri\n9am,12,18,22,19,10\n12pm,30,34,41,38,25\n3pm,28,33,39,35,20\n6pm,9,11,14,12,7\n',
  opts: [{ id: 'scale', label: 'Colour scale', type: 'select', choices: ['blue', 'viridis', 'heat', 'diverging', 'gray'], def: 'blue' }, { id: 'values', label: 'Print values in cells', type: 'checkbox', def: true }, { id: 'title', label: 'Title', type: 'text', def: 'Visits by day and time' }, ...sizeOpts(640, 380)],
  run: ([src], o) => {
    const rows = pad(parseCsv(need(src, 'a grid'))); if (rows.length < 2 || rows[0].length < 2) throw new Error('Need a header row, a label column and at least one number.');
    const cols = rows[0].slice(1), body = rows.slice(1).map((r) => ({ l: r[0], v: r.slice(1).map((c) => numv(c)) })); if (body.length * cols.length > 10000) throw new Error('At most 10000 cells.');
    const all = body.flatMap((r) => r.v).filter(Number.isFinite); if (!all.length) throw new Error('No numbers found in the grid.');
    const lo = Math.min(...all), hi = Math.max(...all), stops = SCALES[o.scale] || SCALES.blue, div = o.scale === 'diverging';
    const [W, H] = dims(o, 640, 380), lw = Math.min(150, Math.max(...body.map((r) => px(cut(r.l, 18), 12))) + 12), m = { t: (o.title ? 34 : 10) + 24, r: 74, b: 12, l: lw };
    const cw = (W - m.l - m.r) / cols.length, ch = Math.min(46, (H - m.t - m.b) / body.length), H2 = m.t + ch * body.length + m.b;
    const T0 = div ? Math.max(Math.abs(lo), Math.abs(hi)) : 0, colOf = (v) => (div ? ramp(stops, 0.5 + (v / (T0 || 1)) / 2) : ramp(stops, hi === lo ? 0.5 : (v - lo) / (hi - lo)));
    let g = cols.map((c, j) => `<text x="${(m.l + (j + 0.5) * cw).toFixed(1)}" y="${m.t - 6}" text-anchor="middle">${esc(cut(c, Math.max(4, Math.floor(cw / 7))))}</text>`).join('');
    body.forEach((r, i) => { g += `<text x="${m.l - 6}" y="${(m.t + (i + 0.5) * ch + 4).toFixed(1)}" text-anchor="end">${esc(cut(r.l, 18))}</text>`; r.v.forEach((v, j) => { if (!Number.isFinite(v)) { g += `<rect x="${(m.l + j * cw).toFixed(1)}" y="${(m.t + i * ch).toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" fill="#eee" stroke="#fff"><title>${esc(r.l)}, ${esc(cols[j])}: no value</title></rect>`; return; } const c = colOf(v); g += `<rect x="${(m.l + j * cw).toFixed(1)}" y="${(m.t + i * ch).toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" fill="${c}" stroke="#fff"><title>${esc(r.l)}, ${esc(cols[j])}: ${fmt(v)}</title></rect>`; if (o.values && cw > 24 && ch > 14) g += `<text x="${(m.l + (j + 0.5) * cw).toFixed(1)}" y="${(m.t + (i + 0.5) * ch + 4).toFixed(1)}" text-anchor="middle" font-size="11" fill="${inkOn(c)}">${fmt(v)}</text>`; }); });
    const lx = W - m.r + 18, lh = Math.min(120, ch * body.length); g += `<defs><linearGradient id="hg" x1="0" y1="1" x2="0" y2="0">${Array.from({ length: 9 }, (_, k) => `<stop offset="${k / 8}" stop-color="${div ? ramp(stops, k / 8) : ramp(stops, k / 8)}"/>`).join('')}</linearGradient></defs><rect x="${lx}" y="${m.t}" width="14" height="${lh}" fill="url(#hg)" stroke="#555"/><text x="${lx + 20}" y="${m.t + 10}">${fmt(div ? T0 : hi)}</text><text x="${lx + 20}" y="${m.t + lh}">${fmt(div ? -T0 : lo)}</text>`;
    return chartResult(svgDoc(W, H2, o.title || 'Heatmap', `Heatmap of ${body.length} rows by ${cols.length} columns. Lowest ${fmt(lo)}, highest ${fmt(hi)}.`, titleEl(W, o.title) + g), 'heatmap.svg', ['', ...cols], body.map((r) => [r.l, ...r.v.map((v) => (Number.isFinite(v) ? fmt(v) : ''))]));
  },
});

// ---------------------------------------------------------------- 1406 calendar heatmap
T.push({
  id: 'calendar-heatmap', cat: CH, title: 'Calendar Heatmap (GitHub-Style Year of Daily Values)',
  desc: 'Paste dates with counts and see each day of a year as a square shaded by its value, with month labels and a legend. Dates must be YYYY-MM-DD; repeated dates are added together.',
  inputs: 1, labels: ['Data: date (YYYY-MM-DD), value per line'], sample: (() => { const r = rng(7); const out = []; for (let d = 0; d < 200; d++) { const t = Date.UTC(2026, 0, 1 + d); const dow = new Date(t).getUTCDay(); if (r() < (dow === 0 || dow === 6 ? 0.2 : 0.7)) out.push(`${isoDay(t)},${1 + Math.floor(r() * r() * 12)}`); } return out.join('\n') + '\n'; })(),
  opts: [{ id: 'year', label: 'Year (blank = latest in data)', type: 'text', def: '' }, { id: 'week', label: 'Week starts on', type: 'select', choices: ['Monday', 'Sunday'], def: 'Monday' }, { id: 'color', label: 'Colour (#rrggbb)', type: 'text', def: '#1b7f3b' }, { id: 'title', label: 'Title', type: 'text', def: 'Activity' }],
  run: ([src], o) => {
    const map = new Map(); let lines = 0;
    for (const r of parseCsv(need(src, 'date and value lines'))) { if (!/^\d{4}-\d{2}-\d{2}$/.test((r[0] || '').trim())) { if (lines === 0) continue; throw new Error(`"${r[0]}" is not a YYYY-MM-DD date.`); } lines++; const v = r.length > 1 ? numv(r[1]) : 1; if (!Number.isFinite(v)) throw new Error(`"${r[1]}" is not a number (date ${r[0]}).`); const t = parseX(r[0].trim()); if (isoDay(t) !== r[0].trim()) throw new Error(`${r[0]} is not a real date.`); map.set(t, (map.get(t) || 0) + v); }
    if (!map.size) throw new Error('No valid YYYY-MM-DD dates found.');
    const year = o.year ? Math.round(+o.year) : Math.max(...[...map.keys()].map((t) => new Date(t).getUTCFullYear())); if (!(year >= 1900 && year <= 2200)) throw new Error('Year must be between 1900 and 2200.');
    const ys = Date.UTC(year, 0, 1), ye = Date.UTC(year + 1, 0, 1), inYear = [...map].filter(([t]) => t >= ys && t < ye), mx = Math.max(0, ...inYear.map((e) => e[1])), base = okColor(o.color, '#1b7f3b');
    const mon = o.week === 'Monday', dowOf = (t) => (new Date(t).getUTCDay() + (mon ? 6 : 0)) % 7, first = dowOf(ys), cell = 13, gap = 3, step = cell + gap, ml = 32, mt = (o.title ? 56 : 34), weeks = Math.ceil((first + Math.round((ye - ys) / 864e5)) / 7), W = ml + weeks * step + 20, H = mt + 7 * step + 44;
    const level = (v) => (v <= 0 || !mx ? 0 : Math.min(4, Math.ceil((v / mx) * 4))), cols = [mix('#ffffff', '#888888', 0.2), ...[0.25, 0.5, 0.75, 1].map((t) => mix('#ffffff', base, 0.2 + 0.8 * t))];
    let g = ''; const names = mon ? ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'] : ['', 'Mon', '', 'Wed', '', 'Fri', ''];
    names.forEach((n, i) => { if (n) g += `<text x="${ml - 6}" y="${mt + i * step + 11}" text-anchor="end" font-size="11">${n}</text>`; });
    let lastMonth = -1;
    for (let t = ys, i = 0; t < ye; t += 864e5, i++) {
      const wk = Math.floor((first + i) / 7), d = dowOf(t), v = map.get(t) || 0, mo = new Date(t).getUTCMonth();
      if (mo !== lastMonth && (d === 0 || i === 0 || true) && (wk * step > 0 || i === 0)) { if (mo !== lastMonth) { g += `<text x="${ml + wk * step}" y="${mt - 8}" font-size="11">${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mo]}</text>`; lastMonth = mo; } }
      g += `<rect x="${ml + wk * step}" y="${mt + d * step}" width="${cell}" height="${cell}" rx="2" fill="${cols[level(v)]}"><title>${isoDay(t)}: ${fmt(v)}</title></rect>`;
    }
    const ly = mt + 7 * step + 20; g += `<text x="${W - 20 - 5 * 16 - 60}" y="${ly + 10}" font-size="11">Less</text>` + cols.map((c, i) => `<rect x="${W - 20 - 5 * 16 - 28 + i * 16}" y="${ly}" width="13" height="13" rx="2" fill="${c}"/>`).join('') + `<text x="${W - 20 - 28 + 4}" y="${ly + 10}" font-size="11">More</text>`;
    const days = inYear.filter((e) => e[1] > 0).length;
    const note = `${year}: ${days} active days, total ${fmt(sum(inYear.map((e) => e[1])))}, busiest day ${fmt(mx)}.`;
    return chartResult(svgDoc(W, H, o.title || 'Calendar heatmap', `Calendar heatmap for ${year}. ${note}`, titleEl(W, o.title) + g), `calendar-heatmap-${year}.svg`, ['Date', 'Value'], inYear.sort((a, b) => a[0] - b[0]).map(([t, v]) => [isoDay(t), fmt(v)]), note);
  },
});

// ---------------------------------------------------------------- shared: text wrap, trees, layered layout
const wrap = (text, maxPx, size = 12) => {
  const lines = []; let cur = '';
  for (const w of String(text).split(/\s+/).filter(Boolean)) { const t = cur ? cur + ' ' + w : w; if (cur && px(t, size) > maxPx) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines.length ? lines : [''];
};
const textLines = (lines, x, y, lh, anchor = 'middle', extra = '') => lines.map((l, i) => `<text x="${x}" y="${(y + i * lh).toFixed(1)}" text-anchor="${anchor}"${extra}>${esc(l)}</text>`).join('');
// "A/B/C,12" rows -> tree {name, own, kids:[...], total}
function pathTree(text) {
  const root = { name: 'All', own: 0, kids: [], map: new Map() }; let n = 0;
  for (const r of parseCsv(need(text, 'path and value rows'))) {
    const v = numv(r[1]); if (!Number.isFinite(v)) { if (n === 0 && r.length > 1) continue; throw new Error(`"${r[1] ?? ''}" is not a number (row "${r[0]}").`); } if (v < 0) throw new Error('Values must not be negative.');
    const parts = String(r[0]).split(/\s*[/>]\s*/).map((p) => p.trim()).filter(Boolean); if (!parts.length) continue; n++;
    let nd = root; for (const p of parts) { if (!nd.map.has(p)) { const c = { name: p, own: 0, kids: [], map: new Map() }; nd.map.set(p, c); nd.kids.push(c); } nd = nd.map.get(p); } nd.own += v;
  }
  if (!n) throw new Error('No rows found. Use "Group/Sub/Item,value".');
  const tot = (nd) => { nd.total = nd.own + sum(nd.kids.map(tot)); return nd.total; }; tot(root);
  if (!root.total) throw new Error('All values are zero.');
  if (root.kids.length === 1 && root.kids[0].kids.length) return root.kids[0]; // a single top group becomes the root
  return root;
}
const treeRows = (nd, pre = '', rows = []) => { for (const k of nd.kids) { const p = pre ? `${pre} / ${k.name}` : k.name; if (!k.kids.length) rows.push([p, fmt(k.total)]); else { if (k.own) rows.push([`${p} (own)`, fmt(k.own)]); treeRows(k, p, rows); } } return rows; };
const branchColor = (nd, root) => PAL[Math.max(0, root.kids.indexOf(nd)) % PAL.length];

// Layered layout (longest path layering, back edges set aside, barycenter ordering). nodes: [{id,main,cross}], edges: [[a,b]]
function layered(nodes, edges, gapMain, gapCross) {
  const idx = new Map(nodes.map((n, i) => [n.id, i])), out = nodes.map(() => []), inn = nodes.map(() => []), back = new Set();
  edges.forEach(([a, b], k) => { if (a !== b) out[idx.get(a)].push([idx.get(b), k]); });
  const state = nodes.map(() => 0);
  const dfs = (u) => { state[u] = 1; for (const [v, k] of out[u]) { if (state[v] === 1) back.add(k); else if (state[v] === 0) dfs(v); } state[u] = 2; };
  nodes.forEach((_, i) => { if (!state[i]) dfs(i); });
  const fwd = []; edges.forEach(([a, b], k) => { if (a !== b && !back.has(k)) { fwd.push([idx.get(a), idx.get(b)]); } });
  fwd.forEach(([a, b]) => inn[b].push(a));
  const layer = nodes.map(() => 0); let changed = true, guard = 0;
  while (changed && guard++ < nodes.length + 2) { changed = false; for (const [a, b] of fwd) if (layer[b] < layer[a] + 1) { layer[b] = layer[a] + 1; changed = true; } }
  const L = Math.max(0, ...layer) + 1, cols = Array.from({ length: L }, () => []); nodes.forEach((_, i) => cols[layer[i]].push(i));
  const order = nodes.map(() => 0); cols.forEach((c) => c.forEach((i, k) => { order[i] = k; }));
  for (let it = 0; it < 4; it++) for (const dir of [1, -1]) { const seq = dir === 1 ? cols.slice(1) : cols.slice(0, -1).reverse(); for (const c of seq) { const nb = dir === 1 ? inn : out.map((l) => l.map((x) => x[0])); const bc = (i) => { const ns = nb[i].filter((j) => layer[j] !== layer[i]); return ns.length ? sum(ns.map((j) => order[j])) / ns.length : order[i]; }; c.sort((a, b) => bc(a) - bc(b) || a - b); c.forEach((i, k) => { order[i] = k; }); } }
  const mainPos = [], lm = cols.map((c) => Math.max(...c.map((i) => nodes[i].main))); let y = 0; lm.forEach((s) => { mainPos.push(y + s / 2); y += s + gapMain; });
  const widths = cols.map((c) => sum(c.map((i) => nodes[i].cross)) + gapCross * (c.length - 1)), maxW = Math.max(...widths), pos = nodes.map(() => ({}));
  cols.forEach((c, li) => { let x = (maxW - widths[li]) / 2; for (const i of c) { pos[i] = { m: mainPos[li], c: x + nodes[i].cross / 2, layer: li }; x += nodes[i].cross + gapCross; } });
  return { pos, back, mainLen: y - gapMain, crossLen: maxW };
}

// ---------------------------------------------------------------- 1407 Sankey
T.push({
  id: 'sankey-diagram-builder', cat: CH, title: 'Sankey Diagram Builder (Flows from Source, Target, Amount)',
  desc: 'Enter rows of source, target and amount to draw a Sankey diagram whose bands match each flow, such as a budget split by department. Cycles are rejected. Accessible SVG with a flow table.',
  inputs: 1, labels: ['Flows: source, target, amount (one per line)'], sample: 'Budget,Engineering,500\nBudget,Marketing,200\nBudget,Operations,300\nEngineering,Salaries,380\nEngineering,Tools,120\nMarketing,Ads,150\nMarketing,Events,50\nOperations,Rent,180\nOperations,Salaries,120\n',
  opts: [{ id: 'title', label: 'Title', type: 'text', def: 'Where the budget goes' }, { id: 'units', label: 'Unit shown after values', type: 'text', def: '' }, ...sizeOpts(760, 440)],
  run: ([src], o) => {
    const fl = new Map();
    for (const r of parseCsv(need(src, 'source, target, amount rows'))) { if (r.length < 3) throw new Error(`Row "${r.join(',')}" needs three values: source, target, amount.`); const v = numv(r[2]); if (!Number.isFinite(v)) { if (!fl.size && r.length > 2) continue; throw new Error(`"${r[2] ?? ''}" is not a number (row ${r[0]} to ${r[1]}).`); } if (v < 0) throw new Error('Amounts must not be negative.'); const a = (r[0] || '').trim(), b = (r[1] || '').trim(); if (!a || !b) throw new Error('Each row needs a source and a target.'); if (a === b) throw new Error(`"${a}" flows to itself.`); if (v > 0) fl.set(a + '\u0000' + b, (fl.get(a + '\u0000' + b) || 0) + v); }
    if (!fl.size) throw new Error('No flows found.'); if (fl.size > 300) throw new Error('At most 300 flows.');
    const edges = [...fl].map(([k, v]) => { const [s, t] = k.split('\u0000'); return { s, t, v }; }), names = [...new Set(edges.flatMap((e) => [e.s, e.t]))];
    const nodes = names.map((n) => ({ id: n, name: n, in: 0, out: 0, main: 1, cross: 1 })), by = new Map(nodes.map((n) => [n.id, n]));
    edges.forEach((e) => { by.get(e.s).out += e.v; by.get(e.t).in += e.v; });
    // layering (cycle check)
    const layer = new Map(names.map((n) => [n, 0])); let ch = true, g = 0; while (ch) { ch = false; if (g++ > names.length + 1) throw new Error('The flows contain a cycle; a Sankey diagram needs flows that never return to an earlier node.'); for (const e of edges) if (layer.get(e.t) < layer.get(e.s) + 1) { layer.set(e.t, layer.get(e.s) + 1); ch = true; } }
    const L = Math.max(...layer.values()) + 1, cols = Array.from({ length: L }, () => []); nodes.forEach((n) => cols[layer.get(n.id)].push(n));
    const [W, H] = dims(o, 760, 440), lblW = Math.min(150, Math.max(...names.map((n) => px(cut(n, 22), 12))) + 10), m = { t: o.title ? 40 : 14, b: 14, l: 14, r: 14 }, nw = 14, ph = H - m.t - m.b, gap = 10;
    const val = (n) => Math.max(n.in, n.out); let k = Infinity; for (const c of cols) k = Math.min(k, (ph - gap * (c.length - 1)) / sum(c.map(val))); if (!(k > 0)) throw new Error('Too many nodes for this height. Increase the height.');
    const x0 = m.l + lblW * 0.0 + 0, pw = W - m.l - m.r, colX = (i) => m.l + (L === 1 ? 0 : (i * (pw - nw - lblW)) / (L - 1)) + (L > 1 ? 0 : 0);
    // order within columns: barycenter
    cols[0].sort((a, b) => b.out - a.out); cols.forEach((c) => c.forEach((n, i) => { n.o = i; }));
    for (let it = 0; it < 6; it++) for (let li = 1; li < L; li++) { for (const n of cols[li]) { const ins = edges.filter((e) => e.t === n.id); n.b = ins.length ? sum(ins.map((e) => by.get(e.s).o * e.v)) / sum(ins.map((e) => e.v)) : n.o; } cols[li].sort((a, b) => a.b - b.b); cols[li].forEach((n, i) => { n.o = i; }); }
    cols.forEach((c, li) => { const tot = sum(c.map(val)) * k + gap * (c.length - 1); let y = m.t + (ph - tot) / 2; for (const n of c) { n.x = colX(li); n.y = y; n.h = val(n) * k; y += n.h + gap; } });
    const colorOf = new Map(names.map((n, i) => [n, PAL[i % PAL.length]]));
    const outOff = new Map(names.map((n) => [n, 0])), inOff = new Map(names.map((n) => [n, 0]));
    let links = '', nd = '';
    const sorted = [...edges].sort((a, b) => by.get(a.t).y - by.get(b.t).y || a.s.localeCompare(b.s));
    const eo = new Map(); for (const n of nodes) { let off = 0; for (const e of sorted.filter((e) => e.s === n.id)) { eo.set(e, off); off += e.v * k; } } for (const n of nodes) { let off = 0; for (const e of [...edges].sort((a, b) => by.get(a.s).y - by.get(b.s).y).filter((e) => e.t === n.id)) { e.io = off; off += e.v * k; } }
    for (const e of sorted) { const a = by.get(e.s), b = by.get(e.t), w = e.v * k, ya = a.y + eo.get(e) + w / 2, yb = b.y + e.io + w / 2, xa = a.x + nw, xb = b.x, xm = (xa + xb) / 2; links += `<path d="M${xa.toFixed(1)} ${ya.toFixed(1)} C${xm.toFixed(1)} ${ya.toFixed(1)} ${xm.toFixed(1)} ${yb.toFixed(1)} ${xb.toFixed(1)} ${yb.toFixed(1)}" fill="none" stroke="${colorOf.get(e.s)}" stroke-opacity=".38" stroke-width="${Math.max(0.8, w).toFixed(1)}"><title>${esc(e.s)} to ${esc(e.t)}: ${fmt(e.v)}${esc(o.units || '')}</title></path>`; }
    for (const n of nodes) { const last = false; nd += `<rect x="${n.x.toFixed(1)}" y="${n.y.toFixed(1)}" width="${nw}" height="${Math.max(1, n.h).toFixed(1)}" fill="${colorOf.get(n.id)}"><title>${esc(n.name)}: ${fmt(val(n))}${esc(o.units || '')}</title></rect><text x="${(last ? n.x - 5 : n.x + nw + 5).toFixed(1)}" y="${(n.y + n.h / 2 + 4).toFixed(1)}" text-anchor="${last ? 'end' : 'start'}">${esc(cut(n.name, 22))} ${fmt(val(n))}${esc(o.units || '')}</text>`; }
    void x0; void outOff; void inOff;
    const desc = 'Sankey diagram. Flows: ' + edges.map((e) => `${e.s} to ${e.t} ${fmt(e.v)}`).join('; ');
    return chartResult(svgDoc(W, H, o.title || 'Sankey diagram', desc, titleEl(W, o.title) + links + nd), 'sankey.svg', ['Source', 'Target', 'Amount'], edges.map((e) => [e.s, e.t, fmt(e.v)]));
  },
});

// ---------------------------------------------------------------- 1408 treemap
function squarify(items, x, y, w, h) { // items: [{v}] sorted desc, v>0. sets .x .y .w .h
  const tot = sum(items.map((i) => i.v)), sc = (w * h) / tot; let i = 0;
  while (i < items.length) {
    const side = Math.min(w, h), worst = (r) => { const s = sum(r.map((q) => q.v * sc)), mx = Math.max(...r.map((q) => q.v * sc)), mn = Math.min(...r.map((q) => q.v * sc)); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
    let row = [items[i]], j = i + 1; while (j < items.length && worst([...row, items[j]]) <= worst(row)) { row.push(items[j]); j++; }
    const s = sum(row.map((q) => q.v * sc));
    if (w >= h) { const cw = s / h; let yy = y; for (const q of row) { const qh = (q.v * sc) / cw; Object.assign(q, { x, y: yy, w: cw, h: qh }); yy += qh; } x += cw; w -= cw; }
    else { const rh = s / w; let xx = x; for (const q of row) { const qw = (q.v * sc) / rh; Object.assign(q, { x: xx, y, w: qw, h: rh }); xx += qw; } y += rh; h -= rh; }
    i = j;
  }
}
T.push({
  id: 'treemap-maker', cat: CH, title: 'Treemap Maker (Nested Rectangles from Category Paths)',
  desc: 'Paste rows like "Documents/Reports/2025,420" and get a treemap where each rectangle has an area matching its share, with nested groups labelled. Accessible SVG with a table.',
  inputs: 1, labels: ['Rows: path (separated by / or >), value'], sample: 'Media/Video,5200\nMedia/Photos,3100\nMedia/Music,1800\nDocuments/Reports,900\nDocuments/Contracts,450\nDocuments/Invoices,300\nCode/Projects,1500\nCode/Archives,700\nSystem,1100\n',
  opts: [{ id: 'title', label: 'Title', type: 'text', def: 'Disk usage (MB)' }, { id: 'values', label: 'Show values in labels', type: 'checkbox', def: true }, ...sizeOpts(760, 480)],
  run: ([src], o) => {
    const root = pathTree(src), [W, H] = dims(o, 760, 480), top = o.title ? 34 : 6; let g = '';
    const place = (nd, x, y, w, h, depth) => {
      const kids = nd.kids.filter((k) => k.total > 0).sort((a, b) => b.total - a.total), items = kids.map((k) => ({ v: k.total, nd: k }));
      if (nd.own > 0 && kids.length) items.push({ v: nd.own, nd: { name: `${nd.name} (own)`, total: nd.own, kids: [], own: nd.own } });
      items.sort((a, b) => b.v - a.v); if (!items.length) return; squarify(items, x, y, w, h);
      for (const it of items) {
        const k = it.nd, br = depth === 0 ? k : null; void br;
        let bc = k.__c; if (depth === 0) { k.__c = PAL[items.indexOf(it) % PAL.length]; bc = k.__c; } else bc = nd.__c, k.__c = bc;
        const leaf = !k.kids.length, fill = mix(bc, '#ffffff', leaf ? 0.12 + 0.08 * depth : 0.45 + 0.1 * depth), tc = inkOn(fill), label = [`${k.name} ${fmt(k.total)}`, k.name].find((x) => o.values && px(x, 12) <= it.w - 8) || cut(k.name, Math.max(3, Math.floor((it.w - 8) / 6.7)));
        g += `<rect x="${it.x.toFixed(1)}" y="${it.y.toFixed(1)}" width="${Math.max(0, it.w).toFixed(1)}" height="${Math.max(0, it.h).toFixed(1)}" fill="${fill}" stroke="#fff" stroke-width="1.5"><title>${esc(k.name)}: ${fmt(k.total)} (${round((100 * k.total) / root.total, 1)}% of total)</title></rect>`;
        if (it.w > 34 && it.h > 16) g += `<text x="${(it.x + 5).toFixed(1)}" y="${(it.y + 14).toFixed(1)}" font-size="${leaf ? 12 : 12}" font-weight="${leaf ? 400 : 700}" fill="${tc}">${esc(label)}</text>`;
        if (!leaf && it.w > 20 && it.h > 34) place(k, it.x + 3, it.y + 18, it.w - 6, it.h - 21, depth + 1);
        else if (!leaf) { /* too small to nest */ }
      }
    };
    place(root, 6, top, W - 12, H - top - 6, 0);
    return chartResult(svgDoc(W, H, o.title || 'Treemap', `Treemap of ${root.name}, total ${fmt(root.total)}. ` + root.kids.map((k) => `${k.name} ${fmt(k.total)}`).join(', '), titleEl(W, o.title) + g), 'treemap.svg', ['Path', 'Value'], treeRows(root), `Total ${fmt(root.total)}. Rectangle area is proportional to value.`);
  },
});

// ---------------------------------------------------------------- 1409 sunburst
T.push({
  id: 'sunburst-chart-maker', cat: CH, title: 'Sunburst Chart Maker (Hierarchy as Concentric Rings)',
  desc: 'Turn "Group/Sub/Item,value" rows into a sunburst: one ring per level, arc size by value. Zoom into a branch by typing its path (the keyboard version of clicking a segment).',
  inputs: 1, labels: ['Rows: path (separated by / or >), value'], sample: 'Europe/France/Paris,12\nEurope/France/Lyon,5\nEurope/Germany/Berlin,9\nEurope/Germany/Munich,6\nAsia/Japan/Tokyo,20\nAsia/Japan/Osaka,8\nAsia/India/Delhi,15\nAmericas/USA/New York,11\nAmericas/Brazil/Sao Paulo,10\n',
  opts: [{ id: 'zoom', label: 'Zoom into path (blank = everything), e.g. Asia/Japan', type: 'text', def: '' }, { id: 'levels', label: 'Rings to show (0 = all)', type: 'number', def: 0 }, { id: 'title', label: 'Title', type: 'text', def: 'Visitors by region' }, ...sizeOpts(620, 620)],
  run: ([src], o) => {
    let root = pathTree(src);
    if (o.zoom && o.zoom.trim()) { for (const p of o.zoom.split(/\s*[/>]\s*/).map((x) => x.trim()).filter(Boolean)) { const k = root.kids.find((x) => x.name.toLowerCase() === p.toLowerCase()); if (!k) throw new Error(`No branch "${p}" under "${root.name}". Branches: ${root.kids.map((x) => x.name).join(', ')}`); root = k; } if (!root.kids.length) throw new Error('That branch has no children to show.'); }
    const depthOf = (n) => 1 + Math.max(0, ...n.kids.map(depthOf)), maxD = Math.max(1, depthOf(root) - 1), rings = o.levels > 0 ? Math.min(maxD, Math.round(o.levels)) : maxD;
    const [W, H] = dims(o, 620, 620), cx = W / 2, cy = (H + (o.title ? 30 : 0)) / 2, R = Math.min(W, H - (o.title ? 30 : 0)) / 2 - 8, r0 = R * 0.2, rw = (R - r0) / rings; let g = '';
    const P = (r, a) => `${(cx + r * Math.sin(a)).toFixed(2)} ${(cy - r * Math.cos(a)).toFixed(2)}`;
    const arc = (nd, a0, a1, d, base, topIdx) => {
      const kids = [...nd.kids].sort((a, b) => b.total - a.total); let a = a0;
      const items = kids.map((k) => ({ k, v: k.total })); if (nd.own > 0 && kids.length) items.push({ k: { name: `${nd.name} (own)`, total: nd.own, kids: [] }, v: nd.own });
      items.forEach((it, i) => {
        const span = (it.v / nd.total) * (a1 - a0) * (nd.total ? 1 : 1) || 0, b = a + span, ti = d === 1 ? i : topIdx, col = d === 1 ? PAL[i % PAL.length] : base, fill = mix(col, '#ffffff', 0.08 * d + 0.05), ri = r0 + (d - 1) * rw, ro = r0 + d * rw;
        if (span > 0.0005) {
          const big = span > Math.PI ? 1 : 0, full = span >= 2 * Math.PI - 1e-6;
          g += `<path d="${full ? `M${P(ro, 0)} A${ro} ${ro} 0 1 1 ${P(ro, Math.PI)} A${ro} ${ro} 0 1 1 ${P(ro, 0)} Z M${P(ri, 0)} A${ri} ${ri} 0 1 0 ${P(ri, Math.PI)} A${ri} ${ri} 0 1 0 ${P(ri, 0)} Z` : `M${P(ro, a)} A${ro} ${ro} 0 ${big} 1 ${P(ro, b)} L${P(ri, b)} A${ri} ${ri} 0 ${big} 0 ${P(ri, a)} Z`}" fill="${fill}" fill-rule="evenodd" stroke="#fff" stroke-width="1"><title>${esc(it.k.name)}: ${fmt(it.k.total)} (${round((100 * it.k.total) / root.total, 1)}%)</title></path>`;
          const mid = (a + b) / 2, rm = (ri + ro) / 2, arcLen = span * rm;
          const nm = cut(it.k.name, 14), tl = px(nm, 11), deg = (mid * 180) / Math.PI, tang = arcLen > tl + 8, ok = tang || (rw > tl + 6 && arcLen > 14);
          if (ok) { const rot = tang ? (deg > 90 && deg < 270 ? deg + 180 : deg) : (deg > 180 ? deg + 90 : deg - 90); g += `<text transform="translate(${P(rm, mid)}) rotate(${rot.toFixed(1)})" text-anchor="middle" dy="4" font-size="11" fill="${inkOn(fill)}">${esc(nm)}</text>`; }
          if (d < rings && it.k.kids.length) arc(it.k, a, b, d + 1, col, ti);
        }
        a = b;
      });
    };
    arc(root, 0, 2 * Math.PI, 1, '', 0);
    g += `<circle cx="${cx}" cy="${cy}" r="${r0 - 2}" fill="#f4f4f4" stroke="#fff"/>${textLines(wrap(root.name, r0 * 1.6, 12), cx, cy - 4, 14, 'middle', ' font-weight="700"')}<text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="11">${fmt(root.total)}</text>`;
    return chartResult(svgDoc(W, H, o.title || 'Sunburst chart', `Sunburst of ${root.name}, total ${fmt(root.total)}, ${rings} rings. ` + root.kids.map((k) => `${k.name} ${fmt(k.total)}`).join(', '), titleEl(W, o.title) + g), 'sunburst.svg', ['Path', 'Value'], treeRows(root));
  },
});

// ---------------------------------------------------------------- 1410 radar
T.push({
  id: 'radar-chart-maker', cat: CH, title: 'Radar (Spider) Chart Maker for Comparing Items',
  desc: 'Compare several items across the same attributes. Enter a header row of attribute names and one row of scores per item; each item is drawn as a polygon on shared radial axes.',
  inputs: 1, labels: ['Table: header = attributes, then item name and scores'], sample: 'item,Speed,Power,Range,Comfort,Price\nModel A,8,6,7,5,9\nModel B,6,9,5,8,4\nModel C,7,7,8,7,6\n',
  opts: [{ id: 'max', label: 'Axis maximum (blank = automatic)', type: 'text', def: '' }, { id: 'rings', label: 'Rings', type: 'number', def: 5 }, { id: 'fill', label: 'Fill polygons', type: 'checkbox', def: true }, { id: 'title', label: 'Title', type: 'text', def: 'Model comparison' }, ...sizeOpts(560, 520)],
  run: ([src], o) => {
    const rows = pad(parseCsv(need(src, 'a table'))), head = rows.shift(), attrs = head.slice(1); if (attrs.length < 3) throw new Error('Need at least 3 attribute columns.'); if (attrs.length > 24) throw new Error('At most 24 attributes.');
    const items = rows.map((r) => ({ n: r[0], v: attrs.map((_, i) => numv(r[i + 1])) })); if (!items.length) throw new Error('Need at least one item row.'); if (items.some((it) => it.v.some((x) => !Number.isFinite(x)))) throw new Error('All scores must be numbers.');
    const lo = Math.min(0, ...items.flatMap((i) => i.v)), hiAuto = niceTicks(lo, Math.max(...items.flatMap((i) => i.v)), 4).pop(), hi = o.max !== '' && Number.isFinite(+o.max) && +o.max > lo ? +o.max : hiAuto, rn = Math.round(optNum(o.rings, 5, 2, 10));
    const [W, H] = dims(o, 560, 520), legend = legendRow(items.map((it, i) => [PAL[i % PAL.length], it.n]), 0, 0, W - 30), cy = (H + (o.title ? 30 : 0) - 24 * (1 + Math.round(legend[1] / 18))) / 2 + 4, cx = W / 2, R = Math.min(W / 2 - 70, cy - (o.title ? 56 : 30)), n = attrs.length;
    const pt = (i, v) => { const a = (2 * Math.PI * i) / n - Math.PI / 2, r = ((v - lo) / (hi - lo)) * R; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    let g = ''; for (let k = 1; k <= rn; k++) { g += `<polygon points="${attrs.map((_, i) => pt(i, lo + ((hi - lo) * k) / rn).map((x) => x.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#888" stroke-opacity=".4"/><text x="${cx + 3}" y="${(cy - (R * k) / rn).toFixed(1)}" font-size="10" fill="#555">${fmt(lo + ((hi - lo) * k) / rn)}</text>`; }
    attrs.forEach((a, i) => { const [x, y] = pt(i, hi), [lx, ly] = pt(i, hi + (hi - lo) * 0.1); g += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#888" stroke-opacity=".5"/><text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end'}">${esc(cut(a, 16))}</text>`; });
    items.forEach((it, k) => { const c = PAL[k % PAL.length], pts = it.v.map((v, i) => pt(i, v).map((x) => x.toFixed(1)).join(',')).join(' '); g += `<polygon points="${pts}" fill="${o.fill ? c : 'none'}" fill-opacity=".18" stroke="${c}" stroke-width="2"/>` + it.v.map((v, i) => { const [x, y] = pt(i, v); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${c}"><title>${esc(it.n)}, ${esc(attrs[i])}: ${fmt(v)}</title></circle>`; }).join(''); });
    g += legendRow(items.map((it, i) => [PAL[i % PAL.length], it.n]), 15, H - 12 - 18 * Math.round(legend[1] / 18), W - 15)[0];
    return chartResult(svgDoc(W, H, o.title || 'Radar chart', `Radar chart of ${items.length} items on ${n} attributes (${attrs.join(', ')}), scale ${fmt(lo)} to ${fmt(hi)}.`, titleEl(W, o.title) + g), 'radar-chart.svg', ['Item', ...attrs], items.map((it) => [it.n, ...it.v.map(fmt)]));
  },
});

// ---------------------------------------------------------------- 1411 Gantt
const DAY = 864e5;
T.push({
  id: 'gantt-chart-maker', cat: CH, title: 'Gantt Chart Maker (Tasks, Durations and Dependencies)',
  desc: 'List tasks with a start date or the task they follow, plus a duration in days, and get a Gantt chart with dependency arrows and a schedule table. Calendar days, no weekends or holidays.',
  inputs: 1, labels: ['Tasks: task, start (YYYY-MM-DD, or blank), days, after (task names separated by ;)'], sample: 'Task,Start,Days,After\nPlan,2026-03-02,5,\nDesign,,10,Plan\nBuild backend,,15,Design\nBuild frontend,,12,Design\nTest,,7,Build backend;Build frontend\nLaunch,,1,Test\n',
  opts: [{ id: 'title', label: 'Title', type: 'text', def: 'Project plan' }, ...sizeOpts(820, 0)],
  run: ([src], o) => {
    let rows = parseCsv(need(src, 'task rows')); if (/^task|^name/i.test(rows[0][0]) && isNaN(numv(rows[0][2]))) rows.shift(); if (!rows.length) throw new Error('No tasks.'); if (rows.length > 150) throw new Error('At most 150 tasks.');
    const tasks = rows.map((r, i) => { const d = numv(r[2]); if (!(d > 0)) throw new Error(`Task "${r[0]}": days must be a positive number.`); const st = (r[1] || '').trim() ? parseX(r[1]) : null; if (st !== null && (!Number.isFinite(st) || isoDay(st) !== r[1].trim())) throw new Error(`Task "${r[0]}": start must be a real YYYY-MM-DD date.`); return { i, n: (r[0] || '').trim(), st, d, after: (r[3] || '').split(';').map((x) => x.trim()).filter(Boolean) }; });
    const by = new Map(); for (const t of tasks) { if (!t.n) throw new Error('A task has no name.'); if (by.has(t.n.toLowerCase())) throw new Error(`Duplicate task name "${t.n}".`); by.set(t.n.toLowerCase(), t); }
    for (const t of tasks) { t.deps = t.after.map((a) => { const d = by.get(a.toLowerCase()); if (!d) throw new Error(`Task "${t.n}" follows "${a}", which is not in the list.`); return d; }); if (t.st === null && !t.deps.length) throw new Error(`Task "${t.n}" needs a start date or a task to follow.`); }
    const state = new Map(), calc = (t) => { if (state.get(t) === 1) throw new Error(`Dependency loop involving "${t.n}".`); if (state.get(t) === 2) return; state.set(t, 1); let s = t.st; for (const d of t.deps) { calc(d); const e = d.s + d.d * DAY; s = s === null ? e : Math.max(s, e); } t.s = s; t.e = t.s + t.d * DAY; state.set(t, 2); }; tasks.forEach(calc);
    const t0 = Math.min(...tasks.map((t) => t.s)), t1 = Math.max(...tasks.map((t) => t.e)), span = Math.round((t1 - t0) / DAY), W = Math.round(optNum(o.w, 820, 400, 2400)), rh = 26, lw = Math.min(200, Math.max(...tasks.map((t) => px(cut(t.n, 26), 12))) + 14), m = { t: (o.title ? 40 : 14) + 22, l: lw, r: 20, b: 14 }, H = m.t + tasks.length * rh + m.b, pw = W - m.l - m.r, X = (t) => m.l + ((t - t0) / (t1 - t0)) * pw;
    const steps = [1, 2, 7, 14, 30, 60, 90, 180, 365], stepD = steps.find((s) => span / s <= Math.max(4, pw / 80)) || 365; let g = `<defs><marker id="ga" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#444"/></marker></defs>`;
    for (let d = 0; d <= span; d += stepD) { const x = X(t0 + d * DAY); g += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${m.t - 6}" y2="${m.t + tasks.length * rh}" stroke="#888" stroke-opacity=".3"/><text x="${x.toFixed(1)}" y="${m.t - 10}" font-size="11" text-anchor="middle">${isoDay(t0 + d * DAY).slice(span > 200 ? 0 : 5)}</text>`; }
    tasks.forEach((t, i) => { const y = m.t + i * rh; g += `<text x="${m.l - 8}" y="${y + 17}" text-anchor="end">${esc(cut(t.n, 26))}</text><rect x="${X(t.s).toFixed(1)}" y="${y + 4}" width="${Math.max(2, X(t.e) - X(t.s)).toFixed(1)}" height="${rh - 9}" rx="3" fill="${PAL[i % PAL.length]}"><title>${esc(t.n)}: ${isoDay(t.s)} for ${fmt(t.d)} days, ends ${isoDay(t.e - DAY)}</title></rect>`; });
    tasks.forEach((t, i) => { for (const d of t.deps) { const j = tasks.indexOf(d), x1 = X(d.e), y1 = m.t + j * rh + rh / 2, x2 = X(t.s), y2 = m.t + i * rh + rh / 2; g += `<path d="M${x1.toFixed(1)} ${y1} H${(x1 + 6).toFixed(1)} V${y2} H${(x2 - 1).toFixed(1)}" fill="none" stroke="#444" stroke-width="1.2" marker-end="url(#ga)"/>`; } });
    return chartResult(svgDoc(W, H, o.title || 'Gantt chart', `Gantt chart of ${tasks.length} tasks from ${isoDay(t0)} to ${isoDay(t1 - DAY)}. ` + tasks.map((t) => `${t.n}: ${isoDay(t.s)} to ${isoDay(t.e - DAY)}`).join('; '), titleEl(W, o.title) + g), 'gantt-chart.svg', ['Task', 'Start', 'Last day', 'Days', 'Follows'], tasks.map((t) => [t.n, isoDay(t.s), isoDay(t.e - DAY), fmt(t.d), t.after.join('; ') || '-']), 'Durations count calendar days. A task that follows others starts the day after the latest one ends.');
  },
});

// ---------------------------------------------------------------- 1412 flowchart
function parseFlow(text) {
  const nodes = new Map(), edges = []; const shapeOf = (raw) => { raw = raw.trim(); let m; if ((m = /^\((.*)\)$/.exec(raw))) return { t: m[1].trim(), s: 'term' }; if ((m = /^\{(.*)\}$/.exec(raw))) return { t: m[1].trim(), s: 'dec' }; if ((m = /^\[(.*)\]$/.exec(raw))) return { t: m[1].trim(), s: 'box' }; return { t: raw, s: raw.endsWith('?') ? 'dec' : 'box' }; };
  const get = (raw) => { const sh = shapeOf(raw); if (!sh.t) throw new Error('Empty step name in an arrow chain.'); const key = sh.t.toLowerCase(); if (!nodes.has(key)) nodes.set(key, { id: key, text: sh.t, shape: sh.s }); else if (sh.s !== 'box' && nodes.get(key).shape === 'box') nodes.get(key).shape = sh.s; return nodes.get(key); };
  for (const line of text.split(/\r?\n/)) {
    const l = line.replace(/\s+#.*$/, '').trim(); if (!l || l.startsWith('#')) continue;
    const parts = [], re = /\s+-([^>]*?)->\s+|\s*->\s*/g; let last = 0, m, labels = [];
    while ((m = re.exec(l))) { parts.push(l.slice(last, m.index)); labels.push((m[1] || '').trim()); last = re.lastIndex; }
    parts.push(l.slice(last));
    if (parts.length === 1) { get(parts[0]); continue; }
    for (let i = 0; i < parts.length - 1; i++) { const a = get(parts[i]), b = get(parts[i + 1]); edges.push({ a: a.id, b: b.id, label: labels[i] }); }
  }
  if (!nodes.size) throw new Error('No steps found. Write lines like: Start -> Check input -> End');
  return { nodes: [...nodes.values()], edges };
}
T.push({
  id: 'flowchart-maker', cat: CH, title: 'Flowchart Maker from Text Arrows (SVG)',
  desc: 'Type lines such as "Start -> Check input? -yes-> Save -> End" and get a laid-out flowchart as SVG: boxes, rounded terminals, decision diamonds and labelled arrows.',
  inputs: 1, labels: ['Steps: A -> B -> C. (Text) = terminal, {Text} or text ending in ? = decision, -label-> labels an arrow'], sample: '(Start) -> Enter email -> Valid email? -yes-> Create account -> Send welcome mail -> (Done)\nValid email? -no-> Show error -> Enter email\n',
  opts: [{ id: 'dir', label: 'Direction', type: 'select', choices: ['top to bottom', 'left to right'], def: 'top to bottom' }, { id: 'title', label: 'Title', type: 'text', def: '' }],
  run: ([src], o) => {
    const { nodes, edges } = parseFlow(need(src, 'some arrow lines')); if (nodes.length > 80) throw new Error('At most 80 steps.');
    const lr = o.dir === 'left to right';
    nodes.forEach((n) => { n.lines = wrap(n.text, 150, 12); n.w = Math.max(n.shape === 'term' ? 90 : 80, Math.max(...n.lines.map((l) => px(l, 12))) + (n.shape === 'dec' ? 56 : 28)); n.h = Math.max(n.shape === 'dec' ? 60 : 38, n.lines.length * 15 + (n.shape === 'dec' ? 34 : 16)); n.main = lr ? n.w : n.h; n.cross = lr ? n.h : n.w; });
    const L = layered(nodes, edges.map((e) => [e.a, e.b]), 56, 36), idx = new Map(nodes.map((n, i) => [n.id, i])), pad0 = 24, top = o.title ? 36 : 0;
    nodes.forEach((n, i) => { const p = L.pos[i]; n.cx = (lr ? p.m : p.c) + pad0; n.cy = (lr ? p.c : p.m) + pad0 + top; });
    const W = Math.ceil((lr ? L.mainLen : L.crossLen) + 2 * pad0) + 30, H = Math.ceil((lr ? L.crossLen : L.mainLen) + 2 * pad0 + top);
    let g = `<defs><marker id="fa" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 z" fill="#333"/></marker></defs>`;
    const anchor = (n, dx, dy) => { // point on the node boundary toward direction (dx,dy)
      if (n.shape === 'dec') { const k = 1 / (Math.abs(dx) / (n.w / 2) + Math.abs(dy) / (n.h / 2) || 1); return [n.cx + dx * k, n.cy + dy * k]; }
      const k = Math.min(Math.abs(dx) ? n.w / 2 / Math.abs(dx) : Infinity, Math.abs(dy) ? n.h / 2 / Math.abs(dy) : Infinity); return [n.cx + dx * k, n.cy + dy * k];
    };
    edges.forEach((e, k) => {
      const a = nodes[idx.get(e.a)], b = nodes[idx.get(e.b)], back = L.back.has(k) || a === b; let d, lx, ly;
      if (a === b) { const x = a.cx + a.w / 2; d = `M${x} ${a.cy - 8} C${x + 40} ${a.cy - 30} ${x + 40} ${a.cy + 30} ${x} ${a.cy + 8}`; lx = x + 34; ly = a.cy; }
      else if (back) { const side = lr ? 0 : 1, off = 60; const [x1, y1] = anchor(a, side ? 1 : 0, side ? 0 : 1), [x2, y2] = anchor(b, side ? 1 : 0, side ? 0 : 1); const bx = Math.max(a.cx + a.w / 2, b.cx + b.w / 2) + off, by = Math.max(a.cy + a.h / 2, b.cy + b.h / 2) + off; d = side ? `M${x1} ${y1} C${bx} ${y1} ${bx} ${y2} ${x2} ${y2}` : `M${x1} ${y1} C${x1} ${by} ${x2} ${by} ${x2} ${y2}`; lx = side ? bx - 12 : (x1 + x2) / 2; ly = side ? (y1 + y2) / 2 : by - 10; }
      else { const dx = b.cx - a.cx, dy = b.cy - a.cy, [x1, y1] = anchor(a, lr ? 1 : dx / (Math.abs(dy) || 1) * 0.0001, lr ? dy / (Math.abs(dx) || 1) * 0.0001 : 1), [x2, y2] = anchor(b, lr ? -1 : 0, lr ? 0 : -1); void dx; void dy; const mid = lr ? (x1 + x2) / 2 : (y1 + y2) / 2; d = lr ? `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}` : `M${x1} ${y1} C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`; lx = (x1 + x2) / 2 + 4; ly = (y1 + y2) / 2 - 4; }
      g += `<path d="${d}" fill="none" stroke="#333" stroke-width="1.5" marker-end="url(#fa)"/>`;
      if (e.label) g += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="11" paint-order="stroke" stroke="#fff" stroke-width="4" text-anchor="middle">${esc(e.label)}</text>`;
    });
    nodes.forEach((n, i) => {
      const c = n.shape === 'dec' ? '#FFF3C4' : n.shape === 'term' ? '#D6EBDD' : '#DCEBF7'; let shape;
      if (n.shape === 'dec') shape = `<polygon points="${n.cx},${n.cy - n.h / 2} ${n.cx + n.w / 2},${n.cy} ${n.cx},${n.cy + n.h / 2} ${n.cx - n.w / 2},${n.cy}" fill="${c}" stroke="#333" stroke-width="1.5"/>`;
      else shape = `<rect x="${n.cx - n.w / 2}" y="${n.cy - n.h / 2}" width="${n.w}" height="${n.h}" rx="${n.shape === 'term' ? n.h / 2 : 4}" fill="${c}" stroke="#333" stroke-width="1.5"/>`;
      g += `<g>${shape}${textLines(n.lines, n.cx, n.cy - ((n.lines.length - 1) * 15) / 2 + 4, 15)}</g>`; void i;
    });
    const rows = edges.map((e) => [nodes[idx.get(e.a)].text, e.label || '', nodes[idx.get(e.b)].text]);
    return chartResult(svgDoc(W, H, o.title || 'Flowchart', `Flowchart with ${nodes.length} steps: ` + rows.map((r) => `${r[0]}${r[1] ? ` (${r[1]})` : ''} to ${r[2]}`).join('; '), titleEl(W, o.title) + g), 'flowchart.svg', ['From', 'Label', 'To'], rows, 'Layout is automatic. Crowded graphs with many crossing arrows are better drawn by hand.');
  },
});

// ---------------------------------------------------------------- 1413 mind map
function parseOutline(text) {
  const root = { text: '', kids: [], d: -1 }, st = [root];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue; const m = /^([ \t]*)(?:[-*+]\s+|\d+[.)]\s+)?(.*)$/.exec(raw), ind = m[1].replace(/\t/g, '  ').length, lvl = Math.floor(ind / 2);
    while (st.length > 1 && st[st.length - 1].ind >= ind) st.pop();
    const n = { text: m[2].trim(), kids: [], ind, d: st.length - 1 }; void lvl; st[st.length - 1].kids.push(n); st.push(n);
  }
  return root;
}
T.push({
  id: 'mind-map-svg-builder', cat: CH, title: 'Mind Map Builder from an Indented Outline (SVG)',
  desc: 'Turn an indented list into a mind map drawn as an SVG tree with coloured branches. Limit the levels shown to collapse deeper branches, with a "+n" badge on collapsed nodes.',
  inputs: 1, labels: ['Outline: indent children by 2 spaces (bullets optional)'], sample: 'Launch plan\n  Product\n    Pricing\n    Docs\n    Onboarding\n  Marketing\n    Blog posts\n    Newsletter\n    Social\n  Support\n    Help centre\n    Chat\n',
  opts: [{ id: 'levels', label: 'Levels to show (0 = all)', type: 'number', def: 0 }, { id: 'title', label: 'Title', type: 'text', def: '' }],
  run: ([src], o) => {
    let top = parseOutline(need(src, 'an indented outline')); if (!top.kids.length) throw new Error('No lines found.');
    const root = top.kids.length === 1 ? top.kids[0] : { text: 'Map', kids: top.kids, ind: -1 }, lim = o.levels > 0 ? Math.round(o.levels) : 99, count = (n) => 1 + sum(n.kids.map(count)); if (count(root) > 400) throw new Error('At most 400 nodes.');
    const nodes = []; const walk = (n, d, br) => { n.depth = d; n.br = br; nodes.push(n); n.hidden = n.kids.length && d >= lim ? count(n) - 1 : 0; if (d < lim) n.kids.forEach((k, i) => walk(k, d + 1, d === 0 ? i : br)); };
    walk(root, 0, 0);
    const vis = nodes, maxD = Math.max(...vis.map((n) => n.depth)), colW = Array.from({ length: maxD + 1 }, (_, d) => Math.max(...vis.filter((n) => n.depth === d).map((n) => px(cut(n.text, 28), 12) + 26)));
    let y = 0; const place = (n) => { const ks = n.depth < lim ? n.kids : []; if (!ks.length) { n.y = y; y += 30; } else { ks.forEach(place); n.y = (ks[0].y + ks[ks.length - 1].y) / 2; } }; place(root);
    const xs = []; let x = 16; for (let d = 0; d <= maxD; d++) { xs.push(x); x += colW[d] + 44; }
    const W = Math.ceil(x), H = Math.ceil(y + 20), tt = o.title ? 34 : 0; let g = '';
    const col = (n) => (n.depth === 0 ? '#444444' : PAL[n.br % PAL.length]);
    for (const n of vis) { if (n.depth < lim) for (const k of n.kids) { const x1 = xs[n.depth] + colW[n.depth], y1 = n.y + 18 + tt, x2 = xs[k.depth], y2 = k.y + 18 + tt, m = (x1 + x2) / 2; g += `<path d="M${x1} ${y1} C${m} ${y1} ${m} ${y2} ${x2} ${y2}" fill="none" stroke="${col(k)}" stroke-width="2"/>`; } }
    for (const n of vis) { const w = colW[n.depth], c = col(n), fill = n.depth === 0 ? c : mix(c, '#ffffff', 0.75); g += `<rect x="${xs[n.depth]}" y="${n.y + 4 + tt}" width="${w}" height="26" rx="13" fill="${fill}" stroke="${c}" stroke-width="1.5"/><text x="${xs[n.depth] + w / 2}" y="${n.y + 21 + tt}" text-anchor="middle" fill="${n.depth === 0 ? '#fff' : '#1a1a1a'}" font-weight="${n.depth === 0 ? 700 : 400}">${esc(cut(n.text, 28))}</text>`; if (n.hidden) g += `<text x="${xs[n.depth] + w + 6}" y="${n.y + 21 + tt}" font-size="11" fill="#555">+${n.hidden}</text>`; }
    const lines = []; const dump = (n, d) => { lines.push(['  '.repeat(d) + n.text]); if (d < lim) n.kids.forEach((k) => dump(k, d + 1)); }; dump(root, 0);
    return chartResult(svgDoc(W, H + tt, o.title || root.text || 'Mind map', `Mind map of "${root.text}" with ${vis.length} nodes shown.`, titleEl(W, o.title) + g), 'mind-map.svg', ['Outline (as shown)'], lines);
  },
});

// ---------------------------------------------------------------- 1414 network graph
T.push({
  id: 'network-graph-visualizer', cat: CH, title: 'Network Graph Visualizer (Force-Directed Layout from an Edge List)',
  desc: 'Paste connected pairs (a,b or a -> b) and nodes arrange themselves by simulated attraction and repulsion. Components get colours, node size follows degree, and a degree table is included.',
  inputs: 1, labels: ['Edges: one pair per line, "a,b" or "a -> b", optional weight as third value'], sample: 'Ann,Bob\nAnn,Cara\nBob,Cara\nCara,Dev\nDev,Eli\nEli,Fay\nDev,Fay\nGus,Hana\nHana,Ivy\nIvy,Gus\n',
  opts: [{ id: 'labels', label: 'Show labels', type: 'checkbox', def: true }, { id: 'seed', label: 'Layout seed', type: 'number', def: 1 }, { id: 'title', label: 'Title', type: 'text', def: '' }, ...sizeOpts(700, 520)],
  run: ([src], o) => {
    const edges = []; for (const l of need(src, 'an edge list').split(/\r?\n/)) { const s = l.trim(); if (!s || s.startsWith('#')) continue; let p = /->|<->|--/.test(s) ? s.split(/\s*(?:<->|->|--)\s*/) : parseCsv(s)[0]; p = p.map((x) => x.trim()); if (p.length < 2 || !p[0] || !p[1]) throw new Error(`Cannot read the edge "${s}".`); edges.push([p[0], p[1]]); }
    const names = [...new Set(edges.flat())]; if (names.length > 300) throw new Error('At most 300 nodes.'); if (edges.length > 1500) throw new Error('At most 1500 edges.');
    const id = new Map(names.map((n, i) => [n, i])), n = names.length, deg = new Array(n).fill(0), par = names.map((_, i) => i), find = (a) => (par[a] === a ? a : (par[a] = find(par[a])));
    const E = [...new Set(edges.map(([a, b]) => (id.get(a) < id.get(b) ? `${id.get(a)}:${id.get(b)}` : `${id.get(b)}:${id.get(a)}`)))].map((k) => k.split(':').map(Number)).filter(([a, b]) => a !== b);
    for (const [a, b] of E) { deg[a]++; deg[b]++; par[find(a)] = find(b); }
    const [W, H] = dims(o, 700, 520), top = o.title ? 34 : 6, r = rng(Math.round(optNum(o.seed, 1, 1, 1e6))), area = (W - 80) * (H - top - 60), k = Math.sqrt(area / n) * 0.5, P = names.map((_, i) => [W / 2 + Math.cos((2 * Math.PI * i) / n) * W * 0.3 + (r() - 0.5) * 20, (H + top) / 2 + Math.sin((2 * Math.PI * i) / n) * H * 0.3 + (r() - 0.5) * 20]);
    let temp = W / 8; for (let it = 0; it < 300; it++) {
      const D = P.map(() => [0, 0]);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { let dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1], d = Math.hypot(dx, dy) || 0.01; const f = (k * k) / d; dx /= d; dy /= d; D[i][0] += dx * f; D[i][1] += dy * f; D[j][0] -= dx * f; D[j][1] -= dy * f; }
      for (const [a, b] of E) { let dx = P[a][0] - P[b][0], dy = P[a][1] - P[b][1], d = Math.hypot(dx, dy) || 0.01; const f = (d * d) / k; dx /= d; dy /= d; D[a][0] -= dx * f; D[a][1] -= dy * f; D[b][0] += dx * f; D[b][1] += dy * f; }
      for (let i = 0; i < n; i++) { D[i][0] += (W / 2 - P[i][0]) * 0.4; D[i][1] += ((H + top) / 2 - P[i][1]) * 0.4; const d = Math.hypot(D[i][0], D[i][1]) || 1, s = Math.min(d, temp); P[i][0] += (D[i][0] / d) * s; P[i][1] += (D[i][1] / d) * s; P[i][0] = clamp(P[i][0], 30, W - 30); P[i][1] = clamp(P[i][1], top + 20, H - 20); }
      temp *= 0.985;
    }
    const comps = [...new Set(names.map((_, i) => find(i)))], cOf = (i) => comps.indexOf(find(i)); let g = '';
    for (const [a, b] of E) g += `<line x1="${P[a][0].toFixed(1)}" y1="${P[a][1].toFixed(1)}" x2="${P[b][0].toFixed(1)}" y2="${P[b][1].toFixed(1)}" stroke="#888" stroke-opacity=".6"/>`;
    const showAll = o.labels && n <= 60, maxDeg = Math.max(...deg);
    names.forEach((nm, i) => { const rr = 5 + Math.sqrt(deg[i]) * 2.2; g += `<circle cx="${P[i][0].toFixed(1)}" cy="${P[i][1].toFixed(1)}" r="${rr.toFixed(1)}" fill="${PAL[cOf(i) % PAL.length]}" stroke="#fff" stroke-width="1.5"><title>${esc(nm)}: ${deg[i]} connections</title></circle>`; if (o.labels && (showAll || deg[i] >= maxDeg * 0.6)) g += `<text x="${P[i][0].toFixed(1)}" y="${(P[i][1] - rr - 3).toFixed(1)}" text-anchor="middle" font-size="11" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(cut(nm, 18))}</text>`; });
    const rows = names.map((nm, i) => [nm, String(deg[i]), `component ${cOf(i) + 1}`]).sort((a, b) => b[1] - a[1]);
    return chartResult(svgDoc(W, H, o.title || 'Network graph', `Network graph with ${n} nodes, ${E.length} edges and ${comps.length} connected components.`, titleEl(W, o.title) + g), 'network-graph.svg', ['Node', 'Connections', 'Component'], rows, `${n} nodes, ${E.length} unique edges (direction and duplicates ignored), ${comps.length} components. Layout is a Fruchterman-Reingold style force simulation; the same seed gives the same picture.`);
  },
});

// ---------------------------------------------------------------- 1415 org chart
T.push({
  id: 'org-chart-maker', cat: CH, title: 'Org Chart Maker from a CSV of People and Managers',
  desc: 'Build a top-down organisation chart from rows of name, manager and optional title. People with an empty manager become the top of the tree. Loops and unknown managers are reported.',
  inputs: 1, labels: ['Rows: name, manager, title (header row optional)'], sample: 'name,manager,title\nDana Ortiz,,CEO\nLee Chen,Dana Ortiz,CTO\nSam Park,Dana Ortiz,CFO\nAva Roy,Lee Chen,Engineering lead\nNoah Fox,Lee Chen,Design lead\nMia Kim,Ava Roy,Engineer\nOmar Ali,Ava Roy,Engineer\nZoe Hart,Sam Park,Accountant\n',
  opts: [{ id: 'title', label: 'Title', type: 'text', def: 'Organisation' }],
  run: ([src], o) => {
    let rows = parseCsv(need(src, 'name and manager rows')); if (/^(name|person|employee)$/i.test(rows[0][0].trim()) || /manager|boss|reports/i.test(rows[0][1] || '')) rows.shift(); if (!rows.length) throw new Error('No people found.'); if (rows.length > 300) throw new Error('At most 300 people.');
    const ppl = new Map(); for (const r of rows) { const n = r[0].trim(); if (!n) throw new Error('A row has no name.'); if (ppl.has(n.toLowerCase())) throw new Error(`"${n}" appears twice.`); ppl.set(n.toLowerCase(), { n, m: (r[1] || '').trim(), t: (r[2] || '').trim(), kids: [] }); }
    const roots = []; for (const p of ppl.values()) { if (!p.m) roots.push(p); else { const mgr = ppl.get(p.m.toLowerCase()); if (!mgr) throw new Error(`The manager "${p.m}" of "${p.n}" is not listed as a person.`); mgr.kids.push(p); } }
    if (!roots.length) throw new Error('Everyone has a manager, so there is no top of the tree (a loop).');
    const seen = new Set(), cw = 150, ch = 46, gx = 16, gy = 36; let leaf = 0, maxD = 0;
    const lay = (p, d) => { if (seen.has(p)) throw new Error(`Reporting loop at "${p.n}".`); seen.add(p); maxD = Math.max(maxD, d); p.d = d; if (!p.kids.length) { p.x = leaf++ * (cw + gx); } else { p.kids.forEach((k) => lay(k, d + 1)); p.x = (p.kids[0].x + p.kids[p.kids.length - 1].x) / 2; } }; roots.forEach((r) => lay(r, 0));
    if (seen.size !== ppl.size) throw new Error('Some people are in a reporting loop and cannot be placed.');
    const W = Math.ceil(leaf * (cw + gx) + 20), tt = o.title ? 34 : 0, H = (maxD + 1) * (ch + gy) + tt + 10; let g = '';
    for (const p of ppl.values()) { const px0 = p.x + 10 + cw / 2, py0 = tt + p.d * (ch + gy); for (const k of p.kids) { const kx = k.x + 10 + cw / 2, ky = tt + k.d * (ch + gy), my = (py0 + ch + ky) / 2; g += `<path d="M${px0} ${py0 + ch} V${my} H${kx} V${ky}" fill="none" stroke="#666" stroke-width="1.5"/>`; } }
    for (const p of ppl.values()) { const x = p.x + 10, y = tt + p.d * (ch + gy); g += `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="5" fill="${mix(PAL[p.d % PAL.length], '#ffffff', 0.8)}" stroke="${PAL[p.d % PAL.length]}" stroke-width="1.5"/><text x="${x + cw / 2}" y="${y + (p.t ? 19 : 28)}" text-anchor="middle" font-weight="700">${esc(cut(p.n, 22))}</text>${p.t ? `<text x="${x + cw / 2}" y="${y + 35}" text-anchor="middle" font-size="11" fill="#444">${esc(cut(p.t, 24))}</text>` : ''}`; }
    return chartResult(svgDoc(W, H, o.title || 'Org chart', `Organisation chart of ${ppl.size} people with ${roots.length} top-level ${roots.length === 1 ? 'person' : 'people'}.`, titleEl(W, o.title) + g), 'org-chart.svg', ['Name', 'Manager', 'Title', 'Level'], [...ppl.values()].map((p) => [p.n, p.m || '-', p.t || '-', String(p.d + 1)]));
  },
});

// ---------------------------------------------------------------- 1416 timeline
const parseFuzzyDate = (s) => { s = s.trim(); let m; if ((m = /^(-?\d{1,4})$/.exec(s))) return { t: Date.UTC(+m[1], 0, 1), label: s }; if ((m = /^(\d{4})-(\d{1,2})$/.exec(s))) return { t: Date.UTC(+m[1], +m[2] - 1, 1), label: s }; const t = parseX(s); return Number.isFinite(t) && isoDay(t) === s.replace(/\//g, '-').replace(/-(\d)(?!\d)/g, '-0$1') ? { t, label: s } : null; };
T.push({
  id: 'timeline-maker', cat: CH, title: 'Timeline Maker (Dated Events on a Line, SVG)',
  desc: 'Enter events as "date | title | description" and get a horizontal or vertical timeline in date order, evenly spaced or to scale. Dates can be a year, a month or a full day.',
  inputs: 1, labels: ['Events: date | title | description (one per line)'], sample: '1969 | Moon landing | Apollo 11 lands on the Moon\n1989-11-09 | Berlin Wall falls | Borders open between East and West Berlin\n1991-08 | Web goes public | The first website goes online\n2007-06-29 | First iPhone | Smartphones go mainstream\n2020-03 | Remote work boom | Offices close worldwide\n',
  opts: [{ id: 'dir', label: 'Direction', type: 'select', choices: ['horizontal', 'vertical'], def: 'horizontal' }, { id: 'scale', label: 'Spacing', type: 'select', choices: ['even', 'to scale'], def: 'even' }, { id: 'title', label: 'Title', type: 'text', def: 'Timeline' }],
  run: ([src], o) => {
    const ev = need(src, 'event lines').split(/\r?\n/).filter((l) => l.trim()).map((l) => { const p = l.includes('|') ? l.split('|') : parseCsv(l)[0]; const d = parseFuzzyDate(p[0] || ''); if (!d) throw new Error(`"${(p[0] || '').trim()}" is not a date. Use YYYY, YYYY-MM or YYYY-MM-DD.`); if (!(p[1] || '').trim()) throw new Error(`The event on ${d.label} has no title.`); return { ...d, title: p[1].trim(), text: (p.slice(2).join(' | ') || '').trim() }; }).sort((a, b) => a.t - b.t);
    if (ev.length > 60) throw new Error('At most 60 events.'); const vert = o.dir === 'vertical', t0 = ev[0].t, t1 = ev[ev.length - 1].t, scaled = o.scale === 'to scale' && t1 > t0, tt = o.title ? 34 : 0; let g = '';
    if (!vert) {
      const cw = 170, W = Math.max(480, ev.length * (cw * 0.62) + 80), H = 300 + tt, ay = tt + 150, x = (e, i) => (scaled ? 60 + ((e.t - t0) / (t1 - t0)) * (W - 120) : 60 + (ev.length === 1 ? (W - 120) / 2 : (i * (W - 120)) / (ev.length - 1)));
      g += `<line x1="30" y1="${ay}" x2="${W - 30}" y2="${ay}" stroke="#555" stroke-width="3"/>`;
      ev.forEach((e, i) => { const up = i % 2 === 0, xx = x(e, i), c = PAL[i % PAL.length], ty = up ? ay - 40 : ay + 40, tl = wrap(e.title, cw - 10, 13), dl = wrap(e.text, cw - 10, 11).slice(0, 4), bx = clamp(xx, cw / 2 + 4, W - cw / 2 - 4); g += `<line x1="${xx}" y1="${ay}" x2="${xx}" y2="${up ? ay - 28 : ay + 28}" stroke="${c}" stroke-width="2"/><circle cx="${xx}" cy="${ay}" r="7" fill="${c}" stroke="#fff" stroke-width="2"/>`; const lines = [e.label, ...tl], tot = lines.length + dl.length; const sy = up ? ty - tot * 15 + 4 : ty + 8; g += `<text x="${bx}" y="${sy}" text-anchor="middle" font-weight="700" fill="${c === '#E69F00' ? '#7a5200' : c}">${esc(e.label)}</text>` + textLines(tl, bx, sy + 15, 15, 'middle', ' font-size="13" font-weight="600"') + textLines(dl, bx, sy + 15 + tl.length * 15, 14, 'middle', ' font-size="11" fill="#444"'); });
      return chartResult(svgDoc(W, H, o.title || 'Timeline', `Timeline of ${ev.length} events from ${ev[0].label} to ${ev[ev.length - 1].label}.`, titleEl(W, o.title) + g), 'timeline.svg', ['Date', 'Event', 'Description'], ev.map((e) => [e.label, e.title, e.text]));
    }
    const W = 560, rowH = 78, H = tt + ev.length * rowH + 30, lx = 150, y = (e, i) => tt + 30 + (scaled ? ((e.t - t0) / (t1 - t0)) * (ev.length - 1) * rowH : i * rowH);
    g += `<line x1="${lx}" y1="${tt + 16}" x2="${lx}" y2="${H - 14}" stroke="#555" stroke-width="3"/>`;
    ev.forEach((e, i) => { const yy = y(e, i), c = PAL[i % PAL.length]; g += `<circle cx="${lx}" cy="${yy}" r="7" fill="${c}" stroke="#fff" stroke-width="2"/><text x="${lx - 16}" y="${yy + 4}" text-anchor="end" font-weight="700">${esc(e.label)}</text><text x="${lx + 18}" y="${yy + 4}" font-weight="600" font-size="13">${esc(cut(e.title, 52))}</text>${textLines(wrap(e.text, W - lx - 40, 11).slice(0, 3), lx + 18, yy + 19, 14, 'start', ' font-size="11" fill="#444"')}`; });
    return chartResult(svgDoc(W, H, o.title || 'Timeline', `Timeline of ${ev.length} events from ${ev[0].label} to ${ev[ev.length - 1].label}.`, titleEl(W, o.title) + g), 'timeline.svg', ['Date', 'Event', 'Description'], ev.map((e) => [e.label, e.title, e.text]));
  },
});

// ---------------------------------------------------------------- 1417 Venn
T.push({
  id: 'venn-diagram-maker', cat: CH, title: 'Venn Diagram Maker (2 or 3 Sets with Labels in Each Region)',
  desc: 'Name two or three sets and type the text for each region. Circles are drawn with your labels in the correct overlaps. Region codes use set numbers: 1 = only the first set, 12 = first and second only, 123 = all three.',
  inputs: 1, labels: ['First line: set names separated by |. Then lines "region: text" (use ; for several items)'], sample: 'Frontend | Backend | Design\n1: HTML; CSS\n2: SQL; APIs\n3: Colour; Layout\n12: JavaScript\n13: Accessibility\n23: Data models\n123: Product sense\n',
  opts: [{ id: 'title', label: 'Title', type: 'text', def: 'Skills' }, ...sizeOpts(620, 480)],
  run: ([src], o) => {
    const lines = need(src, 'set names and region lines').split(/\r?\n/).filter((l) => l.trim()), names = lines[0].split('|').map((s) => s.trim()).filter(Boolean);
    if (names.length < 2 || names.length > 3) throw new Error('First line: two or three set names separated by |. (Four sets are not supported.)');
    const n = names.length, reg = new Map();
    for (const l of lines.slice(1)) { const m = /^\s*([1-3]+)\s*[:=]\s*(.*)$/.exec(l); if (!m) throw new Error(`Cannot read "${l}". Use for example 12: text`); const key = [...new Set(m[1])].sort().join(''); if ([...key].some((c) => +c > n)) throw new Error(`Region ${m[1]} refers to a set that does not exist.`); reg.set(key, [...(reg.get(key) || []), ...m[2].split(';').map((x) => x.trim()).filter(Boolean)]); }
    const [W, H] = dims(o, 620, 480), top = o.title ? 34 : 6, cx = W / 2, r = n === 3 ? Math.min((W - 190) / 3.24, (H - top - 62) / 3.08) : Math.min((W - 190) / 3.24, (H - top - 30) / 2.2), d = r * 0.62, cy = n === 3 ? top + 18 + r + d * 0.58 : top + 14 + (H - top - 14) / 2;
    const C = n === 2 ? [[cx - d, cy], [cx + d, cy]] : [[cx - d, cy - d * 0.58], [cx + d, cy - d * 0.58], [cx, cy + d * 1.16]], G = n === 2 ? [cx, cy] : [(C[0][0] + C[1][0] + C[2][0]) / 3, (C[0][1] + C[1][1] + C[2][1]) / 3];
    const unit = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }, at = {};
    const kind = (key) => { if (key.length === n) return G; const ids = [...key].map((c) => +c - 1); const m0 = [sum(ids.map((i) => C[i][0])) / ids.length, sum(ids.map((i) => C[i][1])) / ids.length]; const u = unit(m0[0] - G[0], m0[1] - G[1]); return ids.length === 1 ? [m0[0] + u[0] * r * 0.5, m0[1] + u[1] * r * 0.5] : [m0[0] + u[0] * r * 0.22, m0[1] + u[1] * r * 0.22]; };
    const keys = n === 2 ? ['1', '2', '12'] : ['1', '2', '3', '12', '13', '23', '123']; for (const k of keys) at[k] = kind(k);
    let g = ''; C.forEach(([x, y], i) => { g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${PAL[i]}" fill-opacity=".3" stroke="${PAL[i]}" stroke-width="2"><title>${esc(names[i])}</title></circle>`; });
    C.forEach(([x, y], i) => { const u = unit(x - G[0], y - G[1]); const lx = x + u[0] * (r + 10), ly = y + u[1] * (r + 10); g += `<text x="${lx.toFixed(1)}" y="${(ly + (u[1] > 0.3 ? 12 : 0)).toFixed(1)}" text-anchor="${u[0] > 0.3 ? 'start' : u[0] < -0.3 ? 'end' : 'middle'}" font-size="14" font-weight="700">${esc(names[i])}</text>`; });
    for (const k of keys) { const items = reg.get(k) || []; if (!items.length) continue; const lines2 = items.flatMap((t) => wrap(t, r * (k.length === n && n === 3 ? 0.55 : 0.8), 12)).slice(0, 7); g += textLines(lines2, at[k][0].toFixed(1), at[k][1] - ((lines2.length - 1) * 14) / 2 + 4, 14, 'middle'); }
    const label = (k) => (k.length === n ? 'All sets' : k.length === 1 ? `Only ${names[+k - 1]}` : `${[...k].map((c) => names[+c - 1]).join(' and ')}${n === 3 ? ' only' : ''}`);
    return chartResult(svgDoc(W, H, o.title || 'Venn diagram', `Venn diagram of ${names.join(', ')}. ` + keys.map((k) => `${label(k)}: ${(reg.get(k) || []).join(', ') || 'empty'}`).join('; '), titleEl(W, o.title) + g), 'venn-diagram.svg', ['Region', 'Items'], keys.map((k) => [label(k), (reg.get(k) || []).join('; ') || '-']), 'Circle sizes do not reflect how many items each region holds.');
  },
});

// ---------------------------------------------------------------- 1418 word cloud
const STOP = new Set('a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours'.split(' '));
T.push({
  id: 'word-cloud-generator', cat: CH, title: 'Word Cloud Generator (From Text or Word Counts, SVG)',
  desc: 'Paste raw text or "word count" lines and get a packed word cloud as SVG: frequent words are larger. Common English stop words can be skipped. Same input and seed give the same layout.',
  inputs: 1, labels: ['Text, or lines of "word count"'], sample: 'privacy 40\nbrowser 34\nfree 30\ntools 28\nsearch 22\nspeed 18\nSEO 18\nlocal 16\nchart 14\ndata 14\naccessible 12\nopen 10\nmaps 9\nfast 9\nsimple 8\nclient 7\nsafe 7\noffline 6\ntable 5\nexport 5\n',
  opts: [{ id: 'max', label: 'Maximum words', type: 'number', def: 60 }, { id: 'stop', label: 'Skip common English words (raw text only)', type: 'checkbox', def: true }, { id: 'rotate', label: 'Rotate some words 90 degrees', type: 'checkbox', def: false }, { id: 'seed', label: 'Layout seed', type: 'number', def: 1 }, { id: 'title', label: 'Title', type: 'text', def: '' }, ...sizeOpts(720, 460)],
  run: ([src], o) => {
    const text = need(src, 'some text or word counts'), lines = text.split(/\r?\n/).filter((l) => l.trim()), freq = new Map();
    const isCounts = lines.length >= 2 && lines.filter((l) => /^.+?[\s,;:\t]+\d+(?:\.\d+)?\s*$/.test(l.trim())).length >= lines.length * 0.8;
    if (isCounts) for (const l of lines) { const m = /^(.+?)[\s,;:\t]+(\d+(?:\.\d+)?)\s*$/.exec(l.trim()); if (m) freq.set(m[1].trim(), (freq.get(m[1].trim()) || 0) + +m[2]); }
    else for (const w of text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []) { if (o.stop && (STOP.has(w) || w.length < 2)) continue; freq.set(w, (freq.get(w) || 0) + 1); }
    let words = [...freq].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, Math.round(optNum(o.max, 60, 5, 200))); if (words.length < 2) throw new Error('Need at least two different words.');
    const [W, H] = dims(o, 720, 460), top = o.title ? 34 : 0, f0 = words[words.length - 1][1], f1 = words[0][1], smax = Math.min(72, H / 5.5), smin = 12, rand = rng(Math.round(optNum(o.seed, 1, 1, 1e6)));
    const placed = [], boxes = []; let g = '', dropped = 0; const cx = W / 2, cy = top + (H - top) / 2;
    words.forEach(([w, c], i) => {
      const size = f1 === f0 ? (smax + smin) / 2 : smin + (smax - smin) * Math.sqrt((c - f0) / (f1 - f0)), rot = o.rotate && i % 4 === 3, bw = px(w, size) * 1.02 + 6, bh = size * 1.05 + 2, ww = rot ? bh : bw, hh = rot ? bw : bh, col = PAL[i % PAL.length];
      let a = rand() * 6.28, ok = false; const asp = (W - 20) / (H - top - 20);
      for (let t = 0; t < 900 && !ok; t++) { const rad = 2.2 * t * 0.35 * 1.0, ang = a + t * 0.35, x = cx + rad * Math.cos(ang) * asp - ww / 2, y = cy + rad * Math.sin(ang) - hh / 2; if (x < 4 || y < top + 4 || x + ww > W - 4 || y + hh > H - 4) { if (rad > Math.max(W, H)) break; continue; } if (boxes.every((b) => x + ww + 2 <= b[0] || b[0] + b[2] + 2 <= x || y + hh + 2 <= b[1] || b[1] + b[3] + 2 <= y)) { boxes.push([x, y, ww, hh]); const tx = x + ww / 2, ty = y + hh / 2; g += rot ? `<text transform="translate(${(tx).toFixed(1)} ${ty.toFixed(1)}) rotate(90)" text-anchor="middle" dy="${(size * 0.34).toFixed(1)}" font-size="${size.toFixed(1)}" font-weight="600" fill="${c2dark(col)}">${esc(w)}</text>` : `<text x="${tx.toFixed(1)}" y="${(ty + size * 0.34).toFixed(1)}" text-anchor="middle" font-size="${size.toFixed(1)}" font-weight="600" fill="${c2dark(col)}">${esc(w)}</text>`; placed.push([w, c]); ok = true; } }
      if (!ok) dropped++;
    });
    const note = dropped ? `${dropped} word(s) did not fit and were left out; raise the size or lower the maximum.` : '';
    return chartResult(svgDoc(W, H, o.title || 'Word cloud', `Word cloud of ${placed.length} words. Largest: ${placed.slice(0, 5).map((p) => `${p[0]} (${fmt(p[1])})`).join(', ')}.`, titleEl(W, o.title) + g), 'word-cloud.svg', ['Word', 'Count'], placed.map(([w, c]) => [w, fmt(c)]), note);
  },
});
const c2dark = (c) => (lum(c) > 0.3 ? mix(c, '#000000', 0.45) : c);

// ---------------------------------------------------------------- 1419 bubble chart
T.push({
  id: 'bubble-chart-maker', cat: CH, title: 'Bubble Chart Maker (X, Y and Size as Circle Area)',
  desc: 'Plot three numeric columns: X and Y set the position, the third value sets the circle area. An optional label column names the bubbles. Accessible SVG with a data table.',
  inputs: 1, labels: ['Data: x, y, size, label (label optional; header row optional)'], sample: 'x,y,size,label\n12,80,300,Alpha\n25,62,120,Beta\n40,45,520,Gamma\n55,30,80,Delta\n70,72,260,Epsilon\n',
  opts: [{ id: 'title', label: 'Title', type: 'text', def: 'Reach vs conversion' }, { id: 'labels', label: 'Print labels', type: 'checkbox', def: true }, ...sizeOpts(680, 440)],
  run: ([src], o) => {
    let rows = parseCsv(need(src, 'x, y, size rows')), head = ['x', 'y', 'size']; if (rows[0].length >= 3 && [0, 1, 2].some((i) => isNaN(numv(rows[0][i])))) head = rows.shift().slice(0, 3).map((h, i) => h || head[i]);
    const d = rows.map((r) => ({ x: numv(r[0]), y: numv(r[1]), s: numv(r[2]), l: (r[3] || '').trim() })); if (!d.length) throw new Error('No rows.'); if (d.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.s))) throw new Error('Each row needs three numbers: x, y, size.'); if (d.some((p) => p.s < 0)) throw new Error('Sizes must not be negative.'); if (d.length > 500) throw new Error('At most 500 bubbles.');
    const [W, H] = dims(o, 680, 440), m = { t: o.title ? 38 : 14, r: 30, b: 50, l: 58 }, pw = W - m.l - m.r, ph = H - m.t - m.b, smax = Math.max(...d.map((p) => p.s)) || 1, rmax = Math.min(pw, ph) / 9;
    const px0 = Math.min(...d.map((p) => p.x)), px1 = Math.max(...d.map((p) => p.x)), py0 = Math.min(...d.map((p) => p.y)), py1 = Math.max(...d.map((p) => p.y)), ex = (px1 - px0 || 1) * 0.08, ey = (py1 - py0 || 1) * 0.08;
    const tx = niceTicks(px0 - ex, px1 + ex), ty = niceTicks(py0 - ey, py1 + ey), X = (v) => m.l + ((v - tx[0]) / (tx[tx.length - 1] - tx[0])) * pw, Y = (v) => m.t + ph - ((v - ty[0]) / (ty[ty.length - 1] - ty[0])) * ph;
    let g = ''; for (const t of ty) g += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(t)}" y2="${Y(t)}" stroke="#888" stroke-opacity=".3"/><text x="${m.l - 6}" y="${Y(t) + 4}" text-anchor="end">${fmt(t)}</text>`; for (const t of tx) g += `<line x1="${X(t)}" x2="${X(t)}" y1="${m.t}" y2="${m.t + ph}" stroke="#888" stroke-opacity=".3"/><text x="${X(t)}" y="${m.t + ph + 16}" text-anchor="middle">${fmt(t)}</text>`;
    g += `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="none" stroke="#333"/><text x="${m.l + pw / 2}" y="${H - 8}" text-anchor="middle">${esc(head[0])}</text><text transform="translate(14 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle">${esc(head[1])}</text>`;
    [...d].sort((a, b) => b.s - a.s).forEach((p) => { const rr = rmax * Math.sqrt(p.s / smax), i = d.indexOf(p); g += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${Math.max(1.5, rr).toFixed(1)}" fill="${PAL[i % PAL.length]}" fill-opacity=".55" stroke="${PAL[i % PAL.length]}" stroke-width="1.5"><title>${esc(p.l || 'point')}: ${esc(head[0])} ${fmt(p.x)}, ${esc(head[1])} ${fmt(p.y)}, ${esc(head[2])} ${fmt(p.s)}</title></circle>`; if (o.labels && p.l) g += `<text x="${X(p.x).toFixed(1)}" y="${(Y(p.y) + 4).toFixed(1)}" text-anchor="middle" font-size="11" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(cut(p.l, 14))}</text>`; });
    return chartResult(svgDoc(W, H, o.title || 'Bubble chart', `Bubble chart of ${d.length} items: ${head[0]} on the x axis, ${head[1]} on the y axis, bubble area shows ${head[2]}.`, titleEl(W, o.title) + g), 'bubble-chart.svg', [...head, 'label'], d.map((p) => [fmt(p.x), fmt(p.y), fmt(p.s), p.l]), 'Bubble area (not diameter) is proportional to the size value.');
  },
});

// ---------------------------------------------------------------- 1420 waterfall
T.push({
  id: 'waterfall-chart-maker', cat: CH, title: 'Waterfall Chart Maker (Running Total of Gains and Losses)',
  desc: 'Enter a starting value then gains and losses. Floating bars show how each step moves the running total. Leave a value blank to insert a subtotal bar. Colours are paired with + and - signs.',
  inputs: 1, labels: ['Steps: label, value (blank value = subtotal)'], sample: 'Revenue,1200\nCost of goods,-480\nGross profit,\nMarketing,-150\nSalaries,-320\nOther income,60\nOperating profit,\n',
  opts: [{ id: 'final', label: 'Add a final total bar', type: 'checkbox', def: false }, { id: 'title', label: 'Title', type: 'text', def: 'Profit bridge' }, ...sizeOpts(720, 420)],
  run: ([src], o) => {
    const rows = parseCsv(need(src, 'label, value rows')); if (rows.length < 2) throw new Error('Need at least two steps.'); if (rows.length > 60) throw new Error('At most 60 steps.');
    let run = 0; const steps = rows.map((r, i) => { const raw = (r[1] ?? '').trim(); if (raw === '' || /^(total|=)$/i.test(raw)) return { l: r[0], kind: 'total', from: 0, to: run, v: run }; const v = numv(raw); if (!Number.isFinite(v)) throw new Error(`"${raw}" is not a number (step "${r[0]}").`); const from = run; run += v; return { l: r[0], kind: i === 0 ? 'start' : v >= 0 ? 'up' : 'down', from: i === 0 ? 0 : from, to: run, v }; });
    if (o.final && steps[steps.length - 1].kind !== 'total') steps.push({ l: 'Total', kind: 'total', from: 0, to: run, v: run });
    const all = steps.flatMap((s) => [s.from, s.to]), tk = niceTicks(Math.min(0, ...all), Math.max(0, ...all)), [W, H] = dims(o, 720, 420), m = { t: o.title ? 38 : 14, r: 16, b: 62, l: 56 }, pw = W - m.l - m.r, ph = H - m.t - m.b, Y = (v) => m.t + ph - ((v - tk[0]) / (tk[tk.length - 1] - tk[0])) * ph, band = pw / steps.length;
    let g = ''; for (const t of tk) g += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(t)}" y2="${Y(t)}" stroke="#888" stroke-opacity=".3"/><text x="${m.l - 6}" y="${Y(t) + 4}" text-anchor="end">${fmt(t)}</text>`;
    const col = { start: '#56B4E9', total: '#56B4E9', up: '#009E73', down: '#D55E00' };
    steps.forEach((s, i) => { const x = m.l + i * band + band * 0.12, w = band * 0.76, y0 = Y(Math.max(s.from, s.to)), h = Math.abs(Y(s.from) - Y(s.to)), cxm = x + w / 2; g += `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" fill="${col[s.kind]}"><title>${esc(s.l)}: ${s.kind === 'up' || s.kind === 'down' ? (s.v > 0 ? '+' : '') + fmt(s.v) + ', running total ' + fmt(s.to) : fmt(s.to)}</title></rect>`; const lab = s.kind === 'up' ? '+' + fmt(s.v) : s.kind === 'down' ? '-' + fmt(Math.abs(s.v)) : fmt(s.to); g += `<text x="${cxm.toFixed(1)}" y="${(s.v >= 0 || s.kind === 'total' ? y0 - 4 : y0 + h + 12).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="600">${lab}</text>`; if (i < steps.length - 1) g += `<line x1="${(x + w).toFixed(1)}" x2="${(x + band * 1.0 + band * 0.12 - 0).toFixed(1)}" y1="${Y(s.to).toFixed(1)}" y2="${Y(s.to).toFixed(1)}" stroke="#555" stroke-dasharray="3 3"/>`; const t = cut(s.l, 14); g += steps.length > 7 ? `<text transform="translate(${cxm.toFixed(1)} ${m.t + ph + 14}) rotate(-35)" text-anchor="end">${esc(t)}</text>` : `<text x="${cxm.toFixed(1)}" y="${m.t + ph + 16}" text-anchor="middle">${esc(t)}</text>`; });
    g += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(0)}" y2="${Y(0)}" stroke="#333"/>`;
    return chartResult(svgDoc(W, H, o.title || 'Waterfall chart', 'Waterfall chart. ' + steps.map((s) => `${s.l}: ${s.kind === 'up' || s.kind === 'down' ? (s.v > 0 ? '+' : '') + fmt(s.v) : 'total ' + fmt(s.to)}`).join('; '), titleEl(W, o.title) + g), 'waterfall-chart.svg', ['Step', 'Change', 'Running total'], steps.map((s) => [s.l, s.kind === 'up' || s.kind === 'down' ? (s.v > 0 ? '+' : '') + fmt(s.v) : '(total)', fmt(s.to)]), 'Green = increase, orange-red = decrease, blue = starting value or subtotal. Each bar also carries a + or - sign.');
  },
});

// ---------------------------------------------------------------- 1424 pictogram
const ICONS = {
  person: '<circle cx="20" cy="9" r="6"/><path d="M9 36V22a6 6 0 0 1 6-6h10a6 6 0 0 1 6 6v14h-6V25h-1v11H16V25h-1v11z"/>',
  circle: '<circle cx="20" cy="20" r="14"/>', square: '<rect x="6" y="6" width="28" height="28" rx="3"/>',
  heart: '<path d="M20 35C8 26 5 19 5 14a8 8 0 0 1 15-3 8 8 0 0 1 15 3c0 5-3 12-15 21z"/>',
  star: '<path d="M20 4l4.7 10 10.9 1.2-8.1 7.4 2.3 10.8L20 27.8 10.2 33.4l2.3-10.8-8.1-7.4L15.3 14z"/>',
};
T.push({
  id: 'pictogram-maker', cat: CH, title: 'Pictogram (Icon Array) Maker for Proportions',
  desc: 'Show a share as a grid of icons with part of them highlighted, such as 3 in 10 people. Fractions fill part of the last icon. Pick an icon, count, colour and columns; get an SVG with a text equivalent.',
  inputs: 0, sample: '', opts: [{ id: 'value', label: 'Highlighted (count, may be a fraction)', type: 'number', def: 3 }, { id: 'total', label: 'Total icons', type: 'number', def: 10 }, { id: 'cols', label: 'Icons per row', type: 'number', def: 5 }, { id: 'icon', label: 'Icon', type: 'select', choices: Object.keys(ICONS), def: 'person' }, { id: 'color', label: 'Highlight colour (#rrggbb)', type: 'text', def: '#0072B2' }, { id: 'label', label: 'Caption', type: 'text', def: 'of people use the product' }, { id: 'title', label: 'Title', type: 'text', def: '' }],
  run: (_i, o) => {
    const total = Math.round(optNum(o.total, 10, 1, 500)), val = clamp(Number(o.value), 0, total), cols = Math.round(optNum(o.cols, 5, 1, 50)); if (!Number.isFinite(val)) throw new Error('Enter the highlighted count.');
    const rows = Math.ceil(total / cols), cell = 44, top = o.title ? 40 : 10, capH = 34, W = Math.max(cols * cell + 20, 300), H = top + rows * cell + capH + 10, col = okColor(o.color, '#0072B2'), ic = ICONS[o.icon] || ICONS.person; let g = '';
    const frac = val - Math.floor(val); const x0 = (W - cols * cell) / 2;
    for (let i = 0; i < total; i++) {
      const x = x0 + (i % cols) * cell, y = top + Math.floor(i / cols) * cell, full = i < Math.floor(val), part = i === Math.floor(val) && frac > 0;
      g += `<g transform="translate(${x + 2} ${y + 2}) scale(${(cell - 4) / 40})" fill="${full ? col : '#cfcfcf'}">${ic}</g>`;
      if (part) g += `<clipPath id="pc${i}"><rect x="${x + 2}" y="${y}" width="${((cell - 4) * frac).toFixed(1)}" height="${cell}"/></clipPath><g clip-path="url(#pc${i})" transform="translate(${x + 2} ${y + 2}) scale(${(cell - 4) / 40})" fill="${col}">${ic}</g>`;
    }
    const pct = round((100 * val) / total, 1), cap = `${fmt(val)} of ${total} (${pct}%) ${o.label || ''}`.trim();
    g += `<text x="${W / 2}" y="${top + rows * cell + 24}" text-anchor="middle" font-size="15" font-weight="600">${esc(cap)}</text>`;
    return chartResult(svgDoc(W, H, o.title || cap, `Icon array: ${cap}.`, titleEl(W, o.title) + g), 'pictogram.svg', ['Highlighted', 'Total', 'Share %'], [[fmt(val), String(total), String(pct)]], cap);
  },
});

// ---------------------------------------------------------------- 1426 sparkline
T.push({
  id: 'sparkline-generator', cat: CH, title: 'Sparkline Generator (Tiny Inline SVG Trend Charts)',
  desc: 'Paste a series of numbers and get a small line, area or bar sparkline as SVG, sized to sit in text or a table cell. Copy the markup. Includes an accessible name with start, end, min and max.',
  inputs: 1, labels: ['Numbers (spaces, commas or new lines)'], sample: '3 5 4 7 6 9 8 12 10 14 13 17',
  opts: [{ id: 'type', label: 'Type', type: 'select', choices: ['line', 'area', 'bars'], def: 'line' }, { id: 'w', label: 'Width (px)', type: 'number', def: 120 }, { id: 'h', label: 'Height (px)', type: 'number', def: 28 }, { id: 'color', label: 'Colour (#rrggbb)', type: 'text', def: '#0072B2' }, { id: 'ends', label: 'Mark last point, min and max', type: 'checkbox', def: true }, { id: 'name', label: 'Accessible name', type: 'text', def: 'Trend' }],
  run: ([src], o) => {
    const v = numbersIn(need(src, 'some numbers')); if (v.length < 2) throw new Error('Need at least two numbers.'); if (v.length > 5000) throw new Error('At most 5000 numbers.');
    const W = Math.round(optNum(o.w, 120, 20, 800)), H = Math.round(optNum(o.h, 28, 10, 400)), c = okColor(o.color, '#0072B2'), pd = 3, lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1, X = (i) => pd + (i * (W - 2 * pd)) / (v.length - 1), Y = (n) => H - pd - ((n - lo) / span) * (H - 2 * pd);
    let g = ''; const pts = v.map((n, i) => `${X(i).toFixed(1)},${Y(n).toFixed(1)}`);
    if (o.type === 'bars') { const bw = (W - 2 * pd) / v.length; v.forEach((n, i) => { const y = Y(n), base = Y(Math.max(lo, Math.min(0, hi))); g += `<rect x="${(pd + i * bw + 0.5).toFixed(1)}" y="${Math.min(y, base).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${Math.max(1, Math.abs(base - y)).toFixed(1)}" fill="${c}"/>`; }); }
    else { if (o.type === 'area') g += `<polygon points="${X(0).toFixed(1)},${H - pd} ${pts.join(' ')} ${X(v.length - 1).toFixed(1)},${H - pd}" fill="${c}" fill-opacity=".2"/>`; g += `<polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`; if (o.ends) { const imax = v.indexOf(hi), imin = v.indexOf(lo); g += `<circle cx="${X(imin).toFixed(1)}" cy="${Y(lo).toFixed(1)}" r="2" fill="#D55E00"/><circle cx="${X(imax).toFixed(1)}" cy="${Y(hi).toFixed(1)}" r="2" fill="#009E73"/><circle cx="${X(v.length - 1).toFixed(1)}" cy="${Y(v[v.length - 1]).toFixed(1)}" r="2.4" fill="${c}"/>`; } }
    const name = `${o.name || 'Trend'}: ${v.length} values, from ${fmt(v[0])} to ${fmt(v[v.length - 1])}, lowest ${fmt(lo)}, highest ${fmt(hi)}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(name)}"><title>${esc(name)}</title>${g}</svg>`;
    const res = chartResult(svg, 'sparkline.svg', ['#', 'Value'], v.map((n, i) => [String(i + 1), fmt(n)]), name); res.html = res.html.replace('<body>', '<body><p style="margin:0 0 8px">Preview at actual size: ') + '';
    return res;
  },
});

// ---------------------------------------------------------------- 1427 parallel coordinates
T.push({
  id: 'parallel-coordinates-plot', cat: CH, title: 'Parallel Coordinates Plot with Range Filters',
  desc: 'Each numeric column becomes a vertical axis and each row a line across them. Filter rows by typing a range per column (the keyboard version of brushing); matching lines are coloured, others fade.',
  inputs: 1, labels: ['Table with header row; text columns can be used to colour lines'], sample: 'car,mpg,weight,horsepower,price,origin\nA,32,2100,70,16,Japan\nB,28,2400,85,19,Japan\nC,18,3600,150,28,USA\nD,15,4100,190,35,USA\nE,24,2900,110,24,Europe\nF,21,3200,130,27,Europe\nG,35,1900,60,14,Japan\nH,17,3900,170,31,USA\n',
  opts: [{ id: 'filter', label: 'Filters: "column: min-max; column: min-" (blank = none)', type: 'text', def: 'mpg: 20-' }, { id: 'color', label: 'Colour lines by this column (blank = first text column)', type: 'text', def: '' }, { id: 'title', label: 'Title', type: 'text', def: 'Cars' }, ...sizeOpts(760, 440)],
  run: ([src], o) => {
    const rows = pad(parseCsv(need(src, 'a table'))), head = rows.shift(); if (!rows.length) throw new Error('Need a header and rows.'); if (rows.length > 1000) throw new Error('At most 1000 rows.');
    const numCols = head.map((_, i) => i).filter((i) => rows.every((r) => r[i].trim() === '' || Number.isFinite(numv(r[i]))) && rows.some((r) => r[i].trim() !== '')); if (numCols.length < 2) throw new Error('Need at least two numeric columns.');
    const ci = o.color ? colIdx(head, o.color, 'colour column') : head.findIndex((_, i) => !numCols.includes(i)), cats = ci >= 0 ? [...new Set(rows.map((r) => r[ci]))] : [], flt = [];
    for (const part of String(o.filter || '').split(';').map((x) => x.trim()).filter(Boolean)) { const m = /^(.*?)\s*:\s*(-?[\d.]*)\s*(?:\.\.|(?<=\d|^)-)?\s*(-?[\d.]*)$/.exec(part); if (!m) throw new Error(`Cannot read the filter "${part}". Use column: min-max`); const idx = colIdx(head, m[1], 'filter column'); if (!numCols.includes(idx)) throw new Error(`"${head[idx]}" is not a numeric column.`); const lo = m[2] === '' ? -Infinity : +m[2], hi = m[3] === '' ? Infinity : +m[3]; flt.push({ idx, lo, hi }); }
    const ok = (r) => flt.every((f) => { const v = numv(r[f.idx]); return Number.isFinite(v) && v >= f.lo && v <= f.hi; });
    const [W, H] = dims(o, 760, 440), m = { t: (o.title ? 38 : 14) + 20, b: 34, l: 40, r: 40 }, pw = W - m.l - m.r, ph = H - m.t - m.b, ax = numCols.map((i) => { const v = rows.map((r) => numv(r[i])).filter(Number.isFinite), tk = niceTicks(Math.min(...v), Math.max(...v), 4); return { i, tk }; });
    const X = (k) => m.l + (ax.length === 1 ? 0 : (k * pw) / (ax.length - 1)), Y = (a, v) => m.t + ph - ((v - a.tk[0]) / (a.tk[a.tk.length - 1] - a.tk[0])) * ph;
    let g = ''; ax.forEach((a, k) => { g += `<line x1="${X(k)}" x2="${X(k)}" y1="${m.t}" y2="${m.t + ph}" stroke="#333" stroke-width="1.5"/><text x="${X(k)}" y="${m.t - 16}" text-anchor="middle" font-weight="700">${esc(cut(head[a.i], 16))}</text>` + a.tk.map((t) => `<text x="${X(k) + 4}" y="${Y(a, t) + 3}" font-size="10" fill="#555">${fmt(t)}</text><line x1="${X(k) - 3}" x2="${X(k)}" y1="${Y(a, t)}" y2="${Y(a, t)}" stroke="#333"/>`).join(''); }); flt.forEach((f) => { const k = ax.findIndex((a) => a.i === f.idx), a = ax[k], y1 = Y(a, Math.min(a.tk[a.tk.length - 1], f.hi)), y2 = Y(a, Math.max(a.tk[0], f.lo)); g += `<rect x="${X(k) - 5}" y="${y1}" width="10" height="${Math.max(0, y2 - y1)}" fill="#E69F00" fill-opacity=".35" stroke="#B8860B"/>`; });
    let nOk = 0; const line = (r, col, op) => `<polyline fill="none" stroke="${col}" stroke-opacity="${op}" stroke-width="${op > 0.5 ? 1.8 : 1}" points="${ax.map((a, k) => (Number.isFinite(numv(r[a.i])) ? `${X(k).toFixed(1)},${Y(a, numv(r[a.i])).toFixed(1)}` : '')).filter(Boolean).join(' ')}"><title>${esc(r.join(', '))}</title></polyline>`;
    for (const r of rows) if (!ok(r)) g = g.replace('<line', line(r, '#999', 0.25) + '<line'); // faded rows go behind axes
    for (const r of rows) if (ok(r)) { nOk++; g += line(r, ci >= 0 ? PAL[cats.indexOf(r[ci]) % PAL.length] : '#0072B2', 0.85); }
    if (ci >= 0) g += legendRow(cats.map((c, i) => [PAL[i % PAL.length], c]), m.l, H - 10, W)[0];
    const note = `${nOk} of ${rows.length} rows match${flt.length ? ' the filters: ' + flt.map((f) => `${head[f.idx]} ${f.lo === -Infinity ? '' : f.lo}-${f.hi === Infinity ? '' : f.hi}`).join('; ') : ''}.`;
    return chartResult(svgDoc(W, H, o.title || 'Parallel coordinates', `Parallel coordinates plot of ${rows.length} rows on ${ax.length} axes (${ax.map((a) => head[a.i]).join(', ')}). ${note}`, titleEl(W, o.title) + g), 'parallel-coordinates.svg', head, rows.filter(ok), note);
  },
});

// ---------------------------------------------------------------- 1423 bar chart race (CSS animation, no video)
T.push({
  id: 'bar-chart-race-animator', cat: CH, title: 'Bar Chart Race Animator (Animated SVG, Pausable)',
  desc: 'Rows are time periods and columns are items. Bars re-sort and grow from period to period as a looping CSS-animated SVG you can pause. This makes an animated SVG, not a WebM video.',
  inputs: 1, labels: ['Table: first column = period, other columns = items'], sample: 'year,Alpha,Beta,Gamma,Delta,Epsilon\n2018,10,6,4,3,1\n2019,14,9,8,4,3\n2020,16,15,10,6,5\n2021,18,22,12,9,8\n2022,20,28,15,14,9\n2023,21,33,20,19,12\n',
  opts: [{ id: 'top', label: 'Bars shown', type: 'number', def: 5 }, { id: 'secs', label: 'Seconds per period', type: 'number', def: 1.6 }, { id: 'frame', label: 'Show one period only (name, blank = animate)', type: 'text', def: '' }, { id: 'title', label: 'Title', type: 'text', def: 'Growth race' }, ...sizeOpts(680, 380)],
  run: ([src], o) => {
    const rows = pad(parseCsv(need(src, 'a table'))), head = rows.shift(), items = head.slice(1); if (items.length < 2 || rows.length < 2) throw new Error('Need at least 2 items and 2 periods.'); if (rows.length > 120 || items.length > 60) throw new Error('At most 120 periods and 60 items.');
    const val = rows.map((r) => items.map((_, i) => { const n = numv(r[i + 1]); if (r[i + 1].trim() !== '' && !Number.isFinite(n)) throw new Error(`"${r[i + 1]}" is not a number.`); return Number.isFinite(n) ? Math.max(0, n) : 0; })), N = Math.min(Math.round(optNum(o.top, 5, 2, 20)), items.length), mx = Math.max(...val.flat()) || 1;
    const [W, H] = dims(o, 680, 380), m = { t: o.title ? 62 : 34, l: 110, r: 56, b: 12 }, bh = (H - m.t - m.b) / N, pw = W - m.l - m.r, rank = val.map((v) => { const ord = v.map((x, i) => i).sort((a, b) => v[b] - v[a] || a - b); const rk = []; ord.forEach((i, k) => { rk[i] = k; }); return rk; });
    const frame = o.frame ? rows.findIndex((r) => r[0].trim().toLowerCase() === String(o.frame).trim().toLowerCase()) : -1; if (o.frame && frame < 0) throw new Error(`No period named "${o.frame}".`);
    const secs = optNum(o.secs, 1.6, 0.3, 10), dur = secs * rows.length, P = rows.length; let css = '', g = '';
    const y = (r) => m.t + Math.min(r, N) * bh;
    items.forEach((it, i) => {
      const c = PAL[i % PAL.length], w = (k) => Math.max(0.001, val[k][i] / mx);
      const body = (k) => `<rect x="${m.l}" y="0" width="${pw}" height="${(bh * 0.8).toFixed(1)}" fill="${c}" style="transform:scaleX(${w(k).toFixed(4)})"/><text x="${m.l - 8}" y="${(bh * 0.55).toFixed(1)}" text-anchor="end">${esc(cut(it, 14))}</text>`;
      if (frame >= 0) { if (rank[frame][i] < N) g += `<g transform="translate(0 ${y(rank[frame][i]).toFixed(1)})"><rect x="${m.l}" y="0" width="${(pw * w(frame)).toFixed(1)}" height="${(bh * 0.8).toFixed(1)}" fill="${c}"/><text x="${m.l - 8}" y="${(bh * 0.55).toFixed(1)}" text-anchor="end">${esc(cut(it, 14))}</text><text x="${(m.l + pw * w(frame) + 5).toFixed(1)}" y="${(bh * 0.55).toFixed(1)}" font-size="11">${fmt(val[frame][i])}</text></g>`; return; }
      css += `@keyframes mv${i}{${val.map((_, k) => `${((k * 100) / (P - 1)).toFixed(2)}%{transform:translateY(${y(rank[k][i]).toFixed(1)}px);opacity:${rank[k][i] < N ? 1 : 0}}`).join('')}}@keyframes gw${i}{${val.map((_, k) => `${((k * 100) / (P - 1)).toFixed(2)}%{transform:scaleX(${w(k).toFixed(4)})}`).join('')}}`;
      g += `<g class="b" style="animation-name:mv${i};transform:translateY(${y(rank[0][i]).toFixed(1)}px)"><rect class="r" x="${m.l}" y="0" width="${pw}" height="${(bh * 0.8).toFixed(1)}" fill="${c}" style="animation-name:gw${i}"/><text x="${m.l - 8}" y="${(bh * 0.55).toFixed(1)}" text-anchor="end">${esc(cut(it, 14))}</text></g>`; void body;
    });
    if (frame < 0) { g += rows.map((r, k) => `<text class="p" x="${W - 20}" y="${H - 20}" text-anchor="end" font-size="34" font-weight="700" fill="#999" fill-opacity=".5" style="animation-name:pv${k}">${esc(r[0])}</text>`).join(''); css += rows.map((_, k) => { const a = (k * 100) / P, b = ((k + 1) * 100) / P; return `@keyframes pv${k}{${k ? `0%{opacity:0}${(a - 0.01).toFixed(2)}%{opacity:0}` : ''}${a.toFixed(2)}%{opacity:1}${k < P - 1 ? `${(b - 0.01).toFixed(2)}%{opacity:1}${b.toFixed(2)}%{opacity:0}100%{opacity:0}` : '100%{opacity:1}'}}`; }).join('');
    } else g += `<text x="${W - 20}" y="${H - 20}" text-anchor="end" font-size="34" font-weight="700" fill="#999" fill-opacity=".5">${esc(rows[frame][0])}</text>`;
    const style = `<style>.b,.r,.p{animation-duration:${(secs * P).toFixed(2)}s;animation-timing-function:linear;animation-iteration-count:infinite}.b{transition:none}.r{transform-origin:0 0;transform-box:fill-box}.p{animation-timing-function:steps(1,end)}${css}</style>`;
    void dur; const svgBody = `${titleEl(W, o.title)}${g}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" font-family="${FONT}" font-size="12"><title>${esc(o.title || 'Bar chart race')}</title><desc>${esc(`Bar chart race over ${P} periods, ${rows[0][0]} to ${rows[P - 1][0]}. Final ranking: ` + items.map((it, i) => [it, val[P - 1][i]]).sort((a, b) => b[1] - a[1]).slice(0, N).map((x) => `${x[0]} ${fmt(x[1])}`).join(', '))}</desc>${frame < 0 ? style : ''}<rect width="${W}" height="${H}" fill="#fff"/><g fill="#1a1a1a">${svgBody}</g></svg>`;
    return chartResult(svg, 'bar-chart-race.svg', ['Period', ...items], rows.map((r, k) => [r[0], ...val[k].map(fmt)]), frame < 0 ? 'Animated with CSS: use the Pause animation switch on the preview. Download the SVG to keep the animation. Video (WebM) export is not offered.' : '');
  },
});

// ================================================================ SPREADSHEET & DATA CLEANING
const csvResult = (rows, summary, filename = 'table.csv') => {
  const csv = toCsv(rows), body = rows.slice(0, 101).map((r, i) => '<tr>' + r.map((c) => (i ? '<td>' : '<th scope="col">') + esc(c) + (i ? '</td>' : '</th>')).join('') + '</tr>').join('');
  const html = '<!doctype html><html lang="en"><meta charset="utf-8"><title>Result</title><style>body{font:14px system-ui,sans-serif;margin:12px;background:#fff;color:#1a1a1a}table{border-collapse:collapse}th,td{border:1px solid #999;padding:2px 8px;text-align:left}th{background:#eee}</style><body><p role="status">' + esc(summary) + '</p><table>' + body + '</table>' + (rows.length > 101 ? '<p>Showing the first 100 rows. Copy or download for all ' + (rows.length - 1) + '.</p>' : '') + '</body></html>';
  return { html, text: csv, blob: new Blob([csv], { type: 'application/octet-stream' }), filename };
};
const sections = (text) => text.split(/^\s*---+\s*$/m).map((s) => s.trim()).filter(Boolean);
const namedSection = (s, i) => { const m = /^(?:--|#)\s*name:\s*(.+)\r?\n/i.exec(s); return m ? { name: m[1].trim(), text: s.slice(m[0].length) } : { name: 'Sheet' + (i + 1), text: s }; };
const tbl = (text, o, what) => { const rows = pad(readTable(text, o, what)); return { head: rows[0].map((h) => h.trim()), body: rows.slice(1) }; };
const withHead = (head, body) => [head, ...body];
const detectNum = (v) => (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v.trim()) && !/^[-+]?0\d/.test(v.trim()) && v.replace(/\D/g, '').length <= 15 ? +v : null);

// stored ZIP + minimal multi-sheet xlsx writer
const CRCT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRCT[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zipStore(files, type = 'application/zip') { // [{name, data: string}]
  const enc = new TextEncoder(), parts = [], cd = []; let off = 0; const d = new Date(), dt = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  for (const f of files) {
    const n = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data), lh = new DataView(new ArrayBuffer(30)), ch = new DataView(new ArrayBuffer(46));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x800, 2], [8, 0, 2], [10, tm, 2], [12, dt, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, n.length, 2], [28, 0, 2]].forEach(([p, v, s]) => (s === 4 ? lh.setUint32(p, v, true) : lh.setUint16(p, v, true)));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x800, 2], [10, 0, 2], [12, tm, 2], [14, dt, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, n.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, off, 4]].forEach(([p, v, s]) => (s === 4 ? ch.setUint32(p, v, true) : ch.setUint16(p, v, true)));
    parts.push(new Uint8Array(lh.buffer), n, data); cd.push(new Uint8Array(ch.buffer), n); off += 30 + n.length + data.length;
  }
  const cdLen = cd.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdLen, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...cd, new Uint8Array(end.buffer)], { type });
}
const xesc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
function xlsxMulti(sheets, numbers) { // sheets: [{name, rows}]
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', RL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n', used = new Set();
  const names = sheets.map((s, i) => { let n = (s.name || 'Sheet' + (i + 1)).replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet' + (i + 1); while (used.has(n.toLowerCase())) n = n.slice(0, 28) + '_' + (i + 1); used.add(n.toLowerCase()); return n; });
  const files = [
    { name: '[Content_Types].xml', data: H + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>' },
    { name: '_rels/.rels', data: H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + RL + '/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: H + '<workbook xmlns="' + NS + '" xmlns:r="' + RL + '"><sheets>' + names.map((n, i) => '<sheet name="' + xesc(n).replace(/"/g, '&quot;') + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + RL + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="' + RL + '/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', data: H + '<styleSheet xmlns="' + NS + '"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>' },
  ];
  sheets.forEach((s, i) => {
    if (s.rows.length > 1048576) throw new Error('Too many rows for XLSX.');
    const rows = s.rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((v, c) => { if (v === '' || v == null) return ''; const ref = colName(c) + (ri + 1), st = ri === 0 ? ' s="1"' : '', n = numbers && ri > 0 ? detectNum(String(v)) : null; return n !== null ? '<c r="' + ref + '"' + st + '><v>' + n + '</v></c>' : '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + xesc(String(v).slice(0, 32767)) + '</t></is></c>'; }).join('') + '</row>').join('');
    files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: H + '<worksheet xmlns="' + NS + '"><sheetData>' + rows + '</sheetData></worksheet>' });
  });
  return zipStore(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

T.push({
  id: 'csv-files-to-xlsx-sheets', cat: SP, title: 'Several CSVs to One Excel Workbook (One Sheet Each)',
  desc: 'Paste several CSV tables separated by a line of --- and download an .xlsx with each table on its own sheet. Name a sheet with a first line "-- name: Sales". Numbers become numeric cells; values with leading zeros stay text.',
  inputs: 1, labels: ['CSV tables separated by a line of ---'], sample: '-- name: Sales\nregion,total\nNorth,1200\nSouth,980\n---\n-- name: Staff\nname,id\nAna,007\nBo,012\n',
  opts: [delimOpt, { id: 'numbers', label: 'Store numbers as numbers', type: 'checkbox', def: true }],
  run: ([src], o) => {
    const secs = sections(need(src, 'CSV text')).map(namedSection); if (secs.length > 50) throw new Error('At most 50 sheets.');
    const sheets = secs.map((s) => ({ name: s.name, rows: readTable(s.text, o) }));
    const blob = xlsxMulti(sheets, o.numbers !== false);
    return { blob, filename: 'workbook.xlsx', text: sheets.map((s) => s.name + ': ' + (s.rows.length - 1) + ' data rows, ' + width(s.rows) + ' columns').join('\n') };
  },
});

T.push({
  id: 'csv-merger', cat: SP, title: 'CSV Merger (Stack Files, Align Columns by Header Name)',
  desc: 'Paste several CSV tables separated by a line of --- and stack their rows into one table. Columns are matched by header name, so files with different column order or extra columns line up; missing cells stay empty.',
  inputs: 1, labels: ['CSV tables separated by a line of ---, each with a header row'], sample: 'id,name,city\n1,Ana,Oslo\n2,Bo,Rome\n---\nname,id,country\nCy,3,Chile\nDi,4,Peru\n',
  opts: [delimOpt, { id: 'source', label: 'Add a "source" column (table number)', type: 'checkbox', def: false }, { id: 'case', label: 'Ignore letter case in headers', type: 'checkbox', def: true }],
  run: ([src], o) => {
    const secs = sections(need(src, 'CSV text')); if (secs.length < 2) throw new Error('Paste at least two tables separated by a line of ---.');
    const cols = [], key = (h) => (o.case ? h.toLowerCase() : h), rows = [];
    secs.forEach((s, si) => { const { head, body } = tbl(s, o); const map = head.map((h) => { let i = cols.findIndex((c) => key(c) === key(h)); if (i < 0) { cols.push(h); i = cols.length - 1; } return i; }); for (const r of body) { const row = new Array(cols.length).fill(''); r.forEach((v, j) => { row[map[j]] = v; }); row.src = si + 1; rows.push(row); } });
    const out2 = rows.map((r) => { const x = Array.from({ length: cols.length }, (_, i) => r[i] ?? ''); if (o.source) x.push(String(r.src)); return x; });
    return csvResult([[...cols, ...(o.source ? ['source'] : [])], ...out2], secs.length + ' tables merged into ' + out2.length + ' rows and ' + cols.length + ' columns.', 'merged.csv');
  },
});

T.push({
  id: 'csv-splitter', cat: SP, title: 'CSV Splitter (Parts of N Rows with Header, as ZIP)',
  desc: 'Split a large CSV into numbered parts with a fixed number of data rows. Every part repeats the header row, and all parts are bundled in a ZIP.',
  inputs: 1, labels: ['CSV with a header row'], sample: 'id,name\n1,a\n2,b\n3,c\n4,d\n5,e\n6,f\n7,g\n',
  opts: [delimOpt, { id: 'rows', label: 'Data rows per part', type: 'number', def: 3 }, { id: 'name', label: 'File name prefix', type: 'text', def: 'part' }],
  run: ([src], o) => {
    const rows = readTable(src, o, 'a CSV'), head = rows[0], body = rows.slice(1), n = Math.floor(Number(o.rows)); if (!(n >= 1)) throw new Error('Rows per part must be 1 or more.'); if (!body.length) throw new Error('No data rows below the header.');
    const parts = Math.ceil(body.length / n); if (parts > 500) throw new Error('That would make more than 500 parts.');
    const pre = (o.name || 'part').replace(/[^\w.-]+/g, '_'), files = Array.from({ length: parts }, (_, i) => ({ name: pre + '-' + String(i + 1).padStart(String(parts).length, '0') + '.csv', data: toCsv([head, ...body.slice(i * n, (i + 1) * n)]) }));
    return { blob: zipStore(files), filename: pre + '.zip', text: files.map((f, i) => f.name + ': ' + Math.min(n, body.length - i * n) + ' rows').join('\n') };
  },
});

T.push({
  id: 'duplicate-row-remover', cat: SP, title: 'Duplicate Row Remover (By Selected Columns, CSV)',
  desc: 'Choose which columns define a duplicate (or all), keep the first or last occurrence, optionally ignore case and spaces, and see which rows were removed.',
  inputs: 1, labels: ['CSV with a header row'], sample: 'email,name,plan\nann@x.com,Ann,pro\nbob@x.com,Bob,free\nANN@x.com ,Ann B,pro\ncy@x.com,Cy,free\nbob@x.com,Bob,team\n',
  opts: [delimOpt, { id: 'cols', label: 'Columns that define a duplicate (names or numbers, blank = whole row)', type: 'text', def: 'email' }, { id: 'keep', label: 'Keep', type: 'select', choices: ['first', 'last'], def: 'first' }, { id: 'loose', label: 'Ignore case and surrounding spaces', type: 'checkbox', def: true }],
  run: ([src], o) => {
    const { head, body } = tbl(src, o, 'a CSV'), idx = o.cols.trim() ? colList(head, o.cols, 'column') : head.map((_, i) => i), nrm = (v) => (o.loose ? v.trim().toLowerCase().replace(/\s+/g, ' ') : v), keyOf = (r) => JSON.stringify(idx.map((i) => nrm(r[i])));
    const seen = new Map(); body.forEach((r, i) => { const k = keyOf(r); if (!seen.has(k)) seen.set(k, [i]); else seen.get(k).push(i); });
    const keepIdx = new Set([...seen.values()].map((l) => (o.keep === 'last' ? l[l.length - 1] : l[0])));
    const kept = body.filter((_, i) => keepIdx.has(i)), removed = body.map((r, i) => i).filter((i) => !keepIdx.has(i));
    return csvResult(withHead(head, kept), removed.length + ' duplicate row(s) removed, ' + kept.length + ' kept. Removed data rows (first data row = 1): ' + (removed.map((i) => i + 1).join(', ') || 'none') + '.', 'deduplicated.csv');
  },
});

T.push({
  id: 'csv-column-splitter', cat: SP, title: 'CSV Column Splitter (One Column into Several by a Separator)',
  desc: 'Split one CSV column on a separator such as a comma, space or slash. "Smith, John" becomes a surname and a first-name column. Other columns stay in place.',
  inputs: 1, labels: ['CSV with a header row'], sample: 'name,city\n"Smith, John",Oslo\n"Lee, Ann Marie",Rome\nRoy,Lima\n',
  opts: [delimOpt, { id: 'col', label: 'Column to split (name or number)', type: 'text', def: 'name' }, { id: 'sep', label: 'Separator text', type: 'text', def: ',' }, { id: 'max', label: 'Maximum parts (0 = all)', type: 'number', def: 2 }, { id: 'names', label: 'New column names, comma separated (blank = name_1, name_2 ...)', type: 'text', def: 'surname,first name' }, { id: 'drop', label: 'Remove the original column', type: 'checkbox', def: true }],
  run: ([src], o) => {
    const { head, body } = tbl(src, o, 'a CSV'), ci = colIdx(head, o.col, 'column'), sep = o.sep === '' ? ' ' : o.sep.replace(/\\t/g, '\t'), mx = Math.max(0, Math.floor(Number(o.max)) || 0);
    const split = body.map((r) => { const p = r[ci].split(sep); if (mx > 0 && p.length > mx) { const rest = p.slice(mx - 1).join(sep); p.length = mx - 1; p.push(rest); } return p.map((x) => x.trim()); }), n = Math.max(1, ...split.map((p) => p.length)), nm = o.names.split(',').map((x) => x.trim());
    const newHead = Array.from({ length: n }, (_, i) => nm[i] || head[ci] + '_' + (i + 1)), outH = [], outB = body.map(() => []);
    head.forEach((h, i) => { if (i === ci) { if (!o.drop) { outH.push(h); outB.forEach((r, k) => r.push(body[k][i])); } outH.push(...newHead); outB.forEach((r, k) => r.push(...Array.from({ length: n }, (_, j) => split[k][j] ?? ''))); } else { outH.push(h); outB.forEach((r, k) => r.push(body[k][i])); } });
    return csvResult([outH, ...outB], 'Column "' + head[ci] + '" split into ' + n + ' column(s).', 'split.csv');
  },
});

T.push({
  id: 'csv-column-merger', cat: SP, title: 'CSV Column Merger (Join Columns into One with a Separator)',
  desc: 'Concatenate several CSV columns into a new column with a separator you choose, for example street, postcode and city into one address. Empty parts are skipped.',
  inputs: 1, labels: ['CSV with a header row'], sample: 'street,zip,city,country\n1 High St,N1 9AB,London,UK\n5 Main Rd,,Leeds,UK\n',
  opts: [delimOpt, { id: 'cols', label: 'Columns to join, in order (names or numbers, comma separated)', type: 'text', def: 'street,zip,city' }, { id: 'sep', label: 'Separator', type: 'text', def: ', ' }, { id: 'name', label: 'New column name', type: 'text', def: 'address' }, { id: 'drop', label: 'Remove the joined columns', type: 'checkbox', def: false }],
  run: ([src], o) => {
    const { head, body } = tbl(src, o, 'a CSV'), idx = colList(head, o.cols, 'column'); if (idx.length < 2) throw new Error('Name at least two columns to join.');
    const keep = head.map((_, i) => i).filter((i) => !(o.drop && idx.includes(i))), rows = body.map((r) => [...keep.map((i) => r[i]), idx.map((i) => r[i].trim()).filter(Boolean).join(o.sep)]);
    return csvResult([[...keep.map((i) => head[i]), o.name || 'merged'], ...rows], idx.length + ' columns joined into "' + (o.name || 'merged') + '".', 'merged-columns.csv');
  },
});

T.push({
  id: 'csv-whitespace-trimmer', cat: SP, title: 'CSV Whitespace Trimmer (Trim and Collapse Spaces in Every Cell)',
  desc: 'Remove leading and trailing spaces in all cells and collapse repeated spaces, tabs and non-breaking spaces to one space. Reports how many cells changed.',
  inputs: 1, labels: ['CSV or table'], sample: 'name,city\n"  Ann   Lee ",Oslo\nBo  Roy,"Rome\t "\n',
  opts: [delimOpt, { id: 'collapse', label: 'Collapse internal runs of whitespace', type: 'checkbox', def: true }, { id: 'zw', label: 'Remove zero-width characters', type: 'checkbox', def: true }],
  run: ([src], o) => {
    const rows = readTable(src, o, 'a table'); let n = 0;
    const out2 = rows.map((r) => r.map((v) => { let x = v; if (o.zw) x = x.replace(/[​-‍⁠﻿]/g, ''); x = x.replace(/[  -   　]/g, ' '); x = o.collapse ? x.replace(/\s+/g, ' ') : x; x = x.trim(); if (x !== v) n++; return x; }));
    return csvResult(out2, n + ' cell(s) changed out of ' + rows.reduce((a, r) => a + r.length, 0) + '.', 'trimmed.csv');
  },
});

// ---------------------------------------------------------------- pivot table
const aggs = {
  sum: (v) => sum(v), count: (v) => v.length, average: (v) => (v.length ? sum(v) / v.length : NaN), min: (v) => Math.min(...v), max: (v) => Math.max(...v),
};
T.push({
  id: 'pivot-table-builder', cat: SP, title: 'Pivot Table Builder (Rows, Columns, Sum, Count, Average)',
  desc: 'Summarise a CSV as a cross-tab: choose the row field, an optional column field, the value field and sum, count, average, min or max. Totals included. Typed field names replace drag and drop.',
  inputs: 1, labels: ['CSV with a header row'], sample: 'region,product,units,revenue\nNorth,Pen,10,50\nNorth,Book,4,60\nSouth,Pen,7,35\nSouth,Book,9,135\nNorth,Pen,5,25\nEast,Book,2,30\n',
  opts: [delimOpt, { id: 'row', label: 'Row field', type: 'text', def: 'region' }, { id: 'col', label: 'Column field (blank = none)', type: 'text', def: 'product' }, { id: 'val', label: 'Value field', type: 'text', def: 'revenue' }, { id: 'agg', label: 'Summarise with', type: 'select', choices: Object.keys(aggs), def: 'sum' }, { id: 'totals', label: 'Add totals', type: 'checkbox', def: true }],
  run: ([src], o) => {
    const { head, body } = tbl(src, o, 'a CSV'), ri = colIdx(head, o.row, 'row field'), ci = o.col.trim() ? colIdx(head, o.col, 'column field') : -1, agg = aggs[o.agg] || aggs.sum, vi = o.agg === 'count' && !o.val.trim() ? -1 : colIdx(head, o.val, 'value field');
    const rk = [], ck = [], cells = new Map(), rowsAll = new Map(), colsAll = new Map(), all = []; let bad = 0;
    for (const r of body) { const a = r[ri].trim(), b = ci >= 0 ? r[ci].trim() : 'Value'; let v = 1; if (vi >= 0) { v = numv(r[vi]); if (!Number.isFinite(v)) { if (o.agg === 'count' && r[vi].trim() !== '') v = 1; else { bad++; continue; } } } if (!rk.includes(a)) rk.push(a); if (!ck.includes(b)) ck.push(b); const k = a + '\u0000' + b; (cells.get(k) || cells.set(k, []).get(k)).push(v); (rowsAll.get(a) || rowsAll.set(a, []).get(a)).push(v); (colsAll.get(b) || colsAll.set(b, []).get(b)).push(v); all.push(v); }
    if (!all.length) throw new Error('No numeric values to summarise in "' + head[vi] + '".'); rk.sort((x, y) => x.localeCompare(y, undefined, { numeric: true })); ck.sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
    const f = (v) => (v && v.length ? fmt(agg(v)) : ''), rows = [[head[ri] + (ci >= 0 ? ' \\ ' + head[ci] : ''), ...ck, ...(o.totals && ci >= 0 ? ['Total'] : [])], ...rk.map((a) => [a, ...ck.map((b) => f(cells.get(a + '\u0000' + b))), ...(o.totals && ci >= 0 ? [f(rowsAll.get(a))] : [])])];
    if (o.totals) rows.push(['Total', ...ck.map((b) => f(colsAll.get(b))), ...(ci >= 0 ? [f(all)] : [])]);
    return csvResult(rows, o.agg + ' of ' + (vi >= 0 ? head[vi] : 'rows') + ' by ' + head[ri] + (ci >= 0 ? ' and ' + head[ci] : '') + ': ' + all.length + ' rows used' + (bad ? ', ' + bad + ' skipped (not a number)' : '') + '.', 'pivot.csv');
  },
});

// ---------------------------------------------------------------- table joiner
T.push({
  id: 'table-joiner', cat: SP, title: 'Table Joiner (VLOOKUP-Style Join of Two CSVs on a Key)',
  desc: 'Join two CSV tables on a key column: inner, left, right or full join. Columns from both tables appear in one result; clashing names get a suffix. Unmatched rows are counted.',
  inputs: 2, labels: ['Left table (CSV with header)', 'Right table (CSV with header)'], sample: 'id,name\n1,Ann\n2,Bob\n3,Cy\n', sample2: 'id,plan\n1,pro\n3,free\n4,team\n',
  opts: [delimOpt, { id: 'lkey', label: 'Key column in the left table', type: 'text', def: 'id' }, { id: 'rkey', label: 'Key column in the right table (blank = same name)', type: 'text', def: '' }, { id: 'type', label: 'Join type', type: 'select', choices: ['left', 'inner', 'right', 'full'], def: 'left' }, { id: 'trim', label: 'Ignore case and surrounding spaces in keys', type: 'checkbox', def: true }],
  run: ([a, b], o) => {
    const L = tbl(a, o, 'the left table'), R = tbl(b, o, 'the right table'), li = colIdx(L.head, o.lkey, 'left key'), ri = colIdx(R.head, o.rkey.trim() || L.head[li], 'right key'), nk = (v) => (o.trim ? v.trim().toLowerCase() : v);
    const idx = new Map(); R.body.forEach((r, i) => { const k = nk(r[ri]); (idx.get(k) || idx.set(k, []).get(k)).push(i); });
    const rightCols = R.head.map((_, i) => i).filter((i) => i !== ri), lh = new Set(L.head.map((h) => h.toLowerCase())), rh = rightCols.map((i) => (lh.has(R.head[i].toLowerCase()) ? R.head[i] + '_right' : R.head[i]));
    const out2 = [], used = new Set(); let lm = 0, lu = 0;
    for (const r of L.body) { const m = idx.get(nk(r[li])); if (m) { lm++; for (const j of m) { used.add(j); out2.push([...r, ...rightCols.map((c) => R.body[j][c])]); } } else { lu++; if (o.type === 'left' || o.type === 'full') out2.push([...r, ...rightCols.map(() => '')]); } }
    let ru = 0; R.body.forEach((r, j) => { if (!used.has(j)) { ru++; if (o.type === 'right' || o.type === 'full') { const row = L.head.map((_, i) => (i === li ? r[ri] : '')); out2.push([...row, ...rightCols.map((c) => r[c])]); } } });
    return csvResult([[...L.head, ...rh], ...out2], o.type + ' join: ' + lm + ' left rows matched, ' + lu + ' left rows without a match, ' + ru + ' right rows without a match. Result has ' + out2.length + ' rows.', 'joined.csv');
  },
});

// ---------------------------------------------------------------- fuzzy deduplicator
function lev(a, b) { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let prev = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; }
const normName = (s, suffix) => { let x = s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(); if (suffix) x = x.replace(/\b(inc|incorporated|ltd|limited|llc|gmbh|corp|corporation|co|company|sa|bv|plc)\b/g, '').replace(/\s+/g, ' ').trim(); return x; };
T.push({
  id: 'fuzzy-match-deduplicator', cat: SP, title: 'Fuzzy Match Deduplicator (Cluster Near-Duplicate Names)',
  desc: 'Group values of a column that differ only by case, punctuation, spacing, company suffixes or small typos ("Acme Inc" and "ACME Inc."). Each group gets its most frequent spelling as the canonical one, and you can output the cleaned CSV.',
  inputs: 1, labels: ['CSV with a header row'], sample: 'company,amount\nAcme Inc,10\nACME Inc.,20\nAcme Incorporated,5\nGlobex Corp,7\nGlobex Corporation,3\nInitech,9\nInitec,4\nHooli,6\n',
  opts: [delimOpt, { id: 'col', label: 'Column to clean (name or number)', type: 'text', def: 'company' }, { id: 'sim', label: 'Typo tolerance: minimum similarity % (100 = only formatting differences)', type: 'number', def: 85 }, { id: 'suffix', label: 'Ignore company suffixes (Inc, Ltd, GmbH ...)', type: 'checkbox', def: true }, { id: 'out', label: 'Output', type: 'select', choices: ['cleaned CSV', 'cluster report'], def: 'cluster report' }],
  run: ([src], o) => {
    const { head, body } = tbl(src, o, 'a CSV'), ci = colIdx(head, o.col, 'column'), cnt = new Map(); for (const r of body) { const v = r[ci].trim(); if (v) cnt.set(v, (cnt.get(v) || 0) + 1); }
    const vals = [...cnt.keys()]; if (vals.length > 3000) throw new Error('At most 3000 distinct values.'); const sim = clamp(Number(o.sim) || 100, 50, 100) / 100, nk = new Map(vals.map((v) => [v, normName(v, o.suffix) || v.toLowerCase()])), par = vals.map((_, i) => i), find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
    const keyIdx = new Map(); vals.forEach((v, i) => { const k = nk.get(v); if (keyIdx.has(k)) par[find(i)] = find(keyIdx.get(k)); else keyIdx.set(k, i); });
    if (sim < 1) for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) { const a = nk.get(vals[i]), b = nk.get(vals[j]); if (find(i) === find(j) || Math.abs(a.length - b.length) > Math.max(a.length, b.length) * (1 - sim)) continue; if (1 - lev(a, b) / Math.max(a.length, b.length) >= sim) par[find(i)] = find(j); }
    const groups = new Map(); vals.forEach((v, i) => { const g = find(i); (groups.get(g) || groups.set(g, []).get(g)).push(v); });
    const canon = new Map(), rep = []; for (const g of groups.values()) { g.sort((a, b) => cnt.get(b) - cnt.get(a) || a.length - b.length || a.localeCompare(b)); for (const v of g) canon.set(v, g[0]); if (g.length > 1) rep.push([g[0], String(g.reduce((s, v) => s + cnt.get(v), 0)), g.map((v) => `${v} (${cnt.get(v)})`).join(' | ')]); }
    if (o.out === 'cleaned CSV') { let ch = 0; const rows = body.map((r) => { const c = canon.get(r[ci].trim()); if (c !== undefined && c !== r[ci]) { ch++; r = r.slice(); r[ci] = c; } return r; }); return csvResult(withHead(head, rows), ch + ' cell(s) changed to a canonical spelling; ' + rep.length + ' group(s) merged.', 'cleaned.csv'); }
    if (!rep.length) return csvResult([['canonical', 'rows', 'variants'], ['(no near-duplicates found)', '', '']], 'No groups found at this tolerance.', 'clusters.csv');
    return csvResult([['canonical (most frequent)', 'rows', 'variants (count)'], ...rep.sort((a, b) => b[1] - a[1])], rep.length + ' group(s) of near-duplicates. Check them before applying: similarity is a heuristic, so "Initech" and "Initec" may or may not be the same company.', 'clusters.csv');
  },
});

// ---------------------------------------------------------------- date normalizer
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const monthNum = (s) => { s = s.toLowerCase().replace(/\.$/, ''); if (s === 'sept') s = 'sep'; const i = MONTHS.findIndex((m) => m === s || (s.length >= 3 && m.startsWith(s))); return i < 0 ? 0 : i + 1; };
const fullYear = (y, s) => (s.length <= 2 ? (y >= 69 ? 1900 + y : 2000 + y) : y);
function parseAnyDate(s, order) {
  s = s.trim().replace(/\s+/g, ' '); let m, y, mo, d, amb = false;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ]\d.*)?$/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s))) { const a = +m[1], b = +m[2]; y = fullYear(+m[3], m[3]); if (order === 'DMY') { d = a; mo = b; } else { mo = a; d = b; } amb = a <= 12 && b <= 12 && a !== b; }
  else if ((m = /^(\d{1,2})(?:st|nd|rd|th)?[ -]([A-Za-z]{3,9}\.?),?[ -](\d{2}|\d{4})$/.exec(s))) { d = +m[1]; mo = monthNum(m[2]); y = fullYear(+m[3], m[3]); }
  else if ((m = /^([A-Za-z]{3,9}\.?) (\d{1,2})(?:st|nd|rd|th)?,? (\d{2}|\d{4})$/.exec(s))) { mo = monthNum(m[1]); d = +m[2]; y = fullYear(+m[3], m[3]); }
  else return null;
  if (!mo || mo > 12 || d < 1 || d > 31 || y < 1000) return null; const t = new Date(Date.UTC(y, mo - 1, d)); if (t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return { y, m: mo, d, amb };
}
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], p2 = (n) => String(n).padStart(2, '0');
const DATE_OUT = { 'YYYY-MM-DD': (x) => `${x.y}-${p2(x.m)}-${p2(x.d)}`, 'DD/MM/YYYY': (x) => `${p2(x.d)}/${p2(x.m)}/${x.y}`, 'MM/DD/YYYY': (x) => `${p2(x.m)}/${p2(x.d)}/${x.y}`, 'DD.MM.YYYY': (x) => `${p2(x.d)}.${p2(x.m)}.${x.y}`, 'D MMM YYYY': (x) => `${x.d} ${MON3[x.m - 1]} ${x.y}`, 'D MMMM YYYY': (x) => `${x.d} ${MONTHS[x.m - 1][0].toUpperCase() + MONTHS[x.m - 1].slice(1)} ${x.y}` };
T.push({
  id: 'date-format-normalizer', cat: SP, title: 'Date Format Normalizer for a CSV Column (Mixed Formats to ISO)',
  desc: 'Rewrite a column of mixed date styles such as 03/04/21, 4 March 2021 and March 4, 2021 into one format. You set the day-month order for all-numeric dates; ambiguous and unreadable values are reported, not guessed.',
  inputs: 1, labels: ['CSV with a header row'], sample: 'event,date\nA,03/04/21\nB,4 March 2021\nC,"March 5, 2021"\nD,2021-03-06\nE,13/03/2021\nF,20210307\nG,not a date\n',
  opts: [delimOpt, { id: 'col', label: 'Date column (name or number)', type: 'text', def: 'date' }, { id: 'order', label: 'Order of all-numeric dates like 03/04/21', type: 'select', choices: ['DMY', 'MDY'], def: 'DMY' }, { id: 'fmt', label: 'Output format', type: 'select', choices: Object.keys(DATE_OUT), def: 'YYYY-MM-DD' }],
  run: ([src], o) => {
    const { head, body } = tbl(src, o, 'a CSV'), ci = colIdx(head, o.col, 'date column'), f = DATE_OUT[o.fmt] || DATE_OUT['YYYY-MM-DD']; let ok = 0, amb = 0; const bad = [];
    const rows = body.map((r, i) => { const v = r[ci]; if (!v.trim()) return r; const p = parseAnyDate(v, o.order); if (!p) { bad.push(`row ${i + 1}: "${v}"`); return r; } ok++; if (p.amb) amb++; r = r.slice(); r[ci] = f(p); return r; });
    return csvResult(withHead(head, rows), `${ok} date(s) rewritten (${amb} were all-numeric with day and month both 12 or below, read as ${o.order === 'DMY' ? 'day first' : 'month first'}). ${bad.length ? bad.length + ' left unchanged: ' + bad.slice(0, 10).join('; ') + (bad.length > 10 ? ' ...' : '') : 'None unreadable.'} Two-digit years: 69-99 = 19xx, 00-68 = 20xx. English month names only.`, 'dates.csv');
  },
});

// ---------------------------------------------------------------- phone normalizer
const PHONE = `AC:247::5,6 AD:376::6,8,9 AE:971:0:5,6,7,8,9,10,11,12 AF:93:0:9 AG:1:1:10 AI:1:1:10 AL:355:0:6,7,8,9 AM:374:0:8 AO:244::9 AR:54:0:10,11 AS:1:1:10 AT:43:0:4,5,6,7,8,9,10,11,12,13 AU:61:0:5,6,7,8,9,10,12 AW:297::7 AX:358:0:5,6,7,8,9,10,11,12 AZ:994:0:9 BA:387:0:8,9 BB:1:1:10 BD:880:0:6,7,8,9,10 BE:32:0:8,9 BF:226::8 BG:359:0:6,7,8,9,12 BH:973::8 BI:257::8 BJ:229::8 BL:590:0:9 BM:1:1:10 BN:673::7 BO:591:0:8,9 BQ:599::7 BR:55:0:8,9,10,11 BS:1:1:10 BT:975::7,8 BW:267::7,8,10 BY:375:8:6,7,8,9,10,11 BZ:501::7,11 CA:1:1:7,10 CC:61:0:6,7,8,9,10,12 CD:243:0:7,9 CF:236::8 CG:242::9 CH:41:0:9 CI:225::10 CK:682::5 CL:56::9,10,11 CM:237::8,9 CN:86:0:7,8,9,10,11,12 CO:57:0:10,11 CR:506::8,10 CU:53:0:6,7,8,10 CV:238::7 CW:599::7,8 CX:61:0:6,7,8,9,10,12 CY:357::8 CZ:420::9 DE:49:0:4,5,6,7,8,9,10,11,12,13,14,15 DJ:253::8 DK:45::8 DM:1:1:10 DO:1:1:10 DZ:213:0:8,9 EC:593:0:8,9,10,11 EE:372::7,8,10 EG:20:0:8,9,10 EH:212:0:9 ER:291:0:7 ES:34::9 ET:251:0:9 FI:358:0:5,6,7,8,9,10,11,12 FJ:679::7,11 FK:500::5 FM:691::7 FO:298::6 FR:33:0:9 GA:241::7,8 GB:44:0:7,9,10 GD:1:1:10 GE:995:0:9 GF:594:0:9 GG:44:0:7,9,10 GH:233:0:8,9 GI:350::8 GL:299::6 GM:220::7 GN:224::8,9 GP:590:0:9 GQ:240::9 GR:30::10,11,12 GT:502::8,11 GU:1:1:10 GW:245::7,9 GY:592::7 HK:852::5,6,7,8,9,11 HN:504::8,11 HR:385:0:6,7,8,9 HT:509::8 HU:36:06:8,9 ID:62:0:7,8,9,10,11,12,13 IE:353:0:7,8,9,10 IL:972:0:7,8,9,10,11,12 IM:44:0:10 IN:91:0:8,9,10,11,12,13 IO:246::7 IQ:964:0:8,9,10 IR:98:0:4,5,6,7,10 IS:354::7,9 IT:39::6,7,8,9,10,11 JE:44:0:10 JM:1:1:10 JO:962:0:8,9 JP:81:0:8,9,10,11,12,13,14,15,16,17 KE:254:0:7,8,9,10 KG:996:0:9,10 KH:855:0:8,9,10 KI:686:0:5,8 KM:269::7 KN:1:1:10 KP:850:0:8,10 KR:82:0:5,6,8,9,10,11,12,13,14 KW:965::7,8 KY:1:1:10 KZ:7:8:10,14 LA:856:0:8,9,10 LB:961:0:7,8 LC:1:1:10 LI:423:0:7,9 LK:94:0:9 LR:231:0:7,8,9 LS:266::8 LT:370:0:8 LU:352::4,5,6,7,8,9,10,11 LV:371::8 LY:218:0:9 MA:212:0:9 MC:377:0:8,9 MD:373:0:8 ME:382:0:8,9 MF:590:0:9 MG:261:0:9 MH:692:1:7 MK:389:0:8 ML:223::8 MM:95:0:6,7,8,9,10 MN:976:0:8,9,10 MO:853::7,8 MP:1:1:10 MQ:596:0:9 MR:222::8 MS:1:1:10 MT:356::8 MU:230::7,8,10 MV:960::7,10 MW:265:0:7,9 MX:52::10 MY:60:0:8,9,10 MZ:258::8,9 NA:264:0:8,9 NC:687::6 NE:227::8 NF:672::6 NG:234:0:7,8,10,11,12,13,14 NI:505::8 NL:31:0:5,6,7,8,9,10,11 NO:47::5,8 NP:977:0:8,10,11 NR:674::7 NU:683::4,7 NZ:64:0:5,6,7,8,9,10 OM:968::7,8,9 PA:507::7,8,10,11 PE:51:0:8,9 PF:689::6,8,9 PG:675::7,8 PH:63:0:6,8,9,10,11,12,13 PK:92:0:8,9,10,11,12 PL:48::6,7,8,9,10 PM:508:0:6,9 PR:1:1:10 PS:970:0:8,9,10 PT:351::9 PW:680::7 PY:595:0:6,7,8,9,10,11 QA:974::7,8,9,11 RE:262:0:9 RO:40:0:6,9 RS:381:0:6,7,8,9,10,11,12 RU:7:8:10,14 RW:250:0:8,9 SA:966:0:9,10 SB:677::5,7 SC:248::7 SD:249:0:9 SE:46:0:6,7,8,9,10 SG:65::8,10,11 SH:290::4,5 SI:386:0:5,6,7,8 SJ:47::5,8 SK:421:0:6,7,9 SL:232:0:8 SM:378::8,10 SN:221::9 SO:252:0:6,7,8,9 SR:597::6,7 SS:211:0:9 ST:239::7 SV:503::7,8,11 SX:1:1:10 SY:963:0:8,9 SZ:268::8,9 TA:290::4 TC:1:1:10 TD:235::8 TG:228::8 TH:66:0:8,9,10,13 TJ:992::9 TK:690::4,5,6,7 TL:670::7,8 TM:993:8:8 TN:216::8 TO:676::5,7 TR:90:0:7,10,12,13 TT:1:1:10 TV:688::5,6,7 TW:886:0:7,8,9,10,11 TZ:255:0:9 UA:380:0:9,10 UG:256:0:9 US:1:1:10 UY:598:0:6,7,8,9,10,11,12,13 UZ:998::9 VA:39::6,7,8,9,10,11 VC:1:1:10 VE:58:0:10 VG:1:1:10 VI:1:1:10 VN:84:0:7,8,9,10 VU:678::5,7 WF:681::6,9 WS:685::5,6,7,10 XK:383:0:8,9,10,11,12 YE:967:0:7,8,9 YT:262:0:9 ZA:27:0:5,6,7,8,9,10 ZM:260:0:9 ZW:263:0:5,6,7,8,9,10`.split(' ').map((s) => s.split(':')).reduce((m, [c, cc, np, len]) => { m[c] = { cc, np, len: len.split(',').map(Number) }; return m; }, {});
const CC_SET = new Set(Object.values(PHONE).map((x) => x.cc));
T.push({
  id: 'phone-number-normalizer', cat: SP, title: 'Phone Number Normalizer to E.164 (CSV Column, Default Country)',
  desc: 'Convert phone numbers written in local styles to E.164 (+countrycode and digits) for a CSV column, using a default country for numbers without a country code. Numbers whose length does not fit are flagged for review.',
  inputs: 1, labels: ['CSV with a header row, or one number per line'], sample: 'name,phone\nAnn,(020) 7946 0958\nBo,+44 20 7946 0958\nCy,0044 20 7946 0958\nDi,07700 900123\nEd,12345\nFay,"+1 (212) 555-0100"\n',
  opts: [delimOpt, { id: 'col', label: 'Phone column (name or number; blank = first column)', type: 'text', def: 'phone' }, { id: 'country', label: 'Default country (ISO code, for example GB, US, DE, FR)', type: 'text', def: 'GB' }, { id: 'flag', label: 'Add a "phone_check" column', type: 'checkbox', def: true }],
  run: ([src], o) => {
    const dc = (o.country || '').trim().toUpperCase(), def = PHONE[dc]; if (!def) throw new Error('Unknown default country "' + o.country + '". Use a two-letter ISO code such as GB, US, DE, FR.');
    const { head, body } = tbl(src, o, 'phone numbers'), ci = o.col.trim() ? colIdx(head, o.col, 'phone column') : 0; let good = 0, review = 0;
    const conv = (raw) => {
      let s = raw.trim(); if (!s) return ['', 'empty']; s = s.replace(/(?:ext\.?|x|extension)\s*\d+\s*$/i, ''); if (/[A-Za-z]/.test(s.replace(/^\+/, ''))) return [raw, 'review: contains letters']; let digits = s.replace(/\D/g, ''), intl = false;
      if (/^\s*\+/.test(s)) intl = true; else if (digits.startsWith('00')) { intl = true; digits = digits.slice(2); }
      if (intl) { let cc = ''; for (const n of [1, 2, 3]) if (CC_SET.has(digits.slice(0, n))) { cc = digits.slice(0, n); break; } if (!cc) return [raw, 'review: unknown country code']; let nsn = digits.slice(cc.length); const c = Object.values(PHONE).find((x) => x.cc === cc); if (c.np && nsn.startsWith(c.np) && !c.len.includes(nsn.length) && c.len.includes(nsn.length - c.np.length)) nsn = nsn.slice(c.np.length); const lens = new Set(Object.values(PHONE).filter((x) => x.cc === cc).flatMap((x) => x.len)); if (!lens.has(nsn.length) || cc.length + nsn.length > 15) return ['+' + cc + nsn, 'review: unusual length for +' + cc]; return ['+' + cc + nsn, 'ok']; }
      let nsn = digits; if (def.np && nsn.startsWith(def.np) && (def.len.includes(nsn.length - def.np.length) || !def.len.includes(nsn.length))) nsn = nsn.slice(def.np.length);
      if (!def.len.includes(nsn.length)) return ['+' + def.cc + nsn, 'review: ' + nsn.length + ' digits is unusual for ' + dc]; return ['+' + def.cc + nsn, 'ok'];
    };
    const rows = body.map((r) => { const [v, st] = conv(r[ci]); if (st === 'ok') good++; else if (st !== 'empty') review++; r = r.slice(); r[ci] = v; if (o.flag) r.push(st); return r; });
    return csvResult([[...head, ...(o.flag ? ['phone_check'] : [])], ...rows], good + ' number(s) converted, ' + review + ' flagged for review. Checks only the digit count against the usual lengths for the country (from Google libphonenumber metadata); it does not know if a number is assigned.', 'phones-e164.csv');
  },
});

// ---------------------------------------------------------------- missing value filler
T.push({
  id: 'missing-value-filler', cat: SP, title: 'Missing Value Filler (Constant, Mean, Median, Forward Fill)',
  desc: 'Fill empty cells per column with a fixed value, the column mean or median, or the previous or next non-empty value. Set a default method and override single columns.',
  inputs: 1, labels: ['CSV with a header row'], sample: 'day,temp,city\n1,20,Oslo\n2,,\n3,24,Oslo\n4,,Rome\n5,30,\n',
  opts: [delimOpt, { id: 'def', label: 'Default method', type: 'select', choices: ['leave empty', 'constant', 'mean', 'median', 'forward fill', 'backward fill'], def: 'leave empty' }, { id: 'const', label: 'Constant for the default method', type: 'text', def: 'N/A' }, { id: 'per', label: 'Per column overrides, one per line: column: mean | median | forward | backward | const=VALUE', type: 'text', def: 'temp: mean; city: forward' }],
  run: ([src], o) => {
    const { head, body } = tbl(src, o, 'a CSV'), m = new Map(); for (const part of String(o.per || '').split(/[;\n]/).map((x) => x.trim()).filter(Boolean)) { const k = part.indexOf(':'); if (k < 1) throw new Error('Override "' + part + '" needs the form column: method'); m.set(colIdx(head, part.slice(0, k), 'column'), part.slice(k + 1).trim()); }
    const rows = body.map((r) => r.slice()); let filled = 0; const log = [];
    head.forEach((h, ci) => { let meth = m.get(ci); if (!meth) meth = { constant: 'const=' + o.const, mean: 'mean', median: 'median', 'forward fill': 'forward', 'backward fill': 'backward' }[o.def]; if (!meth) return; const empty = (r) => r[ci].trim() === ''; const nums = rows.map((r) => numv(r[ci])).filter(Number.isFinite); let n = 0;
      if (meth === 'mean' || meth === 'median') { if (!nums.length) { log.push(h + ': no numbers'); return; } const s = [...nums].sort((a, b) => a - b), v = meth === 'mean' ? sum(nums) / nums.length : quantile(s, 0.5), t = fmt(v); rows.forEach((r) => { if (empty(r)) { r[ci] = t; n++; } }); }
      else if (meth === 'forward') { let last = ''; rows.forEach((r) => { if (empty(r)) { if (last !== '') { r[ci] = last; n++; } } else last = r[ci]; }); }
      else if (meth === 'backward') { let nxt = ''; for (let i = rows.length - 1; i >= 0; i--) { if (empty(rows[i])) { if (nxt !== '') { rows[i][ci] = nxt; n++; } } else nxt = rows[i][ci]; } }
      else if (meth.startsWith('const=')) { const v = meth.slice(6); rows.forEach((r) => { if (empty(r)) { r[ci] = v; n++; } }); }
      else throw new Error('Unknown method "' + meth + '" for column ' + h + '.');
      filled += n; if (n) log.push(h + ': ' + n + ' (' + meth.split('=')[0] + ')'); });
    return csvResult(withHead(head, rows), filled + ' empty cell(s) filled. ' + log.join('; '), 'filled.csv');
  },
});

// ---------------------------------------------------------------- outliers
T.push({
  id: 'outlier-detector', cat: SP, title: 'Outlier Detector for a CSV Column (IQR or Z-Score Flag)',
  desc: 'Flag numeric outliers in a column with the Tukey IQR fences or a z-score threshold. Adds a flag column so you can filter, and lists the limits used.',
  inputs: 1, labels: ['CSV with a header row'], sample: 'id,value\n1,10\n2,12\n3,11\n4,13\n5,12\n6,95\n7,11\n8,9\n9,-40\n10,12\n',
  opts: [delimOpt, { id: 'col', label: 'Numeric column (name or number)', type: 'text', def: 'value' }, { id: 'method', label: 'Method', type: 'select', choices: ['IQR', 'z-score'], def: 'IQR' }, { id: 'k', label: 'Threshold (IQR multiplier, usual 1.5; or z limit, usual 3)', type: 'number', def: 1.5 }, { id: 'only', label: 'Output only the flagged rows', type: 'checkbox', def: false }],
  run: ([src], o) => {
    const { head, body } = tbl(src, o, 'a CSV'), ci = colIdx(head, o.col, 'column'), v = body.map((r) => numv(r[ci])), nums = v.filter(Number.isFinite); if (nums.length < 4) throw new Error('Need at least 4 numeric values in the column.');
    const k = Number(o.k) > 0 ? Number(o.k) : o.method === 'IQR' ? 1.5 : 3; let lo, hi, desc;
    if (o.method === 'IQR') { const s = [...nums].sort((a, b) => a - b), q1 = quantile(s, 0.25), q3 = quantile(s, 0.75); lo = q1 - k * (q3 - q1); hi = q3 + k * (q3 - q1); desc = `IQR method: Q1 ${fmt(q1)}, Q3 ${fmt(q3)}, fences ${fmt(lo)} to ${fmt(hi)} (quartiles with linear interpolation).`; }
    else { const mean = sum(nums) / nums.length, sd = Math.sqrt(sum(nums.map((x) => (x - mean) ** 2)) / (nums.length - 1)); lo = mean - k * sd; hi = mean + k * sd; desc = `z-score method: mean ${fmt(mean)}, sample standard deviation ${fmt(sd)}, limits ${fmt(lo)} to ${fmt(hi)} (|z| > ${k}).`; }
    const rows = body.map((r, i) => [...r, Number.isFinite(v[i]) ? (v[i] < lo ? 'low' : v[i] > hi ? 'high' : '') : 'not a number']), flagged = rows.filter((r) => r[r.length - 1] === 'low' || r[r.length - 1] === 'high');
    return csvResult([[...head, 'outlier'], ...(o.only ? flagged : rows)], flagged.length + ' outlier(s) of ' + nums.length + ' values. ' + desc, 'outliers.csv');
  },
});

// ---------------------------------------------------------------- wide <-> long
T.push({
  id: 'wide-to-long-reshaper', cat: SP, title: 'Wide to Long Reshaper (Unpivot and Pivot Back)',
  desc: 'Unpivot a wide table, such as one column per year, into long name and value pairs while keeping identifier columns. The reverse mode spreads a long table back out to wide.',
  inputs: 1, labels: ['CSV with a header row'], sample: 'country,2022,2023,2024\nNorway,5.1,5.3,5.6\nChile,2.0,2.4,2.9\n',
  opts: [delimOpt, { id: 'mode', label: 'Direction', type: 'select', choices: ['wide to long', 'long to wide'], def: 'wide to long' }, { id: 'ids', label: 'Identifier columns to keep (names or numbers, comma separated)', type: 'text', def: 'country' }, { id: 'vars', label: 'Wide to long: columns to stack (blank = all others)  |  Long to wide: name column', type: 'text', def: '' }, { id: 'nname', label: 'Wide to long: new name column  |  Long to wide: value column', type: 'text', def: 'year' }, { id: 'vname', label: 'Wide to long: new value column', type: 'text', def: 'value' }],
  run: ([src], o) => {
    const { head, body } = tbl(src, o, 'a CSV'), ids = colList(head, o.ids, 'identifier column');
    if (o.mode === 'long to wide') { const ni = colIdx(head, o.vars, 'name column'), vi = colIdx(head, o.nname, 'value column'), names = [...new Set(body.map((r) => r[ni]))], map = new Map(); for (const r of body) { const k = JSON.stringify(ids.map((i) => r[i])); if (!map.has(k)) map.set(k, { ids: ids.map((i) => r[i]), v: {} }); if (r[ni] in map.get(k).v) throw new Error('Two rows have the same identifiers and name "' + r[ni] + '".'); map.get(k).v[r[ni]] = r[vi]; } return csvResult([[...ids.map((i) => head[i]), ...names], ...[...map.values()].map((m) => [...m.ids, ...names.map((n) => m.v[n] ?? '')])], names.length + ' columns created from ' + head[ni] + '.', 'wide.csv'); }
    const vars = o.vars.trim() ? colList(head, o.vars, 'column to stack') : head.map((_, i) => i).filter((i) => !ids.includes(i)); if (!vars.length) throw new Error('No columns left to stack.');
    const rows = body.flatMap((r) => vars.map((vi) => [...ids.map((i) => r[i]), head[vi], r[vi]])); if (rows.length > 500000) throw new Error('Result would be too large.');
    return csvResult([[...ids.map((i) => head[i]), o.nname || 'variable', o.vname || 'value'], ...rows], vars.length + ' columns stacked into ' + rows.length + ' rows.', 'long.csv');
  },
});

// ---------------------------------------------------------------- spreadsheet diff
T.push({
  id: 'spreadsheet-diff', cat: SP, title: 'Spreadsheet Diff (Added, Removed and Changed Cells by Key)',
  desc: 'Compare an old and a new CSV table, matching rows by a key column or by position. Added rows, removed rows and changed cells are listed and colour-coded, with signs so colour is not the only cue.',
  inputs: 2, labels: ['Old version (CSV)', 'New version (CSV)'], sample: 'id,name,price\n1,Pen,2.50\n2,Book,12.00\n3,Bag,30.00\n', sample2: 'id,name,price\n1,Pen,2.75\n3,Bag,30.00\n4,Cap,9.00\n',
  opts: [delimOpt, { id: 'key', label: 'Key column (name or number, blank = match by row position)', type: 'text', def: 'id' }],
  run: ([a, b], o) => {
    const A = tbl(a, o, 'the old table'), B = tbl(b, o, 'the new table'), cols = [...A.head]; B.head.forEach((h) => { if (!cols.includes(h)) cols.push(h); });
    const get = (T2, r, c) => { const i = T2.head.indexOf(c); return i < 0 ? undefined : r[i]; };
    const ka = o.key.trim() ? colIdx(A.head, o.key, 'key column in the old table') : -1, kb = o.key.trim() ? colIdx(B.head, o.key, 'key column in the new table') : -1, mk = (T2, k, r, i) => (k >= 0 ? r[k].trim() : String(i + 1));
    const ma = new Map(), mb = new Map(); A.body.forEach((r, i) => ma.set(mk(A, ka, r, i), r)); B.body.forEach((r, i) => mb.set(mk(B, kb, r, i), r)); if (ma.size !== A.body.length || mb.size !== B.body.length) throw new Error('The key column has duplicate values. Pick a unique key or clear it.');
    const lines = [], htm = []; let add = 0, rem = 0, chg = 0, same = 0; const cell = (cls, t) => `<td class="${cls}">${esc(t)}</td>`;
    const keys = [...ma.keys(), ...[...mb.keys()].filter((k) => !ma.has(k))];
    for (const k of keys) {
      const ra = ma.get(k), rb = mb.get(k);
      if (ra && !rb) { rem++; lines.push(`- removed row ${k}: ${ra.join(', ')}`); htm.push(`<tr class="rem">${cols.map((c) => cell('rem', '- ' + (get(A, ra, c) ?? ''))).join('')}</tr>`); }
      else if (!ra && rb) { add++; lines.push(`+ added row ${k}: ${rb.join(', ')}`); htm.push(`<tr>${cols.map((c) => cell('add', '+ ' + (get(B, rb, c) ?? ''))).join('')}</tr>`); }
      else { const diffs = cols.filter((c) => (get(A, ra, c) ?? '') !== (get(B, rb, c) ?? '')); if (!diffs.length) { same++; continue; } chg++; for (const c of diffs) lines.push(`~ row ${k}, ${c}: "${get(A, ra, c) ?? '(no column)'}" -> "${get(B, rb, c) ?? '(no column)'}"`); htm.push(`<tr>${cols.map((c) => (diffs.includes(c) ? cell('chg', `${get(A, ra, c) ?? ''} → ${get(B, rb, c) ?? ''}`) : cell('', get(B, rb, c) ?? ''))).join('')}</tr>`); }
    }
    const sum2 = `${add} row(s) added, ${rem} removed, ${chg} changed, ${same} unchanged. Rows matched by ${o.key.trim() ? 'key "' + o.key.trim() + '"' : 'position'}.`;
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Diff</title><style>body{font:14px system-ui,sans-serif;margin:12px;background:#fff;color:#1a1a1a}table{border-collapse:collapse}th,td{border:1px solid #999;padding:2px 8px;text-align:left}th{background:#eee}.add{background:#cfeedd}.rem{background:#f7d4d4}.chg{background:#fff1b8}</style><body><p role="status">${esc(sum2)}</p><p>+ added, - removed, arrow = changed (old to new).</p><table><tr>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr>${htm.join('')}</table></body></html>`;
    return { html, text: sum2 + '\n' + lines.join('\n') };
  },
});

// ---------------------------------------------------------------- random sample
T.push({
  id: 'random-row-sampler', cat: SP, title: 'Random Row Sampler (Seeded Sample from a CSV)',
  desc: 'Draw a random sample of rows from a CSV by count or percentage, with an optional seed so you can repeat the draw. Sampling is without replacement and keeps the original row order.',
  inputs: 1, labels: ['CSV with a header row'], sample: Array.from({ length: 21 }, (_, i) => (i ? `${i},item ${i}` : 'id,name')).join('\n') + '\n',
  opts: [delimOpt, { id: 'n', label: 'Sample size (rows)', type: 'number', def: 5 }, { id: 'pct', label: 'or percentage of rows (overrides size when set, 0 = off)', type: 'number', def: 0 }, { id: 'seed', label: 'Seed (blank = different every run)', type: 'text', def: '42' }],
  run: ([src], o) => {
    const { head, body } = tbl(src, o, 'a CSV'); if (!body.length) throw new Error('No data rows.'); const pct = Number(o.pct), n = Math.min(body.length, pct > 0 ? Math.max(1, Math.round((body.length * Math.min(100, pct)) / 100)) : Math.floor(Number(o.n)));
    if (!(n >= 1)) throw new Error('Sample size must be 1 or more.'); const seed = o.seed !== '' && o.seed != null ? [...String(o.seed)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7) : (crypto.getRandomValues(new Uint32Array(1))[0] || 1), r = rng(seed), idx = body.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } const pick = idx.slice(0, n).sort((a, b) => a - b);
    return csvResult(withHead(head, pick.map((i) => body[i])), n + ' of ' + body.length + ' rows sampled' + (o.seed !== '' ? ' with seed "' + o.seed + '" (same seed and input give the same rows)' : ' with a random seed') + '.', 'sample.csv');
  },
});

// ---------------------------------------------------------------- column stats
T.push({
  id: 'column-statistics-summarizer', cat: SP, title: 'Column Statistics Summarizer (Mean, Median, Min, Max, Stdev per Column)',
  desc: 'Summarise every numeric column of a CSV in one table: count, missing, mean, median, min, max and sample standard deviation. Text columns are listed with their distinct count.',
  inputs: 1, labels: ['CSV with a header row'], sample: 'name,age,score,city\nAnn,31,88.5,Oslo\nBo,25,92,Rome\nCy,42,,Oslo\nDi,37,75.25,Lima\n',
  opts: [delimOpt, { id: 'dec', label: 'Decimals', type: 'number', def: 3 }],
  run: ([src], o) => {
    const { head, body } = tbl(src, o, 'a CSV'), dec = Math.round(optNum(o.dec, 3, 0, 10)), f = (x) => (Number.isFinite(x) ? String(+x.toFixed(dec)) : '');
    const rows = head.map((h, i) => { const col = body.map((r) => r[i].trim()), filled = col.filter((x) => x !== ''), nums = filled.map(numv); if (filled.length && nums.every(Number.isFinite)) { const s = [...nums].sort((a, b) => a - b), mean = sum(nums) / nums.length, sd = nums.length > 1 ? Math.sqrt(sum(nums.map((x) => (x - mean) ** 2)) / (nums.length - 1)) : NaN; return [h, 'number', String(nums.length), String(col.length - filled.length), f(mean), f(quantile(s, 0.5)), f(s[0]), f(s[s.length - 1]), f(sd)]; } return [h, 'text', String(filled.length), String(col.length - filled.length), '', '', '', '', 'distinct ' + new Set(filled).size]; });
    return csvResult([['column', 'type', 'count', 'missing', 'mean', 'median', 'min', 'max', 'stdev (sample)'], ...rows], body.length + ' rows, ' + head.length + ' columns. Missing = empty cells.', 'column-stats.csv');
  },
});

// ---------------------------------------------------------------- find and replace in table
T.push({
  id: 'table-find-replace', cat: SP, title: 'Find and Replace in Selected CSV Columns (Regex)',
  desc: 'Apply a regular expression find and replace to chosen columns of a CSV only. See how many cells changed and which, before you copy the result. $1 style groups work.',
  inputs: 1, labels: ['CSV with a header row'], sample: 'name,phone,note\nAnn,555-0100,call (urgent)\nBo,555-0101,ok\n',
  opts: [delimOpt, { id: 'cols', label: 'Columns to change (names or numbers, blank = all)', type: 'text', def: 'phone' }, { id: 'find', label: 'Find (regular expression)', type: 'text', def: '(\\d{3})-(\\d{4})' }, { id: 'rep', label: 'Replace with', type: 'text', def: '$1 $2' }, { id: 'flags', label: 'Flags', type: 'text', def: 'g' }],
  run: ([src], o) => {
    const { head, body } = tbl(src, o, 'a CSV'), idx = o.cols.trim() ? colList(head, o.cols, 'column') : head.map((_, i) => i); if (!o.find) throw new Error('Enter something to find.'); let re; try { re = new RegExp(o.find, (o.flags || '').replace(/[^gimsuy]/g, '')); } catch (e) { throw new Error('Invalid regular expression: ' + e.message); }
    let n = 0; const ex = []; const rows = body.map((r, ri) => { r = r.slice(); for (const i of idx) { const v = r[i].replace(re, o.rep); if (v !== r[i]) { n++; if (ex.length < 5) ex.push(`row ${ri + 1} ${head[i]}: "${r[i]}" -> "${v}"`); r[i] = v; } } return r; });
    return csvResult(withHead(head, rows), n + ' cell(s) changed in ' + idx.length + ' column(s).' + (ex.length ? ' Examples: ' + ex.join('; ') : ''), 'replaced.csv');
  },
});

// ---------------------------------------------------------------- category mapper
T.push({
  id: 'category-value-mapper', cat: SP, title: 'Category Value Mapper (Standardise Messy Labels)',
  desc: 'List every distinct value of a column with its count, then map messy labels to standard ones with "old => new" lines. The mapping is applied to all rows; unmapped values stay as they are.',
  inputs: 2, labels: ['CSV with a header row', 'Mapping lines: old => new (blank = list distinct values)'], sample: 'name,state\nAnn,NY\nBo,New York\nCy,ny\nDi,CA\nEd,Calif.\nFay,California\n', sample2: 'NY => New York\nny => New York\nCA => California\nCalif. => California\n',
  opts: [delimOpt, { id: 'col', label: 'Column to remap (name or number)', type: 'text', def: 'state' }, { id: 'ci', label: 'Ignore letter case when matching', type: 'checkbox', def: false }],
  run: ([src, map], o) => {
    const { head, body } = tbl(src, o, 'a CSV'), ci = colIdx(head, o.col, 'column'), cnt = new Map(); body.forEach((r) => cnt.set(r[ci], (cnt.get(r[ci]) || 0) + 1));
    if (!String(map).trim()) return csvResult([['value', 'rows'], ...[...cnt].sort((a, b) => b[1] - a[1]).map(([v, c]) => [v, String(c)])], cnt.size + ' distinct value(s) in "' + head[ci] + '". Write mapping lines in the second box, for example NY => New York.', 'distinct-values.csv');
    const key = (v) => (o.ci ? v.trim().toLowerCase() : v.trim()), mp = new Map(); for (const l of String(map).split(/\r?\n/)) { if (!l.trim()) continue; const k = l.indexOf('=>'); if (k < 0) throw new Error('Mapping line "' + l + '" needs =>'); mp.set(key(l.slice(0, k)), l.slice(k + 2).trim()); }
    let n = 0; const rows = body.map((r) => { const t = mp.get(key(r[ci])); if (t !== undefined && t !== r[ci]) { n++; r = r.slice(); r[ci] = t; } return r; }); const left = [...cnt.keys()].filter((v) => !mp.has(key(v)));
    return csvResult(withHead(head, rows), n + ' cell(s) remapped. Values with no mapping line: ' + (left.map((v) => '"' + v + '"').slice(0, 15).join(', ') || 'none') + '.', 'mapped.csv');
  },
});

// ================================================================ MAPS & GEO (all offline)
const RAD = Math.PI / 180, R_EARTH = 6371.0088; // mean Earth radius in km (IUGG)
const UNITS = { km: 1, mi: 0.621371192237334, nmi: 0.5399568034557235, m: 1000 };
// ---- coordinate text parsing: decimal, hemisphere letters, DMS, DDM
function parseLatLon(str) {
  const s = String(str).trim(); if (!s) throw new Error('Empty coordinate.');
  const toks = s.replace(/[°′″’”'"º]/g, ' ').replace(/,/g, ' ').match(/[NSEWnsew](?![a-z])|[-+]?\d+(?:\.\d+)?/g);
  if (!toks) throw new Error(`Cannot read the coordinate "${s}".`);
  const groups = []; let cur = [], pre = '';
  for (const t of toks) {
    if (/[NSEWnsew]/.test(t)) { const L = t.toUpperCase(); if (cur.length) { if (cur.h) { groups.push({ n: cur, h: cur.h }); cur = []; pre = L; } else { groups.push({ n: cur, h: L }); cur = []; } } else pre = L; }
    else { if (pre && !cur.length) { cur.h = pre; pre = ''; } cur.push(t); }
  }
  if (cur.length) groups.push({ n: cur, h: cur.h || '' });
  let gs = groups; if (gs.length === 1 && !gs[0].h && gs[0].n.length >= 2 && gs[0].n.length % 2 === 0) { const k = gs[0].n.length / 2; gs = [{ n: gs[0].n.slice(0, k), h: '' }, { n: gs[0].n.slice(k), h: '' }]; }
  if (gs.length !== 2) throw new Error(`Expected two values (latitude and longitude) in "${s}".`);
  const val = (g) => { const [d, m = '0', sec = '0'] = g.n; if (g.n.length > 3) throw new Error(`Too many numbers in "${s}".`); const dd = parseFloat(d); if ((g.n.length > 1 && !Number.isInteger(dd)) || +m >= 60 || +sec >= 60 || (g.n.length === 3 && !Number.isInteger(+m))) throw new Error(`Cannot read the degrees, minutes and seconds in "${s}".`); let v = Math.abs(dd) + +m / 60 + +sec / 3600; if (dd < 0 || /^-/.test(d) || g.h === 'S' || g.h === 'W') v = -v; return v; };
  let [a, b] = gs; let lat, lon;
  const isLon = (g) => g.h === 'E' || g.h === 'W', isLat = (g) => g.h === 'N' || g.h === 'S';
  if (isLon(a) || isLat(b)) { lon = val(a); lat = val(b); if (isLon(b) || isLat(a)) throw new Error(`Both values of "${s}" use the same axis letter.`); } else { lat = val(a); lon = val(b); }
  if (!(Math.abs(lat) <= 90)) throw new Error(`Latitude ${fmt(lat)} is outside -90 to 90 in "${s}".`); if (!(Math.abs(lon) <= 180)) throw new Error(`Longitude ${fmt(lon)} is outside -180 to 180 in "${s}".`);
  return { lat, lon };
}
const pointsIn = (text, min = 1) => { const pts = []; for (const l of text.split(/\r?\n/)) { const t = l.trim(); if (!t || t.startsWith('#')) continue; pts.push({ ...parseLatLon(t), label: '' }); } if (pts.length < min) throw new Error(`Enter at least ${min} coordinate line${min > 1 ? 's' : ''}, for example 48.8584, 2.2945`); if (pts.length > 5000) throw new Error('At most 5000 points.'); return pts; };
const hav = (a, b) => { const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD, h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2; return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h))); };
const bearing = (a, b) => { const y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD), x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD); return (Math.atan2(y, x) / RAD + 360) % 360; };
function destination(a, brg, distKm) { const d = distKm / R_EARTH, t = brg * RAD, p1 = a.lat * RAD, l1 = a.lon * RAD, p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t)), l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2)); return { lat: p2 / RAD, lon: ((l2 / RAD + 540) % 360) - 180 }; }
// Vincenty inverse on WGS 84 (metres); returns null if it fails to converge (nearly antipodal)
function vincenty(p, q) {
  const a = 6378137, f = 1 / 298.257223563, b = (1 - f) * a, L = (q.lon - p.lon) * RAD, U1 = Math.atan((1 - f) * Math.tan(p.lat * RAD)), U2 = Math.atan((1 - f) * Math.tan(q.lat * RAD)), sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
  let lam = L, it = 0, sS, cS, sig, sA, c2A, c2SM; do { const sl = Math.sin(lam), cl = Math.cos(lam); sS = Math.hypot(cU2 * sl, cU1 * sU2 - sU1 * cU2 * cl); if (!sS) return 0; cS = sU1 * sU2 + cU1 * cU2 * cl; sig = Math.atan2(sS, cS); sA = (cU1 * cU2 * sl) / sS; c2A = 1 - sA * sA; c2SM = c2A ? cS - (2 * sU1 * sU2) / c2A : 0; const C = (f / 16) * c2A * (4 + f * (4 - 3 * c2A)), lp = lam; lam = L + (1 - C) * f * sA * (sig + C * sS * (c2SM + C * cS * (-1 + 2 * c2SM * c2SM))); if (Math.abs(lam - lp) < 1e-12) break; } while (++it < 200);
  if (it >= 200) return null; const u2 = (c2A * (a * a - b * b)) / (b * b), A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2))), B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2))), dS = B * sS * (c2SM + (B / 4) * (cS * (-1 + 2 * c2SM * c2SM) - (B / 6) * c2SM * (-3 + 4 * sS * sS) * (-3 + 4 * c2SM * c2SM)));
  return b * A * (sig - dS);
}
const dms = (v, isLat) => { const h = isLat ? (v < 0 ? 'S' : 'N') : (v < 0 ? 'W' : 'E'), a = Math.abs(v); let d = Math.floor(a), m = Math.floor((a - d) * 60), s = round(((a - d) * 60 - m) * 60, 3); if (s >= 60) { s = 0; m++; } if (m >= 60) { m = 0; d++; } return `${d}°${p2(m)}′${String(s.toFixed(3)).padStart(6, '0').replace(/\.?0+$/, '')}″${h}`; };
const ddm = (v, isLat) => { const h = isLat ? (v < 0 ? 'S' : 'N') : (v < 0 ? 'W' : 'E'), a = Math.abs(v); let d = Math.floor(a), m = round((a - d) * 60, 5); if (m >= 60) { m = 0; d++; } return `${d}°${m}′${h}`; };

// ---- UTM (WGS 84, Kruger series to 4th order) and MGRS
const WGS = { a: 6378137, f: 1 / 298.257223563 }, K0 = 0.9996, NN = WGS.f / (2 - WGS.f), E2 = WGS.f * (2 - WGS.f), EE = Math.sqrt(E2), AA = (WGS.a / (1 + NN)) * (1 + NN ** 2 / 4 + NN ** 4 / 64);
const ALPHA = [NN / 2 - (2 * NN ** 2) / 3 + (5 * NN ** 3) / 16 + (41 * NN ** 4) / 180, (13 * NN ** 2) / 48 - (3 * NN ** 3) / 5 + (557 * NN ** 4) / 1440, (61 * NN ** 3) / 240 - (103 * NN ** 4) / 140, (49561 * NN ** 4) / 161280];
const BETA = [NN / 2 - (2 * NN ** 2) / 3 + (37 * NN ** 3) / 96 - NN ** 4 / 360, NN ** 2 / 48 + NN ** 3 / 15 - (437 * NN ** 4) / 1440, (17 * NN ** 3) / 480 - (37 * NN ** 4) / 840, (4397 * NN ** 4) / 161280];
const DELTA = [2 * NN - (2 * NN ** 2) / 3 - 2 * NN ** 3 + (116 * NN ** 4) / 45, (7 * NN ** 2) / 3 - (8 * NN ** 3) / 5 - (227 * NN ** 4) / 45, (56 * NN ** 3) / 15 - (136 * NN ** 4) / 35, (4279 * NN ** 4) / 630];
const BANDS = 'CDEFGHJKLMNPQRSTUVWX';
function utmZone(lat, lon) { let z = Math.floor((lon + 180) / 6) + 1; if (z > 60) z = 60; if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) z = 32; if (lat >= 72 && lat <= 84) { if (lon >= 0 && lon < 9) z = 31; else if (lon >= 9 && lon < 21) z = 33; else if (lon >= 21 && lon < 33) z = 35; else if (lon >= 33 && lon < 42) z = 37; } return z; }
function toUTM(lat, lon, zone) {
  if (lat < -80 || lat > 84) throw new Error('UTM covers latitudes -80 to 84 only (use UPS near the poles).'); const z = zone || utmZone(lat, lon), lam = (lon - ((z - 1) * 6 - 180 + 3)) * RAD, phi = lat * RAD, s = Math.sin(phi);
  const t = Math.sinh(Math.atanh(s) - EE * Math.atanh(EE * s)), xi0 = Math.atan2(t, Math.cos(lam)), eta0 = Math.asinh(Math.sin(lam) / Math.hypot(t, Math.cos(lam)));
  let xi = xi0, eta = eta0; ALPHA.forEach((al, j) => { xi += al * Math.sin(2 * (j + 1) * xi0) * Math.cosh(2 * (j + 1) * eta0); eta += al * Math.cos(2 * (j + 1) * xi0) * Math.sinh(2 * (j + 1) * eta0); });
  const x = 500000 + K0 * AA * eta, y0 = K0 * AA * xi, south = lat < 0; return { zone: z, band: BANDS[Math.min(19, Math.floor((lat + 80) / 8))], hemi: south ? 'S' : 'N', e: x, n: south ? y0 + 10000000 : y0 };
}
function fromUTM(zone, e, n, south) {
  const xi = (south ? n - 10000000 : n) / (K0 * AA), eta = (e - 500000) / (K0 * AA); let xi0 = xi, eta0 = eta; BETA.forEach((b, j) => { xi0 -= b * Math.sin(2 * (j + 1) * xi) * Math.cosh(2 * (j + 1) * eta); eta0 -= b * Math.cos(2 * (j + 1) * xi) * Math.sinh(2 * (j + 1) * eta); });
  const chi = Math.asin(Math.sin(xi0) / Math.cosh(eta0)); let phi = chi; DELTA.forEach((d, j) => { phi += d * Math.sin(2 * (j + 1) * chi); }); const lam = Math.atan2(Math.sinh(eta0), Math.cos(xi0));
  return { lat: phi / RAD, lon: (zone - 1) * 6 - 180 + 3 + lam / RAD };
}
const COLS = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'], ROWS = 'ABCDEFGHJKLMNPQRSTUV';
function toMGRS(lat, lon, digits = 5) { const u = toUTM(lat, lon); u.e = Math.round(u.e * 1000) / 1000; u.n = Math.round(u.n * 1000) / 1000; const  col = COLS[(u.zone - 1) % 3][Math.floor(u.e / 100000) - 1], row = ROWS[(Math.floor(u.n / 100000) + (u.zone % 2 ? 0 : 5)) % 20], k = 10 ** (5 - digits); return `${String(u.zone).padStart(2, '0')}${u.band}${col}${row}${String(Math.floor((u.e % 100000) / k)).padStart(digits, '0')}${String(Math.floor((u.n % 100000) / k)).padStart(digits, '0')}`; }
function fromMGRS(str) {
  const m = /^(\d{1,2})\s*([C-HJ-NP-X])\s*([A-HJ-NP-Z])\s*([A-HJ-NP-V])\s*(\d*)\s*(\d*)$/i.exec(str.trim()); if (!m) throw new Error('Not an MGRS reference.');
  let digs = m[5] + m[6]; if (m[6] === '' && digs.length % 2) throw new Error('MGRS digits must come in pairs (easting and northing).'); const half = m[6] === '' ? digs.length / 2 : Math.max(m[5].length, m[6].length); if (m[6] !== '' && m[5].length !== m[6].length) throw new Error('MGRS easting and northing need the same number of digits.'); if (half > 5) throw new Error('At most 5 digits per axis.');
  const z = +m[1], band = m[2].toUpperCase(), k = 10 ** (5 - half), eD = half ? +(m[6] === '' ? digs.slice(0, half) : m[5]) * k : 0, nD = half ? +(m[6] === '' ? digs.slice(half) : m[6]) * k : 0, ci = COLS[(z - 1) % 3].indexOf(m[3].toUpperCase()); if (z < 1 || z > 60) throw new Error('UTM zone must be 1 to 60.'); if (ci < 0) throw new Error('The 100 km column letter does not fit this zone.');
  const e = (ci + 1) * 100000 + eD, rowIdx = ROWS.indexOf(m[4].toUpperCase()), nRow = (((rowIdx - (z % 2 ? 0 : 5)) % 20) + 20) % 20 * 100000, bi = BANDS.indexOf(band), latB = -80 + bi * 8, south = bi < 10; // bands C-M are south
  const minN = toUTM(Math.min(84, latB), (z - 1) * 6 - 180 + 3, z).n; let n = nRow + nD; while (n < minN - 150000) n += 2000000;
  return { zone: z, e, n, south, ...fromUTM(z, e, n, south) };
}

// ---- Open Location Code (Plus Codes), after the published specification (github.com/google/open-location-code)
const OLC = '23456789CFGHJMPQRVWX', OLC_SEP_POS = 8, FLAT = 8000 * 3125, FLNG = 8000 * 1024;
const olcPrec = (len) => (len <= 10 ? 20 ** Math.floor(len / -2 + 2) : 20 ** -3 / 5 ** (len - 10));
function olcEncode(lat, lon, len = 10) {
  if (len < 2 || len > 15 || (len < 10 && len % 2)) throw new Error('Plus Code length must be 2, 4, 6, 8, 10 or 11 to 15.');
  lat = Math.min(90 - olcPrec(len) * (lat >= 90 ? 1 : 0), Math.max(-90, lat)); lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  let la = Math.floor(Math.round((lat + 90) * FLAT * 1e6) / 1e6), lo = Math.floor(Math.round((lon + 180) * FLNG * 1e6) / 1e6), code = '';
  if (len > 10) { for (let i = 0; i < 5; i++) { code = OLC[(la % 5) * 4 + (lo % 4)] + code; la = Math.floor(la / 5); lo = Math.floor(lo / 4); } } else { la = Math.floor(la / 3125); lo = Math.floor(lo / 1024); }
  for (let i = 0; i < 5; i++) { code = OLC[lo % 20] + code; code = OLC[la % 20] + code; la = Math.floor(la / 20); lo = Math.floor(lo / 20); }
  code = code.slice(0, OLC_SEP_POS) + '+' + code.slice(OLC_SEP_POS);
  return len <= OLC_SEP_POS ? code.slice(0, len) + '0'.repeat(OLC_SEP_POS - len) + '+' : code.slice(0, len + 1);
}
const olcClean = (c) => { c = String(c).trim().toUpperCase(); if ([...c].some((ch) => ch !== '+' && ch !== '0' && !OLC.includes(ch))) throw new Error('A Plus Code uses only the characters 23456789CFGHJMPQRVWX, one + and optional 0 padding.'); return c; };
function olcDecode(code) {
  code = olcClean(code); const p = code.indexOf('+'); if (p < 0 || p !== code.lastIndexOf('+') || p > 8 || p % 2) throw new Error('A Plus Code needs exactly one + at position 2, 4, 6 or 8.'); if (code.slice(p + 1).length === 1) throw new Error('A single character after + is not allowed.');
  const z = code.indexOf('0'); if (z >= 0 && (p < 8 || code.slice(p + 1))) throw new Error('Padding with 0 only works in codes that end in +.'); let c = code.replace('+', '').replace(/0+$/, ''); if (c.length < 2) throw new Error('Plus Code is too short.'); c = c.slice(0, 15);
  let lat = -90, lng = -180, res = 20; const np = Math.min(c.length, 10);
  for (let i = 0; i < np; i += 2) { lat += OLC.indexOf(c[i]) * res; lng += OLC.indexOf(c[i + 1]) * res; if (i + 2 < np) res /= 20; }
  let hLat = res, hLng = res; if (c.length > 10) { hLat = 0.000125; hLng = 0.000125; for (let i = 10; i < c.length; i++) { const d = OLC.indexOf(c[i]); hLat /= 5; hLng /= 4; lat += Math.floor(d / 4) * hLat; lng += (d % 4) * hLng; } }
  return { lat, lng, hLat, hLng, len: c.length, cLat: lat + hLat / 2, cLng: lng + hLng / 2 };
}
function olcRecover(short, rLat, rLon) {
  short = olcClean(short); const p = short.indexOf('+'); if (p < 0) throw new Error('Not a Plus Code (no +).'); if (p >= 8) return olcDecode(short); const pad = 8 - p, prefix = olcEncode(rLat, rLon, 8).slice(0, pad), d = olcDecode(prefix + short), res = 20 ** (2 - pad / 2), edge = res / 2; let la = d.cLat, lo = d.cLng;
  if (rLat + edge < la && la - res >= -90) la -= res; else if (rLat - edge > la && la + res <= 90) la += res; if (rLon + edge < lo) lo -= res; else if (rLon - edge > lo) lo += res; return olcDecode(olcEncode(la, lo, prefix.length + short.replace('+', '').length));
}

// ---- tools: coordinate converter
const coordLine = (l) => {
  const s = l.trim(); let m;
  if ((m = /^(\d{1,2})\s*([C-HJ-NP-X])\s*([A-HJ-NP-Z])\s*([A-HJ-NP-V])\s*(\d*)\s*(\d*)$/i.exec(s)) && /^\d{1,2}[C-X]/i.test(s)) { const r = fromMGRS(s); return { ...r, src: 'MGRS' }; }
  if ((m = /^(\d{1,2})\s*([C-HJ-NP-X])?\s*[, ]\s*(\d+(?:\.\d+)?)\s*m?\s*E?\s*[, ]\s*(\d+(?:\.\d+)?)\s*m?\s*N?$/i.exec(s)) && (m[2] || /E/i.test(s))) { const z = +m[1], south = m[2] ? BANDS.indexOf(m[2].toUpperCase()) < 10 : false; if (z < 1 || z > 60) throw new Error('UTM zone must be 1 to 60.'); return { ...fromUTM(z, +m[3], +m[4], south), src: 'UTM' }; }
  if (/^[23456789CFGHJMPQRVWX0]{2,7}\+[23456789CFGHJMPQRVWX]*$/i.test(s)) throw new Error('A short Plus Code needs a reference location: use the Plus Code converter tool.');
  if ((m = /^[23456789CFGHJMPQRVWX0]{8}\+[23456789CFGHJMPQRVWX]*$/i.exec(s)) && !/\s/.test(s)) { const d = olcDecode(s); return { lat: d.cLat, lon: d.cLng, src: 'Plus Code' }; }
  return { ...parseLatLon(s), src: 'decimal / DMS' };
};
T.push({
  id: 'coordinate-format-converter', cat: GEO, title: 'Coordinate Format Converter (Decimal, DMS, UTM, MGRS, Plus Code)',
  desc: 'Enter a position as decimal degrees, degrees-minutes-seconds, UTM, MGRS or a Plus Code and see it in all of them, one line per input. Offline maths on the WGS 84 ellipsoid.',
  inputs: 1, labels: ['Coordinates, one per line: 48.8584, 2.2945 | 40°26′46″N 79°58′56″W | 31U 448251 5411932 | 18TWL8040712345 | 8FW4V75V+8Q'], sample: '48.8584, 2.2945\n40°26′46″N 79°58′56″W\n31U 448251 5411932\n33TWM 80000 05000\n8FVC9G8F+6W\n-33.8568, 151.2153\n',
  opts: [{ id: 'plus', label: 'Plus Code length', type: 'select', choices: ['10', '11', '8'], def: '10' }],
  run: ([src], o) => {
    const lines = need(src, 'coordinates').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')); if (lines.length > 500) throw new Error('At most 500 lines.');
    return lines.map((l) => {
      const c = coordLine(l), out = [`Input:      ${l.trim()}   (read as ${c.src})`, `Decimal:    ${round(c.lat, 7)}, ${round(c.lon, 7)}`, `DMS:        ${dms(c.lat, true)} ${dms(c.lon, false)}`, `DDM:        ${ddm(c.lat, true)} ${ddm(c.lon, false)}`];
      if (c.lat >= -80 && c.lat <= 84) { const u = toUTM(c.lat, c.lon); out.push(`UTM:        ${u.zone}${u.band} ${Math.round(u.e)} ${Math.round(u.n)}  (zone ${u.zone}, ${u.hemi === 'N' ? 'north' : 'south'}, easting ${round(u.e, 2)} m, northing ${round(u.n, 2)} m)`, `MGRS:       ${toMGRS(c.lat, c.lon)}`); } else out.push('UTM / MGRS: not defined here (latitude outside -80 to 84).');
      out.push(`Plus Code:  ${olcEncode(c.lat, c.lon, +o.plus)}`); return out.join('\n');
    }).join('\n\n');
  },
});

T.push({
  id: 'plus-code-converter', cat: GEO, title: 'Plus Code (Open Location Code) Encoder, Decoder and Short-Code Recovery',
  desc: 'Turn latitude and longitude into a Plus Code, decode a Plus Code into its area, or expand a short code such as "9G8F+6W" using a nearby reference location. Works offline.',
  inputs: 1, labels: ['A Plus Code, or a coordinate such as 47.365590, 8.524997'], sample: '8FVC9G8F+6W',
  opts: [{ id: 'len', label: 'Length when encoding', type: 'select', choices: ['10', '11', '8', '6', '4', '12', '13', '14', '15'], def: '10' }, { id: 'ref', label: 'Reference location for short codes (lat, lon)', type: 'text', def: '47.4, 8.5' }],
  run: ([src], o) => {
    const s = need(src, 'a Plus Code or coordinate').trim();
    if (/^[23456789CFGHJMPQRVWX0]*\+[23456789CFGHJMPQRVWX]*$/i.test(s)) {
      const short = s.indexOf('+') < 8; let d, note = ''; if (short) { const r = parseLatLon(o.ref || ''); d = olcRecover(s, r.lat, r.lon); note = `\nFull code:  ${olcEncode(d.cLat, d.cLng, d.len)}  (short code expanded near ${o.ref})`; } else d = olcDecode(s);
      return `Plus Code:  ${s.toUpperCase()}${note}\nCentre:     ${round(d.cLat, 8)}, ${round(d.cLng, 8)}\nSouth-west: ${round(d.lat, 8)}, ${round(d.lng, 8)}\nNorth-east: ${round(d.lat + d.hLat, 8)}, ${round(d.lng + d.hLng, 8)}\nArea size:  ${fmt(d.hLat * 111320)} m north-south by about ${fmt(d.hLng * 111320 * Math.cos(d.cLat * RAD))} m east-west`;
    }
    const c = parseLatLon(s), code = olcEncode(c.lat, c.lon, +o.len), d = olcDecode(code);
    return `Coordinate: ${round(c.lat, 8)}, ${round(c.lon, 8)}\nPlus Code:  ${code}\nShort code: ${code.slice(4)}  (valid near the same area; recover it with a reference location within about 50 km)\nCell:       ${fmt(d.hLat * 111320)} m tall, about ${fmt(d.hLng * 111320 * Math.cos(c.lat * RAD))} m wide`;
  },
});

// ---- tools: distance along a path
T.push({
  id: 'geo-path-distance', cat: GEO, title: 'Path Distance Calculator (Great-Circle Length of a Route from Coordinates)',
  desc: 'Paste a list of coordinates to get the length of each leg and the total, with initial bearings. Great-circle (haversine) on a sphere, or the more exact Vincenty ellipsoid method; units km, miles or nautical miles.',
  inputs: 1, labels: ['Coordinates, one per line (lat, lon; decimal or DMS)'], sample: '51.5074, -0.1278\n48.8566, 2.3522\n50.1109, 8.6821\n52.5200, 13.4050\n',
  opts: [{ id: 'unit', label: 'Unit', type: 'select', choices: ['km', 'mi', 'nmi', 'm'], def: 'km' }, { id: 'method', label: 'Method', type: 'select', choices: ['haversine (sphere)', 'Vincenty (WGS 84 ellipsoid)'], def: 'haversine (sphere)' }, { id: 'close', label: 'Close the loop (return to the first point)', type: 'checkbox', def: false }],
  run: ([src], o) => {
    const pts = pointsIn(need(src, 'coordinates'), 2), u = UNITS[o.unit] || 1; if (o.close) pts.push(pts[0]); let tot = 0; const vin = o.method.startsWith('Vincenty'), rows = [];
    for (let i = 1; i < pts.length; i++) { let d = hav(pts[i - 1], pts[i]); if (vin) { const v = vincenty(pts[i - 1], pts[i]); if (v === null) throw new Error('Vincenty did not converge for leg ' + i + ' (nearly opposite points). Use haversine.'); d = v / 1000; } tot += d; rows.push(`${String(i).padStart(3)}  ${(d * u).toFixed(3).padStart(12)} ${o.unit}  ${(tot * u).toFixed(3).padStart(12)} ${o.unit}  bearing ${bearing(pts[i - 1], pts[i]).toFixed(1).padStart(5)}°   ${pts[i - 1].lat.toFixed(5)}, ${pts[i - 1].lon.toFixed(5)} -> ${pts[i].lat.toFixed(5)}, ${pts[i].lon.toFixed(5)}`); }
    const straight = hav(pts[0], pts[pts.length - 1]) * u;
    return `Leg  Distance            Cumulative            Initial bearing\n${rows.join('\n')}\n\nTotal: ${(tot * u).toFixed(3)} ${o.unit} over ${pts.length - 1} leg(s)\nStraight line first to last: ${straight.toFixed(3)} ${o.unit}\nMethod: ${vin ? 'Vincenty inverse, WGS 84 (about 0.5 mm accurate)' : 'haversine on a sphere of radius 6371.0088 km (up to about 0.5% off the ellipsoid)'}. Distances follow the shortest path over the surface between points, not roads.`;
  },
});

T.push({
  id: 'geo-midpoint-finder', cat: GEO, title: 'Midpoint and Centre Finder for Several Coordinates',
  desc: 'Give two or more coordinates and get the great-circle midpoint (for two points), the geographic centre of gravity and each point\'s distance from it. Use it to pick a fair meeting point once you have the coordinates.',
  inputs: 1, labels: ['Coordinates, one per line (lat, lon)'], sample: '52.3676, 4.9041\n50.8503, 4.3517\n48.8566, 2.3522\n',
  opts: [{ id: 'unit', label: 'Unit', type: 'select', choices: ['km', 'mi', 'nmi'], def: 'km' }],
  run: ([src], o) => {
    const pts = pointsIn(need(src, 'coordinates'), 2), u = UNITS[o.unit] || 1, xyz = pts.map((p) => [Math.cos(p.lat * RAD) * Math.cos(p.lon * RAD), Math.cos(p.lat * RAD) * Math.sin(p.lon * RAD), Math.sin(p.lat * RAD)]), c = [0, 1, 2].map((i) => sum(xyz.map((v) => v[i])) / pts.length), nrm = Math.hypot(...c);
    if (nrm < 1e-9) throw new Error('The points are spread evenly around the globe, so there is no single centre.');
    const ctr = { lat: Math.atan2(c[2], Math.hypot(c[0], c[1])) / RAD, lon: Math.atan2(c[1], c[0]) / RAD }, rows = pts.map((p, i) => `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}   ${(hav(p, ctr) * u).toFixed(2)} ${o.unit}`);
    let mid = ''; if (pts.length === 2) { const m = { lat: ctr.lat, lon: ctr.lon }; mid = `Great-circle midpoint of the two points: ${m.lat.toFixed(6)}, ${m.lon.toFixed(6)}  (${(hav(pts[0], pts[1]) * u / 2).toFixed(2)} ${o.unit} from each)\n`; }
    return `${mid}Centre of gravity: ${ctr.lat.toFixed(6)}, ${ctr.lon.toFixed(6)}\nMean distance to the points: ${(sum(pts.map((p) => hav(p, ctr))) / pts.length * u).toFixed(2)} ${o.unit}\n\nPoint to centre\n${rows.join('\n')}\n\nThe centre of gravity is the mean of the points as 3D vectors, projected to the surface. It minimises squared distance, not the longest trip, and it ignores roads and borders.`;
  },
});

T.push({
  id: 'radius-circle-geojson', cat: GEO, title: 'Radius Circle Generator (GeoJSON Polygon and SVG Around a Point)',
  desc: 'Enter a centre and a radius and get a circle as a GeoJSON polygon (accurate great-circle points), its bounding box and area, plus an SVG preview. Add several radii for rings.',
  inputs: 1, labels: ['Centre: lat, lon'], sample: '51.5074, -0.1278',
  opts: [{ id: 'radii', label: 'Radius or radii, comma separated', type: 'text', def: '5, 10, 25' }, { id: 'unit', label: 'Unit', type: 'select', choices: ['km', 'mi', 'nmi', 'm'], def: 'km' }, { id: 'steps', label: 'Points per circle', type: 'number', def: 72 }],
  run: ([src], o) => {
    const c = parseLatLon(need(src, 'a centre point')), u = UNITS[o.unit] || 1, radii = o.radii.split(',').map((x) => numv(x)).filter(Number.isFinite), steps = Math.round(optNum(o.steps, 72, 8, 720)); if (!radii.length || radii.some((r) => r <= 0)) throw new Error('Enter one or more positive radii.'); if (radii.length > 20) throw new Error('At most 20 radii.');
    const feats = [{ type: 'Feature', properties: { name: 'centre' }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } }], rows = []; let big = 0;
    for (const r of radii) { const km = r / u, ring = Array.from({ length: steps + 1 }, (_, i) => { const p = destination(c, (360 * (i % steps)) / steps, km); return [round(p.lon, 6), round(p.lat, 6)]; }); big = Math.max(big, km); const ang = km / R_EARTH, area = 2 * Math.PI * R_EARTH * R_EARTH * (1 - Math.cos(Math.min(Math.PI, ang))); feats.push({ type: 'Feature', properties: { radius: r, unit: o.unit }, geometry: { type: 'Polygon', coordinates: [ring] } }); const lons = ring.map((p) => p[0]), lats = ring.map((p) => p[1]); rows.push(`${r} ${o.unit}: area ${fmt(area * (u * u > 0 ? 1 : 1) * u * u)} sq ${o.unit}, bbox ${fmt(Math.min(...lons))}, ${fmt(Math.min(...lats))} to ${fmt(Math.max(...lons))}, ${fmt(Math.max(...lats))}`); }
    if (big > 10000) throw new Error('Radius is too large for a circle.');
    const gj = JSON.stringify({ type: 'FeatureCollection', features: feats }, null, 1);
    const W = 420, H = 420, sc = (W / 2 - 30) / (big * 1.0), cosl = 1, mkp = (lon, lat) => `${(W / 2 + (lon - c.lon) * RAD * R_EARTH * Math.cos(c.lat * RAD) * sc).toFixed(1)},${(H / 2 - (lat - c.lat) * RAD * R_EARTH * sc * cosl).toFixed(1)}`;
    const svg = svgDoc(W, H, 'Radius circles', `Circles of radius ${radii.join(', ')} ${o.unit} around ${c.lat}, ${c.lon}.`, feats.slice(1).map((f, i) => `<polygon points="${f.geometry.coordinates[0].map(([lo, la]) => mkp(lo, la)).join(' ')}" fill="${PAL[i % PAL.length]}" fill-opacity=".12" stroke="${PAL[i % PAL.length]}" stroke-width="1.5"/><text x="${W / 2 + 4}" y="${(H / 2 - (radii[i] / u) * sc - 4).toFixed(1)}" font-size="11">${radii[i]} ${o.unit}</text>`).join('') + `<circle cx="${W / 2}" cy="${H / 2}" r="4" fill="#111"/>`);
    return { html: `<!doctype html><html lang="en"><meta charset="utf-8"><title>Circles</title><style>body{font:14px system-ui,sans-serif;margin:12px;background:#fff;color:#1a1a1a}</style><body>${svg}<p>${esc(rows.join(' | '))}</p></body></html>`, text: gj, blob: new Blob([gj], { type: 'application/octet-stream' }), filename: 'circles.geojson' };
  },
});

// ---- tools: sun times and sun path (NOAA solar calculator equations, after Meeus)
const julian = (y, m, d) => { if (m <= 2) { y--; m += 12; } const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4); return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5; };
function sunPos(jd) {
  const T0 = (jd - 2451545) / 36525, L0 = (280.46646 + T0 * (36000.76983 + T0 * 0.0003032)) % 360, M = 357.52911 + T0 * (35999.05029 - 0.0001537 * T0), e = 0.016708634 - T0 * (0.000042037 + 0.0000001267 * T0), Mr = M * RAD;
  const C = Math.sin(Mr) * (1.914602 - T0 * (0.004817 + 0.000014 * T0)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T0) + Math.sin(3 * Mr) * 0.000289, om = 125.04 - 1934.136 * T0, lam = L0 + C - 0.00569 - 0.00478 * Math.sin(om * RAD), sec = 21.448 - T0 * (46.815 + T0 * (0.00059 - T0 * 0.001813)), eps = 23 + (26 + sec / 60) / 60 + 0.00256 * Math.cos(om * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lam * RAD)) / RAD, y = Math.tan((eps * RAD) / 2) ** 2, L0r = L0 * RAD, eq = (4 / RAD) * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  return { decl, eq };
}
function riseSet(jd0, lat, lon, zen, rise) { // minutes after 0h UT (can be outside 0..1440 near the date line); NaN = never; +/-Infinity = sun stays above/below
  const calc = (jd) => { const { decl, eq } = sunPos(jd), c = Math.cos(zen * RAD) / (Math.cos(lat * RAD) * Math.cos(decl * RAD)) - Math.tan(lat * RAD) * Math.tan(decl * RAD); if (c > 1) return Infinity; if (c < -1) return -Infinity; const ha = Math.acos(c) / RAD * (rise ? 1 : -1); return 720 - 4 * (lon + ha) - eq; };
  let t = calc(jd0); if (!Number.isFinite(t)) return t === Infinity ? NaN : -t; t = calc(jd0 + t / 1440); return t;
}
function solarNoon(jd0, lon) { let t = 720 - 4 * lon - sunPos(jd0 + 0.5).eq; t = 720 - 4 * lon - sunPos(jd0 + t / 1440).eq; return t; }
function azEl(jd0, utcMin, lat, lon) { const jd = jd0 + utcMin / 1440, { decl, eq } = sunPos(jd); let ha = (utcMin + eq + 4 * lon) / 4 - 180; ha = ((ha % 360) + 540) % 360 - 180; const csz = Math.sin(lat * RAD) * Math.sin(decl * RAD) + Math.cos(lat * RAD) * Math.cos(decl * RAD) * Math.cos(ha * RAD), zen = Math.acos(Math.min(1, Math.max(-1, csz))), den = Math.cos(lat * RAD) * Math.sin(zen); let az; if (Math.abs(den) > 0.001) { const r = (Math.sin(lat * RAD) * Math.cos(zen) - Math.sin(decl * RAD)) / den; az = 180 - Math.acos(Math.min(1, Math.max(-1, r))) / RAD; if (ha > 0) az = -az; } else az = lat > 0 ? 180 : 0; return { az: (az + 360) % 360, el: 90 - zen / RAD, ha, decl }; }
const dayJd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim()); if (!m) throw new Error('Date must look like 2026-06-21.'); const t = Date.UTC(+m[1], +m[2] - 1, +m[3]); if (isoDay(t) !== s.trim()) throw new Error('That is not a real date.'); return { jd0: julian(+m[1], +m[2], +m[3]), t0: t }; };
const fmtTz = (ms, tz) => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, day: '2-digit', month: '2-digit' }).format(new Date(ms)); } catch { throw new Error(`Unknown time zone "${tz}". Use an IANA name such as Europe/Paris or UTC.`); } };
const tzOffsetMin = (ms, tz) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms) / 60000; };
const hhmm = (ms, tz, withDay0) => { const s = fmtTz(ms, tz), [dm, t] = s.split(', '); return withDay0 && dm !== withDay0 ? `${t} (${dm})` : t; };
T.push({
  id: 'sun-times-twilight-table', cat: GEO, title: 'Sun Times Table with Twilight and Polar Day for Date Ranges',
  desc: 'Enter a location (latitude, longitude), a date and a time zone and get sunrise, sunset, solar noon, day length and civil, nautical and astronomical twilight, offline from the NOAA solar equations. Polar day and night are handled.',
  inputs: 1, labels: ['Location: lat, lon'], sample: '51.5074, -0.1278',
  opts: [{ id: 'date', label: 'Start date (YYYY-MM-DD)', type: 'text', def: '2026-06-21' }, { id: 'days', label: 'Number of days', type: 'number', def: 1 }, { id: 'tz', label: 'Time zone (IANA name, e.g. Europe/London, America/New_York, UTC)', type: 'text', def: 'Europe/London' }],
  run: ([src], o) => {
    const c = parseLatLon(need(src, 'a location')), { jd0, t0 } = dayJd(o.date), days = Math.round(optNum(o.days, 1, 1, 366)), tz = (o.tz || 'UTC').trim(); fmtTz(t0, tz); const out2 = [];
    for (let k = 0; k < days; k++) {
      const j = jd0 + k, t = t0 + k * DAY, day = fmtTz(t + 12 * 3600e3, tz).split(', ')[0], at = (min) => (Number.isFinite(min) ? hhmm(t + min * 60000, tz, day) : '-');
      const ev = (z, rise) => riseSet(j, c.lat, c.lon, z, rise), sr = ev(90.833, true), ss = ev(90.833, false), noon = solarNoon(j, c.lon), pos = azEl(j, noon, c.lat, c.lon);
      const state = Number.isFinite(sr) ? '' : (pos.el > 0 ? 'sun stays up all day (polar day)' : 'sun stays below the horizon (polar night)');
      let len = Number.isFinite(sr) && Number.isFinite(ss) ? ((ss - sr + 1440) % 1440) : pos.el > 0 ? 1440 : 0; out2.push([isoDay(t), at(ev(108, true)), at(ev(102, true)), at(ev(96, true)), at(sr), at(noon), at(ss), at(ev(96, false)), at(ev(102, false)), at(ev(108, false)), `${Math.floor(len / 60)}h ${p2(Math.round(len % 60))}m`, fmt(round(pos.el, 1)) + '°', state]);
    }
    const head = ['date', 'astro dawn', 'nautical dawn', 'civil dawn', 'sunrise', 'solar noon', 'sunset', 'civil dusk', 'nautical dusk', 'astro dusk', 'day length', 'noon sun height', 'note'], rows = [head, ...out2];
    return `Location ${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}; times in ${tz} (local clock, daylight saving included)\n\n${tableText(rows)}\n\nSunrise and sunset use a solar zenith of 90.833 degrees (refraction and the Sun's radius); twilights use 96, 102 and 108 degrees. NOAA equations are good to about a minute for latitudes below 72 degrees and degrade towards the poles; "-" means the event does not happen that day. Terrain and local weather are ignored.`;
  },
});

T.push({
  id: 'sun-path-calculator', cat: GEO, title: 'Sun Path Calculator (Azimuth and Elevation Through the Day, Polar Chart)',
  desc: 'See where the Sun is in the sky at a location through a day: azimuth (compass direction) and elevation every 10 to 60 minutes, rise and set directions, and a sky-dome SVG. Useful for solar panels, shade and photography.',
  inputs: 1, labels: ['Location: lat, lon'], sample: '51.5074, -0.1278',
  opts: [{ id: 'date', label: 'Date (YYYY-MM-DD)', type: 'text', def: '2026-06-21' }, { id: 'tz', label: 'Time zone (IANA name)', type: 'text', def: 'Europe/London' }, { id: 'step', label: 'Minutes between rows', type: 'select', choices: ['10', '15', '30', '60'], def: '30' }],
  run: ([src], o) => {
    const c = parseLatLon(need(src, 'a location')), { jd0, t0 } = dayJd(o.date), tz = (o.tz || 'UTC').trim(), step = +o.step; fmtTz(t0, tz); const off = tzOffsetMin(t0 + 12 * 3600e3, tz), rows = [];
    // sample the local calendar day
    const startUtcMin = -off; for (let m = 0; m < 1440; m += step) { const u = startUtcMin + m; const dj = Math.floor(u / 1440), um = u - dj * 1440, a = azEl(jd0 + dj, um, c.lat, c.lon); rows.push({ m, ...a }); }
    const up = rows.filter((r) => r.el > 0); const W = 520, H = 540, cx = W / 2, cy = 250, R = 200; let g = '';
    for (const e of [0, 30, 60]) g += `<circle cx="${cx}" cy="${cy}" r="${(R * (90 - e)) / 90}" fill="none" stroke="#888" stroke-opacity=".5"/><text x="${cx + 3}" y="${cy - (R * (90 - e)) / 90 + 12}" font-size="10" fill="#555">${e}°</text>`;
    [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([l, a]) => { g += `<line x1="${cx}" y1="${cy}" x2="${cx + R * Math.sin(a * RAD)}" y2="${cy - R * Math.cos(a * RAD)}" stroke="#888" stroke-opacity=".4"/><text x="${cx + (R + 14) * Math.sin(a * RAD)}" y="${cy - (R + 14) * Math.cos(a * RAD) + 4}" text-anchor="middle" font-weight="700">${l}</text>`; });
    const P = (r) => [cx + ((R * (90 - r.el)) / 90) * Math.sin(r.az * RAD), cy - ((R * (90 - r.el)) / 90) * Math.cos(r.az * RAD)]; if (up.length > 1) g += `<polyline fill="none" stroke="#E69F00" stroke-width="3" points="${up.map((r) => P(r).map((v) => v.toFixed(1)).join(',')).join(' ')}"/>`;
    for (const r of up) if (r.m % 60 === 0) { const [x, y] = P(r); g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#D55E00"/><text x="${(x + 6).toFixed(1)}" y="${(y - 6).toFixed(1)}" font-size="11">${p2(r.m / 60)}h</text>`; }
    const sr = riseSet(jd0, c.lat, c.lon, 90.833, true), ss = riseSet(jd0, c.lat, c.lon, 90.833, false), noon = solarNoon(jd0, c.lon), np = azEl(jd0, noon, c.lat, c.lon);
    g += `<text x="${cx}" y="${H - 20}" text-anchor="middle">${esc(`Noon: elevation ${round(np.el, 1)}° at azimuth ${round(np.az, 0)}°. Labels are local clock hours.`)}</text>`;
    const info = `Sun path ${o.date} at ${c.lat.toFixed(3)}, ${c.lon.toFixed(3)} (${tz}). Highest elevation ${fmt(round(np.el, 1))} degrees. ${Number.isFinite(sr) ? 'Sunrise azimuth ' + Math.round(azEl(jd0, sr, c.lat, c.lon).az) + ' degrees, sunset azimuth ' + Math.round(azEl(jd0, ss, c.lat, c.lon).az) + ' degrees.' : 'No sunrise or sunset on this date.'}`;
    const res = chartResult(svgDoc(W, H, 'Sun path', info, g), 'sun-path.svg', ['Local time', 'Azimuth (deg from north)', 'Elevation (deg)'], rows.map((r) => [`${p2(Math.floor(r.m / 60))}:${p2(r.m % 60)}`, fmt(round(r.az, 1)), fmt(round(r.el, 1))]), info + ' Elevation is geometric (no atmospheric refraction); negative means below the horizon.');
    return res;
  },
});

// ---------------------------------------------------------------- XML (tiny, tolerant) for KML and GPX
function parseXml(text) {
  const t = String(text).replace(/^﻿/, ''); if (t.length > 12e6) throw new Error('File is too large (limit about 12 MB).');
  const dec = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()] ?? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1))));
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  const root = { n: '#root', a: {}, c: [], t: '' }, st = [root]; let m;
  while ((m = re.exec(t))) {
    const cur = st[st.length - 1];
    if (m[1] !== undefined) cur.t += m[1];
    else if (m[6] !== undefined) cur.t += dec(m[6]);
    else if (m[3]) {
      const name = m[3].replace(/^.*:/, '');
      if (m[2]) { if (st.length < 2 || st[st.length - 1].n !== name) throw new Error(`Not well-formed XML: unexpected </${m[3]}>.`); st.pop(); }
      else { const a = {}; for (const x of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) a[x[1].replace(/^.*:/, '')] = dec(x[2] ?? x[3]); const n = { n: name, a, c: [], t: '' }; cur.c.push(n); if (!m[5]) st.push(n); }
    }
  }
  if (st.length !== 1) throw new Error(`Not well-formed XML: <${st[st.length - 1].n}> is never closed.`);
  if (!root.c.length) throw new Error('No XML elements found.'); return root.c[0];
}
const kids = (n, name) => n.c.filter((x) => x.n === name), kid = (n, name) => n.c.find((x) => x.n === name), deep = (n, name, out = []) => { for (const x of n.c) { if (x.n === name) out.push(x); deep(x, name, out); } return out; };
const kt = (n, name) => (kid(n, name)?.t || '').trim();
const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

// ---------------------------------------------------------------- GeoJSON helpers
const gjFeatures = (g) => { if (g.type === 'FeatureCollection') return g.features || []; if (g.type === 'Feature') return [g]; if (g.type && g.coordinates !== undefined || g.type === 'GeometryCollection') return [{ type: 'Feature', properties: {}, geometry: g }]; throw new Error('Not GeoJSON: expected a FeatureCollection, Feature or geometry with a "type".'); };
function eachCoord(geom, fn) { if (!geom) return; if (geom.type === 'GeometryCollection') { (geom.geometries || []).forEach((x) => eachCoord(x, fn)); return; } const walk = (c) => { if (typeof c[0] === 'number') fn(c); else c.forEach(walk); }; if (geom.coordinates) walk(geom.coordinates); }
function lineLenKm(c) { let d = 0; for (let i = 1; i < c.length; i++) d += hav({ lat: c[i - 1][1], lon: c[i - 1][0] }, { lat: c[i][1], lon: c[i][0] }); return d; }
function ringAreaKm2(r) { let a = 0; for (let i = 0; i < r.length - 1; i++) { const p = r[i], q = r[i + 1]; a += (q[0] - p[0]) * RAD * (2 + Math.sin(p[1] * RAD) + Math.sin(q[1] * RAD)); } return Math.abs((a * R_EARTH * R_EARTH) / 2); }
function geomStats(g) { // length km (lines + polygon boundaries not counted), area km2, vertex count
  let len = 0, area = 0, n = 0; const rec = (x) => { if (!x) return; switch (x.type) { case 'GeometryCollection': (x.geometries || []).forEach(rec); break; case 'Point': case 'MultiPoint': break; case 'LineString': len += lineLenKm(x.coordinates); break; case 'MultiLineString': x.coordinates.forEach((l) => { len += lineLenKm(l); }); break; case 'Polygon': area += x.coordinates.reduce((s, r, i) => s + (i ? -1 : 1) * ringAreaKm2(r), 0); break; case 'MultiPolygon': x.coordinates.forEach((p) => { area += p.reduce((s, r, i) => s + (i ? -1 : 1) * ringAreaKm2(r), 0); }); break; } }; rec(g); eachCoord(g, () => { n++; }); return { len, area, n };
}
function gjIssues(feats) {
  const out2 = []; const chk = (g, where) => { if (!g) { out2.push(`${where}: geometry is null`); return; } const T2 = g.type; if (T2 === 'GeometryCollection') { (g.geometries || []).forEach((x) => chk(x, where)); return; } if (!['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(T2)) { out2.push(`${where}: unknown geometry type "${T2}"`); return; }
    eachCoord(g, (c) => { if (c.length < 2 || !c.every(Number.isFinite)) out2.push(`${where}: a position is not made of numbers`); else if (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) out2.push(`${where}: position ${c[0]}, ${c[1]} is out of range (GeoJSON order is longitude, latitude)`); });
    const ring = (r) => { if (r.length < 4) out2.push(`${where}: a polygon ring has fewer than 4 positions`); else if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) out2.push(`${where}: a polygon ring is not closed (first and last position differ)`); };
    if (T2 === 'LineString' && g.coordinates.length < 2) out2.push(`${where}: a LineString needs 2 or more positions`); if (T2 === 'Polygon') g.coordinates.forEach(ring); if (T2 === 'MultiPolygon') g.coordinates.forEach((p) => p.forEach(ring)); };
  feats.forEach((f, i) => chk(f.geometry, `feature ${i + 1}`)); return [...new Set(out2)].slice(0, 25);
}
function fitProj(b, W, H, m) { // b: [minLon, minLat, maxLon, maxLat]
  let [x0, y0, x1, y1] = b; if (x1 - x0 < 1e-6) { x0 -= 0.5; x1 += 0.5; } if (y1 - y0 < 1e-6) { y0 -= 0.5; y1 += 0.5; } const k = Math.cos(((y0 + y1) / 2) * RAD), s = Math.min((W - 2 * m) / ((x1 - x0) * k), (H - 2 * m) / (y1 - y0)), ox = (W - (x1 - x0) * k * s) / 2, oy = (H - (y1 - y0) * s) / 2;
  return { x: (lon) => ox + (lon - x0) * k * s, y: (lat) => H - oy - (lat - y0) * s, s };
}
// ---- world outline (data/world-110m.json, Natural Earth, public domain)
let _world;
function loadWorld() {
  return (_world ||= (async () => { const rel = '../../data/world-110m.json'; if (typeof window === 'undefined') { const fs = await import('node:fs/promises'); return JSON.parse(await fs.readFile(new URL(rel, import.meta.url), 'utf8')); } const r = await fetch(new URL(rel, import.meta.url)); if (!r.ok) throw new Error(`Could not load the world outline (HTTP ${r.status}).`); return r.json(); })());
}
const ringPath = (ring, X, Y) => { let d = ''; for (let i = 0; i < ring.length; i += 2) d += (i ? 'L' : 'M') + X(ring[i]).toFixed(1) + ' ' + Y(ring[i + 1]).toFixed(1); return d + 'Z'; };
const countryD = (c, X, Y) => c.r.map((r) => ringPath(r, X, Y)).join('');
function outlineSvg(world, P, bb, W, H, fill = '#e3e6ea', stroke = '#ffffff') { // only countries touching the view
  let s = ''; for (const c of world) { if (c.a3 === 'ATA' && bb[1] > -60) continue; const rings = c.r.filter((r) => { let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9; for (let i = 0; i < r.length; i += 2) { mnx = Math.min(mnx, r[i]); mxx = Math.max(mxx, r[i]); mny = Math.min(mny, r[i + 1]); mxy = Math.max(mxy, r[i + 1]); } return mxx >= bb[0] - 5 && mnx <= bb[2] + 5 && mxy >= bb[1] - 5 && mny <= bb[3] + 5; }); if (rings.length) s += `<path d="${rings.map((r) => ringPath(r, P.x, P.y)).join('')}" fill="${fill}" stroke="${stroke}" stroke-width=".6"/>`; } return `<clipPath id="mapclip"><rect width="${W}" height="${H}"/></clipPath><g clip-path="url(#mapclip)">${s}</g>`;
}

// ---------------------------------------------------------------- 1459 GeoJSON viewer
const GJ_SAMPLE = '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"Eiffel Tower","visitors":6.2},"geometry":{"type":"Point","coordinates":[2.2945,48.8584]}},{"type":"Feature","properties":{"name":"Louvre","visitors":8.9},"geometry":{"type":"Point","coordinates":[2.3376,48.8606]}},{"type":"Feature","properties":{"name":"Walk"},"geometry":{"type":"LineString","coordinates":[[2.2945,48.8584],[2.3095,48.8606],[2.3376,48.8606]]}},{"type":"Feature","properties":{"name":"Tuileries"},"geometry":{"type":"Polygon","coordinates":[[[2.3260,48.8640],[2.3330,48.8640],[2.3330,48.8625],[2.3260,48.8625],[2.3260,48.8640]]]}}]}';
T.push({
  id: 'geojson-viewer-validator', cat: GEO, title: 'GeoJSON Viewer and Validator (SVG Plot, Stats and Problems)',
  desc: 'Paste GeoJSON to validate it and see points, lines and polygons plotted without a map service, with feature counts, bounding box, lengths, areas and a list of problems such as swapped coordinates or unclosed rings. Edit the text and run again.',
  inputs: 1, labels: ['GeoJSON (FeatureCollection, Feature or geometry)'], sample: GJ_SAMPLE,
  opts: [{ id: 'outline', label: 'Draw country outlines behind the data', type: 'checkbox', def: true }, { id: 'label', label: 'Label property (blank = name)', type: 'text', def: 'name' }, { id: 'size', label: 'Scale point size by this numeric property (blank = fixed)', type: 'text', def: '' }, ...sizeOpts(680, 460)],
  run: async ([src], o) => {
    let g; try { g = JSON.parse(need(src, 'GeoJSON')); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
    const feats = gjFeatures(g); if (!feats.length) throw new Error('No features found.'); if (feats.length > 5000) throw new Error('At most 5000 features.');
    let bb = [Infinity, Infinity, -Infinity, -Infinity], nPos = 0; for (const f of feats) eachCoord(f.geometry, (c) => { if (Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90) { bb = [Math.min(bb[0], c[0]), Math.min(bb[1], c[1]), Math.max(bb[2], c[0]), Math.max(bb[3], c[1])]; nPos++; } });
    if (!nPos) throw new Error('No valid positions found. GeoJSON positions are [longitude, latitude].');
    const [W, H] = dims(o, 680, 460), pad2 = Math.max(0.0005, (bb[2] - bb[0] + bb[3] - bb[1]) * 0.06), view = [bb[0] - pad2, bb[1] - pad2, bb[2] + pad2, bb[3] + pad2], P = fitProj(view, W, H, 10), lab = o.label || 'name', sz = (o.size || '').trim();
    const sizes = sz ? feats.map((f) => Number(f.properties?.[sz])).filter(Number.isFinite) : [], smax = Math.max(1e-9, ...sizes); let body = '', world = null; if (o.outline) { world = await loadWorld(); body += outlineSvg(world, P, view, W, H); }
    const pt = (c) => `${P.x(c[0]).toFixed(1)},${P.y(c[1]).toFixed(1)}`, rows = []; const drawG = (gm, i, f) => { if (!gm) return; const col = PAL[i % PAL.length], name = f.properties?.[lab] ?? '', tip = `<title>${esc(name || 'feature ' + (i + 1))}</title>`; switch (gm.type) { case 'GeometryCollection': gm.geometries.forEach((x) => drawG(x, i, f)); break; case 'Point': case 'MultiPoint': { const list = gm.type === 'Point' ? [gm.coordinates] : gm.coordinates; for (const c of list) { const v = sz ? Number(f.properties?.[sz]) : NaN, r = Number.isFinite(v) ? 3 + 14 * Math.sqrt(Math.max(0, v) / smax) : 5; body += `<circle cx="${P.x(c[0]).toFixed(1)}" cy="${P.y(c[1]).toFixed(1)}" r="${r.toFixed(1)}" fill="${col}" fill-opacity=".7" stroke="#fff" stroke-width="1">${tip}</circle>`; if (name && feats.length <= 60) body += `<text x="${(P.x(c[0]) + r + 3).toFixed(1)}" y="${(P.y(c[1]) + 4).toFixed(1)}" font-size="11" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(cut(name, 22))}</text>`; } break; } case 'LineString': body += `<polyline fill="none" stroke="${col}" stroke-width="2.5" points="${gm.coordinates.map(pt).join(' ')}">${tip}</polyline>`; break; case 'MultiLineString': gm.coordinates.forEach((l) => { body += `<polyline fill="none" stroke="${col}" stroke-width="2.5" points="${l.map(pt).join(' ')}">${tip}</polyline>`; }); break; case 'Polygon': body += `<path fill="${col}" fill-opacity=".3" stroke="${col}" stroke-width="2" fill-rule="evenodd" d="${gm.coordinates.map((r) => 'M' + r.map(pt).join('L') + 'Z').join('')}">${tip}</path>`; break; case 'MultiPolygon': gm.coordinates.forEach((p) => { body += `<path fill="${col}" fill-opacity=".3" stroke="${col}" stroke-width="2" fill-rule="evenodd" d="${p.map((r) => 'M' + r.map(pt).join('L') + 'Z').join('')}">${tip}</path>`; }); break; } };
    feats.forEach((f, i) => { drawG(f.geometry, i, f); const s = geomStats(f.geometry); rows.push([String(i + 1), f.geometry?.type || 'null', String(f.properties?.[lab] ?? ''), String(s.n), s.len ? fmt(round(s.len, 3)) : '', s.area ? fmt(round(s.area, 3)) : '']); });
    const issues = gjIssues(feats), note = `${feats.length} feature(s), ${nPos} positions. Bounding box (west, south, east, north): ${fmt(bb[0])}, ${fmt(bb[1])}, ${fmt(bb[2])}, ${fmt(bb[3])}. ${issues.length ? 'Problems found: ' + issues.join('; ') + '.' : 'No structural problems found.'} Lengths are great-circle km on a sphere; areas are approximate spherical km2. Plot is an equirectangular fit, not a web-map projection.`;
    const res = chartResult(svgDoc(W, H, 'GeoJSON plot', note, body), 'geojson-plot.svg', ['#', 'Geometry', lab, 'Positions', 'Length km', 'Area km2'], rows, note);
    res.text = JSON.stringify(g, null, 2); res.blob = new Blob([res.text], { type: 'application/octet-stream' }); res.filename = 'formatted.geojson'; return res;
  },
});

// ---------------------------------------------------------------- 1460 format converter
function geomFromKml(pm) {
  const coords = (n) => (n ? n.t.trim().split(/\s+/).filter(Boolean).map((s) => s.split(',').map(Number)) : []).map((c) => { if (c.length < 2 || c.some((x) => !Number.isFinite(x))) throw new Error('A KML <coordinates> value is not "lon,lat[,alt]".'); return c; });
  const one = (n) => { if (n.n === 'Point') return { type: 'Point', coordinates: coords(kid(n, 'coordinates'))[0] }; if (n.n === 'LineString') return { type: 'LineString', coordinates: coords(kid(n, 'coordinates')) }; if (n.n === 'LinearRing') return { type: 'LineString', coordinates: coords(kid(n, 'coordinates')) }; if (n.n === 'Polygon') { const rings = []; const ob = kid(n, 'outerBoundaryIs'); if (ob) rings.push(coords(kid(kid(ob, 'LinearRing') || ob, 'coordinates'))); for (const ib of kids(n, 'innerBoundaryIs')) rings.push(coords(kid(kid(ib, 'LinearRing') || ib, 'coordinates'))); return { type: 'Polygon', coordinates: rings }; } return null; };
  const gs = []; const visit = (n) => { if (n.n === 'MultiGeometry') n.c.forEach(visit); else { const g = one(n); if (g) gs.push(g); } }; for (const ch of pm.c) if (['Point', 'LineString', 'LinearRing', 'Polygon', 'MultiGeometry'].includes(ch.n)) visit(ch);
  if (!gs.length) return null; if (gs.length === 1) return gs[0]; const t0 = gs[0].type; if (gs.every((g) => g.type === t0)) return { type: 'Multi' + t0, coordinates: gs.map((g) => g.coordinates) }; return { type: 'GeometryCollection', geometries: gs };
}
function kmlToGj(root) { const fs2 = []; for (const pm of deep(root, 'Placemark')) { const g = geomFromKml(pm); const props = {}; const nm = kt(pm, 'name'), ds = kt(pm, 'description'); if (nm) props.name = nm; if (ds) props.description = ds; for (const d of deep(pm, 'Data')) props[d.a.name] = (kt(d, 'value') || '').trim(); fs2.push({ type: 'Feature', properties: props, geometry: g }); } if (!fs2.length) throw new Error('No <Placemark> elements found in the KML.'); return { type: 'FeatureCollection', features: fs2 }; }
function gpxToGj(root) {
  const fs2 = [], pos = (n) => { const lat = +n.a.lat, lon = +n.a.lon; if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('A GPX point has no valid lat and lon.'); const ele = kt(n, 'ele'); return ele !== '' && Number.isFinite(+ele) ? [lon, lat, +ele] : [lon, lat]; };
  for (const w of deep(root, 'wpt')) fs2.push({ type: 'Feature', properties: { name: kt(w, 'name'), ...(kt(w, 'desc') ? { description: kt(w, 'desc') } : {}), ...(kt(w, 'time') ? { time: kt(w, 'time') } : {}), kind: 'waypoint' }, geometry: { type: 'Point', coordinates: pos(w) } });
  for (const r of deep(root, 'rte')) fs2.push({ type: 'Feature', properties: { name: kt(r, 'name'), kind: 'route' }, geometry: { type: 'LineString', coordinates: kids(r, 'rtept').map(pos) } });
  for (const t of deep(root, 'trk')) { const segs = kids(t, 'trkseg').map((s) => kids(s, 'trkpt').map(pos)).filter((s) => s.length); if (segs.length) fs2.push({ type: 'Feature', properties: { name: kt(t, 'name'), kind: 'track' }, geometry: segs.length === 1 ? { type: 'LineString', coordinates: segs[0] } : { type: 'MultiLineString', coordinates: segs } }); }
  if (!fs2.length) throw new Error('No waypoints, routes or tracks found in the GPX.'); return { type: 'FeatureCollection', features: fs2 };
}
const posKml = (c) => c.join(',');
function gjToKml(gj, name) {
  const geomKml = (g) => { switch (g.type) { case 'Point': return `<Point><coordinates>${posKml(g.coordinates)}</coordinates></Point>`; case 'LineString': return `<LineString><coordinates>${g.coordinates.map(posKml).join(' ')}</coordinates></LineString>`; case 'Polygon': return `<Polygon>${g.coordinates.map((r, i) => `<${i ? 'inner' : 'outer'}BoundaryIs><LinearRing><coordinates>${r.map(posKml).join(' ')}</coordinates></LinearRing></${i ? 'inner' : 'outer'}BoundaryIs>`).join('')}</Polygon>`; case 'MultiPoint': return `<MultiGeometry>${g.coordinates.map((c) => geomKml({ type: 'Point', coordinates: c })).join('')}</MultiGeometry>`; case 'MultiLineString': return `<MultiGeometry>${g.coordinates.map((c) => geomKml({ type: 'LineString', coordinates: c })).join('')}</MultiGeometry>`; case 'MultiPolygon': return `<MultiGeometry>${g.coordinates.map((c) => geomKml({ type: 'Polygon', coordinates: c })).join('')}</MultiGeometry>`; case 'GeometryCollection': return `<MultiGeometry>${g.geometries.map(geomKml).join('')}</MultiGeometry>`; default: throw new Error(`Cannot convert geometry type "${g.type}".`); } };
  const pms = gjFeatures(gj).filter((f) => f.geometry).map((f) => { const p = f.properties || {}, ext = Object.entries(p).filter(([k, v]) => !['name', 'description'].includes(k) && ['string', 'number', 'boolean'].includes(typeof v)); return `<Placemark>${p.name != null ? `<name>${xmlEsc(p.name)}</name>` : ''}${p.description != null ? `<description>${xmlEsc(p.description)}</description>` : ''}${ext.length ? `<ExtendedData>${ext.map(([k, v]) => `<Data name="${xmlEsc(k)}"><value>${xmlEsc(v)}</value></Data>`).join('')}</ExtendedData>` : ''}${geomKml(f.geometry)}</Placemark>`; });
  if (!pms.length) throw new Error('No features with geometry to convert.'); return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n<name>${xmlEsc(name || 'Converted')}</name>\n${pms.join('\n')}\n</Document>\n</kml>\n`;
}
function gjToGpx(gj, name, asRoute) {
  const wpt = [], rte = [], trk = [], pt = (tag, c, extra = '') => `<${tag} lat="${c[1]}" lon="${c[0]}">${c.length > 2 ? `<ele>${c[2]}</ele>` : ''}${extra}</${tag}>`; const nm = (p) => (p && p.name != null ? `<name>${xmlEsc(p.name)}</name>` : '');
  const line = (c, p) => (asRoute ? rte.push(`<rte>${nm(p)}${c.map((x) => pt('rtept', x)).join('')}</rte>`) : trk.push(`<trk>${nm(p)}<trkseg>${c.map((x) => pt('trkpt', x)).join('')}</trkseg></trk>`));
  const add = (g, p) => { switch (g.type) { case 'Point': wpt.push(pt('wpt', g.coordinates, `${nm(p)}${p && p.description != null ? `<desc>${xmlEsc(p.description)}</desc>` : ''}`)); break; case 'MultiPoint': g.coordinates.forEach((c) => add({ type: 'Point', coordinates: c }, p)); break; case 'LineString': line(g.coordinates, p); break; case 'MultiLineString': if (asRoute) g.coordinates.forEach((c) => line(c, p)); else trk.push(`<trk>${nm(p)}${g.coordinates.map((c) => `<trkseg>${c.map((x) => pt('trkpt', x)).join('')}</trkseg>`).join('')}</trk>`); break; case 'Polygon': line(g.coordinates[0], p); break; case 'MultiPolygon': g.coordinates.forEach((q) => line(q[0], p)); break; case 'GeometryCollection': g.geometries.forEach((x) => add(x, p)); break; default: throw new Error(`Cannot convert geometry type "${g.type}".`); } };
  for (const f of gjFeatures(gj)) if (f.geometry) add(f.geometry, f.properties); if (!wpt.length && !rte.length && !trk.length) throw new Error('No features with geometry to convert.');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="free-tools" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>${xmlEsc(name || 'Converted')}</name></metadata>\n${[...wpt, ...rte, ...trk].join('\n')}\n</gpx>\n`;
}
T.push({
  id: 'kml-gpx-geojson-converter', cat: GEO, title: 'KML, GPX and GeoJSON Converter (Any Direction)',
  desc: 'Convert between KML, GPX and GeoJSON in your browser. The input format is detected; pick the target. Placemarks, waypoints, routes, tracks, polygons with holes and extra properties are kept where the target format allows it.',
  inputs: 1, labels: ['KML, GPX or GeoJSON text'], sample: '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Paris</name>\n<Placemark><name>Eiffel Tower</name><description>Iron lattice tower</description><Point><coordinates>2.2945,48.8584,35</coordinates></Point></Placemark>\n<Placemark><name>Walk</name><LineString><coordinates>2.2945,48.8584 2.3095,48.8606 2.3376,48.8606</coordinates></LineString></Placemark>\n<Placemark><name>Garden</name><Polygon><outerBoundaryIs><LinearRing><coordinates>2.326,48.864 2.333,48.864 2.333,48.8625 2.326,48.8625 2.326,48.864</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>\n</Document></kml>',
  opts: [{ id: 'to', label: 'Convert to', type: 'select', choices: ['GeoJSON', 'KML', 'GPX'], def: 'GeoJSON' }, { id: 'route', label: 'GPX: write lines as routes instead of tracks', type: 'checkbox', def: false }, { id: 'name', label: 'Document name (KML and GPX)', type: 'text', def: 'Converted' }],
  run: ([src], o) => {
    const s = need(src, 'a KML, GPX or GeoJSON file').trim(); let gj, from;
    if (s.startsWith('<')) { const r = parseXml(s); if (r.n === 'kml') { from = 'KML'; gj = kmlToGj(r); } else if (r.n === 'gpx') { from = 'GPX'; gj = gpxToGj(r); } else throw new Error(`The XML root is <${r.n}>; expected <kml> or <gpx>.`); } else { try { gj = JSON.parse(s); } catch (e) { throw new Error('Not XML and not valid JSON: ' + e.message); } gjFeatures(gj); from = 'GeoJSON'; }
    if (from === o.to) throw new Error(`The input is already ${from}. Pick a different target format.`);
    const text = o.to === 'GeoJSON' ? JSON.stringify(gj, null, 2) : o.to === 'KML' ? gjToKml(gj, o.name) : gjToGpx(gj, o.name, o.route), ext = { GeoJSON: 'geojson', KML: 'kml', GPX: 'gpx' }[o.to];
    return { text, blob: new Blob([text], { type: 'application/octet-stream' }), filename: `converted.${ext}` };
  },
});

// ---------------------------------------------------------------- 1457 GPX analyzer
T.push({
  id: 'gpx-track-analyzer', cat: GEO, title: 'GPX Track Analyzer (Distance, Elevation Profile, Time and Speed)',
  desc: 'Paste or load a GPX file from a watch or app and get distance, elevation gain and loss, highest and lowest point, time, moving speed, a track plot and an elevation profile. No map tiles are loaded.',
  inputs: 1, labels: ['GPX file text'], sample: '<?xml version="1.0"?><gpx version="1.1" creator="demo" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Morning hill</name><trkseg>' + Array.from({ length: 31 }, (_, i) => { const a = (i / 30) * Math.PI; return `<trkpt lat="${(46.52 + 0.012 * Math.sin(a * 0.8) + i * 0.0003).toFixed(5)}" lon="${(6.63 + 0.02 * (i / 30) + 0.004 * Math.sin(a * 2)).toFixed(5)}"><ele>${Math.round(380 + 120 * Math.sin(a) + (i % 3) * 1.4)}</ele><time>2026-05-03T07:${p2(Math.floor(i * 1.5))}:${i % 2 ? '30' : '00'}Z</time></trkpt>`; }).join('') + '</trkseg></trk></gpx>',
  opts: [{ id: 'thr', label: 'Ignore elevation changes smaller than (m)', type: 'number', def: 3 }, { id: 'stop', label: 'Count as stopped below (km/h)', type: 'number', def: 1 }, { id: 'title', label: 'Title', type: 'text', def: '' }],
  run: ([src], o) => {
    const root = parseXml(need(src, 'a GPX file')); if (root.n !== 'gpx') throw new Error(`The XML root is <${root.n}>; expected <gpx>.`);
    const pos = (n) => ({ lat: +n.a.lat, lon: +n.a.lon, ele: kt(n, 'ele') === '' ? null : +kt(n, 'ele'), t: kt(n, 'time') ? Date.parse(kt(n, 'time')) : null }); let segs = deep(root, 'trkseg').map((s) => kids(s, 'trkpt').map(pos)).filter((s) => s.length > 1); if (!segs.length) segs = deep(root, 'rte').map((r) => kids(r, 'rtept').map(pos)).filter((s) => s.length > 1); if (!segs.length) throw new Error('No track or route with at least 2 points found.');
    if (segs.flat().some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180)) throw new Error('A point has a missing or out-of-range lat/lon.');
    const thr = Math.max(0, Number(o.thr) || 0), stopMs = Math.max(0, Number(o.stop) || 0) / 3.6; let dist = 0, gain = 0, loss = 0, moveT = 0, elapsed = 0, hasT = true; const prof = [], pts = segs.flat(), eles = pts.map((p) => p.ele).filter((e) => e !== null);
    for (const sg of segs) { let anchor = null; for (let i = 0; i < sg.length; i++) { const p = sg[i]; if (i) { const d = hav(sg[i - 1], p) * 1000; dist += d; if (p.t !== null && sg[i - 1].t !== null && p.t > sg[i - 1].t) { const dt = (p.t - sg[i - 1].t) / 1000; elapsed += dt; if (d / dt >= stopMs) moveT += dt; } else hasT = false; } if (p.ele !== null) { if (anchor === null) anchor = p.ele; else if (p.ele - anchor >= thr && p.ele !== anchor) { gain += p.ele - anchor; anchor = p.ele; } else if (anchor - p.ele >= thr) { loss += anchor - p.ele; anchor = p.ele; } } if (p.ele !== null) prof.push([dist / 1000, p.ele]); } }
    const bb = [Math.min(...pts.map((p) => p.lon)), Math.min(...pts.map((p) => p.lat)), Math.max(...pts.map((p) => p.lon)), Math.max(...pts.map((p) => p.lat))], hm = (s) => `${Math.floor(s / 3600)}h ${p2(Math.floor((s % 3600) / 60))}m ${p2(Math.round(s % 60))}s`;
    const rows = [['Distance', `${fmt(round(dist / 1000, 3))} km (${fmt(round(dist / 1609.344, 3))} mi)`], ['Points', `${pts.length} in ${segs.length} segment(s)`]]; if (eles.length) rows.push(['Elevation gain / loss', `+${Math.round(gain)} m / -${Math.round(loss)} m (changes under ${thr} m ignored)`], ['Highest / lowest', `${fmt(round(Math.max(...eles), 1))} m / ${fmt(round(Math.min(...eles), 1))} m`]); else rows.push(['Elevation', 'no <ele> values in the file']);
    if (hasT && elapsed > 0) rows.push(['Elapsed time', hm(elapsed)], ['Moving time', hm(moveT)], ['Average speed', `${fmt(round(dist / 1000 / (elapsed / 3600), 2))} km/h overall, ${moveT ? fmt(round(dist / 1000 / (moveT / 3600), 2)) : '-'} km/h moving`], ['Average pace (moving)', moveT ? `${Math.floor(moveT / 60 / (dist / 1000))}:${p2(Math.round(((moveT / 60 / (dist / 1000)) % 1) * 60))} min/km` : '-'], ['Started', new Date(Math.min(...pts.map((p) => p.t).filter((x) => x !== null))).toISOString()]); else rows.push(['Time', 'no usable <time> values']);
    rows.push(['Bounding box', `${bb.map((x) => fmt(round(x, 5))).join(', ')} (west, south, east, north)`]);
    const W = 680, MH = 300, EH = prof.length > 1 ? 170 : 0, H = MH + EH + 16, P = fitProj([bb[0], bb[1], bb[2], bb[3]], W, MH, 20); let g = `<polyline fill="none" stroke="#0072B2" stroke-width="2.5" stroke-linejoin="round" points="${segs[0].map((p) => `${P.x(p.lon).toFixed(1)},${P.y(p.lat).toFixed(1)}`).join(' ')}"/>`; segs.slice(1).forEach((sg) => { g += `<polyline fill="none" stroke="#0072B2" stroke-width="2.5" points="${sg.map((p) => `${P.x(p.lon).toFixed(1)},${P.y(p.lat).toFixed(1)}`).join(' ')}"/>`; });
    g += `<circle cx="${P.x(segs[0][0].lon).toFixed(1)}" cy="${P.y(segs[0][0].lat).toFixed(1)}" r="6" fill="#009E73" stroke="#fff" stroke-width="2"><title>Start</title></circle><circle cx="${P.x(segs[segs.length - 1].at(-1).lon).toFixed(1)}" cy="${P.y(segs[segs.length - 1].at(-1).lat).toFixed(1)}" r="6" fill="#D55E00" stroke="#fff" stroke-width="2"><title>End</title></circle><text x="10" y="18" font-size="11">Green = start, orange = end. North is up.</text>`;
    if (EH) { const tk = niceTicks(Math.min(...eles), Math.max(...eles), 3), m = { l: 48, r: 14, t: MH + 12, b: 28 }, pw = W - m.l - m.r, ph = EH - 12 - m.b, X = (d) => m.l + (d / (dist / 1000 || 1)) * pw, Y = (e) => m.t + ph - ((e - tk[0]) / (tk[tk.length - 1] - tk[0])) * ph; for (const t of tk) g += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(t)}" y2="${Y(t)}" stroke="#888" stroke-opacity=".3"/><text x="${m.l - 5}" y="${Y(t) + 4}" text-anchor="end" font-size="11">${fmt(t)}</text>`; g += `<polygon fill="#56B4E9" fill-opacity=".35" points="${X(prof[0][0])},${m.t + ph} ${prof.map(([d, e]) => `${X(d).toFixed(1)},${Y(e).toFixed(1)}`).join(' ')} ${X(prof[prof.length - 1][0])},${m.t + ph}"/><polyline fill="none" stroke="#0072B2" stroke-width="1.6" points="${prof.map(([d, e]) => `${X(d).toFixed(1)},${Y(e).toFixed(1)}`).join(' ')}"/><text x="${m.l + pw / 2}" y="${m.t + ph + 22}" text-anchor="middle" font-size="11">distance (km), elevation (m)</text>`; for (const d of niceTicks(0, dist / 1000, 5)) if (d <= dist / 1000 + 1e-9) g += `<text x="${X(d)}" y="${m.t + ph + 12}" text-anchor="middle" font-size="10">${fmt(d)}</text>`; }
    const nm = kt(kid(deep(root, 'trk')[0] || root, 'name') ? deep(root, 'trk')[0] : root, 'name'), res = chartResult(svgDoc(W, H, o.title || nm || 'GPX track', rows.map((r) => `${r[0]}: ${r[1]}`).join('. '), titleEl(W, o.title) + g), 'gpx-track.svg', ['Measure', 'Value'], rows, 'Distances use the haversine formula on the point list, so they can differ slightly from the figures a watch reports. GPS elevation is noisy.');
    res.text = rows.map((r) => `${r[0].padEnd(24)} ${r[1]}`).join('\n') + '\n'; return res;
  },
});

// ---------------------------------------------------------------- 1458 waypoints to GPX
T.push({
  id: 'waypoints-to-gpx', cat: GEO, title: 'Waypoint List to GPX Route or Track File',
  desc: 'Type or paste your waypoints as latitude, longitude and an optional name, and download a GPX file as a route, a track or plain waypoints for a GPS device or app. Distance of the route is shown. No map clicking needed.',
  inputs: 1, labels: ['One waypoint per line: lat, lon, name (name optional)'], sample: '46.5197, 6.6323, Start in Lausanne\n46.4600, 6.8500, Vevey\n46.4300, 6.9100, Montreux\n46.4100, 6.9400, Chillon Castle\n',
  opts: [{ id: 'kind', label: 'Write as', type: 'select', choices: ['route', 'track', 'waypoints only'], def: 'route' }, { id: 'name', label: 'Route or track name', type: 'text', def: 'Lake walk' }, { id: 'also', label: 'Also include the points as named waypoints', type: 'checkbox', def: true }],
  run: ([src], o) => {
    const pts = []; for (const l of need(src, 'waypoint lines').split(/\r?\n/)) { const t = l.trim(); if (!t || t.startsWith('#')) continue; const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\t ]\s*(-?\d+(?:\.\d+)?)(?:\s*[,;\t]\s*(.*))?$/.exec(t); let p; if (m) { p = { lat: +m[1], lon: +m[2], name: (m[3] || '').trim() }; if (Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) throw new Error(`"${t}": latitude must be within 90 and longitude within 180.`); } else { const q = t.split(','); const c = parseLatLon(q.slice(0, 2).join(',')); p = { ...c, name: q.slice(2).join(',').trim() }; } pts.push(p); }
    if (!pts.length) throw new Error('No waypoints found.'); if (o.kind !== 'waypoints only' && pts.length < 2) throw new Error('A route or track needs at least 2 points.'); if (pts.length > 5000) throw new Error('At most 5000 points.');
    const w = pts.map((p, i) => `<wpt lat="${p.lat}" lon="${p.lon}"><name>${xmlEsc(p.name || 'WPT' + (i + 1))}</name></wpt>`), n = `<name>${xmlEsc(o.name || 'Route')}</name>`;
    const body = o.kind === 'route' ? `<rte>${n}${pts.map((p, i) => `<rtept lat="${p.lat}" lon="${p.lon}"><name>${xmlEsc(p.name || 'RTE' + (i + 1))}</name></rtept>`).join('')}</rte>` : o.kind === 'track' ? `<trk>${n}<trkseg>${pts.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"/>`).join('')}</trkseg></trk>` : '';
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="free-tools" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata>${n}</metadata>\n${o.kind === 'waypoints only' || o.also ? w.join('\n') + '\n' : ''}${body}\n</gpx>\n`;
    let d = 0; for (let i = 1; i < pts.length; i++) d += hav(pts[i - 1], pts[i]);
    return { text: gpx, blob: new Blob([gpx], { type: 'application/octet-stream' }), filename: 'route.gpx', html: `<!doctype html><html lang="en"><meta charset="utf-8"><title>GPX</title><style>body{font:14px system-ui,sans-serif;margin:12px;background:#fff;color:#1a1a1a}</style><body><p role="status">${pts.length} point(s), ${o.kind} length about ${fmt(round(d, 2))} km (great-circle between points).</p></body></html>` };
  },
});

// ---------------------------------------------------------------- world map tools (data/world-110m.json)
const ALIAS = { usa: 'US', 'u.s.': 'US', 'u.s.a.': 'US', 'united states': 'US', america: 'US', uk: 'GB', 'u.k.': 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB', 'russian federation': 'RU', 'korea, republic of': 'KR', 'republic of korea': 'KR', 'korea, south': 'KR', 'korea, democratic people\'s republic of': 'KP', 'korea, north': 'KP', 'czech republic': 'CZ', 'ivory coast': 'CI', "cote d'ivoire": 'CI', 'viet nam': 'VN', 'iran, islamic republic of': 'IR', 'tanzania, united republic of': 'TZ', 'democratic republic of the congo': 'CD', 'congo, the democratic republic of the': 'CD', 'dr congo': 'CD', 'congo (kinshasa)': 'CD', 'republic of the congo': 'CG', 'congo (brazzaville)': 'CG', 'congo-brazzaville': 'CG', 'central african republic': 'CF', 'dominican republic': 'DO', 'equatorial guinea': 'GQ', 'south sudan': 'SS', 'western sahara': 'EH', 'solomon islands': 'SB', 'falkland islands': 'FK', 'bosnia and herzegovina': 'BA', 'bosnia': 'BA', 'swaziland': 'SZ', eswatini: 'SZ', macedonia: 'MK', 'the bahamas': 'BS', 'the gambia': 'GM', burma: 'MM', 'east timor': 'TL', 'syrian arab republic': 'SY', "lao people's democratic republic": 'LA', 'moldova, republic of': 'MD', 'russia federation': 'RU', 'türkiye': 'TR', turkiye: 'TR', 'holland': 'NL', 'state of palestine': 'PS', 'palestinian territories': 'PS', 'french southern and antarctic lands': 'TF', 'united arab emirates': 'AE', uae: 'AE', 'taiwan, province of china': 'TW', 'bolivia, plurinational state of': 'BO', 'venezuela, bolivarian republic of': 'VE' };
const stripAcc = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
function matchCountry(world, name) { const k = stripAcc(name); if (!k) return null; const a = ALIAS[k]; return world.find((c) => (a && c.a2 === a) || (c.a2 && c.a2.toLowerCase() === k) || c.a3.toLowerCase() === k || stripAcc(c.n) === k) || null; }
const WORLD_VB = [-180, -85, 360, 143]; // lon0, -lat1, width, height (equirectangular, Antarctica mostly cropped)
const wx = (lon) => lon, wy = (lat) => -lat;

T.push({
  id: 'choropleth-map-maker', cat: CH, title: 'Choropleth World Map Maker (Colour Countries from a CSV)',
  desc: 'Paste country names or ISO codes with a value and get a world map with each country shaded by its value, a classed legend and a table. Country shapes are bundled (Natural Earth 1:110m, public domain), so nothing is fetched from elsewhere.',
  inputs: 1, labels: ['Rows: country (name, ISO 2-letter or ISO 3-letter code), value'], sample: 'country,internet users %\nUS,92\nCanada,94\nBrazil,81\nFR,85\nDEU,91\nIndia,46\nChina,73\nNigeria,45\nAustralia,96\nRussia,88\nEgypt,72\nSouth Africa,72\nArgentina,87\nIndonesia,66\n',
  opts: [{ id: 'scale', label: 'Colour scale', type: 'select', choices: ['blue', 'viridis', 'heat', 'gray'], def: 'blue' }, { id: 'classes', label: 'Number of classes', type: 'number', def: 5 }, { id: 'method', label: 'Class breaks', type: 'select', choices: ['equal interval', 'quantile'], def: 'equal interval' }, { id: 'title', label: 'Title', type: 'text', def: 'Internet users, % of population' }, { id: 'w', label: 'Width (px)', type: 'number', def: 900 }],
  run: async ([src], o) => {
    const world = await loadWorld(), rows = parseCsv(need(src, 'country and value rows')), data = new Map(), miss = []; let first = true;
    for (const r of rows) { const v = numv(r[1]); if (!Number.isFinite(v)) { if (first && r.length > 1) { first = false; continue; } miss.push(`${r[0]} (no number)`); continue; } first = false; const c = matchCountry(world, r[0] || ''); if (!c) { miss.push(r[0]); continue; } data.set(c, v); }
    if (!data.size) throw new Error('No country matched. Use English names or ISO codes such as FR or FRA.');
    const vals = [...data.values()].sort((a, b) => a - b), k = Math.round(optNum(o.classes, 5, 2, 9)), lo = vals[0], hi = vals[vals.length - 1]; let br; if (o.method === 'quantile') br = Array.from({ length: k + 1 }, (_, i) => quantile(vals, i / k)); else br = Array.from({ length: k + 1 }, (_, i) => lo + ((hi - lo) * i) / k);
    const cls = (v) => { let i = 0; while (i < k - 1 && v >= br[i + 1]) i++; return i; }, st = SCALES[o.scale] || SCALES.blue, colOf = (i) => ramp(st, k === 1 ? 0.5 : i / (k - 1));
    const Wd = Math.round(optNum(o.w, 900, 400, 2400)), s = Wd / 360, Hd = WORLD_VB[3] * s, top = o.title ? 34 : 4, H = Math.round(Hd + top + 46); let g = `<g transform="translate(0 ${top}) scale(${s}) translate(180 85)">`;
    for (const c of world) { if (c.a3 === 'ATA') continue; const v = data.get(c); g += `<path d="${countryD(c, wx, wy)}" fill="${v === undefined ? '#e5e7eb' : colOf(cls(v))}" stroke="#ffffff" stroke-width="${(0.5 / s).toFixed(3)}"><title>${esc(c.n)}${v === undefined ? ': no data' : ': ' + fmt(v)}</title></path>`; } g += '</g>';
    const lx = 20, ly = top + Hd + 14, bw = Math.min(110, (Wd - 120) / k); for (let i = 0; i < k; i++) g += `<rect x="${lx + i * bw}" y="${ly}" width="${bw}" height="12" fill="${colOf(i)}"/><text x="${lx + i * bw}" y="${ly + 26}" font-size="11">${fmt(round(br[i], 2))}</text>`; g += `<text x="${lx + k * bw}" y="${ly + 26}" font-size="11">${fmt(round(br[k], 2))}</text><rect x="${lx + k * bw + 50}" y="${ly}" width="12" height="12" fill="#e5e7eb"/><text x="${lx + k * bw + 66}" y="${ly + 11}" font-size="11">no data</text>`;
    const note = `${data.size} countries coloured${miss.length ? '; not matched: ' + miss.slice(0, 12).join(', ') + (miss.length > 12 ? ' ...' : '') : ''}. ${o.method} classes. The 110m shapes leave out many small countries and islands, so those cannot be coloured.`;
    return chartResult(svgDoc(Wd, H, o.title || 'Choropleth map', `World map shaded by value, ${data.size} countries. Highest ${fmt(hi)}, lowest ${fmt(lo)}.`, titleEl(Wd, o.title) + g), 'choropleth-map.svg', ['Country', 'Value', 'Class'], [...data].sort((a, b) => b[1] - a[1]).map(([c, v]) => [c.n, fmt(v), `${fmt(round(br[cls(v)], 2))} to ${fmt(round(br[cls(v) + 1], 2))}`]), note);
  },
});

T.push({
  id: 'csv-to-map-plotter', cat: GEO, title: 'CSV Coordinates to Map Plotter (Points on a Country-Outline Map)',
  desc: 'Plot the rows of a CSV that has latitude and longitude columns as markers on an offline map made of country outlines. Optional label and size columns. Exports SVG. No street map is loaded.',
  inputs: 1, labels: ['CSV with a header row including latitude and longitude columns'], sample: 'city,lat,lon,population\nLondon,51.5074,-0.1278,9.0\nParis,48.8566,2.3522,2.1\nBerlin,52.52,13.405,3.7\nMadrid,40.4168,-3.7038,3.3\nRome,41.9028,12.4964,2.8\nWarsaw,52.2297,21.0122,1.8\n',
  opts: [delimOpt, { id: 'label', label: 'Label column (blank = first non-coordinate text column)', type: 'text', def: '' }, { id: 'size', label: 'Size column (numeric, blank = fixed)', type: 'text', def: 'population' }, { id: 'outline', label: 'Draw country outlines', type: 'checkbox', def: true }, { id: 'title', label: 'Title', type: 'text', def: '' }, ...sizeOpts(700, 480)],
  run: async ([src], o) => {
    const { head, body } = tbl(src, o, 'a CSV'), find = (re) => head.findIndex((h) => re.test(h.trim().toLowerCase())), la = find(/^(lat|latitude|y)$/), lo = find(/^(lon|lng|long|longitude|x)$/); if (la < 0 || lo < 0) throw new Error('Could not find latitude and longitude columns. Name them lat and lon (or latitude, longitude).');
    const li = o.label ? colIdx(head, o.label, 'label column') : head.findIndex((_, i) => i !== la && i !== lo && body.some((r) => Number.isNaN(numv(r[i])) && r[i].trim())), si = o.size.trim() ? colIdx(head, o.size, 'size column') : -1;
    const pts = body.map((r, i) => ({ lat: numv(r[la]), lon: numv(r[lo]), l: li >= 0 ? r[li] : '', s: si >= 0 ? numv(r[si]) : NaN, i })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180), skipped = body.length - pts.length; if (!pts.length) throw new Error('No valid coordinates found.'); if (pts.length > 5000) throw new Error('At most 5000 points.');
    const bb = [Math.min(...pts.map((p) => p.lon)), Math.min(...pts.map((p) => p.lat)), Math.max(...pts.map((p) => p.lon)), Math.max(...pts.map((p) => p.lat))], pd = Math.max(0.5, (bb[2] - bb[0] + bb[3] - bb[1]) * 0.12), view = [Math.max(-180, bb[0] - pd), Math.max(-90, bb[1] - pd), Math.min(180, bb[2] + pd), Math.min(90, bb[3] + pd)], [W, H] = dims(o, 700, 480), P = fitProj(view, W, H, 6);
    let g = ''; if (o.outline) g += outlineSvg(await loadWorld(), P, view, W, H); const smax = Math.max(1e-9, ...pts.map((p) => (Number.isFinite(p.s) ? p.s : 0)));
    pts.forEach((p) => { const r = si >= 0 && Number.isFinite(p.s) ? 4 + 14 * Math.sqrt(Math.max(0, p.s) / smax) : 5; g += `<circle cx="${P.x(p.lon).toFixed(1)}" cy="${P.y(p.lat).toFixed(1)}" r="${r.toFixed(1)}" fill="#D55E00" fill-opacity=".75" stroke="#fff" stroke-width="1.2"><title>${esc(p.l || `row ${p.i + 1}`)}: ${p.lat}, ${p.lon}</title></circle>`; if (p.l && pts.length <= 80) g += `<text x="${(P.x(p.lon) + r + 3).toFixed(1)}" y="${(P.y(p.lat) + 4).toFixed(1)}" font-size="11" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(cut(p.l, 20))}</text>`; });
    return chartResult(svgDoc(W, H, o.title || 'Point map', `Map of ${pts.length} points between latitude ${fmt(bb[1])} and ${fmt(bb[3])} and longitude ${fmt(bb[0])} and ${fmt(bb[2])}.`, g), 'point-map.svg', ['Label', 'Latitude', 'Longitude', 'Size'], pts.map((p) => [p.l || String(p.i + 1), fmt(p.lat), fmt(p.lon), Number.isFinite(p.s) ? fmt(p.s) : '']), `${pts.length} points plotted${skipped ? `, ${skipped} row(s) skipped (missing or invalid coordinates)` : ''}. Equirectangular fit over country outlines; distances near the poles are stretched.`);
  },
});

// ---------------------------------------------------------------- interactive: travel pinner and geography quiz
const hEl = (tag, attrs = {}, ...kidsA) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'style') e.style.cssText = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v); } for (const c of kidsA.flat()) e.append(c); return e; };
const sEl = (tag, attrs = {}) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const LAND = 'fill:light-dark(#d3d9e0,#465062);stroke:light-dark(#ffffff,#1f2430);stroke-width:.35;';
const mapCountries = (world) => world.filter((c) => c.a3 !== 'ATA');
let _uid = 0;

T.push({
  id: 'travel-map-pinner', cat: GEO, title: 'Travel Map Pinner (Mark Visited Countries and Count Them)',
  desc: 'Click countries on a world map, or tick them in the list, to mark where you have been. Shows how many countries and what share of the map you have visited and lets you download the map as SVG. Nothing is sent anywhere.',
  custom: true,
  render: async (el) => {
    const world = mapCountries(await loadWorld()), uid = 'tp' + ++_uid, visited = new Set(); let colour = '#0072B2';
    const svg = sEl('svg', { viewBox: WORLD_VB.join(' '), width: '100%', role: 'img', style: 'max-width:60rem;height:auto' }), land = sEl('g', { transform: '' });
    const paths = new Map(), boxes = new Map();
    const status = hEl('p', { role: 'status', 'aria-live': 'polite', id: uid + '-st' }), dl = hEl('a', { class: 'btn', download: 'travel-map.svg', href: '#' }, 'Download SVG');
    const colourIn = hEl('input', { type: 'color', value: colour, id: uid + '-col', oninput: () => { colour = colourIn.value; paint(); } });
    for (const c of world) { const p = sEl('path', { d: countryD(c, wx, wy), style: LAND }); p.dataset.a3 = c.a3; p.append(Object.assign(sEl('title', {}), { textContent: c.n })); p.style.cursor = 'pointer'; p.addEventListener('click', () => toggle(c.a3)); paths.set(c.a3, p); land.append(p); }
    svg.append(land);
    const list = hEl('div', { style: 'max-height:18rem;overflow:auto;border:1px solid light-dark(#9aa4b2,#586071);border-radius:.4rem;padding:.5rem;columns:14rem auto', tabindex: '0', role: 'group', 'aria-label': 'Countries, tick the ones you have visited' });
    for (const c of [...world].sort((a, b) => a.n.localeCompare(b.n))) { const id = `${uid}-${c.a3}`, cb = hEl('input', { type: 'checkbox', id, onchange: () => toggle(c.a3, cb.checked) }); boxes.set(c.a3, cb); list.append(hEl('div', { style: 'break-inside:avoid' }, cb, ' ', hEl('label', { for: id }, c.n))); }
    function toggle(a3, on) { const want = on === undefined ? !visited.has(a3) : on; if (want) visited.add(a3); else visited.delete(a3); boxes.get(a3).checked = want; paint(); }
    function paint() {
      for (const [a3, p] of paths) p.style.cssText = visited.has(a3) ? `fill:${colour};stroke:light-dark(#ffffff,#1f2430);stroke-width:.35;cursor:pointer` : LAND + 'cursor:pointer';
      const n = visited.size, pct = (100 * n) / world.length; status.textContent = `${n} of ${world.length} countries visited (${pct.toFixed(1)}%).`; svg.setAttribute('aria-label', `World map. ${n} countries marked as visited: ${[...visited].map((a) => world.find((c) => c.a3 === a).n).join(', ') || 'none'}.`);
      const out3 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORLD_VB.join(' ')}" width="1200" role="img"><title>Countries visited: ${n}</title><rect x="${WORLD_VB[0]}" y="${WORLD_VB[1]}" width="${WORLD_VB[2]}" height="${WORLD_VB[3]}" fill="#ffffff"/>${world.map((c) => `<path d="${countryD(c, wx, wy)}" fill="${visited.has(c.a3) ? colour : '#d3d9e0'}" stroke="#ffffff" stroke-width=".35"/>`).join('')}<text x="-175" y="-76" font-family="sans-serif" font-size="7" fill="#1a1a1a">${n} of ${world.length} countries (${pct.toFixed(1)}%)</text></svg>`;
      if (dl.dataset.u) URL.revokeObjectURL(dl.dataset.u); const u = URL.createObjectURL(new Blob([out3], { type: 'image/svg+xml' })); dl.href = u; dl.dataset.u = u;
    }
    const clear = hEl('button', { type: 'button', class: 'btn', onclick: () => { visited.clear(); boxes.forEach((b) => { b.checked = false; }); paint(); } }, 'Clear all');
    el.replaceChildren(hEl('div', { class: 'stack' }, hEl('p', {}, 'Click a country on the map, or use the list below (the list works with the keyboard and screen readers). Small countries missing from the 110m map data are not included.'), status, hEl('div', { class: 'cluster' }, hEl('label', { for: uid + '-col' }, 'Colour of visited countries'), colourIn, clear, dl), svg, hEl('h3', {}, 'Countries'), list));
    paint();
    tool_state.get = () => ({ v: [...visited].join(',') }); tool_state.set = (s) => { visited.clear(); String(s?.v || '').split(',').filter(Boolean).forEach((a) => { if (boxes.has(a)) { visited.add(a); boxes.get(a).checked = true; } }); paint(); };
  },
  urlState: { get: () => tool_state.get(), set: (s) => tool_state.set(s) },
});
const tool_state = { get: () => ({}), set: () => {} };

T.push({
  id: 'geography-quiz-map', cat: GEO, title: 'Geography Quiz: Countries on a Blank World Map',
  desc: 'Practise where countries are. Find the named country by clicking the map, or name the country that is highlighted by typing its name (the keyboard route). Choose a continent, keep score, and see the right answer after each miss.',
  custom: true,
  render: async (el) => {
    const all = mapCountries(await loadWorld()).filter((c) => c.a2 && c.a3 !== 'CYN'), uid = 'gq' + ++_uid, VB = { All: WORLD_VB, Africa: [-20, -38, 75, 75], Asia: [25, -78, 155, 90], Europe: [-25, -72, 75, 40], 'North America': [-170, -84, 120, 74], 'South America': [-85, -14, 55, 70], Oceania: [110, -5, 70, 50] };
    let pool = [], idx = 0, right = 0, tried = 0, mode = 'click', locked = false, cur = null;
    const svg = sEl('svg', { viewBox: WORLD_VB.join(' '), width: '100%', role: 'img', 'aria-label': 'Blank world map', style: 'max-width:60rem;height:auto' }), paths = new Map();
    for (const c of mapCountries(await loadWorld())) { const p = sEl('path', { d: countryD(c, wx, wy), style: LAND }); p.dataset.a3 = c.a3; paths.set(c.a3, p); svg.append(p); }
    const prompt = hEl('p', { id: uid + '-q', style: 'font-size:1.25rem;font-weight:600' }), status = hEl('p', { role: 'status', 'aria-live': 'polite' }), score = hEl('p', { 'aria-live': 'off' });
    const sel = hEl('select', { id: uid + '-cont', onchange: start }, Object.keys(VB).map((k) => hEl('option', { value: k }, k))), modeSel = hEl('select', { id: uid + '-mode', onchange: () => { mode = modeSel.value; start(); } }, hEl('option', { value: 'click' }, 'Find the country on the map (pointer)'), hEl('option', { value: 'type' }, 'Name the highlighted country (keyboard)'));
    const dl = hEl('datalist', { id: uid + '-names' }, [...all].sort((a, b) => a.n.localeCompare(b.n)).map((c) => hEl('option', { value: c.n }))), ans = hEl('input', { type: 'text', id: uid + '-ans', list: uid + '-names', autocomplete: 'off', spellcheck: 'false' }), form = hEl('form', { class: 'cluster', onsubmit: (e) => { e.preventDefault(); if (!locked) submitType(); } }, hEl('label', { for: uid + '-ans' }, 'Country name'), ans, hEl('button', { type: 'submit', class: 'btn' }, 'Check'));
    const next = hEl('button', { type: 'button', class: 'btn', onclick: () => nextQ() }, 'Next'), skip = hEl('button', { type: 'button', class: 'btn', onclick: () => { if (!locked) reveal('Skipped. ', false); } }, 'Give up on this one'), restart = hEl('button', { type: 'button', class: 'btn', onclick: start }, 'Restart');
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const reset = () => paths.forEach((p) => { p.style.cssText = LAND; p.style.cursor = mode === 'click' ? 'pointer' : 'default'; });
    function start() { const cont = sel.value; svg.setAttribute('viewBox', VB[cont].join(' ')); pool = shuffle(all.filter((c) => cont === 'All' || c.c === cont || (cont === 'Oceania' && c.c === 'Seven seas (open ocean)'))); idx = right = tried = 0; mode = modeSel.value; form.hidden = mode !== 'type'; nextQ(true); }
    function nextQ(first) { if (!first) idx++; locked = false; next.hidden = true; reset(); status.textContent = ''; if (idx >= pool.length) { prompt.textContent = 'Finished.'; status.textContent = `Done: ${right} of ${tried} correct (${tried ? Math.round((100 * right) / tried) : 0}%). Press Restart to go again.`; skip.hidden = true; form.hidden = true; svg.setAttribute('aria-label', 'Blank world map'); showScore(); restart.focus(); return; } skip.hidden = false; cur = pool[idx]; form.hidden = mode !== 'type'; if (mode === 'click') { prompt.textContent = `Click on: ${cur.n}`; svg.setAttribute('aria-label', 'Blank world map. Click the country named above.'); } else { prompt.textContent = 'Which country is highlighted on the map?'; svg.setAttribute('aria-label', 'World map with one country highlighted in orange. Type its name below.'); paths.get(cur.a3).style.cssText = 'fill:#E69F00;stroke:#1a1a1a;stroke-width:.6'; ans.value = ''; ans.focus(); } showScore(); }
    function showScore() { score.textContent = `Question ${Math.min(idx + 1, pool.length)} of ${pool.length}. Score: ${right} of ${tried}.`; }
    function reveal(pre, ok) { locked = true; tried++; if (ok) right++; paths.get(cur.a3).style.cssText = `fill:${ok ? '#009E73' : '#E69F00'};stroke:#1a1a1a;stroke-width:.6`; status.textContent = `${pre}${ok ? 'Correct.' : `The answer was ${cur.n}.`}`; showScore(); next.hidden = false; if (ok && mode === 'click') setTimeout(() => nextQ(), 700); else next.focus(); }
    function submitType() { const g = stripAcc(ans.value); if (!g) { status.textContent = 'Type a country name first.'; return; } const ok = g === stripAcc(cur.n) || (ALIAS[g] && ALIAS[g] === cur.a2) || g === cur.a3.toLowerCase(); reveal(ok ? '' : `You typed "${ans.value}". `, ok); }
    svg.addEventListener('click', (e) => { if (mode !== 'click' || locked || !cur) return; const p = e.target.closest('path'); if (!p) return; const hit = all.find((c) => c.a3 === p.dataset.a3), ok = p.dataset.a3 === cur.a3; if (!ok) paths.get(p.dataset.a3).style.cssText = 'fill:#D55E00;stroke:#1a1a1a;stroke-width:.4'; reveal(ok ? '' : `You clicked ${hit ? hit.n : 'another country'}. `, ok); });
    el.replaceChildren(hEl('div', { class: 'stack' }, hEl('div', { class: 'cluster' }, hEl('label', { for: uid + '-cont' }, 'Region'), sel, hEl('label', { for: uid + '-mode' }, 'Mode'), modeSel, restart), prompt, status, score, form, dl, hEl('div', { class: 'cluster' }, next, skip), svg, hEl('p', {}, 'Uses Natural Earth 1:110m shapes, which leave out many small countries and islands. Pointer mode needs a mouse or touch; the keyboard mode asks you to name the highlighted country instead.')));
    start();
  },
});

export default T;

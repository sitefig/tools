// Tools from free-browser-tools.md, batch 11 (CSS generators, HTML and markup tools). See TOOLS.md for the contract.
// Skipped in this batch: PlantUML rendering (needs the public PlantUML server).
// Honest limits: no real HTML5 parser conformance, no Pyodide/docutils, no KaTeX/DOMPurify/MJML libraries; hand-written subsets, stated on each page.
const T = [];
const CSSC = 'CSS+', MK = 'Markup Converters';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const N = (id, label, def) => ({ id, label, type: 'number', def });
const X = (id, label, def) => ({ id, label, type: 'text', def });
const K = (id, label, def) => ({ id, label, type: 'checkbox', def });
const S = (id, label, def, choices) => ({ id, label, type: 'select', def, choices });
const fmt = (n) => String(+Number(n).toFixed(3));
const need = (v, name) => { const n = Number(v); if (!Number.isFinite(n)) throw new Error(name + ' must be a number'); return n; };
const page = (css, body) => `<!doctype html><html lang="en"><meta charset="utf-8"><style>body{margin:16px;font:14px system-ui,sans-serif;color:#222;background:#fff}${css}</style><body>${body}</body></html>`;
const cssColor = (v, name) => { v = String(v).trim(); if (!/^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl|oklch|lab|lch|color)a?\([^;{}]*\)|var\(--[\w-]+\))$/i.test(v)) throw new Error(name + ' is not a plain CSS colour'); return v; };
const cls = (v) => { v = String(v).trim() || 'box'; if (!/^[A-Za-z_][\w-]*$/.test(v)) throw new Error('Class name may only use letters, digits, - and _'); return v; };

/* ---------- 715 CSS transform ---------- */
T.push({
  id: 'css-transform-generator', cat: CSSC, title: 'CSS Transform Generator: Rotate, Scale, Skew, Translate and 3D',
  desc: 'Combine translate, rotate (2D and 3D), scale, skew, perspective and transform-origin with sliders-as-numbers and copy the transform declaration. Identity values are left out.',
  inputs: 0, sample: '',
  opts: [N('tx', 'translateX (px)', 20), N('ty', 'translateY (px)', 0), N('tz', 'translateZ (px, needs perspective)', 0), N('rot', 'rotate (deg)', 15), N('rx', 'rotateX (deg)', 0), N('ry', 'rotateY (deg)', 0),
    N('sx', 'scaleX', 1), N('sy', 'scaleY', 1), N('kx', 'skewX (deg)', 0), N('ky', 'skewY (deg)', 0), N('persp', 'perspective on parent (px, 0 = none)', 0),
    S('origin', 'transform-origin', 'center', ['center', 'top left', 'top', 'top right', 'left', 'right', 'bottom left', 'bottom', 'bottom right']), X('cls', 'Class name', 'box')],
  run: (_i, o) => {
    const v = (k, n) => need(o[k], n);
    const parts = [];
    const tx = v('tx', 'translateX'), ty = v('ty', 'translateY'), tz = v('tz', 'translateZ');
    if (tz) parts.push(`translate3d(${fmt(tx)}px, ${fmt(ty)}px, ${fmt(tz)}px)`); else if (tx || ty) parts.push(`translate(${fmt(tx)}px, ${fmt(ty)}px)`);
    const rx = v('rx', 'rotateX'), ry = v('ry', 'rotateY'), rot = v('rot', 'rotate');
    if (rx) parts.push(`rotateX(${fmt(rx)}deg)`); if (ry) parts.push(`rotateY(${fmt(ry)}deg)`); if (rot) parts.push(`rotate(${fmt(rot)}deg)`);
    const sx = v('sx', 'scaleX'), sy = v('sy', 'scaleY');
    if (sx !== 1 || sy !== 1) parts.push(sx === sy ? `scale(${fmt(sx)})` : `scale(${fmt(sx)}, ${fmt(sy)})`);
    const kx = v('kx', 'skewX'), ky = v('ky', 'skewY');
    if (kx) parts.push(`skewX(${fmt(kx)}deg)`); if (ky) parts.push(`skewY(${fmt(ky)}deg)`);
    const persp = v('persp', 'perspective');
    if (persp < 0) throw new Error('perspective cannot be negative');
    const c = cls(o.cls), tf = parts.join(' ') || 'none';
    let css = `.${c} {\n  transform: ${tf};\n${o.origin !== 'center' ? `  transform-origin: ${o.origin};\n` : ''}}\n`;
    if (persp) css = `.${c}-stage {\n  perspective: ${fmt(persp)}px;\n}\n` + css;
    if (tz && !persp) css += '/* translateZ has no visible effect without a perspective */\n';
    const box = `<div class="stage"><div class="ghost"></div><div class="${c}">Box</div></div>`;
    return { text: css, html: page(`.stage{position:relative;width:240px;height:200px;margin:30px auto;${persp ? `perspective:${persp}px;` : ''}}.ghost,.${c}{position:absolute;left:70px;top:50px;width:100px;height:100px;border-radius:6px}.ghost{border:2px dashed #888}.${c}{background:#2563eb;color:#fff;display:grid;place-items:center;transform:${tf};transform-origin:${o.origin}}`, box) };
  },
});

/* ---------- 721 hex to CSS filter ---------- */
const clamp01 = (x) => Math.max(0, Math.min(1, x));
function applyFilters(p) { // p = [invert%, sepia%, saturate%, hue deg, brightness%, contrast%] applied to black, order as in the CSS list
  let c = [0, 0, 0];
  const mat = (m) => { c = [0, 1, 2].map((i) => clamp01(m[i][0] * c[0] + m[i][1] * c[1] + m[i][2] * c[2])); };
  const inv = p[0] / 100; c = c.map((v) => clamp01(inv + v * (1 - 2 * inv)));
  const a = 1 - clamp01(p[1] / 100);
  mat([[0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a], [0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a], [0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a]]);
  const s = p[2] / 100;
  mat([[0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s], [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s], [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]]);
  const r = (p[3] * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
  mat([[0.213 + co * 0.787 - si * 0.213, 0.715 - co * 0.715 - si * 0.715, 0.072 - co * 0.072 + si * 0.928], [0.213 - co * 0.213 + si * 0.143, 0.715 + co * 0.285 + si * 0.14, 0.072 - co * 0.072 - si * 0.283], [0.213 - co * 0.213 - si * 0.787, 0.715 - co * 0.715 + si * 0.715, 0.072 + co * 0.928 + si * 0.072]]);
  c = c.map((v) => clamp01(v * (p[4] / 100)));
  const k = p[5] / 100; c = c.map((v) => clamp01(v * k + (0.5 - 0.5 * k)));
  return c.map((v) => v * 255);
}
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return [h * 100, s * 100, l * 100];
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function solveFilter(target) { // SPSA with fixed seed; deterministic
  const th = hslT(target);
  const loss = (p) => { const c = applyFilters(p), h = rgb2hsl(c); return Math.abs(c[0] - target[0]) + Math.abs(c[1] - target[1]) + Math.abs(c[2] - target[2]) + Math.abs(h[0] - th[0]) + Math.abs(h[1] - th[1]) + Math.abs(h[2] - th[2]); };
  const lim = [100, 100, 7500, 360, 200, 200];
  const fix = (v, i) => { const m = lim[i]; if (i === 3) return ((v % m) + m) % m; return Math.max(0, Math.min(m, v)); };
  let best = null;
  for (let attempt = 0; attempt < 12 && (!best || best.loss > 1.5); attempt++) {
    const rnd = mulberry(1234 + attempt * 77);
    let p = [50, 20, 3750, 180, 100, 100], bl = loss(p), bp = p.slice();
    const A = [3, 3, 40, 6, 1, 1];
    for (let it = 0; it < 1400; it++) {
      const ck = 15 / Math.pow(it + 1, 1 / 6), d = p.map(() => (rnd() > 0.5 ? 1 : -1));
      const hi = p.map((v, i) => fix(v + ck * d[i], i)), lo = p.map((v, i) => fix(v - ck * d[i], i));
      const g = (loss(hi) - loss(lo)) / (2 * ck);
      p = p.map((v, i) => fix(v - (d[i] * g * (A[i] * 4)) / Math.pow(it + 1 + 0, 0.602) * 1 , i));
      const l = loss(p); if (l < bl) { bl = l; bp = p.slice(); }
    }
    for (let it = 0; it < 4000; it++) { // local random refinement
      const q = bp.map((v, i) => fix(v + (rnd() - 0.5) * (it < 2000 ? 4 : 0.8) * (i === 2 ? 20 : i === 3 ? 4 : 1), i)); const l = loss(q); if (l < bl) { bl = l; bp = q; }
    }
    if (!best || bl < best.loss) best = { loss: bl, p: bp };
  }
  return best;
}
const hslT = (c) => rgb2hsl(c);
T.push({
  id: 'hex-to-css-filter', cat: CSSC, title: 'Hex Colour to CSS Filter (Recolour a Black Icon)',
  desc: 'Search for an invert, sepia, saturate, hue-rotate, brightness and contrast chain that turns a black image or icon into a target hex colour, and show how close the result is.',
  labels: ['Target colour (hex)'], placeholder: ['#1d4ed8'], sample: '#1d4ed8',
  run: ([s]) => {
    let h = s.trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(h)) h = h.replace(/./g, '$&$&');
    if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error('Enter a 3 or 6 digit hex colour such as #1d4ed8');
    const t = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    const { p, loss } = solveFilter(t), c = applyFilters(p.map((v, i) => (i === 3 ? v : Math.round(v)))).map(Math.round);
    const f = `invert(${Math.round(p[0])}%) sepia(${Math.round(p[1])}%) saturate(${Math.round(p[2])}%) hue-rotate(${Math.round(p[3])}deg) brightness(${Math.round(p[4])}%) contrast(${Math.round(p[5])}%)`;
    const hex = '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
    const err = Math.max(...c.map((v, i) => Math.abs(v - t[i])));
    const quality = err <= 3 ? 'very close' : err <= 8 ? 'close' : 'rough, review it visually';
    return `filter: ${f};\n\nTarget: #${h.toLowerCase()}\nFilter result: ${hex} (largest channel difference ${err} of 255, ${quality})\nSearch score: ${loss.toFixed(2)} (lower is better)\n\nHow to use: apply the filter to a black (#000) image, SVG or icon. It does not work on other colours because the chain is solved for black as the starting colour. The search is approximate and uses the CSS Filter Effects colour matrices; always check the result in your target browser.`;
  },
});

/* ---------- 723 type scale ---------- */
T.push({
  id: 'type-scale-generator', cat: CSSC, title: 'Modular Type Scale Generator (Ratio to CSS Variables)',
  desc: 'Build a modular font-size scale from a base size and ratio such as 1.25 or 1.618, preview heading and body sizes, and copy rem custom properties.',
  inputs: 0, sample: '',
  opts: [N('base', 'Base size (px)', 16), S('ratio', 'Ratio', '1.25 major third', ['1.067 minor second', '1.125 major second', '1.2 minor third', '1.25 major third', '1.333 perfect fourth', '1.414 augmented fourth', '1.5 perfect fifth', '1.618 golden ratio', 'custom']),
    N('custom', 'Custom ratio (when Ratio is custom)', 1.3), N('down', 'Steps below base', 2), N('up', 'Steps above base', 6), N('root', 'Root font size (px)', 16), X('prefix', 'Variable prefix', 'step')],
  run: (_i, o) => {
    const base = need(o.base, 'Base size'), root = need(o.root, 'Root size');
    const r = o.ratio === 'custom' ? need(o.custom, 'Custom ratio') : parseFloat(o.ratio);
    const down = Math.round(need(o.down, 'Steps below')), up = Math.round(need(o.up, 'Steps above'));
    if (base <= 0 || root <= 0) throw new Error('Sizes must be above zero');
    if (r <= 1) throw new Error('Ratio must be above 1');
    if (down < 0 || up < 0 || down + up > 30) throw new Error('Use 0 to 30 steps in total');
    if (!/^[a-z][\w-]*$/i.test(o.prefix)) throw new Error('Prefix may only use letters, digits, - and _');
    const rows = [];
    for (let i = -down; i <= up; i++) rows.push({ i, px: base * Math.pow(r, i) });
    const name = (i) => `--${o.prefix}-${i < 0 ? 'minus-' + -i : i}`;
    const css = ':root {\n' + rows.map((x) => `  ${name(x.i)}: ${fmt(x.px / root)}rem; /* ${fmt(x.px)}px */`).join('\n') + '\n}\n';
    const table = rows.slice().reverse().map((x) => `step ${String(x.i).padStart(2)}  ${fmt(x.px).padStart(8)}px  ${fmt(x.px / root).padStart(8)}rem`).join('\n');
    const prev = rows.slice().reverse().map((x) => `<div style="font-size:${fmt(x.px)}px;line-height:1.2;margin:.2em 0;white-space:nowrap;overflow:hidden"><small style="font-size:11px;color:#666">step ${x.i} / ${fmt(x.px)}px</small> Sphinx of black quartz</div>`).join('');
    return { text: `${css}\n/* ratio ${r}, base ${base}px */\n${table}\n`, html: page('', prev) };
  },
});

/* ---------- 714 keyframes builder ---------- */
T.push({
  id: 'css-keyframes-builder', cat: CSSC, title: 'CSS @keyframes Builder from Keyframe Lines',
  desc: 'Write one line per keyframe (percent, then declarations) and get a complete @keyframes block plus the animation shorthand, with a live preview of a moving box.',
  labels: ['Keyframes, one per line: 0%: opacity: 0; transform: translateY(20px)'], placeholder: ['0%: opacity: 0; transform: translateY(20px)\n100%: opacity: 1; transform: none'],
  sample: '0%: opacity: 0; transform: translateY(24px)\n60%: opacity: 1; transform: translateY(-6px)\n100%: opacity: 1; transform: translateY(0)',
  opts: [X('name', 'Animation name', 'fade-up'), N('dur', 'Duration (s)', 1), S('ease', 'Timing function', 'ease-out', ['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear']), N('delay', 'Delay (s)', 0), X('iter', 'Iteration count (number or infinite)', 'infinite'), S('dir', 'Direction', 'alternate', ['normal', 'reverse', 'alternate', 'alternate-reverse']), S('fill', 'Fill mode', 'both', ['none', 'forwards', 'backwards', 'both'])],
  run: ([s], o) => {
    if (!/^[A-Za-z_][\w-]*$/.test(o.name)) throw new Error('Animation name may only use letters, digits, - and _');
    const dur = need(o.dur, 'Duration'), delay = need(o.delay, 'Delay');
    if (dur <= 0) throw new Error('Duration must be above zero');
    if (!/^(infinite|\d+(\.\d+)?)$/.test(o.iter.trim())) throw new Error('Iteration count must be a number or infinite');
    const frames = new Map();
    s.split('\n').forEach((ln, idx) => {
      if (!ln.trim()) return;
      const ci = ln.indexOf(':');
      const keys = (ci < 0 ? [] : ln.slice(0, ci).split(',')).map((x) => x.trim());
      if (!keys.length || keys.some((k) => !/^(from|to|\d+(?:\.\d+)?%)$/.test(k))) throw new Error(`Line ${idx + 1}: start with from, to or a percent, then a colon`);
      const decl = ln.slice(ci + 1).trim().replace(/;?$/, ';');
      if (!/^[\w-]+\s*:[^;]+;/.test(decl)) throw new Error(`Line ${idx + 1}: expected property: value pairs`);
      if (/[<>{}@]/.test(decl)) throw new Error(`Line ${idx + 1}: unexpected character in declarations`);
      for (const k of keys) frames.set(k, (frames.get(k) ? frames.get(k) + ' ' : '') + decl);
    });
    if (frames.size < 1) throw new Error('Add at least one keyframe line');
    const val = (k) => (k === 'from' ? 0 : k === 'to' ? 100 : parseFloat(k));
    const ks = [...frames.keys()].sort((a, b) => val(a) - val(b));
    if (ks.some((k) => val(k) > 100)) throw new Error('Percentages go from 0% to 100%');
    const kf = `@keyframes ${o.name} {\n` + ks.map((k) => `  ${k} {\n${frames.get(k).split(/(?<=;)\s*/).filter(Boolean).map((d) => '    ' + d).join('\n')}\n  }`).join('\n') + '\n}\n';
    const anim = `animation: ${o.name} ${fmt(dur)}s ${o.ease} ${fmt(delay)}s ${o.iter.trim()} ${o.dir} ${o.fill};`;
    const css = `${kf}\n.animated {\n  ${anim}\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .animated {\n    animation: none;\n  }\n}\n`;
    return { text: css, html: page(`${kf}.animated{width:80px;height:80px;margin:40px;background:#2563eb;border-radius:8px;${anim}}@media (prefers-reduced-motion:reduce){.animated{animation:none}}`, '<div class="animated"></div>') };
  },
});

/* ---------- 725 multi-column ---------- */
T.push({
  id: 'css-multi-column-generator', cat: CSSC, title: 'CSS Multi-Column Layout Generator (columns, gap, rule)',
  desc: 'Set column-count, column-width, column-gap and column-rule, preview sample text flowing into columns, and copy the CSS including break-inside and column-span helpers.',
  inputs: 0, sample: '',
  opts: [N('count', 'column-count (0 = auto)', 3), N('width', 'column-width (px, 0 = auto)', 0), N('gap', 'column-gap (px)', 32), N('rw', 'Rule width (px, 0 = none)', 1), S('rs', 'Rule style', 'solid', ['solid', 'dashed', 'dotted', 'double']), X('rc', 'Rule colour', '#999999'), S('fill', 'column-fill', 'balance', ['balance', 'auto']), K('span', 'Add a .span-all heading helper', true), K('avoid', 'Add a .no-split helper (break-inside: avoid)', true)],
  run: (_i, o) => {
    const count = Math.round(need(o.count, 'column-count')), w = need(o.width, 'column-width'), gap = need(o.gap, 'column-gap'), rw = need(o.rw, 'Rule width');
    if (count < 0 || w < 0 || gap < 0 || rw < 0) throw new Error('Values cannot be negative');
    if (!count && !w) throw new Error('Set column-count or column-width (or both)');
    cssColor(o.rc, 'Rule colour');
    let css = '.columns {\n';
    if (count && w) css += `  columns: ${w}px ${count};\n`; else if (count) css += `  column-count: ${count};\n`; else css += `  column-width: ${w}px;\n`;
    css += `  column-gap: ${gap}px;\n`;
    if (rw) css += `  column-rule: ${rw}px ${o.rs} ${o.rc};\n`;
    if (o.fill === 'auto') css += '  column-fill: auto;\n';
    css += '}\n';
    if (o.span) css += '\n.columns .span-all {\n  column-span: all;\n}\n';
    if (o.avoid) css += '\n.columns .no-split {\n  break-inside: avoid;\n}\n';
    const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. ';
    return { text: css, html: page(css + (o.fill === 'auto' ? '.columns{height:260px}' : ''), `<div class="columns">${o.span ? '<h3 class="span-all" style="margin-top:0">Heading across all columns</h3>' : ''}<p>${lorem}${lorem}</p><p>${lorem}</p><p>${lorem}${lorem}</p></div>`) };
  },
});

/* ---------- 731 checkbox / toggle ---------- */
T.push({
  id: 'css-checkbox-toggle-generator', cat: CSSC, title: 'Custom Checkbox and Toggle Switch CSS Generator (Accessible)',
  desc: 'Style a checkbox or switch with pure CSS on top of a real input element: size, colours, radius, transition, focus ring and reduced-motion handling. Copy the HTML and CSS.',
  inputs: 0, sample: '',
  opts: [S('kind', 'Type', 'switch', ['switch', 'checkbox']), N('size', 'Size (px)', 24), X('on', 'On colour', '#2563eb'), X('off', 'Off colour', '#9ca3af'), X('thumb', 'Thumb / tick colour', '#ffffff'), N('radius', 'Corner radius (px, checkbox)', 4), N('ms', 'Transition (ms)', 150), X('label', 'Label text', 'Email me updates'), X('cls', 'Class name', 'toggle')],
  run: (_i, o) => {
    const sz = need(o.size, 'Size'), ms = need(o.ms, 'Transition'), rad = need(o.radius, 'Radius');
    if (sz < 12 || sz > 80) throw new Error('Size must be between 12 and 80 px');
    if (ms < 0 || rad < 0) throw new Error('Values cannot be negative');
    const on = cssColor(o.on, 'On colour'), off = cssColor(o.off, 'Off colour'), th = cssColor(o.thumb, 'Thumb colour'), c = cls(o.cls), sw = o.kind === 'switch';
    const w = sw ? Math.round(sz * 1.8) : sz, pad = Math.max(2, Math.round(sz / 10)), knob = sz - pad * 2;
    const css = `.${c} {\n  appearance: none;\n  -webkit-appearance: none;\n  position: relative;\n  flex: none;\n  width: ${w}px;\n  height: ${sz}px;\n  margin: 0;\n  background: ${off};\n  border-radius: ${sw ? sz : rad}px;\n  cursor: pointer;\n  transition: background ${ms}ms ease;\n}\n` +
      (sw ? `.${c}::before {\n  content: "";\n  position: absolute;\n  top: ${pad}px;\n  left: ${pad}px;\n  width: ${knob}px;\n  height: ${knob}px;\n  border-radius: 50%;\n  background: ${th};\n  transition: transform ${ms}ms ease;\n}\n.${c}:checked::before {\n  transform: translateX(${w - sz}px);\n}\n`
        : `.${c}::after {\n  content: "";\n  position: absolute;\n  left: 35%;\n  top: 15%;\n  width: 25%;\n  height: 50%;\n  border: solid ${th};\n  border-width: 0 ${Math.max(2, Math.round(sz / 8))}px ${Math.max(2, Math.round(sz / 8))}px 0;\n  transform: rotate(45deg) scale(0);\n  transition: transform ${ms}ms ease;\n}\n.${c}:checked::after {\n  transform: rotate(45deg) scale(1);\n}\n`) +
      `.${c}:checked {\n  background: ${on};\n}\n.${c}:focus-visible {\n  outline: 3px solid ${on};\n  outline-offset: 2px;\n}\n.${c}:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n@media (prefers-reduced-motion: reduce) {\n  .${c}, .${c}::before, .${c}::after {\n    transition: none;\n  }\n}\n@media (forced-colors: active) {\n  .${c} {\n    border: 2px solid ButtonText;\n  }\n}\n`;
    const html = `<label>\n  <input type="checkbox" class="${c}"${sw ? ' role="switch"' : ''} />\n  ${esc(o.label)}\n</label>\n`;
    return { text: `<!-- HTML -->\n${html}\n/* CSS */\n${css}`, html: page(`label{display:inline-flex;align-items:center;gap:10px;font-size:16px}${css}`, html.replace('<input', '<input checked')) };
  },
});

/* ---------- 732 button ---------- */
T.push({
  id: 'css-button-generator', cat: CSSC, title: 'CSS Button Style Generator with Hover, Active and Focus States',
  desc: 'Design a button with padding, colours, border, radius, shadow and font, set separate hover and active colours, preview it live and copy the CSS.',
  inputs: 0, sample: '',
  opts: [X('bg', 'Background', '#2563eb'), X('fg', 'Text colour', '#ffffff'), X('bd', 'Border colour', '#2563eb'), N('bw', 'Border width (px)', 1), N('radius', 'Radius (px)', 8), N('py', 'Padding vertical (px)', 10), N('px', 'Padding horizontal (px)', 20), N('fs', 'Font size (px)', 16), N('fw', 'Font weight', 600),
    X('hbg', 'Hover background', '#1d4ed8'), X('abg', 'Active background', '#1e40af'), K('shadow', 'Drop shadow', true), K('lift', 'Lift 1px on hover', false), N('ms', 'Transition (ms)', 150), X('label', 'Preview label', 'Save changes'), X('cls', 'Class name', 'btn')],
  run: (_i, o) => {
    const n = (k, l) => { const v = need(o[k], l); if (v < 0) throw new Error(l + ' cannot be negative'); return v; };
    const c = cls(o.cls);
    const bg = cssColor(o.bg, 'Background'), fg = cssColor(o.fg, 'Text colour'), bd = cssColor(o.bd, 'Border colour'), hbg = cssColor(o.hbg, 'Hover background'), abg = cssColor(o.abg, 'Active background');
    const css = `.${c} {\n  display: inline-block;\n  padding: ${n('py', 'Padding')}px ${n('px', 'Padding')}px;\n  font: ${n('fw', 'Weight')} ${n('fs', 'Font size')}px/1.2 system-ui, sans-serif;\n  color: ${fg};\n  background: ${bg};\n  border: ${n('bw', 'Border')}px solid ${bd};\n  border-radius: ${n('radius', 'Radius')}px;\n${o.shadow ? '  box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);\n' : ''}  cursor: pointer;\n  transition: background ${n('ms', 'Transition')}ms, transform ${n('ms', 'Transition')}ms;\n}\n.${c}:hover {\n  background: ${hbg};\n${o.lift ? '  transform: translateY(-1px);\n' : ''}}\n.${c}:active {\n  background: ${abg};\n  transform: none;\n}\n.${c}:focus-visible {\n  outline: 3px solid ${bd};\n  outline-offset: 2px;\n}\n.${c}:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n@media (prefers-reduced-motion: reduce) {\n  .${c} {\n    transition: none;\n  }\n}\n`;
    return { text: `${css}\n<button type="button" class="${c}">${esc(o.label)}</button>\n`, html: page(css, `<button type="button" class="${c}">${esc(o.label)}</button> <button type="button" class="${c}" disabled>Disabled</button>`) };
  },
});

/* ---------- 736 CSS variables theme ---------- */
T.push({
  id: 'css-variables-theme-builder', cat: CSSC, title: 'CSS Custom Property Theme Builder with Dark Mode Overrides',
  desc: 'Turn lines of "name: light value | dark value" into a :root theme with a prefers-color-scheme dark block and optional data-theme override, with a live sample card.',
  labels: ['Tokens, one per line: name: light | dark'], placeholder: ['bg: #ffffff | #0f172a'],
  sample: 'bg: #ffffff | #0f172a\nfg: #111827 | #f1f5f9\nprimary: #2563eb | #60a5fa\nborder: #e5e7eb | #334155\nradius: 8px\nspace-3: 12px\nfont-body: system-ui, sans-serif',
  opts: [X('prefix', 'Prefix (optional)', ''), S('mode', 'Dark mode trigger', 'media + attribute', ['media', 'attribute', 'media + attribute']), X('attr', 'Attribute selector', '[data-theme="dark"]')],
  run: ([s], o) => {
    const light = [], dark = [];
    s.split('\n').forEach((ln, i) => {
      if (!ln.trim() || /^\s*(\/\/|\/\*|#\s)/.test(ln)) return;
      const m = /^\s*(?:--)?([A-Za-z][\w-]*)\s*:\s*(.+?)\s*;?\s*$/.exec(ln);
      if (!m) throw new Error(`Line ${i + 1}: use name: light value | dark value`);
      const [lv, dv] = m[2].split('|').map((x) => x.trim());
      if (/[{}<>]/.test(m[2])) throw new Error(`Line ${i + 1}: unexpected character in value`);
      const name = '--' + (o.prefix ? o.prefix.replace(/^--/, '').replace(/-$/, '') + '-' : '') + m[1];
      light.push(`  ${name}: ${lv};`);
      if (dv) dark.push(`  ${name}: ${dv};`);
    });
    if (!light.length) throw new Error('Add at least one token line');
    let out = `:root {\n${light.join('\n')}\n}\n`;
    const med = o.mode !== 'attribute', att = o.mode !== 'media';
    if (dark.length) {
      if (med) out += `\n@media (prefers-color-scheme: dark) {\n  :root${att ? ':not([data-theme="light"])' : ''} {\n${dark.map((d) => '  ' + d).join('\n')}\n  }\n}\n`;
      if (att) out += `\n:root${o.attr.trim() || '[data-theme="dark"]'} {\n${dark.join('\n')}\n}\n`;
    }
    const v = (n, fb) => `var(--${o.prefix ? o.prefix.replace(/^--/, '').replace(/-$/, '') + '-' : ''}${n}, ${fb})`;
    const prev = `body{background:${v('bg', '#fff')};color:${v('fg', '#111')};font-family:${v('font-body', 'system-ui')}}.card{border:1px solid ${v('border', '#ccc')};border-radius:${v('radius', '8px')};padding:${v('space-3', '12px')};max-width:260px}.b{background:${v('primary', '#26c')};color:${v('bg', '#fff')};border:0;border-radius:${v('radius', '8px')};padding:8px 14px;font:inherit}`;
    return { text: out, html: `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="color-scheme" content="light dark"><style>${out}${prev}</style><body style="margin:16px"><div class="card"><h3 style="margin-top:0">Sample card</h3><p>Text in the theme colours.</p><button class="b" type="button">Primary</button></div></body></html>` };
  },
});

/* ================= small HTML tree parser (shared by the HTML tools below) ================= */
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const OPT_END = new Set('p li td th tr thead tbody tfoot dt dd option optgroup colgroup html head body'.split(' '));
const BLOCK_IN_P = new Set('address article aside blockquote details div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr main menu nav ol p pre section table ul'.split(' '));
const AUTO_CLOSE = { li: ['li'], dt: ['dt', 'dd'], dd: ['dt', 'dd'], tr: ['tr', 'td', 'th'], td: ['td', 'th'], th: ['td', 'th'], option: ['option'], thead: ['tbody', 'tfoot'], tbody: ['tbody', 'tfoot', 'thead'], tfoot: ['tbody'] };
function lineAt(src, i) { let n = 1; for (let k = 0; k < i; k++) if (src.charCodeAt(k) === 10) n++; return n; }
function tokenize(src) {
  const toks = []; let i = 0; const L = src.length; let text = '', ts = 0;
  const flush = () => { if (text) toks.push({ k: 'text', v: text, at: ts }); text = ''; };
  while (i < L) {
    const c = src[i];
    if (c === '<') {
      if (src.startsWith('<!--', i)) { const e = src.indexOf('-->', i + 4); flush(); const end = e < 0 ? L : e + 3; toks.push({ k: 'comment', v: src.slice(i + 4, e < 0 ? L : e), at: i }); i = end; continue; }
      if (src[i + 1] === '!' || src[i + 1] === '?') { const e = src.indexOf('>', i); flush(); toks.push({ k: 'doctype', v: src.slice(i + 2, e < 0 ? L : e), at: i }); i = e < 0 ? L : e + 1; continue; }
      if (src[i + 1] === '/' && /[A-Za-z]/.test(src[i + 2] || '')) {
        const m = /^<\/([A-Za-z][^\s/>]*)[^>]*>?/.exec(src.slice(i, i + 200 + 0)) || /^<\/([A-Za-z][^\s/>]*)[^>]*>?/.exec(src.slice(i));
        flush(); toks.push({ k: 'end', tag: m[1].toLowerCase(), at: i }); i += m[0].length; continue;
      }
      if (/[A-Za-z]/.test(src[i + 1] || '')) {
        let j = i + 1; while (j < L && !/[\s/>]/.test(src[j])) j++;
        const tag = src.slice(i + 1, j).toLowerCase(), attrs = []; let self = false;
        for (;;) {
          while (j < L && /\s/.test(src[j])) j++;
          if (j >= L) break;
          if (src[j] === '>') { j++; break; }
          if (src[j] === '/' && src[j + 1] === '>') { self = true; j += 2; break; }
          if (src[j] === '/') { j++; continue; }
          let s = j; while (j < L && !/[\s=/>]/.test(src[j])) j++;
          const name = src.slice(s, j); let val = null;
          while (j < L && /\s/.test(src[j])) j++;
          if (src[j] === '=') {
            j++; while (j < L && /\s/.test(src[j])) j++;
            if (src[j] === '"' || src[j] === "'") { const q = src[j]; const e = src.indexOf(q, j + 1); val = src.slice(j + 1, e < 0 ? L : e); j = e < 0 ? L : e + 1; }
            else { s = j; while (j < L && !/[\s>]/.test(src[j])) j++; val = src.slice(s, j); }
          }
          if (name) attrs.push([name, val]);
        }
        flush(); const tk = { k: 'start', tag, attrs, self, at: i }; toks.push(tk); i = j;
        if (RAW.has(tag) && !self) {
          const re = new RegExp('</' + tag + '\\s*>', 'ig'); re.lastIndex = i; const m = re.exec(src);
          const e = m ? m.index : L; if (e > i) toks.push({ k: 'text', v: src.slice(i, e), at: i, raw: true });
          i = e;
        }
        continue;
      }
    }
    if (!text) ts = i; text += c; i++;
  }
  flush(); return toks;
}
// opts.xml: honour "/>" on every tag (MJML). Returns { root, issues } where issues are structural events for the validator.
function parseHtml(src, opts = {}) {
  const root = { t: 'root', children: [], tag: '#root' }, stack = [root], issues = [];
  const top = () => stack[stack.length - 1];
  const add = (n) => { n.parent = top(); top().children.push(n); return n; };
  const has = (tags) => stack.some((n) => tags.includes(n.tag));
  const popTo = (idx) => { stack.length = idx; };
  for (const tk of tokenize(src)) {
    const line = lineAt(src, tk.at);
    if (tk.k === 'text') add({ t: 'text', v: tk.v, raw: tk.raw, line });
    else if (tk.k === 'comment') add({ t: 'comment', v: tk.v, line });
    else if (tk.k === 'doctype') add({ t: 'doctype', v: tk.v, line });
    else if (tk.k === 'start') {
      const tag = tk.tag;
      if (!opts.xml) {
        for (;;) { // optional end tags closed by this start tag
          const t = top().tag;
          if (t === 'p' && BLOCK_IN_P.has(tag)) { issues.push({ line, kind: 'p-block', tag, from: top().line }); stack.pop(); continue; }
          if (AUTO_CLOSE[tag] && AUTO_CLOSE[tag].includes(t)) { if (tag === 'li' || tag === 'dt' || tag === 'dd' || tag === 'option' || tag === 'tr' || tag === 'td' || tag === 'th' || tag === 'thead' || tag === 'tbody' || tag === 'tfoot') { stack.pop(); continue; } }
          break;
        }
      }
      const el = add({ t: 'el', tag, attrs: tk.attrs, children: [], line });
      if (VOID.has(tag) && !opts.xml) { if (tk.self) el.slash = true; continue; }
      if (tk.self && opts.xml) continue;
      if (tk.self) { el.slash = true; issues.push({ line, kind: 'slash', tag }); }
      stack.push(el);
    } else if (tk.k === 'end') {
      const tag = tk.tag;
      if (VOID.has(tag) && !opts.xml) { issues.push({ line, kind: 'void-end', tag }); continue; }
      let k = stack.length - 1; while (k > 0 && stack[k].tag !== tag) k--;
      if (k === 0) { issues.push({ line, kind: 'stray', tag }); if (tag === 'p') add({ t: 'el', tag: 'p', attrs: [], children: [], line }); continue; }
      for (let j = stack.length - 1; j > k; j--) if (!OPT_END.has(stack[j].tag)) issues.push({ line, kind: 'unclosed', tag: stack[j].tag, from: stack[j].line, by: tag });
      popTo(k);
    }
  }
  for (let j = stack.length - 1; j > 0; j--) if (!OPT_END.has(stack[j].tag)) issues.push({ line: stack[j].line, kind: 'eof', tag: stack[j].tag });
  return { root, issues };
}
const attr = (el, n) => { const a = el.attrs.find((x) => x[0].toLowerCase() === n); return a ? (a[1] ?? '') : null; };
function ser(n, o = {}) {
  if (n.t === 'text') return n.v;
  if (n.t === 'comment') return `<!--${n.v}-->`;
  if (n.t === 'doctype') return `<!${n.v}>`;
  if (n.t === 'root') return n.children.map((c) => ser(c, o)).join('');
  const a = n.attrs.map(([k, v]) => (v == null ? ' ' + k : ` ${k}="${v.replace(/"/g, '&quot;')}"`)).join('');
  if (VOID.has(n.tag) && !o.xml) return `<${n.tag}${a}>`;
  return `<${n.tag}${a}>${n.children.map((c) => ser(c, o)).join('')}</${n.tag}>`;
}
const els = (n) => n.children.filter((c) => c.t === 'el');
function walk(n, f) { if (n.t === 'el' || n.t === 'root') { if (n.t === 'el') f(n); for (const c of n.children) walk(c, f); } }
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', colon: ':', Tab: '\t', NewLine: '\n', lpar: '(', rpar: ')' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[A-Za-z]+);?/gi, (m, e) => { if (e[0] === '#') { const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : '\ufffd'; } return Object.hasOwn(NAMED, e) ? NAMED[e] : m; });

/* ---------- 738 HTML validator ---------- */
const HTML_TAGS = new Set('a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option output p param picture pre progress q rp rt ruby s samp script search section select slot small source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var video wbr svg math'.split(' '));
const OBSOLETE = new Set('acronym applet basefont bgsound big blink center dir font frame frameset isindex keygen listing marquee menuitem nobr noembed noframes plaintext rb rtc spacer strike tt xmp'.split(' '));
T.push({
  id: 'html-validator', cat: 'Markup Converters', title: 'HTML Validator: Unclosed Tags, Bad Nesting and Duplicate IDs',
  desc: 'Paste HTML and get a list with line numbers: unclosed or stray tags, block elements inside p, nested links, list and table structure, duplicate ids and attributes, obsolete tags and missing basics.',
  labels: ['HTML'], placeholder: ['<!doctype html>...'],
  sample: '<!doctype html>\n<html>\n<head><title>Demo</title></head>\n<body>\n<p>Intro <div>block in a paragraph</div></p>\n<ul><li>One</li><span>stray</span></ul>\n<a href="/a">outer <a href="/b">inner</a></a>\n<img src="x.png">\n<div id="x"><b>bold</div>\n<font color="red">old</font>\n<p id="x">dupe</p>\n</body>\n</html>',
  run: ([s]) => {
    if (!s.trim()) throw new Error('Paste some HTML first');
    const { root, issues } = parseHtml(s), out = [];
    const add = (line, sev, msg) => out.push({ line, sev, msg });
    for (const q of issues) {
      if (q.kind === 'p-block') add(q.line, 'review', `<${q.tag}> is not allowed inside <p>; the browser closes the <p> (line ${q.from}) first, so the tree differs from what you wrote.`);
      else if (q.kind === 'stray' && q.tag === 'p') add(q.line, 'review', 'End tag </p> with no open <p>; browsers insert an empty paragraph here.');
      else if (q.kind === 'stray') add(q.line, 'error', `Stray end tag </${q.tag}> with no matching open tag.`);
      else if (q.kind === 'unclosed') add(q.from, 'error', `<${q.tag}> opened here is never closed before </${q.by}> (line ${q.line}).`);
      else if (q.kind === 'eof') add(q.line, 'error', `<${q.tag}> opened here is never closed.`);
      else if (q.kind === 'void-end') add(q.line, 'error', `</${q.tag}> is an end tag for a void element; <${q.tag}> has no closing tag.`);
      else if (q.kind === 'slash') add(q.line, 'review', `<${q.tag} /> self-closing syntax is ignored on non-void elements; write <${q.tag}></${q.tag}>.`);
    }
    const ids = new Map(); let sawDoctype = false, sawHtml = null, title = false, h1 = 0;
    const kids = (e) => els(e).map((c) => c.tag);
    for (const c of root.children) if (c.t === 'doctype' && /^doctype/i.test(c.v)) sawDoctype = true;
    walk(root, (e) => {
      const t = e.tag, par = e.parent && e.parent.tag, seen = new Set();
      for (const [k] of e.attrs) { const lk = k.toLowerCase(); if (seen.has(lk)) add(e.line, 'error', `Duplicate attribute "${lk}" on <${t}>.`); seen.add(lk); }
      const id = attr(e, 'id');
      if (id !== null) { if (/\s/.test(id) || id === '') add(e.line, 'error', 'id must be non-empty and contain no spaces.'); else if (ids.has(id)) add(e.line, 'error', `Duplicate id "${id}" (first used on line ${ids.get(id)}).`); else ids.set(id, e.line); }
      if (!HTML_TAGS.has(t) && !t.includes('-') && !OBSOLETE.has(t)) add(e.line, 'review', `<${t}> is not a known HTML element.`);
      if (OBSOLETE.has(t)) add(e.line, 'review', `<${t}> is obsolete in HTML; use CSS or a current element.`);
      const anc = (names) => { for (let p = e.parent; p && p.t === 'el'; p = p.parent) if (names.includes(p.tag)) return p; return null; };
      if (t === 'a' && anc(['a'])) add(e.line, 'error', '<a> inside another <a> is not allowed.');
      if (t === 'button' && anc(['button'])) add(e.line, 'error', '<button> inside another <button> is not allowed.');
      if (t === 'form' && anc(['form'])) add(e.line, 'error', '<form> inside another <form> is not allowed.');
      if ((t === 'a' && anc(['button'])) || (t === 'button' && anc(['a'])) ) add(e.line, 'review', 'Interactive element (link or button) inside another one.');
      if (t === 'li' && !['ul', 'ol', 'menu'].includes(par)) add(e.line, 'error', '<li> must be inside <ul>, <ol> or <menu>.');
      if ((t === 'dt' || t === 'dd') && !['dl', 'div'].includes(par)) add(e.line, 'error', `<${t}> must be inside <dl>.`);
      if ((t === 'td' || t === 'th') && par !== 'tr') add(e.line, 'error', `<${t}> must be inside <tr>.`);
      if (t === 'tr' && !['table', 'thead', 'tbody', 'tfoot'].includes(par)) add(e.line, 'error', '<tr> must be inside <table>, <thead>, <tbody> or <tfoot>.');
      if (t === 'tr' && par === 'table') add(e.line, 'review', '<tr> directly in <table>: browsers add a <tbody>; add it yourself to be explicit.');
      if (t === 'option' && !['select', 'optgroup', 'datalist'].includes(par)) add(e.line, 'error', '<option> must be inside <select>, <optgroup> or <datalist>.');
      if (t === 'figcaption' && par !== 'figure') add(e.line, 'review', '<figcaption> should be a child of <figure>.');
      if (['ul', 'ol'].includes(t)) for (const c of e.children) if (c.t === 'el' && !['li', 'script', 'template'].includes(c.tag)) add(c.line, 'error', `<${c.tag}> is not allowed directly inside <${t}>; only <li> is.`);
      if (t === 'table') for (const c of kids(e)) if (!['caption', 'colgroup', 'thead', 'tbody', 'tfoot', 'tr', 'script', 'template'].includes(c)) add(e.line, 'error', `<${c}> is not allowed directly inside <table>.`);
      if (t === 'img' && attr(e, 'alt') === null) add(e.line, 'review', '<img> has no alt attribute (use alt="" for decorative images).');
      if (t === 'html') sawHtml = e;
      if (t === 'title') title = true;
      if (t === 'h1') h1++;
      if (t === 'label' && attr(e, 'for') !== null && attr(e, 'for') === '') add(e.line, 'error', 'label for="" is empty.');
    });
    if (/<html[\s>]/i.test(s)) {
      if (!sawDoctype) add(1, 'review', 'No <!doctype html>; browsers fall back to quirks mode.');
      if (sawHtml && attr(sawHtml, 'lang') === null) add(sawHtml.line, 'review', '<html> has no lang attribute.');
      if (!title) add(1, 'review', 'No <title> element.');
    }
    if (h1 > 1) add(1, 'review', `${h1} <h1> elements found; usually one per page is clearer.`);
    out.sort((a, b) => a.line - b.line);
    const errs = out.filter((x) => x.sev === 'error').length;
    return `${errs} error${errs === 1 ? '' : 's'}, ${out.length - errs} to review\n\n` + (out.length ? out.map((x) => `line ${x.line}  ${x.sev.padEnd(6)}  ${x.msg}`).join('\n') : 'No problems found by these checks.') +
      '\n\nThis is a rule-based check of common mistakes, not a full HTML Living Standard validator. Attribute values, ARIA and content-model details are not checked; use the W3C validator for a formal result.';
  },
});

/* ---------- 740 HTML to Pug ---------- */
function pugAttrVal(v) {
  v = decode(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
  return v.includes('"') && !v.includes("'") ? `'${v}'` : `"${v.replace(/"/g, '\\"')}"`;
}
function toPug(root, ind) {
  const lines = [];
  const pad = (d) => ind.repeat(d);
  const txt = (s) => s.replace(/#(?=[{[])/g, '\\#');
  const emit = (n, d) => {
    if (n.t === 'doctype') { lines.push(pad(d) + (/^doctype html$/i.test(n.v.trim()) ? 'doctype html' : 'doctype ' + n.v.replace(/^doctype\s*/i, ''))); return; }
    if (n.t === 'comment') { const v = n.v.trim(); if (v.includes('\n')) { lines.push(pad(d) + '//'); v.split('\n').forEach((l) => lines.push(pad(d + 1) + l.trim())); } else lines.push(pad(d) + '// ' + v); return; }
    if (n.t === 'text') { n.v.split('\n').forEach((l, i, a) => { const t = l.replace(/\s+/g, ' '); if (t.trim()) lines.push(pad(d) + '| ' + txt(t.replace(/^ /, i === 0 ? ' ' : '').replace(/ $/, i === a.length - 1 ? ' ' : ''))); }); return; }
    const id = attr(n, 'id'), cl = attr(n, 'class'), parts = [];
    const sc = (x) => /^[A-Za-z_][\w-]*$/.test(x);
    const useId = id !== null && sc(id), useCl = cl !== null && cl.trim() && cl.trim().split(/\s+/).every(sc);
    const rest = n.attrs.filter(([k]) => !((k === 'id' && useId) || (k === 'class' && useCl)));
    let head = n.tag === 'div' && (useId || useCl) ? '' : n.tag;
    if (useId) head += '#' + id;
    if (useCl) head += cl.trim().split(/\s+/).map((c) => '.' + c).join('');
    for (const [k, v] of rest) parts.push(v == null ? k : `${/^[\w:@.-]+$/.test(k) ? k : JSON.stringify(k)}=${pugAttrVal(v)}`);
    if (!head) head = 'div';
    const a = parts.length ? `(${parts.join(' ')})` : '';
    const kids = n.children.filter((c) => !(c.t === 'text' && !c.v.trim()));
    if (n.tag === 'script' || n.tag === 'style' || n.tag === 'pre' && kids.every((c) => c.t === 'text')) {
      const body = kids.map((c) => c.v).join('').replace(/^\n/, '').replace(/\s+$/, '');
      if (!body) { lines.push(pad(d) + head + a); return; }
      lines.push(pad(d) + head + a + '.'); const bl = body.split('\n'), mi = Math.min(...bl.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)[0].length)); bl.forEach((l) => lines.push(pad(d + 1) + l.slice(mi))); return;
    }
    if (!kids.length) { lines.push(pad(d) + head + a); return; }
    if (kids.length === 1 && kids[0].t === 'text' && !kids[0].v.includes('\n')) { lines.push(pad(d) + head + a + ' ' + txt(kids[0].v.trim())); return; }
    lines.push(pad(d) + head + a);
    for (const c of n.children) { if (c.t === 'text' && !c.v.trim()) continue; emit(c, d + 1); }
  };
  for (const c of root.children) if (!(c.t === 'text' && !c.v.trim())) emit(c, 0);
  return lines.join('\n') + '\n';
}
T.push({
  id: 'html-to-pug', cat: 'Markup Converters', title: 'HTML to Pug Converter (Indented Template Syntax)',
  desc: 'Convert HTML markup into Pug (Jade) templates: tag names with #id and .class shorthand, attribute lists, piped text, comments, doctype and dot blocks for script and style.',
  labels: ['HTML'], placeholder: ['<div class="card"><h1>Title</h1></div>'],
  opts: [S('indent', 'Indent', '2 spaces', ['2 spaces', '4 spaces', 'tab'])],
  sample: '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>Pug demo</title>\n  <style>\n    body { margin: 0 }\n  </style>\n</head>\n<body>\n  <div class="card wide" id="main">\n    <h1>Hello <b>world</b>!</h1>\n    <a href="/docs" target="_blank" class="md:flex">Docs</a>\n    <input type="checkbox" checked disabled>\n    <!-- a comment -->\n    <ul><li>One</li><li>Two</li></ul>\n  </div>\n</body>\n</html>',
  run: ([s], o) => {
    if (!s.trim()) throw new Error('Paste some HTML first');
    const { root } = parseHtml(s);
    return toPug(root, o.indent === 'tab' ? '\t' : o.indent === '4 spaces' ? '    ' : '  ');
  },
});

/* ---------- 744 HTML sanitizer ---------- */
const SAN_TAGS = new Set('a abbr b blockquote br caption cite code col colgroup dd del details div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img ins kbd li mark ol p pre q s samp small span strong sub summary sup table tbody td tfoot th thead tr u ul'.split(' '));
const SAN_DROP = new Set('script style iframe object embed noscript template textarea title svg math select option frameset frame applet audio video canvas head'.split(' '));
const SAN_ATTR = { '*': ['class', 'title', 'lang', 'dir'], a: ['href', 'rel', 'target', 'hreflang'], img: ['src', 'alt', 'width', 'height', 'loading'], td: ['colspan', 'rowspan', 'headers'], th: ['colspan', 'rowspan', 'scope', 'headers', 'abbr'], ol: ['start', 'type', 'reversed'], q: ['cite'], blockquote: ['cite'], del: ['cite', 'datetime'], ins: ['cite', 'datetime'], col: ['span'], colgroup: ['span'], details: ['open'] };
const INVIS = new RegExp('[\\u0000-\\u0020\\u007f-\\u009f\\u200b-\\u200f\\u2028\\u2029\\ufeff]', 'g');
function sanitizeHtml(src, o) {
  const { root } = parseHtml(src), removed = [], out = [];
  const note = (line, m) => removed.push(`line ${line}: ${m}`);
  const okUrl = (v, img) => {
    const u = decode(v).replace(INVIS, '');
    const m = /^([a-z][a-z0-9+.-]*):/i.exec(u);
    if (!m) return true; // relative or protocol-relative
    const sc = m[1].toLowerCase();
    if (['http', 'https'].includes(sc)) return true;
    if (!img && ['mailto', 'tel'].includes(sc)) return true;
    if (img && o.dataimg && /^data:image\/(png|jpe?g|gif|webp|avif);/i.test(u)) return true;
    return false;
  };
  const text = (v) => v.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const emit = (n) => {
    if (n.t === 'text') { out.push(text(n.v)); return; }
    if (n.t === 'comment') { note(n.line, 'comment removed'); return; }
    if (n.t === 'doctype') return;
    if (n.t !== 'el') return;
    const t = n.tag;
    if (SAN_DROP.has(t)) { note(n.line, `<${t}> removed with its content`); return; }
    if (!SAN_TAGS.has(t)) { note(n.line, `<${t}> removed, content kept`); n.children.forEach(emit); return; }
    const keep = [];
    for (const [k0, v0] of n.attrs) {
      const k = k0.toLowerCase(), v = v0 == null ? '' : decode(v0);
      if (/^on/.test(k)) { note(n.line, `${k0} on <${t}> removed (event handler)`); continue; }
      if (k === 'style') { note(n.line, `style on <${t}> removed`); continue; }
      if (k === 'id' && !o.ids) { note(n.line, `id on <${t}> removed`); continue; }
      if (k === 'id' || (SAN_ATTR['*'].includes(k)) || (SAN_ATTR[t] || []).includes(k)) {
        if ((k === 'href' || k === 'src' || k === 'cite') && !okUrl(v, t === 'img')) { note(n.line, `${k0} on <${t}> removed (unsafe URL scheme)`); continue; }
        if (k === 'target' && !['_blank', '_self'].includes(v)) continue;
        if (k === 'id' && !/^[A-Za-z][\w:.-]*$/.test(v)) { note(n.line, 'id with odd characters removed'); continue; }
        keep.push([k, v]);
      } else note(n.line, `${k0} on <${t}> removed (not in the allow-list)`);
    }
    if (t === 'a' && keep.some(([k, v]) => k === 'target' && v === '_blank')) { const r = keep.find(([k]) => k === 'rel'); const need = ['noopener', 'noreferrer']; if (r) { need.forEach((x) => { if (!r[1].split(/\s+/).includes(x)) r[1] += ' ' + x; }); } else keep.push(['rel', 'noopener noreferrer']); }
    if (t === 'img' && !keep.some(([k]) => k === 'src')) { note(n.line, '<img> without a safe src removed'); return; }
    const a = keep.map(([k, v]) => ` ${k}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`).join('');
    if (VOID.has(t)) { out.push(`<${t}${a}>`); return; }
    out.push(`<${t}${a}>`); n.children.forEach(emit); out.push(`</${t}>`);
  };
  root.children.forEach(emit);
  return { html: out.join(''), removed };
}
T.push({
  id: 'html-sanitizer', cat: 'Markup Converters', title: 'HTML Sanitizer: Strip Scripts, Event Handlers and Unsafe URLs',
  desc: 'Clean untrusted HTML with a strict allow-list: scripts, styles, forms, event handlers and javascript: URLs are removed, and every removal is listed with its line number.',
  labels: ['Untrusted HTML'], placeholder: ['<p onclick="x()">Hi</p><script>alert(1)</script>'],
  opts: [K('ids', 'Keep id attributes', false), K('dataimg', 'Allow data: image URLs on <img>', false)],
  sample: '<h2 onmouseover="steal()">Comment</h2>\n<p>Nice post! <a href="javascript:alert(1)">click</a> <a href="https://example.com" target="_blank">site</a></p>\n<img src="x.png" onerror="alert(2)" alt="pic">\n<script>document.location="//evil.test"</script>\n<iframe src="https://evil.test"></iframe>\n<form action="/x"><input name="a"></form>\n<div style="position:fixed;top:0">overlay</div>\n<!-- hidden -->\n<a href="&#106;avascript:alert(3)">entity trick</a>',
  run: ([s], o) => {
    if (!s.trim()) throw new Error('Paste some HTML first');
    const { html, removed } = sanitizeHtml(s, o);
    return `${html}\n\n--- ${removed.length} change${removed.length === 1 ? '' : 's'} ---\n${removed.join('\n') || 'Nothing had to be removed.'}\n\nThis is a hand-written allow-list sanitizer: it rebuilds the markup from a parsed tree and writes only allowed tags and attributes, with every value escaped. It is not DOMPurify and has had no third-party security review. For production use on a server or in an app, use a maintained library and a Content-Security-Policy as well.`;
  },
});

/* ---------- 757 HTML DOM diff ---------- */
const nsig = (e) => e.tag + (attr(e, 'id') ? '#' + attr(e, 'id') : '');
const normT = (s) => decode(s).replace(/\s+/g, ' ').trim();
function kidsOf(e) { return e.children.filter((c) => (c.t === 'el') || (c.t === 'text' && normT(c.v))); }
function path(e) { const p = []; for (let n = e; n && n.t === 'el'; n = n.parent) { const sib = els(n.parent).filter((x) => x.tag === n.tag); p.unshift(n.tag + (attr(n, 'id') ? '#' + attr(n, 'id') : sib.length > 1 ? `[${sib.indexOf(n) + 1}]` : '')); } return p.join(' > '); }
function diffNodes(a, b, out, opt) {
  const A = kidsOf(a), B = kidsOf(b), key = (n) => (n.t === 'el' ? nsig(n) : '#text');
  const m = A.length, n = B.length, dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = key(A[i]) === key(B[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0; const where = a.t === 'root' ? '(document)' : path(a);
  while (i < m || j < n) {
    if (i < m && j < n && key(A[i]) === key(B[j])) {
      const x = A[i], y = B[j];
      if (x.t === 'text') { if (normT(x.v) !== normT(y.v)) out.push({ k: '~', m: `${where}: text "${cut(normT(x.v))}" -> "${cut(normT(y.v))}"` }); }
      else {
        const am = new Map(x.attrs.map(([k, v]) => [k.toLowerCase(), v ?? ''])), bm = new Map(y.attrs.map(([k, v]) => [k.toLowerCase(), v ?? '']));
        const norm = (k, v) => (k === 'class' && opt.cls ? v.split(/\s+/).filter(Boolean).sort().join(' ') : v.trim());
        for (const [k, v] of am) { if (!bm.has(k)) out.push({ k: '-', m: `${path(x)}: attribute ${k}="${cut(v)}" removed` }); else if (norm(k, v) !== norm(k, bm.get(k))) out.push({ k: '~', m: `${path(x)}: ${k} "${cut(v)}" -> "${cut(bm.get(k))}"` }); }
        for (const [k, v] of bm) if (!am.has(k)) out.push({ k: '+', m: `${path(y)}: attribute ${k}="${cut(v)}" added` });
        diffNodes(x, y, out, opt);
      }
      i++; j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) { out.push({ k: '+', m: `${where}: ${B[j].t === 'el' ? '<' + nsig(B[j]) + '> added' : 'text "' + cut(normT(B[j].v)) + '" added'}` }); j++; }
    else { out.push({ k: '-', m: `${where}: ${A[i].t === 'el' ? '<' + nsig(A[i]) + '> removed' : 'text "' + cut(normT(A[i].v)) + '" removed'}` }); i++; }
  }
}
const cut = (s) => (s.length > 60 ? s.slice(0, 57) + '...' : s);
T.push({
  id: 'html-dom-diff', cat: 'Markup Converters', title: 'HTML DOM Diff: Compare Two Pages by Elements, Attributes and Text',
  desc: 'Compare two HTML documents as trees, ignoring formatting and whitespace. See added, removed and changed elements, attributes and text with their element path.',
  inputs: 2, labels: ['HTML A (before)', 'HTML B (after)'],
  opts: [K('cls', 'Ignore class order', true), K('comments', 'Ignore comments', true)],
  sample: '<div id="app" class="a b">\n  <h1>Title</h1>\n  <p>Hello world</p>\n  <a href="/old">Link</a>\n</div>',
  sample2: '<div id="app" class="b a">\n<h1>Title</h1>\n<p class="lead">Hello there</p>\n<a href="/new">Link</a>\n<footer>Bye</footer></div>',
  run: ([a, b], o) => {
    if (!a.trim() || !b.trim()) throw new Error('Paste HTML into both boxes');
    const out = []; diffNodes(parseHtml(a).root, parseHtml(b).root, out, o);
    const sym = { '+': 'added  ', '-': 'removed', '~': 'changed' };
    const html = page('li{margin:3px 0;list-style:none;font:13px ui-monospace,monospace}.p{color:#166534;background:#dcfce7}.m{color:#991b1b;background:#fee2e2}.c{color:#854d0e;background:#fef9c3}ul{padding:0}', `<ul>${out.map((x) => `<li class="${x.k === '+' ? 'p' : x.k === '-' ? 'm' : 'c'}">${sym[x.k]} ${esc(x.m)}</li>`).join('') || '<li>No differences</li>'}</ul>`);
    return { text: out.length ? `${out.length} difference${out.length === 1 ? '' : 's'}\n\n` + out.map((x) => `${x.k} ${x.m}`).join('\n') : 'No structural differences (whitespace and formatting ignored).', html };
  },
});

/* ---------- 758 Email CSS inliner ---------- */
function splitTop(s, ch) { const r = []; let d = 0, q = '', cur = ''; for (const c of s) { if (q) { if (c === q) q = ''; cur += c; continue; } if (c === '"' || c === "'") { q = c; cur += c; continue; } if (c === '(' || c === '[') d++; if (c === ')' || c === ']') d--; if (c === ch && d === 0) { r.push(cur); cur = ''; } else cur += c; } r.push(cur); return r; }
function parseCss(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, ''); const rules = [], keep = []; let i = 0;
  while (i < css.length) {
    while (/\s/.test(css[i] || '')) i++;
    if (i >= css.length) break;
    const b = css.indexOf('{', i), sc = css.indexOf(';', i);
    if (css[i] === '@' && (sc >= 0 && (b < 0 || sc < b))) { const s = css.slice(i, sc + 1); if (!/^@charset/i.test(s)) keep.push(s); i = sc + 1; continue; }
    if (b < 0) break;
    let d = 1, j = b + 1; while (j < css.length && d) { if (css[j] === '{') d++; else if (css[j] === '}') d--; j++; }
    const sel = css.slice(i, b).trim(), body = css.slice(b + 1, j - 1);
    if (sel[0] === '@') keep.push(`${sel} {${body}}`); else rules.push({ sel, decls: splitTop(body, ';').map((x) => x.trim()).filter(Boolean).map((x) => { const k = x.indexOf(':'); const v = x.slice(k + 1).trim(); const imp = /!\s*important\s*$/i.test(v); return { p: x.slice(0, k).trim().toLowerCase(), v: v.replace(/\s*!\s*important\s*$/i, ''), imp }; }).filter((d) => d.p) });
    i = j;
  }
  return { rules, keep };
}
function parseSel(str) { // returns null when unsupported
  const parts = []; let comb = ' ', i = 0; str = str.trim();
  const re = /\s*([>+~])\s*|\s+/y;
  while (i < str.length) {
    const comp = { tag: null, ids: [], cls: [], attrs: [], pseudo: [], not: [] }; let any = false;
    for (;;) {
      let m;
      if ((m = /^\*/.exec(str.slice(i)))) { i += 1; any = true; }
      else if ((m = /^[A-Za-z][\w-]*/.exec(str.slice(i)))) { comp.tag = m[0].toLowerCase(); i += m[0].length; any = true; }
      else if ((m = /^#([\w-]+)/.exec(str.slice(i)))) { comp.ids.push(m[1]); i += m[0].length; any = true; }
      else if ((m = /^\.([\w-]+)/.exec(str.slice(i)))) { comp.cls.push(m[1]); i += m[0].length; any = true; }
      else if ((m = /^\[\s*([\w-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]/.exec(str.slice(i)))) { comp.attrs.push([m[1].toLowerCase(), m[2] || null, m[3] ?? m[4] ?? m[5] ?? '']); i += m[0].length; any = true; }
      else if ((m = /^:(first-child|last-child|only-child|empty)\b/.exec(str.slice(i)))) { comp.pseudo.push(m[1]); i += m[0].length; any = true; }
      else if ((m = /^:nth-child\(\s*(odd|even|[+-]?\d*n?\s*(?:[+-]\s*\d+)?)\s*\)/.exec(str.slice(i)))) { comp.pseudo.push('nth:' + m[1].replace(/\s+/g, '')); i += m[0].length; any = true; }
      else if ((m = /^:not\(([^()]*)\)/.exec(str.slice(i)))) { const inner = parseSel(m[1]); if (!inner || inner.length !== 1) return null; comp.not.push(inner[0].comp); i += m[0].length; any = true; }
      else break;
    }
    if (!any) return null;
    parts.push({ comb, comp });
    if (i >= str.length) break;
    re.lastIndex = i; const m = re.exec(str); if (!m) return null; comb = m[1] || ' '; i = re.lastIndex;
    if (i >= str.length) return null;
  }
  return parts.length ? parts : null;
}
const specOf = (parts) => parts.reduce((s, { comp }) => { const f = (c) => [c.ids.length, c.cls.length + c.attrs.length + c.pseudo.length, c.tag ? 1 : 0]; let [a, b, c] = f(comp); for (const n of comp.not) { const g = f(n); a += g[0]; b += g[1]; c += g[2]; } return [s[0] + a, s[1] + b, s[2] + c]; }, [0, 0, 0]);
function nthOk(expr, idx) { // idx is 1-based
  if (expr === 'odd') return idx % 2 === 1; if (expr === 'even') return idx % 2 === 0;
  const m = /^([+-]?\d*)n([+-]\d+)?$/.exec(expr);
  if (!m) return idx === parseInt(expr, 10);
  const a = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : parseInt(m[1], 10), b = m[2] ? parseInt(m[2], 10) : 0;
  if (a === 0) return idx === b; return (idx - b) / a >= 0 && Number.isInteger((idx - b) / a);
}
function compMatch(e, c) {
  if (c.tag && e.tag !== c.tag) return false;
  if (c.ids.some((x) => attr(e, 'id') !== x)) return false;
  const cl = (attr(e, 'class') || '').split(/\s+/);
  if (c.cls.some((x) => !cl.includes(x))) return false;
  for (const [k, op, v] of c.attrs) { const a = attr(e, k); if (a === null) return false; if (op === '=' && a !== v) return false; if (op === '~=' && !a.split(/\s+/).includes(v)) return false; if (op === '^=' && !a.startsWith(v)) return false; if (op === '$=' && !a.endsWith(v)) return false; if (op === '*=' && !a.includes(v)) return false; if (op === '|=' && !(a === v || a.startsWith(v + '-'))) return false; }
  const sib = e.parent ? els(e.parent) : [e], idx = sib.indexOf(e) + 1;
  for (const p of c.pseudo) { if (p === 'first-child' && idx !== 1) return false; if (p === 'last-child' && idx !== sib.length) return false; if (p === 'only-child' && sib.length !== 1) return false; if (p === 'empty' && e.children.length) return false; if (p.startsWith('nth:') && !nthOk(p.slice(4), idx)) return false; }
  return !c.not.some((n) => compMatch(e, n));
}
function selMatch(e, parts, k = parts.length - 1) {
  if (!compMatch(e, parts[k].comp)) return false;
  if (k === 0) return true;
  const comb = parts[k].comb;
  if (comb === '>') return e.parent && e.parent.t === 'el' && selMatch(e.parent, parts, k - 1);
  if (comb === ' ') { for (let p = e.parent; p && p.t === 'el'; p = p.parent) if (selMatch(p, parts, k - 1)) return true; return false; }
  const sib = e.parent ? els(e.parent) : [], idx = sib.indexOf(e);
  if (comb === '+') return idx > 0 && selMatch(sib[idx - 1], parts, k - 1);
  for (let q = idx - 1; q >= 0; q--) if (selMatch(sib[q], parts, k - 1)) return true; return false;
}
function inlineCss(html, o) {
  const { root } = parseHtml(html), styles = [];
  walk(root, (e) => { if (e.tag === 'style' && !attr(e, 'media') && !/^\s*$/.test(e.children.map((c) => c.v || '').join(''))) styles.push(e); });
  if (!styles.length) throw new Error('No <style> block found in the HTML');
  const kept = [], cand = []; let order = 0, inlined = 0;
  for (const st of styles) {
    const { rules, keep } = parseCss(st.children.map((c) => c.v || '').join(''));
    kept.push(...keep);
    for (const r of rules) {
      const left = [];
      for (const s of splitTop(r.sel, ',')) { const parts = parseSel(s); if (!parts) { left.push(s.trim()); continue; } cand.push({ parts, spec: specOf(parts), order: order++, decls: r.decls }); }
      if (left.length) kept.push(`${left.join(', ')} {${r.decls.map((d) => `${d.p}: ${d.v}${d.imp ? ' !important' : ''}`).join('; ')}}`);
    }
  }
  const cmp = (a, b) => a.spec[0] - b.spec[0] || a.spec[1] - b.spec[1] || a.spec[2] - b.spec[2] || a.order - b.order;
  cand.sort(cmp);
  walk(root, (e) => {
    if (['style', 'script', 'head', 'title', 'meta', 'link', 'html'].includes(e.tag)) return;
    const map = new Map();
    for (const c of cand) if (selMatch(e, c.parts)) for (const d of c.decls) { const old = map.get(d.p); if (!old || d.imp || !old.imp) map.set(d.p, { v: d.v, imp: d.imp }); }
    if (!map.size) return;
    const cur = attr(e, 'style');
    if (cur) for (const x of splitTop(cur, ';').map((z) => z.trim()).filter(Boolean)) { const k = x.indexOf(':'); const p = x.slice(0, k).trim().toLowerCase(); const old = map.get(p); if (!old || !old.imp) map.set(p, { v: x.slice(k + 1).trim(), imp: false }); }
    const val = [...map].map(([p, d]) => `${p}: ${d.v}${d.imp ? ' !important' : ''}`).join('; ') + ';';
    const a = e.attrs.find(([k]) => k.toLowerCase() === 'style'); if (a) a[1] = val; else e.attrs.push(['style', val]);
    inlined++;
  });
  for (const st of styles) { const p = st.parent; p.children.splice(p.children.indexOf(st), 1); }
  let out = ser(root);
  if (kept.length) {
    const block = `<style>\n${kept.join('\n')}\n</style>`;
    out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, block + '\n</head>') : block + '\n' + out;
  }
  return { out, inlined, kept: kept.length };
}
T.push({
  id: 'email-css-inliner', cat: 'Markup Converters', title: 'Email HTML CSS Inliner (style Blocks to style Attributes)',
  desc: 'Move CSS rules from style blocks onto each matching element as inline style attributes for HTML email, keeping media queries and pseudo-class rules in a style block.',
  labels: ['HTML with a <style> block'], placeholder: ['<style>p{color:red}</style><p>Hi</p>'],
  sample: '<html><head><style>\n  body { margin: 0; }\n  .card { background: #f4f4f4; padding: 16px }\n  .card p { color: #333; font-size: 14px }\n  p.lead { font-weight: bold !important }\n  a:hover { color: red }\n  li:first-child { color: green }\n  @media (max-width: 480px) { .card { padding: 8px } }\n</style></head>\n<body>\n<div class="card"><p class="lead" style="font-weight: normal">Hello</p>\n<ul><li>One</li><li>Two</li></ul><a href="#">Link</a></div>\n</body></html>',
  run: ([s]) => {
    if (!s.trim()) throw new Error('Paste HTML first');
    const r = inlineCss(s);
    return `<!-- ${r.inlined} element${r.inlined === 1 ? '' : 's'} got inline styles; ${r.kept} rule${r.kept === 1 ? '' : 's'} kept in a style block (media queries, :hover and other pseudo rules cannot be inlined) -->\n${r.out}`;
  },
});

/* ---------- 760 iframe embed builder ---------- */
T.push({
  id: 'iframe-embed-builder', cat: 'Markup Converters', title: 'Responsive iframe Embed Code Builder (aspect-ratio, lazy, sandbox)',
  desc: 'Build iframe markup that scales to its container: aspect ratio, title, lazy loading, allowfullscreen, referrer policy and a sandbox preset, with a CSS fallback for old browsers.',
  labels: ['Embed URL (https)'], placeholder: ['https://www.youtube-nocookie.com/embed/VIDEO_ID'], sample: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  opts: [X('title', 'Title (describes the content, needed for screen readers)', 'Embedded video player'), S('ratio', 'Aspect ratio', '16:9', ['16:9', '4:3', '1:1', '21:9', '3:2', '9:16', 'custom']), X('custom', 'Custom ratio (w:h)', '5:4'), K('lazy', 'loading="lazy"', true), K('fs', 'allowfullscreen', true), S('sandbox', 'sandbox', 'none (no sandbox attribute)', ['none (no sandbox attribute)', 'scripts + same-origin (typical video or widget)', 'scripts only (no same-origin)', 'fully locked down']),
    S('ref', 'referrerpolicy', 'strict-origin-when-cross-origin', ['strict-origin-when-cross-origin', 'no-referrer', 'origin', 'same-origin']), X('allow', 'allow (permissions policy, optional)', ''), S('mode', 'Output', 'aspect-ratio CSS', ['aspect-ratio CSS', 'padding-bottom fallback', 'fixed width and height'])],
  run: ([s], o) => {
    let u; try { u = new URL(s.trim()); } catch { throw new Error('Enter a full URL such as https://example.com/embed/1'); }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http and https URLs are allowed');
    if (!o.title.trim()) throw new Error('A title is needed so the frame has an accessible name');
    const rr = o.ratio === 'custom' ? o.custom : o.ratio; const m = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(rr.trim());
    if (!m || +m[1] <= 0 || +m[2] <= 0) throw new Error('Ratio must look like 16:9');
    const w = +m[1], h = +m[2];
    const sb = o.sandbox.startsWith('scripts + ') ? 'allow-scripts allow-same-origin allow-presentation allow-popups' : o.sandbox.startsWith('scripts only') ? 'allow-scripts allow-presentation' : o.sandbox.startsWith('fully') ? '' : null;
    const at = [`src="${esc(u.href)}"`, `title="${esc(o.title.trim())}"`, ...(o.lazy ? ['loading="lazy"'] : []), `referrerpolicy="${o.ref}"`, ...(sb !== null ? [`sandbox="${sb}"`] : []), ...(o.allow.trim() ? [`allow="${esc(o.allow.trim())}"`] : []), ...(o.fs ? ['allowfullscreen'] : [])];
    let code;
    if (o.mode === 'fixed width and height') code = `<iframe width="560" height="${Math.round((560 * h) / w)}" ${at.join(' ')}></iframe>`;
    else if (o.mode === 'padding-bottom fallback') code = `<div style="position:relative;width:100%;height:0;padding-bottom:${fmt((h / w) * 100)}%">\n  <iframe ${at.join(' ')}\n    style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>\n</div>`;
    else code = `<iframe ${at.join(' ')}\n  style="width:100%;aspect-ratio:${w} / ${h};border:0"></iframe>`;
    return { text: code + (u.protocol === 'http:' ? '\n\nNote: an http URL is blocked as mixed content on https pages.' : ''), html: page('', `<div style="max-width:420px;border:1px dashed #999;padding:4px">Container (resize-safe)<div style="margin-top:4px;aspect-ratio:${w}/${h};background:#e2e8f0;display:grid;place-items:center">${esc(rr)} frame</div></div>`) };
  },
});

/* ---------- 749 Markdown TOC ---------- */
const plainHeading = (t) => t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1').replace(/<[^>]+>/g, '').replace(/`([^`]*)`/g, '$1').replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(.*?)\1/g, '$2').replace(/~~(.*?)~~/g, '$1').trim();
const SLUG_DROP = /[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu;
T.push({
  id: 'markdown-toc-generator', cat: 'Markdown', title: 'Markdown Table of Contents Generator (GitHub Heading Anchors)',
  desc: 'Build a nested, linked table of contents from the headings of a Markdown document, with GitHub-style anchor slugs, duplicate numbering, depth limits and fenced code ignored.',
  labels: ['Markdown'], placeholder: ['# Title\n## Section'],
  opts: [N('min', 'Shallowest heading level', 2), N('max', 'Deepest heading level', 3), S('bullet', 'List marker', '-', ['-', '*', '+', '1.']), N('indent', 'Indent per level (spaces)', 2), K('skiptoc', 'Skip headings called "Table of contents" or "Contents"', true)],
  sample: '# Project\n\n## Table of contents\n\n## Install\n\n```sh\n# not a heading\nnpm i\n```\n\n## Usage\n\n### Options\n\n### Options\n\n## Café & Crème\n\nSetext heading\n--------------\n\n#### Too deep\n',
  run: ([s], o) => {
    const min = Math.round(need(o.min, 'Shallowest')), max = Math.round(need(o.max, 'Deepest'));
    if (min < 1 || max > 6 || min > max) throw new Error('Levels must satisfy 1 <= shallowest <= deepest <= 6');
    const lines = s.replace(/\r/g, '').split('\n'), hs = []; let fence = null;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i], f = /^ {0,3}(`{3,}|~{3,})/.exec(ln);
      if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !/\S/.test(ln.slice(f[0].length))) fence = null; continue; }
      if (f) { fence = f[1]; continue; }
      let m = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/.exec(ln);
      if (m) { hs.push({ l: m[1].length, t: m[2] || '' }); continue; }
      if (/^ {0,3}(=+|-+)[ \t]*$/.test(ln) && i > 0 && lines[i - 1].trim() && !/^ {0,3}(#{1,6}(\s|$)|[-*+]\s|>|\d+[.)]\s|=+\s*$|-+\s*$)/.test(lines[i - 1])) hs.push({ l: ln.trim()[0] === '=' ? 1 : 2, t: lines[i - 1].trim() });
    }
    const seen = new Map(), items = [];
    for (const h of hs) {
      const text = plainHeading(h.t);
      let slug = text.toLowerCase().replace(SLUG_DROP, '').replace(/ /g, '-');
      const n = seen.get(slug) || 0; seen.set(slug, n + 1); if (n) slug += '-' + n;
      if (h.l < min || h.l > max) continue;
      if (o.skiptoc && /^(table of contents|contents|toc)$/i.test(text)) continue;
      items.push({ l: h.l, text, slug });
    }
    if (!items.length) throw new Error('No headings found in the chosen level range');
    const base = Math.min(...items.map((x) => x.l)), ind = Math.max(0, Math.round(need(o.indent, 'Indent')));
    return items.map((x) => `${' '.repeat((x.l - base) * ind)}${o.bullet} [${x.text.replace(/([[\]])/g, '\\$1')}](#${x.slug})`).join('\n') + '\n';
  },
});

/* ---------- 762 emoji / symbol code converter ---------- */
const hx = (n) => n.toString(16).toUpperCase();
T.push({
  id: 'emoji-code-converter', cat: 'Encoding', title: 'Emoji and Symbol Code Converter: U+ Code Points, HTML Entities, CSS and JS Escapes',
  desc: 'Paste emojis or symbols (or U+ codes) and get the code points, HTML hex and decimal entities, CSS escape, JavaScript escape, UTF-8 bytes and UTF-16 units for each character.',
  labels: ['Emojis, symbols or U+ codes'], placeholder: ['😀 ❤️ → © or U+1F600'],
  opts: [K('all', 'Include plain ASCII characters', false)],
  sample: '😀 ❤️ 👨‍💻 🇧🇪 → © € 😀 U+1F680',
  run: ([s], o) => {
    if (!s.trim()) throw new Error('Paste some characters or U+ codes first');
    s = s.replace(/U\+([0-9A-Fa-f]{1,6})/g, (m, h) => { const cp = parseInt(h, 16); if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) throw new Error(`${m} is not a valid Unicode scalar value`); return String.fromCodePoint(cp); });
    const seg = new Intl.Segmenter('en', { granularity: 'grapheme' }), rows = [], enc = new TextEncoder();
    for (const { segment: g } of seg.segment(s)) {
      if (/^\s+$/.test(g)) continue;
      const cps = [...g].map((c) => c.codePointAt(0));
      if (!o.all && cps.every((c) => c < 128)) continue;
      const u16 = []; for (let i = 0; i < g.length; i++) u16.push(g.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0'));
      rows.push([`${g}`, `Code points: ${cps.map((c) => 'U+' + hx(c).padStart(4, '0')).join(' ')}`, `HTML hex: ${cps.map((c) => '&#x' + hx(c) + ';').join('')}`, `HTML decimal: ${cps.map((c) => '&#' + c + ';').join('')}`, `CSS: content: "${cps.map((c) => '\\' + hx(c)).join(' ')}"`, `JS: "${cps.map((c) => '\\u{' + hx(c) + '}').join('')}"`, `UTF-8: ${[...enc.encode(g)].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`, `UTF-16: ${u16.join(' ')}`].join('\n  '));
    }
    if (!rows.length) throw new Error('Only ASCII characters found; tick "Include plain ASCII characters"');
    return rows.join('\n\n') + '\n\nThis tool shows encodings only. It does not look up emoji names or :shortcodes:, because that needs a name table that is not bundled here.';
  },
});

/* ---------- 764 BBCode to HTML ---------- */
function bbcodeToHtml(src) {
  const warn = [], re = /\[(\/?)([a-z*]+)(?:=("[^"]*"|[^\]]*))?\]/gi, tokens = []; let last = 0, m;
  while ((m = re.exec(src))) { if (m.index > last) tokens.push({ x: src.slice(last, m.index) }); tokens.push({ close: !!m[1], tag: m[2].toLowerCase(), arg: m[3] == null ? null : m[3].replace(/^"|"$/g, ''), raw: m[0] }); last = re.lastIndex; }
  if (last < src.length) tokens.push({ x: src.slice(last) });
  const KNOWN = new Set('b i u s url img quote code list * color size center left right email'.split(' '));
  const safeUrl = (u) => /^(https?:\/\/|mailto:|ftp:\/\/|\/|#)/i.test(u.trim()) && !/[\s"<>]/.test(u.trim());
  const root = { tag: 'root', kids: [] }, stack = [root];
  const top = () => stack[stack.length - 1];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.x !== undefined) { top().kids.push({ x: t.x }); continue; }
    if (!KNOWN.has(t.tag)) { top().kids.push({ x: t.raw }); continue; }
    if (!t.close) {
      if (t.tag === 'code') { let j = i + 1, buf = ''; while (j < tokens.length && !(tokens[j].close && tokens[j].tag === 'code')) { buf += tokens[j].x !== undefined ? tokens[j].x : tokens[j].raw; j++; } top().kids.push({ tag: 'code', arg: t.arg, kids: [{ x: buf }] }); i = j; continue; }
      if (t.tag === '*') { if (top().tag === '*') stack.pop(); const n = { tag: '*', kids: [] }; top().kids.push(n); stack.push(n); continue; }
      const n = { tag: t.tag, arg: t.arg, kids: [] }; top().kids.push(n); stack.push(n); continue;
    }
    if (t.tag === '*') { top().kids.push({ x: t.raw }); continue; }
    let k = stack.length - 1; while (k > 0 && stack[k].tag !== t.tag) k--;
    if (k === 0) { warn.push(`Stray ${t.raw}`); top().kids.push({ x: t.raw }); continue; }
    for (let j = stack.length - 1; j > k; j--) if (stack[j].tag !== '*') warn.push(`[${stack[j].tag}] was not closed before ${t.raw}`);
    stack.length = k;
  }
  for (const n of stack.slice(1)) if (n.tag !== '*') warn.push(`[${n.tag}] was never closed`);
  const text = (s) => esc(s).replace(/\r?\n/g, '<br>\n');
  const flat = (n) => n.kids.map((k) => (k.x !== undefined ? k.x : flat(k))).join('');
  const out = (n) => {
    if (n.x !== undefined) return text(n.x);
    const inner = () => n.kids.map(out).join('');
    switch (n.tag) {
      case 'root': return inner();
      case 'b': return `<strong>${inner()}</strong>`;
      case 'i': return `<em>${inner()}</em>`;
      case 'u': return `<u>${inner()}</u>`;
      case 's': return `<s>${inner()}</s>`;
      case 'url': { const u = n.arg || flat(n); if (!safeUrl(u)) { warn.push(`Link target "${u}" is not an allowed URL; link dropped`); return inner(); } return `<a href="${esc(u.trim())}" rel="nofollow ugc">${inner()}</a>`; }
      case 'email': { const u = n.arg || flat(n); if (!/^[^\s@<>"]+@[^\s@<>"]+$/.test(u)) return inner(); return `<a href="mailto:${esc(u)}">${inner()}</a>`; }
      case 'img': { const u = flat(n).trim(); if (!/^https?:\/\//i.test(u) || /[\s"<>]/.test(u)) { warn.push('Image URL must start with http:// or https://; image dropped'); return ''; } return `<img src="${esc(u)}" alt="">`; }
      case 'quote': return `<blockquote>${n.arg ? `<cite>${esc(n.arg)} wrote:</cite>` : ''}${inner()}</blockquote>`;
      case 'code': return `<pre><code>${esc(flat(n))}</code></pre>`;
      case 'list': { const items = n.kids.filter((k) => k.tag === '*'); const rest = n.kids.filter((k) => k.tag !== '*' && !(k.x !== undefined && !k.x.trim())); if (rest.length) warn.push('Text outside [*] items inside a list was dropped'); const tg = n.arg && /^(1|a|A|i|I)$/.test(n.arg) ? 'ol' : 'ul'; return `<${tg}${n.arg && n.arg !== '1' && tg === 'ol' ? ` type="${n.arg}"` : ''}>${items.map((k) => `<li>${k.kids.map(out).join('').replace(/^(<br>\n?)+|(<br>\n?)+$/g, '').trim()}</li>`).join('')}</${tg}>`; }
      case '*': return inner();
      case 'color': { if (!n.arg || !/^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i.test(n.arg)) return inner(); return `<span style="color:${n.arg}">${inner()}</span>`; }
      case 'size': { const a = n.arg || ''; const map = { 1: 'x-small', 2: 'small', 3: 'medium', 4: 'large', 5: 'x-large', 6: 'xx-large', 7: 'xxx-large' }; const v = /^[1-7]$/.test(a) ? map[a] : /^\d{1,2}(px|pt|%)?$/.test(a) ? (/\D/.test(a) ? a : a + 'px') : null; return v ? `<span style="font-size:${v}">${inner()}</span>` : inner(); }
      case 'center': case 'left': case 'right': return `<div style="text-align:${n.tag}">${inner()}</div>`;
      default: return inner();
    }
  };
  return { html: out(root), warn };
}
T.push({
  id: 'bbcode-to-html', cat: MK, title: 'BBCode to HTML Converter with Safe Links and Preview',
  desc: 'Convert forum BBCode (b, i, u, s, url, img, quote, code, list, color, size, align) into HTML. Text is escaped, only http, https, mailto and ftp links are kept, and problems are listed.',
  labels: ['BBCode'], placeholder: ['[b]bold[/b] [url=https://example.com]link[/url]'],
  sample: '[b]Welcome[/b] to the [i]forum[/i]!\n[quote=Anna]Is this [u]safe[/u]?[/quote]\n[url=https://example.com]A link[/url] and [url=javascript:alert(1)]a bad one[/url]\n[list=1]\n[*]First\n[*]Second [color=red]red[/color]\n[/list]\n[code]<b>raw</b> & text[/code]\n[size=5]Big[/size] [img]https://example.com/a.png[/img] [b]unclosed',
  run: ([s]) => {
    if (!s.trim()) throw new Error('Paste some BBCode first');
    const { html, warn } = bbcodeToHtml(s);
    return { text: html + (warn.length ? `\n\n<!-- Notes:\n${warn.map((w) => '  ' + w.replace(/--/g, '- -')).join('\n')}\n-->` : ''), html: page('blockquote{margin:8px 0;padding:4px 12px;border-left:3px solid #999;background:#f3f4f6}pre{background:#f3f4f6;padding:8px;overflow:auto}', html) };
  },
});

/* ---------- 759 MJML (subset) ---------- */
function mjmlCompile(src) {
  const { root } = parseHtml(src, { xml: true });
  const mj = els(root).find((e) => e.tag === 'mjml');
  if (!mj) throw new Error('Wrap the email in <mjml> ... </mjml>');
  const head = els(mj).find((e) => e.tag === 'mj-head'), body = els(mj).find((e) => e.tag === 'mj-body');
  if (!body) throw new Error('Missing <mj-body>');
  const inner = (e) => e.children.map((c) => ser(c, { xml: false })).join('').trim();
  let title = '', preview = '', extra = ''; const defs = {};
  if (head) for (const h of els(head)) {
    if (h.tag === 'mj-title') title = inner(h); else if (h.tag === 'mj-preview') preview = inner(h); else if (h.tag === 'mj-style') extra += inner(h) + '\n';
    else if (h.tag === 'mj-attributes') for (const a of els(h)) { const nm = a.tag === 'mj-all' ? '*' : a.tag; defs[nm] = Object.assign(defs[nm] || {}, Object.fromEntries(a.attrs.map(([k, v]) => [k, v ?? '']))); }
  }
  const A = (e, k, d) => { const a = attr(e, k); if (a !== null) return a; if (defs[e.tag] && defs[e.tag][k] != null) return defs[e.tag][k]; if (defs['*'] && defs['*'][k] != null && ['font-family', 'color', 'font-size', 'padding'].includes(k) && e.tag !== 'mj-section' && e.tag !== 'mj-column') return defs['*'][k]; return d; };
  const px = (v) => parseFloat(v) || 0;
  const pad = (v) => { const p = String(v).trim().split(/\s+/).map(px); const [t, r = t, b = t, l = r] = p; return { t, r, b, l }; };
  const FONT = 'Ubuntu, Helvetica, Arial, sans-serif';
  const bodyW = px(A(body, 'width', '600px')) || 600, cols = new Set(), warns = [];
  const content = (c, w) => {
    const p = A(c, 'padding', c.tag === 'mj-spacer' ? '0' : '10px 25px');
    const wrap = (inner2, align) => `<tr><td align="${align}" style="font-size:0px;padding:${p};word-break:break-word;"${A(c, 'css-class', '') ? ` class="${esc(A(c, 'css-class', ''))}"` : ''}>${inner2}</td></tr>`;
    const pp = pad(p);
    switch (c.tag) {
      case 'mj-text': return wrap(`<div style="font-family:${A(c, 'font-family', FONT)};font-size:${A(c, 'font-size', '13px')};font-weight:${A(c, 'font-weight', 'normal')};line-height:${A(c, 'line-height', '1')};text-align:${A(c, 'align', 'left')};color:${A(c, 'color', '#000000')};">${inner(c)}</div>`, A(c, 'align', 'left'));
      case 'mj-image': { const iw = Math.max(1, Math.round(px(A(c, 'width', String(w - pp.l - pp.r))))); const img = `<img alt="${esc(A(c, 'alt', ''))}" src="${esc(A(c, 'src', ''))}" style="border:0;display:block;outline:none;text-decoration:none;height:auto;width:100%;font-size:13px;" width="${iw}">`; const h = A(c, 'href', ''); return wrap(`<table border="0" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border-spacing:0px;"><tbody><tr><td style="width:${iw}px;">${h ? `<a href="${esc(h)}" target="_blank">${img}</a>` : img}</td></tr></tbody></table>`, A(c, 'align', 'center')); }
      case 'mj-button': { const bg = A(c, 'background-color', '#414141'); return wrap(`<table border="0" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:separate;line-height:100%;"><tbody><tr><td align="center" bgcolor="${bg}" role="presentation" style="border:${A(c, 'border', 'none')};border-radius:${A(c, 'border-radius', '3px')};cursor:auto;mso-padding-alt:${A(c, 'inner-padding', '10px 25px')};background:${bg};" valign="middle"><a href="${esc(A(c, 'href', '#'))}" style="display:inline-block;background:${bg};color:${A(c, 'color', '#ffffff')};font-family:${A(c, 'font-family', FONT)};font-size:${A(c, 'font-size', '13px')};font-weight:${A(c, 'font-weight', 'normal')};line-height:120%;margin:0;text-decoration:none;text-transform:none;padding:${A(c, 'inner-padding', '10px 25px')};mso-padding-alt:0px;border-radius:${A(c, 'border-radius', '3px')};" target="_blank">${inner(c)}</a></td></tr></tbody></table>`, A(c, 'align', 'center')); }
      case 'mj-divider': return wrap(`<p style="border-top:${A(c, 'border-width', '4px')} ${A(c, 'border-style', 'solid')} ${A(c, 'border-color', '#000000')};font-size:1px;margin:0px auto;width:${A(c, 'width', '100%')};"></p>`, 'center');
      case 'mj-spacer': return `<tr><td style="font-size:0px;word-break:break-word;"><div style="height:${A(c, 'height', '20px')};line-height:${A(c, 'height', '20px')};">&#8202;</div></td></tr>`;
      default: warns.push(`<${c.tag}> is not supported in this subset and was skipped`); return '';
    }
  };
  const column = (c, w, n) => {
    const spec = A(c, 'width', ''), per = spec.endsWith('%') ? parseFloat(spec) : spec ? (px(spec) / bodyW) * 100 : 100 / n, pct = fmt(per);
    cols.add(pct);
    const cw = (bodyW * per) / 100;
    const bg = A(c, 'background-color', ''), p = A(c, 'padding', '0');
    return `<div class="mj-column-per-${String(pct).replace('.', '-')}" style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:${A(c, 'vertical-align', 'top')};width:100%;"><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="${bg ? `background-color:${bg};` : ''}vertical-align:top;" width="100%"><tbody><tr><td style="padding:${p};"><table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%"><tbody>${els(c).map((x) => content(x, cw - pad(p).l - pad(p).r)).join('')}</tbody></table></td></tr></tbody></table></div>`;
  };
  const section = (s) => {
    const kids = els(s).filter((x) => x.tag === 'mj-column'); const bg = A(s, 'background-color', '');
    if (els(s).some((x) => x.tag !== 'mj-column')) warns.push('Only <mj-column> is supported inside <mj-section>; other children were skipped');
    return `<div style="${bg ? `background:${bg};background-color:${bg};` : ''}margin:0px auto;max-width:${bodyW}px;"><table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="${bg ? `background:${bg};background-color:${bg};` : ''}width:100%;"><tbody><tr><td style="direction:ltr;font-size:0px;padding:${A(s, 'padding', '20px 0')};text-align:${A(s, 'text-align', 'center')};">${kids.map((c) => column(c, bodyW, kids.length)).join('')}</td></tr></tbody></table></div>`;
  };
  const sections = els(body).map((x) => (x.tag === 'mj-section' ? section(x) : (warns.push(`<${x.tag}> is not supported directly in <mj-body>; use <mj-section>`), '')));
  const mq = [...cols].map((p) => `.mj-column-per-${String(p).replace('.', '-')} { width:${p}% !important; max-width: ${p}%; }`).join('\n');
  const html = `<!doctype html>\n<html lang="und" dir="auto" xmlns="http://www.w3.org/1999/xhtml">\n<head>\n<title>${title}</title>\n<meta http-equiv="X-UA-Compatible" content="IE=edge">\n<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<style type="text/css">\n#outlook a { padding:0; }\nbody { margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%; }\ntable, td { border-collapse:collapse; }\nimg { border:0;height:auto;line-height:100%; outline:none;text-decoration:none; }\np { display:block;margin:13px 0; }\n</style>\n<style type="text/css">\n@media only screen and (min-width:480px) {\n${mq}\n}\n</style>\n${extra ? `<style type="text/css">\n${extra}</style>\n` : ''}</head>\n<body style="word-spacing:normal;${A(body, 'background-color', '') ? `background-color:${A(body, 'background-color', '')};` : ''}">\n${preview ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preview}</div>\n` : ''}<div>\n${sections.join('\n')}\n</div>\n</body>\n</html>\n`;
  return { html, warns: [...new Set(warns)] };
}
T.push({
  id: 'mjml-subset-compiler', cat: MK, title: 'MJML Subset Compiler: Responsive Email Markup to Table-Based HTML',
  desc: 'Compile a practical subset of MJML (section, column, text, image, button, divider, spacer, head attributes) into responsive, table-based email HTML with a live preview.',
  labels: ['MJML'], placeholder: ['<mjml><mj-body>...</mj-body></mjml>'],
  sample: '<mjml>\n  <mj-head>\n    <mj-title>Welcome</mj-title>\n    <mj-preview>Thanks for joining</mj-preview>\n    <mj-attributes><mj-all font-family="Arial, sans-serif" /></mj-attributes>\n  </mj-head>\n  <mj-body background-color="#f4f4f4">\n    <mj-section background-color="#ffffff">\n      <mj-column>\n        <mj-text font-size="20px" color="#111111">Hello there</mj-text>\n        <mj-divider border-color="#cccccc" border-width="1px" />\n      </mj-column>\n    </mj-section>\n    <mj-section>\n      <mj-column><mj-image src="https://example.com/a.png" alt="A" width="200px" /></mj-column>\n      <mj-column><mj-text>Two columns stack on small screens.</mj-text><mj-button href="https://example.com" background-color="#2563eb">Open</mj-button></mj-column>\n    </mj-section>\n  </mj-body>\n</mjml>',
  run: ([s]) => {
    if (!s.trim()) throw new Error('Paste MJML first');
    const { html, warns } = mjmlCompile(s);
    return { text: html + (warns.length ? `\n<!-- Not supported: ${warns.join('; ').replace(/--/g, '- -')} -->\n` : '') + '<!-- Compiled by a small hand-written subset compiler, not by MJML. It has no Outlook (MSO) ghost tables, so test in your target clients. -->\n', html };
  },
});

/* ---------- 735 Tailwind to CSS ---------- */
// Colour scale values (OKLCH) copied from the Tailwind CSS v4 default theme file (tailwindcss/theme.css), as data.
const TWC = {"red":{"50":"97.1% 0.013 17.38","100":"93.6% 0.032 17.717","200":"88.5% 0.062 18.334","300":"80.8% 0.114 19.571","400":"70.4% 0.191 22.216","500":"63.7% 0.237 25.331","600":"57.7% 0.245 27.325","700":"50.5% 0.213 27.518","800":"44.4% 0.177 26.899","900":"39.6% 0.141 25.723","950":"25.8% 0.092 26.042"},"orange":{"50":"98% 0.016 73.684","100":"95.4% 0.038 75.164","200":"90.1% 0.076 70.697","300":"83.7% 0.128 66.29","400":"75% 0.183 55.934","500":"70.5% 0.213 47.604","600":"64.6% 0.222 41.116","700":"55.3% 0.195 38.402","800":"47% 0.157 37.304","900":"40.8% 0.123 38.172","950":"26.6% 0.079 36.259"},"amber":{"50":"98.7% 0.022 95.277","100":"96.2% 0.059 95.617","200":"92.4% 0.12 95.746","300":"87.9% 0.169 91.605","400":"82.8% 0.189 84.429","500":"76.9% 0.188 70.08","600":"66.6% 0.179 58.318","700":"55.5% 0.163 48.998","800":"47.3% 0.137 46.201","900":"41.4% 0.112 45.904","950":"27.9% 0.077 45.635"},"yellow":{"50":"98.7% 0.026 102.212","100":"97.3% 0.071 103.193","200":"94.5% 0.129 101.54","300":"90.5% 0.182 98.111","400":"85.2% 0.199 91.936","500":"79.5% 0.184 86.047","600":"68.1% 0.162 75.834","700":"55.4% 0.135 66.442","800":"47.6% 0.114 61.907","900":"42.1% 0.095 57.708","950":"28.6% 0.066 53.813"},"lime":{"50":"98.6% 0.031 120.757","100":"96.7% 0.067 122.328","200":"93.8% 0.127 124.321","300":"89.7% 0.196 126.665","400":"84.1% 0.238 128.85","500":"76.8% 0.233 130.85","600":"64.8% 0.2 131.684","700":"53.2% 0.157 131.589","800":"45.3% 0.124 130.933","900":"40.5% 0.101 131.063","950":"27.4% 0.072 132.109"},"green":{"50":"98.2% 0.018 155.826","100":"96.2% 0.044 156.743","200":"92.5% 0.084 155.995","300":"87.1% 0.15 154.449","400":"79.2% 0.209 151.711","500":"72.3% 0.219 149.579","600":"62.7% 0.194 149.214","700":"52.7% 0.154 150.069","800":"44.8% 0.119 151.328","900":"39.3% 0.095 152.535","950":"26.6% 0.065 152.934"},"emerald":{"50":"97.9% 0.021 166.113","100":"95% 0.052 163.051","200":"90.5% 0.093 164.15","300":"84.5% 0.143 164.978","400":"76.5% 0.177 163.223","500":"69.6% 0.17 162.48","600":"59.6% 0.145 163.225","700":"50.8% 0.118 165.612","800":"43.2% 0.095 166.913","900":"37.8% 0.077 168.94","950":"26.2% 0.051 172.552"},"teal":{"50":"98.4% 0.014 180.72","100":"95.3% 0.051 180.801","200":"91% 0.096 180.426","300":"85.5% 0.138 181.071","400":"77.7% 0.152 181.912","500":"70.4% 0.14 182.503","600":"60% 0.118 184.704","700":"51.1% 0.096 186.391","800":"43.7% 0.078 188.216","900":"38.6% 0.063 188.416","950":"27.7% 0.046 192.524"},"cyan":{"50":"98.4% 0.019 200.873","100":"95.6% 0.045 203.388","200":"91.7% 0.08 205.041","300":"86.5% 0.127 207.078","400":"78.9% 0.154 211.53","500":"71.5% 0.143 215.221","600":"60.9% 0.126 221.723","700":"52% 0.105 223.128","800":"45% 0.085 224.283","900":"39.8% 0.07 227.392","950":"30.2% 0.056 229.695"},"sky":{"50":"97.7% 0.013 236.62","100":"95.1% 0.026 236.824","200":"90.1% 0.058 230.902","300":"82.8% 0.111 230.318","400":"74.6% 0.16 232.661","500":"68.5% 0.169 237.323","600":"58.8% 0.158 241.966","700":"50% 0.134 242.749","800":"44.3% 0.11 240.79","900":"39.1% 0.09 240.876","950":"29.3% 0.066 243.157"},"blue":{"50":"97% 0.014 254.604","100":"93.2% 0.032 255.585","200":"88.2% 0.059 254.128","300":"80.9% 0.105 251.813","400":"70.7% 0.165 254.624","500":"62.3% 0.214 259.815","600":"54.6% 0.245 262.881","700":"48.8% 0.243 264.376","800":"42.4% 0.199 265.638","900":"37.9% 0.146 265.522","950":"28.2% 0.091 267.935"},"indigo":{"50":"96.2% 0.018 272.314","100":"93% 0.034 272.788","200":"87% 0.065 274.039","300":"78.5% 0.115 274.713","400":"67.3% 0.182 276.935","500":"58.5% 0.233 277.117","600":"51.1% 0.262 276.966","700":"45.7% 0.24 277.023","800":"39.8% 0.195 277.366","900":"35.9% 0.144 278.697","950":"25.7% 0.09 281.288"},"violet":{"50":"96.9% 0.016 293.756","100":"94.3% 0.029 294.588","200":"89.4% 0.057 293.283","300":"81.1% 0.111 293.571","400":"70.2% 0.183 293.541","500":"60.6% 0.25 292.717","600":"54.1% 0.281 293.009","700":"49.1% 0.27 292.581","800":"43.2% 0.232 292.759","900":"38% 0.189 293.745","950":"28.3% 0.141 291.089"},"purple":{"50":"97.7% 0.014 308.299","100":"94.6% 0.033 307.174","200":"90.2% 0.063 306.703","300":"82.7% 0.119 306.383","400":"71.4% 0.203 305.504","500":"62.7% 0.265 303.9","600":"55.8% 0.288 302.321","700":"49.6% 0.265 301.924","800":"43.8% 0.218 303.724","900":"38.1% 0.176 304.987","950":"29.1% 0.149 302.717"},"fuchsia":{"50":"97.7% 0.017 320.058","100":"95.2% 0.037 318.852","200":"90.3% 0.076 319.62","300":"83.3% 0.145 321.434","400":"74% 0.238 322.16","500":"66.7% 0.295 322.15","600":"59.1% 0.293 322.896","700":"51.8% 0.253 323.949","800":"45.2% 0.211 324.591","900":"40.1% 0.17 325.612","950":"29.3% 0.136 325.661"},"pink":{"50":"97.1% 0.014 343.198","100":"94.8% 0.028 342.258","200":"89.9% 0.061 343.231","300":"82.3% 0.12 346.018","400":"71.8% 0.202 349.761","500":"65.6% 0.241 354.308","600":"59.2% 0.249 0.584","700":"52.5% 0.223 3.958","800":"45.9% 0.187 3.815","900":"40.8% 0.153 2.432","950":"28.4% 0.109 3.907"},"rose":{"50":"96.9% 0.015 12.422","100":"94.1% 0.03 12.58","200":"89.2% 0.058 10.001","300":"81% 0.117 11.638","400":"71.2% 0.194 13.428","500":"64.5% 0.246 16.439","600":"58.6% 0.253 17.585","700":"51.4% 0.222 16.935","800":"45.5% 0.188 13.697","900":"41% 0.159 10.272","950":"27.1% 0.105 12.094"},"slate":{"50":"98.4% 0.003 247.858","100":"96.8% 0.007 247.896","200":"92.9% 0.013 255.508","300":"86.9% 0.022 252.894","400":"70.4% 0.04 256.788","500":"55.4% 0.046 257.417","600":"44.6% 0.043 257.281","700":"37.2% 0.044 257.287","800":"27.9% 0.041 260.031","900":"20.8% 0.042 265.755","950":"12.9% 0.042 264.695"},"gray":{"50":"98.5% 0.002 247.839","100":"96.7% 0.003 264.542","200":"92.8% 0.006 264.531","300":"87.2% 0.01 258.338","400":"70.7% 0.022 261.325","500":"55.1% 0.027 264.364","600":"44.6% 0.03 256.802","700":"37.3% 0.034 259.733","800":"27.8% 0.033 256.848","900":"21% 0.034 264.665","950":"13% 0.028 261.692"},"zinc":{"50":"98.5% 0 none","100":"96.7% 0.001 286.375","200":"92% 0.004 286.32","300":"87.1% 0.006 286.286","400":"70.5% 0.015 286.067","500":"55.2% 0.016 285.938","600":"44.2% 0.017 285.786","700":"37% 0.013 285.805","800":"27.4% 0.006 286.033","900":"21% 0.006 285.885","950":"14.1% 0.005 285.823"},"neutral":{"50":"98.5% 0 none","100":"97% 0 none","200":"92.2% 0 none","300":"87% 0 none","400":"70.8% 0 none","500":"55.6% 0 none","600":"43.9% 0 none","700":"37.1% 0 none","800":"26.9% 0 none","900":"20.5% 0 none","950":"14.5% 0 none"},"stone":{"50":"98.5% 0.001 106.423","100":"97% 0.001 106.424","200":"92.3% 0.003 48.717","300":"86.9% 0.005 56.366","400":"70.9% 0.01 56.259","500":"55.3% 0.013 58.071","600":"44.4% 0.011 73.639","700":"37.4% 0.01 67.558","800":"26.8% 0.007 34.298","900":"21.6% 0.006 56.043","950":"14.7% 0.004 49.25"},"mauve":{"50":"98.5% 0 none","100":"96% 0.003 325.6","200":"92.2% 0.005 325.62","300":"86.5% 0.012 325.68","400":"71.1% 0.019 323.02","500":"54.2% 0.034 322.5","600":"43.5% 0.029 321.78","700":"36.4% 0.029 323.89","800":"26.3% 0.024 320.12","900":"21.2% 0.019 322.12","950":"14.5% 0.008 326"},"olive":{"50":"98.8% 0.003 106.5","100":"96.6% 0.005 106.5","200":"93% 0.007 106.5","300":"88% 0.011 106.6","400":"73.7% 0.021 106.9","500":"58% 0.031 107.3","600":"46.6% 0.025 107.3","700":"39.4% 0.023 107.4","800":"28.6% 0.016 107.4","900":"22.8% 0.013 107.4","950":"15.3% 0.006 107.1"},"mist":{"50":"98.7% 0.002 197.1","100":"96.3% 0.002 197.1","200":"92.5% 0.005 214.3","300":"87.2% 0.007 219.6","400":"72.3% 0.014 214.4","500":"56% 0.021 213.5","600":"45% 0.017 213.2","700":"37.8% 0.015 216","800":"27.5% 0.011 216.9","900":"21.8% 0.008 223.9","950":"14.8% 0.004 228.8"},"taupe":{"50":"98.6% 0.002 67.8","100":"96% 0.002 17.2","200":"92.2% 0.005 34.3","300":"86.8% 0.007 39.5","400":"71.4% 0.014 41.2","500":"54.7% 0.021 43.1","600":"43.8% 0.017 39.3","700":"36.7% 0.016 35.7","800":"26.8% 0.011 36.5","900":"21.4% 0.009 43.1","950":"14.7% 0.004 49.3"}};
const TW_SHADOW = { '2xs': '0 1px rgb(0 0 0 / 0.05)', xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)', sm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)', md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)', none: 'none' };
const TW_TEXT = { xs: ['0.75rem', 'calc(1 / 0.75)'], sm: ['0.875rem', 'calc(1.25 / 0.875)'], base: ['1rem', 'calc(1.5 / 1)'], lg: ['1.125rem', 'calc(1.75 / 1.125)'], xl: ['1.25rem', 'calc(1.75 / 1.25)'], '2xl': ['1.5rem', 'calc(2 / 1.5)'], '3xl': ['1.875rem', 'calc(2.25 / 1.875)'], '4xl': ['2.25rem', 'calc(2.5 / 2.25)'], '5xl': ['3rem', '1'], '6xl': ['3.75rem', '1'], '7xl': ['4.5rem', '1'], '8xl': ['6rem', '1'], '9xl': ['8rem', '1'] };
const TW_RAD = { none: '0', xs: '0.125rem', sm: '0.25rem', '': '0.25rem', md: '0.375rem', lg: '0.5rem', xl: '0.75rem', '2xl': '1rem', '3xl': '1.5rem', '4xl': '2rem', full: 'calc(infinity * 1px)' };
const TW_CONT = { '3xs': '16rem', '2xs': '18rem', xs: '20rem', sm: '24rem', md: '28rem', lg: '32rem', xl: '36rem', '2xl': '42rem', '3xl': '48rem', '4xl': '56rem', '5xl': '64rem', '6xl': '72rem', '7xl': '80rem' };
const TW_BP = { sm: '40rem', md: '48rem', lg: '64rem', xl: '80rem', '2xl': '96rem' };
const TW_ENUM = {
  block: 'display:block', 'inline-block': 'display:inline-block', inline: 'display:inline', flex: 'display:flex', 'inline-flex': 'display:inline-flex', grid: 'display:grid', 'inline-grid': 'display:inline-grid', hidden: 'display:none', contents: 'display:contents', table: 'display:table', 'flow-root': 'display:flow-root',
  static: 'position:static', fixed: 'position:fixed', absolute: 'position:absolute', relative: 'position:relative', sticky: 'position:sticky', visible: 'visibility:visible', invisible: 'visibility:hidden', collapse: 'visibility:collapse',
  'flex-row': 'flex-direction:row', 'flex-row-reverse': 'flex-direction:row-reverse', 'flex-col': 'flex-direction:column', 'flex-col-reverse': 'flex-direction:column-reverse', 'flex-wrap': 'flex-wrap:wrap', 'flex-nowrap': 'flex-wrap:nowrap', 'flex-wrap-reverse': 'flex-wrap:wrap-reverse',
  'flex-1': 'flex:1', 'flex-auto': 'flex:1 1 auto', 'flex-initial': 'flex:0 1 auto', 'flex-none': 'flex:none', grow: 'flex-grow:1', 'grow-0': 'flex-grow:0', shrink: 'flex-shrink:1', 'shrink-0': 'flex-shrink:0',
  'items-start': 'align-items:flex-start', 'items-end': 'align-items:flex-end', 'items-center': 'align-items:center', 'items-baseline': 'align-items:baseline', 'items-stretch': 'align-items:stretch',
  'justify-start': 'justify-content:flex-start', 'justify-end': 'justify-content:flex-end', 'justify-center': 'justify-content:center', 'justify-between': 'justify-content:space-between', 'justify-around': 'justify-content:space-around', 'justify-evenly': 'justify-content:space-evenly',
  'self-auto': 'align-self:auto', 'self-start': 'align-self:flex-start', 'self-end': 'align-self:flex-end', 'self-center': 'align-self:center', 'self-stretch': 'align-self:stretch',
  'text-left': 'text-align:left', 'text-center': 'text-align:center', 'text-right': 'text-align:right', 'text-justify': 'text-align:justify', 'text-start': 'text-align:start', 'text-end': 'text-align:end',
  italic: 'font-style:italic', 'not-italic': 'font-style:normal', underline: 'text-decoration-line:underline', overline: 'text-decoration-line:overline', 'line-through': 'text-decoration-line:line-through', 'no-underline': 'text-decoration-line:none',
  uppercase: 'text-transform:uppercase', lowercase: 'text-transform:lowercase', capitalize: 'text-transform:capitalize', 'normal-case': 'text-transform:none',
  truncate: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap', 'text-ellipsis': 'text-overflow:ellipsis', 'text-clip': 'text-overflow:clip', 'whitespace-normal': 'white-space:normal', 'whitespace-nowrap': 'white-space:nowrap', 'whitespace-pre': 'white-space:pre', 'whitespace-pre-line': 'white-space:pre-line', 'whitespace-pre-wrap': 'white-space:pre-wrap', 'break-words': 'overflow-wrap:break-word', 'break-all': 'word-break:break-all',
  'overflow-auto': 'overflow:auto', 'overflow-hidden': 'overflow:hidden', 'overflow-visible': 'overflow:visible', 'overflow-scroll': 'overflow:scroll', 'overflow-x-auto': 'overflow-x:auto', 'overflow-y-auto': 'overflow-y:auto', 'overflow-x-hidden': 'overflow-x:hidden', 'overflow-y-hidden': 'overflow-y:hidden', 'overflow-x-scroll': 'overflow-x:scroll', 'overflow-y-scroll': 'overflow-y:scroll',
  'border-solid': 'border-style:solid', 'border-dashed': 'border-style:dashed', 'border-dotted': 'border-style:dotted', 'border-none': 'border-style:none', 'border-double': 'border-style:double',
  'cursor-pointer': 'cursor:pointer', 'cursor-default': 'cursor:default', 'cursor-not-allowed': 'cursor:not-allowed', 'cursor-wait': 'cursor:wait', 'cursor-text': 'cursor:text', 'cursor-move': 'cursor:move', 'cursor-grab': 'cursor:grab',
  'pointer-events-none': 'pointer-events:none', 'pointer-events-auto': 'pointer-events:auto', 'select-none': 'user-select:none', 'select-text': 'user-select:text', 'select-all': 'user-select:all',
  'object-cover': 'object-fit:cover', 'object-contain': 'object-fit:contain', 'object-fill': 'object-fit:fill', 'object-none': 'object-fit:none', 'object-center': 'object-position:center',
  'aspect-auto': 'aspect-ratio:auto', 'aspect-square': 'aspect-ratio:1 / 1', 'aspect-video': 'aspect-ratio:16 / 9',
  'list-none': 'list-style-type:none', 'list-disc': 'list-style-type:disc', 'list-decimal': 'list-style-type:decimal', 'list-inside': 'list-style-position:inside', 'list-outside': 'list-style-position:outside',
  'sr-only': 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border-width:0', 'not-sr-only': 'position:static;width:auto;height:auto;padding:0;margin:0;overflow:visible;clip-path:none;white-space:normal',
  transition: 'transition-property:color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to, opacity, box-shadow, transform, translate, scale, rotate, filter, backdrop-filter, display, visibility, content-visibility, overlay, pointer-events;transition-timing-function:cubic-bezier(0.4, 0, 0.2, 1);transition-duration:150ms', 'transition-none': 'transition-property:none', 'transition-all': 'transition-property:all;transition-timing-function:cubic-bezier(0.4, 0, 0.2, 1);transition-duration:150ms', 'transition-colors': 'transition-property:color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to;transition-timing-function:cubic-bezier(0.4, 0, 0.2, 1);transition-duration:150ms', 'transition-opacity': 'transition-property:opacity;transition-timing-function:cubic-bezier(0.4, 0, 0.2, 1);transition-duration:150ms', 'transition-transform': 'transition-property:transform, translate, scale, rotate;transition-timing-function:cubic-bezier(0.4, 0, 0.2, 1);transition-duration:150ms',
  'ease-linear': 'transition-timing-function:linear', 'ease-in': 'transition-timing-function:cubic-bezier(0.4, 0, 1, 1)', 'ease-out': 'transition-timing-function:cubic-bezier(0, 0, 0.2, 1)', 'ease-in-out': 'transition-timing-function:cubic-bezier(0.4, 0, 0.2, 1)',
  'font-sans': "font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'", 'font-serif': "font-family:ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif", 'font-mono': "font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  'font-thin': 'font-weight:100', 'font-extralight': 'font-weight:200', 'font-light': 'font-weight:300', 'font-normal': 'font-weight:400', 'font-medium': 'font-weight:500', 'font-semibold': 'font-weight:600', 'font-bold': 'font-weight:700', 'font-extrabold': 'font-weight:800', 'font-black': 'font-weight:900',
  'leading-none': 'line-height:1', 'leading-tight': 'line-height:1.25', 'leading-snug': 'line-height:1.375', 'leading-normal': 'line-height:1.5', 'leading-relaxed': 'line-height:1.625', 'leading-loose': 'line-height:2',
  'tracking-tighter': 'letter-spacing:-0.05em', 'tracking-tight': 'letter-spacing:-0.025em', 'tracking-normal': 'letter-spacing:0em', 'tracking-wide': 'letter-spacing:0.025em', 'tracking-wider': 'letter-spacing:0.05em', 'tracking-widest': 'letter-spacing:0.1em',
};
const twArb = (v) => v.replace(/_/g, ' ');
const twSp = (v, neg) => { // spacing/size value or null
  if (v === 'px') return neg ? '-1px' : '1px';
  if (/^\d+(\.\d+)?$/.test(v)) { const n = +v * 0.25; return (neg ? '-' : '') + (n === 0 ? '0' : fmt(n) + 'rem'); }
  const f = /^(\d+)\/(\d+)$/.exec(v); if (f) return (neg ? '-' : '') + fmt((+f[1] / +f[2]) * 100) + '%';
  if (v === 'auto') return 'auto'; if (v === 'full') return neg ? '-100%' : '100%';
  const a = /^\[(.+)\]$/.exec(v); if (a) return (neg ? '-' : '') + twArb(a[1]);
  return null;
};
const twColor = (name) => {
  let alpha = null; const sl = name.lastIndexOf('/'); if (sl > 0) { alpha = name.slice(sl + 1); name = name.slice(0, sl); }
  let c = null; const m = /^([a-z]+)-(\d+)$/.exec(name);
  if (m && TWC[m[1]] && TWC[m[1]][m[2]]) c = `oklch(${TWC[m[1]][m[2]]})`;
  else if (name === 'black') c = '#000'; else if (name === 'white') c = '#fff'; else if (name === 'transparent') return 'transparent'; else if (name === 'current') c = 'currentColor'; else if (name === 'inherit') return 'inherit';
  else { const a = /^\[(#[0-9a-fA-F]{3,8}|(?:rgb|hsl|oklch|lab|lch)a?\(.+\)|[a-z]+)\]$/.exec(name); if (a) c = twArb(a[1]); }
  if (!c) return null;
  if (alpha !== null) { const p = /^\d+$/.test(alpha) ? alpha : (/^\[(.+)\]$/.exec(alpha) || [])[1]; if (!p) return null; return `color-mix(in oklab, ${c} ${/^\d+$/.test(p) ? p + '%' : fmt(parseFloat(p) * 100) + '%'}, transparent)`; }
  return c;
};
const SIDE = { t: ['top'], r: ['right'], b: ['bottom'], l: ['left'], x: ['left', 'right'], y: ['top', 'bottom'], s: ['inline-start'], e: ['inline-end'] };
function twUtil(u) { // returns [[prop,value]...] or null
  let neg = false; if (u[0] === '-') { neg = true; u = u.slice(1); }
  if (!neg && TW_ENUM[u]) return TW_ENUM[u].split(';').map((d) => { const i = d.indexOf(':'); return [d.slice(0, i), d.slice(i + 1)]; });
  let m;
  if ((m = /^(p|m)([trblxyse])?-(.+)$/.exec(u))) { const v = twSp(m[3], neg && m[1] === 'm'); if (v === null || (m[1] === 'p' && (v === 'auto' || neg))) return null; const base = m[1] === 'p' ? 'padding' : 'margin'; return m[2] ? SIDE[m[2]].map((s) => [`${base}-${s}`, v]) : [[base, v]]; }
  if ((m = /^(top|right|bottom|left)-(.+)$/.exec(u))) { const v = twSp(m[2], neg); return v === null ? null : [[m[1], v]]; }
  if ((m = /^inset(?:-([xy]))?-(.+)$/.exec(u))) { const v = twSp(m[2], neg); if (v === null) return null; return m[1] ? SIDE[m[1]].map((s) => [s, v]) : [['inset', v]]; }
  if ((m = /^z-(.+)$/.exec(u))) return /^\d+$/.test(m[1]) ? [['z-index', (neg ? '-' : '') + m[1]]] : m[1] === 'auto' ? [['z-index', 'auto']] : /^\[(.+)\]$/.test(m[1]) ? [['z-index', m[1].slice(1, -1)]] : null;
  if ((m = /^(w|h|size|min-w|min-h|max-w|max-h)-(.+)$/.exec(u))) {
    const prop = { w: ['width'], h: ['height'], size: ['width', 'height'], 'min-w': ['min-width'], 'min-h': ['min-height'], 'max-w': ['max-width'], 'max-h': ['max-height'] }[m[1]]; const k = m[2], vert = /h$/.test(m[1]) || m[1] === 'size';
    let v = { screen: vert ? '100vh' : '100vw', min: 'min-content', max: 'max-content', fit: 'fit-content', none: 'none' }[k];
    if (!v && m[1] === 'max-w' && TW_CONT[k]) v = TW_CONT[k]; if (!v && m[1] === 'max-w' && k === 'prose') v = '65ch';
    if (!v) { v = twSp(k, false); if (v === 'auto' && m[1].startsWith('m')) v = null; }
    return v ? prop.map((p) => [p, v]) : null;
  }
  if ((m = /^gap(?:-([xy]))?-(.+)$/.exec(u))) { const v = twSp(m[2], false); if (v === null || v === 'auto') return null; return [[m[1] === 'x' ? 'column-gap' : m[1] === 'y' ? 'row-gap' : 'gap', v]]; }
  if ((m = /^basis-(.+)$/.exec(u))) { const v = twSp(m[1], false); return v ? [['flex-basis', v]] : null; }
  if ((m = /^grid-(cols|rows)-(\d+|none)$/.exec(u))) return [[`grid-template-${m[1] === 'cols' ? 'columns' : 'rows'}`, m[2] === 'none' ? 'none' : `repeat(${m[2]}, minmax(0, 1fr))`]];
  if ((m = /^(col|row)-span-(\d+|full)$/.exec(u))) return [[`grid-${m[1] === 'col' ? 'column' : 'row'}`, m[2] === 'full' ? '1 / -1' : `span ${m[2]} / span ${m[2]}`]];
  if ((m = /^text-(xs|sm|base|lg|xl|[2-9]xl)$/.exec(u))) return [['font-size', TW_TEXT[m[1]][0]], ['line-height', TW_TEXT[m[1]][1]]];
  if ((m = /^leading-(\d+(?:\.\d+)?)$/.exec(u))) return [['line-height', `${fmt(+m[1] * 0.25)}rem`]];
  if ((m = /^text-\[(.+)\]$/.exec(u)) && /^[\d.]+(px|rem|em|%|vw|ch)$/.test(m[1])) return [['font-size', m[1]]];
  if ((m = /^text-(.+)$/.exec(u))) { const c = twColor(m[1]); return c ? [['color', c]] : null; }
  if ((m = /^bg-(.+)$/.exec(u))) { const c = twColor(m[1]); return c ? [['background-color', c]] : null; }
  if ((m = /^border(?:-([trblxy]))?(?:-(\d+))?$/.exec(u)) && !neg) { const w = (m[2] ?? '1') + 'px'; if (!m[1]) return [['border-style', 'solid'], ['border-width', w]]; return [['border-style', 'solid'], ...SIDE[m[1]].map((s) => [`border-${s}-width`, w])]; }
  if ((m = /^border-(.+)$/.exec(u))) { const c = twColor(m[1]); return c ? [['border-color', c]] : null; }
  if ((m = /^rounded(?:-([trblse]|tl|tr|br|bl))?(?:-(none|xs|sm|md|lg|xl|2xl|3xl|4xl|full))?$/.exec(u))) {
    const v = TW_RAD[m[2] ?? '']; const sides = { t: ['top-left', 'top-right'], r: ['top-right', 'bottom-right'], b: ['bottom-left', 'bottom-right'], l: ['top-left', 'bottom-left'], tl: ['top-left'], tr: ['top-right'], br: ['bottom-right'], bl: ['bottom-left'] };
    if (!m[1]) return [['border-radius', v]]; if (!sides[m[1]]) return null; return sides[m[1]].map((s) => [`border-${s}-radius`, v]);
  }
  if ((m = /^shadow-(.+)$/.exec(u)) && TW_SHADOW[m[1]]) return [['box-shadow', TW_SHADOW[m[1]]]];
  if (u === 'shadow') return [['box-shadow', TW_SHADOW.sm]];
  if ((m = /^opacity-(\d+)$/.exec(u))) return [['opacity', fmt(+m[1] / 100)]];
  if ((m = /^duration-(\d+)$/.exec(u))) return [['transition-duration', m[1] + 'ms']];
  if ((m = /^delay-(\d+)$/.exec(u))) return [['transition-delay', m[1] + 'ms']];
  if ((m = /^scale-(\d+)$/.exec(u))) return [['scale', m[1] + '%']];
  if ((m = /^rotate-(\d+)$/.exec(u))) return [['rotate', (neg ? '-' : '') + m[1] + 'deg']];
  if ((m = /^translate-([xy])-(.+)$/.exec(u))) { const v = twSp(m[2], neg); return v ? [['translate', m[1] === 'x' ? `${v} 0` : `0 ${v}`]] : null; }
  if ((m = /^blur(?:-(sm|md|lg|xl))?$/.exec(u))) return [['filter', `blur(${{ undefined: '8px', sm: '4px', md: '12px', lg: '16px', xl: '24px' }[m[1]]})`]];
  return null;
}
function twConvert(list, o) {
  const groups = new Map(), media = new Map(), missed = [];
  const esc2 = (c) => c.replace(/([^\w-])/g, '\\$1');
  for (const raw of list.split(/\s+/).filter(Boolean)) {
    const parts = []; { let d = 0, cur = ''; for (const ch of raw) { if (ch === '[') d++; if (ch === ']') d--; if (ch === ':' && !d) { parts.push(cur); cur = ''; } else cur += ch; } parts.push(cur); }
    let util = parts.pop(), imp = false; if (util.startsWith('!')) { imp = true; util = util.slice(1); } if (util.endsWith('!')) { imp = true; util = util.slice(0, -1); }
    const decls = twUtil(util); if (!decls) { missed.push(raw); continue; }
    let pseudo = '', mq = [], pre = '', ok = true;
    for (const v of parts) {
      if (TW_BP[v]) mq.push(`(min-width: ${TW_BP[v]})`);
      else if (v === 'dark') mq.push('(prefers-color-scheme: dark)');
      else if (v === 'motion-reduce') mq.push('(prefers-reduced-motion: reduce)'); else if (v === 'motion-safe') mq.push('(prefers-reduced-motion: no-preference)'); else if (v === 'print') mq.push('print');
      else if (['hover', 'focus', 'active', 'focus-visible', 'focus-within', 'disabled', 'checked', 'visited', 'first-child', 'last-child', 'empty', 'required', 'invalid', 'placeholder-shown'].includes(v)) pseudo += ':' + v;
      else if (v === 'first') pseudo += ':first-child'; else if (v === 'last') pseudo += ':last-child'; else if (v === 'odd') pseudo += ':nth-child(odd)'; else if (v === 'even') pseudo += ':nth-child(2n)';
      else if (v === 'before' || v === 'after') pseudo += '::' + v; else if (v === 'placeholder') pseudo += '::placeholder';
      else if (v.startsWith('group-')) { pre = '.group' + (v === 'group-hover' ? ':hover' : v === 'group-focus' ? ':focus' : ''); if (!/^group-(hover|focus)$/.test(v)) ok = false; }
      else ok = false;
    }
    if (!ok) { missed.push(raw); continue; }
    const sel = `${pre ? pre + ' ' : ''}.${esc2(raw)}${pseudo}`, key = mq.join(' and ');
    const body = decls.map(([p, v]) => `  ${p}: ${v}${imp ? ' !important' : ''};`).join('\n');
    const target = key ? (media.get(key) || media.set(key, []).get(key)) : (groups.get('') || groups.set('', []).get(''));
    target.push(`${sel} {\n${body}\n}`);
  }
  const bpOrder = (k) => [...Object.values(TW_BP)].findIndex((x) => k.includes(x)) + (k.includes('prefers') ? 10 : 0);
  let out = (groups.get('') || []).join('\n');
  for (const [k, rules] of [...media].sort((a, b) => bpOrder(a[0]) - bpOrder(b[0]))) out += `${out ? '\n' : ''}@media ${k} {\n${rules.map((r) => r.replace(/^/gm, '  ')).join('\n')}\n}`;
  return { css: out, missed };
}
T.push({
  id: 'tailwind-to-css', cat: CSSC, title: 'Tailwind Classes to Plain CSS Rules (with hover and responsive variants)',
  desc: 'Expand a list of Tailwind v4 utility classes into plain CSS rules, including colour utilities, hover and focus states, md: breakpoints and dark mode. Unknown classes are listed.',
  labels: ['Class list'], placeholder: ['flex items-center px-4 hover:bg-blue-500'],
  sample: 'flex items-center gap-4 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md md:px-6 md:text-base dark:bg-blue-400 w-1/2 mt-[13px] sm:hover:opacity-75 custom-class',
  run: ([s]) => {
    if (!s.trim()) throw new Error('Paste a list of Tailwind classes');
    const { css, missed } = twConvert(s);
    if (!css) throw new Error('None of the classes are in the supported subset: ' + missed.slice(0, 5).join(', '));
    return css + '\n' + (missed.length ? `\n/* Not converted (${missed.length}): ${missed.join(' ')} */\n` : '') +
      '\n/* Subset converter: it covers common layout, spacing, sizing, typography, colour, border, shadow, opacity and basic transform utilities from the Tailwind v4 default theme, with spacing written in rem. Colours use the default OKLCH palette. Custom theme values and plugins are not known. */\n';
  },
});

/* ---------- 753 LaTeX to MathML ---------- */
const LX_SYM = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω' };
const LX_OP = { cdot: '⋅', times: '×', div: '÷', pm: '±', mp: '∓', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', propto: '∝', ll: '≪', gg: '≫', in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇', cup: '∪', cap: '∩', setminus: '∖', emptyset: '∅', forall: '∀', exists: '∃', neg: '¬', lnot: '¬', land: '∧', wedge: '∧', lor: '∨', vee: '∨', to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', iff: '⟺', implies: '⟹', mapsto: '↦', uparrow: '↑', downarrow: '↓', infty: '∞', partial: '∂', nabla: '∇', ldots: '…', dots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱', circ: '∘', bullet: '∙', star: '⋆', ast: '∗', oplus: '⊕', otimes: '⊗', angle: '∠', perp: '⊥', parallel: '∥', mid: '∣', prime: '′', degree: '°', hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', langle: '⟨', rangle: '⟩', lbrace: '{', rbrace: '}', lceil: '⌈', rceil: '⌉', lfloor: '⌊', rfloor: '⌋', '|': '‖', vert: '|', Vert: '‖', colon: ':', '%': '%', '&': '&', '#': '#', _: '_', '{': '{', '}': '}', '$': '$' };
const LX_BIG = { sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', oint: '∮', bigcup: '⋃', bigcap: '⋂', lim: 'lim', max: 'max', min: 'min', sup: 'sup', inf: 'inf', limsup: 'lim sup', liminf: 'lim inf' };
const LX_FUN = new Set('sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln lg exp det gcd deg dim ker hom Pr arg'.split(' '));
const LX_SPACE = { ',': '0.1667em', ':': '0.2222em', ';': '0.2778em', '!': '-0.1667em', quad: '1em', qquad: '2em', ' ': '0.25em' };
const LX_ACC = { hat: '^', widehat: '^', tilde: '˜', widetilde: '˜', bar: '¯', overline: '¯', vec: '→', dot: '˙', ddot: '¨', check: 'ˇ', acute: '´', grave: '`', overrightarrow: '→' };
const LX_VAR = { mathbf: 'bold', boldsymbol: 'bold-italic', mathrm: 'normal', mathit: 'italic', mathbb: 'double-struck', mathcal: 'script', mathfrak: 'fraktur', mathsf: 'sans-serif', mathtt: 'monospace' };
const LX_ENV = { matrix: ['', ''], pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'], vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'], cases: ['{', ''], aligned: ['', ''], array: ['', ''], align: ['', ''] };
function latexToMathml(src) {
  const toks = []; { const re = /\\([A-Za-z]+|.)|(\s+)|(\d+(?:\.\d+)?)|([A-Za-z])|(.)/gs; let m; while ((m = re.exec(src))) { if (m[2]) continue; toks.push(m[1] !== undefined ? { c: m[1] } : m[3] ? { n: m[3] } : m[4] ? { l: m[4] } : { o: m[5] }); } }
  let p = 0; const peek = () => toks[p], next = () => toks[p++];
  const fail = (m) => { throw new Error(m); };
  const X = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const mo = (s, a = '') => `<mo${a}>${X(s)}</mo>`;
  const row = (arr) => (arr.length === 1 ? arr[0] : `<mrow>${arr.join('')}</mrow>`);
  function group() { // after '{'
    const arr = seq((t) => t.o === '}'); if (!peek()) fail('Missing closing }'); next(); return row(arr);
  }
  function arg() { // one argument: {group} or single token
    const t = peek(); if (!t) fail('A command is missing its argument');
    if (t.o === '{') { next(); return group(); }
    return atom(true);
  }
  function rawText() { const t = next(); if (!t || t.o !== '{') fail('Expected { after the command'); let d = 1, s = ''; while (peek()) { const k = next(); if (k.o === '{') d++; if (k.o === '}') { d--; if (!d) return s; } s += k.c !== undefined ? '\\' + k.c : k.n ?? k.l ?? k.o; } fail('Missing closing }'); }
  function cells() { // rows of cells until \end
    const rows = [[[]]]; for (;;) { const t = peek(); if (!t) fail('Missing \\end for \\begin'); if (t.c === 'end') { next(); const nm = rawText(); return { rows, nm }; } if (t.o === '&') { next(); rows[rows.length - 1].push([]); continue; } if (t.c === '\\') { next(); rows.push([[]]); continue; } const a = atomSeq(); rows[rows.length - 1][rows[rows.length - 1].length - 1].push(a); }
  }
  function atomSeq() { return scripts(atom(false)); }
  function seq(stop) { const arr = []; while (peek() && !stop(peek())) { if (peek().o === '&' || peek().c === '\\' || peek().c === 'end' || peek().c === 'right') fail('Unexpected ' + (peek().o || '\\' + peek().c)); arr.push(atomSeq()); } return arr; }
  function scripts(base, bigOp) {
    let sub = null, sup = null;
    for (;;) {
      const t = peek(); if (!t) break;
      if (t.o === "'") { next(); sup = (sup ? sup : '') + mo('′'); continue; }
      if (t.o === '^') { next(); sup = arg(); continue; }
      if (t.o === '_') { next(); sub = arg(); continue; }
      break;
    }
    if (sub === null && sup === null) return base;
    if (bigOp) return sub !== null && sup !== null ? `<munderover>${base}${sub}${sup}</munderover>` : sub !== null ? `<munder>${base}${sub}</munder>` : `<mover>${base}${sup}</mover>`;
    return sub !== null && sup !== null ? `<msubsup>${base}${sub}${sup}</msubsup>` : sub !== null ? `<msub>${base}${sub}</msub>` : `<msup>${base}${sup}</msup>`;
  }
  function atom(single) {
    const t = next(); if (!t) fail('Unexpected end of input');
    if (t.n) return `<mn>${t.n}</mn>`;
    if (t.l) return `<mi>${t.l}</mi>`;
    if (t.o !== undefined) {
      if (t.o === '{') return group();
      if (t.o === '}') fail('Unexpected }');
      if (t.o === '^' || t.o === '_') fail(`${t.o} needs something before it`);
      if (t.o === '&') fail('& outside a matrix');
      if ('+-=<>!,;:/()[]|*.?@~'.includes(t.o)) return t.o === '-' ? mo('−') : t.o === '*' ? mo('∗') : mo(t.o, '|()[]'.includes(t.o) ? '' : '');
      return `<mo>${X(t.o)}</mo>`;
    }
    const c = t.c;
    if (Object.hasOwn(LX_SYM, c)) return `<mi>${LX_SYM[c]}</mi>`;
    if (Object.hasOwn(LX_BIG, c)) { const big = c === 'lim' || ['max', 'min', 'sup', 'inf', 'limsup', 'liminf'].includes(c) ? `<mo movablelimits="true">${LX_BIG[c]}</mo>` : `<mo largeop="true" movablelimits="true">${LX_BIG[c]}</mo>`; return single ? big : scripts(big, c !== 'int' && c !== 'iint' && c !== 'oint'); }
    if (LX_FUN.has(c)) return `<mi>${c}</mi><mo>&#x2061;</mo>`;
    if (Object.hasOwn(LX_OP, c)) return mo(LX_OP[c]);
    if (Object.hasOwn(LX_SPACE, c)) return `<mspace width="${LX_SPACE[c]}"/>`;
    if (c === 'frac' || c === 'dfrac' || c === 'tfrac') { const a = arg(), b = arg(); return `<mfrac>${a}${b}</mfrac>`; }
    if (c === 'binom') { const a = arg(), b = arg(); return `${mo('(')}<mfrac linethickness="0">${a}${b}</mfrac>${mo(')')}`; }
    if (c === 'sqrt') { let idx = null; if (peek() && peek().o === '[') { next(); const arr = seq((k) => k.o === ']'); if (!peek()) fail('Missing ]'); next(); idx = row(arr); } const a = arg(); return idx ? `<mroot>${a}${idx}</mroot>` : `<msqrt>${a}</msqrt>`; }
    if (c === 'text' || c === 'mbox' || c === 'textrm') return `<mtext>${X(rawText())}</mtext>`;
    if (c === 'operatorname') return `<mi>${X(rawText())}</mi>`;
    if (Object.hasOwn(LX_VAR, c)) { const a = arg(); return `<mstyle mathvariant="${LX_VAR[c]}">${a}</mstyle>`; }
    if (Object.hasOwn(LX_ACC, c)) { const a = arg(); return `<mover accent="true">${a}${mo(LX_ACC[c])}</mover>`; }
    if (c === 'underline') { const a = arg(); return `<munder>${a}${mo('_')}</munder>`; }
    if (c === 'overset') { const a = arg(), b = arg(); return `<mover>${b}${a}</mover>`; }
    if (c === 'underset') { const a = arg(), b = arg(); return `<munder>${b}${a}</munder>`; }
    if (c === 'left') {
      const open = next(); const o = open.o ?? (open.c === 'langle' ? '⟨' : open.c === 'lbrace' || open.c === '{' ? '{' : open.c === 'lceil' ? '⌈' : open.c === 'lfloor' ? '⌊' : open.c === '|' ? '‖' : open.c === 'vert' ? '|' : null);
      if (o === null || o === undefined) fail('Unsupported delimiter after \\left');
      const body = []; for (;;) { const k = peek(); if (!k) fail('\\left without \\right'); if (k.c === 'right') { next(); const cl = next(); if (!cl) fail('Missing delimiter after \\right'); const q = cl.o ?? (cl.c === 'rangle' ? '⟩' : cl.c === 'rbrace' || cl.c === '}' ? '}' : cl.c === 'rceil' ? '⌉' : cl.c === 'rfloor' ? '⌋' : cl.c === '|' ? '‖' : cl.c === 'vert' ? '|' : null); if (q === null || q === undefined) fail('Unsupported delimiter after \\right'); return `<mrow>${o === '.' ? '' : mo(o, ' fence="true" stretchy="true"')}${body.join('')}${q === '.' ? '' : mo(q, ' fence="true" stretchy="true"')}</mrow>`; } if (k.o === '&' || k.c === '\\') fail('Unexpected & or \\\\ inside \\left ... \\right'); body.push(atomSeq()); }
    }
    if (c === 'right') fail('\\right without \\left');
    if (c === 'begin') {
      const nm = rawText(); if (!LX_ENV[nm]) fail(`Unsupported environment "${nm}"`);
      if (nm === 'array') { if (peek() && peek().o === '{') rawText(); }
      const { rows, nm: en } = cells(); if (en !== nm) fail(`\\begin{${nm}} ends with \\end{${en}}`);
      const tbl = `<mtable${nm === 'cases' ? ' columnalign="left left"' : nm === 'aligned' || nm === 'align' ? ' columnalign="right left"' : ''}>${rows.filter((r) => r.some((cell) => cell.length)).map((r) => `<mtr>${r.map((cell) => `<mtd>${row(cell.length ? cell : [''])}</mtd>`).join('')}</mtr>`).join('')}</mtable>`;
      const [l, r] = LX_ENV[nm]; return `<mrow>${l ? mo(l, ' fence="true" stretchy="true"') : ''}${tbl}${r ? mo(r, ' fence="true" stretchy="true"') : ''}</mrow>`;
    }
    if (c === 'displaystyle' || c === 'textstyle' || c === 'limits' || c === 'nolimits') return '';
    fail(`Unsupported command \\${c}`);
  }
  const all = seq(() => false);
  if (!all.length) fail('Write an expression first');
  return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${row(all)}</math>`;
}
T.push({
  id: 'latex-to-mathml', cat: 'Markup Converters', title: 'LaTeX Math to MathML Converter with Live Preview',
  desc: 'Convert LaTeX math (fractions, roots, sums, integrals, scripts, Greek, matrices, cases, left/right delimiters) into MathML that browsers typeset natively. Copy the MathML or paste it into HTML.',
  labels: ['LaTeX math (separate formulas with a blank line)'], placeholder: ['\\frac{a}{b} + \\sqrt{x}'],
  sample: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} \\quad \\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n\n\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}\n\nA = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
  run: ([s]) => {
    const blocks = s.split(/\n\s*\n/).map((x) => x.replace(/\n/g, ' ').trim()).filter(Boolean);
    const mm = blocks.map((b) => latexToMathml(b.replace(/^\${1,2}|\${1,2}$/g, '')));
    const mml = mm.join('\n');
    return { text: mml + '\n\nBrowsers with MathML Core (Chrome 109 and later, Firefox, Safari) draw this natively. There is no SVG export because no font metrics are bundled; use the browser print or screenshot tools. Only the commands in the converter\'s built-in subset are supported; others raise an error.', html: page('math{font-size:1.4em;margin:10px 0;display:block}', mml) };
  },
});

/* ---------- 765 reStructuredText to HTML (subset) ---------- */
function rstToHtml(src) {
  const warn = [], targets = {};
  const lines = src.replace(/\r/g, '').replace(/\t/g, '        ').split('\n');
  lines.forEach((l, i) => { const m = /^\.\. _([^:]+):\s*(\S.*)?$/.exec(l); if (m) { let u = (m[2] || '').trim(); if (!u && lines[i + 1]) u = lines[i + 1].trim(); targets[m[1].trim().toLowerCase().replace(/`/g, '')] = u; } });
  const E = esc;
  const inline = (t, ln) => {
    const hold = []; const ph = (h) => { hold.push(h); return `\u0000${hold.length - 1}\u0000`; };
    t = t.replace(/\\(.)/g, (m, c) => ph(E(c)));
    t = t.replace(/``(.+?)``/g, (m, c) => ph(`<code>${E(c)}</code>`));
    t = t.replace(/:([a-z-]+):`([^`]+)`/g, (m, role, c) => ph(role === 'code' || role === 'literal' ? `<code>${E(c)}</code>` : role === 'emphasis' ? `<em>${E(c)}</em>` : role === 'strong' ? `<strong>${E(c)}</strong>` : role === 'sub' || role === 'subscript' ? `<sub>${E(c)}</sub>` : role === 'sup' || role === 'superscript' ? `<sup>${E(c)}</sup>` : (warn.push(`line ${ln}: role :${role}: is not supported, text kept`), E(c))));
    t = t.replace(/`([^`<]+?)\s*<([^>`]+)>`(__?)/g, (m, a, u) => { const url = /^[\w.+-]+_$/.test(u) ? targets[u.slice(0, -1).toLowerCase()] : u; if (!url || !/^(https?:|mailto:|ftp:|#|\/|\.\.?\/|[\w.-]+(\/|\.html?$))/i.test(url)) { warn.push(`line ${ln}: link target "${u}" skipped (unknown or not an allowed URL)`); return ph(E(a)); } return ph(`<a href="${E(url)}">${E(a)}</a>`); });
    t = t.replace(/`([^`]+)`_(?!_)/g, (m, a) => { const u = targets[a.toLowerCase()]; if (!u) { warn.push(`line ${ln}: unknown target name "${a}"`); return ph(E(a)); } return ph(`<a href="${E(u)}">${E(a)}</a>`); });
    t = t.replace(/\b([A-Za-z][\w-]*)_(?![\w_])/g, (m, a) => { const u = targets[a.toLowerCase()]; return u ? ph(`<a href="${E(u)}">${E(a)}</a>`) : m; });
    t = t.replace(/`([^`]+)`/g, (m, c) => ph(`<cite>${E(c)}</cite>`));
    t = E(t).replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>').replace(/\*(?=\S)([^*]+?)(?<=\S)\*/g, '<em>$1</em>');
    t = t.replace(/(^|[\s(])(https?:\/\/[^\s<>"')]+[^\s<>"')\].,:;!?])/g, '$1<a href="$2">$2</a>');
    return t.replace(/\u0000(\d+)\u0000/g, (m, i) => hold[+i]);
  };
  const ADORN = /^([!-/:-@[-`{-~])\1{3,}\s*$/, ADORN2 = /^([!-/:-@[-`{-~])\1+\s*$/;
  const styles = [];
  const indentOf = (l) => /^ */.exec(l)[0].length;
  function blocks(L, base) {
    const out = []; let i = 0;
    const blank = (l) => l === undefined || !l.trim();
    while (i < L.length) {
      const ln = L[i], no = base + i + 1;
      if (blank(ln)) { i++; continue; }
      const ind = indentOf(ln);
      if (ind > 0) { // block quote
        let j = i; while (j < L.length && (blank(L[j]) || indentOf(L[j]) > 0)) j++;
        const body = L.slice(i, j), mi = Math.min(...body.filter((x) => x.trim()).map(indentOf));
        out.push(`<blockquote>\n${blocks(body.map((x) => x.slice(mi)), base + i)}</blockquote>\n`); i = j; continue;
      }
      if (/^\.\. /.test(ln) || ln === '..') { // comment, target or directive
        let j = i + 1; while (j < L.length && (blank(L[j]) || indentOf(L[j]) > 0)) j++;
        const body = L.slice(i + 1, j); const d = /^\.\. ([\w-]+)::\s*(.*)$/.exec(ln);
        if (d) {
          const name = d[1], arg2 = d[2], inner = body.map((x) => x.slice(Math.min(...body.filter((y) => y.trim()).map(indentOf)))); while (inner.length && !inner[inner.length - 1].trim()) inner.pop();
          const opts = []; while (inner.length && /^:[\w-]+:/.test(inner[0])) opts.push(inner.shift()); while (inner.length && !inner[0].trim()) inner.shift();
          if (['note', 'warning', 'tip', 'important', 'caution', 'danger', 'hint', 'attention', 'error'].includes(name)) { const txt = [arg2, ...inner].join('\n'); out.push(`<div class="admonition ${name}">\n<p class="admonition-title">${name[0].toUpperCase() + name.slice(1)}</p>\n${blocks(txt.split('\n'), no)}</div>\n`); }
          else if (['code-block', 'code', 'sourcecode', 'highlight'].includes(name)) { if (name === 'highlight') { } else out.push(`<pre><code${arg2 ? ` class="language-${E(arg2.trim())}"` : ''}>${E(inner.join('\n'))}</code></pre>\n`); }
          else if (name === 'image' || name === 'figure') { const alt = (opts.find((x) => /^:alt:/.test(x)) || '').replace(/^:alt:\s*/, ''); if (/^(https?:\/\/|\/|\.\.?\/|[\w.-]+\.\w+$)/.test(arg2) && !/["<>\s]/.test(arg2)) out.push(`<img src="${E(arg2)}" alt="${E(alt)}">\n`); else warn.push(`line ${no}: image path skipped`); }
          else if (name === 'contents' || name === 'sectnum' || name === 'role' || name === 'default-role') warn.push(`line ${no}: directive "${name}" is ignored`);
          else warn.push(`line ${no}: unknown or unsupported directive "${name}" skipped`);
        }
        i = j; continue;
      }
      if (ADORN.test(ln) && (i + 1 >= L.length || blank(L[i + 1]))) { out.push('<hr>\n'); i++; continue; }
      // section title: over+under, or under only
      let title = null, lvStyle = null, used = 0;
      if (ADORN.test(ln) && L[i + 1] && L[i + 2] && ADORN.test(L[i + 2]) && L[i + 2][0] === ln[0]) { title = L[i + 1].trim(); lvStyle = 'o' + ln[0]; used = 3; if (ln.trim().length < title.length) warn.push(`line ${no}: title overline too short`); }
      else if (L[i + 1] && ADORN2.test(L[i + 1]) && (L[i + 1].trim().length >= 4 || L[i + 1].trim().length >= ln.trim().length) && !ADORN2.test(ln) && indentOf(ln) === 0) { title = ln.trim(); lvStyle = 'u' + L[i + 1][0]; used = 2; if (L[i + 1].trim().length < title.length) warn.push(`line ${no + 1}: title underline too short`); }
      if (title !== null) { let lv = styles.indexOf(lvStyle); if (lv < 0) { styles.push(lvStyle); lv = styles.length - 1; } const n = Math.min(6, lv + 1); out.push(`<h${n}>${inline(title, no)}</h${n}>\n`); i += used; continue; }
      let m;
      if ((m = /^([-*+•])\s+/.exec(ln)) || (m = /^((?:\d+|[a-zA-Z]|#)[.)]|\(\d+\))\s+/.exec(ln))) { // list
        const bullet = /^[-*+•]/.test(m[1]); const items = []; let cur = null;
        while (i < L.length) {
          const l = L[i]; const mm = bullet ? /^([-*+•])\s+(.*)$/.exec(l) : /^((?:\d+|[a-zA-Z]|#)[.)]|\(\d+\))\s+(.*)$/.exec(l);
          if (mm && indentOf(l) === 0) { cur = { off: mm[1].length + 1, lines: [mm[2]], no: base + i }; items.push(cur); i++; continue; }
          if (cur && (blank(l) && (i + 1 < L.length && (indentOf(L[i + 1]) >= cur.off || (bullet ? /^[-*+•]\s/.test(L[i + 1]) : /^((?:\d+|[a-zA-Z]|#)[.)]|\(\d+\))\s/.test(L[i + 1])))))) { cur.lines.push(''); i++; continue; }
          if (cur && !blank(l) && indentOf(l) > 0) { cur.lines.push(l.slice(Math.min(indentOf(l), cur.off))); i++; continue; }
          break;
        }
        const first = /^\d/.test(m[1]) ? m[1].replace(/\D/g, '') : '';
        const tag = bullet ? 'ul' : 'ol';
        out.push(`<${tag}${!bullet && first && first !== '1' ? ` start="${first}"` : ''}>\n${items.map((it) => { const inner = blocks(it.lines, it.no); const tight = !it.lines.some((x) => !x.trim()); return `<li>${tight && inner.startsWith('<p>') && (inner.match(/<p>/g) || []).length === 1 ? inner.replace(/^<p>([\s\S]*?)<\/p>\n/, '$1\n') : inner}</li>\n`; }).join('')}</${tag}>\n`);
        continue;
      }
      if ((m = /^:([^:\s][^:]*):\s*(.*)$/.exec(ln))) { // field list
        const fields = []; while (i < L.length && (m = /^:([^:\s][^:]*):\s*(.*)$/.exec(L[i]))) { const body = [m[2]]; i++; while (i < L.length && !blank(L[i]) && indentOf(L[i]) > 0) { body.push(L[i].trim()); i++; } fields.push(`<dt>${inline(m[1], no)}</dt><dd>${inline(body.join(' '), no)}</dd>`); while (i < L.length && blank(L[i])) i++; }
        out.push(`<dl class="field-list">\n${fields.join('\n')}\n</dl>\n`); continue;
      }
      // paragraph (or definition list or literal block lead-in)
      let j = i; while (j < L.length && !blank(L[j]) && (j === i || indentOf(L[j]) === 0 || j === i + 1)) { if (j > i && indentOf(L[j]) > 0) break; j++; }
      if (L[i + 1] !== undefined && !blank(L[i + 1]) && indentOf(L[i + 1]) > 0) { // definition list
        const defs = []; let k = i;
        while (k < L.length && !blank(L[k]) && indentOf(L[k]) === 0 && L[k + 1] !== undefined && !blank(L[k + 1]) && indentOf(L[k + 1]) > 0) {
          const term = L[k].trim(); let e = k + 1; while (e < L.length && (!blank(L[e]) && indentOf(L[e]) > 0 || (blank(L[e]) && e + 1 < L.length && indentOf(L[e + 1]) > 0))) e++;
          const body = L.slice(k + 1, e), mi = Math.min(...body.filter((x) => x.trim()).map(indentOf));
          defs.push(`<dt>${inline(term, base + k + 1)}</dt>\n<dd>${blocks(body.map((x) => x.slice(mi)), base + k + 1)}</dd>`); k = e; while (k < L.length && blank(L[k])) k++;
        }
        out.push(`<dl>\n${defs.join('\n')}\n</dl>\n`); i = k; continue;
      }
      const para = L.slice(i, j).map((x) => x.trim()).join('\n'); i = j;
      if (/::$/.test(para)) { // literal block follows
        let k = i; while (k < L.length && blank(L[k])) k++;
        if (k < L.length && indentOf(L[k]) > 0) {
          let e = k; while (e < L.length && (blank(L[e]) || indentOf(L[e]) > 0)) e++;
          const body = L.slice(k, e); while (body.length && !body[body.length - 1].trim()) body.pop(); const mi = Math.min(...body.filter((x) => x.trim()).map(indentOf));
          const lead = para === '::' ? '' : para.replace(/\s*::$/, para.endsWith(' ::') ? '' : ':').trim();
          if (lead) out.push(`<p>${inline(lead, base + i)}</p>\n`);
          out.push(`<pre><code>${E(body.map((x) => x.slice(mi)).join('\n'))}</code></pre>\n`); i = e; continue;
        }
        warn.push(`line ${base + i}: literal block expected after "::"`);
      }
      out.push(`<p>${inline(para, base + i)}</p>\n`);
    }
    return out.join('');
  }
  return { html: blocks(lines, 0), warn };
}
T.push({
  id: 'rst-to-html', cat: 'Markup Converters', title: 'reStructuredText to HTML Converter (Common Subset, Offline)',
  desc: 'Render common reStructuredText to HTML in the browser: section titles, paragraphs, lists, literal blocks, code-block, admonitions, links and targets, with warnings that carry line numbers.',
  labels: ['reStructuredText'], placeholder: ['Title\n=====\n\nParagraph with **bold**.'],
  sample: 'Project title\n=============\n\nA short intro with **bold**, *emphasis*, ``code`` and a `link <https://example.com>`_.\n\nInstall\n-------\n\n- first item\n- second item with `docs`_\n\n1. step one\n2. step two\n\n.. note:: Remember to run the tests.\n\n.. code-block:: python\n\n   print("hello")\n\nExample::\n\n    literal text\n    stays as is\n\n.. _docs: https://example.org/docs\n\n.. unknown-thing:: ignored\n',
  run: ([s]) => {
    if (!s.trim()) throw new Error('Paste some reStructuredText first');
    const { html, warn } = rstToHtml(s);
    return { text: html + (warn.length ? `\n<!-- Warnings:\n${warn.map((w) => '  ' + w.replace(/--/g, '- -')).join('\n')}\n-->` : '') + '\n<!-- Hand-written subset converter, not docutils. Tables, footnotes, line blocks, substitutions and most directives are not supported. -->', html: page('pre{background:#f3f4f6;padding:8px;overflow:auto}.admonition{border:1px solid #999;border-left-width:4px;padding:4px 12px;margin:8px 0}.admonition-title{font-weight:bold;margin:4px 0}blockquote{border-left:3px solid #999;margin-left:0;padding-left:12px}', html) };
  },
});
export default T;

// Visual tools: Color, CSS, Images, SVG. Hand-written, no dependencies.
// Skipped on purpose (need models/server/heavy codecs): AI background remover, upscaler, HEIC decode, PDF, image-diff.
// Not here (other modules own them): EXIF viewer/remover, image redaction, QR/barcodes, css-minify.
// Simplifications: clip-path polygon editor is a text points editor (not drag); image-cropper is numeric/ratio crop;
// contrast-checker, gradient, mesh, palette etc. are run()-based tools returning {text, html} (live preview via the generic UI).
// Pure tools run under Node; tools using canvas/File/Image are dom:true.

const T = [];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rd = (x, n = 2) => +(+x).toFixed(n);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const page = (body, css = '') => `<!doctype html><meta charset="utf-8"><style>body{margin:0;font:13px system-ui,sans-serif}${css}</style>${body}`;
const hex2 = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
const O = {
  n: (id, label, def, extra = {}) => ({ id, label, type: 'number', def, ...extra }),
  s: (id, label, def, choices) => ({ id, label, type: 'select', def, choices }),
  c: (id, label, def) => ({ id, label, type: 'color', def }),
  b: (id, label, def) => ({ id, label, type: 'checkbox', def }),
  t: (id, label, def) => ({ id, label, type: 'text', def }),
};

// ---------- color math ----------
const NAMES = Object.fromEntries('aliceblue:f0f8ff,antiquewhite:faebd7,aqua:00ffff,aquamarine:7fffd4,azure:f0ffff,beige:f5f5dc,bisque:ffe4c4,black:000000,blanchedalmond:ffebcd,blue:0000ff,blueviolet:8a2be2,brown:a52a2a,burlywood:deb887,cadetblue:5f9ea0,chartreuse:7fff00,chocolate:d2691e,coral:ff7f50,cornflowerblue:6495ed,cornsilk:fff8dc,crimson:dc143c,cyan:00ffff,darkblue:00008b,darkcyan:008b8b,darkgoldenrod:b8860b,darkgray:a9a9a9,darkgreen:006400,darkkhaki:bdb76b,darkmagenta:8b008b,darkolivegreen:556b2f,darkorange:ff8c00,darkorchid:9932cc,darkred:8b0000,darksalmon:e9967a,darkseagreen:8fbc8f,darkslateblue:483d8b,darkslategray:2f4f4f,darkturquoise:00ced1,darkviolet:9400d3,deeppink:ff1493,deepskyblue:00bfff,dimgray:696969,dodgerblue:1e90ff,firebrick:b22222,floralwhite:fffaf0,forestgreen:228b22,fuchsia:ff00ff,gainsboro:dcdcdc,ghostwhite:f8f8ff,gold:ffd700,goldenrod:daa520,gray:808080,green:008000,greenyellow:adff2f,honeydew:f0fff0,hotpink:ff69b4,indianred:cd5c5c,indigo:4b0082,ivory:fffff0,khaki:f0e68c,lavender:e6e6fa,lavenderblush:fff0f5,lawngreen:7cfc00,lemonchiffon:fffacd,lightblue:add8e6,lightcoral:f08080,lightcyan:e0ffff,lightgoldenrodyellow:fafad2,lightgray:d3d3d3,lightgreen:90ee90,lightpink:ffb6c1,lightsalmon:ffa07a,lightseagreen:20b2aa,lightskyblue:87cefa,lightslategray:778899,lightsteelblue:b0c4de,lightyellow:ffffe0,lime:00ff00,limegreen:32cd32,linen:faf0e6,magenta:ff00ff,maroon:800000,mediumaquamarine:66cdaa,mediumblue:0000cd,mediumorchid:ba55d3,mediumpurple:9370db,mediumseagreen:3cb371,mediumslateblue:7b68ee,mediumspringgreen:00fa9a,mediumturquoise:48d1cc,mediumvioletred:c71585,midnightblue:191970,mintcream:f5fffa,mistyrose:ffe4e1,moccasin:ffe4b5,navajowhite:ffdead,navy:000080,oldlace:fdf5e6,olive:808000,olivedrab:6b8e23,orange:ffa500,orangered:ff4500,orchid:da70d6,palegoldenrod:eee8aa,palegreen:98fb98,paleturquoise:afeeee,palevioletred:db7093,papayawhip:ffefd5,peachpuff:ffdab9,peru:cd853f,pink:ffc0cb,plum:dda0dd,powderblue:b0e0e6,purple:800080,rebeccapurple:663399,red:ff0000,rosybrown:bc8f8f,royalblue:4169e1,saddlebrown:8b4513,salmon:fa8072,sandybrown:f4a460,seagreen:2e8b57,seashell:fff5ee,sienna:a0522d,silver:c0c0c0,skyblue:87ceeb,slateblue:6a5acd,slategray:708090,snow:fffafa,springgreen:00ff7f,steelblue:4682b4,tan:d2b48c,teal:008080,thistle:d8bfd8,tomato:ff6347,turquoise:40e0d0,violet:ee82ee,wheat:f5deb3,white:ffffff,whitesmoke:f5f5f5,yellow:ffff00,yellowgreen:9acd32'.split(',').map((x) => x.split(':')));

const rgb2hsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m, l = (M + m) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return [hueOf(r, g, b, M, d), s * 100, l * 100];
};
function hueOf(r, g, b, M, d) {
  if (d === 0) return 0;
  const h = M === r ? ((g - b) / d) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}
const hsl2rgb = (h, s, l) => {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
  const a = s * Math.min(l, 1 - l), f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
};
const rgb2hsv = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m;
  return [hueOf(r, g, b, M, d), M === 0 ? 0 : (d / M) * 100, M * 100];
};
const hsv2rgb = (h, s, v) => {
  h = ((h % 360) + 360) % 360; s /= 100; v /= 100;
  const f = (n) => { const k = (n + h / 60) % 6; return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255; };
  return [f(5), f(3), f(1)];
};
const rgb2cmyk = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 100];
  return [(1 - r - k) / (1 - k) * 100, (1 - g - k) / (1 - k) * 100, (1 - b - k) / (1 - k) * 100, k * 100];
};
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const delin = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055);
const rgb2oklab = (r, g, b) => {
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const oklab2rgb = (L, a, b) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [delin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), delin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), delin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
};
const rgb2oklch = (r, g, b) => { const [L, a, bb] = rgb2oklab(r, g, b); return [L, Math.hypot(a, bb), ((Math.atan2(bb, a) * 180 / Math.PI) + 360) % 360]; };
const oklch2rgb = (L, C, H) => oklab2rgb(L, C * Math.cos(H * Math.PI / 180), C * Math.sin(H * Math.PI / 180));

function parseColor(str) {
  let s = String(str).trim().toLowerCase();
  if (!s) throw new Error('Empty color');
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (NAMES[s]) s = '#' + NAMES[s];
  let m = s.match(/^#?([0-9a-f]+)$/);
  if (m && [3, 4, 6, 8].includes(m[1].length)) {
    let x = m[1]; if (x.length < 6) x = [...x].map((c) => c + c).join('');
    return { r: parseInt(x.slice(0, 2), 16), g: parseInt(x.slice(2, 4), 16), b: parseInt(x.slice(4, 6), 16), a: x.length === 8 ? parseInt(x.slice(6, 8), 16) / 255 : 1 };
  }
  m = s.match(/^(rgba?|hsla?|hsv|hwb|oklch|oklab)?\s*\(([^)]*)\)$/) || (/^[\d.\s,%-]+$/.test(s) ? [0, 'rgb', s] : null);
  if (!m) throw new Error(`Unrecognized color: ${str}`);
  const fn = m[1] || 'rgb', p = m[2].split(/[\s,/]+/).filter(Boolean);
  if (p.length < 3) throw new Error(`Unrecognized color: ${str}`);
  const num = (v, scale = 1) => (v.endsWith('%') ? parseFloat(v) * scale : parseFloat(v));
  const alpha = p[3] != null ? (p[3].endsWith('%') ? parseFloat(p[3]) / 100 : parseFloat(p[3])) : 1;
  let rgb;
  if (fn.startsWith('rgb')) rgb = p.slice(0, 3).map((v) => num(v, 2.55));
  else if (fn.startsWith('hsl')) rgb = hsl2rgb(parseFloat(p[0]), parseFloat(p[1]), parseFloat(p[2]));
  else if (fn === 'hsv') rgb = hsv2rgb(parseFloat(p[0]), parseFloat(p[1]), parseFloat(p[2]));
  else if (fn === 'hwb') { const w = parseFloat(p[1]) / 100, k = parseFloat(p[2]) / 100; rgb = hsl2rgb(parseFloat(p[0]), 100, 50).map((c) => (c / 255 * (1 - w - k) + w) * 255); }
  else if (fn === 'oklch') rgb = oklch2rgb(num(p[0], 0.01), num(p[1], 0.004), parseFloat(p[2]));
  else rgb = oklab2rgb(num(p[0], 0.01), num(p[1], 0.004), num(p[2], 0.004));
  if (rgb.some((v) => Number.isNaN(v))) throw new Error(`Unrecognized color: ${str}`);
  return { r: clamp(rgb[0], 0, 255), g: clamp(rgb[1], 0, 255), b: clamp(rgb[2], 0, 255), a: clamp(alpha, 0, 1) };
}
const toHex = (c) => '#' + hex2(c.r) + hex2(c.g) + hex2(c.b) + (c.a < 1 ? hex2(c.a * 255) : '');
const fromRGB = ([r, g, b], a = 1) => ({ r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a });
const hexOf = (rgb) => toHex(fromRGB(rgb));
const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function apca(fg, bg) {
  const y = (c) => { const v = 0.2126729 * (c.r / 255) ** 2.4 + 0.7151522 * (c.g / 255) ** 2.4 + 0.072175 * (c.b / 255) ** 2.4; return v < 0.022 ? v + (0.022 - v) ** 1.414 : v; };
  const t = y(fg), b = y(bg);
  if (Math.abs(b - t) < 0.0005) return 0;
  if (b > t) { const S = (b ** 0.56 - t ** 0.57) * 1.14; return S < 0.1 ? 0 : (S - 0.027) * 100; }
  const S = (b ** 0.65 - t ** 0.62) * 1.14; return S > -0.1 ? 0 : (S + 0.027) * 100;
}
const textOn = (c) => (ratio(c, { r: 0, g: 0, b: 0 }) > ratio(c, { r: 255, g: 255, b: 255 }) ? '#000' : '#fff');
const rgbaStr = (c, a = c.a) => (a < 1 ? `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${rd(a, 3)})` : `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`);
const withAlpha = (hex, a) => rgbaStr(parseColor(hex), a);
const shade = (hex, dl) => { const c = parseColor(hex), [h, s, l] = rgb2hsl(c.r, c.g, c.b); return hexOf(hsl2rgb(h, s, clamp(l + dl, 0, 100))); };
const nearestName = (c) => {
  const t = rgb2oklab(c.r, c.g, c.b); let best, bd = 1e9;
  for (const [n, h] of Object.entries(NAMES)) { const o = rgb2oklab(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4), 16)); const d = (o[0] - t[0]) ** 2 + (o[1] - t[1]) ** 2 + (o[2] - t[2]) ** 2; if (d < bd) { bd = d; best = n; } }
  return [best, bd];
};
const swatches = (list) => page(list.map(([c, label]) => `<div style="flex:1;min-width:70px;height:110px;background:${esc(c)};color:${textOn(parseColor(c))};display:flex;align-items:flex-end;padding:6px;box-sizing:border-box;font:11px monospace">${esc(label ?? c)}</div>`).join(''), 'body{display:flex;flex-wrap:wrap}');
const lines = (s) => s.split(/\n/).map((x) => x.trim()).filter(Boolean);

// ---------- Color tools ----------
T.push({
  id: 'color-converter', cat: 'Color', title: 'Color Converter', desc: 'Convert between HEX, RGB, HSL, HSV, CMYK, OKLCH and CSS color names.',
  labels: ['Color (any format, one per line)'], sample: '#ff0000\nrgb(30, 144, 255)\nhsl(200 50% 40%)\noklch(70% 0.15 150)\ntomato',
  run([inp]) {
    return lines(inp).map((l) => {
      const c = parseColor(l), [r, g, b] = [c.r, c.g, c.b], R = Math.round;
      const [h, s, ll] = rgb2hsl(r, g, b), [hv, sv, v] = rgb2hsv(r, g, b), [cc, m, y, k] = rgb2cmyk(r, g, b), [L, C, H] = rgb2oklch(r, g, b);
      const al = c.a < 1 ? ` / ${rd(c.a, 3)}` : '';
      const [nm, d] = nearestName(c);
      return [`# ${l}`, `HEX:    ${toHex(c)}`, `RGB:    rgb(${R(r)} ${R(g)} ${R(b)}${al})`, `HSL:    hsl(${rd(h, 1)} ${rd(s, 1)}% ${rd(ll, 1)}%${al})`, `HSV:    hsv(${rd(hv, 1)} ${rd(sv, 1)}% ${rd(v, 1)}%)`,
        `CMYK:   cmyk(${rd(cc, 1)}% ${rd(m, 1)}% ${rd(y, 1)}% ${rd(k, 1)}%)`, `OKLCH:  oklch(${rd(L * 100, 2)}% ${rd(C, 4)} ${rd(H, 2)}${al})`, `Name:   ${d < 1e-6 ? nm : 'nearest: ' + nm}`].join('\n');
    }).join('\n\n');
  },
});

T.push({
  id: 'contrast-checker', cat: 'Color', title: 'Contrast Checker (WCAG + APCA)', desc: 'WCAG 2.x contrast ratio with AA/AAA verdicts, APCA Lc, and a live preview.',
  inputs: 2, labels: ['Foreground color', 'Background color'], sample: '#000000', sample2: '#ffffff',
  run([a, b]) {
    const f = parseColor(a), g = parseColor(b), r = ratio(f, g), lc = apca(f, g);
    const ok = (x) => (r >= x ? 'PASS' : 'FAIL');
    const text = [`Contrast ratio: ${rd(r, 2)}:1`, '', `WCAG AA  normal text (4.5:1): ${ok(4.5)}`, `WCAG AA  large text  (3:1):   ${ok(3)}`, `WCAG AA  UI/graphics (3:1):   ${ok(3)}`, `WCAG AAA normal text (7:1):   ${ok(7)}`, `WCAG AAA large text  (4.5:1): ${ok(4.5)}`, '',
      `APCA Lc: ${rd(lc, 1)}  (|Lc| >= 75 body text, >= 60 content, >= 45 large/headline, >= 30 spot text)`].join('\n');
    const html = page(`<div style="background:${esc(toHex(g))};color:${esc(toHex(f))};padding:20px"><div style="font-size:28px;font-weight:700">Large heading sample</div><p style="font-size:16px">Normal body text sample: the quick brown fox jumps over the lazy dog.</p><p style="font-size:12px">Small text sample.</p></div>`);
    return { text, html };
  },
});

function schemeColors(c, scheme) {
  const [h, s, l] = rgb2hsl(c.r, c.g, c.b), at = (d) => hexOf(hsl2rgb(h + d, s, l));
  const mix = (t, to) => hexOf([c.r, c.g, c.b].map((v) => v + (to - v) * t));
  const SC = { complementary: [0, 180], analogous: [-30, 0, 30], triadic: [0, 120, 240], tetradic: [0, 90, 180, 270], 'split-complementary': [0, 150, 210] };
  if (SC[scheme]) return SC[scheme].map((d, i) => [at(d), `${i + 1}`]);
  if (scheme === 'shades') return Array.from({ length: 9 }, (_, i) => [mix(i / 9, 0), `${(i + 1) * 100}`]);
  if (scheme === 'tints') return Array.from({ length: 9 }, (_, i) => [mix(i / 9, 255), `${(i + 1) * 100}`]);
  const W = { 50: [0.95, 255], 100: [0.88, 255], 200: [0.75, 255], 300: [0.55, 255], 400: [0.3, 255], 500: [0, 0], 600: [0.12, 0], 700: [0.28, 0], 800: [0.44, 0], 900: [0.6, 0] };
  return Object.entries(W).map(([k, [t, to]]) => [mix(t, to), k]);
}
T.push({
  id: 'palette-generator', cat: 'Color', title: 'Color Palette Generator', desc: 'Generate complementary, analogous, triadic, tetradic, shade/tint scales from a base color. Exports CSS variables and Tailwind config.',
  labels: ['Base color'], sample: '#3b82f6', opts: [O.s('scheme', 'Scheme', 'complementary', ['complementary', 'analogous', 'triadic', 'tetradic', 'split-complementary', 'tailwind-scale', 'shades', 'tints'])],
  run([inp], { scheme }) {
    const cols = schemeColors(parseColor(inp), scheme), scale = ['tailwind-scale', 'shades', 'tints'].includes(scheme);
    const name = (l, i) => (scale ? `brand-${l}` : `color-${i + 1}`);
    const css = `:root {\n${cols.map(([c, l], i) => `  --${name(l, i)}: ${c};`).join('\n')}\n}`;
    const tw = `// tailwind.config.js\ntheme: { extend: { colors: {\n${scale ? `  brand: {\n${cols.map(([c, l]) => `    ${l}: '${c}',`).join('\n')}\n  },` : cols.map(([c], i) => `  'color-${i + 1}': '${c}',`).join('\n')}\n} } }`;
    return { text: `${cols.map(([c]) => c).join('  ')}\n\n/* CSS variables */\n${css}\n\n${tw}`, html: swatches(cols.map(([c, l]) => [c, `${l} ${c}`])) };
  },
});

const SIM = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
function simulate([r, g, b], mode) {
  if (mode === 'achromatopsia') { const y = delin(lum({ r, g, b })); return [y, y, y]; }
  const v = [lin(r), lin(g), lin(b)];
  return SIM[mode].map((row) => delin(clamp(row[0] * v[0] + row[1] * v[1] + row[2] * v[2], 0, 1)));
}

// ---------- DOM helpers (only called from render()/dom tools) ----------
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e && k !== 'list') e[k] = v;
    else e.setAttribute(k, v);
  }
  e.append(...kids.flat().filter((x) => x != null));
  return e;
}
const loadImage = (f) => new Promise((res, rej) => {
  const u = URL.createObjectURL(f), i = new Image();
  i.onload = () => { URL.revokeObjectURL(u); res(i); };
  i.onerror = () => rej(new Error('Cannot decode ' + (f.name || 'image')));
  i.src = u;
});
const mkCanvas = (w, hh) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(hh)); return c; };
const drawFit = (img, maxW) => { const k = Math.min(1, maxW / img.naturalWidth), c = mkCanvas(img.naturalWidth * k, img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c; };
const copy = (t) => navigator.clipboard?.writeText(t);

function medianCut(px, n) {
  let boxes = [px];
  while (boxes.length < n) {
    let bi = -1, br = -1, ch = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) { let lo = 255, hi = 0; for (const p of b) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; } if (hi - lo > br) { br = hi - lo; bi = i; ch = c; } }
    });
    if (bi < 0 || br <= 0) break;
    const b = boxes[bi].sort((x, y) => x[ch] - y[ch]), mid = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  return boxes.filter((b) => b.length).map((b) => ({ rgb: [0, 1, 2].map((c) => Math.round(b.reduce((s, p) => s + p[c], 0) / b.length)), n: b.length })).sort((a, b) => b.n - a.n);
}
function pixelsOf(img, max = 100) {
  const c = drawFit(img, max), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, px = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]);
  return px;
}

T.push({
  id: 'color-blindness-simulator', cat: 'Color', title: 'Color Blindness Simulator', desc: 'See colors or an image as people with protanopia, deuteranopia, tritanopia or achromatopsia would.', custom: true, dom: true,
  render(el) {
    const ta = h('textarea', { spellcheck: false, value: '#e63946\n#2a9d8f\n#264653\n#f4a261\n#457b9d', style: 'min-height:90px' });
    const file = h('input', { type: 'file', accept: 'image/*' }), out = h('div');
    let img = null;
    const modes = ['normal', 'protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];
    function draw() {
      out.replaceChildren();
      let cols = []; try { cols = lines(ta.value).map(parseColor); } catch (e) { out.append(h('pre', { className: 'out err' }, e.message)); return; }
      for (const m of modes) {
        const sec = h('div', {}, h('label', {}, m));
        if (cols.length) sec.append(h('div', { style: 'display:flex' }, ...cols.map((c) => { const s = m === 'normal' ? [c.r, c.g, c.b] : simulate([c.r, c.g, c.b], m); return h('div', { style: `flex:1;height:48px;background:${hexOf(s)};color:${textOn(fromRGB(s))};font:11px monospace;padding:4px` }, hexOf(s)); })));
        if (img) {
          const cv = drawFit(img, 360), ctx = cv.getContext('2d');
          if (m !== 'normal') { const id = ctx.getImageData(0, 0, cv.width, cv.height), d = id.data; for (let i = 0; i < d.length; i += 4) { const s = simulate([d[i], d[i + 1], d[i + 2]], m); d[i] = s[0]; d[i + 1] = s[1]; d[i + 2] = s[2]; } ctx.putImageData(id, 0, 0); }
          cv.className = 'prev'; sec.append(cv);
        }
        out.append(sec);
      }
    }
    ta.addEventListener('input', draw);
    file.addEventListener('change', async () => { img = file.files[0] ? await loadImage(file.files[0]).catch(() => null) : null; draw(); });
    el.append(h('label', {}, 'Colors (one per line)'), ta, h('label', {}, 'Or an image (optional)'), file, out);
    draw();
  },
});

function mixAt(a, b, t, space) {
  const A = [a.r, a.g, a.b], B = [b.r, b.g, b.b], L = (x, y) => x + (y - x) * t;
  let rgb;
  if (space === 'linear') rgb = A.map((v, i) => delin(L(lin(v), lin(B[i]))));
  else if (space === 'oklab') { const p = rgb2oklab(...A), q = rgb2oklab(...B); rgb = oklab2rgb(L(p[0], q[0]), L(p[1], q[1]), L(p[2], q[2])); }
  else if (space === 'hsl') {
    const p = rgb2hsl(...A), q = rgb2hsl(...B); let dh = q[0] - p[0]; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
    rgb = hsl2rgb(p[0] + dh * t, L(p[1], q[1]), L(p[2], q[2]));
  } else rgb = A.map((v, i) => L(v, B[i]));
  return fromRGB(rgb, L(a.a, b.a));
}
T.push({
  id: 'color-mixer', cat: 'Color', title: 'Color Mixer', desc: 'Blend two colors at a ratio or in steps, in sRGB, linear light, OKLab or HSL.',
  inputs: 2, labels: ['Color A', 'Color B'], sample: '#ff0000', sample2: '#0000ff',
  opts: [O.n('ratio', 'Mix % of B', 50), O.n('steps', 'Steps', 7), O.s('space', 'Space', 'oklab', ['srgb', 'linear', 'oklab', 'hsl'])],
  run([a, b], { ratio: r, steps, space }) {
    const A = parseColor(a), B = parseColor(b), n = clamp(Math.round(steps), 2, 50);
    const mixed = mixAt(A, B, clamp(r, 0, 100) / 100, space);
    const seq = Array.from({ length: n }, (_, i) => toHex(mixAt(A, B, i / (n - 1), space)));
    return { text: `Mix (${r}% B, ${space}): ${toHex(mixed)}  ${rgbaStr(mixed)}\n\nSteps:\n${seq.join('\n')}`, html: swatches([[toHex(mixed), 'mix ' + toHex(mixed)], ...seq.map((c) => [c])]) };
  },
});

const splitTop = (s) => s.split(/\n|,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);
const DIRS = { 0: 't', 45: 'tr', 90: 'r', 135: 'br', 180: 'b', 225: 'bl', 270: 'l', 315: 'tl' };
T.push({
  id: 'gradient-generator', cat: 'Color', title: 'CSS Gradient Generator', desc: 'Linear, radial, conic and repeating gradients with color stops. CSS and Tailwind output, live preview.',
  labels: ['Color stops (one per line: color [position])'], sample: '#ff512f 0%\n#dd2476 100%',
  opts: [O.s('type', 'Type', 'linear', ['linear', 'radial', 'conic', 'repeating-linear']), O.n('angle', 'Angle (deg)', 90), O.s('shape', 'Radial shape', 'circle', ['circle', 'ellipse']), O.t('pos', 'Center (radial/conic)', 'center')],
  run([inp], { type, angle, shape, pos }) {
    const stops = splitTop(inp);
    if (stops.length < 2) throw new Error('Need at least 2 color stops');
    stops.forEach((s) => parseColor(s.replace(/\s+-?[\d.]+(%|px|deg)?$/, '')));
    const body = stops.join(', ');
    const cfg = type === 'radial' ? `${shape} at ${pos}` : type === 'conic' ? `from ${angle}deg at ${pos}` : `${angle}deg`;
    const val = `${type}-gradient(${cfg}, ${body})`;
    let tw = `bg-[${val.replace(/\s+/g, '_')}]`;
    const plain = stops.every((s) => !/\s/.test(s.replace(/\([^)]*\)/g, '')));
    if (type === 'linear' && DIRS[((angle % 360) + 360) % 360] && plain && stops.length <= 3) {
      const [f, ...rest] = stops, t = rest.pop();
      tw += `\n\nbg-gradient-to-${DIRS[((angle % 360) + 360) % 360]} from-[${f}]${rest.length ? ` via-[${rest[0]}]` : ''} to-[${t}]`;
    }
    return { text: `background: ${val};\n\n/* Tailwind */\n${tw}`, html: page(`<div style="height:100vh;min-height:240px;background:${esc(val)}"></div>`) };
  },
});

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
T.push({
  id: 'mesh-gradient-generator', cat: 'Color', title: 'Mesh Gradient Generator', desc: 'Layer radial gradients into a soft mesh-style background. Seeded, so results are repeatable.',
  labels: ['Colors (comma or newline separated)'], sample: '#ff6b6b, #feca57, #48dbfb, #1dd1a1, #5f27cd',
  opts: [O.n('seed', 'Seed', 7), O.n('points', 'Layers', 6), O.n('size', 'Spread %', 55)],
  run([inp], { seed, points, size }) {
    const cols = splitTop(inp); if (cols.length < 2) throw new Error('Need at least 2 colors');
    cols.forEach(parseColor);
    const R = rng(seed), n = clamp(Math.round(points), 1, 20);
    const layers = Array.from({ length: n }, (_, i) => `radial-gradient(at ${Math.round(R() * 100)}% ${Math.round(R() * 100)}%, ${cols[i % cols.length]} 0px, transparent ${size}%)`);
    const css = `background-color: ${cols[0]};\nbackground-image:\n  ${layers.join(',\n  ')};`;
    return { text: css, html: page(`<div style="height:100vh;min-height:260px;${esc(css.replace(/\n\s*/g, ' '))}"></div>`) };
  },
});

T.push({
  id: 'color-picker-from-image', cat: 'Color', title: 'Color Picker from Image', desc: 'Click an image to sample any pixel, or extract a dominant palette with median-cut.', custom: true, dom: true,
  render(el) {
    const file = h('input', { type: 'file', accept: 'image/*' }), info = h('div', { className: 'row' }), pal = h('div', { className: 'row' });
    const n = h('input', { type: 'number', value: 6, min: 2, max: 16, style: 'width:70px' }), holder = h('div');
    let img = null, cv = null;
    const chip = (hex) => h('button', { title: 'Copy', style: `background:${hex};color:${textOn(parseColor(hex))};min-width:90px`, onclick: () => copy(hex) }, hex);
    function palette() {
      pal.replaceChildren();
      if (img) medianCut(pixelsOf(img), clamp(+n.value || 6, 2, 16)).forEach((c) => pal.append(chip(hexOf(c.rgb))));
    }
    file.addEventListener('change', async () => {
      holder.replaceChildren(); info.replaceChildren();
      img = file.files[0] ? await loadImage(file.files[0]).catch((e) => (holder.append(h('pre', { className: 'out err' }, e.message)), null)) : null;
      if (!img) return;
      cv = drawFit(img, 900); cv.className = 'prev'; cv.style.cursor = 'crosshair';
      const sample = (x, y) => {
        x = clamp(Math.floor(x), 0, cv.width - 1); y = clamp(Math.floor(y), 0, cv.height - 1);
        const d = cv.getContext('2d').getImageData(x, y, 1, 1).data, hex = hexOf([d[0], d[1], d[2]]), [hh, s, l] = rgb2hsl(d[0], d[1], d[2]);
        info.replaceChildren(chip(hex), h('code', { role: 'status' }, `rgb(${d[0]} ${d[1]} ${d[2]})  hsl(${Math.round(hh)} ${Math.round(s)}% ${Math.round(l)}%)`));
      };
      cv.addEventListener('click', (e) => { const r = cv.getBoundingClientRect(); sample((e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height); });
      cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', `Uploaded image, ${cv.width} x ${cv.height} px. Use the pixel position fields to sample a colour.`);
      const px = h('input', { type: 'number', min: 0, max: cv.width - 1, value: 0, style: 'width:90px' }), py = h('input', { type: 'number', min: 0, max: cv.height - 1, value: 0, style: 'width:90px' });
      holder.append(h('div', { className: 'row' }, h('label', {}, 'Pixel X ', px), h('label', {}, 'Pixel Y ', py), h('button', { type: 'button', onclick: () => sample(+px.value || 0, +py.value || 0) }, 'Sample pixel')));
      holder.append(cv); palette();
    });
    n.addEventListener('input', palette);
    el.append(h('label', {}, 'Image'), file, h('div', { className: 'row' }, 'Palette size', n), pal, info, holder);
  },
});

T.push({
  id: 'color-names-lookup', cat: 'Color', title: 'Color Names Lookup', desc: 'Find the nearest CSS named color for any color, or search names by text.',
  labels: ['Color or name fragment (one per line)'], sample: '#ff6347\nsky\nrgb(10 100 90)',
  run([inp]) {
    return lines(inp).map((l) => {
      let c = null; try { c = parseColor(l); } catch { /* treat as search text */ }
      if (!c) {
        const q = l.toLowerCase().replace(/\s+/g, ''), hits = Object.keys(NAMES).filter((k) => k.includes(q));
        return `# "${l}"\n` + (hits.length ? hits.map((k) => `${k.padEnd(22)}#${NAMES[k]}`).join('\n') : 'no matching names');
      }
      const t = rgb2oklab(c.r, c.g, c.b);
      const near = Object.entries(NAMES).map(([k, x]) => { const o = rgb2oklab(parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4), 16)); return [k, x, Math.hypot(o[0] - t[0], o[1] - t[1], o[2] - t[2])]; }).sort((a, b) => a[2] - b[2]).slice(0, 5);
      return `# ${l} (${toHex(c)})\n` + near.map(([k, x, d]) => `${k.padEnd(22)}#${x}  distance ${rd(d, 3)}`).join('\n');
    }).join('\n\n');
  },
});

// ---------- CSS generators ----------
// cssGen: opts-only tool; css(o) -> declaration text; box(o,css) -> preview body HTML; pcss -> extra preview css
const cssGen = (id, title, desc, opts, css, box, pcss = '', bg = '#e9edf3') => T.push({
  id, cat: 'CSS', title, desc, inputs: 0, sample: '', opts,
  run(_, o) {
    const c = css(o);
    return { text: c, html: page(box ? box(o, c) : `<div class="b" style="${esc(c.replace(/\n/g, ' '))}"></div>`, `body{background:${bg};display:flex;align-items:center;justify-content:center;min-height:100vh}.b{width:160px;height:160px;background:#fff}${pcss}`) };
  },
});
const px = (v) => (v === 0 ? '0' : v + 'px');

cssGen('box-shadow-generator', 'Box Shadow Generator', 'Build a layered CSS box-shadow with a live preview.',
  [O.n('x', 'X offset', 0), O.n('y', 'Y offset', 10), O.n('blur', 'Blur', 30), O.n('spread', 'Spread', -5), O.c('color', 'Color', '#000000'), O.n('opacity', 'Opacity %', 25), O.b('inset', 'Inset', false), O.n('layers', 'Layers (smooth)', 1)],
  (o) => {
    const n = clamp(Math.round(o.layers), 1, 6);
    const ls = Array.from({ length: n }, (_, i) => { const k = 2 ** i / 2 ** (n - 1); return `${o.inset ? 'inset ' : ''}${px(rd(o.x * k, 1))} ${px(rd(o.y * k, 1))} ${px(rd(o.blur * k, 1))} ${px(rd(o.spread * k, 1))} ${withAlpha(o.color, rd(o.opacity / 100 / (n > 1 ? n / 1.5 : 1), 3))}`; });
    return `box-shadow: ${ls.join(',\n  ')};`;
  }, null, '.b{border-radius:12px}');

cssGen('text-shadow-generator', 'Text Shadow Generator', 'Build a CSS text-shadow (glow, drop, emboss) with live preview.',
  [O.n('x', 'X offset', 2), O.n('y', 'Y offset', 2), O.n('blur', 'Blur', 4), O.c('color', 'Color', '#000000'), O.n('opacity', 'Opacity %', 40), O.n('glow', 'Extra glow layers', 0)],
  (o) => {
    const l = [`${px(o.x)} ${px(o.y)} ${px(o.blur)} ${withAlpha(o.color, o.opacity / 100)}`];
    for (let i = 1; i <= clamp(o.glow, 0, 5); i++) l.push(`0 0 ${px(o.blur * (i + 1))} ${withAlpha(o.color, o.opacity / 100)}`);
    return `text-shadow: ${l.join(', ')};`;
  }, (o, c) => `<div style="${esc(c)};font:700 56px system-ui;color:#222">Shadow Text</div>`);

cssGen('border-radius-generator', 'Border Radius Generator', 'Per-corner (and elliptical) border-radius with preview.',
  [O.n('tl', 'Top-left', 20), O.n('tr', 'Top-right', 20), O.n('br', 'Bottom-right', 20), O.n('bl', 'Bottom-left', 20), O.n('vtl', 'Vertical TL (0 = same)', 0), O.n('vtr', 'Vertical TR', 0), O.n('vbr', 'Vertical BR', 0), O.n('vbl', 'Vertical BL', 0), O.s('unit', 'Unit', 'px', ['px', '%', 'rem'])],
  (o) => {
    const u = (v) => v + (v === 0 ? '' : o.unit), hz = [o.tl, o.tr, o.br, o.bl], vt = [o.vtl || o.tl, o.vtr || o.tr, o.vbr || o.br, o.vbl || o.bl];
    const same = hz.every((v, i) => v === vt[i]);
    return `border-radius: ${hz.map(u).join(' ')}${same ? '' : ' / ' + vt.map(u).join(' ')};`;
  }, null, '.b{background:#4f8cff}');

cssGen('glassmorphism-generator', 'Glassmorphism Generator', 'Frosted-glass card CSS with backdrop-filter.',
  [O.c('color', 'Glass color', '#ffffff'), O.n('alpha', 'Transparency % (opacity)', 20), O.n('blur', 'Blur px', 12), O.n('sat', 'Saturation %', 120), O.n('border', 'Border opacity %', 30), O.n('radius', 'Radius px', 16)],
  (o) => `background: ${withAlpha(o.color, o.alpha / 100)};\nbackdrop-filter: blur(${o.blur}px) saturate(${o.sat}%);\n-webkit-backdrop-filter: blur(${o.blur}px) saturate(${o.sat}%);\nborder: 1px solid ${withAlpha(o.color, o.border / 100)};\nborder-radius: ${o.radius}px;\nbox-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);`,
  (o, c) => `<div class="b" style="${esc(c.replace(/\n/g, ' '))};display:flex;align-items:center;justify-content:center;font:600 18px system-ui;color:#fff;width:240px;height:150px">Glass card</div>`,
  'body{background:linear-gradient(135deg,#ff6b6b,#4f46e5 55%,#06b6d4)}', '#4f46e5');

cssGen('neumorphism-generator', 'Neumorphism Generator', 'Soft-UI (neumorphic) shadows: flat, concave, convex or pressed.',
  [O.c('color', 'Base color', '#e0e5ec'), O.n('size', 'Size px', 160), O.n('dist', 'Distance px', 12), O.n('blur', 'Blur px', 24), O.n('radius', 'Radius px', 28), O.n('intensity', 'Intensity %', 8), O.s('shape', 'Shape', 'flat', ['flat', 'concave', 'convex', 'pressed'])],
  (o) => {
    const lt = shade(o.color, o.intensity), dk = shade(o.color, -o.intensity), d = o.dist, bl = o.blur;
    const sh = `${o.shape === 'pressed' ? 'inset ' : ''}${d}px ${d}px ${bl}px ${dk}, ${o.shape === 'pressed' ? 'inset ' : ''}-${d}px -${d}px ${bl}px ${lt}`;
    const bg = o.shape === 'concave' ? `linear-gradient(145deg, ${dk}, ${lt})` : o.shape === 'convex' ? `linear-gradient(145deg, ${lt}, ${dk})` : o.color;
    return `width: ${o.size}px;\nheight: ${o.size}px;\nborder-radius: ${o.radius}px;\nbackground: ${bg};\nbox-shadow: ${sh};`;
  }, (o, c) => `<div style="${esc(c.replace(/\n/g, ' '))}"></div>`, '', '#e0e5ec');

cssGen('css-filter-generator', 'CSS Filter Generator', 'Combine blur, brightness, contrast, hue-rotate and more into a filter value.',
  [O.n('blur', 'blur px', 0), O.n('brightness', 'brightness %', 100), O.n('contrast', 'contrast %', 100), O.n('grayscale', 'grayscale %', 0), O.n('hue', 'hue-rotate deg', 0), O.n('invert', 'invert %', 0), O.n('opacity', 'opacity %', 100), O.n('saturate', 'saturate %', 100), O.n('sepia', 'sepia %', 0)],
  (o) => {
    const p = [['blur', o.blur, 0, 'px'], ['brightness', o.brightness, 100, '%'], ['contrast', o.contrast, 100, '%'], ['grayscale', o.grayscale, 0, '%'], ['hue-rotate', o.hue, 0, 'deg'], ['invert', o.invert, 0, '%'], ['opacity', o.opacity, 100, '%'], ['saturate', o.saturate, 100, '%'], ['sepia', o.sepia, 0, '%']]
      .filter(([, v, d]) => v !== d).map(([n, v, , u]) => `${n}(${v}${u})`);
    return `filter: ${p.join(' ') || 'none'};`;
  }, (o, c) => `<div class="b" style="${esc(c)};width:260px;height:160px;background:linear-gradient(135deg,#ff5f6d,#ffc371 40%,#47c9e5 70%,#7b4397);border-radius:12px"></div>`);

const POLY = {
  triangle: '50% 0%, 0% 100%, 100% 100%', trapezoid: '20% 0%, 80% 0%, 100% 100%, 0% 100%', parallelogram: '25% 0%, 100% 0%, 75% 100%, 0% 100%', rhombus: '50% 0%, 100% 50%, 50% 100%, 0% 50%',
  pentagon: '50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%', hexagon: '25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%', octagon: '30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%',
  star: '50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%', cross: '35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%',
  arrow: '0% 35%, 60% 35%, 60% 10%, 100% 50%, 60% 90%, 60% 65%, 0% 65%', message: '0% 0%, 100% 0%, 100% 75%, 75% 75%, 75% 100%, 50% 75%, 0% 75%', chevron: '75% 0%, 100% 50%, 75% 100%, 0% 100%, 25% 50%, 0% 0%',
};
T.push({
  id: 'clip-path-generator', cat: 'CSS', title: 'Clip-path Generator', desc: 'Preset shapes (polygon, circle, ellipse, inset) plus a polygon point editor: edit the points text to customise.',
  labels: ['Custom polygon points (optional, one "x% y%" per line; overrides preset)'], sample: '',
  opts: [O.s('shape', 'Preset', 'hexagon', [...Object.keys(POLY), 'circle', 'ellipse', 'inset'])],
  run([inp], { shape }) {
    let v;
    const pts = lines(inp);
    if (pts.length) {
      if (pts.length < 3) throw new Error('A polygon needs at least 3 points');
      v = `polygon(${pts.map((p) => { if (!/^\s*-?[\d.]+(%|px)?\s+-?[\d.]+(%|px)?\s*$/.test(p)) throw new Error(`Bad point: "${p}" (use "x% y%")`); return p.trim().replace(/\s+/g, ' '); }).join(', ')})`;
    } else v = POLY[shape] ? `polygon(${POLY[shape]})` : shape === 'circle' ? 'circle(50% at 50% 50%)' : shape === 'ellipse' ? 'ellipse(50% 35% at 50% 50%)' : 'inset(10% 10% 10% 10% round 16px)';
    return { text: `clip-path: ${v};`, html: page(`<div style="width:240px;height:240px;background:linear-gradient(135deg,#6366f1,#ec4899);clip-path:${esc(v)}"></div>`, 'body{display:flex;align-items:center;justify-content:center;min-height:100vh}') };
  },
});

cssGen('flexbox-generator', 'Flexbox Generator', 'Configure a flex container and preview the layout.',
  [O.s('dir', 'direction', 'row', ['row', 'row-reverse', 'column', 'column-reverse']), O.s('wrap', 'wrap', 'nowrap', ['nowrap', 'wrap', 'wrap-reverse']), O.s('jc', 'justify-content', 'center', ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly']), O.s('ai', 'align-items', 'center', ['stretch', 'flex-start', 'flex-end', 'center', 'baseline']), O.s('ac', 'align-content', 'normal', ['normal', 'flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'stretch']), O.n('gap', 'gap px', 10), O.n('items', 'Preview items', 5)],
  (o) => `display: flex;\nflex-direction: ${o.dir};\nflex-wrap: ${o.wrap};\njustify-content: ${o.jc};\nalign-items: ${o.ai};${o.ac !== 'normal' ? `\nalign-content: ${o.ac};` : ''}\ngap: ${o.gap}px;`,
  (o, c) => `<div style="${esc(c.replace(/\n/g, ' '))};width:100%;height:100vh;box-sizing:border-box;padding:10px">${Array.from({ length: clamp(o.items, 1, 30) }, (_, i) => `<div style="background:#4f8cff;color:#fff;padding:${10 + (i % 3) * 10}px 16px;border-radius:6px">${i + 1}</div>`).join('')}</div>`, 'body{display:block}');

cssGen('grid-generator', 'CSS Grid Generator', 'Define columns, rows and gaps; preview and copy the grid CSS.',
  [O.n('cols', 'Columns', 3), O.n('rows', 'Rows', 3), O.t('colSize', 'Column size', '1fr'), O.t('rowSize', 'Row size', 'auto'), O.n('cgap', 'Column gap px', 10), O.n('rgap', 'Row gap px', 10), O.s('ji', 'justify-items', 'stretch', ['stretch', 'start', 'center', 'end']), O.s('ai', 'align-items', 'stretch', ['stretch', 'start', 'center', 'end'])],
  (o) => `display: grid;\ngrid-template-columns: repeat(${o.cols}, ${o.colSize});\ngrid-template-rows: repeat(${o.rows}, ${o.rowSize});\ncolumn-gap: ${o.cgap}px;\nrow-gap: ${o.rgap}px;${o.ji !== 'stretch' ? `\njustify-items: ${o.ji};` : ''}${o.ai !== 'stretch' ? `\nalign-items: ${o.ai};` : ''}`,
  (o, c) => `<div style="${esc(c.replace(/\n/g, ' '))};width:100%;min-height:100vh;box-sizing:border-box;padding:10px">${Array.from({ length: clamp(o.cols * o.rows, 1, 100) }, (_, i) => `<div style="background:#4f8cff;color:#fff;padding:14px;border-radius:6px;min-height:30px">${i + 1}</div>`).join('')}</div>`, 'body{display:block}');

const KF = {
  'fade-in': '0%{opacity:0}100%{opacity:1}', 'slide-up': '0%{opacity:0;transform:translateY(30px)}100%{opacity:1;transform:translateY(0)}', 'slide-in-left': '0%{transform:translateX(-100%)}100%{transform:translateX(0)}',
  bounce: '0%,20%,50%,80%,100%{transform:translateY(0)}40%{transform:translateY(-30px)}60%{transform:translateY(-15px)}', pulse: '0%{transform:scale(1)}50%{transform:scale(1.1)}100%{transform:scale(1)}',
  shake: '0%,100%{transform:translateX(0)}10%,30%,50%,70%,90%{transform:translateX(-8px)}20%,40%,60%,80%{transform:translateX(8px)}', spin: 'from{transform:rotate(0)}to{transform:rotate(360deg)}',
  flip: '0%{transform:perspective(400px) rotateY(0)}100%{transform:perspective(400px) rotateY(360deg)}', 'zoom-in': '0%{opacity:0;transform:scale(.3)}100%{opacity:1;transform:scale(1)}',
  wobble: '0%,100%{transform:translateX(0) rotate(0)}15%{transform:translateX(-25px) rotate(-5deg)}30%{transform:translateX(20px) rotate(3deg)}45%{transform:translateX(-15px) rotate(-3deg)}60%{transform:translateX(10px) rotate(2deg)}75%{transform:translateX(-5px) rotate(-1deg)}',
  heartbeat: '0%,100%{transform:scale(1)}14%{transform:scale(1.3)}28%{transform:scale(1)}42%{transform:scale(1.3)}70%{transform:scale(1)}',
};
const fmtKf = (s) => s.split('}').filter(Boolean).map((f) => { const [a, d] = f.split('{'); return `  ${a} { ${d.replace(/;?$/, ';')} }`; }).join('\n');
cssGen('css-animation-generator', 'CSS Animation Generator', 'Keyframe presets with duration, easing and iteration controls, live preview.',
  [O.s('preset', 'Preset', 'bounce', Object.keys(KF)), O.n('dur', 'Duration s', 1), O.n('delay', 'Delay s', 0), O.s('ease', 'Timing', 'ease', ['ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out', 'cubic-bezier(.68,-.55,.27,1.55)']), O.t('iter', 'Iterations', 'infinite'), O.s('fill', 'Fill mode', 'both', ['none', 'forwards', 'backwards', 'both'])],
  (o) => `@keyframes ${o.preset} {\n${fmtKf(KF[o.preset])}\n}\n\n.element {\n  animation: ${o.preset} ${o.dur}s ${o.ease} ${o.delay}s ${o.iter} ${o.fill};\n}`,
  (o) => `<style>@keyframes ${o.preset}{${KF[o.preset]}}</style><div class="b" style="background:#4f8cff;border-radius:12px;width:100px;height:100px;animation:${o.preset} ${o.dur}s ${o.ease} ${o.delay}s ${esc(o.iter)} ${o.fill}"></div>`);

const LOADERS = {
  spinner: (c, S, T2) => ({ html: '<div class="loader"></div>', css: `.loader {\n  width: ${S}px; height: ${S}px;\n  border: ${S / 8}px solid ${withAlpha(c, 0.2)};\n  border-top-color: ${c};\n  border-radius: 50%;\n  animation: spin ${T2}s linear infinite;\n}\n@keyframes spin { to { transform: rotate(360deg); } }` }),
  'dual-ring': (c, S, T2) => ({ html: '<div class="loader"></div>', css: `.loader {\n  width: ${S}px; height: ${S}px;\n  border-radius: 50%;\n  border: ${S / 8}px solid transparent;\n  border-top-color: ${c}; border-bottom-color: ${c};\n  animation: spin ${T2}s linear infinite;\n}\n@keyframes spin { to { transform: rotate(360deg); } }` }),
  dots: (c, S, T2) => ({ html: '<div class="loader"><i></i><i></i><i></i></div>', css: `.loader { display: flex; gap: ${S / 8}px; }\n.loader i {\n  width: ${S / 4}px; height: ${S / 4}px;\n  border-radius: 50%; background: ${c};\n  animation: dot ${T2}s infinite ease-in-out both;\n}\n.loader i:nth-child(1) { animation-delay: -${rd(T2 * 0.3, 2)}s; }\n.loader i:nth-child(2) { animation-delay: -${rd(T2 * 0.15, 2)}s; }\n@keyframes dot { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }` }),
  bars: (c, S, T2) => ({ html: '<div class="loader"><i></i><i></i><i></i><i></i><i></i></div>', css: `.loader { display: flex; align-items: center; gap: ${S / 12}px; height: ${S}px; }\n.loader i {\n  width: ${S / 8}px; height: 100%;\n  background: ${c};\n  animation: bar ${T2}s infinite ease-in-out;\n}\n${[2, 3, 4, 5].map((n) => `.loader i:nth-child(${n}) { animation-delay: ${rd((n - 1) * T2 * 0.1, 2)}s; }`).join('\n')}\n@keyframes bar { 0%, 40%, 100% { transform: scaleY(.3); } 20% { transform: scaleY(1); } }` }),
  pulse: (c, S, T2) => ({ html: '<div class="loader"></div>', css: `.loader {\n  width: ${S}px; height: ${S}px;\n  border-radius: 50%; background: ${c};\n  animation: pulse ${T2}s ease-in-out infinite;\n}\n@keyframes pulse { 0% { transform: scale(0); opacity: 1; } 100% { transform: scale(1); opacity: 0; } }` }),
};
T.push({
  id: 'css-loader-generator', cat: 'CSS', title: 'CSS Loader Generator', desc: 'Pure-CSS spinners, dots, bars and pulses: HTML + CSS to copy, with preview.', inputs: 0, sample: '',
  opts: [O.s('type', 'Type', 'spinner', Object.keys(LOADERS)), O.c('color', 'Color', '#3b82f6'), O.n('size', 'Size px', 48), O.n('speed', 'Speed s', 1)],
  run(_, o) {
    const r = LOADERS[o.type](o.color, o.size, o.speed || 1);
    return { text: `<!-- HTML -->\n${r.html}\n\n/* CSS */\n${r.css}`, html: page(r.html, `body{display:flex;align-items:center;justify-content:center;min-height:100vh}${r.css}`) };
  },
});

// ---------- CSS unit converter ----------
const UNIT_PX = (o) => ({ px: 1, rem: o.base, em: o.parent, pt: 96 / 72, pc: 16, cm: 96 / 2.54, mm: 96 / 25.4, in: 96, vw: o.vw / 100, vh: o.vh / 100, vmin: Math.min(o.vw, o.vh) / 100, vmax: Math.max(o.vw, o.vh) / 100 });
T.push({
  id: 'css-unit-converter', cat: 'CSS', title: 'CSS Unit Converter', desc: 'Convert px, rem, em, pt, pc, cm, mm, in, vw, vh between each other with configurable base sizes.',
  labels: ['Values (one per line, e.g. 24px, 1.5rem; bare numbers use the default unit)'], sample: '24px\n1.5rem\n12pt',
  opts: [O.s('unit', 'Default unit', 'px', Object.keys(UNIT_PX({ base: 1, parent: 1, vw: 1, vh: 1 }))), O.n('base', 'Root font size (rem) px', 16), O.n('parent', 'Parent font size (em) px', 16), O.n('vw', 'Viewport width px', 1920), O.n('vh', 'Viewport height px', 1080)],
  run([inp], o) {
    const u = UNIT_PX(o);
    return lines(inp).map((l) => {
      const m = l.match(/^(-?[\d.]+)\s*([a-z]*)$/i); if (!m) throw new Error(`Cannot parse "${l}"`);
      const unit = (m[2] || o.unit).toLowerCase(); if (!u[unit]) throw new Error(`Unknown unit "${unit}"`);
      const p = parseFloat(m[1]) * u[unit];
      return `${l} = ` + Object.keys(u).filter((k) => k !== unit).map((k) => `${rd(p / u[k], 4)}${k}`).join('  ');
    }).join('\n');
  },
});

// ---------- Tailwind converter ----------
const kw = (cls, prop, vals) => vals.map(([c, v]) => [cls + c, `${prop}:${v}`]);
const TWT = [
  ...['block', 'inline-block', 'inline', 'flex', 'inline-flex', 'grid', 'inline-grid', 'table', 'contents'].map((d) => [d, `display:${d}`]), ['hidden', 'display:none'],
  ...['static', 'relative', 'absolute', 'fixed', 'sticky'].map((d) => [d, `position:${d}`]),
  ...kw('flex-', 'flex-direction', [['row', 'row'], ['col', 'column'], ['row-reverse', 'row-reverse'], ['col-reverse', 'column-reverse']]),
  ...kw('flex-', 'flex-wrap', [['wrap', 'wrap'], ['nowrap', 'nowrap'], ['wrap-reverse', 'wrap-reverse']]),
  ...kw('justify-', 'justify-content', [['start', 'flex-start'], ['end', 'flex-end'], ['center', 'center'], ['between', 'space-between'], ['around', 'space-around'], ['evenly', 'space-evenly']]),
  ...kw('items-', 'align-items', [['start', 'flex-start'], ['end', 'flex-end'], ['center', 'center'], ['baseline', 'baseline'], ['stretch', 'stretch']]),
  ...kw('self-', 'align-self', [['auto', 'auto'], ['start', 'flex-start'], ['end', 'flex-end'], ['center', 'center'], ['stretch', 'stretch']]),
  ...kw('text-', 'text-align', [['left', 'left'], ['center', 'center'], ['right', 'right'], ['justify', 'justify']]),
  ...kw('font-', 'font-weight', [['thin', 100], ['extralight', 200], ['light', 300], ['normal', 400], ['medium', 500], ['semibold', 600], ['bold', 700], ['extrabold', 800], ['black', 900]]),
  ['italic', 'font-style:italic'], ['not-italic', 'font-style:normal'], ['underline', 'text-decoration:underline'], ['line-through', 'text-decoration:line-through'], ['no-underline', 'text-decoration:none'],
  ['uppercase', 'text-transform:uppercase'], ['lowercase', 'text-transform:lowercase'], ['capitalize', 'text-transform:capitalize'], ['normal-case', 'text-transform:none'],
  ...['auto', 'hidden', 'scroll', 'visible'].flatMap((v) => [[`overflow-${v}`, `overflow:${v}`], [`overflow-x-${v}`, `overflow-x:${v}`], [`overflow-y-${v}`, `overflow-y:${v}`]]),
  ...['pointer', 'default', 'not-allowed', 'text', 'move', 'grab', 'wait'].map((v) => [`cursor-${v}`, `cursor:${v}`]),
  ['visible', 'visibility:visible'], ['invisible', 'visibility:hidden'],
  ...kw('whitespace-', 'white-space', [['nowrap', 'nowrap'], ['normal', 'normal'], ['pre', 'pre'], ['pre-wrap', 'pre-wrap'], ['pre-line', 'pre-line']]),
  ['box-border', 'box-sizing:border-box'], ['box-content', 'box-sizing:content-box'],
  ...['cover', 'contain', 'fill', 'none', 'scale-down'].map((v) => [`object-${v}`, `object-fit:${v}`]),
  ['pointer-events-none', 'pointer-events:none'], ['pointer-events-auto', 'pointer-events:auto'], ['select-none', 'user-select:none'], ['select-text', 'user-select:text'], ['select-all', 'user-select:all'],
  ['flex-1', 'flex:1 1 0%'], ['flex-auto', 'flex:1 1 auto'], ['flex-none', 'flex:none'], ['grow', 'flex-grow:1'], ['grow-0', 'flex-grow:0'], ['shrink', 'flex-shrink:1'], ['shrink-0', 'flex-shrink:0'],
  ...['solid', 'dashed', 'dotted', 'double', 'none'].map((v) => [`border-${v}`, `border-style:${v}`]),
  ['border', 'border-width:1px'], ['border-0', 'border-width:0'], ['border-2', 'border-width:2px'], ['border-4', 'border-width:4px'], ['border-8', 'border-width:8px'],
  ['shadow-none', 'box-shadow:none'], ['truncate', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'],
];
const TW_C2T = new Map(TWT.map(([c, d]) => [d, c])), TW_T2C = new Map(TWT);
const KEYS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96];
const FRAC = { '50': '1/2', '33.333': '1/3', '66.667': '2/3', '25': '1/4', '75': '3/4', '20': '1/5', '40': '2/5', '60': '3/5', '80': '4/5', '16.667': '1/6', '83.333': '5/6' };
const FS = { 12: 'xs', 14: 'sm', 16: 'base', 18: 'lg', 20: 'xl', 24: '2xl', 30: '3xl', 36: '4xl', 48: '5xl', 60: '6xl', 72: '7xl', 96: '8xl', 128: '9xl' };
const RAD = { 0: 'none', 2: 'sm', 4: '', 6: 'md', 8: 'lg', 12: 'xl', 16: '2xl', 24: '3xl', 9999: 'full' };
const LS = { '-0.05': 'tighter', '-0.025': 'tight', '0': 'normal', '0.025': 'wide', '0.05': 'wider', '0.1': 'widest' };
const LH = { 1: 'none', 1.25: 'tight', 1.375: 'snug', 1.5: 'normal', 1.625: 'relaxed', 2: 'loose' };
const MAXW = { 320: 'xs', 384: 'sm', 448: 'md', 512: 'lg', 576: 'xl', 672: '2xl', 768: '3xl', 896: '4xl', 1024: '5xl', 1152: '6xl', 1280: '7xl' };
const OPAC = [0, 5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 100];
const SPACING = { margin: 'm', 'margin-top': 'mt', 'margin-right': 'mr', 'margin-bottom': 'mb', 'margin-left': 'ml', padding: 'p', 'padding-top': 'pt', 'padding-right': 'pr', 'padding-bottom': 'pb', 'padding-left': 'pl', gap: 'gap', 'row-gap': 'gap-y', 'column-gap': 'gap-x', top: 'top', right: 'right', bottom: 'bottom', left: 'left', inset: 'inset', width: 'w', height: 'h', 'min-width': 'min-w', 'min-height': 'min-h', 'max-width': 'max-w', 'max-height': 'max-h' };
const SP_REV = Object.fromEntries(Object.entries(SPACING).map(([k, v]) => [v, k]));
const COLORP = { color: 'text', 'background-color': 'bg', 'border-color': 'border', fill: 'fill', stroke: 'stroke' };
const COLOR_KW = { white: '#fff', black: '#000', transparent: 'transparent', currentcolor: 'currentColor' };
const pxOf = (v) => { const m = String(v).trim().match(/^(-?[\d.]+)(px|rem|em)?$/); if (!m) return null; const n = parseFloat(m[1]); return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n; };
const arb = (v) => `[${String(v).trim().replace(/\s+/g, '_')}]`;
const spKey = (v) => { const p = pxOf(v); if (p == null) return null; if (p === 1) return 'px'; const k = p / 4; return KEYS.includes(k) ? String(k) : null; };
function twSize(prop, v) { // returns value token for spacing-like props
  v = v.trim();
  if (v === 'auto') return 'auto';
  if (v === '100%') return 'full';
  if (v === '100vw' && /width/.test(prop)) return 'screen';
  if (v === '100vh' && /height/.test(prop)) return 'screen';
  if (v === 'none' && /^max-/.test(prop)) return 'none';
  const pc = v.match(/^([\d.]+)%$/); if (pc && /width|height|top|right|bottom|left|inset/.test(prop)) { const k = String(rd(+pc[1], 3)); if (FRAC[k]) return FRAC[k]; }
  if (prop === 'max-width' && MAXW[pxOf(v)]) return MAXW[pxOf(v)];
  return spKey(v) ?? arb(v);
}
function twDecl(prop, val) {
  prop = prop.trim().toLowerCase(); val = val.trim().replace(/\s*!important$/, '');
  const lv = val.toLowerCase();
  const hit = TW_C2T.get(`${prop}:${lv}`); if (hit) return [hit];
  if (['margin', 'padding'].includes(prop)) {
    const p = val.split(/\s+/), [t, r = t, b = t, l = r] = p, pre = SPACING[prop];
    if (p.length > 4) return [`[${prop}:${val.replace(/\s+/g, '_')}]`];
    const one = (pf, x) => { const neg = x.startsWith('-') && pxOf(x) != null, tok = twSize(prop, neg ? x.slice(1) : x); return (neg ? '-' : '') + `${pf}-${tok}`; };
    if (t === r && r === b && b === l) return [one(pre, t)];
    const out = []; if (t === b) out.push(one(pre + 'y', t)); else out.push(one(pre + 't', t), one(pre + 'b', b));
    if (l === r) out.push(one(pre + 'x', l)); else out.push(one(pre + 'r', r), one(pre + 'l', l));
    return out;
  }
  if (SPACING[prop]) { const neg = val.startsWith('-') && pxOf(val) != null; return [(neg ? '-' : '') + `${SPACING[prop]}-${twSize(prop, neg ? val.slice(1) : val)}`]; }
  if (COLORP[prop]) { const k = COLOR_KW[lv]; return [`${COLORP[prop]}-${k === '#fff' ? 'white' : k === '#000' ? 'black' : k === 'transparent' ? 'transparent' : k ? 'current' : arb(val)}`]; }
  if (prop === 'background' && (/^(#|rgb|hsl)/.test(lv) || COLOR_KW[lv] || NAMES[lv])) return twDecl('background-color', val);
  if (prop === 'border' || prop === 'outline') {
    const parts = val.match(/(?:[^\s(]|\([^)]*\))+/g) || [], out = [];
    for (const p of parts) {
      if (pxOf(p) != null) out.push(...twDecl('border-width', p));
      else if (['solid', 'dashed', 'dotted', 'double', 'none'].includes(p.toLowerCase())) out.push(...twDecl('border-style', p));
      else out.push(...twDecl('border-color', p));
    }
    return out;
  }
  if (prop === 'border-width') { const p = pxOf(val); return [p === 1 ? 'border' : [0, 2, 4, 8].includes(p) ? `border-${p}` : `border-${arb(val)}`]; }
  if (prop === 'font-size') { const p = pxOf(val); return [FS[p] ? `text-${FS[p]}` : `text-${arb(val)}`]; }
  if (prop === 'border-radius') { const p = val.trim() === '50%' ? 9999 : pxOf(val); return [p != null && p in RAD ? 'rounded' + (RAD[p] ? '-' + RAD[p] : '') : `rounded-${arb(val)}`]; }
  if (prop === 'letter-spacing') { const k = String(parseFloat(val)); return [val.endsWith('em') && LS[k] ? `tracking-${LS[k]}` : `tracking-${arb(val)}`]; }
  if (prop === 'line-height') { if (/^[\d.]+$/.test(val) && LH[val]) return [`leading-${LH[val]}`]; const k = spKey(val); return [`leading-${k && /px|rem/.test(val) ? k : arb(val)}`]; }
  if (prop === 'opacity') { const n = Math.round(parseFloat(val) * 100); return [OPAC.includes(n) && Math.abs(n / 100 - parseFloat(val)) < 1e-9 ? `opacity-${n}` : `opacity-${arb(val)}`]; }
  if (prop === 'z-index') return [['0', '10', '20', '30', '40', '50'].includes(val) ? `z-${val}` : val === 'auto' ? 'z-auto' : `z-${arb(val)}`];
  if (prop === 'box-shadow') return [`shadow-${arb(val)}`];
  if (prop === 'grid-template-columns' || prop === 'grid-template-rows') {
    const m = lv.match(/^repeat\(\s*(\d+)\s*,\s*(?:minmax\(0(?:px)?\s*,\s*)?1fr\)?\s*\)$/), pf = prop.endsWith('columns') ? 'grid-cols' : 'grid-rows';
    return [m ? `${pf}-${m[1]}` : `${pf}-${arb(val)}`];
  }
  if (prop === 'transition') return [`[transition:${val.replace(/\s+/g, '_')}]`];
  if (prop === 'font-family') return [`font-${arb(val)}`];
  return [`[${prop}:${val.replace(/\s+/g, '_')}]`];
}
function cssDecls(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const body = /\{/.test(src) ? [...src.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).join(';') : src;
  return body.split(/;(?![^(]*\))/).map((d) => d.trim()).filter(Boolean).map((d) => { const i = d.indexOf(':'); if (i < 1) throw new Error(`Bad declaration: "${d}"`); return [d.slice(0, i), d.slice(i + 1)]; });
}
function twClass(c) {
  const bare = c.replace(/^!/, ''); if (/^[\w-]+:/.test(bare) && !bare.startsWith('[')) return null;
  const neg = bare.startsWith('-'), cl = neg ? bare.slice(1) : bare;
  const t = TW_T2C.get(cl); if (t) return t;
  let m = cl.match(/^(m|mt|mr|mb|ml|mx|my|p|pt|pr|pb|pl|px|py|gap|gap-x|gap-y|top|right|bottom|left|inset|inset-x|inset-y|w|h|min-w|min-h|max-w|max-h|size)-(.+)$/);
  if (m) {
    const [, pf, v] = m, props = { mx: ['margin-left', 'margin-right'], my: ['margin-top', 'margin-bottom'], px: ['padding-left', 'padding-right'], py: ['padding-top', 'padding-bottom'], 'inset-x': ['left', 'right'], 'inset-y': ['top', 'bottom'], size: ['width', 'height'] }[pf] || [SP_REV[pf]];
    let val;
    if (v === 'auto') val = 'auto'; else if (v === 'full') val = '100%'; else if (v === 'screen') val = pf.endsWith('h') ? '100vh' : '100vw'; else if (v === 'none') val = 'none'; else if (v === 'px') val = '1px';
    else if (v.startsWith('[')) val = v.slice(1, -1).replace(/_/g, ' ');
    else if (/^\d+\/\d+$/.test(v)) { const [a, b] = v.split('/'); val = rd((a / b) * 100, 4) + '%'; }
    else if (pf === 'max-w' && Object.values(MAXW).includes(v)) val = Object.keys(MAXW).find((k) => MAXW[k] === v) / 16 + 'rem';
    else if (KEYS.includes(+v) && /^[\d.]+$/.test(v)) val = +v === 0 ? '0' : +v / 4 + 'rem';
    else return null;
    if (neg && /^[\d.]/.test(val)) val = '-' + val;
    return props.map((p) => `${p}: ${val}`).join(';');
  }
  m = cl.match(/^text-(.+)$/); if (m) {
    const sz = Object.entries(FS).find(([, n]) => n === m[1]); if (sz) return `font-size: ${sz[0] / 16}rem`;
    if (m[1] === 'white' || m[1] === 'black' || m[1] === 'transparent') return `color: ${COLOR_KW[m[1]]}`;
    if (m[1].startsWith('[')) { const v = m[1].slice(1, -1).replace(/_/g, ' '); return /^(#|rgb|hsl)/.test(v) ? `color: ${v}` : `font-size: ${v}`; }
  }
  m = cl.match(/^(bg|border|fill|stroke)-(.+)$/); if (m) {
    const prop = { bg: 'background-color', border: 'border-color', fill: 'fill', stroke: 'stroke' }[m[1]];
    if (COLOR_KW[m[2]]) return `${prop}: ${COLOR_KW[m[2]]}`;
    if (m[2] === 'current') return `${prop}: currentColor`;
    if (m[2].startsWith('[')) return `${prop}: ${m[2].slice(1, -1).replace(/_/g, ' ')}`;
  }
  m = cl.match(/^rounded(?:-(.+))?$/); if (m) { const k = m[1] || ''; const e = Object.entries(RAD).find(([, n]) => n === k); if (e) return `border-radius: ${e[0] === '9999' ? '9999px' : e[0] / 16 + 'rem'}`; if (k.startsWith('[')) return `border-radius: ${k.slice(1, -1).replace(/_/g, ' ')}`; }
  m = cl.match(/^tracking-(.+)$/); if (m) { const e = Object.entries(LS).find(([, n]) => n === m[1]); if (e) return `letter-spacing: ${e[0]}em`; }
  m = cl.match(/^leading-(.+)$/); if (m) { const e = Object.entries(LH).find(([, n]) => n === m[1]); if (e) return `line-height: ${e[0]}`; if (KEYS.includes(+m[1])) return `line-height: ${+m[1] / 4}rem`; }
  m = cl.match(/^opacity-(\d+)$/); if (m) return `opacity: ${+m[1] / 100}`;
  m = cl.match(/^z-(\d+|auto)$/); if (m) return `z-index: ${m[1]}`;
  m = cl.match(/^grid-(cols|rows)-(\d+)$/); if (m) return `grid-template-${m[1] === 'cols' ? 'columns' : 'rows'}: repeat(${m[2]}, minmax(0, 1fr))`;
  m = cl.match(/^shadow-\[(.+)\]$/); if (m) return `box-shadow: ${m[1].replace(/_/g, ' ')}`;
  m = cl.match(/^\[([\w-]+):(.+)\]$/); if (m) return `${m[1]}: ${m[2].replace(/_/g, ' ')}`;
  return null;
}
T.push({
  id: 'tailwind-converter', cat: 'CSS', title: 'CSS to Tailwind Converter', desc: 'Convert CSS declarations to Tailwind utility classes (~80 properties, arbitrary-value fallback) or common Tailwind classes back to CSS.',
  labels: ['CSS declarations or Tailwind classes'], sample: 'display: flex;\njustify-content: space-between;\npadding: 8px 16px;\nmargin-top: 1rem;\nwidth: 50%;\nfont-size: 18px;\nfont-weight: 700;\nborder-radius: 8px;\nbackground-color: #3b82f6;\ncolor: white;\nborder: 1px solid #ccc;',
  opts: [O.s('dir', 'Direction', 'css-to-tailwind', ['css-to-tailwind', 'tailwind-to-css'])],
  run([inp], { dir }) {
    if (dir === 'css-to-tailwind') {
      const cls = cssDecls(inp).flatMap(([p, v]) => twDecl(p, v));
      if (!cls.length) throw new Error('No declarations found');
      return `class="${cls.join(' ')}"\n\n${cls.join('\n')}`;
    }
    const out = [], bad = [];
    for (const c of inp.split(/\s+/).filter(Boolean).map((x) => x.replace(/^class="|"$/g, '')).filter(Boolean)) { const r = twClass(c); r ? out.push(...r.split(';').map((d) => d.trim().replace(/^([\w-]+):\s*/, '$1: ') + ';')) : bad.push(c); }
    if (!out.length && !bad.length) throw new Error('No classes found');
    return out.join('\n') + (bad.length ? `\n\n/* not converted (variants, palette colors or unsupported): ${bad.join(' ')} */` : '');
  },
});

// ---------- specificity ----------
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
function splitComma(s) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(' || ch === '[') d++; if (ch === ')' || ch === ']') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()).filter(Boolean); }
function specificity(sel) {
  let s = sel.replace(/"[^"]*"|'[^']*'/g, '""'), a = 0, b = 0, c = 0;
  for (;;) {
    const m = /:(not|is|matches|where|has|-webkit-any|-moz-any|nth-child|nth-last-child|[\w-]+)\(/.exec(s); if (!m) break;
    let i = m.index + m[0].length, d = 1; while (i < s.length && d) { if (s[i] === '(') d++; else if (s[i] === ')') d--; i++; }
    const inner = s.slice(m.index + m[0].length, i - 1), n = m[1];
    if (n === 'where') { /* zero */ } else if (['not', 'is', 'matches', 'has', '-webkit-any', '-moz-any'].includes(n)) { const mx = splitComma(inner).map(specificity).sort(cmp).pop() || [0, 0, 0]; a += mx[0]; b += mx[1]; c += mx[2]; }
    else if (n.startsWith('nth-')) { b++; const of = inner.split(/\sof\s/)[1]; if (of) { const mx = splitComma(of).map(specificity).sort(cmp).pop(); a += mx[0]; b += mx[1]; c += mx[2]; } }
    else b++;
    s = s.slice(0, m.index) + ' ' + s.slice(i);
  }
  s = s.replace(/\[[^\]]*\]/g, () => { b++; return ' '; }).replace(/#[\w-]+/g, () => { a++; return ' '; })
    .replace(/::?(before|after|first-line|first-letter)\b|::[\w-]+/g, () => { c++; return ' '; }).replace(/\.[\w-]+/g, () => { b++; return ' '; }).replace(/:[\w-]+/g, () => { b++; return ' '; });
  for (const tok of s.split(/[\s>+~|]+/)) if (/^[a-zA-Z]/.test(tok)) c++;
  return [a, b, c];
}
T.push({
  id: 'css-specificity-calculator', cat: 'CSS', title: 'CSS Specificity Calculator', desc: 'Compute (a,b,c) specificity for CSS selectors and see which one wins.',
  labels: ['Selectors (one per line, comma lists, or a full stylesheet)'], sample: '#nav ul li > a:hover\n.btn.primary:not(.disabled)\na[href^="http"]::after\n:where(.a, .b) p\n*',
  run([inp]) {
    const sels = /\{/.test(inp) ? [...inp.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:^|[}{;])\s*([^{}@;]+)\{/g)].flatMap((m) => splitComma(m[1])) : inp.split('\n').flatMap(splitComma);
    if (!sels.length) throw new Error('No selectors found');
    const rows = sels.map((s) => ({ s, sp: specificity(s) })), win = [...rows].sort((x, y) => cmp(y.sp, x.sp))[0];
    return rows.map((r) => `(${r.sp.join(',')})  ${r.s}${r === win && rows.length > 1 ? '   <- highest' : ''}`).join('\n');
  },
});

T.push({
  id: 'responsive-breakpoint-previewer', cat: 'CSS', title: 'Responsive Breakpoint Previewer', desc: 'Render your HTML at several viewport widths side by side (sandboxed, no scripts).', custom: true, dom: true,
  render(el) {
    const ta = h('textarea', { spellcheck: false, value: '<h1>Hello</h1>\n<p>Resize me.</p>\n<style>body{font-family:system-ui;margin:16px}h1{color:#2563eb}@media(max-width:600px){h1{color:#dc2626}}@media(min-width:900px){body{background:#f1f5f9}}</style>' });
    const widths = h('input', { type: 'text', value: '375, 768, 1024, 1440' }), ht = h('input', { type: 'number', value: 500, style: 'width:90px' }), out = h('div');
    function draw() {
      out.replaceChildren();
      const avail = Math.max(300, out.getBoundingClientRect().width || 900);
      for (const w of widths.value.split(/[\s,]+/).map(Number).filter((x) => x >= 100 && x <= 4000)) {
        const k = Math.min(1, avail / w), hh = clamp(+ht.value || 500, 100, 3000);
        const f = h('iframe', { title: `HTML preview at ${w}px wide`, sandbox: '', srcdoc: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">${ta.value}`, style: `width:${w}px;height:${hh}px;border:1px solid var(--bd);background:#fff;transform:scale(${k});transform-origin:0 0;display:block` });
        out.append(h('label', {}, `${w}px (scale ${rd(k * 100, 0)}%)`), h('div', { style: `width:${w * k}px;height:${hh * k}px;overflow:hidden` }, f));
      }
    }
    for (const x of [ta, widths, ht]) x.addEventListener('input', () => { clearTimeout(draw.t); draw.t = setTimeout(draw, 200); });
    el.append(h('label', {}, 'HTML'), ta, h('div', { className: 'opts' }, h('label', {}, 'Widths (px)', widths), h('label', {}, 'Height', ht)), out);
    draw();
  },
});

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
T.push({
  id: 'aspect-ratio-calculator', cat: 'CSS', title: 'Aspect Ratio Calculator', desc: 'Simplify a W x H ratio and scale it to a new width or height; CSS aspect-ratio and padding-hack snippets.',
  labels: ['Dimensions (W x H or W:H)'], sample: '1920x1080', opts: [O.n('nw', 'New width (0 = none)', 1280), O.n('nh', 'New height (0 = none)', 0)],
  run([inp], { nw, nh }) {
    const m = inp.trim().match(/^([\d.]+)\s*[x:×*/]\s*([\d.]+)$/i); if (!m || !+m[1] || !+m[2]) throw new Error('Use "1920x1080" or "16:9"');
    const w = +m[1], hh = +m[2], f = 1000, g = gcd(Math.round(w * f), Math.round(hh * f)), rw = Math.round(w * f) / g, rh = Math.round(hh * f) / g;
    const out = [`Ratio: ${rw}:${rh}`, `Decimal: ${rd(w / hh, 4)}`, `Megapixels: ${rd(w * hh / 1e6, 2)} MP`, '', `aspect-ratio: ${rw} / ${rh};`, `padding-top: ${rd(hh / w * 100, 3)}%; /* padding-hack */`, `Tailwind: aspect-[${rw}/${rh}]`];
    if (nw > 0) out.push('', `Width ${nw} -> height ${rd(nw * hh / w, 2)}`);
    if (nh > 0) out.push(`Height ${nh} -> width ${rd(nh * w / hh, 2)}`);
    return out.join('\n');
  },
});

// ---------- Images (canvas) ----------
const fmtSize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? rd(n / 1024, 1) + ' KB' : rd(n / 1048576, 2) + ' MB');
const baseName = (f) => (f.name || 'image').replace(/\.[^.]+$/, '');
const toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Encoding failed'))), type, q));
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
async function encode(c, fmt, q, name) {
  let src = c;
  if (fmt === 'jpeg') { src = mkCanvas(c.width, c.height); const x = src.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(c, 0, 0); }
  const b = await toBlob(src, 'image/' + fmt, q / 100);
  return new File([b], `${name}.${EXT[b.type] || fmt}`, { type: b.type });
}
const imgOpts = (def = 'png', q = 90) => [O.s('format', 'Format', def, ['png', 'jpeg', 'webp']), O.n('quality', 'Quality (1-100)', q)];
const imgTool = (id, title, desc, opts, fn, multiple = true) => T.push({
  id, cat: 'Images', title, desc, inputs: 0, sample: '', dom: true, opts, file: { accept: 'image/*', multiple },
  async run(_, o, files) {
    if (!files.length) throw new Error('Choose an image first');
    const out = [], notes = [];
    for (const f of files) {
      const img = await loadImage(f), r = await fn(img, o, f);
      out.push(...r.files); notes.push(r.note || `${f.name}: ${img.naturalWidth}x${img.naturalHeight}, ${fmtSize(f.size)} -> ${r.files.map((x) => `${x.name} ${fmtSize(x.size)}`).join(', ')}`);
    }
    return { blob: out, text: notes.join('\n') };
  },
});
const draw = (img, w, hh) => { const c = mkCanvas(w, hh); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c; };

imgTool('image-resizer', 'Image Resizer', 'Resize by pixels or percent, keep aspect ratio, choose output format. Batch supported.',
  [O.s('mode', 'Mode', 'pixels', ['pixels', 'percent']), O.n('width', 'Width px (0 = auto)', 800), O.n('height', 'Height px (0 = auto)', 0), O.n('percent', 'Percent', 50), O.b('keep', 'Keep aspect ratio', true), ...imgOpts('png')],
  async (img, o, f) => {
    const W = img.naturalWidth, H = img.naturalHeight; let w, hh;
    if (o.mode === 'percent') { w = W * o.percent / 100; hh = H * o.percent / 100; }
    else if (o.keep) { if (o.width > 0) { w = o.width; hh = H * w / W; } else if (o.height > 0) { hh = o.height; w = W * hh / H; } else { w = W; hh = H; } }
    else { w = o.width || W; hh = o.height || H; }
    if (w < 1 || hh < 1 || w > 16384 || hh > 16384) throw new Error('Invalid output size');
    const c = draw(img, w, hh);
    return { files: [await encode(c, o.format, o.quality, `${baseName(f)}-${c.width}x${c.height}`)] };
  });

imgTool('image-compressor', 'Image Compressor', 'Re-encode as JPEG or WebP at a chosen quality and see the size savings. Batch supported.',
  [O.s('format', 'Format', 'jpeg', ['jpeg', 'webp']), O.n('quality', 'Quality (1-100)', 75), O.n('maxw', 'Max width px (0 = keep)', 0)],
  async (img, o, f) => {
    const k = o.maxw > 0 ? Math.min(1, o.maxw / img.naturalWidth) : 1, c = draw(img, img.naturalWidth * k, img.naturalHeight * k);
    const out = await encode(c, o.format, o.quality, `${baseName(f)}-compressed`), sv = (1 - out.size / f.size) * 100;
    return { files: [out], note: `${f.name}: ${fmtSize(f.size)} -> ${fmtSize(out.size)} (${sv >= 0 ? 'saved ' + rd(sv, 1) + '%' : 'larger by ' + rd(-sv, 1) + '%'})` };
  });

imgTool('image-format-converter', 'Image Format Converter', 'Convert images to PNG, JPEG or WebP (formats browsers can encode).',
  imgOpts('webp', 90), async (img, o, f) => ({ files: [await encode(draw(img, img.naturalWidth, img.naturalHeight), o.format, o.quality, baseName(f))] }));

imgTool('image-cropper', 'Image Cropper', 'Crop by numeric rectangle, or center-crop to an aspect ratio.',
  [O.s('ratio', 'Aspect ratio', 'custom rectangle', ['custom rectangle', '1:1', '4:3', '3:2', '16:9', '9:16']), O.n('x', 'X', 0), O.n('y', 'Y', 0), O.n('w', 'Width (0 = rest)', 0), O.n('h', 'Height (0 = rest)', 0), ...imgOpts('png')],
  async (img, o, f) => {
    const W = img.naturalWidth, H = img.naturalHeight; let x = o.x, y = o.y, w = o.w || W - x, hh = o.h || H - y;
    if (o.ratio !== 'custom rectangle') {
      const [a, b] = o.ratio.split(':').map(Number); w = Math.min(W, H * a / b); hh = w * b / a; x = (W - w) / 2; y = (H - hh) / 2;
    }
    x = clamp(x, 0, W - 1); y = clamp(y, 0, H - 1); w = clamp(w, 1, W - x); hh = clamp(hh, 1, H - y);
    const c = mkCanvas(w, hh); c.getContext('2d').drawImage(img, x, y, w, hh, 0, 0, c.width, c.height);
    return { files: [await encode(c, o.format, o.quality, `${baseName(f)}-crop`)] };
  });

imgTool('image-rotate-flip', 'Image Rotate & Flip', 'Rotate by any angle (canvas expands to fit) and flip horizontally or vertically.',
  [O.n('angle', 'Angle (deg, clockwise)', 90), O.b('fh', 'Flip horizontal', false), O.b('fv', 'Flip vertical', false), ...imgOpts('png')],
  async (img, o, f) => {
    const W = img.naturalWidth, H = img.naturalHeight, r = o.angle * Math.PI / 180, cs = Math.abs(Math.cos(r)), sn = Math.abs(Math.sin(r));
    const c = mkCanvas(W * cs + H * sn, W * sn + H * cs), x = c.getContext('2d');
    x.translate(c.width / 2, c.height / 2); x.rotate(r); x.scale(o.fh ? -1 : 1, o.fv ? -1 : 1); x.drawImage(img, -W / 2, -H / 2);
    return { files: [await encode(c, o.format, o.quality, `${baseName(f)}-rotated`)] };
  });

imgTool('image-filters', 'Image Filters', 'Grayscale, sepia, brightness, contrast, blur, invert, saturation and hue (uses canvas filters; not in older Safari).',
  [O.n('grayscale', 'Grayscale %', 0), O.n('sepia', 'Sepia %', 0), O.n('brightness', 'Brightness %', 100), O.n('contrast', 'Contrast %', 100), O.n('saturate', 'Saturate %', 100), O.n('hue', 'Hue deg', 0), O.n('blur', 'Blur px', 0), O.n('invert', 'Invert %', 0), ...imgOpts('png')],
  async (img, o, f) => {
    const c = mkCanvas(img.naturalWidth, img.naturalHeight), x = c.getContext('2d');
    x.filter = `grayscale(${o.grayscale}%) sepia(${o.sepia}%) brightness(${o.brightness}%) contrast(${o.contrast}%) saturate(${o.saturate}%) hue-rotate(${o.hue}deg) blur(${o.blur}px) invert(${o.invert}%)`;
    x.drawImage(img, 0, 0);
    return { files: [await encode(c, o.format, o.quality, `${baseName(f)}-filtered`)] };
  });

imgTool('image-watermark', 'Image Watermark', 'Add a text watermark (single or tiled) with opacity, size and rotation.',
  [O.t('text', 'Text', '(c) Example'), O.n('size', 'Size (% of width)', 6), O.n('opacity', 'Opacity %', 50), O.c('color', 'Color', '#ffffff'), O.n('angle', 'Rotation deg', -30), O.s('pos', 'Position', 'bottom-right', ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center', 'tiled']), ...imgOpts('png')],
  async (img, o, f) => {
    const W = img.naturalWidth, H = img.naturalHeight, c = draw(img, W, H), x = c.getContext('2d'), fs = Math.max(8, W * o.size / 100);
    x.font = `bold ${fs}px sans-serif`; x.fillStyle = o.color; x.globalAlpha = clamp(o.opacity, 0, 100) / 100; x.textBaseline = 'middle'; x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = fs / 8;
    const tw = x.measureText(o.text).width, pad = fs, r = o.angle * Math.PI / 180;
    const put = (cx, cy, a) => { x.save(); x.translate(cx, cy); x.rotate(a); x.textAlign = 'center'; x.fillText(o.text, 0, 0); x.restore(); };
    if (o.pos === 'tiled') { for (let yy = fs; yy < H + fs; yy += fs * 4) for (let xx = 0, row = 0; xx < W + tw; xx += tw + fs * 2) put(xx + (row++ % 2) * tw / 2, yy, r); }
    else { const px2 = o.pos.endsWith('left') ? tw / 2 + pad : o.pos.endsWith('right') ? W - tw / 2 - pad : W / 2, py = o.pos.startsWith('top') ? fs : o.pos.startsWith('bottom') ? H - fs : H / 2; put(px2, py, o.pos === 'center' ? r : 0); }
    return { files: [await encode(c, o.format, o.quality, `${baseName(f)}-watermarked`)] };
  });

T.push({
  id: 'image-to-base64', cat: 'Images', title: 'Image to Base64', desc: 'Encode images as data URIs, ready for <img>, CSS or raw Base64.', inputs: 0, sample: '', dom: true, file: { accept: 'image/*', multiple: true },
  opts: [O.s('as', 'Output', 'data URI', ['data URI', 'raw base64', '<img> tag', 'CSS background'])],
  async run(_, { as }, files) {
    if (!files.length) throw new Error('Choose an image first');
    const outs = await Promise.all(files.map((f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Read failed')); r.readAsDataURL(f); })));
    return outs.map((d, i) => `/* ${files[i].name} (${fmtSize(files[i].size)} -> ${fmtSize(d.length)} encoded) */\n` + (as === 'raw base64' ? d.split(',')[1] : as === '<img> tag' ? `<img src="${d}" alt="">` : as === 'CSS background' ? `background-image: url("${d}");` : d)).join('\n\n');
  },
});

T.push({
  id: 'image-collage', cat: 'Images', title: 'Image Collage Maker', desc: 'Arrange several images into a grid collage.', inputs: 0, sample: '', dom: true, file: { accept: 'image/*', multiple: true },
  opts: [O.n('cols', 'Columns', 3), O.n('cell', 'Cell size px', 400), O.n('gap', 'Gap px', 8), O.c('bg', 'Background', '#ffffff'), O.s('fit', 'Fit', 'cover', ['cover', 'contain']), ...imgOpts('jpeg', 90)],
  async run(_, o, files) {
    if (!files.length) throw new Error('Choose two or more images');
    const imgs = await Promise.all(files.map(loadImage)), cols = clamp(Math.round(o.cols), 1, 12), rows = Math.ceil(imgs.length / cols), cell = clamp(o.cell, 40, 2000), g = o.gap;
    const c = mkCanvas(cols * cell + (cols + 1) * g, rows * cell + (rows + 1) * g), x = c.getContext('2d');
    x.fillStyle = o.bg; x.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      const dx = g + (i % cols) * (cell + g), dy = g + Math.floor(i / cols) * (cell + g), W = im.naturalWidth, H = im.naturalHeight;
      const k = o.fit === 'cover' ? Math.max(cell / W, cell / H) : Math.min(cell / W, cell / H), sw = cell / k, sh = cell / k;
      x.save(); x.beginPath(); x.rect(dx, dy, cell, cell); x.clip();
      if (o.fit === 'cover') x.drawImage(im, (W - sw) / 2, (H - sh) / 2, sw, sh, dx, dy, cell, cell); else x.drawImage(im, dx + (cell - W * k) / 2, dy + (cell - H * k) / 2, W * k, H * k);
      x.restore();
    });
    return { blob: await encode(c, o.format, o.quality, 'collage'), text: `${imgs.length} images, ${c.width}x${c.height}` };
  },
});

T.push({
  id: 'placeholder-image-generator', cat: 'Images', title: 'Placeholder Image Generator', desc: 'Make a WxH placeholder image with custom colors and text, as PNG or SVG.', inputs: 0, sample: '', dom: true,
  opts: [O.n('w', 'Width', 600), O.n('h', 'Height', 400), O.c('bg', 'Background', '#cccccc'), O.c('fg', 'Text color', '#555555'), O.t('text', 'Text (empty = WxH)', ''), O.s('format', 'Format', 'png', ['png', 'svg'])],
  async run(_, o) {
    const w = clamp(Math.round(o.w), 1, 8000), hh = clamp(Math.round(o.h), 1, 8000), txt = o.text || `${w} x ${hh}`, fs = Math.max(10, Math.min(w / Math.max(4, txt.length * 0.6), hh / 3));
    if (o.format === 'svg') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}"><rect width="100%" height="100%" fill="${esc(o.bg)}"/><text x="50%" y="50%" fill="${esc(o.fg)}" font-family="sans-serif" font-size="${rd(fs, 1)}" text-anchor="middle" dominant-baseline="central">${esc(txt)}</text></svg>`;
      return { blob: new File([svg], `placeholder-${w}x${hh}.svg`, { type: 'image/svg+xml' }), text: svg };
    }
    const c = mkCanvas(w, hh), x = c.getContext('2d');
    x.fillStyle = o.bg; x.fillRect(0, 0, w, hh); x.fillStyle = o.fg; x.font = `${fs}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, w / 2, hh / 2);
    return { blob: await encode(c, 'png', 100, `placeholder-${w}x${hh}`) };
  },
});

function squareCanvas(img, size, bg) {
  const c = mkCanvas(size, size), x = c.getContext('2d'), W = img.naturalWidth, H = img.naturalHeight, s = Math.min(W, H);
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, size, size); }
  x.imageSmoothingQuality = 'high'; x.drawImage(img, (W - s) / 2, (H - s) / 2, s, s, 0, 0, size, size);
  return c;
}
async function ico(img, sizes) {
  const pngs = await Promise.all(sizes.map(async (s) => new Uint8Array(await (await toBlob(squareCanvas(img, s), 'image/png')).arrayBuffer())));
  const head = new DataView(new ArrayBuffer(6 + 16 * sizes.length)); head.setUint16(2, 1, true); head.setUint16(4, sizes.length, true);
  let off = head.byteLength;
  sizes.forEach((s, i) => { const p = 6 + i * 16; head.setUint8(p, s >= 256 ? 0 : s); head.setUint8(p + 1, s >= 256 ? 0 : s); head.setUint16(p + 4, 1, true); head.setUint16(p + 6, 32, true); head.setUint32(p + 8, pngs[i].length, true); head.setUint32(p + 12, off, true); off += pngs[i].length; });
  return new File([head.buffer, ...pngs], 'favicon.ico', { type: 'image/x-icon' });
}
T.push({
  id: 'favicon-generator', cat: 'Images', title: 'Favicon Generator', desc: 'From one image: favicon.ico, 16/32/48/180/192/512 PNGs, an HTML snippet and site.webmanifest.', inputs: 0, sample: '', dom: true, file: { accept: 'image/*' },
  opts: [O.t('name', 'App name', 'My Site'), O.c('theme', 'Theme color', '#ffffff')],
  async run(_, o, files) {
    if (!files[0]) throw new Error('Choose an image first');
    const img = await loadImage(files[0]), sizes = { 'favicon-16x16.png': 16, 'favicon-32x32.png': 32, 'favicon-48x48.png': 48, 'apple-touch-icon.png': 180, 'android-chrome-192x192.png': 192, 'android-chrome-512x512.png': 512 };
    const out = [await ico(img, [16, 32, 48])];
    for (const [n, s] of Object.entries(sizes)) { const b = await toBlob(squareCanvas(img, s), 'image/png'); out.push(new File([b], n, { type: 'image/png' })); }
    const manifest = JSON.stringify({ name: o.name, short_name: o.name, icons: [{ src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' }, { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }], theme_color: o.theme, background_color: o.theme, display: 'standalone' }, null, 2);
    out.push(new File([manifest], 'site.webmanifest', { type: 'application/manifest+json' }));
    const html = `<link rel="icon" href="/favicon.ico" sizes="48x48">\n<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">\n<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">\n<link rel="manifest" href="/site.webmanifest">\n<meta name="theme-color" content="${o.theme}">`;
    return { blob: out, text: `${html}\n\n/* site.webmanifest */\n${manifest}` };
  },
});

const IOS = [1024, 180, 167, 152, 120, 87, 80, 76, 60, 58, 40, 29, 20], ANDROID = { 'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96, 'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192, 'play-store': 512 };
T.push({
  id: 'app-icon-generator', cat: 'Images', title: 'App Icon Generator', desc: 'Generate iOS and Android app icon PNG sizes from one square-ish image.', inputs: 0, sample: '', dom: true, file: { accept: 'image/*' },
  opts: [O.s('platform', 'Platform', 'both', ['both', 'ios', 'android']), O.c('bg', 'iOS background (no transparency)', '#ffffff')],
  async run(_, o, files) {
    if (!files[0]) throw new Error('Choose an image first');
    const img = await loadImage(files[0]), out = [], mk = async (name, s, bg) => out.push(new File([await toBlob(squareCanvas(img, s, bg), 'image/png')], name, { type: 'image/png' }));
    if (o.platform !== 'android') for (const s of IOS) await mk(`ios-icon-${s}.png`, s, o.bg);
    if (o.platform !== 'ios') for (const [d, s] of Object.entries(ANDROID)) await mk(`android-${d}-${s}.png`, s);
    return { blob: out, text: `${out.length} icons:\n${out.map((f) => f.name).join('\n')}` };
  },
});

T.push({
  id: 'image-to-ascii', cat: 'Images', title: 'Image to ASCII Art', desc: 'Convert an image to ASCII text art.', inputs: 0, sample: '', dom: true, file: { accept: 'image/*' },
  opts: [O.n('cols', 'Columns', 100), O.b('invert', 'Invert (for light-on-dark)', false), O.t('ramp', 'Character ramp (dark to light)', '@%#*+=-:. ')],
  async run(_, o, files) {
    if (!files[0]) throw new Error('Choose an image first');
    const img = await loadImage(files[0]), cols = clamp(Math.round(o.cols), 10, 300), rows = Math.max(1, Math.round(cols * img.naturalHeight / img.naturalWidth * 0.5));
    const c = mkCanvas(cols, rows), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cols, rows); x.drawImage(img, 0, 0, cols, rows);
    const d = x.getImageData(0, 0, cols, rows).data, ramp = [...(o.ramp || '@%#*+=-:. ')]; if (o.invert) ramp.reverse();
    let s = ''; for (let i = 0; i < rows; i++) { for (let j = 0; j < cols; j++) { const p = (i * cols + j) * 4, l = (0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2]) / 255; s += ramp[Math.min(ramp.length - 1, Math.floor(l * ramp.length))]; } s += '\n'; }
    return s;
  },
});

T.push({
  id: 'image-info', cat: 'Images', title: 'Image Info', desc: 'Dimensions, type, size, aspect ratio, transparency and dominant colors of images.', inputs: 0, sample: '', dom: true, file: { accept: 'image/*', multiple: true },
  async run(_, __, files) {
    if (!files.length) throw new Error('Choose an image first');
    const res = [];
    for (const f of files) {
      const img = await loadImage(f), W = img.naturalWidth, H = img.naturalHeight, c = drawFit(img, 100), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let alpha = false, sum = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 255) alpha = true; sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; }
      const g = gcd(W, H), px = pixelsOf(img), dom = px.length ? medianCut(px, 5).map((x) => `${hexOf(x.rgb)} (${rd(x.n / px.length * 100, 0)}%)`).join('  ') : '(fully transparent)';
      res.push([`# ${f.name}`, `Type: ${f.type || 'unknown'}`, `File size: ${fmtSize(f.size)} (${f.size} bytes)`, `Dimensions: ${W} x ${H} (${rd(W * H / 1e6, 2)} MP)`, `Aspect ratio: ${W / g}:${H / g}`, `Transparency: ${alpha ? 'yes' : 'no'}`, `Average brightness: ${rd(sum / (d.length / 4) / 255 * 100, 0)}%`, `Dominant colors: ${dom}`].join('\n'));
    }
    return res.join('\n\n');
  },
});

// ---------- SVG ----------
const svgImg = (s) => `<img alt="Rendered SVG" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}" style="max-width:100%;max-height:260px;background:repeating-conic-gradient(#8881 0 25%,#0000 0 50%) 0/16px 16px">`;
const NUMATTR = 'd|points|transform|viewBox|x|y|width|height|cx|cy|r|rx|ry|x1|y1|x2|y2|offset|stroke-width|stroke-dasharray|opacity|fill-opacity|stroke-opacity|stroke-miterlimit|gradientTransform';
function optSvg(src, o) {
  let s = src.trim();
  if (!/<svg[\s>]/i.test(s)) throw new Error('Input does not look like an SVG');
  s = s.replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[\s\S]*?\]?>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<metadata[\s\S]*?<\/metadata>/gi, '');
  s = s.replace(/<(sodipodi|inkscape|rdf|cc|dc|sketch|i|x):[\w-]+\b[^>]*?(?:\/>|>[\s\S]*?<\/\1:[\w-]+>)/g, '');
  s = s.replace(/\s(?:sodipodi|inkscape|sketch|xml:space|data-name|enable-background|version)(?::[\w-]+)?="[^"]*"/g, '').replace(/\sxmlns:(?:sodipodi|inkscape|sketch|dc|cc|rdf|i|x)="[^"]*"/g, '');
  if (!/xlink:/.test(s.replace(/xmlns:xlink="[^"]*"/, ''))) s = s.replace(/\sxmlns:xlink="[^"]*"/, '');
  if (o.titles) s = s.replace(/<(title|desc)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  if (o.ids) s = s.replace(/\sid="([^"]+)"/g, (m, id) => (s.includes('#' + id + ')') || s.includes('#' + id + '"') || s.includes("#" + id + "'") ? m : ''));
  const num = (v) => { let t = String(+(+v).toFixed(clamp(o.precision, 0, 8))); if (t === '-0') t = '0'; return t.replace(/^(-?)0\./, '$1.'); };
  s = s.replace(new RegExp(`(\\s(?:${NUMATTR}))="([^"]*)"`, 'g'), (m, a, v) => {
    v = v.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi, num);
    if (a.trim() === 'd' || a.trim() === 'points') v = v.replace(/\s*,\s*/g, ',').replace(/([a-zA-Z])\s+/g, '$1').replace(/\s+([a-zA-Z])/g, '$1').replace(/(\d|\.)\s+(?=-)/g, '$1').replace(/\s+/g, ' ').trim();
    return `${a}="${v}"`;
  });
  for (let prev; prev !== s;) { prev = s; s = s.replace(/<g\b[^>]*>\s*<\/g>|<g\b[^>]*\/>|<defs\s*>\s*<\/defs>|<defs\s*\/>/g, ''); }
  s = s.replace(/<[^>]+>/g, (t) => t.replace(/\s+/g, ' ').replace(/\s*\/>/, '/>').replace(/\s+>/, '>')).replace(/>\s*\n\s*</g, '><').trim();
  return s;
}
T.push({
  id: 'svg-optimizer', cat: 'SVG', title: 'SVG Optimizer', desc: 'Strip comments, metadata and editor cruft, drop empty groups and unused ids, shorten numbers and collapse whitespace.',
  labels: ['SVG code'], sample: '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generator: Inkscape -->\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="100.000" height="100.000" viewBox="0 0 100.000 100.000" version="1.1">\n  <metadata>junk</metadata>\n  <g id="empty">\n  </g>\n  <g id="layer1" inkscape:label="Layer 1">\n    <circle id="c1" cx="50.0000" cy="50.12345" r="40.00" fill="#f00"/>\n    <path d="M 10.00000 , 10.00000 L 90.000001 10.5 L 50 0.250" fill="none" stroke="#000"/>\n  </g>\n</svg>\n',
  opts: [O.n('precision', 'Decimal places', 2), O.b('ids', 'Remove unused ids', true), O.b('titles', 'Remove <title>/<desc>', false)],
  run([inp], o) {
    const out = optSvg(inp, o), a = new TextEncoder().encode(inp).length, b = new TextEncoder().encode(out).length;
    return { text: out, html: page(`<p style="padding:8px">${a} B -> ${b} B (saved ${rd((1 - b / a) * 100, 1)}%)</p>${svgImg(out)}`) };
  },
});

function svgSize(svg) {
  const tag = svg.match(/<svg\b[^>]*>/i); if (!tag) throw new Error('Not an SVG');
  const at = (n) => (tag[0].match(new RegExp(`\\s${n}="([\\d.]+)(?:px)?"`)) || [])[1];
  const vb = (tag[0].match(/viewBox="([^"]+)"/) || [])[1]?.split(/[\s,]+/).map(Number);
  const w = +at('width') || vb?.[2] || 300, hh = +at('height') || vb?.[3] || 150;
  let t = tag[0].replace(/\s(?:width|height)="[^"]*"/g, '').replace(/^<svg/i, `<svg width="${w}" height="${hh}"`);
  if (!/xmlns=/.test(t)) t = t.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return { w, h: hh, svg: svg.replace(tag[0], t) };
}
T.push({
  id: 'svg-to-png', cat: 'SVG', title: 'SVG to PNG Converter', desc: 'Rasterize SVG code to PNG, JPEG or WebP at any scale with optional background.',
  labels: ['SVG code'], sample: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="#3b82f6"/><path d="M35 62l18 18 32-36" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  dom: true, opts: [O.n('scale', 'Scale', 2), O.t('bg', 'Background (empty = transparent)', ''), O.s('format', 'Format', 'png', ['png', 'jpeg', 'webp'])],
  async run([inp], o) {
    const { w, h: hh, svg } = svgSize(inp.trim()), k = clamp(o.scale || 1, 0.1, 20);
    const img = await loadImage(new Blob([svg], { type: 'image/svg+xml' }));
    const c = mkCanvas(w * k, hh * k), x = c.getContext('2d'); if (o.bg) { x.fillStyle = o.bg; x.fillRect(0, 0, c.width, c.height); }
    x.drawImage(img, 0, 0, c.width, c.height);
    return { blob: await encode(c, o.format, 95, 'image'), text: `${c.width} x ${c.height}px` };
  },
});

T.push({
  id: 'svg-preview-editor', cat: 'SVG', title: 'SVG Preview Editor', desc: 'Edit SVG code and see it rendered live, with syntax validation.', custom: true, dom: true,
  render(el) {
    const ta = h('textarea', { spellcheck: false, style: 'min-height:200px', value: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="400">\n  <rect width="200" height="100" rx="10" fill="#0ea5e9"/>\n  <text x="100" y="58" text-anchor="middle" font-size="28" fill="#fff" font-family="sans-serif">Hello SVG</text>\n</svg>' });
    const out = h('div');
    function go() {
      out.replaceChildren();
      const doc = new DOMParser().parseFromString(ta.value, 'image/svg+xml'), err = doc.querySelector('parsererror');
      if (err || doc.documentElement.localName !== 'svg') { out.append(h('pre', { className: 'out err' }, err ? err.textContent.split('\n')[0] : 'Root element must be <svg>')); return; }
      out.append(h('img', { className: 'prev', alt: 'Rendered preview of the SVG code', src: URL.createObjectURL(new Blob([ta.value], { type: 'image/svg+xml' })), style: 'background:#fff;max-height:420px' }), h('div', { className: 'desc' }, `${new TextEncoder().encode(ta.value).length} bytes`));
    }
    ta.addEventListener('input', () => { clearTimeout(go.t); go.t = setTimeout(go, 150); });
    el.append(h('label', {}, 'SVG code'), ta, out); go();
  },
});

const PAT = {
  dots: (s, c) => `<circle cx='${s / 2}' cy='${s / 2}' r='${s / 8}' fill='${c}'/>`,
  grid: (s, c, w) => `<path d='M${s} 0H0V${s}' fill='none' stroke='${c}' stroke-width='${w}'/>`,
  lines: (s, c, w) => `<path d='M0 ${s / 2}H${s}' stroke='${c}' stroke-width='${w}'/>`,
  'vertical-lines': (s, c, w) => `<path d='M${s / 2} 0V${s}' stroke='${c}' stroke-width='${w}'/>`,
  diagonal: (s, c, w) => `<path d='M0 ${s}L${s} 0M-1 1L1 -1M${s - 1} ${s + 1}L${s + 1} ${s - 1}' stroke='${c}' stroke-width='${w}'/>`,
  zigzag: (s, c, w) => `<path d='M0 ${s * 0.75}L${s / 2} ${s * 0.25}L${s} ${s * 0.75}' fill='none' stroke='${c}' stroke-width='${w}'/>`,
  waves: (s, c, w) => `<path d='M0 ${s / 2}Q${s / 4} 0 ${s / 2} ${s / 2}T${s} ${s / 2}' fill='none' stroke='${c}' stroke-width='${w}'/>`,
  checker: (s, c) => `<rect width='${s / 2}' height='${s / 2}' fill='${c}'/><rect x='${s / 2}' y='${s / 2}' width='${s / 2}' height='${s / 2}' fill='${c}'/>`,
  plus: (s, c, w) => `<path d='M${s / 2} ${s / 4}V${s * 0.75}M${s / 4} ${s / 2}H${s * 0.75}' stroke='${c}' stroke-width='${w}'/>`,
  triangles: (s, c) => `<path d='M0 ${s}L${s / 2} 0L${s} ${s}Z' fill='${c}'/>`,
};
T.push({
  id: 'svg-pattern-generator', cat: 'SVG', title: 'SVG Pattern Generator', desc: 'Seamless SVG background patterns (dots, grid, lines, waves, checker...) as SVG and CSS.', inputs: 0, sample: '',
  opts: [O.s('type', 'Pattern', 'dots', Object.keys(PAT)), O.n('size', 'Tile size px', 24), O.n('stroke', 'Stroke width', 1.5), O.c('fg', 'Pattern color', '#94a3b8'), O.c('bg', 'Background', '#f8fafc')],
  run(_, o) {
    const s = clamp(o.size, 4, 400), svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}' viewBox='0 0 ${s} ${s}'><rect width='${s}' height='${s}' fill='${o.bg}'/>${PAT[o.type](s, o.fg, o.stroke)}</svg>`;
    const uri = svg.replace(/%/g, '%25').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23');
    const css = `background-color: ${o.bg};\nbackground-image: url("data:image/svg+xml,${uri}");\nbackground-size: ${s}px ${s}px;`;
    return { text: `${svg}\n\n/* CSS */\n${css}`, html: page(`<div style="height:100vh;min-height:240px;${esc(css.replace(/\n/g, ' '))}"></div>`) };
  },
});

const KIND = { M: 'xy', L: 'xy', T: 'xy', H: 'x', V: 'y', C: 'xyxyxy', S: 'xyxy', Q: 'xyxy', A: 'ABOffxy' };
function parsePath(d) {
  const tk = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi); if (!tk) throw new Error('No path data found');
  const segs = []; let i = 0, cmd = null, cx = 0, cy = 0, sx = 0, sy = 0;
  while (i < tk.length) {
    if (/^[a-z]$/i.test(tk[i])) { cmd = tk[i++]; if (/z/i.test(cmd)) { segs.push({ c: 'Z', a: [] }); cx = sx; cy = sy; continue; } }
    else if (!cmd) throw new Error('Path must start with a command'); else if (cmd === 'M') cmd = 'L'; else if (cmd === 'm') cmd = 'l'; else if (/z/i.test(cmd)) throw new Error('Unexpected number after Z');
    const up = cmd.toUpperCase(), rel = cmd !== up, a = [];
    for (const k of KIND[up]) { const t = tk[i++]; if (t == null || /^[a-z]$/i.test(t)) throw new Error(`Missing number for "${cmd}"`); let v = parseFloat(t); if (rel) { if (k === 'x') v += cx; else if (k === 'y') v += cy; } a.push(v); }
    if (up === 'H') cx = a[0]; else if (up === 'V') cy = a[0]; else { cx = a[a.length - 2]; cy = a[a.length - 1]; }
    if (up === 'M') { sx = cx; sy = cy; }
    segs.push({ c: up, a });
  }
  return segs;
}
T.push({
  id: 'svg-path-editor', cat: 'SVG', title: 'SVG Path Editor', desc: 'Parse an SVG path, translate/scale it, convert absolute/relative, round numbers, and list its points with a preview.',
  labels: ['Path data (d attribute)'], sample: 'M10 10 h 80 v 40 c 0 20 -20 30 -40 30 s -40 -10 -40 -30 z',
  opts: [O.n('tx', 'Translate X', 0), O.n('ty', 'Translate Y', 0), O.n('sx', 'Scale X', 1), O.n('sy', 'Scale Y', 1), O.n('prec', 'Decimals', 2), O.s('mode', 'Output', 'absolute', ['absolute', 'relative'])],
  run([inp], o) {
    const segs = parsePath(inp.replace(/^\s*d\s*=\s*["']?|["']\s*$/g, ''));
    segs.forEach((g) => { const k = g.c === 'Z' ? '' : KIND[g.c]; g.a = g.a.map((v, j) => (k[j] === 'x' ? v * o.sx + o.tx : k[j] === 'y' ? v * o.sy + o.ty : k[j] === 'A' ? v * Math.abs(o.sx) : k[j] === 'B' ? v * Math.abs(o.sy) : v)); });
    const f = (v) => String(rd(v, clamp(o.prec, 0, 8))), rel = o.mode === 'relative', pts = [], xs = [], ys = [];
    let cx = 0, cy = 0, sx = 0, sy = 0, d = '';
    for (const g of segs) {
      if (g.c === 'Z') { d += rel ? 'z' : 'Z'; cx = sx; cy = sy; continue; }
      const k = KIND[g.c];
      d += (rel ? g.c.toLowerCase() : g.c) + g.a.map((v, j) => f(rel && k[j] === 'x' ? v - cx : rel && k[j] === 'y' ? v - cy : v)).join(' ');
      g.a.forEach((v, j) => { if (k[j] === 'x') xs.push(v); if (k[j] === 'y') ys.push(v); });
      if (g.c === 'H') cx = g.a[0]; else if (g.c === 'V') cy = g.a[0]; else { cx = g.a[g.a.length - 2]; cy = g.a[g.a.length - 1]; }
      if (g.c === 'M') { sx = cx; sy = cy; }
      pts.push([cx, cy, g.c]);
    }
    const x0 = Math.min(...xs), y0 = Math.min(...ys), bw = Math.max(...xs) - x0 || 1, bh = Math.max(...ys) - y0 || 1, pad = Math.max(bw, bh) * 0.1;
    const r = Math.max(bw, bh) / 60;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0 - pad} ${y0 - pad} ${bw + 2 * pad} ${bh + 2 * pad}" style="width:100%;max-height:320px"><path d="${d}" fill="#3b82f622" stroke="#2563eb" stroke-width="${r / 2}"/>${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#dc2626"/>`).join('')}</svg>`;
    return { text: `d="${d}"\n\nPoints (${pts.length}):\n${pts.map(([x, y, c], i) => `${i + 1}. ${c} ${f(x)}, ${f(y)}`).join('\n')}`, html: page(svg) };
  },
});

export default T;

// Tools from free-browser-tools.md, batch 17 (unit converters, date and time). See TOOLS.md for the contract.
// SKIPPED (need an API): public holiday lists (Nager.Date), weather forecast (Open-Meteo). Sunrise and sunset are computed offline instead.
const T = [];
const CV = 'Converters', EV = 'Calculators - Everyday', DT = 'Date & Time', TP = 'Time & Productivity';

// ---------- helpers ----------
const fmt = (x) => {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e13 || a < 1e-7) return Number(x.toPrecision(8)).toExponential().replace('e+', 'e');
  return x.toLocaleString('en-US', { maximumSignificantDigits: 10 });
};
const f2 = (x, d = 2) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pad2 = (n) => String(n).padStart(2, '0');
const sel = (id, label, choices, def) => ({ id, label, type: 'select', choices, def: def ?? choices[0] });
const num = (id, label, def) => ({ id, label, type: 'number', def });
const txt = (id, label, def) => ({ id, label, type: 'text', def });
const dat = (id, label, def) => ({ id, label, type: 'date', def });
const chk = (id, label, def = false) => ({ id, label, type: 'checkbox', def });
const calc = (id, cat, title, desc, opts, fn) => ({ id, cat, title, desc, inputs: 0, sample: '', opts, run: (_i, o) => fn(o) });
const lineTool = (id, cat, title, desc, label, sample, opts, fn) => ({ id, cat, title, desc, inputs: 1, labels: [label], sample, opts, run: ([t], o) => fn(String(t || ''), o) });
const lines = (t) => t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const need = (v, name) => { const n = Number(v); if (v === '' || v == null || !Number.isFinite(n)) throw new Error('Enter a valid number for ' + name); return n; };
const iso = (d) => d.toISOString().slice(0, 10);
const D = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '').trim());
  if (!m) throw new Error('Enter a valid date (YYYY-MM-DD)');
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(d) || d.getUTCMonth() !== +m[2] - 1) throw new Error('Invalid date: ' + m[0]);
  return d;
};
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const wd = (d) => WD[d.getUTCDay()];
const dstr = (d) => iso(d) + ' (' + wd(d) + ')';
const dim = (y, mo) => new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const addMonths = (d, n) => {
  const t = d.getUTCFullYear() * 12 + d.getUTCMonth() + n, y = Math.floor(t / 12), mo = t - y * 12;
  return new Date(Date.UTC(y, mo, Math.min(d.getUTCDate(), dim(y, mo))));
};
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const parseHolidays = (t) => new Set(lines(t || '').map((l) => iso(D(l.split(/[\s,;]/)[0]))));

// ---------- unit converters (factory) ----------
const conv = (id, title, desc, units, def, opts = {}) => {
  const names = Object.keys(units);
  return calc(id, CV, title, desc, [num('v', 'Value', opts.v ?? 1), sel('from', 'From unit', names, def)], (o) => {
    const v = need(o.v, 'Value');
    if (!(o.from in units)) throw new Error('Pick a unit');
    const base = v * units[o.from];
    let out = `${fmt(v)} ${o.from} equals:\n\n` + names.map((u) => `  ${fmt(base / units[u]).padStart(22)}  ${u}`).join('\n');
    if (opts.extra) out += '\n\n' + opts.extra(base, v, o);
    return out + (opts.note ? '\n\n' + opts.note : '');
  });
};
const GAL = 3.785411784, IGAL = 4.54609, MI = 1.609344, LB = 0.45359237, FT = 0.3048, FT3 = 0.028316846592;
const LBF = LB * 9.80665;

T.push(conv('volume-us-imperial-converter', 'Volume Converter with US and Imperial Gallons',
  'Convert litres, millilitres, cubic metres and cups, fluid ounces, pints, quarts and gallons, with US and UK (imperial) units kept apart.',
  { 'L': 1, 'mL': 0.001, 'm3': 1000, 'US gal': GAL, 'US qt': GAL / 4, 'US pt': GAL / 8, 'US cup': GAL / 16, 'US fl oz': GAL / 128, 'US tbsp': GAL / 256, 'US tsp': GAL / 768, 'UK gal': IGAL, 'UK qt': IGAL / 4, 'UK pt': IGAL / 8, 'UK fl oz': IGAL / 160 }, 'US gal',
  { note: 'US gallon = 231 cubic inches = 3.785411784 L (exact). UK gallon = 4.54609 L (exact). A UK pint is 20 UK fl oz, a US pint 16 US fl oz.' }));

T.push(conv('power-unit-converter', 'Power Converter: Watts, Kilowatts and Horsepower',
  'Convert watts, kilowatts, megawatts, mechanical horsepower, metric horsepower (PS), BTU per hour and refrigeration tons.',
  { 'W': 1, 'kW': 1000, 'MW': 1e6, 'hp (mechanical)': 745.6998715822702, 'PS (metric hp)': 735.49875, 'BTU/h': 1055.05585262 / 3600, 'kcal/h': 4184 / 3600, 'ft lbf/s': LBF * FT, 'ton of refrigeration': 12000 * 1055.05585262 / 3600 }, 'hp (mechanical)',
  { note: 'Mechanical horsepower is 550 ft lbf/s. Metric horsepower is 75 kgf m/s. BTU is the International Table BTU.' }));

T.push(conv('torque-unit-converter', 'Torque Converter: Newton-Metres and Foot-Pounds',
  'Convert newton-metres, foot-pounds, inch-pounds, kilogram-force metres and ounce-inches, for example a wheel nut or bolt spec.',
  { 'N m': 1, 'N cm': 0.01, 'kN m': 1000, 'kgf m': 9.80665, 'kgf cm': 0.0980665, 'lbf ft': LBF * FT, 'lbf in': LBF * 0.0254, 'ozf in': LBF / 16 * 0.0254, 'dyne cm': 1e-7 }, 'lbf ft',
  { note: 'Based on standard gravity 9.80665 m/s2 and the avoirdupois pound 0.45359237 kg. Always check a torque spec against the maker, not a converter.' }));

T.push(conv('density-unit-converter', 'Density Converter: kg/m3, g/cm3 and lb/ft3',
  'Convert kilograms per cubic metre, grams per cubic centimetre, pounds per cubic foot and per US gallon, with a list of typical material densities.',
  { 'kg/m3': 1, 'g/cm3': 1000, 'g/mL': 1000, 'kg/L': 1000, 'lb/ft3': LB / FT3, 'lb/in3': LB / 1.6387064e-5, 'lb/US gal': LB / (GAL / 1000), 'lb/UK gal': LB / (IGAL / 1000), 'oz/in3': LB / 16 / 1.6387064e-5 }, 'g/cm3',
  { extra: () => 'Typical values (kg/m3, approximate, vary with temperature and grade):\n  air at 15 C, sea level 1.225\n  water at 4 C 1000\n  ice 917\n  oak wood 600 to 900\n  aluminium 2700\n  steel 7850\n  copper 8960\n  lead 11340\n  gold 19320', note: 'Material values are textbook approximations and were not checked against a single source.' }));

T.push(conv('flow-rate-unit-converter', 'Flow Rate Converter: Litres per Minute, Gallons per Hour, m3/s',
  'Convert litres per minute, litres per second, cubic metres per hour or second, US and UK gallons per minute or hour and cubic feet per minute.',
  { 'L/min': 1e-3 / 60, 'L/s': 1e-3, 'mL/s': 1e-6, 'm3/h': 1 / 3600, 'm3/s': 1, 'US gal/min': GAL / 1000 / 60, 'US gal/h': GAL / 1000 / 3600, 'UK gal/min': IGAL / 1000 / 60, 'UK gal/h': IGAL / 1000 / 3600, 'ft3/min (CFM)': FT3 / 60, 'ft3/s': FT3 }, 'L/min'));

T.push(conv('frequency-rpm-converter', 'Frequency Converter: Hz, kHz, MHz and RPM',
  'Convert hertz, kilohertz, megahertz, gigahertz, revolutions per minute and radians per second, and see the period of one cycle.',
  { 'Hz': 1, 'kHz': 1e3, 'MHz': 1e6, 'GHz': 1e9, 'RPM': 1 / 60, 'rad/s': 1 / (2 * Math.PI) }, 'RPM',
  { extra: (base) => base > 0 ? `Period of one cycle: ${fmt(1 / base)} s (${fmt(1000 / base)} ms)` : 'Period: not defined for 0', note: '1 Hz = 60 RPM.' }));

T.push(conv('illuminance-lux-footcandle-converter', 'Illuminance Converter: Lux and Foot-Candles',
  'Convert lux, foot-candles and phot, with approximate light levels for moonlight, homes, offices and daylight.',
  { 'lux': 1, 'foot-candle': 1 / 0.09290304, 'phot': 1e4, 'lumen/m2': 1 }, 'lux',
  { extra: () => 'Typical light levels (lux, rough guides):\n  full moon, clear night 0.1 to 1\n  living room 50 to 150\n  office desk work 300 to 500\n  overcast day 1,000 to 10,000\n  full daylight, no direct sun 10,000 to 25,000\n  direct sunlight 32,000 to 100,000', note: '1 foot-candle = 1 lumen per square foot = 10.7639 lux. The typical levels are rough orientation values, not a lighting standard.' }));

// angle
const frac = (x) => {
  for (let d = 1; d <= 360; d++) { const n = Math.round(x * d); if (Math.abs(x - n / d) < 1e-9 * Math.max(1, Math.abs(x))) { const g = (a, b) => (b ? g(b, a % b) : a); const k = g(Math.abs(n), d); return [n / k, d / k]; } }
  return null;
};
T.push(conv('angle-unit-converter', 'Angle Converter: Degrees, Radians and Gradians',
  'Convert degrees, radians, gradians, turns, arcminutes, arcseconds and NATO mils, with radians shown as a multiple of pi.',
  { 'degrees': 1, 'radians': 180 / Math.PI, 'gradians': 0.9, 'turns': 360, 'arcminutes': 1 / 60, 'arcseconds': 1 / 3600, 'mils (NATO, 6400 per turn)': 360 / 6400 }, 'degrees',
  { v: 180, extra: (deg) => {
    const f = frac(deg * Math.PI / 180 / Math.PI), a = Math.abs(deg), d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d) * 60 - m) * 60;
    let t = f ? `As a multiple of pi: ${f[0] === 0 ? '0' : (Math.abs(f[0]) === 1 ? (f[0] < 0 ? '-' : '') : f[0]) + 'pi' + (f[1] === 1 ? '' : '/' + f[1])}` : 'As a multiple of pi: no simple fraction';
    t += `\nDegrees, minutes, seconds: ${deg < 0 ? '-' : ''}${d} deg ${m} min ${fmt(Math.round(s * 1e4) / 1e4)} sec`;
    return t;
  } }));

// typography
T.push(calc('typography-unit-converter', CV, 'Typography Unit Converter: Points, Picas, Pixels and Millimetres',
  'Convert points, picas, pixels, millimetres, centimetres, inches and twips at a chosen DPI, for example a 12 pt font size in millimetres.',
  [num('v', 'Value', 12), sel('from', 'From unit', ['pt', 'pica', 'px', 'mm', 'cm', 'in', 'twip'], 'pt'), num('dpi', 'DPI for pixels', 96)], (o) => {
    const v = need(o.v, 'Value'), dpi = need(o.dpi, 'DPI'); if (dpi <= 0) throw new Error('DPI must be above 0');
    const U = { pt: 1, pica: 12, px: 72 / dpi, mm: 72 / 25.4, cm: 720 / 25.4, in: 72, twip: 1 / 20 };
    if (!(o.from in U)) throw new Error('Pick a unit');
    const pt = v * U[o.from];
    return `${fmt(v)} ${o.from} at ${dpi} DPI equals:\n\n` + Object.keys(U).map((u) => `  ${fmt(pt / U[u]).padStart(18)}  ${u}`).join('\n') + '\n\nUses the desktop publishing point: 1 pt = 1/72 inch, 1 pica = 12 pt. The older traditional point (about 0.3515 mm vs 0.3528 mm) is not used. CSS pixels are 96 per inch.';
  }));

// paper
const PAPER = {};
(() => {
  for (const [L, w, h] of [['A', 841, 1189], ['B', 1000, 1414], ['C', 917, 1297]]) {
    let a = w, b = h;
    for (let i = 0; i <= 10; i++) { PAPER[L + i] = [a, b]; [a, b] = [Math.floor(b / 2), a]; }
  }
  PAPER.DL = [110, 220];
  for (const [n, w, h] of [['US Letter', 8.5, 11], ['US Legal', 8.5, 14], ['US Tabloid', 11, 17], ['US Ledger', 17, 11], ['US Executive', 7.25, 10.5], ['ANSI C', 17, 22], ['ANSI D', 22, 34], ['ANSI E', 34, 44]]) PAPER[n] = [w * 25.4, h * 25.4];
})();
T.push(calc('paper-size-reference', CV, 'Paper Size Reference: A, B, C and US Sizes in mm, Inches, Points and Pixels',
  'Look up A0 to A10, B, C and envelope sizes plus US Letter, Legal and Tabloid in millimetres, inches and points, and the pixel size at a chosen DPI.',
  [sel('size', 'Paper size', ['All sizes', ...Object.keys(PAPER)], 'A4'), num('dpi', 'DPI for pixels', 300)], (o) => {
    const dpi = need(o.dpi, 'DPI'); if (dpi <= 0) throw new Error('DPI must be above 0');
    const row = (n) => { const [w, h] = PAPER[n]; return `${n.padEnd(13)} ${f2(w, 1).padStart(7)} x ${f2(h, 1).padStart(7)} mm   ${f2(w / 25.4, 2).padStart(6)} x ${f2(h / 25.4, 2).padStart(6)} in   ${f2(w / 25.4 * 72, 0).padStart(5)} x ${f2(h / 25.4 * 72, 0).padStart(5)} pt   ${Math.round(w / 25.4 * dpi)} x ${Math.round(h / 25.4 * dpi)} px`; };
    const names = o.size === 'All sizes' ? Object.keys(PAPER) : [o.size];
    if (!names.every((n) => PAPER[n])) throw new Error('Pick a paper size');
    return `Width x height, portrait. Pixels at ${dpi} DPI.\n\n` + names.map(row).join('\n') + '\n\nISO sizes are the published millimetre sizes (A0 841 x 1189, B0 1000 x 1414, C0 917 x 1297, each next size halves the long side and rounds down). They match the sizes listed on Wikipedia\'s paper size page; the ISO text itself was not read. US sizes are defined in inches.';
  }));

// cooking (grams per US cup, King Arthur Baking ingredient weight chart, read 2026-10-23)
const CUPG = { 'All-purpose flour': 120, 'Granulated sugar': 198, 'Brown sugar (packed)': 213, 'Confectioners sugar': 113, 'Butter': 227, 'Honey': 336, 'Rolled oats': 89, 'Cocoa powder': 84, 'Table salt': 288, 'Long grain rice (dry)': 198, 'Rice flour': 142, 'Milk': 227, 'Water': 227, 'Vegetable oil': 198, 'Olive oil': 200, 'Cornstarch': 112, 'Baking powder': 192 };
T.push(calc('cooking-measurement-converter', CV, 'Cooking Converter: Cups, Tablespoons and Grams by Ingredient',
  'Convert cups, tablespoons, teaspoons, millilitres, grams and ounces for common baking ingredients using typical weights per cup.',
  [sel('ing', 'Ingredient', Object.keys(CUPG), 'All-purpose flour'), num('v', 'Amount', 1), sel('from', 'Unit', ['cup', 'tbsp', 'tsp', 'mL', 'g', 'oz'], 'cup')], (o) => {
    const v = need(o.v, 'Amount'), g = CUPG[o.ing]; if (!g) throw new Error('Pick an ingredient');
    const cup = 236.5882365, ml = { cup, tbsp: cup / 16, tsp: cup / 48, mL: 1 }, gper = g / cup;
    let mL; if (o.from === 'g') mL = v / gper; else if (o.from === 'oz') mL = v * 28.349523125 / gper; else if (o.from in ml) mL = v * ml[o.from]; else throw new Error('Pick a unit');
    return `${fmt(v)} ${o.from} of ${o.ing.toLowerCase()} is about:\n\n  ${fmt(mL / cup)} US cup\n  ${fmt(mL / (cup / 16))} tbsp\n  ${fmt(mL / (cup / 48))} tsp\n  ${fmt(mL)} mL\n  ${fmt(mL * gper)} g\n  ${fmt(mL * gper / 28.349523125)} oz (weight)\n\nBased on ${g} g per US cup (236.6 mL). Weights per cup are typical values from the King Arthur Baking ingredient weight chart (honey, salt and baking powder scaled from their tablespoon or teaspoon figures). Real weight depends on how you scoop and pack, so use a scale for baking.`;
  }));

// oven
const GAS = [['1/4', 110, 225], ['1/2', 120, 250], ['1', 140, 275], ['2', 150, 300], ['3', 170, 325], ['4', 180, 350], ['5', 190, 375], ['6', 200, 400], ['7', 220, 425], ['8', 230, 450], ['9', 240, 475]];
T.push(calc('oven-temperature-converter', CV, 'Oven Temperature Converter: Gas Mark, Celsius, Fan and Fahrenheit',
  'Convert a recipe oven setting between gas mark, Celsius, fan-oven Celsius and Fahrenheit, using the common UK conversion chart.',
  [txt('v', 'Setting (number, or gas mark 1/4, 1/2, 1 to 9)', '180'), sel('kind', 'Setting is', ['Celsius (conventional)', 'Celsius (fan)', 'Fahrenheit', 'Gas mark'], 'Celsius (conventional)')], (o) => {
    const s = String(o.v).trim().replace(/gas\s*(mark)?/i, '').trim();
    let c, exact = true;
    if (o.kind === 'Gas mark') { const g = GAS.find((x) => x[0] === s || x[0] === String(+s)); if (!g) throw new Error('Gas mark must be 1/4, 1/2 or 1 to 9'); c = g[1]; } else {
      const n = Number(s); if (!Number.isFinite(n) || s === '') throw new Error('Enter a number');
      c = o.kind === 'Fahrenheit' ? (n - 32) * 5 / 9 : o.kind === 'Celsius (fan)' ? n + 20 : n;
    }
    if (c < 50 || c > 330) throw new Error('That is outside oven range (about 50 to 330 C)');
    let best = GAS[0]; for (const g of GAS) if (Math.abs(g[1] - c) < Math.abs(best[1] - c)) best = g;
    exact = Math.abs(best[1] - c) < 5;
    return `Conventional oven: ${Math.round(c)} C / ${Math.round(c * 9 / 5 + 32)} F\nFan oven: ${Math.round(c - 20)} C\nGas mark: ${exact ? '' : 'about '}${best[0]} (chart value ${best[1]} C / ${best[2]} F)\n\nFan ovens are set about 20 C lower (some makers say 10 to 25 C). Gas marks follow the usual chart: 1/4 = 110 C, 1/2 = 120 C, 1 = 140 C, 2 = 150 C, 3 = 170 C, 4 = 180 C, 5 = 190 C, 6 = 200 C, 7 = 220 C, 8 = 230 C, 9 = 240 C. Charts differ by a few degrees; check your oven manual.`;
  }));

// recipe scaler
const UF = { '\u00bd': 0.5, '\u2153': 1 / 3, '\u2154': 2 / 3, '\u00bc': 0.25, '\u00be': 0.75, '\u215b': 0.125, '\u215c': 0.375, '\u215d': 0.625, '\u215e': 0.875, '\u2155': 0.2, '\u2156': 0.4, '\u2157': 0.6, '\u2158': 0.8 };
const QTY = '(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+\\s*[\\u00bc-\\u00be\\u2150-\\u215e]|[\\u00bc-\\u00be\\u2150-\\u215e]|\\d*\\.?\\d+)';
const qRe = new RegExp('^(\\s*[-*\\u2022]?\\s*)(' + QTY + ')(?:(\\s*(?:-|\\u2013|to)\\s*)(' + QTY + '))?(?=\\s|[A-Za-z]|$)', 'i');
const qty = (s) => {
  s = s.trim(); let m;
  if ((m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s))) return +m[1] + m[2] / m[3];
  if ((m = /^(\d+)\/(\d+)$/.exec(s))) return m[1] / m[2];
  if ((m = /^(\d+)\s*([^\d\s])$/.exec(s)) && UF[m[2]]) return +m[1] + UF[m[2]];
  if (UF[s]) return UF[s];
  return parseFloat(s);
};
const niceQty = (x) => {
  const w = Math.floor(x + 1e-9), r = x - w;
  for (const [n, d] of [[0, 1], [1, 8], [1, 4], [1, 3], [3, 8], [1, 2], [5, 8], [2, 3], [3, 4], [7, 8], [1, 1]]) if (Math.abs(r - n / d) < 0.02) {
    if (n === d) return String(w + 1); if (n === 0) return String(w);
    return (w ? w + ' ' : '') + n + '/' + d;
  }
  return String(Math.round(x * 100) / 100);
};
T.push(lineTool('recipe-scaler', EV, 'Recipe Scaler: Multiply Ingredient Quantities by Servings',
  'Paste an ingredient list, enter the original and wanted servings, and every leading quantity is scaled, including fractions and ranges.',
  'Ingredients, one per line', '2 cups flour\n1 1/2 tsp baking powder\n3/4 cup sugar\n2-3 eggs\n\u00bd cup milk\nPinch of salt', [num('from', 'Original servings', 4), num('to', 'Wanted servings', 6)], (t, o) => {
    const a = need(o.from, 'original servings'), b = need(o.to, 'wanted servings'); if (a <= 0 || b <= 0) throw new Error('Servings must be above 0');
    const k = b / a;
    return `Scale factor ${niceQty(k)} (${a} to ${b} servings)\n\n` + lines(t).map((l) => {
      const m = qRe.exec(l); if (!m) return l;
      let q = niceQty(qty(m[2]) * k); if (m[4]) q += m[3] + niceQty(qty(m[4]) * k);
      return m[1] + q + l.slice(m[0].length);
    }).join('\n') + '\n\nOnly the first quantity on each line is scaled. Units are not converted. Spices, leavening and cooking times often do not scale in a straight line, so taste and check.';
  }));

// pace
const sec2 = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + pad2(m) : m) + ':' + pad2(s % 60); };
T.push(calc('running-pace-converter', CV, 'Running Pace Converter: Min per km, Min per Mile and Speed',
  'Convert a running pace between minutes per kilometre, minutes per mile, km/h and mph, with finish times for 5K, 10K, half marathon and marathon.',
  [txt('v', 'Value (pace as 5:30, or a speed)', '5:30'), sel('unit', 'Unit', ['min/km', 'min/mile', 'km/h', 'mph'], 'min/km')], (o) => {
    const s = String(o.v).trim(); let x;
    if (/^\d+:\d{1,2}(\.\d+)?$/.test(s)) { const [m, sc] = s.split(':'); if (+sc >= 60) throw new Error('Seconds must be below 60'); x = +m * 60 + +sc; if (o.unit.startsWith('km/h') || o.unit === 'mph') throw new Error('Use a plain number for a speed'); } else {
      x = Number(s); if (!Number.isFinite(x) || x <= 0) throw new Error('Enter a pace like 5:30 or a number');
      if (o.unit.startsWith('min')) x *= 60;
    }
    if (x <= 0) throw new Error('Value must be above 0');
    const perKm = o.unit === 'min/km' ? x : o.unit === 'min/mile' ? x / MI : o.unit === 'km/h' ? 3600 / x : 3600 / (x * MI);
    const kmh = 3600 / perKm;
    const races = [['1 mile', MI], ['5K', 5], ['10K', 10], ['Half marathon', 21.0975], ['Marathon', 42.195]];
    return `Pace: ${sec2(perKm)} per km\nPace: ${sec2(perKm * MI)} per mile\nSpeed: ${f2(kmh)} km/h\nSpeed: ${f2(kmh / MI)} mph\nSpeed: ${f2(kmh / 3.6)} m/s\n\nFinish times at an even pace:\n` + races.map(([n, d]) => `  ${n.padEnd(14)} ${sec2(perKm * d)}`).join('\n') + '\n\n1 mile = 1.609344 km. Half marathon 21.0975 km, marathon 42.195 km.';
  }));

// fuel economy
T.push(calc('fuel-economy-converter', CV, 'Fuel Economy Converter: L/100km, MPG US, MPG UK and km/L',
  'Convert fuel consumption between litres per 100 km, miles per US gallon, miles per UK gallon and kilometres per litre.',
  [num('v', 'Value', 7.5), sel('unit', 'Unit', ['L/100km', 'km/L', 'MPG (US)', 'MPG (UK)'], 'L/100km')], (o) => {
    const v = need(o.v, 'Value'); if (v <= 0) throw new Error('Value must be above 0');
    const kmPerL = { 'L/100km': 100 / v, 'km/L': v, 'MPG (US)': v * MI / GAL, 'MPG (UK)': v * MI / IGAL }[o.unit];
    if (!kmPerL) throw new Error('Pick a unit');
    return `${f2(100 / kmPerL, 2)} L/100km\n${f2(kmPerL, 2)} km/L\n${f2(kmPerL * GAL / MI, 2)} MPG (US)\n${f2(kmPerL * IGAL / MI, 2)} MPG (UK)\n\nUS and UK gallons differ (3.785411784 L vs 4.54609 L), so the same car has a higher UK figure. Lower L/100km is better, higher MPG is better.`;
  }));

// number to words
const EN_U = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const EN_T = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const LANG = {};
LANG.English = {
  zero: 'zero', minus: 'minus', point: 'point', and: 'and', digits: EN_U,
  words(n, o) {
    const b3 = (x) => { let s = ''; const h = Math.floor(x / 100), r = x % 100; if (h) s = EN_U[h] + ' hundred'; if (r) { if (h && o.brit) s += ' and '; else if (h) s += ' '; s += r < 20 ? EN_U[r] : EN_T[Math.floor(r / 10)] + (r % 10 ? '-' + EN_U[r % 10] : ''); } return s; };
    const g = [Math.floor(n / 1e9) % 1000, Math.floor(n / 1e6) % 1000, Math.floor(n / 1e3) % 1000, n % 1000], nm = ['billion', 'million', 'thousand', ''];
    const parts = g.map((x, i) => (x ? b3(x) + (nm[i] ? ' ' + nm[i] : '') : '')).filter(Boolean);
    if (o.brit && g[3] && g[3] < 100 && parts.length > 1) parts.splice(parts.length - 1, 0, 'and');
    return parts.join(' ');
  },
  cur: { EUR: ['euro', 'euros', 'cent', 'cents'], USD: ['dollar', 'dollars', 'cent', 'cents'], GBP: ['pound', 'pounds', 'penny', 'pence'] },
};
const FR_U = 'zéro un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize dix-sept dix-huit dix-neuf'.split(' ');
LANG.French = {
  zero: 'zéro', minus: 'moins', point: 'virgule', and: 'et', digits: FR_U,
  words(n) {
    const b100 = (r, fin) => {
      if (r < 20) return FR_U[r];
      const t = Math.floor(r / 10), u = r % 10;
      if (t < 7) return ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'][t] + (u === 1 ? ' et un' : u ? '-' + FR_U[u] : '');
      if (t === 7) return 'soixante' + (u === 1 ? ' et onze' : '-' + FR_U[10 + u]);
      if (t === 8) return 'quatre-vingt' + (u ? '-' + FR_U[u] : fin ? 's' : '');
      return 'quatre-vingt-' + FR_U[10 + u];
    };
    const b3 = (x, fin) => {
      const h = Math.floor(x / 100), r = x % 100; let s = '';
      if (h) s = (h === 1 ? 'cent' : FR_U[h] + ' cent') + (h > 1 && !r && fin ? 's' : '');
      if (r) s += (s ? ' ' : '') + b100(r, fin);
      return s;
    };
    const g = [Math.floor(n / 1e9) % 1000, Math.floor(n / 1e6) % 1000, Math.floor(n / 1e3) % 1000, n % 1000], out = [];
    if (g[0]) out.push(b3(g[0], true) + (g[0] === 1 ? ' milliard' : ' milliards'));
    if (g[1]) out.push(b3(g[1], true) + (g[1] === 1 ? ' million' : ' millions'));
    if (g[2]) out.push(g[2] === 1 ? 'mille' : b3(g[2], false) + ' mille');
    if (g[3]) out.push(b3(g[3], true));
    return out.join(' ');
  },
  cur: { EUR: ['euro', 'euros', 'centime', 'centimes'], USD: ['dollar', 'dollars', 'cent', 'cents'], GBP: ['livre sterling', 'livres sterling', 'penny', 'pence'] },
};
const DE_U = 'null eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn fünfzehn sechzehn siebzehn achtzehn neunzehn'.split(' ');
const DE_T = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];
LANG.German = {
  zero: 'null', minus: 'minus', point: 'Komma', and: 'und', digits: DE_U,
  words(n) {
    const att = (x) => (x === 1 ? 'ein' : DE_U[x]);
    const b100 = (r) => (r < 20 ? DE_U[r] : (r % 10 ? att(r % 10) + 'und' : '') + DE_T[Math.floor(r / 10)]);
    const b3 = (x) => { const h = Math.floor(x / 100), r = x % 100; return (h ? att(h) + 'hundert' : '') + (r ? b100(r) : ''); };
    const g = [Math.floor(n / 1e9) % 1000, Math.floor(n / 1e6) % 1000, Math.floor(n / 1e3) % 1000, n % 1000], out = [];
    if (g[0]) out.push(g[0] === 1 ? 'eine Milliarde' : b3(g[0]).replace(/eins$/, 'eine') + ' Milliarden');
    if (g[1]) out.push(g[1] === 1 ? 'eine Million' : b3(g[1]).replace(/eins$/, 'eine') + ' Millionen');
    const low = (g[2] ? b3(g[2]).replace(/eins$/, 'ein') + 'tausend' : '') + (g[3] ? b3(g[3]) : '');
    if (low) out.push(low);
    return out.join(' ');
  },
  cur: { EUR: ['Euro', 'Euro', 'Cent', 'Cent'], USD: ['Dollar', 'Dollar', 'Cent', 'Cent'], GBP: ['Pfund', 'Pfund', 'Penny', 'Pence'] },
};
const NL_U = 'nul een twee drie vier vijf zes zeven acht negen tien elf twaalf dertien veertien vijftien zestien zeventien achttien negentien'.split(' ');
const NL_T = ['', '', 'twintig', 'dertig', 'veertig', 'vijftig', 'zestig', 'zeventig', 'tachtig', 'negentig'];
LANG.Dutch = {
  zero: 'nul', minus: 'min', point: 'komma', and: 'en', digits: NL_U,
  words(n) {
    const b100 = (r) => (r < 20 ? NL_U[r] : (r % 10 ? NL_U[r % 10] + (r % 10 === 2 || r % 10 === 3 ? '\u00ebn' : 'en') : '') + NL_T[Math.floor(r / 10)]);
    const b3 = (x) => { const h = Math.floor(x / 100), r = x % 100; return (h ? (h === 1 ? '' : NL_U[h]) + 'honderd' : '') + (r ? b100(r) : ''); };
    const g = [Math.floor(n / 1e9) % 1000, Math.floor(n / 1e6) % 1000, Math.floor(n / 1e3) % 1000, n % 1000], out = [];
    if (g[0]) out.push(b3(g[0]) + ' miljard');
    if (g[1]) out.push((g[1] === 1 ? 'een' : b3(g[1])) + ' miljoen');
    const low = (g[2] ? (g[2] === 1 ? '' : b3(g[2])) + 'duizend' : '') + (g[3] ? (g[2] && g[3] < 100 ? '' : '') + b3(g[3]) : '');
    if (low) out.push(low);
    return out.join(' ');
  },
  cur: { EUR: ['euro', 'euro', 'cent', 'cent'], USD: ['dollar', 'dollar', 'cent', 'cent'], GBP: ['pond', 'pond', 'penny', 'pence'] },
};
const ES_U = 'cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete dieciocho diecinueve veinte veintiuno veintidós veintitrés veinticuatro veinticinco veintiséis veintisiete veintiocho veintinueve'.split(' ');
const ES_T = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const ES_H = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
LANG.Spanish = {
  zero: 'cero', minus: 'menos', point: 'coma', and: 'con', digits: ES_U,
  words(n) {
    const b3 = (x) => {
      if (x === 100) return 'cien';
      const h = Math.floor(x / 100), r = x % 100; let s = ES_H[h];
      if (r) s += (s ? ' ' : '') + (r < 30 ? ES_U[r] : ES_T[Math.floor(r / 10)] + (r % 10 ? ' y ' + ES_U[r % 10] : ''));
      return s;
    };
    const ap = (s) => s.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');
    const mil = Math.floor(n / 1e3) % 1000, mill = Math.floor(n / 1e6) % 1e6, out = [];
    if (mill) out.push(mill === 1 ? 'un millón' : ap(LANG.Spanish.words(mill)) + ' millones');
    if (mil) out.push(mil === 1 ? 'mil' : ap(b3(mil)) + ' mil');
    if (n % 1000) out.push(b3(n % 1000));
    return out.join(' ');
  },
  cur: { EUR: ['euro', 'euros', 'céntimo', 'céntimos'], USD: ['dólar', 'dólares', 'centavo', 'centavos'], GBP: ['libra', 'libras', 'penique', 'peniques'] },
};
const numWords = (L, n, o, one) => {
  let s = L.words(n, o) || L.zero;
  if (one) { if (L === LANG.German) s = s.replace(/eins$/, 'ein'); if (L === LANG.Spanish) s = s.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un'); }
  return s;
};
const parseNum = (s) => {
  s = s.replace(/[\s_']/g, '');
  const neg = s.startsWith('-'); if (neg || s.startsWith('+')) s = s.slice(1);
  const ld = s.lastIndexOf('.'), lc = s.lastIndexOf(',');
  let int = s, frac = '';
  if (ld >= 0 && lc >= 0) { const k = Math.max(ld, lc); int = s.slice(0, k); frac = s.slice(k + 1); } else if (ld >= 0) { int = s.slice(0, ld); frac = s.slice(ld + 1); } else if (lc >= 0) {
    if (/^\d{1,3}(,\d{3})+$/.test(s)) int = s; else { int = s.slice(0, lc); frac = s.slice(lc + 1); }
  }
  int = int.replace(/[.,]/g, '');
  if (!/^\d*$/.test(int) || !/^\d*$/.test(frac) || (int === '' && frac === '')) throw new Error('Not a number: ' + s);
  int = int.replace(/^0+(?=\d)/, '') || '0';
  if (int.length > 12) throw new Error('Numbers up to 999,999,999,999 are supported');
  return { neg, int: Number(int), frac };
};
T.push(lineTool('number-to-words-multilingual', CV, 'Number to Words in English, French, German, Dutch and Spanish',
  'Write numbers out in words in five languages, with an optional currency format (euro, dollar, pound) for cheques and contracts.',
  'Numbers, one per line', '42\n1999\n2500000\n1234.56', [sel('lang', 'Language', Object.keys(LANG), 'English'), sel('cur', 'Currency format', ['None', 'EUR', 'USD', 'GBP'], 'None'), chk('brit', 'English: use "and" (British style)', true)], (t, o) => {
    const L = LANG[o.lang]; if (!L) throw new Error('Pick a language');
    return lines(t).map((l) => {
      const p = parseNum(l); let s;
      if (o.cur === 'None') {
        s = numWords(L, p.int, o);
        if (p.frac) s += ' ' + L.point + ' ' + [...p.frac].map((d) => L.digits[+d]).join(' ');
      } else {
        let cents = Math.round(Number('0.' + (p.frac || '0')) * 100), whole = p.int;
        const f3 = (p.frac + '000').slice(0, 3); cents = Math.floor(+f3.slice(0, 2) + (+f3[2] >= 5 ? 1 : 0));
        if (cents === 100) { cents = 0; whole += 1; }
        const [a, b, c, d] = L.cur[o.cur];
        s = numWords(L, whole, o, true) + ' ' + (whole === 1 ? a : b);
        if (cents) s += ' ' + L.and + ' ' + numWords(L, cents, o, true) + ' ' + (cents === 1 ? c : d);
      }
      return (p.neg ? L.minus + ' ' : '') + s + (lines(t).length > 1 ? `   (${l})` : '');
    }).join('\n') + '\n\nUp to 999,999,999,999. Use a dot for decimals. German and Dutch write numbers below a million as one word; French 80 and 200 take an s only at the end. Spelling variants (for example Belgian French septante, Swiss German) are not covered.';
  }));

// scientific notation
const sci = (s) => {
  s = s.trim().replace(/\u00d7|\s*x\s*(?=10)|\s*\*\s*(?=10)/gi, 'e').replace(/e?\s*10\s*\^\s*/i, 'e').replace(/\s/g, '').replace(/,/g, '');
  const m = /^([+-]?)(\d*)\.?(\d*)(?:e([+-]?\d+))?$/i.exec(s);
  if (!m || (m[2] + m[3]) === '') throw new Error('Not a number: ' + s);
  let digits = m[2] + m[3], e = (m[4] ? +m[4] : 0) + m[2].length - 1;
  const lead = digits.length - digits.replace(/^0+/, '').length;
  digits = digits.replace(/^0+/, ''); e -= lead;
  if (!digits) return { sign: m[1] === '-' ? '-' : '', digits: '0', e: 0, zero: true };
  digits = digits.replace(/0+$/, '') || '0';
  return { sign: m[1] === '-' ? '-' : '', digits, e };
};
const plain = ({ sign, digits, e, zero }) => {
  if (zero) return '0';
  let s; if (e < 0) s = '0.' + '0'.repeat(-e - 1) + digits; else if (digits.length <= e + 1) s = digits + '0'.repeat(e + 1 - digits.length); else s = digits.slice(0, e + 1) + '.' + digits.slice(e + 1);
  return sign + s;
};
T.push(lineTool('scientific-notation-converter', CV, 'Scientific and Engineering Notation Converter',
  'Write a number as a coefficient times a power of ten, in scientific or engineering form, or expand notation like 6.02e23 into its full decimal.',
  'Numbers or notation, one per line', '602214076000000000000000\n0.00000314\n6.02e23\n1.5 x 10^-3\n299792458', [], (t) => lines(t).map((l) => {
    const v = sci(l);
    if (v.zero) return `${l}\n  scientific: 0e0\n  decimal:    0`;
    const d = v.digits, co = (k) => d.length > k ? d.slice(0, k) + '.' + d.slice(k) : d + '0'.repeat(k - d.length);
    const eng = Math.floor(v.e / 3) * 3, k = v.e - eng + 1;
    return `${l}\n  scientific:  ${v.sign}${d[0]}${d.length > 1 ? '.' + d.slice(1) : ''}e${v.e}   (${v.sign}${d[0]}${d.length > 1 ? '.' + d.slice(1) : ''} x 10^${v.e})\n  engineering: ${v.sign}${co(k)}e${eng}   (x 10^${eng})\n  decimal:     ${plain(v)}`;
  }).join('\n\n') + '\n\nDigits are handled as text, so there is no rounding. Trailing zeros in a plain number are treated as not significant.'));

// ohm's law
const SI = { k: 1e3, M: 1e6, m: 1e-3, u: 1e-6, '\u00b5': 1e-6, G: 1e9 };
const si = (s, name) => {
  s = String(s ?? '').trim(); if (!s) return null;
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([kMmGu\u00b5])?$/i.exec(s);
  if (!m) throw new Error('Cannot read ' + name + ': use a number, optionally with k, M, m or u');
  const v = Number(m[1]) * (m[2] ? SI[m[2]] ?? SI[m[2].toLowerCase()] : 1);
  return v;
};
const eng = (x, u) => { if (x === 0) return '0 ' + u; const a = Math.abs(x), p = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, '\u00b5']].find(([f]) => a >= f * 0.9999999) || [1e-6, '\u00b5']; return fmt(x / p[0]) + ' ' + p[1] + u; };
T.push(calc('ohms-law-calculator', EV, "Ohm's Law Calculator: Volts, Amps, Ohms and Watts",
  'Enter any two of voltage, current, resistance and power and get the other two from V = I x R and P = V x I.',
  [txt('V', 'Voltage V (volts)', '12'), txt('I', 'Current I (amps)', ''), txt('R', 'Resistance R (ohms)', '470'), txt('P', 'Power P (watts)', '')], (o) => {
    let V = si(o.V, 'voltage'), I = si(o.I, 'current'), R = si(o.R, 'resistance'), P = si(o.P, 'power');
    const given = [V, I, R, P].filter((x) => x != null).length;
    if (given !== 2) throw new Error('Fill exactly two of the four fields (you filled ' + given + ')');
    if ([V, I, R, P].some((x) => x != null && x < 0)) throw new Error('Values must not be negative');
    if (V != null && I != null) { R = V / I; P = V * I; } else if (V != null && R != null) { I = V / R; P = V * V / R; } else if (V != null && P != null) { I = P / V; R = V * V / P; } else if (I != null && R != null) { V = I * R; P = I * I * R; } else if (I != null && P != null) { V = P / I; R = P / (I * I); } else { V = Math.sqrt(P * R); I = Math.sqrt(P / R); }
    if (![V, I, R, P].every(Number.isFinite)) throw new Error('Division by zero: check for a zero value');
    return `Voltage:    ${eng(V, 'V')}\nCurrent:    ${eng(I, 'A')}\nResistance: ${eng(R, '\u03a9')}\nPower:      ${eng(P, 'W')}\n\nV = I x R, P = V x I = I^2 x R = V^2 / R. Ideal DC (or RMS AC with a purely resistive load). Suffixes: k, M, G, m (milli), u (micro).`;
  }));

// wind chill, heat index (NWS formulas)
T.push(calc('wind-chill-heat-index-calculator', EV, 'Wind Chill and Heat Index Calculator (Feels-Like Temperature)',
  'Work out the feels-like temperature from air temperature with wind (cold) or relative humidity (heat), using the US National Weather Service formulas.',
  [num('t', 'Air temperature', 0), sel('tu', 'Temperature unit', ['C', 'F'], 'C'), num('w', 'Wind speed', 20), sel('wu', 'Wind unit', ['km/h', 'mph', 'm/s', 'knots'], 'km/h'), num('rh', 'Relative humidity %', 40)], (o) => {
    const t = need(o.t, 'temperature'), w = need(o.w, 'wind speed'), rh = need(o.rh, 'humidity');
    if (rh < 0 || rh > 100) throw new Error('Humidity must be between 0 and 100');
    if (w < 0) throw new Error('Wind speed cannot be negative');
    const F = o.tu === 'C' ? t * 9 / 5 + 32 : t, mph = w * { 'km/h': 1 / MI, mph: 1, 'm/s': 3.6 / MI, knots: 1.852 / MI }[o.wu];
    const out = (x) => (o.tu === 'C' ? `${f2((x - 32) * 5 / 9, 1)} C (${f2(x, 1)} F)` : `${f2(x, 1)} F (${f2((x - 32) * 5 / 9, 1)} C)`);
    const res = [];
    if (F <= 50 && mph > 3) {
      const v = Math.pow(mph, 0.16), wc = 35.74 + 0.6215 * F - 35.75 * v + 0.4275 * F * v;
      res.push(`Wind chill: ${out(wc)}${wc <= -19 ? '\nReview: at about -19 F (-28 C) or lower, NWS says exposed skin can freeze in around 30 minutes or less.' : ''}`);
    } else res.push('Wind chill: not defined here (needs air temperature at or below 50 F / 10 C and wind above 3 mph / 5 km/h).');
    if (F >= 80 - 1e-9 || (0.5 * (F + 61 + (F - 68) * 1.2 + rh * 0.094) >= 80)) {
      let hi = 0.5 * (F + 61 + (F - 68) * 1.2 + rh * 0.094);
      if (hi >= 80) {
        hi = -42.379 + 2.04901523 * F + 10.14333127 * rh - 0.22475541 * F * rh - 0.00683783 * F * F - 0.05481717 * rh * rh + 0.00122874 * F * F * rh + 0.00085282 * F * rh * rh - 0.00000199 * F * F * rh * rh;
        if (rh < 13 && F >= 80 && F <= 112) hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(F - 95)) / 17);
        if (rh > 85 && F >= 80 && F <= 87) hi += ((rh - 85) / 10) * ((87 - F) / 5);
      }
      const band = hi < 80 ? 'below the 80 F range where heat guidance starts' : hi < 91 ? 'caution: fatigue possible with prolonged exposure' : hi < 104 ? 'extreme caution: heat cramps and exhaustion possible' : hi < 126 ? 'danger: heat cramps and exhaustion likely, heat stroke possible' : 'extreme danger: heat stroke highly likely';
      res.push(`Heat index: ${out(hi)}\nBand (NWS-style, review): ${band}`);
    } else res.push('Heat index: not defined here (needs it to feel about 80 F / 27 C or warmer).');
    return res.join('\n\n') + '\n\nFormulas: NWS wind chill (2001) and the Rothfusz heat index regression with the NWS adjustments, in Fahrenheit and mph. Sun, shade, clothing and activity change real risk. This is an estimate, not a safety rule.';
  }));

// ---------- date and time ----------
T.push(lineTool('long-weekend-finder', DT, 'Long Weekend and Bridge Day Finder from Your Holiday List',
  'Paste your public holiday dates and get the long weekends they create, plus the leave days that would join a holiday to a weekend.',
  'Holidays, one per line: YYYY-MM-DD optional name', '2026-01-01 New Year\n2026-04-03 Good Friday\n2026-04-06 Easter Monday\n2026-05-01 Labour Day\n2026-05-14 Ascension Day\n2026-05-25 Whit Monday\n2026-07-21 National Day\n2026-12-25 Christmas', [sel('wk', 'Weekend days', ['Saturday and Sunday', 'Friday and Saturday'], 'Saturday and Sunday'), num('leave', 'Max leave days to bridge', 2)], (t, o) => {
    const hol = new Map(); for (const l of lines(t)) { const k = iso(D(l)); hol.set(k, l.slice(10).trim() || 'holiday'); }
    if (!hol.size) throw new Error('Paste at least one holiday');
    const we = o.wk.startsWith('Fri') ? [5, 6] : [6, 0], maxL = Math.max(0, Math.min(5, Math.round(need(o.leave, 'leave days'))));
    const dates = [...hol.keys()].sort(), y0 = +dates[0].slice(0, 4), y1 = +dates[dates.length - 1].slice(0, 4);
    const start = new Date(Date.UTC(y0, 0, 1)), n = Math.round((Date.UTC(y1, 11, 31) - start) / 864e5) + 1;
    const off = []; for (let i = 0; i < n; i++) { const d = addDays(start, i); off.push(we.includes(d.getUTCDay()) || hol.has(iso(d))); }
    const runs = []; for (let i = 0; i < n;) { if (!off[i]) { i++; continue; } let j = i; while (j + 1 < n && off[j + 1]) j++; runs.push([i, j]); i = j + 1; }
    const hasH = (a, b) => { for (let i = a; i <= b; i++) if (hol.has(iso(addDays(start, i)))) return true; return false; };
    const nm = (a, b) => { const r = []; for (let i = a; i <= b; i++) { const h = hol.get(iso(addDays(start, i))); if (h) r.push(h); } return r.join(', '); };
    const rg = (a, b) => `${iso(addDays(start, a))} ${wd(addDays(start, a)).slice(0, 3)} to ${iso(addDays(start, b))} ${wd(addDays(start, b)).slice(0, 3)}`;
    const out = ['Long weekends (3 or more days off in a row, with no leave):'];
    const lw = runs.filter(([a, b]) => b - a + 1 >= 3 && hasH(a, b)); out.push(...(lw.length ? lw.map(([a, b]) => `  ${rg(a, b)}: ${b - a + 1} days (${nm(a, b)})`) : ['  none']));
    out.push('', `Bridge options (take up to ${maxL} leave days):`);
    const br = [];
    for (let k = 0; k + 1 < runs.length; k++) {
      const gap = runs[k + 1][0] - runs[k][1] - 1;
      if (gap >= 1 && gap <= maxL && (hasH(...runs[k]) || hasH(...runs[k + 1]))) br.push(`  ${rg(runs[k][0], runs[k + 1][1])}: ${runs[k + 1][1] - runs[k][0] + 1} days off for ${gap} leave day${gap > 1 ? 's' : ''} (${nm(runs[k][0], runs[k + 1][1])})`);
    }
    out.push(...(br.length ? br : ['  none']));
    out.push('', 'Holidays that fall on a weekend:', ...(dates.filter((d) => we.includes(D(d).getUTCDay())).map((d) => `  ${dstr(D(d))} ${hol.get(d)}`)), '', 'Uses only the dates you paste. Substitute days for holidays on a weekend are not added; list them yourself.');
    return out.join('\n');
  }));

T.push(calc('overtime-pay-calculator', EV, 'Overtime Pay Calculator with Time-and-a-Half and Double Time',
  'Split hours into regular, overtime and double-time hours at your own thresholds and multipliers, and get pay for each part and the total.',
  [num('hours', 'Hours worked', 48), num('std', 'Regular hours threshold', 40), num('rate', 'Hourly rate', 20), num('m1', 'Overtime multiplier', 1.5), num('dt', 'Double-time threshold (0 = none)', 0), num('m2', 'Double-time multiplier', 2)], (o) => {
    const h = need(o.hours, 'hours'), s = need(o.std, 'threshold'), r = need(o.rate, 'rate'), m1 = need(o.m1, 'multiplier'), dt = need(o.dt, 'double-time threshold'), m2 = need(o.m2, 'double-time multiplier');
    if (h < 0 || s < 0 || r < 0 || dt < 0) throw new Error('Values must not be negative');
    if (dt && dt < s) throw new Error('Double-time threshold must be at or above the regular threshold');
    const reg = Math.min(h, s), ot = dt ? Math.max(0, Math.min(h, dt) - s) : Math.max(0, h - s), dbl = dt ? Math.max(0, h - dt) : 0;
    const pr = reg * r, po = ot * r * m1, pd = dbl * r * m2;
    return `Regular:     ${f2(reg)} h x ${f2(r)} = ${f2(pr)}\nOvertime:    ${f2(ot)} h x ${f2(r)} x ${m1} = ${f2(po)}\nDouble time: ${f2(dbl)} h x ${f2(r)} x ${m2} = ${f2(pd)}\n\nTotal pay: ${f2(pr + po + pd)}\nEffective hourly average: ${h ? f2((pr + po + pd) / h) : '0.00'}\n\nGross pay before tax, any currency. Overtime rules differ by country, contract and sector; use the thresholds and multipliers from yours.`;
  }));

const durMin = (l) => {
  let m;
  if ((m = /^(-?\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(l))) { if (+m[2] >= 60 || (m[3] && +m[3] >= 60)) throw new Error('Minutes and seconds must be below 60: ' + l); const s = l.startsWith('-') ? -1 : 1; return s * (Math.abs(+m[1]) * 60 + +m[2] + (m[3] ? m[3] / 60 : 0)); }
  if (/[hm]/i.test(l) && (m = /^(?:(-?\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?$/i.exec(l)) && (m[1] || m[2])) return (m[1] ? +m[1] * 60 : 0) + (m[2] ? (l.trim().startsWith('-') ? -1 : 1) * +m[2] : 0);
  return null;
};
T.push(lineTool('hours-minutes-decimal-converter', DT, 'Hours and Minutes to Decimal Hours Converter for Billing',
  'Turn 2:45 or 2h 45m into 2.75 hours, or decimal hours back into hours and minutes, with optional rounding to billing increments.',
  'Times (2:45, 1h 20m) or decimal hours (2.75), one per line', '2:45\n1h 20m\n0:07\n2.75\n8.1', [num('step', 'Round up to minutes (0 = no rounding)', 0)], (t, o) => {
    const st = need(o.step, 'rounding'); if (st < 0) throw new Error('Rounding must not be negative');
    let tot = 0, n = 0;
    const out = lines(t).map((l) => {
      let mins = durMin(l); const toDec = mins != null;
      if (!toDec) { const x = Number(l); if (!Number.isFinite(x)) throw new Error('Cannot read: ' + l); mins = x * 60; }
      const r = st ? Math.ceil(mins / st - 1e-9) * st : mins; tot += r; n++;
      const sg = r < 0 ? '-' : '', a = Math.abs(r), hh = Math.floor(a / 60 + 1e-9), mm = a - hh * 60;
      const hm = `${sg}${hh}:${pad2(Math.floor(mm + 0.5 > 59.5 && false ? 59 : Math.round(mm)))}`;
      const hmFix = Math.round(mm) === 60 ? `${sg}${hh + 1}:00` : hm;
      return `${l}  ->  ${toDec ? fmt(Math.round(r / 60 * 1e4) / 1e4) + ' h' : hmFix + ' (h:mm)'}${st && Math.abs(r - mins) > 1e-9 ? '  (rounded up from ' + fmt(Math.round(mins * 100) / 100) + ' min)' : ''}`;
    });
    if (n > 1) out.push('', `Total: ${fmt(Math.round(tot / 60 * 1e4) / 1e4)} h = ${Math.floor(Math.abs(tot) / 60 + 1e-9)}:${pad2(Math.round(Math.abs(tot) % 60))} (h:mm)`);
    return out.join('\n');
  }));

T.push(calc('leap-year-checker', DT, 'Leap Year Checker with the Rule and Upcoming Leap Years',
  'Check whether a year is a leap year, see which part of the Gregorian rule applies, and list the next leap years.',
  [num('y', 'Year', 2028)], (o) => {
    const y = Math.round(need(o.y, 'year')); if (y < 1 || y > 9999) throw new Error('Use a year from 1 to 9999');
    const why = y % 400 === 0 ? 'divisible by 400' : y % 100 === 0 ? 'divisible by 100 but not by 400' : y % 4 === 0 ? 'divisible by 4 but not by 100' : 'not divisible by 4';
    const nx = []; for (let k = y + 1; nx.length < 8 && k < 10000; k++) if (isLeap(k)) nx.push(k);
    return `${y} ${isLeap(y) ? 'is' : 'is not'} a leap year (${why}).\nDays in ${y}: ${isLeap(y) ? 366 : 365}. February has ${isLeap(y) ? 29 : 28} days.\n\nNext leap years: ${nx.join(', ')}\n\nGregorian rule: every year divisible by 4 is a leap year, except years divisible by 100, unless also divisible by 400. Years before 1582 (the Gregorian reform; some countries switched much later) used the Julian rule in practice, which this tool does not apply.`;
  }));

T.push(calc('annual-leave-pro-rata-calculator', EV, 'Annual Leave Pro-Rata Calculator for Part-Time and Part-Year Staff',
  'Work out holiday entitlement for part-time hours or a start or end part-way through the leave year, from the full-time entitlement.',
  [num('full', 'Full-time annual leave (days)', 25), num('ftd', 'Full-time days per week', 5), num('myd', 'Your days per week', 3), dat('ys', 'Leave year start', '2026-01-01'), dat('from', 'Your first day in the leave year', '2026-04-15'), dat('to', 'Your last day in the leave year', '2026-12-31'), num('hpd', 'Hours per working day (for hours)', 7.5), chk('half', 'Round up to the next half day', true)], (o) => {
    const full = need(o.full, 'full-time leave'), ftd = need(o.ftd, 'full-time days'), myd = need(o.myd, 'your days'), hpd = need(o.hpd, 'hours per day');
    if (full < 0 || ftd <= 0 || myd < 0 || myd > 7) throw new Error('Check the days per week');
    const ys = D(o.ys), ye = addDays(addMonths(ys, 12), -1);
    let a = D(o.from), b = D(o.to); if (a < ys) a = ys; if (b > ye) b = ye; if (b < a) throw new Error('Your last day is before your first day in this leave year');
    const yd = Math.round((ye - ys) / 864e5) + 1, my = Math.round((b - a) / 864e5) + 1, share = my / yd, ratio = myd / ftd;
    let days = full * ratio * share; const raw = days; if (o.half) days = Math.ceil(days * 2 - 1e-9) / 2;
    return `Leave year: ${iso(ys)} to ${iso(ye)} (${yd} days)\nYou work in it: ${iso(a)} to ${iso(b)} (${my} days, ${f2(share * 100, 1)}%)\nPart-time ratio: ${myd} of ${ftd} days (${f2(ratio * 100, 1)}%)\n\nEntitlement: ${f2(full, 2)} x ${f2(ratio, 4)} x ${f2(share, 4)} = ${f2(raw, 2)} days${o.half ? ' -> ' + f2(days, 1) + ' days (rounded up to half day)' : ''}\nIn hours at ${hpd} h per day: ${f2(days * hpd, 1)} hours\n\nThis is the plain proportional method. Your contract or local law may use another method (hours-based accrual, rounding rules, a statutory minimum) and may differ. It is not legal advice.`;
  }));

T.push(calc('notice-period-end-date-calculator', DT, 'Notice Period End Date Calculator: Last Working Day',
  'Enter the date notice is given and the length in days, weeks or months to get the last day of the notice period and its weekday.',
  [dat('d', 'Date notice is given', '2026-03-12'), num('n', 'Notice length', 4), sel('u', 'Unit', ['days', 'weeks', 'months'], 'weeks'), chk('first', 'Count the day notice is given as day 1', false)], (o) => {
    const d = D(o.d), n = Math.round(need(o.n, 'length')); if (n < 0) throw new Error('Length must not be negative');
    let e = o.u === 'months' ? addMonths(d, n) : addDays(d, n * (o.u === 'weeks' ? 7 : 1));
    if (o.first) e = addDays(e, -1);
    const w = e.getUTCDay(), note = w === 0 || w === 6 ? `\nThat is a weekend. Previous weekday: ${dstr(addDays(e, w === 6 ? -1 : -2))}. Next weekday: ${dstr(addDays(e, w === 6 ? 2 : 1))}.` : '';
    return `Notice given: ${dstr(d)}\nLength: ${n} ${o.u}${o.first ? ' (day of notice counts as day 1)' : ''}\n\nNotice ends: ${dstr(e)}${note}\n\nCalendar days in notice: ${Math.round((e - d) / 864e5) + (o.first ? 1 : 0)}\n\nContracts differ on whether the day of notice counts, whether notice runs to the end of a month or pay period, and how holidays count. Check your contract and local law. Not legal advice.`;
  }));

T.push(calc('working-days-due-date-calculator', DT, 'Due Date by Working Days Calculator with Your Own Holidays',
  'Add or subtract working days from a start date, skipping weekends and the holiday dates you list, and get the due date.',
  [dat('d', 'Start date', '2026-04-01'), num('n', 'Working days to add (negative to subtract)', 10), sel('wk', 'Weekend days', ['Saturday and Sunday', 'Friday and Saturday', 'Sunday only', 'None'], 'Saturday and Sunday'), txt('hol', 'Holidays (YYYY-MM-DD, comma or space separated)', '2026-04-03, 2026-04-06')], (o) => {
    const d = D(o.d), n = Math.round(need(o.n, 'working days')); if (Math.abs(n) > 5000) throw new Error('Use at most 5000 working days');
    const we = { 'Saturday and Sunday': [6, 0], 'Friday and Saturday': [5, 6], 'Sunday only': [0], None: [] }[o.wk];
    const hol = new Set(String(o.hol).split(/[\s,;]+/).filter(Boolean).map((h) => iso(D(h)))), st = n < 0 ? -1 : 1;
    let c = d, left = Math.abs(n), skipped = [];
    while (left > 0) { c = addDays(c, st); if (we.includes(c.getUTCDay())) continue; if (hol.has(iso(c))) { skipped.push(iso(c)); continue; } left--; }
    return `Start: ${dstr(d)}\n${n >= 0 ? 'Add' : 'Subtract'} ${Math.abs(n)} working days (the start day itself is not counted)\n\nDue date: ${dstr(c)}\nCalendar days between: ${Math.abs(Math.round((c - d) / 864e5))}\nHolidays skipped: ${skipped.length ? skipped.join(', ') : 'none'}\n\nOnly the holidays you list are skipped. Some legal deadlines count differently; check the rule that applies.`;
  }));

T.push(calc('recurring-date-generator', DT, 'Recurring Date Generator: Every Second Tuesday, Last Friday and More',
  'List every date that matches a repeating rule such as the second Tuesday of each month or every 10 days, in a date range.',
  [sel('rule', 'Rule', ['Nth weekday of each month', 'Every N days', 'Every N weeks', 'Day of month (each month)', 'Last day of each month'], 'Nth weekday of each month'), sel('nth', 'N-th (for weekday rule)', ['1st', '2nd', '3rd', '4th', 'last'], '2nd'), sel('day', 'Weekday', WD.slice(1).concat('Sunday'), 'Tuesday'), num('k', 'N (interval, or day of month)', 2), dat('a', 'From', '2026-01-01'), dat('b', 'To', '2026-12-31')], (o) => {
    const a = D(o.a), b = D(o.b), k = Math.round(need(o.k, 'N')); if (b < a) throw new Error('End date is before start date');
    if (Math.round((b - a) / 864e5) > 3660) throw new Error('Use a range of at most 10 years');
    const w = WD.indexOf(o.day), res = [];
    if (o.rule === 'Every N days' || o.rule === 'Every N weeks') { const st = o.rule === 'Every N days' ? k : k * 7; if (st < 1) throw new Error('N must be 1 or more'); for (let d = a; d <= b; d = addDays(d, st)) res.push(d); } else {
      for (let y = a.getUTCFullYear(), mo = a.getUTCMonth(); y * 12 + mo <= b.getUTCFullYear() * 12 + b.getUTCMonth(); mo++) {
        if (mo > 11) { mo = 0; y++; }
        const n = dim(y, mo); let d;
        if (o.rule === 'Last day of each month') d = new Date(Date.UTC(y, mo, n));
        else if (o.rule === 'Day of month (each month)') { if (k < 1 || k > 31) throw new Error('Day of month must be 1 to 31'); if (k > n) continue; d = new Date(Date.UTC(y, mo, k)); } else if (o.nth === 'last') { d = new Date(Date.UTC(y, mo, n)); d = addDays(d, -((d.getUTCDay() - w + 7) % 7)); } else {
          const first = new Date(Date.UTC(y, mo, 1)); d = addDays(first, (w - first.getUTCDay() + 7) % 7 + 7 * (parseInt(o.nth) - 1)); if (d.getUTCMonth() !== mo) continue;
        }
        res.push(d);
      }
    }
    const list = res.filter((d) => d >= a && d <= b);
    return `${list.length} dates from ${iso(a)} to ${iso(b)}:\n\n` + list.slice(0, 1000).map((d) => dstr(d)).join('\n') + (list.length > 1000 ? '\n...' : '');
  }));

// ICS
const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = (l) => { const e = new TextEncoder(), out = []; let cur = '', n = 0; for (const ch of l) { const b = e.encode(ch).length; if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; n = 0; } cur += ch; n += b; } out.push(cur); return out.join('\r\n '); };
const zoneOffsetMin = (tz, ms) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 60000;
};
const localToUtc = (y, mo, d, h, mi, tz) => { const guess = Date.UTC(y, mo - 1, d, h, mi); let off = zoneOffsetMin(tz, guess); let u = guess - off * 60000; const off2 = zoneOffsetMin(tz, u); if (off2 !== off) u = guess - off2 * 60000; return u; };
const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
T.push({
  id: 'ics-event-file-creator', cat: DT, title: 'ICS Calendar Event File Creator with Reminder', desc: 'Make a downloadable .ics event with title, time, location, notes and a reminder that imports into Google, Outlook and Apple Calendar.',
  inputs: 0, sample: '', opts: [txt('title', 'Title', 'Project kickoff'), dat('date', 'Date', '2026-06-15'), chk('allday', 'All-day event', false), txt('start', 'Start time (HH:MM)', '10:00'), txt('end', 'End time (HH:MM)', '11:00'), txt('tz', 'Time zone (IANA name)', 'Europe/Brussels'), txt('loc', 'Location', 'Meeting room 2'), txt('desc', 'Description', 'Agenda: scope, timeline, owners.'), num('rem', 'Reminder minutes before (0 = none)', 15), txt('uid', 'Event ID (blank = generate)', 'kickoff-2026-06-15@example.invalid')],
  run: (_i, o) => {
    const title = String(o.title).trim(); if (!title) throw new Error('Enter a title');
    const d = D(o.date), y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, dd = d.getUTCDate(), L = [];
    const uid = String(o.uid).trim() || ((globalThis.crypto?.randomUUID?.() ?? String(Date.now())) + '@free-tools.local');
    L.push('BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//free-tools//ics event creator//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', 'UID:' + icsEsc(uid), 'DTSTAMP:' + stamp(Date.now()));
    if (o.allday) { L.push('DTSTART;VALUE=DATE:' + iso(d).replace(/-/g, ''), 'DTEND;VALUE=DATE:' + iso(addDays(d, 1)).replace(/-/g, '')); } else {
      const tm = (s, n) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim()); if (!m || +m[1] > 23 || +m[2] > 59) throw new Error(n + ' must be HH:MM'); return [+m[1], +m[2]]; };
      const [sh, sm] = tm(o.start, 'Start time'), [eh, em] = tm(o.end, 'End time'); let tz = String(o.tz).trim() || 'UTC';
      try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { throw new Error('Unknown time zone: ' + tz); }
      const s = localToUtc(y, mo, dd, sh, sm, tz); let e = localToUtc(y, mo, dd, eh, em, tz); if (e <= s) e += 864e5;
      L.push('DTSTART:' + stamp(s), 'DTEND:' + stamp(e));
    }
    L.push('SUMMARY:' + icsEsc(title)); if (String(o.loc).trim()) L.push('LOCATION:' + icsEsc(o.loc)); if (String(o.desc).trim()) L.push('DESCRIPTION:' + icsEsc(o.desc));
    const rem = Math.round(Number(o.rem) || 0); if (rem > 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(title), 'TRIGGER:-PT' + rem + 'M', 'END:VALARM');
    L.push('END:VEVENT', 'END:VCALENDAR');
    const text = L.map(fold).join('\r\n') + '\r\n';
    return { text: text.replace(/\r\n/g, '\n'), blob: new Blob([text], { type: 'text/calendar' }), filename: 'event.ics' };
  },
});

// DST
const offMin = (tz, ms) => zoneOffsetMin(tz, ms);
const offStr = (m) => 'UTC' + (m < 0 ? '-' : '+') + pad2(Math.floor(Math.abs(m) / 60)) + ':' + pad2(Math.abs(m) % 60);
T.push(calc('dst-clock-change-finder', DT, 'Daylight Saving Time Change Finder for Any Time Zone and Year',
  'Find the exact moments clocks go forward or back in an IANA time zone for a year, with the UTC offset before and after.',
  [txt('tz', 'Time zone (IANA name)', 'Europe/Brussels'), num('y', 'Year', 2026)], (o) => {
    const tz = String(o.tz).trim(), y = Math.round(need(o.y, 'year')); if (y < 1970 || y > 2100) throw new Error('Use a year from 1970 to 2100');
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { throw new Error('Unknown time zone: ' + tz + ' (use a name like America/New_York)'); }
    const start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1), ch = [];
    for (let t = start; t < end; t += 864e5) {
      const a = offMin(tz, t), b = offMin(tz, Math.min(t + 864e5, end));
      if (a !== b) { let lo = t, hi = t + 864e5; while (hi - lo > 1000) { const mid = Math.floor((lo + hi) / 2000) * 1000; if (offMin(tz, mid) === a) lo = mid; else hi = mid; } ch.push([hi, a, b]); }
    }
    const loc = (ms, off) => { const x = new Date(ms + off * 60000).toISOString(); return x.slice(0, 10) + ' ' + x.slice(11, 16); };
    if (!ch.length) return `${tz} has no clock change in ${y}. Offset all year: ${offStr(offMin(tz, start))}.\n\nThat is normal for zones that do not use daylight saving time. Zone rules come from your browser's time zone database.`;
    return `${tz}, ${y}\n\n` + ch.map(([ms, a, b]) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC: ${b > a ? 'clocks go forward' : 'clocks go back'} ${Math.abs(b - a)} min\n  local time ${loc(ms, a)} becomes ${loc(ms, b)}\n  ${offStr(a)} -> ${offStr(b)}`).join('\n\n') + "\n\nResults come from your browser's built-in time zone database (Intl), found by bisection to the second. Governments change rules, so very new or future rules may be out of date in older browsers.";
  }));

// Chinese zodiac
const ANIMALS = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];
const ELEM = ['Wood', 'Wood', 'Fire', 'Fire', 'Earth', 'Earth', 'Metal', 'Metal', 'Water', 'Water'];
const cny = (y) => {
  const f = new Intl.DateTimeFormat('en-u-ca-chinese', { timeZone: 'UTC', month: 'numeric', day: 'numeric' });
  for (let d = Date.UTC(y, 0, 15); d < Date.UTC(y, 2, 1); d += 864e5) { const p = f.formatToParts(new Date(d)); const m = p.find((x) => x.type === 'month').value, dy = p.find((x) => x.type === 'day').value; if (m === '1' && dy === '1') return new Date(d); }
  return null;
};
T.push(calc('chinese-zodiac-finder', DT, 'Chinese Zodiac Animal and Element Finder by Birth Date',
  'Enter a birth date to get the Chinese zodiac animal, its element and yin or yang, adjusted for the Chinese New Year date of that year.',
  [dat('d', 'Birth date', '1988-02-10')], (o) => {
    const d = D(o.d), y = d.getUTCFullYear(); if (y < 1900 || y > 2100) throw new Error('Use a date from 1900 to 2100');
    const c = cny(y); if (!c) throw new Error('This browser has no Chinese calendar data');
    const cy = d < c ? y - 1 : y, i = (((cy - 4) % 12) + 12) % 12, e = (((cy - 4) % 10) + 10) % 10;
    return `Birth date: ${dstr(d)}\nChinese New Year ${y}: ${dstr(c)}\n${d < c ? 'Born before Chinese New Year, so the zodiac year is ' + cy + '.' : 'Born on or after Chinese New Year, so the zodiac year is ' + cy + '.'}\n\nAnimal: ${ANIMALS[i]}\nElement: ${ELEM[e]} (${e % 2 === 0 ? 'yang' : 'yin'})\nSign: ${ELEM[e]} ${ANIMALS[i]}\n\nNew Year dates come from the Chinese calendar data in your browser (Intl). Dates are taken in UTC and treated as Beijing dates, so a birth on New Year's Day itself may differ by time zone. The 60-year cycle is counted from year 4 (so 1984 is Wood Rat).`;
  }));

// monthly calendar (HTML for print)
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isoWeek = (d) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7); };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
T.push(calc('monthly-calendar-generator', DT, 'Printable Monthly Calendar Generator with Marked Dates',
  'Make a clean printable calendar for one month or all twelve, with Monday or Sunday start, week numbers and dates you mark with labels.',
  [num('y', 'Year', 2026), sel('m', 'Month', ['Whole year', ...MONTHS], 'November'), sel('start', 'Week starts on', ['Monday', 'Sunday'], 'Monday'), chk('wk', 'Show ISO week numbers', true), txt('marks', 'Marked dates: YYYY-MM-DD label; next ... (separate with semicolons)', '2026-11-26 Thanksgiving; 2026-11-11 Holiday')], (o) => {
    const y = Math.round(need(o.y, 'year')); if (y < 1583 || y > 9999) throw new Error('Use a year from 1583 to 9999');
    const marks = new Map(); for (const part of String(o.marks).split(';').map((x) => x.trim()).filter(Boolean)) { const k = iso(D(part)); marks.set(k, esc(part.slice(10).trim() || 'marked')); }
    const mon = o.start === 'Monday', heads = (mon ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6]).map((i) => WD[i].slice(0, 3));
    const month = (mo) => {
      const first = new Date(Date.UTC(y, mo, 1)), lead = (first.getUTCDay() - (mon ? 1 : 0) + 7) % 7, n = dim(y, mo); let rows = '', day = 1 - lead;
      while (day <= n) {
        let r = ''; const wkStart = new Date(Date.UTC(y, mo, Math.max(day, 1)));
        if (o.wk) r += `<td class="wk">${isoWeek(addDays(wkStart, mon ? 0 : 1))}</td>`;
        for (let i = 0; i < 7; i++, day++) {
          if (day < 1 || day > n) { r += '<td></td>'; continue; }
          const k = `${y}-${pad2(mo + 1)}-${pad2(day)}`, m = marks.get(k), w = new Date(Date.UTC(y, mo, day)).getUTCDay();
          r += `<td class="${w === 0 || w === 6 ? 'we' : ''}${m ? ' mk' : ''}"><b>${day}</b>${m ? `<small>${m}</small>` : ''}</td>`;
        }
        rows += `<tr>${r}</tr>`;
      }
      return `<section><h2>${MONTHS[mo]} ${y}</h2><table><thead><tr>${o.wk ? '<th>Wk</th>' : ''}${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></section>`;
    };
    const idx = o.m === 'Whole year' ? [...Array(12).keys()] : [MONTHS.indexOf(o.m)];
    if (idx[0] < 0) throw new Error('Pick a month');
    return { html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Calendar ${y}</title><style>body{font-family:system-ui,sans-serif;margin:1rem;color:#111;background:#fff}h2{margin:.2em 0}section{page-break-after:always;break-after:page}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #888;height:${idx.length === 1 ? '5.5rem' : '3rem'};vertical-align:top;padding:.2rem;text-align:left}th{height:auto;background:#eee}td.we{background:#f3f3f3}td.mk{background:#ffe9a8}td.wk{width:2.2rem;color:#555;font-size:.8rem}small{display:block;font-size:.7rem}@media print{body{margin:0}}</style></head><body>${idx.map(month).join('')}</body></html>` };
  }));

// ---------- custom UI tools ----------
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'style') e.style.cssText = v; else if (k in e) e[k] = v; else e.setAttribute(k, v); }
  e.append(...kids.flat().filter((x) => x != null)); return e;
};
const BIG = 'font-size:2.5rem;font-family:monospace;margin:.5rem 0';
const lab = (t, input) => el('label', { style: 'margin-right:1rem;display:inline-block' }, t + ' ', input);
const every = (root, fn, ms) => { const id = setInterval(() => { if (!root.isConnected) clearInterval(id); else fn(); }, ms); return id; };
const dl = (name, text, type) => { const u = URL.createObjectURL(new Blob([text], { type })); const a = el('a', { href: u, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); };
const beep = () => { try { const a = new AudioContext(), o = a.createOscillator(); o.connect(a.destination); o.start(); setTimeout(() => { o.stop(); a.close(); }, 350); } catch { /* no audio */ } };

T.push({
  id: 'stopwatch-lap-csv-export', cat: TP, title: 'Stopwatch with Laps and CSV Export', desc: 'Time events with lap splits and cumulative times, then download the laps as a CSV file.', custom: true,
  render: (root) => {
    let acc = 0, t0 = 0, run = false; const laps = [];
    const fm = (ms) => { const t = Math.floor(ms / 10); return `${pad2(Math.floor(t / 6000))}:${pad2(Math.floor(t / 100) % 60)}.${pad2(t % 100)}`; };
    const now = () => acc + (run ? performance.now() - t0 : 0);
    const big = el('div', { style: BIG, role: 'timer', 'aria-label': 'Elapsed time' }), st = el('div', { role: 'status', className: 'muted' }), list = el('ol', { 'aria-label': 'Laps' });
    const go = el('button', { type: 'button', onclick: () => { if (run) { acc += performance.now() - t0; run = false; st.textContent = 'Stopped at ' + fm(acc); } else { t0 = performance.now(); run = true; st.textContent = 'Running'; } draw(); } }, 'Start');
    const lap = el('button', { type: 'button', onclick: () => { const tot = now(); if (!tot) return; const prev = laps.length ? laps[laps.length - 1].total : 0; laps.push({ total: tot, split: tot - prev }); st.textContent = `Lap ${laps.length}: ${fm(tot - prev)}`; draw(); } }, 'Lap');
    const reset = el('button', { type: 'button', onclick: () => { run = false; acc = 0; laps.length = 0; st.textContent = 'Reset'; draw(); } }, 'Reset');
    const exp = el('button', { type: 'button', onclick: () => { if (!laps.length) { st.textContent = 'Record a lap first'; return; } dl('laps.csv', 'lap,split,total,split_seconds,total_seconds\n' + laps.map((l, i) => `${i + 1},${fm(l.split)},${fm(l.total)},${(l.split / 1000).toFixed(3)},${(l.total / 1000).toFixed(3)}`).join('\n') + '\n', 'text/csv'); } }, 'Download CSV');
    const draw = () => { big.textContent = fm(now()); go.textContent = run ? 'Stop' : 'Start'; list.replaceChildren(...laps.map((l, i) => el('li', { value: i + 1 }, `${fm(l.split)} (total ${fm(l.total)})`)).reverse()); };
    root.append(big, el('div', { className: 'row' }, go, lap, reset, exp), st, list);
    every(root, () => { if (run) big.textContent = fm(now()); }, 50); draw();
  },
});

T.push({
  id: 'pomodoro-timer-notifications', cat: TP, title: 'Pomodoro Timer with Notifications and Session Count', desc: 'Focus and break intervals with a sound and optional browser notification at each change and a count of finished focus sessions.', custom: true,
  render: (root) => {
    const inp = (v) => el('input', { type: 'number', min: 1, value: v, style: 'width:4.5rem' });
    const w = inp(25), b = inp(5), l = inp(15), n = inp(4);
    let phase = 'idle', endAt = 0, left = 0, done = 0, seq = 0, paused = false;
    const big = el('div', { style: BIG, role: 'timer', 'aria-label': 'Time left' }), st = el('div', { role: 'status' }), cnt = el('div', { role: 'status', 'aria-label': 'Completed sessions' });
    const mins = (x) => Math.max(1, +x.value || 1);
    const label = { work: 'Focus', short: 'Short break', long: 'Long break', idle: 'Ready' };
    const notify = (msg) => { beep(); try { if ('Notification' in window && Notification.permission === 'granted') new Notification(msg); } catch { /* ignore */ } };
    const start = (p) => { phase = p; left = mins(p === 'work' ? w : p === 'short' ? b : l) * 60000; endAt = performance.now() + left; paused = false; st.textContent = label[p] + ' started'; draw(); };
    const next = () => { if (phase === 'work') { done++; seq++; const long = seq % mins(n) === 0; notify(long ? 'Focus done. Take a long break.' : 'Focus done. Take a short break.'); start(long ? 'long' : 'short'); } else { notify('Break over. Back to focus.'); start('work'); } };
    const fm = (ms) => { const s = Math.ceil(ms / 1000); return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60); };
    const draw = () => { big.textContent = phase === 'idle' ? fm(mins(w) * 60000) : fm(paused ? left : Math.max(0, endAt - performance.now())); cnt.textContent = `Completed focus sessions: ${done}`; pb.textContent = paused ? 'Resume' : 'Pause'; };
    const sb = el('button', { type: 'button', onclick: () => start('work') }, 'Start focus');
    const pb = el('button', { type: 'button', onclick: () => { if (phase === 'idle') return; if (paused) { endAt = performance.now() + left; paused = false; st.textContent = 'Resumed'; } else { left = endAt - performance.now(); paused = true; st.textContent = 'Paused'; } draw(); } }, 'Pause');
    const skip = el('button', { type: 'button', onclick: () => { if (phase !== 'idle') next(); } }, 'Skip phase');
    const rs = el('button', { type: 'button', onclick: () => { phase = 'idle'; done = 0; seq = 0; paused = false; st.textContent = 'Reset'; draw(); } }, 'Reset');
    const nb = el('button', { type: 'button', onclick: async () => { try { const r = await Notification.requestPermission(); st.textContent = r === 'granted' ? 'Notifications enabled' : 'Notifications not allowed. The sound still plays.'; } catch { st.textContent = 'Notifications are not available in this browser. The sound still plays.'; } } }, 'Enable notifications');
    root.append(el('div', {}, lab('Focus minutes', w), lab('Break minutes', b), lab('Long break minutes', l), lab('Sessions before long break', n)), big, st, cnt, el('div', { className: 'row' }, sb, pb, skip, rs, nb));
    every(root, () => { if (phase !== 'idle' && !paused && endAt - performance.now() <= 0) next(); else if (phase !== 'idle' && !paused) draw(); }, 250); draw();
  },
});

let CD = null;
T.push({
  id: 'event-countdown-live', cat: TP, title: 'Live Event Countdown with Shareable Link', desc: 'A ticking countdown in days, hours, minutes and seconds to an event name, date and time that you can share as a link.', custom: true,
  render: (root) => {
    const name = el('input', { type: 'text', value: 'Launch day', style: 'width:14rem' }), date = el('input', { type: 'date', value: '2027-01-01' }), time = el('input', { type: 'time', value: '09:00' });
    const big = el('div', { style: BIG, 'aria-label': 'Time remaining' }), head = el('h3', {}), st = el('div', { role: 'status' });
    const draw = () => {
      head.textContent = name.value || 'Event';
      const t = new Date(`${date.value}T${time.value || '00:00'}`); if (isNaN(t)) { big.textContent = '--'; return; }
      let s = Math.floor((t - Date.now()) / 1000); const past = s < 0; s = Math.abs(s);
      big.textContent = `${Math.floor(s / 86400)}d ${pad2(Math.floor(s % 86400 / 3600))}h ${pad2(Math.floor(s % 3600 / 60))}m ${pad2(s % 60)}s${past ? ' ago' : ''}`;
    };
    const cp = el('button', { type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(location.href); st.textContent = 'Link copied. It includes the event name, date and time in your local time.'; } catch { st.textContent = 'Copy failed. Copy the address bar instead.'; } } }, 'Copy share link');
    root.append(el('div', {}, lab('Event name', name), lab('Date', date), lab('Time', time)), head, big, el('div', { className: 'row' }, cp), st);
    [name, date, time].forEach((x) => x.addEventListener('input', draw));
    every(root, draw, 1000); draw();
    CD = { name, date, time, draw };
  },
  urlState: {
    get() { return CD ? { n: CD.name.value, d: CD.date.value, t: CD.time.value } : {}; },
    set(s) { if (!CD) return; if (s.n != null) CD.name.value = s.n; if (s.d) CD.date.value = s.d; if (s.t) CD.time.value = s.t; CD.draw(); },
  },
});

// ---------- sun and moon ----------
const rad = Math.PI / 180;
const sunAt = (jd) => {
  const t = (jd - 2451545) / 36525, L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360, M = 357.52911 + t * (35999.05029 - 0.0001537 * t), e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const C = Math.sin(M * rad) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * M * rad) * (0.019993 - 0.000101 * t) + Math.sin(3 * M * rad) * 0.000289;
  const om = 125.04 - 1934.136 * t, lam = L0 + C - 0.00569 - 0.00478 * Math.sin(om * rad);
  const eps = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(om * rad);
  const dec = Math.asin(Math.sin(eps * rad) * Math.sin(lam * rad)) / rad, y = Math.tan(eps * rad / 2) ** 2;
  const eq = 4 * (y * Math.sin(2 * L0 * rad) - 2 * e * Math.sin(M * rad) + 4 * e * y * Math.sin(M * rad) * Math.cos(2 * L0 * rad) - 0.5 * y * y * Math.sin(4 * L0 * rad) - 1.25 * e * e * Math.sin(2 * M * rad)) / rad;
  return { dec, eq };
};
const jdOf = (ms) => ms / 864e5 + 2440587.5;
const fmtIn = (ms, tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(ms)).replace(',', '');
T.push(calc('sunrise-sunset-calculator', DT, 'Sunrise, Sunset and Day Length Calculator for Any Latitude and Date',
  'Compute sunrise, sunset, solar noon and daylight length for coordinates and a date, offline, using the NOAA solar position equations.',
  [num('lat', 'Latitude (north positive)', 50.85), num('lon', 'Longitude (east positive)', 4.35), dat('date', 'Date', '2026-06-21'), txt('tz', 'Show times in time zone (IANA)', 'Europe/Brussels')], (o) => {
    const lat = need(o.lat, 'latitude'), lon = need(o.lon, 'longitude'); if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Latitude is -90 to 90, longitude -180 to 180');
    const d = D(o.date), tz = String(o.tz).trim() || 'UTC'; try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { throw new Error('Unknown time zone: ' + tz); }
    const day0 = d.getTime();
    let noon = day0 + (720 - 4 * lon - sunAt(jdOf(day0 + 12 * 36e5 - lon * 240000)).eq) * 60000;
    for (let i = 0; i < 3; i++) noon = day0 + (720 - 4 * lon - sunAt(jdOf(noon)).eq) * 60000;
    const cosH = (dec) => (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(dec * rad)) / (Math.cos(lat * rad) * Math.cos(dec * rad));
    const c0 = cosH(sunAt(jdOf(noon)).dec);
    const head = `${iso(d)} at ${lat}, ${lon} (times in ${tz})\n\n`;
    if (c0 > 1) return head + `Solar noon: ${fmtIn(noon, tz)}\nThe sun stays below the horizon all day (polar night).`;
    if (c0 < -1) return head + `Solar noon: ${fmtIn(noon, tz)}\nThe sun stays above the horizon all day (midnight sun).`;
    let rise = noon - 6 * 36e5, set = noon + 6 * 36e5;
    for (let i = 0; i < 4; i++) {
      const hr = Math.acos(Math.max(-1, Math.min(1, cosH(sunAt(jdOf(rise)).dec)))) / rad, hs = Math.acos(Math.max(-1, Math.min(1, cosH(sunAt(jdOf(set)).dec)))) / rad;
      rise = noon - hr * 240000; set = noon + hs * 240000;
    }
    const dl2 = (set - rise) / 1000;
    return head + `Sunrise:     ${fmtIn(rise, tz)}\nSolar noon:  ${fmtIn(noon, tz)}\nSunset:      ${fmtIn(set, tz)}\nDay length:  ${Math.floor(dl2 / 3600)} h ${pad2(Math.floor(dl2 % 3600 / 60))} min ${pad2(Math.round(dl2 % 60))} s\nUTC:         ${new Date(rise).toISOString().slice(11, 16)} to ${new Date(set).toISOString().slice(11, 16)}\n\nSunrise and sunset use a 90.833 degree zenith (sun's edge plus average refraction). Real times shift by a minute or more with weather, altitude and local horizon. Very close to the poles the result is less reliable. If the zone you pick is far from the coordinates, the date shown can differ from the date you entered.`;
  }));

// moon (Meeus, Astronomical Algorithms ch. 49, main periodic terms)
const phaseJD = (k, full) => {
  const T = k / 1236.85, E = 1 - 0.002516 * T - 0.0000074 * T * T;
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T - 0.00000015 * T ** 3 + 0.00000000073 * T ** 4;
  const M = (2.5534 + 29.1053567 * k - 0.0000014 * T * T) * rad, Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T * T + 0.00001238 * T ** 3) * rad, F = (160.7108 + 390.67050284 * k - 0.0016118 * T * T) * rad, Om = (124.7746 - 1.56375588 * k + 0.0020672 * T * T) * rad;
  const S = Math.sin;
  const c = full
    ? -0.40614 * S(Mp) + 0.17302 * E * S(M) + 0.01614 * S(2 * Mp) + 0.01043 * S(2 * F) + 0.00734 * E * S(Mp - M) - 0.00515 * E * S(Mp + M) + 0.00209 * E * E * S(2 * M)
    : -0.4072 * S(Mp) + 0.17241 * E * S(M) + 0.01608 * S(2 * Mp) + 0.01039 * S(2 * F) + 0.00739 * E * S(Mp - M) - 0.00514 * E * S(Mp + M) + 0.00208 * E * E * S(2 * M);
  const common = -0.00111 * S(Mp - 2 * F) - 0.00057 * S(Mp + 2 * F) + 0.00056 * E * S(2 * Mp + M) - 0.00042 * S(3 * Mp) + 0.00042 * E * S(M + 2 * F) + 0.00038 * E * S(M - 2 * F) - 0.00024 * E * S(2 * Mp - M) - 0.00017 * S(Om);
  return jde + c + common;
};
const jd2ms = (jd) => (jd - 2440587.5) * 864e5;
const newMoons = (ms) => { const k0 = Math.floor((jdOf(ms) - 2451550.09766) / 29.530588861) - 2; const r = []; for (let k = k0; k < k0 + 6; k++) { r.push({ ms: jd2ms(phaseJD(k, false)), full: false }); r.push({ ms: jd2ms(phaseJD(k + 0.5, true)), full: true }); } return r.sort((a, b) => a.ms - b.ms); };
const moonAt = (ms) => {
  const ev = newMoons(ms), prevNew = [...ev].reverse().find((e) => !e.full && e.ms <= ms), nextNew = ev.find((e) => !e.full && e.ms > ms);
  const f = (ms - prevNew.ms) / (nextNew.ms - prevNew.ms), ill = (1 - Math.cos(2 * Math.PI * f)) / 2;
  const names = [[0.03, 'New moon'], [0.22, 'Waxing crescent'], [0.28, 'First quarter'], [0.47, 'Waxing gibbous'], [0.53, 'Full moon'], [0.72, 'Waning gibbous'], [0.78, 'Last quarter'], [0.97, 'Waning crescent'], [1.01, 'New moon']];
  return { f, ill, name: names.find(([x]) => f < x)[1], age: f * 29.530588861, ev };
};
T.push(calc('moon-phase-calculator', DT, 'Moon Phase Calculator: Phase, Illumination and Next Full Moon',
  'Find the moon phase, how much of the disc is lit and the next new and full moons for a date, plus a table for the whole month.',
  [dat('date', 'Date', '2026-10-23'), chk('month', 'Show every day of the month', true)], (o) => {
    const d = D(o.date), noon = d.getTime() + 12 * 36e5, m = moonAt(noon), u = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    const nf = m.ev.filter((e) => e.full && e.ms > noon).slice(0, 2), nn = m.ev.filter((e) => !e.full && e.ms > noon).slice(0, 2);
    let s = `${dstr(d)} at 12:00 UTC\n\nPhase: ${m.name}\nIlluminated: ${f2(m.ill * 100, 0)}%\nMoon age: ${f2(m.age, 1)} days since new moon\n\nNext full moons: ${nf.map((e) => u(e.ms)).join(', ')}\nNext new moons: ${nn.map((e) => u(e.ms)).join(', ')}`;
    if (o.month) {
      const y = d.getUTCFullYear(), mo = d.getUTCMonth(); s += `\n\n${y}-${pad2(mo + 1)}\n`;
      for (let i = 1; i <= dim(y, mo); i++) { const x = moonAt(Date.UTC(y, mo, i, 12)); s += `\n  ${pad2(i)}  ${f2(x.ill * 100, 0).padStart(3)}%  ${x.name}`; }
    }
    return s + '\n\nNew and full moon times use the main terms of Meeus, Astronomical Algorithms ch. 49 (good to roughly 10 minutes). Illumination and phase names between them are interpolated and good to about 5 percentage points. Dates and times are in UTC; the local date can differ.';
  }));

export default T;

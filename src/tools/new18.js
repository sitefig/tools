// Tools from free-browser-tools.md, batch 18 (health calculators, then image tools). See TOOLS.md for the contract.
// Health outputs are estimates from published formulas. They are not medical advice.
// Skipped on purpose: Open Food Facts lookup and Open-Meteo air quality (live APIs), and every tool that
// needs a downloaded AI model (background removal, upscaling, inpainting, colorizing, captioning).
const T = [];
const HEA = 'Calculators – Health', IMG = 'Images';
const num = (id, label, def) => ({ id, label, type: 'number', def });
const sel = (id, label, choices, def) => ({ id, label, type: 'select', choices, def: def === undefined ? choices[0] : def });
const txt = (id, label, def) => ({ id, label, type: 'text', def });
const chk = (id, label, def) => ({ id, label, type: 'checkbox', def });
const R = (x, d = 1) => { const p = 10 ** d; return Math.round(x * p) / p; };
const pos = (o, ...ks) => { for (const k of ks) if (!(+o[k] > 0)) throw new Error('Enter a number above zero in every field.'); };
const NOTE = '\n\nThis is an estimate from a published formula, not medical advice.';
const UNITS = sel('units', 'Units', ['metric (kg, cm)', 'imperial (lb, in)']);
const imp = (o) => String(o.units).startsWith('imp');
const toKg = (o, v) => (imp(o) ? v * 0.45359237 : v);
const toCm = (o, v) => (imp(o) ? v * 2.54 : v);
const wu = (o) => (imp(o) ? 'lb' : 'kg');
const fromKg = (o, v) => (imp(o) ? v / 0.45359237 : v);
const ACT = { 'Sedentary (x1.2)': 1.2, 'Light, 1-3 days a week (x1.375)': 1.375, 'Moderate, 3-5 days a week (x1.55)': 1.55, 'Very active, 6-7 days a week (x1.725)': 1.725, 'Extra active, physical job (x1.9)': 1.9 };
const pdate = (s, what = 'Date') => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim()); if (!m) throw new Error(`${what} must look like 2025-03-31.`); const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); if (d.getUTCMonth() !== +m[2] - 1) throw new Error(`${what} is not a real date.`); return d; };
const iso = (d) => d.toISOString().slice(0, 10);
const addD = (d, n) => new Date(d.getTime() + n * 864e5);
const today = () => { const n = new Date(); return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())); };

// ---- calorie deficit
T.push({
  id: 'calorie-deficit-calculator', cat: HEA, title: 'Calorie Deficit Calculator (Daily Target and Goal Date)',
  desc: 'Turn a weekly weight-loss rate into a daily calorie target and an estimated goal date, from Mifflin-St Jeor maintenance calories and a 7,700 kcal per kg rule of thumb.',
  inputs: 0, sample: '',
  opts: [UNITS, sel('sex', 'Sex', ['Male', 'Female']), num('age', 'Age (years)', 35), num('h', 'Height (cm or in)', 172), num('w', 'Current weight (kg or lb)', 85), num('goal', 'Goal weight (kg or lb)', 75), sel('act', 'Activity level', Object.keys(ACT), 'Light, 1-3 days a week (x1.375)'), num('rate', 'Planned change per week (kg or lb)', 0.5), txt('from', 'Start date (blank = today)', '2025-01-06')],
  run: (_i, o) => {
    pos(o, 'age', 'h', 'w', 'goal', 'rate'); const w = toKg(o, +o.w), g = toKg(o, +o.goal), h = toCm(o, +o.h), rate = toKg(o, +o.rate);
    const bmr = 10 * w + 6.25 * h - 5 * +o.age + (o.sex === 'Male' ? 5 : -161), tdee = bmr * ACT[o.act], loss = g < w, diff = Math.abs(w - g);
    if (diff < 0.05) throw new Error('Goal weight equals current weight.');
    const adj = (rate * 7700) / 7, target = loss ? tdee - adj : tdee + adj, weeks = diff / rate, start = o.from.trim() ? pdate(o.from, 'Start date') : today(), end = addD(start, Math.ceil(weeks * 7));
    const warn = []; if (loss && target < bmr) warn.push('The target is below your estimated resting calories (BMR). Slow the rate down, or talk to a doctor or dietitian first.'); if (rate > 0.01 * w) warn.push('This is faster than 1% of body weight per week, a common upper guide. Expect it to be hard to keep up.');
    return [`Maintenance (TDEE): ${R(tdee, 0)} kcal/day  (BMR ${R(bmr, 0)} x activity)`, `${loss ? 'Daily deficit' : 'Daily surplus'}: ${R(adj, 0)} kcal  (${R(rate * 7700, 0)} kcal per week)`, `Daily target: ${R(target, 0)} kcal`, `To ${loss ? 'lose' : 'gain'}: ${R(fromKg(o, diff), 1)} ${wu(o)}  in about ${R(weeks, 1)} weeks`, `Estimated goal date: ${iso(end)}  (from ${iso(start)})`, ...warn.map((x) => 'Check: ' + x)].join('\n') + '\n\nMethod: Mifflin-St Jeor for BMR, activity multipliers for TDEE, and 7,700 kcal per kg (3,500 kcal per lb) as the energy in body weight. Real weight change slows as you lose, so treat the date as a rough guide.' + NOTE;
  },
});

// ---- protein
const PGOALS = { 'Stay healthy, little exercise (0.8 g/kg, RDA)': [0.8, 0.8], 'Endurance training (1.4-1.6 g/kg)': [1.4, 1.6], 'Team or mixed sport (1.6-1.8 g/kg)': [1.6, 1.8], 'Build or keep muscle, strength training (1.6-2.0 g/kg)': [1.6, 2.0], 'Lifting while cutting calories (2.3-3.1 g/kg)': [2.3, 3.1] };
T.push({
  id: 'protein-intake-calculator', cat: HEA, title: 'Protein Intake Calculator (Daily Grams by Goal)',
  desc: 'Get a daily protein range in grams from your body weight and training goal, using the ISSN position stand ranges for exercisers, plus a split across meals.',
  inputs: 0, sample: '', opts: [UNITS, num('w', 'Body weight (kg or lb)', 75), sel('goal', 'Goal', Object.keys(PGOALS), 'Build or keep muscle, strength training (1.6-2.0 g/kg)'), num('meals', 'Meals per day', 4)],
  run: (_i, o) => {
    pos(o, 'w', 'meals'); const kg = toKg(o, +o.w), [a, b] = PGOALS[o.goal], lo = a * kg, hi = b * kg, m = Math.max(1, Math.min(8, Math.round(+o.meals)));
    return `Body weight: ${R(kg, 1)} kg\nRange: ${a === b ? a.toFixed(1) : a.toFixed(1) + ' to ' + b.toFixed(1)} g per kg\nDaily protein: ${a === b ? R(lo, 0) : R(lo, 0) + ' to ' + R(hi, 0)} g\nPer meal (${m} meals): ${a === b ? R(lo / m, 0) : R(lo / m, 0) + ' to ' + R(hi / m, 0)} g\nCalories from protein: ${R(lo * 4, 0)}${a === b ? '' : ' to ' + R(hi * 4, 0)} kcal  (4 kcal per g)\n\nRanges: the ISSN position stand on protein and exercise (2017) gives 1.4-2.0 g/kg for most exercisers, lower for endurance and higher for strength work, and 2.3-3.1 g/kg for lean mass during calorie restriction in resistance-trained people. 0.8 g/kg is the commonly quoted adult RDA; check your national figure. People with kidney disease or other conditions should ask their doctor before eating more protein.` + NOTE;
  },
});

// ---- waist to height
T.push({
  id: 'waist-to-height-ratio-calculator', cat: HEA, title: 'Waist-to-Height Ratio Calculator (Under 0.5 Rule)',
  desc: 'Divide waist by height and see the ratio against the 0.5 rule and the NICE bands, with the waist size that would put you at 0.5.',
  inputs: 0, sample: '', opts: [sel('units', 'Units', ['cm', 'inches']), num('waist', 'Waist', 88), num('h', 'Height', 175)],
  run: (_i, o) => {
    pos(o, 'waist', 'h'); const r = +o.waist / +o.h, band = r < 0.4 ? 'Below 0.4: lower than the usual healthy band. Review with a professional if you are underweight.' : r < 0.5 ? '0.4 to 0.49: healthy central fat, no added risk flagged.' : r < 0.6 ? '0.5 to 0.59: increased central fat, raised risk of diabetes, high blood pressure and heart disease.' : '0.6 or more: high central fat, further increased risk.';
    return `Waist-to-height ratio: ${R(r, 2)}  (${R(r, 3)})\n${band}\nWaist at 0.5 for your height: ${R(+o.h / 2, 1)} ${o.units === 'cm' ? 'cm' : 'in'}\n\nBands follow NICE guideline NG246 as quoted by secondary sources (the NICE page itself was not checked). NICE says they apply to adults with a BMI under 35. The ratio is a screening hint, not a diagnosis.` + NOTE;
  },
});

// ---- waist to hip
T.push({
  id: 'waist-to-hip-ratio-calculator', cat: HEA, title: 'Waist-to-Hip Ratio Calculator (WHO Cut-offs)',
  desc: 'Divide waist by hip and compare the ratio with the WHO cut-offs of 0.90 for men and 0.85 for women for increased metabolic risk.',
  inputs: 0, sample: '', opts: [sel('units', 'Units', ['cm', 'inches']), sel('sex', 'Sex', ['Male', 'Female']), num('waist', 'Waist', 90), num('hip', 'Hip (widest part)', 100)],
  run: (_i, o) => {
    pos(o, 'waist', 'hip'); const r = +o.waist / +o.hip, cut = o.sex === 'Male' ? 0.9 : 0.85;
    return `Waist-to-hip ratio: ${R(r, 2)}\nCut-off for ${o.sex.toLowerCase()}: ${cut}\n${r >= cut ? 'At or above the cut-off: the WHO describes this as a substantially increased risk of metabolic complications. Worth reviewing with a health professional.' : 'Below the cut-off.'}\n\nMeasure waist at the midpoint between the lowest rib and the top of the hip bone, and hip at the widest point, standing relaxed. The 0.90 and 0.85 figures are attributed to the WHO 2008 expert consultation by secondary sources; the report itself was not checked here. Cut-offs may differ for some ethnic groups.` + NOTE;
  },
});

// ---- lean body mass
T.push({
  id: 'lean-body-mass-calculator', cat: HEA, title: 'Lean Body Mass Calculator (Boer, James and Hume)',
  desc: 'Estimate lean body mass and fat mass from weight, height and sex with the Boer, James and Hume formulas side by side.',
  inputs: 0, sample: '', opts: [UNITS, sel('sex', 'Sex', ['Male', 'Female']), num('w', 'Weight (kg or lb)', 80), num('h', 'Height (cm or in)', 178)],
  run: (_i, o) => {
    pos(o, 'w', 'h'); const W = toKg(o, +o.w), H = toCm(o, +o.h), m = o.sex === 'Male';
    const f = { Boer: m ? 0.407 * W + 0.267 * H - 19.2 : 0.252 * W + 0.473 * H - 48.3, James: m ? 1.1 * W - 128 * (W / H) ** 2 : 1.07 * W - 148 * (W / H) ** 2, Hume: m ? 0.3281 * W + 0.33929 * H - 29.5336 : 0.29569 * W + 0.41813 * H - 43.2933 };
    const rows = Object.entries(f).map(([k, v]) => `${k.padEnd(6)} lean ${R(fromKg(o, v), 1)} ${wu(o)}   fat ${R(fromKg(o, W - v), 1)} ${wu(o)}   body fat ${R(100 * (1 - v / W), 1)}%`);
    return rows.join('\n') + '\n\nFormulas: Boer (1984), James (1976) and Hume (1966), coefficients as published on secondary sources (originals not checked). They use only weight, height and sex, so they cannot see muscle versus fat and can differ by several kg. Body fat percent here is a by-product, not a measurement.' + NOTE;
  },
});

// ---- pace maths shared by running and swimming
const hms = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const pt = (s, what) => { const p = String(s).trim().split(':'); if (p.length > 3 || p.some((x) => !/^\d+(\.\d+)?$/.test(x))) throw new Error(`${what} must look like 25:30 or 1:45:00.`); return p.reduce((a, x) => a * 60 + +x, 0); };
const DIST = { '5k': 5, '10k': 10, '15k': 15, '10 mile': 16.09344, half: 21.0975, 'half marathon': 21.0975, marathon: 42.195, mile: 1.609344, '1 mile': 1.609344 };
const pd = (s, unit) => { const t = String(s).trim().toLowerCase(); if (DIST[t]) return unit === 'mi' ? DIST[t] / 1.609344 : DIST[t]; if (!/^\d+(\.\d+)?$/.test(t)) throw new Error('Distance must be a number or one of 5k, 10k, half, marathon.'); return +t; };
T.push({
  id: 'running-pace-calculator', cat: HEA, title: 'Running Pace Calculator (Pace, Time or Distance with Splits)',
  desc: 'Fill in any two of distance, time and pace to get the third, with split times per kilometre or mile and the speed in km/h and mph.',
  inputs: 0, sample: '', opts: [sel('unit', 'Unit', ['km', 'mi']), txt('d', 'Distance (number, or 5k, 10k, half, marathon)', '10'), txt('t', 'Time (h:mm:ss or mm:ss)', '50:00'), txt('p', 'Pace per unit (mm:ss)', '')],
  run: (_i, o) => {
    const u = o.unit, filled = [o.d, o.t, o.p].filter((x) => String(x).trim()).length; if (filled !== 2) throw new Error('Fill in exactly two of distance, time and pace, and leave the third blank.');
    let d, t, p; if (o.d.trim()) d = pd(o.d, u); if (o.t.trim()) t = pt(o.t, 'Time'); if (o.p.trim()) p = pt(o.p, 'Pace');
    if (d === undefined) d = t / p; else if (t === undefined) t = d * p; else p = t / d;
    if (!(d > 0 && t > 0 && Number.isFinite(p))) throw new Error('Values must be above zero.');
    const kmh = (u === 'km' ? d : d * 1.609344) / (t / 3600), mph = kmh / 1.609344, lines = [`Distance: ${R(d, 3)} ${u}`, `Time: ${hms(t)}`, `Pace: ${hms(p)} per ${u}`, `Speed: ${R(kmh, 2)} km/h, ${R(mph, 2)} mph`, '', `Splits (even pace):`];
    for (let i = 1; i <= Math.floor(d + 1e-9); i++) lines.push(`  ${u} ${i}: ${hms(p * i)}`); if (d % 1 > 1e-6) lines.push(`  ${R(d, 2)} ${u} (finish): ${hms(t)}`);
    return lines.join('\n');
  },
});
T.push({
  id: 'race-time-predictor', cat: HEA, title: 'Race Time Predictor (Riegel Formula for 5K to Marathon)',
  desc: 'Predict 5K, 10K, half marathon and marathon times from a recent race result with the Riegel formula, with the pace for each distance.',
  inputs: 0, sample: '', opts: [sel('unit', 'Unit', ['km', 'mi']), txt('d', 'Recent race distance (number, or 5k, 10k, half, marathon)', '10k'), txt('t', 'Finish time (h:mm:ss or mm:ss)', '48:30'), num('k', 'Riegel exponent', 1.06)],
  run: (_i, o) => {
    const d = pd(o.d, o.unit) * (o.unit === 'mi' ? 1.609344 : 1), t = pt(o.t, 'Finish time'), k = +o.k; if (!(d > 0 && t > 0)) throw new Error('Enter a distance and time above zero.'); if (!(k >= 1 && k <= 1.2)) throw new Error('Use an exponent between 1 and 1.2.');
    const rows = [['1 mile', 1.609344], ['5K', 5], ['10K', 10], ['15K', 15], ['Half marathon', 21.0975], ['Marathon', 42.195]].map(([n, km]) => { const tt = t * (km / d) ** k; return `${n.padEnd(14)} ${hms(tt).padStart(8)}   ${hms(tt / km)}/km   ${hms(tt / (km / 1.609344))}/mi`; });
    return `From ${R(d, 2)} km in ${hms(t)}:\n\n` + rows.join('\n') + `\n\nFormula: T2 = T1 x (D2 / D1)^${k} (Riegel, 1981). It assumes you have trained for the longer distance. Marathon predictions from short races are usually too fast for runners with low weekly mileage.`;
  },
});

// ---- VO2
T.push({
  id: 'vo2-max-estimator', cat: HEA, title: 'VO2 Max Estimator (Cooper 12-Minute Test or Heart Rate Ratio)',
  desc: 'Estimate VO2 max in ml/kg/min from the distance covered in a 12-minute run (Cooper) or from maximum and resting heart rate (Uth).',
  inputs: 0, sample: '', opts: [sel('method', 'Method', ['Cooper 12-minute run', 'Heart rate ratio (Uth)']), sel('unit', 'Cooper distance unit', ['metres', 'miles']), num('dist', 'Distance covered in 12 minutes', 2600), num('hrmax', 'Max heart rate (bpm, measured is best)', 190), num('hrrest', 'Resting heart rate (bpm)', 58)],
  run: (_i, o) => {
    let v, how; if (o.method.startsWith('Cooper')) { pos(o, 'dist'); const m = o.unit === 'miles' ? +o.dist * 1609.344 : +o.dist; if (m < 600 || m > 5000) throw new Error('A 12-minute distance should be between 600 m and 5000 m.'); v = (m - 504.9) / 44.73; how = `Cooper: (${R(m, 0)} m - 504.9) / 44.73`; } else { pos(o, 'hrmax', 'hrrest'); if (+o.hrmax <= +o.hrrest) throw new Error('Max heart rate must be above resting heart rate.'); v = (15.3 * +o.hrmax) / +o.hrrest; how = `Uth: 15.3 x ${o.hrmax} / ${o.hrrest}`; }
    return `Estimated VO2 max: ${R(v, 1)} ml/kg/min\nMET equivalent: ${R(v / 3.5, 1)}\nFormula: ${how}\n\nRanking by age and sex is not included, because the norm tables could not be checked against a source. Both formulas are field estimates. Cooper needs an all-out run on flat ground. Uth was fitted on well-trained men aged 21 to 51 and is the weaker estimate, mainly when max heart rate is guessed from age. Lab testing is the reference.` + NOTE;
  },
});

// ---- calories burned (MET)
const MET = [['Walking 2.0 mph, slow (17152)', 2.8], ['Walking 3.0 mph, moderate (17190)', 3.8], ['Walking 3.5 mph, brisk (17200)', 4.8], ['Walking 4.0 mph, very brisk (17220)', 5.5], ['Running 5 mph (12030)', 8.5], ['Running 6 mph (12050)', 9.3], ['Running 7 mph (12070)', 11], ['Running 8 mph (12090)', 12], ['Cycling under 10 mph, leisure (01010)', 4], ['Cycling 10-11.9 mph, light (01020)', 6.8], ['Cycling 12-13.9 mph, moderate (01030)', 8], ['Cycling 14-15.9 mph, vigorous (01040)', 10], ['Cycling 16-19 mph, racing (01050)', 12], ['Swimming freestyle laps, slow (18240)', 5.8], ['Swimming freestyle laps, fast (18230)', 9.8], ['Swimming breaststroke, recreational (18265)', 5.3], ['Swimming backstroke, recreational (18255)', 4.8], ['Resistance training, general (02054)', 3.5], ['Resistance training, vigorous (02050)', 6], ['Circuit training, moderate (02035)', 5], ['Rowing machine, moderate (02071)', 5], ['Rowing machine, vigorous (02070)', 7.3], ['Elliptical, moderate (02048)', 5], ['Jumping rope (02068)', 11], ['Aerobic dance, low impact (02005)', 4.8], ['Hatha yoga (02150)', 2.3], ['HIIT, moderate (02210)', 7], ['Calisthenics, moderate (02022)', 3.8]];
T.push({
  id: 'calories-burned-calculator', cat: HEA, title: 'Calories Burned Calculator by Activity (MET Values)',
  desc: 'Estimate calories burned for walking, running, cycling, swimming and gym activities from MET values in the 2011 Compendium of Physical Activities, your weight and the minutes spent.',
  inputs: 0, sample: '', opts: [sel('act', 'Activity (Compendium code)', MET.map((x) => x[0]), 'Running 6 mph (12050)'), num('min', 'Minutes', 30), UNITS, num('w', 'Body weight (kg or lb)', 70), num('met', 'Own MET value (0 = use the activity)', 0)],
  run: (_i, o) => {
    pos(o, 'min', 'w'); const met = +o.met > 0 ? +o.met : MET.find((x) => x[0] === o.act)[1], kg = toKg(o, +o.w), kcal = (met * kg * +o.min) / 60;
    return `Activity: ${+o.met > 0 ? 'own MET value' : o.act}\nMET: ${met}\nCalories burned: about ${R(kcal, 0)} kcal  (${R(kcal * 4.184, 0)} kJ)\nPer hour: about ${R(met * kg, 0)} kcal\n\nFormula: kcal = MET x weight in kg x hours. MET values are from the 2011 Compendium of Physical Activities (pacompendium.com, codes shown). They are group averages for gross energy use, which includes the calories you burn at rest anyway. Individual results vary by fitness, terrain and technique.` + NOTE;
  },
});

// ---- steps
const WALKMET = [[2.4, 2.8], [3.5, 3.8], [4.0, 4.8], [4.5, 5.5]];
T.push({
  id: 'steps-to-distance-converter', cat: HEA, title: 'Steps to Distance Converter (Kilometres, Miles and Calories)',
  desc: 'Turn a step count into distance walked and estimated calories, from your height or your own stride length and walking speed.',
  inputs: 0, sample: '', opts: [num('steps', 'Steps', 10000), sel('mode', 'Stride length from', ['height (rule of thumb)', 'my stride length']), sel('units', 'Units', ['metric (kg, cm)', 'imperial (lb, in)']), num('h', 'Height (cm or in)', 172), sel('sex', 'Sex', ['Male', 'Female']), num('stride', 'Own stride length (cm or in)', 70), num('w', 'Weight (kg or lb)', 70), num('speed', 'Walking speed (km/h)', 4.8)],
  run: (_i, o) => {
    pos(o, 'steps', 'w', 'speed'); let st; if (o.mode.startsWith('height')) { pos(o, 'h'); st = toCm(o, +o.h) * (o.sex === 'Male' ? 0.415 : 0.413); } else { pos(o, 'stride'); st = toCm(o, +o.stride); }
    const km = (+o.steps * st) / 100000, mph = (+o.speed) / 1.609344, hrs = km / +o.speed, band = WALKMET.find((b) => mph < b[0]) || [0, 5.5], met = band[1], kcal = met * toKg(o, +o.w) * hrs;
    return `Stride length: ${R(st, 1)} cm\nDistance: ${R(km, 2)} km  (${R(km / 1.609344, 2)} miles)\nWalking time at ${o.speed} km/h: ${hms(hrs * 3600)}\nCalories: about ${R(kcal, 0)} kcal  (MET ${met})\n\nStride from height uses the common 0.415 (men) and 0.413 (women) rule of thumb, which was not verified against a source; measure your own stride for a better figure. Calories use Compendium MET values by walking speed (2.8 below 2.4 mph, 3.8 up to 3.4 mph, 4.8 up to 3.9 mph, 5.5 at 4.0 mph and above; faster walking is not covered). ` + NOTE.trim();
  },
});

// ---- cycling power
T.push({
  id: 'cycling-power-speed-calculator', cat: HEA, title: 'Cycling Power and Speed Calculator (Watts, Weight, Gradient)',
  desc: 'Estimate steady cycling speed from power, rider and bike weight, gradient and riding position, or the watts needed for a target speed.',
  inputs: 0, sample: '', opts: [sel('mode', 'Solve for', ['speed from watts', 'watts from speed']), num('p', 'Power (watts)', 200), num('v', 'Target speed (km/h, for watts)', 30), num('rider', 'Rider weight (kg)', 75), num('bike', 'Bike and kit weight (kg)', 9), num('grade', 'Gradient (%)', 0), sel('pos', 'Position', ['upright (CdA 0.40)', 'hoods (CdA 0.32)', 'drops (CdA 0.28)', 'aero / time trial (CdA 0.23)'], 'hoods (CdA 0.32)'), num('crr', 'Rolling resistance Crr', 0.005), num('rho', 'Air density (kg/m3)', 1.225)],
  run: (_i, o) => {
    pos(o, 'rider', 'bike', 'crr', 'rho'); const cda = +/CdA ([\d.]+)/.exec(o.pos)[1], m = +o.rider + +o.bike, g = 9.80665, th = Math.atan(+o.grade / 100), eta = 0.976;
    const need = (v) => ((m * g * (+o.crr * Math.cos(th) + Math.sin(th)) + 0.5 * +o.rho * cda * v * v) * v) / eta; let v, p;
    if (o.mode.startsWith('speed')) { pos(o, 'p'); p = +o.p; let lo = -30, hi = 40; for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (need(mid) < p) lo = mid; else hi = mid; } v = (lo + hi) / 2; if (v <= 0.05) throw new Error('That power cannot move the bike up this gradient.'); } else { pos(o, 'v'); v = +o.v / 3.6; p = need(v); if (p <= 0) return `At ${o.v} km/h on this gradient gravity does the work: no pedalling power is needed (the bike would roll faster).`; }
    const parts = [m * g * +o.crr * Math.cos(th) * v / eta, m * g * Math.sin(th) * v / eta, 0.5 * +o.rho * cda * v ** 3 / eta];
    return `Speed: ${R(v * 3.6, 1)} km/h  (${R(v * 2.2369363, 1)} mph)\nPower at the pedals: ${R(p, 0)} W  (${R(p / +o.rider, 2)} W/kg)\n\nWhere the power goes:\n  Air: ${R(parts[2], 0)} W\n  Rolling resistance: ${R(parts[0], 0)} W\n  Climbing (negative = descending): ${R(parts[1], 0)} W\n\nModel: steady speed, no wind, ${R((1 - eta) * 100, 1)}% drivetrain loss, drag area and Crr as chosen. The CdA values are typical assumed figures, not measured, and real CdA varies a lot by rider. Expect real rides to differ by 5 to 15%.`;
  },
});

// ---- swim pace
T.push({
  id: 'swimming-pace-calculator', cat: HEA, title: 'Swimming Pace Calculator (Pace per 100 m or 100 yd)',
  desc: 'Fill in two of distance, time and pace per 100 to get the third, with predicted times for common pool distances at the same pace.',
  inputs: 0, sample: '', opts: [sel('unit', 'Unit', ['m', 'yd']), num('d', 'Distance (blank = solve)', 1500), txt('t', 'Time (h:mm:ss or mm:ss)', ''), txt('p', 'Pace per 100 (mm:ss)', '1:45')],
  run: (_i, o) => {
    const filled = [String(o.d), o.t, o.p].filter((x) => String(x).trim() && String(x).trim() !== '0').length; if (filled !== 2) throw new Error('Fill in exactly two of distance, time and pace, and leave the third blank.');
    let d = String(o.d).trim() && +o.d !== 0 ? +o.d : undefined, t = o.t.trim() ? pt(o.t, 'Time') : undefined, p = o.p.trim() ? pt(o.p, 'Pace') : undefined;
    if (d !== undefined && !(d > 0)) throw new Error('Distance must be above zero.'); if (d === undefined) d = (t / p) * 100; else if (t === undefined) t = (d / 100) * p; else p = (t / d) * 100;
    const ds = o.unit === 'm' ? [50, 100, 200, 400, 800, 1500, 1900, 3800] : [25, 50, 100, 200, 500, 1000, 1650], u = o.unit;
    return `Distance: ${R(d, 1)} ${u}\nTime: ${hms(t)}\nPace: ${hms(p)} per 100 ${u}\n\nAt this pace:\n` + ds.map((x) => `  ${String(x).padStart(5)} ${u}: ${hms((x / 100) * p)}`).join('\n') + '\n\nEven pace only: turns, starts and tiring are not modelled.';
  },
});

// ---- ovulation
T.push({
  id: 'ovulation-calculator', cat: HEA, title: 'Ovulation Calculator (Fertile Window by Cycle Length)',
  desc: 'Estimate ovulation and the fertile window for the next cycles from the first day of your last period, cycle length and luteal phase length.',
  inputs: 0, sample: '', opts: [txt('lmp', 'First day of last period (YYYY-MM-DD)', '2025-03-03'), num('cycle', 'Average cycle length (days)', 28), num('luteal', 'Luteal phase (days)', 14), num('n', 'Cycles to show', 3)],
  run: (_i, o) => {
    const l = pdate(o.lmp, 'Last period date'), c = Math.round(+o.cycle), lu = Math.round(+o.luteal), n = Math.max(1, Math.min(12, Math.round(+o.n))); if (c < 21 || c > 45) throw new Error('Cycle length should be 21 to 45 days.'); if (lu < 8 || lu > 18 || lu >= c - 5) throw new Error('Luteal phase should be 8 to 18 days and shorter than the cycle.');
    const rows = []; for (let i = 0; i < n; i++) { const s = addD(l, c * i), ov = addD(s, c - lu); rows.push(`Cycle ${i + 1}: period ${iso(s)}   fertile ${iso(addD(ov, -5))} to ${iso(addD(ov, 1))}   ovulation ~${iso(ov)}   next period ${iso(addD(s, c))}`); }
    return rows.join('\n') + '\n\nMethod: ovulation is estimated at cycle length minus luteal phase days after the period starts. The fertile window is the 5 days before ovulation, the day itself and the day after. Cycles vary, so this is a calendar estimate and not a method of contraception. Tests or a doctor give better answers if you are trying to conceive.' + NOTE;
  },
});

// ---- BAC
T.push({
  id: 'blood-alcohol-content-estimator', cat: HEA, title: 'Blood Alcohol Content Estimator (Widmark Formula)',
  desc: 'Estimate blood alcohol concentration and the time until it reaches zero from drinks, body weight, sex and hours since the first drink, using the Widmark formula.',
  inputs: 1, labels: ['Drinks, one per line: [count x] volume_ml abv_percent'], sample: '2 x 330 5\n150 12\n40 40', placeholder: ['2 x 330 5   (two 330 ml beers at 5%)'],
  opts: [UNITS, sel('sex', 'Sex', ['Male', 'Female']), num('w', 'Body weight (kg or lb)', 75), num('hours', 'Hours since the first drink', 2), num('beta', 'Elimination (g/dL per hour)', 0.015)],
  run: ([inp], o) => {
    pos(o, 'w'); if (!(+o.hours >= 0)) throw new Error('Hours cannot be negative.'); let g = 0, n = 0;
    for (const raw of String(inp).split('\n').map((x) => x.trim()).filter(Boolean)) { const m = /^(?:(\d+(?:\.\d+)?)\s*x\s*)?(\d+(?:\.\d+)?)\s*(?:ml)?\s+(\d+(?:\.\d+)?)\s*%?$/i.exec(raw); if (!m) throw new Error(`Cannot read "${raw}". Use 2 x 330 5 (count, ml, percent).`); g += (m[1] ? +m[1] : 1) * +m[2] * (+m[3] / 100) * 0.789; n += m[1] ? +m[1] : 1; }
    const kg = toKg(o, +o.w), r = o.sex === 'Male' ? 0.68 : 0.55, peak = (g / (r * kg * 1000)) * 100, now = Math.max(0, peak - +o.beta * +o.hours), hrs0 = peak / +o.beta;
    return `Drinks: ${n}   pure alcohol: ${R(g, 1)} g  (${R(g / 10, 1)} units of 10 g)\nWidmark factor r: ${r}\nPeak BAC if all absorbed at once: ${R(peak, 3)} g/dL  (${R(peak * 10, 2)} per mille)\nEstimated BAC now (${o.hours} h): ${R(now, 3)} g/dL  (${R(now * 10, 2)} per mille)\nAbout ${Math.floor(Math.max(0, hrs0 - +o.hours))} h ${Math.round((Math.max(0, hrs0 - +o.hours) % 1) * 60)} min until zero\n\nBAC = A / (r x W) - beta x t, with alcohol at 0.789 g/ml. r of 0.68 (men) and 0.55 (women) and beta near 0.015 to 0.018 g/dL per hour are typical published values (NIST quotes r 0.68 and 0.55, beta 0.017 to 0.020), but individuals vary a lot, and food, medication and drinking pace change the result. This is not a safe-to-drive test. Never drive after drinking, and legal limits differ by country.` ;
  },
});

// ---- caffeine
const CAF = { coffee: [113, 247], 'black tea': [71, 71], 'green tea': [37, 37], cola: [23, 83], 'soft drink': [23, 83], 'energy drink': [41, 246], decaf: [3, 22] };
T.push({
  id: 'caffeine-intake-calculator', cat: HEA, title: 'Caffeine Intake Calculator (Daily Total vs 400 mg)',
  desc: 'Add up the coffee, tea, cola and energy drinks you had and compare the range with the 400 mg a day FDA figure for healthy adults.',
  inputs: 1, labels: ['Drinks, one per line: name count   (coffee, black tea, green tea, cola, energy drink, decaf) or: mg 80 count'], sample: 'coffee 2\nblack tea 1\nenergy drink 1\nmg 65 1', placeholder: ['coffee 2'],
  run: ([inp]) => {
    let lo = 0, hi = 0; const out = [];
    for (const raw of String(inp).split('\n').map((x) => x.trim()).filter(Boolean)) { const m = /^(.*?)\s+(\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?))?$/.exec(raw.toLowerCase()); if (!m) throw new Error(`Cannot read "${raw}". Use: coffee 2`); let a, b, c, name; if (m[1] === 'mg') { if (m[3] === undefined) throw new Error('Use: mg 80 2 (80 mg, 2 times).'); a = b = +m[2]; c = +m[3]; name = `${m[2]} mg item`; } else { const e = CAF[m[1]]; if (!e) throw new Error(`Unknown drink "${m[1]}". Known: ${Object.keys(CAF).join(', ')}, or mg.`); [a, b] = e; c = +m[2]; name = m[1]; } lo += a * c; hi += b * c; out.push(`  ${c} x ${name}: ${a === b ? a : a + ' to ' + b} mg each`); }
    if (!out.length) throw new Error('Add at least one drink.'); const v = hi <= 400 ? 'within' : lo > 400 ? 'above' : 'maybe';
    return out.join('\n') + `\n\nTotal: ${lo === hi ? lo : lo + ' to ' + hi} mg\nFDA figure for most healthy adults: 400 mg a day. Your total is ${v === 'within' ? 'within the figure' : v === 'above' ? 'above it' : 'possibly above it'}.\n\nPer-drink amounts are FDA ranges for a 12 fl oz (355 ml) serving, so a small espresso or a large mug will differ. Decaf is 2 to 15 mg per 8 oz, scaled to about 3 to 22 mg for 12 oz. Sensitivity varies. If you are pregnant, breastfeeding, have a heart condition or take medication, ask a health professional for your own limit.`;
  },
});

// ---- child height
T.push({
  id: 'child-height-predictor', cat: HEA, title: 'Child Adult Height Predictor (Mid-Parental Height)',
  desc: 'Estimate a child\'s adult height from the parents\' heights with the mid-parental method, with the usual range of 8.5 cm either side.',
  inputs: 0, sample: '', opts: [sel('units', 'Units', ['cm', 'inches']), sel('sex', 'Child sex', ['Boy', 'Girl']), num('mom', 'Mother\'s height', 165), num('dad', 'Father\'s height', 180)],
  run: (_i, o) => {
    pos(o, 'mom', 'dad'); const k = o.units === 'cm' ? 1 : 2.54, m = +o.mom * k, f = +o.dad * k, t = (m + f + (o.sex === 'Boy' ? 13 : -13)) / 2, cv = (x) => (o.units === 'cm' ? R(x, 1) + ' cm' : R(x / 2.54, 1) + ' in');
    return `Predicted adult height: ${cv(t)}\nLikely range: ${cv(t - 8.5)} to ${cv(t + 8.5)}\n\nFormula (Tanner): boys = (mother + father + 13 cm) / 2, girls = (mother + father - 13 cm) / 2. The 8.5 cm band is about two standard deviations (MSD Manual), so most children land inside it. It is a population estimate. Nutrition, health and the child\'s own growth pattern matter more than this number, and a doctor can judge growth far better.` + NOTE;
  },
});

// ---- smoking
const MILES = [[0, 'Heart rate starts to drop (within minutes).'], [1, 'Blood nicotine falls to zero (24 hours).'], [3, 'Blood carbon monoxide falls to non-smoker levels (several days).'], [30, 'Coughing and shortness of breath start to decrease (1 to 12 months).'], [365, 'Heart attack risk drops sharply (1 to 2 years).'], [1095, 'Added coronary heart disease risk is roughly halved (3 to 6 years).'], [1825, 'Added risk of mouth, throat and voice box cancers is halved, and stroke risk decreases (5 to 10 years).'], [3650, 'Added lung cancer risk is halved (10 to 15 years); bladder, oesophagus and kidney cancer risks decrease.'], [5475, 'Coronary heart disease risk is near that of a non-smoker (15 years).'], [7300, 'Mouth, throat, voice box and pancreatic cancer risks approach non-smoker levels (20 years).']];
T.push({
  id: 'smoking-savings-calculator', cat: HEA, title: 'Quit Smoking Savings Calculator (Money Saved and Milestones)',
  desc: 'Show the money saved and cigarettes not smoked since your quit date, plus the health milestones the CDC lists, from cigarettes per day and pack price.',
  inputs: 0, sample: '', opts: [txt('quit', 'Quit date (YYYY-MM-DD)', '2025-01-01'), txt('asof', 'Count up to (blank = today)', '2025-07-01'), num('cpd', 'Cigarettes per day before quitting', 15), num('price', 'Price of a pack', 12), num('pack', 'Cigarettes per pack', 20), txt('cur', 'Currency symbol', '€')],
  run: (_i, o) => {
    pos(o, 'cpd', 'price', 'pack'); const q = pdate(o.quit, 'Quit date'), e = o.asof.trim() ? pdate(o.asof, 'End date') : today(), days = Math.round((e - q) / 864e5); if (days < 0) throw new Error('The quit date is after the end date.');
    const cig = days * +o.cpd, money = (cig / +o.pack) * +o.price, c = o.cur.trim();
    return `Smoke-free: ${days} days\nCigarettes not smoked: ${Math.round(cig).toLocaleString('en')}\nMoney saved: ${c}${Math.round(money).toLocaleString('en')}  (${c}${R((+o.cpd / +o.pack) * +o.price * 30.4375, 0)} a month, ${c}${R((+o.cpd / +o.pack) * +o.price * 365.25, 0)} a year)\n\nMilestones (CDC "benefits of quitting", measured against continuing to smoke):\n` + MILES.map(([d, s]) => `  ${days >= d ? '[reached]' : '[ahead]  '} ${s}`).join('\n') + '\n\nSavings assume the same price throughout. Quit lines and your doctor can help if you are struggling.';
  },
});

// ---- timers (custom UI)
const hhmmss = (s) => { s = Math.max(0, Math.ceil(s)); return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, '0')).join(':'); };
const el = (tag, attrs = {}, kids = []) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') e.textContent = v; else if (k === 'class') e.className = v; else e.setAttribute(k, v); } for (const c of [].concat(kids)) e.append(c); return e; };
const field = (label, input) => { const l = el('label', { style: 'display:grid;gap:.25rem;font-size:.9rem' }, [label, input]); return l; };
const BTN = 'padding:.5rem 1rem;border:1px solid currentColor;border-radius:.4rem;background:transparent;color:inherit;font:inherit;cursor:pointer';

T.push({
  id: 'fasting-timer', cat: HEA, title: 'Intermittent Fasting Timer (Live 16:8 Countdown)',
  desc: 'A live timer for fasting and eating windows such as 16:8: shows which window you are in, the time left, and when you can eat next.',
  custom: true, dom: true,
  render(root) {
    const plan = el('select', { id: 'fp' }, ['16:8', '14:10', '18:6', '20:4', '12:12', 'OMAD (23:1)'].map((x) => el('option', { text: x }))), start = el('input', { id: 'fs', type: 'time', value: '12:00' }), clock = el('div', { style: 'font-size:2.5rem;font-variant-numeric:tabular-nums;font-weight:600', 'aria-hidden': 'true' }), phase = el('p', { role: 'status', style: 'font-size:1.1rem' }), next = el('p', { 'aria-live': 'off' });
    root.append(el('div', { style: 'display:grid;gap:1rem;max-width:30rem' }, [field('Plan (fasting hours : eating hours)', plan), field('Eating window starts at (every day)', start), el('div', {}, [el('div', { class: 'muted', text: 'Time left in this window' }), clock]), phase, next, el('p', { class: 'muted', text: 'The timer runs in this tab only and keeps nothing. The clock is not announced every second; the status line changes only when a window changes. Fasting is not right for everyone, ask a doctor if you have a condition, take medication, are pregnant or have had an eating disorder.' })]));
    let last = '';
    const tick = () => {
      const p = plan.value, [f, e] = p.startsWith('OMAD') ? [23, 1] : p.split(':').map(Number), m = /^(\d\d):(\d\d)$/.exec(start.value); if (!m) { phase.textContent = 'Pick a start time.'; return; }
      const n = new Date(), mins = n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60, s0 = +m[1] * 60 + +m[2]; let rel = (((mins - s0) % 1440) + 1440) % 1440; const eating = rel < e * 60, left = (eating ? e * 60 - rel : 1440 - rel) * 60, at = new Date(n.getTime() + left * 1000);
      clock.textContent = hhmmss(left); const msg = eating ? `Eating window (${e} h). Fasting starts at ${at.toTimeString().slice(0, 5)}.` : `Fasting window (${f} h). You can eat from ${at.toTimeString().slice(0, 5)}.`;
      if (msg !== last) { phase.textContent = eating ? 'Eating window' : 'Fasting window'; last = msg; } next.textContent = msg + ` ${Math.round((1 - left / ((eating ? e : f) * 3600)) * 100)}% of this window done.`;
    };
    tick(); const id = setInterval(tick, 1000); plan.onchange = start.onchange = () => { last = ''; tick(); };
    return () => clearInterval(id);
  },
});

export const intervalPlan = (c) => { // pure: list of {name, secs, round, set}
  const ph = []; if (c.prep > 0) ph.push({ name: 'Get ready', secs: c.prep, round: 0, set: 0 });
  for (let s = 1; s <= c.sets; s++) { for (let r = 1; r <= c.rounds; r++) { ph.push({ name: 'Work', secs: c.work, round: r, set: s }); if (c.rest > 0 && r < c.rounds) ph.push({ name: 'Rest', secs: c.rest, round: r, set: s }); } if (s < c.sets && c.setRest > 0) ph.push({ name: 'Rest between sets', secs: c.setRest, round: c.rounds, set: s }); }
  return ph;
};
T.push({
  id: 'workout-interval-timer', cat: HEA, title: 'Workout Interval Timer (HIIT and Tabata with Beeps)',
  desc: 'Set work and rest seconds, rounds and sets for HIIT or Tabata. The timer beeps at each change and the last three seconds, and shows the round on screen.',
  custom: true, dom: true,
  render(root) {
    const n = (id, v) => el('input', { id, type: 'number', min: '0', value: String(v), style: 'width:6rem' }), f = { prep: n('iv-prep', 10), work: n('iv-work', 20), rest: n('iv-rest', 10), rounds: n('iv-rounds', 8), sets: n('iv-sets', 1), setRest: n('iv-setrest', 60) };
    const mute = el('input', { id: 'iv-mute', type: 'checkbox' }), big = el('div', { style: 'font-size:3.5rem;font-weight:700;font-variant-numeric:tabular-nums', 'aria-hidden': 'true', text: '00:00' }), name = el('p', { role: 'status', style: 'font-size:1.25rem;font-weight:600' }), info = el('p', { class: 'muted' }), bStart = el('button', { type: 'button', style: BTN, text: 'Start' }), bReset = el('button', { type: 'button', style: BTN, text: 'Reset' }), pTab = el('button', { type: 'button', style: BTN, text: 'Tabata preset (20 s / 10 s, 8 rounds)' });
    const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.75rem;max-width:40rem' }, [field('Get ready (s)', f.prep), field('Work (s)', f.work), field('Rest (s)', f.rest), field('Rounds per set', f.rounds), field('Sets', f.sets), field('Rest between sets (s)', f.setRest)]);
    root.append(el('div', { style: 'display:grid;gap:1rem' }, [grid, el('label', {}, [mute, ' Mute beeps']), el('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap' }, [bStart, bReset, pTab]), big, name, info, el('p', { class: 'muted', text: 'Beeps use your browser audio and need a click on Start first. Colour changes are slow and steady, nothing flashes. The screen reader status line updates once per phase, not every second.' })]));
    let ph = [], i = 0, t0 = 0, left = 0, timer = 0, running = false, ac = null, lastBeep = -1;
    const cfg = () => { const g = (k) => Math.max(0, Math.floor(+f[k].value) || 0); return { prep: g('prep'), work: g('work'), rest: g('rest'), rounds: Math.max(1, g('rounds')), sets: Math.max(1, g('sets')), setRest: g('setRest') }; };
    const beep = (hz, ms) => { if (mute.checked) return; try { ac = ac || new AudioContext(); const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = hz; g.gain.value = 0.15; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + ms / 1000); } catch { /* no audio */ } };
    const show = () => { const p = ph[i]; if (!p) return; big.textContent = hhmmss(left).slice(3); root.style.background = p.name === 'Work' ? 'color-mix(in srgb, #16a34a 14%, transparent)' : p.name === 'Get ready' ? '' : 'color-mix(in srgb, #2563eb 14%, transparent)'; info.textContent = p.round ? `Set ${p.set} of ${ph.at(-1).set}, round ${p.round} of ${cfg().rounds}` : ''; };
    const enter = () => { const p = ph[i]; left = p.secs; t0 = performance.now(); lastBeep = -1; name.textContent = p.name + (p.round && p.name === 'Work' ? ` ${p.round}` : ''); beep(p.name === 'Work' ? 880 : 440, 300); show(); };
    const stop = () => { clearInterval(timer); running = false; bStart.textContent = 'Start'; };
    const tick = () => { const el2 = (performance.now() - t0) / 1000; left = ph[i].secs - el2; const w = Math.ceil(left); if (w <= 3 && w > 0 && w !== lastBeep) { lastBeep = w; beep(660, 120); } if (left <= 0) { if (i + 1 >= ph.length) { stop(); big.textContent = '00:00'; name.textContent = 'Done. Well done!'; info.textContent = ''; beep(990, 600); root.style.background = ''; return; } i++; enter(); } else show(); };
    bStart.onclick = () => { if (running) { stop(); const e = ph[i].secs - left; ph[i] = { ...ph[i], secs: left }; bStart.textContent = 'Resume'; return; } try { ac = ac || new AudioContext(); ac.resume(); } catch { /* ignore */ } if (!ph.length || bStart.textContent === 'Start') { ph = intervalPlan(cfg()); i = 0; if (!ph.length) return; enter(); } else { t0 = performance.now(); } running = true; bStart.textContent = 'Pause'; timer = setInterval(tick, 100); };
    bReset.onclick = () => { stop(); ph = []; i = 0; big.textContent = '00:00'; name.textContent = 'Reset.'; info.textContent = ''; root.style.background = ''; };
    pTab.onclick = () => { f.prep.value = 10; f.work.value = 20; f.rest.value = 10; f.rounds.value = 8; f.sets.value = 1; };
    return () => clearInterval(timer);
  },
});

// ======================= image helpers =======================
const u8f = async (f) => new Uint8Array(await f.arrayBuffer());
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('This browser could not encode the image.'))), type, q));
const bmpOf = async (f) => { try { return await createImageBitmap(f); } catch { throw new Error(`${f.name || 'The file'} is not an image this browser can read.`); } };
const bn = (f) => (f.name || 'image').replace(/\.[^.]+$/, '');
const need = (files, n = 1) => { if (!files || files.length < n) throw new Error(n > 1 ? `Choose at least ${n} images.` : 'Choose an image first.'); return files; };
const rgba = (src, w, h) => { const c = mk(w, h), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0, c.width, c.height); return x.getImageData(0, 0, c.width, c.height); };
const kb = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? R(n / 1024, 1) + ' KB' : R(n / 1048576, 2) + ' MB');
const hexColor = (s, what = 'Colour') => { const t = String(s).trim(); if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) throw new Error(`${what} must be a hex colour such as #ffffff.`); return t; };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b, c = 0) => { c = ~c; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const be32 = (n) => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const zipStore = (entries) => { // entries: [{ name, data: Uint8Array }] -> Uint8Array (stored, UTF-8 names)
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  for (const e of entries) { const nm = enc.encode(e.name), c = crc32(e.data), h = new Uint8Array(30 + nm.length), v = new DataView(h.buffer); v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x800, true); v.setUint16(10, 0, true); v.setUint16(12, 0x21, true); v.setUint32(14, c, true); v.setUint32(18, e.data.length, true); v.setUint32(22, e.data.length, true); v.setUint16(26, nm.length, true); h.set(nm, 30); parts.push(h, e.data);
    const ch = new Uint8Array(46 + nm.length), w = new DataView(ch.buffer); w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x800, true); w.setUint16(14, 0x21, true); w.setUint32(16, c, true); w.setUint32(20, e.data.length, true); w.setUint32(24, e.data.length, true); w.setUint16(28, nm.length, true); w.setUint32(42, off, true); ch.set(nm, 46); cen.push(ch); off += h.length + e.data.length; }
  const cd = cat(...cen), end = new Uint8Array(22), v = new DataView(end.buffer); v.setUint32(0, 0x06054b50, true); v.setUint16(8, entries.length, true); v.setUint16(10, entries.length, true); v.setUint32(12, cd.length, true); v.setUint32(16, off, true);
  return cat(...parts, cd, end);
};
const zipFile = (entries, name) => new File([zipStore(entries)], name, { type: 'application/zip' });
const uniq = (names) => { const seen = new Map(); return names.map((n) => { const k = seen.get(n) || 0; seen.set(n, k + 1); return k ? n.replace(/(\.[^.]*)?$/, `-${k + 1}$1`) : n; }); };

// ======================= JPEG + EXIF + IPTC helpers =======================
const asc = (b, p, n) => { let s = ''; for (let i = 0; i < n && p + i < b.length; i++) s += String.fromCharCode(b[p + i]); return s; };
function jpegSegs(b) {
  if (!(b[0] === 0xff && b[1] === 0xd8)) throw new Error('This tool needs JPEG files (.jpg or .jpeg).');
  const segs = []; let p = 2;
  while (p < b.length - 1) {
    if (b[p] !== 0xff) { p++; continue; } const m = b[p + 1]; if (m === 0xff) { p++; continue; }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { p += 2; continue; }
    if (m === 0xda || m === 0xd9) { segs.push({ m, s: p, e: b.length, d: p }); break; }
    const len = (b[p + 2] << 8) | b[p + 3]; if (len < 2 || p + 2 + len > b.length) throw new Error('The JPEG is damaged (bad segment length).'); segs.push({ m, s: p, e: p + 2 + len, d: p + 4 }); p += 2 + len;
  }
  return segs;
}
const TS = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
function tiffAt(b, t) {
  const le = b[t] === 0x49 && b[t + 1] === 0x49; if (!(le || (b[t] === 0x4d && b[t + 1] === 0x4d))) throw new Error('The EXIF block is damaged.');
  const r16 = (p) => (le ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]), r32 = (p) => (le ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0 : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0);
  const w16 = (p, v) => { if (le) { b[p] = v & 255; b[p + 1] = v >> 8; } else { b[p] = v >> 8; b[p + 1] = v & 255; } }, w32 = (p, v) => { for (let i = 0; i < 4; i++) b[p + (le ? i : 3 - i)] = (v >>> (8 * i)) & 255; };
  const ifd = (off) => { const p0 = t + off; if (p0 + 2 > b.length) return { entries: [], next: 0, p0 }; const n = Math.min(r16(p0), 500), entries = []; for (let i = 0; i < n; i++) { const p = p0 + 2 + 12 * i; if (p + 12 > b.length) break; const type = r16(p + 2), cnt = r32(p + 4), size = (TS[type] || 0) * cnt, vp = size <= 4 ? p + 8 : t + r32(p + 8); entries.push({ tag: r16(p), type, cnt, size, p, vp, ok: vp + size <= b.length }); } return { entries, next: p0 + 2 + 12 * n + 4 <= b.length ? r32(p0 + 2 + 12 * n) : 0, p0, n }; };
  return { t, le, r16, r32, w16, w32, ifd, ifd0: r32(t + 4) };
}
function exifOf(b) { for (const s of jpegSegs(b)) if (s.m === 0xe1 && asc(b, s.d, 6) === 'Exif\0\0') return { seg: s, T: tiffAt(b, s.d + 6) }; return null; }
const tagOf = (T, off, tag) => T.ifd(off).entries.find((e) => e.tag === tag);
const subIfd = (T, tag) => { const e = tagOf(T, T.ifd0, tag); return e ? T.r32(e.p + 8) : 0; };
const rat = (T, vp) => { const d = T.r32(vp + 4); return d ? T.r32(vp) / d : 0; };
function readGps(b) {
  const x = exifOf(b); if (!x) return null; const T = x.T, go = subIfd(T, 0x8825); if (!go) return null; const g = Object.fromEntries(T.ifd(go).entries.map((e) => [e.tag, e]));
  const dms = (e) => (e && e.cnt === 3 && e.ok ? rat(T, e.vp) + rat(T, e.vp + 8) / 60 + rat(T, e.vp + 16) / 3600 : null), ref = (e) => (e ? String.fromCharCode(b[e.p + 8]) : '');
  let lat = dms(g[2]), lon = dms(g[4]); if (lat === null || lon === null) return null; if (ref(g[1]) === 'S') lat = -lat; if (ref(g[3]) === 'W') lon = -lon;
  const alt = g[6] && g[6].ok ? rat(T, g[6].vp) * (g[5] && b[g[5].p + 8] === 1 ? -1 : 1) : null;
  const eo = subIfd(T, 0x8769), dt = eo ? tagOf(T, eo, 0x9003) : null, mm = tagOf(T, T.ifd0, 0x0110);
  return { lat, lon, alt, date: dt && dt.ok ? asc(b, dt.vp, 19) : '', model: mm && mm.ok ? asc(b, mm.vp, mm.cnt).replace(/\0.*$/, '') : '' };
}
function stripGps(b0) {
  const b = b0.slice(), x = exifOf(b), res = { bytes: b, gps: 0, xmp: 0 };
  if (x) { const T = x.T, e = tagOf(T, T.ifd0, 0x8825); if (e) { const go = T.r32(e.p + 8), g = T.ifd(go); for (const en of g.entries) if (en.size > 4 && en.ok) b.fill(0, en.vp, en.vp + en.size); res.gps = g.entries.length; b.fill(0, g.p0, g.p0 + 2 + 12 * g.entries.length); } }
  for (const s of jpegSegs(b)) if (s.m === 0xe1 && asc(b, s.d, 29) === 'http://ns.adobe.com/xap/1.0/\0') { let t = asc(b, s.d, s.e - s.d); const blank = (m) => { res.xmp++; return ' '.repeat(m.length); }; t = t.replace(/<exif:GPS[A-Za-z]+[^>]*>[\s\S]*?<\/exif:GPS[A-Za-z]+>/g, blank).replace(/exif:GPS[A-Za-z]+\s*=\s*"[^"]*"/g, blank); for (let i = 0; i < t.length; i++) b[s.d + i] = t.charCodeAt(i); }
  return res;
}
const sniffNote = (f) => `${f.name}: `;
const JPG = { accept: 'image/jpeg,.jpg,.jpeg', multiple: true };

T.push({
  id: 'gps-location-stripper', cat: IMG, title: 'GPS Location Stripper for JPEG (Keep Other Metadata)',
  desc: 'Delete only the GPS location tags from JPEG photos and keep camera, lens, exposure and date metadata. The image data is not re-encoded.',
  inputs: 0, sample: '', file: JPG,
  run: async (_i, _o, files) => {
    const out = [], notes = [];
    for (const f of need(files)) { try { const r = stripGps(await u8f(f)); out.push(new File([r.bytes], `${bn(f)}-no-gps.jpg`, { type: 'image/jpeg' })); notes.push(`${f.name}: ${r.gps ? `removed ${r.gps} GPS tag(s)` : 'no GPS tags in the EXIF block'}${r.xmp ? `, blanked ${r.xmp} XMP GPS field(s)` : ''}`); } catch (e) { notes.push(`${f.name}: skipped (${e.message})`); } }
    return { blob: out, text: notes.join('\n') + '\n\nOnly the GPS block is zeroed in place: the pixels, the other EXIF fields and the file size stay the same. The tool looks at the EXIF block and the XMP GPS fields. Maker notes, a thumbnail inside the file, or sidecar files may carry their own location in some cameras. Check the result in the EXIF viewer before you share it, or use the full EXIF remover when in doubt.' };
  },
});

T.push({
  id: 'photo-gps-export', cat: IMG, title: 'Photo GPS Coordinates Export (CSV, GeoJSON, KML, Map Links)',
  desc: 'Read the GPS position, altitude and date from many geotagged JPEGs and list them as a table, CSV, GeoJSON or KML, with an OpenStreetMap link per photo. Nothing is loaded from a map server.',
  inputs: 0, sample: '', file: JPG, opts: [sel('fmt', 'Output', ['table', 'CSV', 'GeoJSON', 'KML'])],
  run: async (_i, o, files) => {
    const rows = [], skipped = [];
    for (const f of need(files)) { try { const g = readGps(await u8f(f)); if (g) rows.push({ name: f.name, ...g }); else skipped.push(f.name); } catch (e) { skipped.push(`${f.name} (${e.message})`); } }
    if (!rows.length) throw new Error('None of the files has GPS tags.');
    const L = (r) => `https://www.openstreetmap.org/?mlat=${r.lat.toFixed(6)}&mlon=${r.lon.toFixed(6)}#map=16/${r.lat.toFixed(5)}/${r.lon.toFixed(5)}`; let out;
    if (o.fmt === 'CSV') out = 'file,latitude,longitude,altitude_m,date,camera,map\n' + rows.map((r) => [r.name, r.lat.toFixed(6), r.lon.toFixed(6), r.alt === null ? '' : R(r.alt, 1), r.date, r.model, L(r)].map((v) => (/[",\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v)).join(',')).join('\n');
    else if (o.fmt === 'GeoJSON') out = JSON.stringify({ type: 'FeatureCollection', features: rows.map((r) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: r.alt === null ? [+r.lon.toFixed(6), +r.lat.toFixed(6)] : [+r.lon.toFixed(6), +r.lat.toFixed(6), R(r.alt, 1)] }, properties: { name: r.name, date: r.date, camera: r.model } })) }, null, 2);
    else if (o.fmt === 'KML') out = '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>\n' + rows.map((r) => `<Placemark><name>${esc(r.name)}</name><description>${esc(r.date)}</description><Point><coordinates>${r.lon.toFixed(6)},${r.lat.toFixed(6)}${r.alt === null ? '' : ',' + R(r.alt, 1)}</coordinates></Point></Placemark>`).join('\n') + '\n</Document></kml>';
    else out = rows.map((r) => `${r.name}\n  ${r.lat.toFixed(6)}, ${r.lon.toFixed(6)}${r.alt === null ? '' : `  altitude ${R(r.alt, 1)} m`}${r.date ? '  taken ' + r.date : ''}${r.model ? '  ' + r.model : ''}\n  ${L(r)}`).join('\n');
    return out + (skipped.length ? `\n\nNo GPS data (not listed): ${skipped.join(', ')}` : '') + (o.fmt === 'table' ? '\n\nThe links open OpenStreetMap only if you click them. This page loads no map tiles, so the positions never leave your browser.' : '');
  },
});

// ---- orientation (lossless rotate by tag)
const OR_M = { 1: [1, 0, 0, 1], 2: [-1, 0, 0, 1], 3: [-1, 0, 0, -1], 4: [1, 0, 0, -1], 5: [0, 1, 1, 0], 6: [0, -1, 1, 0], 7: [0, -1, -1, 0], 8: [0, 1, -1, 0] };
const mmul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3]];
const ACTS = { 'rotate 90 clockwise': [0, -1, 1, 0], 'rotate 90 counter-clockwise': [0, 1, -1, 0], 'rotate 180': [-1, 0, 0, -1], 'mirror left-right': [-1, 0, 0, 1], 'mirror top-bottom': [1, 0, 0, -1] };
const orientAfter = (cur, act) => { const m = mmul(ACTS[act], OR_M[cur]); return +Object.keys(OR_M).find((k) => OR_M[k].every((v, i) => v === m[i])); };
function setOrientation(b, val) { // returns { bytes, was }
  const x = exifOf(b);
  if (!x) { const tiff = new Uint8Array([0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, val, 0, 0, 0, 0, 0, 0, 0, 0]), body = cat(new TextEncoder().encode('Exif\0\0'), tiff), seg = cat(new Uint8Array([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255]), body); const segs = jpegSegs(b); let at = 2; if (segs[0] && segs[0].m === 0xe0) at = segs[0].e; return { bytes: cat(b.slice(0, at), seg, b.slice(at)), was: 1 }; }
  const { seg, T } = x, e = tagOf(T, T.ifd0, 0x0112);
  if (e) { const was = T.r16(e.p + 8); T.w16(e.p + 8, val); return { bytes: b, was }; }
  const i0 = T.ifd(T.ifd0), raw = i0.entries.map((en) => b.slice(en.p, en.p + 12)); const ne = new Uint8Array(12); const nv = new DataView(ne.buffer); nv.setUint16(0, 0x0112, T.le); nv.setUint16(2, 3, T.le); nv.setUint32(4, 1, T.le); nv.setUint16(8, val, T.le);
  const tagOfRaw = (r) => (T.le ? r[0] | (r[1] << 8) : (r[0] << 8) | r[1]); const ents = [...raw, ne].sort((p, q) => tagOfRaw(p) - tagOfRaw(q));
  const tiffLen = seg.e - seg.d - 6, pad = tiffLen % 2, newOff = tiffLen + pad, ifd = new Uint8Array(2 + 12 * ents.length + 4); const dv = new DataView(ifd.buffer); dv.setUint16(0, ents.length, T.le); ents.forEach((r, i) => ifd.set(r, 2 + 12 * i)); dv.setUint32(2 + 12 * ents.length, i0.next, T.le);
  const add = pad + ifd.length, out = cat(b.slice(0, seg.e), new Uint8Array(pad), ifd, b.slice(seg.e)), len = seg.e - seg.s - 2 + add; if (len > 65535) throw new Error('The EXIF block is too large to extend.');
  out[seg.s + 2] = len >> 8; out[seg.s + 3] = len & 255; const T2 = tiffAt(out, seg.d + 6); T2.w32(T2.t + 4, newOff); return { bytes: out, was: 1 };
}
T.push({
  id: 'lossless-jpeg-rotator', cat: IMG, title: 'Lossless JPEG Rotator (Change EXIF Orientation, No Re-encoding)',
  desc: 'Fix sideways phone photos by changing the EXIF orientation tag only. The compressed image data is untouched, so there is no quality loss.',
  inputs: 0, sample: '', file: JPG, opts: [sel('act', 'Turn the picture', Object.keys(ACTS)), sel('mode', 'Set orientation tag', ['relative to the current tag', 'reset to normal (1)'])],
  run: async (_i, o, files) => {
    const out = [], notes = [];
    for (const f of need(files)) { try { const b = await u8f(f), x = exifOf(b), e = x && tagOf(x.T, x.T.ifd0, 0x0112), cur = e ? x.T.r16(e.p + 8) : 1; if (cur < 1 || cur > 8) throw new Error('unknown orientation value ' + cur); const nv = o.mode.startsWith('reset') ? 1 : orientAfter(cur, o.act), r = setOrientation(b.slice(), nv); out.push(new File([r.bytes], `${bn(f)}-rotated.jpg`, { type: 'image/jpeg' })); notes.push(`${f.name}: orientation ${cur} -> ${nv}`); } catch (e) { notes.push(`${f.name}: skipped (${e.message})`); } }
    return { blob: out, text: notes.join('\n') + '\n\nOnly the orientation tag changes. Browsers, phones and most editors obey it. Some older software and some upload forms ignore it and show the picture as stored. For those, rotate with the Image Rotate & Flip tool (this re-encodes the picture).' };
  },
});

// ---- date shift
const exDate = (s) => { const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(s); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN; };
const exFmt = (ms) => { const d = new Date(ms), p = (n, l = 2) => String(n).padStart(l, '0'); return `${p(d.getUTCFullYear(), 4)}:${p(d.getUTCMonth() + 1)}:${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`; };
const dateEntries = (b) => { const x = exifOf(b); if (!x) return []; const T = x.T, out = [], i0 = tagOf(T, T.ifd0, 0x0132); if (i0) out.push(i0); const eo = subIfd(T, 0x8769); if (eo) for (const t of [0x9003, 0x9004]) { const e = tagOf(T, eo, t); if (e) out.push(e); } return out.filter((e) => e.type === 2 && e.cnt === 20 && e.ok); };
const parseOffset = (s) => { const m = /^\s*([+-])?\s*(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?\s*$/i.exec(s); if (!m || !(m[2] || m[3] || m[4] || m[5])) throw new Error('Offset must look like +6h, -1d 2h 30m or +45m.'); return (m[1] === '-' ? -1 : 1) * (((+m[2] || 0) * 24 + (+m[3] || 0)) * 3600 + (+m[4] || 0) * 60 + (+m[5] || 0)) * 1000; };
T.push({
  id: 'photo-date-fixer', cat: IMG, title: 'Photo Date Fixer (Shift EXIF Capture Time in Batch)',
  desc: 'Shift the capture time of JPEG photos by an offset such as +6h, or set the first photo to a date and move the rest by the same amount, so a camera with a wrong clock or time zone sorts correctly.',
  inputs: 0, sample: '', file: JPG, opts: [sel('mode', 'Mode', ['shift by an offset', 'set the earliest photo to a date']), txt('off', 'Offset (+6h, -1d 2h 30m)', '+1h'), txt('to', 'New date for the earliest photo (YYYY-MM-DD HH:MM:SS)', '2024-06-01 09:00:00')],
  run: async (_i, o, files) => {
    const list = []; for (const f of need(files)) { const b = await u8f(f); let ents = []; try { ents = dateEntries(b); } catch { /* not a JPEG */ } list.push({ f, b, ents }); }
    let delta; if (o.mode.startsWith('shift')) delta = parseOffset(o.off); else { const m = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)$/.exec(o.to.trim()); if (!m) throw new Error('Date must look like 2024-06-01 09:00:00.'); const tgt = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]); const all = list.flatMap((l) => l.ents.filter((e) => e.tag === 0x9003 || e.tag === 0x0132).slice(0, 1).map((e) => exDate(asc(l.b, e.vp, 19)))).filter(Number.isFinite); if (!all.length) throw new Error('No photo has a capture date to anchor on.'); delta = tgt - Math.min(...all); }
    const out = [], notes = [];
    for (const l of list) { if (!l.ents.length) { notes.push(`${l.f.name}: skipped (no EXIF date tags)`); continue; } const b = l.b.slice(); const ch = []; for (const e of l.ents) { const v = exDate(asc(b, e.vp, 19)); if (!Number.isFinite(v)) continue; const s = exFmt(v + delta); for (let i = 0; i < 19; i++) b[e.vp + i] = s.charCodeAt(i); ch.push(s); } out.push(new File([b], `${bn(l.f)}-dated.jpg`, { type: 'image/jpeg' })); notes.push(`${l.f.name}: now ${ch[0] || 'unchanged'}`); }
    return { blob: out, text: `Shift: ${delta >= 0 ? '+' : '-'}${hms(Math.abs(delta) / 1000)} (h:mm:ss)\n` + notes.join('\n') + '\n\nChanges DateTime, DateTimeOriginal and DateTimeDigitized in place. EXIF stores local time without a zone, so the tool shifts the written clock time and does not know about time zones or daylight saving. GPS time stamps, XMP dates and the file modified time are not changed.' };
  },
});

// ---- IPTC / XMP writer
const dec8 = (u) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(u); } catch { return new TextDecoder('latin1').decode(u); } };
const IPTC_F = [['title', 2, 5], ['headline', 2, 105], ['caption', 2, 120], ['keywords', 2, 25], ['creator', 2, 80], ['credit', 2, 110], ['source', 2, 115], ['copyright', 2, 116]];
function readIptc(b, segs) {
  const out = { seg: null, res: [], ds: [] };
  for (const s of segs) if (s.m === 0xed && asc(b, s.d, 14) === 'Photoshop 3.0\0') {
    out.seg = s; let p = s.d + 14;
    while (p + 12 <= s.e && asc(b, p, 4) === '8BIM') { const id = (b[p + 4] << 8) | b[p + 5], nl = b[p + 6], nt = (1 + nl) % 2 ? nl + 2 : nl + 1, sp = p + 6 + nt, size = ((b[sp] << 24) | (b[sp + 1] << 16) | (b[sp + 2] << 8) | b[sp + 3]) >>> 0, dp = sp + 4; if (dp + size > s.e) break; out.res.push({ id, name: b.slice(p + 6, p + 6 + nt), data: b.slice(dp, dp + size) }); p = dp + size + (size % 2); }
    for (const r of out.res) if (r.id === 0x0404) { const d = r.data; let q = 0; while (q + 5 <= d.length && d[q] === 0x1c) { const len = (d[q + 3] << 8) | d[q + 4]; if (len & 0x8000) throw new Error('Extended IPTC records are not supported.'); out.ds.push({ rec: d[q + 1], ds: d[q + 2], data: d.slice(q + 5, q + 5 + len) }); q += 5 + len; } }
  }
  return out;
}
const iptcText = (ds) => IPTC_F.map(([k, r, n]) => { const v = ds.filter((x) => x.rec === r && x.ds === n).map((x) => dec8(x.data)); return v.length ? `  ${k}: ${v.join(k === 'keywords' ? ', ' : ' | ')}` : null; }).filter(Boolean);
const xmlEsc = (s) => esc(s).replace(/'/g, '&apos;');
function xmpPacket(f) {
  const li = (v) => `<rdf:li>${xmlEsc(v)}</rdf:li>`, alt = (v) => `<rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(v)}</rdf:li></rdf:Alt>`; let d = '';
  if (f.creator) d += `<dc:creator><rdf:Seq>${li(f.creator)}</rdf:Seq></dc:creator>`; if (f.copyright) d += `<dc:rights>${alt(f.copyright)}</dc:rights>`; if (f.title) d += `<dc:title>${alt(f.title)}</dc:title>`; if (f.caption) d += `<dc:description>${alt(f.caption)}</dc:description>`;
  if (f.keywords.length) d += `<dc:subject><rdf:Bag>${f.keywords.map(li).join('')}</rdf:Bag></dc:subject>`; if (f.copyright || f.license) d += '<xmpRights:Marked>True</xmpRights:Marked>'; if (f.license) d += `<xmpRights:WebStatement>${xmlEsc(f.license)}</xmpRights:WebStatement><cc:license rdf:resource="${xmlEsc(f.license)}"/>`;
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:cc="http://creativecommons.org/ns#">${d}</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
}
const app = (m, body) => { if (body.length + 2 > 65535) throw new Error('A metadata block is too large for one JPEG segment.'); return cat(new Uint8Array([0xff, m, (body.length + 2) >> 8, (body.length + 2) & 255]), body); };
function writeIptc(b, f, clear, xmpOn) {
  const segs = jpegSegs(b), sos = segs.find((s) => s.m === 0xda || s.m === 0xd9); if (!sos) throw new Error('No image data found.');
  const old = readIptc(b, segs), head = segs.filter((s) => s !== sos && !(s === old.seg));
  let ds = clear ? [] : old.ds.slice(); const cs = ds.find((x) => x.rec === 1 && x.ds === 90);
  if (cs && !(cs.data.length === 3 && cs.data[0] === 0x1b && cs.data[1] === 0x25 && cs.data[2] === 0x47) && ds.some((x) => x.rec === 2)) throw new Error('The file has IPTC text in another character set. Tick "remove existing IPTC first" to replace it.');
  ds = ds.filter((x) => !(x.rec === 1 && x.ds === 90)); const te = new TextEncoder();
  for (const [k, r, n] of IPTC_F) { const v = k === 'keywords' ? f.keywords : f[k] ? [f[k]] : []; if (!v.length) continue; if (k !== 'keywords') ds = ds.filter((x) => !(x.rec === r && x.ds === n)); else ds = ds.filter((x) => !(x.rec === r && x.ds === n)); for (const s of v) ds.push({ rec: r, ds: n, data: te.encode(s) }); }
  ds.push({ rec: 1, ds: 90, data: new Uint8Array([0x1b, 0x25, 0x47]) }); const order = ds.map((x, i) => [x, i]).sort((p, q) => p[0].rec - q[0].rec || p[0].ds - q[0].ds || p[1] - q[1]).map((x) => x[0]);
  const iptc = cat(...order.map((x) => cat(new Uint8Array([0x1c, x.rec, x.ds, x.data.length >> 8, x.data.length & 255]), x.data)));
  const res = (clear ? [] : old.res).filter((r) => r.id !== 0x0404).concat([{ id: 0x0404, name: new Uint8Array([0, 0]), data: iptc }]).sort((p, q) => p.id - q.id);
  const body = cat(te.encode('Photoshop 3.0\0'), ...res.map((r) => cat(te.encode('8BIM'), new Uint8Array([r.id >> 8, r.id & 255]), r.name, be32(r.data.length), r.data, new Uint8Array(r.data.length % 2))));
  let lead = 0; while (lead < head.length && (head[lead].m === 0xe0 || head[lead].m === 0xe1)) lead++;
  const hasXmp = head.some((s) => s.m === 0xe1 && asc(b, s.d, 29) === 'http://ns.adobe.com/xap/1.0/\0'); const wantXmp = xmpOn && (f.creator || f.copyright || f.license || f.title || f.caption || f.keywords.length) && !hasXmp;
  const parts = [b.slice(0, 2), ...head.slice(0, lead).map((s) => b.slice(s.s, s.e)), app(0xed, body)]; if (wantXmp) parts.push(app(0xe1, cat(te.encode('http://ns.adobe.com/xap/1.0/\0'), te.encode(xmpPacket(f)))));
  parts.push(...head.slice(lead).map((s) => b.slice(s.s, s.e)), b.slice(sos.s));
  return { bytes: cat(...parts), xmp: wantXmp ? 'added' : hasXmp && xmpOn && (f.creator || f.copyright || f.license) ? 'existing XMP left unchanged' : '' };
}
T.push({
  id: 'iptc-copyright-metadata-editor', cat: IMG, title: 'IPTC Caption, Keywords and Copyright Editor for JPEG (Batch)',
  desc: 'Read and write the IPTC caption, keywords, creator and copyright notice in JPEG files, one set of fields for many photos, with an optional license link in XMP. Leave all fields empty to just read what is there.',
  inputs: 0, sample: '', file: JPG,
  opts: [txt('title', 'Title', ''), txt('headline', 'Headline', ''), txt('caption', 'Caption', ''), txt('keywords', 'Keywords (comma separated)', ''), txt('creator', 'Creator (by-line)', ''), txt('credit', 'Credit line', ''), txt('source', 'Source', ''), txt('copyright', 'Copyright notice', ''), txt('license', 'License URL (written to XMP)', ''), chk('xmp', 'Also write XMP, only when the file has none', true), chk('clear', 'Remove existing IPTC first', false)],
  run: async (_i, o, files) => {
    const f = { title: o.title.trim(), headline: o.headline.trim(), caption: o.caption.trim(), keywords: o.keywords.split(',').map((x) => x.trim()).filter(Boolean), creator: o.creator.trim(), credit: o.credit.trim(), source: o.source.trim(), copyright: o.copyright.trim(), license: o.license.trim() };
    const write = o.clear || Object.values(f).some((v) => (Array.isArray(v) ? v.length : v)); const out = [], notes = [];
    for (const file of need(files)) { try { const b = await u8f(file); if (!write) { const ds = readIptc(b, jpegSegs(b)).ds; const l = iptcText(ds); notes.push(`${file.name}: ${l.length ? '\n' + l.join('\n') : 'no IPTC fields'}`); continue; } const r = writeIptc(b, f, o.clear, o.xmp); out.push(new File([r.bytes], `${bn(file)}-meta.jpg`, { type: 'image/jpeg' })); notes.push(`${file.name}: written${r.xmp ? ', XMP ' + r.xmp : ''}`); } catch (e) { notes.push(`${file.name}: skipped (${e.message})`); } }
    const tail = write ? '\n\nEmpty fields keep what the file already has. Text is stored as UTF-8 and the file is marked as such. The picture data is copied byte for byte. The old IPTC size limits (for example 32 bytes for the creator, 128 for the copyright) were recalled from the IPTC IIM specification and are not enforced here, so some software may cut very long values. Copyright metadata states a claim; it does not stop anyone copying a picture, and a stripped file loses it.' : '\n\nFill in any field to write it to every file you chose.';
    return { blob: out.length ? out : undefined, text: notes.join('\n') + tail };
  },
});

// ---- ICC profile inspector
async function inflate(u) { const s = new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate')); return new Uint8Array(await new Response(s).arrayBuffer()); }
async function findIcc(b) {
  if (b[0] === 0xff && b[1] === 0xd8) { const ch = []; for (const s of jpegSegs(b)) if (s.m === 0xe2 && asc(b, s.d, 12) === 'ICC_PROFILE\0') ch.push({ n: b[s.d + 12], d: b.slice(s.d + 14, s.e) }); if (!ch.length) return { kind: 'JPEG' }; ch.sort((p, q) => p.n - q.n); return { kind: 'JPEG', icc: cat(...ch.map((c) => c.d)) }; }
  if (b[0] === 0x89 && asc(b, 1, 3) === 'PNG') { let p = 8; const r = { kind: 'PNG', srgb: false }; while (p + 8 <= b.length) { const len = ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0, ty = asc(b, p + 4, 4); if (ty === 'sRGB') r.srgb = true; if (ty === 'iCCP') { const nm = asc(b, p + 8, 80), z = nm.indexOf('\0'); r.icc = await inflate(b.slice(p + 8 + z + 2, p + 8 + len)); r.name = nm.slice(0, z); } if (ty === 'IDAT') break; p += 12 + len; } return r; }
  if (asc(b, 0, 4) === 'RIFF' && asc(b, 8, 4) === 'WEBP') { let p = 12; while (p + 8 <= b.length) { const ty = asc(b, p, 4), len = b[p + 4] | (b[p + 5] << 8) | (b[p + 6] << 16) | (b[p + 7] << 24); if (ty === 'ICCP') return { kind: 'WebP', icc: b.slice(p + 8, p + 8 + len) }; p += 8 + len + (len % 2); } return { kind: 'WebP' }; }
  throw new Error('Use a JPEG, PNG or WebP file.');
}
function parseIcc(u) {
  if (u.length < 132 || asc(u, 36, 4) !== 'acsp') throw new Error('The embedded profile is not a valid ICC profile.');
  const dv = new DataView(u.buffer, u.byteOffset, u.length), n = dv.getUint32(128), tags = {}; for (let i = 0; i < n && 132 + 12 * i + 12 <= u.length; i++) { const p = 132 + 12 * i; tags[asc(u, p, 4)] = { off: dv.getUint32(p + 4), size: dv.getUint32(p + 8) }; }
  const text = (t) => { const g = tags[t]; if (!g || g.off + 12 > u.length) return ''; const ty = asc(u, g.off, 4); if (ty === 'desc') { const c = dv.getUint32(g.off + 8); return asc(u, g.off + 12, Math.max(0, c - 1)); } if (ty === 'text') return asc(u, g.off + 8, g.size - 9); if (ty === 'mluc') { const c = dv.getUint32(g.off + 8); if (!c) return ''; const len = dv.getUint32(g.off + 20), off = dv.getUint32(g.off + 24); let s = ''; for (let k = 0; k < len; k += 2) s += String.fromCharCode(dv.getUint16(g.off + off + k)); return s; } return ''; };
  const xyz = (t) => { const g = tags[t]; if (!g || g.off + 20 > u.length) return null; return [0, 1, 2].map((k) => dv.getInt32(g.off + 8 + 4 * k) / 65536); };
  const trc = (t) => { const g = tags[t]; if (!g) return ''; const ty = asc(u, g.off, 4); if (ty === 'para') return `parametric curve (type ${dv.getUint16(g.off + 8)})`; if (ty === 'curv') { const c = dv.getUint32(g.off + 8); return c === 0 ? 'linear' : c === 1 ? `gamma ${R(dv.getUint16(g.off + 12) / 256, 2)}` : `table of ${c} points`; } return ty; };
  const intents = ['perceptual', 'relative colorimetric', 'saturation', 'absolute colorimetric'];
  return { size: dv.getUint32(0), version: `${u[8]}.${u[9] >> 4}.${u[9] & 15}`, cls: asc(u, 12, 4), space: asc(u, 16, 4).trim(), pcs: asc(u, 20, 4).trim(), date: [0, 1, 2].map((k) => dv.getUint16(24 + 2 * k)).join('-'), intent: intents[dv.getUint32(64)] || '?', desc: text('desc'), copyright: text('cprt'), wp: xyz('wtpt'), prim: ['rXYZ', 'gXYZ', 'bXYZ'].map(xyz), trc: ['rTRC', 'gTRC', 'bTRC'].map(trc), lut: !!(tags.A2B0 || tags.B2A0), tags: Object.keys(tags) };
}
const SRGB_D50 = [[0.4360747, 0.2225045, 0.0139322], [0.3850649, 0.7168786, 0.0971045], [0.1430804, 0.0606169, 0.7141733]];
T.push({
  id: 'icc-profile-inspector', cat: IMG, title: 'ICC Colour Profile Inspector for JPEG, PNG and WebP',
  desc: 'See whether an image carries an embedded ICC colour profile and read its name, colour space, version, white point, primaries and curves, with a check against sRGB.',
  inputs: 0, sample: '', file: { accept: 'image/jpeg,image/png,image/webp', multiple: true },
  run: async (_i, _o, files) => {
    const notes = [];
    for (const f of need(files)) { try { const r = await findIcc(await u8f(f)); if (!r.icc) { notes.push(`${f.name} (${r.kind}): no embedded ICC profile${r.srgb ? ' (PNG sRGB chunk present: declared sRGB)' : '. Browsers treat it as sRGB.'}`); continue; } const p = parseIcc(r.icc); const same = p.prim.every((v, i) => v && v.every((x, k) => Math.abs(x - SRGB_D50[i][k]) < 0.005)); const L = [`${f.name} (${r.kind}): profile "${p.desc || r.name || 'unnamed'}"`, `  Size ${kb(p.size)}, ICC version ${p.version}, class ${p.cls}, colour space ${p.space}, connection space ${p.pcs}, rendering intent ${p.intent}`, `  ${p.lut ? 'LUT based' : 'Matrix and curves'}${p.trc[0] ? '; red curve: ' + p.trc[0] : ''}`]; if (p.wp) L.push(`  White point XYZ: ${p.wp.map((x) => R(x, 4)).join(', ')}`); if (p.prim[0]) L.push(`  Primaries XYZ (R, G, B): ${p.prim.map((v) => v && v.map((x) => R(x, 3)).join(' ')).join(' | ')}`); if (p.copyright) L.push(`  Copyright: ${p.copyright}`); L.push(p.prim[0] ? (same ? '  Primaries match sRGB: nothing to convert for the web.' : '  Primaries differ from sRGB: a wider or different gamut. Browsers convert it, but some apps and uploads assume sRGB and will show duller or shifted colours. Convert to sRGB in an image editor before sharing if colours matter.') : '  LUT based profile: gamut is not checked here.'); notes.push(L.join('\n')); } catch (e) { notes.push(`${f.name}: ${e.message}`); } }
    return notes.join('\n\n') + '\n\nThis tool only reads the profile. It does not convert pixels to sRGB, because a correct conversion needs a colour management engine that is not included. The sRGB check compares the profile primaries with the standard sRGB values (D50 adapted) within a small tolerance.';
  },
});

// ======================= canvas image tools =======================
const IMGF = { accept: 'image/*', multiple: true }, IMG1 = { accept: 'image/*', multiple: false };
const flat = (bmp, bg, w = bmp.width, h = bmp.height) => { const c = mk(w, h), x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height); return c; };
const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());
const EXTS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
const MIMES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const rr = (x, a, b, w, h, r) => { r = Math.max(0, Math.min(r, w / 2, h / 2)); x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
const q01 = (o, k = 'quality') => Math.min(1, Math.max(0.05, (+o[k] || 80) / 100));
const b64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

T.push({
  id: 'png-to-jpg-converter', cat: IMG, title: 'PNG to JPG Converter with Background Colour',
  desc: 'Convert PNG, WebP or other images to JPEG and choose the colour that fills transparent areas, since JPEG has no transparency. Set the quality and convert many files at once.',
  inputs: 0, sample: '', dom: true, file: IMGF, opts: [txt('bg', 'Background for transparent areas (hex)', '#ffffff'), num('quality', 'JPEG quality (5-100)', 90), chk('zip', 'Put several files in one ZIP', false)],
  run: async (_i, o, files) => {
    const bg = hexColor(o.bg, 'Background'), out = [], notes = [];
    for (const f of need(files)) { const bmp = await bmpOf(f), b = await toBlob(flat(bmp, bg), 'image/jpeg', q01(o)); out.push(new File([b], `${bn(f)}.jpg`, { type: 'image/jpeg' })); notes.push(`${f.name}: ${bmp.width}x${bmp.height}, ${kb(f.size)} -> ${kb(b.size)}`); }
    const z = o.zip && out.length > 1; return { blob: z ? zipFile(await Promise.all(uniq(out.map((x) => x.name)).map(async (name, i) => ({ name, data: await bytesOf(out[i]) }))), 'jpg-images.zip') : out, text: notes.join('\n') };
  },
});

T.push({
  id: 'batch-image-optimizer', cat: IMG, title: 'Batch Image Optimizer (Compress Many Images to a ZIP)',
  desc: 'Drop in many photos, pick one quality and a maximum width, and download the compressed JPEG or WebP versions in one ZIP. Files that would get bigger can keep the original.',
  inputs: 0, sample: '', dom: true, file: IMGF, opts: [sel('fmt', 'Output format', ['jpeg', 'webp']), num('quality', 'Quality (5-100)', 78), num('maxw', 'Maximum width in px (0 = keep size)', 1920), txt('bg', 'Background for transparent areas (JPEG only)', '#ffffff'), chk('keep', 'Keep the original file when the result is not smaller', true)],
  run: async (_i, o, files) => {
    const bg = hexColor(o.bg, 'Background'), type = MIMES[o.fmt], ents = [], rows = []; let a = 0, z = 0;
    for (const f of need(files)) { const bmp = await bmpOf(f), k = +o.maxw > 0 ? Math.min(1, +o.maxw / bmp.width) : 1, w = Math.round(bmp.width * k), h = Math.round(bmp.height * k), c = o.fmt === 'jpeg' ? flat(bmp, bg, w, h) : (() => { const cv = mk(w, h); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); return cv; })(), b = await toBlob(c, type, q01(o));
      const useOrig = o.keep && b.size >= f.size && k === 1; ents.push({ name: useOrig ? f.name : `${bn(f)}.${EXTS[b.type] || o.fmt}`, data: useOrig ? await u8f(f) : await bytesOf(b) }); const sz = useOrig ? f.size : b.size; a += f.size; z += sz; rows.push(`${f.name}: ${kb(f.size)} -> ${kb(sz)}${useOrig ? ' (original kept)' : ''}`); }
    const names = uniq(ents.map((e) => e.name)); ents.forEach((e, i) => (e.name = names[i]));
    return { blob: zipFile(ents, 'optimized-images.zip'), text: rows.join('\n') + `\n\nTotal ${kb(a)} -> ${kb(z)} (${a ? R((1 - z / a) * 100, 1) : 0}% smaller). Metadata such as EXIF is dropped by re-encoding.` };
  },
});

T.push({
  id: 'thumbnail-batch-generator', cat: IMG, title: 'Thumbnail Batch Generator (Uniform Square Thumbnails in a ZIP)',
  desc: 'Make same-size thumbnails from many images by centre-cropping or padding them to a square or any fixed size, then download them together in a ZIP.',
  inputs: 0, sample: '', dom: true, file: IMGF, opts: [num('w', 'Thumbnail width (px)', 256), num('h', 'Thumbnail height (px)', 256), sel('mode', 'Fit', ['centre crop', 'pad (keep whole image)']), txt('bg', 'Padding colour (hex)', '#ffffff'), sel('fmt', 'Format', ['jpeg', 'png', 'webp']), num('quality', 'Quality (5-100)', 82)],
  run: async (_i, o, files) => {
    const W = Math.round(+o.w), H = Math.round(+o.h); if (!(W >= 8 && H >= 8 && W <= 4096 && H <= 4096)) throw new Error('Use a size from 8 to 4096 px.'); const bg = hexColor(o.bg, 'Padding colour'), ents = [];
    for (const f of need(files)) { const bmp = await bmpOf(f), c = mk(W, H), x = c.getContext('2d'); if (o.fmt === 'jpeg' || o.mode.startsWith('pad')) { x.fillStyle = bg; x.fillRect(0, 0, W, H); } const s = o.mode.startsWith('pad') ? Math.min(W / bmp.width, H / bmp.height) : Math.max(W / bmp.width, H / bmp.height), dw = bmp.width * s, dh = bmp.height * s; x.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh); const b = await toBlob(c, MIMES[o.fmt], q01(o)); ents.push({ name: `${bn(f)}-${W}x${H}.${EXTS[b.type] || o.fmt}`, data: await bytesOf(b) }); }
    const names = uniq(ents.map((e) => e.name)); ents.forEach((e, i) => (e.name = names[i]));
    return { blob: zipFile(ents, `thumbnails-${W}x${H}.zip`), text: `${ents.length} thumbnail(s) of ${W}x${H}px (${o.mode}).` };
  },
});

T.push({
  id: 'image-border-frame-adder', cat: IMG, title: 'Image Border and Frame Adder (Solid, Rounded, Polaroid)',
  desc: 'Add a solid border, rounded corners or a polaroid-style frame with a thick bottom edge to a picture and download the framed image.',
  inputs: 0, sample: '', dom: true, file: IMG1, opts: [sel('style', 'Style', ['solid', 'rounded', 'polaroid']), num('b', 'Border width (px)', 40), txt('color', 'Border colour (hex)', '#ffffff'), num('r', 'Corner radius (px, rounded style)', 40), txt('outer', 'Outside colour (hex or "transparent")', 'transparent'), sel('fmt', 'Format', ['png', 'jpeg'])],
  run: async (_i, o, files) => {
    const f = need(files)[0], bmp = await bmpOf(f), b = Math.max(0, Math.min(1000, Math.round(+o.b))), col = hexColor(o.color, 'Border colour'), outer = o.outer.trim().toLowerCase() === 'transparent' ? null : hexColor(o.outer, 'Outside colour'), pol = o.style === 'polaroid', bot = pol ? b * 3.5 : b;
    const W = bmp.width + 2 * b, H = bmp.height + b + bot, c = mk(W, H), x = c.getContext('2d'), bgc = outer || (o.fmt === 'jpeg' ? '#ffffff' : null); if (bgc) { x.fillStyle = bgc; x.fillRect(0, 0, W, H); }
    if (o.style === 'rounded') { const r = Math.max(0, +o.r || 0); x.fillStyle = col; rr(x, 0, 0, W, H, r + b); x.fill(); x.save(); rr(x, b, b, bmp.width, bmp.height, r); x.clip(); x.drawImage(bmp, b, b); x.restore(); } else { x.fillStyle = col; x.fillRect(0, 0, W, H); x.drawImage(bmp, b, b); if (pol) { x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 1; x.strokeRect(b + 0.5, b + 0.5, bmp.width - 1, bmp.height - 1); } }
    const blob = await toBlob(c, MIMES[o.fmt], 0.92); return { blob: new File([blob], `${bn(f)}-framed.${o.fmt === 'jpeg' ? 'jpg' : 'png'}`, { type: blob.type }), text: `${W}x${H}px (${o.style}). Rounded corners are transparent in PNG unless you choose an outside colour.` };
  },
});

// ---- format comparator
const psnr = (a, b) => { let s = 0; const n = a.length / 4; for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) { const d = a[i + k] - b[i + k]; s += d * d; } const mse = s / (n * 3); return mse === 0 ? Infinity : 10 * Math.log10(65025 / mse); };
T.push({
  id: 'image-format-comparator', cat: IMG, title: 'Image Format Comparator (JPEG, WebP, AVIF and PNG Side by Side)',
  desc: 'Encode one image as JPEG, WebP, AVIF and PNG at the quality you choose and compare file size and PSNR, with the results shown next to each other. AVIF shows only if your browser can encode it.',
  inputs: 0, sample: '', dom: true, file: IMG1, opts: [num('quality', 'Quality for JPEG, WebP and AVIF (5-100)', 75), num('maxw', 'Scale down to this width first (0 = no)', 0)],
  run: async (_i, o, files) => {
    const f = need(files)[0], bmp = await bmpOf(f), k = +o.maxw > 0 ? Math.min(1, +o.maxw / bmp.width) : 1, w = Math.round(bmp.width * k), h = Math.round(bmp.height * k), base = flat(bmp, '#ffffff', w, h), ref = base.getContext('2d').getImageData(0, 0, w, h).data, rows = [], cells = [];
    for (const [label, type] of [['JPEG', 'image/jpeg'], ['WebP', 'image/webp'], ['AVIF', 'image/avif'], ['PNG', 'image/png']]) {
      const b = await toBlob(base, type, q01(o)).catch(() => null); if (!b || b.type !== type) { rows.push(`${label}: not available (this browser cannot encode it)`); continue; }
      const dc = await bmpOf(b), p = psnr(ref, rgba(dc, w, h).data), url = `data:${type};base64,${b64(await bytesOf(b))}`; rows.push(`${label}: ${kb(b.size)}${type === 'image/png' ? ' (lossless)' : `, PSNR ${R(p, 1)} dB`}`);
      cells.push(`<figure style="margin:0"><img src="${url}" alt="${label} version" style="max-width:100%;height:auto;border:1px solid #8886"><figcaption>${label}: ${kb(b.size)}${type === 'image/png' ? '' : `, PSNR ${R(p, 1)} dB`}</figcaption></figure>`);
    }
    const html = `<!doctype html><meta charset="utf-8"><title>Format comparison</title><body style="margin:12px;font:14px system-ui;color-scheme:light dark"><p>Original: ${esc(f.name)}, ${bmp.width}x${bmp.height}, ${kb(f.size)}</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">${cells.join('')}</div>`;
    return { html, text: `Original: ${f.name}, ${bmp.width}x${bmp.height}, ${kb(f.size)}\n` + rows.join('\n') + '\n\nPSNR compares the re-encoded pixels with the original on a white background; higher is closer (above 40 dB is very close, below 30 dB shows visible loss). It does not measure how the eye sees it, so judge the pictures too. Transparency is flattened to white for the comparison.' };
  },
});

// ---- histogram
T.push({
  id: 'image-histogram-viewer', cat: IMG, title: 'Image Histogram Viewer (RGB and Luminance, Clipping Check)',
  desc: 'Draw the red, green, blue and luminance histograms of a photo and see how many pixels are crushed to black or blown to white, to judge exposure.',
  inputs: 0, sample: '', dom: true, file: IMG1, opts: [sel('scale', 'Vertical scale', ['linear', 'square root'])],
  run: async (_i, o, files) => {
    const f = need(files)[0], bmp = await bmpOf(f), k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height)), d = rgba(bmp, bmp.width * k, bmp.height * k).data, H = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]; let n = 0, lo = 0, hi = 0, sum = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; n++; const y = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]); H[0][d[i]]++; H[1][d[i + 1]]++; H[2][d[i + 2]]++; H[3][y]++; sum += y; if (y <= 4) lo++; if (y >= 251) hi++; }
    if (!n) throw new Error('The image is fully transparent.'); const c = mk(768, 300), x = c.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, 768, 300); const cols = ['rgba(255,60,60,0.55)', 'rgba(60,220,60,0.55)', 'rgba(80,120,255,0.55)', 'rgba(255,255,255,0.8)'], fx = (v) => (o.scale === 'linear' ? v : Math.sqrt(v)), mx = Math.max(...H.flatMap((a) => Array.from(a.slice(1, 255)))); 
    x.strokeStyle = '#444'; for (let g = 1; g < 4; g++) { x.beginPath(); x.moveTo(g * 192, 0); x.lineTo(g * 192, 300); x.stroke(); }
    H.forEach((a, ci) => { x.fillStyle = cols[ci]; x.strokeStyle = cols[ci]; x.beginPath(); x.moveTo(0, 300); for (let i = 0; i < 256; i++) x.lineTo(i * 3, 300 - 290 * Math.min(1, fx(a[i]) / fx(mx))); x.lineTo(765, 300); x.closePath(); if (ci < 3) x.fill(); else x.stroke(); });
    c.setAttribute('aria-label', `Histogram of ${f.name}: red, green, blue and luminance, 0 to 255`);
    const p = (v) => R((v / n) * 100, 1), mean = sum / n, verdict = [lo / n > 0.05 ? 'many shadows are clipped to black' : '', hi / n > 0.05 ? 'many highlights are clipped to white' : '', mean < 80 ? 'the picture is dark overall' : mean > 175 ? 'the picture is bright overall' : ''].filter(Boolean);
    return { canvas: c, text: `${f.name}: ${bmp.width}x${bmp.height}\nMean luminance: ${R(mean, 1)} of 255\nShadows clipped (luminance 0-4): ${p(lo)}% of pixels\nHighlights clipped (251-255): ${p(hi)}% of pixels\nReading: ${verdict.length ? verdict.join('; ') : 'no obvious clipping or strong bias'}\n\nLeft edge of the chart is black, right edge is white. Luminance uses Rec. 709 weights on the sRGB values. Large clipped areas may be intended (a white background), so look at the picture as well.` };
  },
});

// ---- error level analysis
T.push({
  id: 'error-level-analyzer', cat: IMG, title: 'Error Level Analysis (ELA) for JPEG Photos',
  desc: 'Recompress a JPEG at a fixed quality and show the amplified difference, so areas that were edited or pasted in may stand out. A hint for review, not proof of tampering.',
  inputs: 0, sample: '', dom: true, file: IMG1, opts: [num('q', 'Recompression quality (50-98)', 90), num('amp', 'Amplification (1-60)', 20)],
  run: async (_i, o, files) => {
    const f = need(files)[0], bmp = await bmpOf(f), q = Math.max(50, Math.min(98, +o.q || 90)) / 100, amp = Math.max(1, Math.min(60, +o.amp || 20)), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k), base = flat(bmp, '#fff', w, h), a = base.getContext('2d').getImageData(0, 0, w, h), re = await bmpOf(await toBlob(base, 'image/jpeg', q)), b = rgba(re, w, h), c = mk(w, h), out = new ImageData(w, h); let tot = 0, mx = 0;
    for (let i = 0; i < a.data.length; i += 4) { let m = 0; for (let j = 0; j < 3; j++) { const d = Math.abs(a.data[i + j] - b.data[i + j]); out.data[i + j] = Math.min(255, d * amp); m = Math.max(m, d); } out.data[i + 3] = 255; tot += m; mx = Math.max(mx, m); }
    c.getContext('2d').putImageData(out, 0, 0); c.setAttribute('aria-label', `Error level analysis of ${f.name}`);
    return { canvas: c, text: `${f.name}: ${w}x${h}${k < 1 ? ' (scaled down)' : ''}\nRecompressed at quality ${Math.round(q * 100)}, difference x${amp}.\nMean error ${R(tot / (w * h), 2)}, maximum ${mx} (of 255).\n\nHow to read it: a photo saved once at one quality tends to show a fairly even error. A region that was pasted from another image or saved at a different quality can look brighter or darker than its surroundings. Sharp edges, text, saturated colours and noise also glow, and screenshots, PNGs and images that were resized or re-saved many times give misleading maps. This is a heuristic for a second look. It cannot prove that an image is real or fake.` };
  },
});

// ---- device framer
const DEVS = ['phone', 'tablet', 'laptop', 'browser window'];
T.push({
  id: 'screenshot-device-framer', cat: IMG, title: 'Screenshot Device Framer (Phone, Tablet, Laptop, Browser Mockup)',
  desc: 'Place a screenshot inside a generic phone, tablet, laptop or browser window frame on a plain or transparent background and download it as a PNG.',
  inputs: 0, sample: '', dom: true, file: IMG1, opts: [sel('dev', 'Device', DEVS), txt('frame', 'Frame colour (hex)', '#1c1c1e'), txt('bg', 'Background (hex or "transparent")', '#e8edf5'), num('pad', 'Space around the device (px)', 60), chk('shadow', 'Soft shadow', true), txt('url', 'Address bar text (browser window)', 'example.com')],
  run: async (_i, o, files) => {
    const f = need(files)[0], bmp = await bmpOf(f), fc = hexColor(o.frame, 'Frame colour'), bgT = o.bg.trim().toLowerCase() === 'transparent', bg = bgT ? null : hexColor(o.bg, 'Background'), pad = Math.max(0, Math.round(+o.pad)), sw = bmp.width, sh = bmp.height, m = Math.round(Math.max(sw, sh) * (o.dev === 'phone' ? 0.035 : o.dev === 'tablet' ? 0.04 : 0.02)), top = o.dev === 'browser window' ? Math.round(Math.max(36, sw * 0.04)) : o.dev === 'phone' ? m : m, side = o.dev === 'browser window' ? 2 : m, bottom = o.dev === 'laptop' ? m : o.dev === 'browser window' ? 2 : m, base = o.dev === 'laptop' ? Math.round(sw * 0.045) : 0;
    const dw = sw + 2 * side, dh = sh + top + bottom + base, wide = o.dev === 'laptop' ? Math.round(sw * 0.12) : 0, W = dw + 2 * pad + 2 * wide, H = dh + 2 * pad, c = mk(W, H), x = c.getContext('2d'), ox = pad + wide, oy = pad; if (bg) { x.fillStyle = bg; x.fillRect(0, 0, W, H); }
    const rad = o.dev === 'phone' ? Math.round(sw * 0.1) : o.dev === 'tablet' ? Math.round(sw * 0.045) : o.dev === 'laptop' ? Math.round(sw * 0.02) : Math.round(sw * 0.01);
    x.save(); if (o.shadow) { x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = pad * 0.5; x.shadowOffsetY = pad * 0.2; } x.fillStyle = fc; rr(x, ox, oy, dw, dh - base, rad); x.fill(); x.restore();
    x.save(); rr(x, ox + side, oy + top, sw, sh, Math.max(0, rad - m)); x.clip(); x.drawImage(bmp, ox + side, oy + top); x.restore();
    if (o.dev === 'phone') { x.fillStyle = fc; rr(x, ox + dw / 2 - sw * 0.14, oy + top + sw * 0.02, sw * 0.28, sw * 0.07, sw * 0.035); x.fill(); }
    if (o.dev === 'browser window') { x.fillStyle = '#f2f2f4'; rr(x, ox, oy, dw, top, rad); x.fill(); x.fillRect(ox, oy + top / 2, dw, top / 2); [['#ff5f57', 1], ['#febc2e', 2], ['#28c840', 3]].forEach(([cl, i]) => { x.fillStyle = cl; x.beginPath(); x.arc(ox + top * 0.5 * i + top * 0.05, oy + top / 2, top * 0.14, 0, 7); x.fill(); }); x.fillStyle = '#ffffff'; rr(x, ox + top * 2.2, oy + top * 0.2, dw - top * 2.8, top * 0.6, top * 0.3); x.fill(); x.fillStyle = '#555'; x.font = `${Math.round(top * 0.34)}px system-ui, sans-serif`; x.textBaseline = 'middle'; x.fillText(o.url.slice(0, 80), ox + top * 2.6, oy + top / 2); x.strokeStyle = '#0002'; x.lineWidth = 2; rr(x, ox, oy, dw, dh, rad); x.stroke(); }
    if (o.dev === 'laptop') { x.fillStyle = '#b9bcc4'; x.beginPath(); x.moveTo(ox - wide, oy + dh - base); x.lineTo(ox + dw + wide, oy + dh - base); x.lineTo(ox + dw + wide - base * 0.2, oy + dh); x.lineTo(ox - wide + base * 0.2, oy + dh); x.closePath(); x.fill(); x.fillStyle = '#8e919a'; rr(x, ox + dw / 2 - wide * 0.7, oy + dh - base, wide * 1.4, base * 0.4, base * 0.2); x.fill(); }
    c.setAttribute('aria-label', `${o.dev} frame around ${f.name}`); const blob = await toBlob(c, 'image/png'); return { blob: new File([blob], `${bn(f)}-${o.dev.replace(' ', '-')}.png`, { type: 'image/png' }), text: `${W}x${H}px PNG. The frames are plain shapes, not copies of any real product.` };
  },
});

// ---- before / after slider
T.push({
  id: 'before-after-slider-maker', cat: IMG, title: 'Before and After Image Slider Maker (Embeddable HTML)',
  desc: 'Turn two images into a before and after comparison slider you can paste into a page. The code is one small block with a keyboard-operable range input and the images embedded as data URIs.',
  inputs: 0, sample: '', dom: true, file: { accept: 'image/*', multiple: true }, opts: [txt('alt1', 'Alt text for the first (before) image', 'Before'), txt('alt2', 'Alt text for the second (after) image', 'After'), num('maxw', 'Scale both images down to this width (0 = keep)', 1000), num('q', 'JPEG quality of the embedded images (30-95)', 80)],
  run: async (_i, o, files) => {
    const fs = need(files, 2); if (fs.length !== 2) throw new Error('Choose exactly two images: first the before image, then the after image.'); const [a, b] = await Promise.all(fs.map(bmpOf)), W = +o.maxw > 0 ? Math.min(a.width, +o.maxw) : a.width, H = Math.round((a.height * W) / a.width), q = Math.max(0.3, Math.min(0.95, (+o.q || 80) / 100));
    const enc = async (bm) => { const c = mk(W, H), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(bm, 0, 0, W, H); const bl = await toBlob(c, 'image/jpeg', q); return `data:image/jpeg;base64,${b64(await bytesOf(bl))}`; };
    const [u1, u2] = [await enc(a), await enc(b)], id = 'ba' + Math.random().toString(36).slice(2, 7);
    const css = `#${id}{position:relative;max-width:${W}px;aspect-ratio:${W}/${H};overflow:hidden;--p:50%}#${id} img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}#${id} .top{clip-path:inset(0 calc(100% - var(--p)) 0 0)}#${id} .bar{position:absolute;top:0;bottom:0;left:var(--p);width:3px;background:#fff;box-shadow:0 0 4px #0008;transform:translateX(-50%)}#${id} input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize}#${id} input:focus-visible~.bar{outline:3px solid #2563eb}`;
    const body = (s1, s2) => `<div id="${id}"><img src="${s2}" alt="${esc(o.alt2)}"><img class="top" src="${s1}" alt="${esc(o.alt1)}"><input type="range" min="0" max="100" value="50" aria-label="Slide to compare before and after"><span class="bar" aria-hidden="true"></span></div>`;
    const js = `<script>(function(){var e=document.getElementById('${id}'),i=e.querySelector('input');i.addEventListener('input',function(){e.style.setProperty('--p',i.value+'%')})})();</script>`;
    const code = `<style>${css}</style>\n${body(u1, u2)}\n${js}`, prev = `<!doctype html><meta charset="utf-8"><body style="margin:12px;font:14px system-ui"><style>${css}</style>${body(u1, u2)}<p>Static preview (scripts do not run here). Paste the code into your page to get the working slider.</p>`;
    return { html: prev, text: code + `\n\n${R(code.length / 1024, 0)} KB of HTML. The images are embedded, so there are no extra requests. For large pictures host the two files and replace the data URIs with their URLs. The slider is an invisible range input over the pictures, so it works with a keyboard and screen readers. Set meaningful alt text for both images.` };
  },
});

// ======================= perceptual hashes =======================
const lumaOf = (d, n) => { const g = new Float64Array(n); for (let i = 0; i < n; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; return g; };
const bitsHex = (bits) => { let s = ''; for (let i = 0; i < bits.length; i += 4) s += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16); return s; };
function dct1(v) { const n = v.length, out = new Float64Array(n); for (let k = 0; k < n; k++) { let s = 0; for (let i = 0; i < n; i++) s += v[i] * Math.cos((Math.PI * (2 * i + 1) * k) / (2 * n)); out[k] = s; } return out; }
// g: grayscale already resized: dHash 9x8 (w x h), aHash 8x8, pHash 32x32
function hashFromGray(algo, g) {
  if (algo === 'dHash') { const b = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) b.push(g[y * 9 + x + 1] > g[y * 9 + x] ? 1 : 0); return bitsHex(b); }
  if (algo === 'aHash') { const m = g.reduce((a, v) => a + v, 0) / 64; return bitsHex(Array.from(g, (v) => (v > m ? 1 : 0))); }
  const N = 32, rows = []; for (let y = 0; y < N; y++) rows.push(dct1(g.slice(y * N, y * N + N))); const lo = []; const cols = []; for (let x = 0; x < 8; x++) { const col = new Float64Array(N); for (let y = 0; y < N; y++) col[y] = rows[y][x]; cols.push(dct1(col)); }
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) lo.push(cols[x][y]); const s = [...lo].sort((a, b) => a - b), med = (s[31] + s[32]) / 2; return bitsHex(lo.map((v) => (v > med ? 1 : 0)));
}
const SIZES = { dHash: [9, 8], aHash: [8, 8], pHash: [32, 32] };
const hamming = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } } return d; };
async function hashImage(f, algo) { const bmp = await bmpOf(f), [w, h] = SIZES[algo], c = mk(w, h), x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(bmp, 0, 0, w, h); return { hash: hashFromGray(algo, lumaOf(x.getImageData(0, 0, w, h).data, w * h)), w: bmp.width, h: bmp.height }; }
const HASH_NOTE = 'Hashes are computed from a tiny grayscale copy (9x8 for dHash, 8x8 for aHash, 32x32 with a DCT for pHash) and compared by Hamming distance: the number of differing bits out of 64. Small distances mean similar pictures. The thresholds are rules of thumb, so review matches by eye. Heavy crops, rotations and mirrored copies are not matched.';
T.push({
  id: 'image-hash-comparator', cat: IMG, title: 'Image Hash Comparator (Perceptual pHash, dHash and aHash)',
  desc: 'Compute perceptual hashes for two or more images and compare them by Hamming distance to find near-duplicates, resized copies and re-compressed versions.',
  inputs: 0, sample: '', dom: true, file: IMGF, opts: [sel('algo', 'Hash', ['pHash', 'dHash', 'aHash']), num('thr', 'Near-duplicate if distance is at most (of 64 bits)', 8)],
  run: async (_i, o, files) => {
    const fs = need(files, 2); if (fs.length > 30) throw new Error('Use at most 30 images for the comparison table.'); const hs = []; for (const f of fs) hs.push({ f, ...(await hashImage(f, o.algo)) });
    const L = hs.map((h, i) => `#${i + 1} ${h.f.name}: ${o.algo} ${h.hash}  (${h.w}x${h.h}, ${kb(h.f.size)})`), pairs = []; for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) pairs.push([i, j, hamming(hs[i].hash, hs[j].hash)]); pairs.sort((a, b) => a[2] - b[2]);
    return L.join('\n') + '\n\nPairs, closest first:\n' + pairs.slice(0, 60).map(([i, j, d]) => `  #${i + 1} - #${j + 1}: distance ${d}${d === 0 ? ' (same hash)' : d <= +o.thr ? ' (near-duplicate, review)' : ''}`).join('\n') + '\n\n' + HASH_NOTE;
  },
});
T.push({
  id: 'duplicate-photo-finder', cat: IMG, title: 'Duplicate Photo Finder (Group Visually Similar Photos)',
  desc: 'Select a folder full of photos (select all files in the dialog) and group the ones that look alike, such as resized or re-saved copies, with a suggestion of which one to keep.',
  inputs: 0, sample: '', dom: true, file: IMGF, opts: [sel('algo', 'Hash', ['dHash', 'pHash', 'aHash']), num('thr', 'Group if distance is at most (of 64 bits)', 6)],
  run: async (_i, o, files) => {
    const fs = need(files, 2); if (fs.length > 600) throw new Error('Use at most 600 photos at a time.'); const hs = []; for (const f of fs) { try { hs.push({ f, ...(await hashImage(f, o.algo)) }); } catch { /* skip unreadable */ } }
    const par = hs.map((_, i) => i), find = (i) => (par[i] === i ? i : (par[i] = find(par[i]))); for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) if (hamming(hs[i].hash, hs[j].hash) <= +o.thr) par[find(j)] = find(i);
    const g = new Map(); hs.forEach((h, i) => { const r = find(i); g.set(r, [...(g.get(r) || []), h]); }); const groups = [...g.values()].filter((x) => x.length > 1);
    if (!groups.length) return `Checked ${hs.length} photos with ${o.algo}: no groups at distance ${o.thr} or less.\n\n` + HASH_NOTE;
    return `${groups.length} group(s) among ${hs.length} photos (${o.algo}, distance at most ${o.thr}):\n\n` + groups.map((gr, i) => { const best = [...gr].sort((a, b) => b.w * b.h - a.w * a.h || b.f.size - a.f.size)[0]; return `Group ${i + 1}:\n` + gr.map((h) => `  ${h === best ? '[keep?] ' : '         '}${h.f.name}  ${h.w}x${h.h}  ${kb(h.f.size)}`).join('\n'); }).join('\n\n') + '\n\n"keep?" marks the largest picture by pixels and then by file size. Nothing is deleted. Groups are formed by chaining, so a long chain of small changes can join pictures that are not close to each other. ' + HASH_NOTE;
  },
});

// ======================= blurhash =======================
const B83 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';
const enc83 = (v, n) => { let s = ''; for (let i = 1; i <= n; i++) s += B83[Math.floor(v / 83 ** (n - i)) % 83]; return s; };
const s2l = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const l2s = (v) => { v = Math.max(0, Math.min(1, v)); return Math.trunc(v <= 0.0031308 ? v * 12.92 * 255 + 0.5 : (1.055 * v ** (1 / 2.4) - 0.055) * 255 + 0.5); };
const spow = (v, e) => Math.sign(v) * Math.abs(v) ** e;
function blurhashEncode(d, w, h, cx, cy) {
  const f = []; for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) { const nm = i === 0 && j === 0 ? 1 : 2; let r = 0, g = 0, b = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const bs = nm * Math.cos((Math.PI * i * x) / w) * Math.cos((Math.PI * j * y) / h), p = 4 * (y * w + x); r += bs * s2l(d[p]); g += bs * s2l(d[p + 1]); b += bs * s2l(d[p + 2]); } const sc = 1 / (w * h); f.push([r * sc, g * sc, b * sc]); }
  const dc = f[0], ac = f.slice(1); let hash = enc83(cx - 1 + (cy - 1) * 9, 1), mv;
  if (ac.length) { const am = Math.max(...ac.map((a) => Math.max(Math.abs(a[0]), Math.abs(a[1]), Math.abs(a[2])))), q = Math.max(0, Math.min(82, Math.floor(am * 166 - 0.5))); mv = (q + 1) / 166; hash += enc83(q, 1); } else { mv = 1; hash += enc83(0, 1); }
  hash += enc83((l2s(dc[0]) << 16) + (l2s(dc[1]) << 8) + l2s(dc[2]), 4); const qa = (v) => Math.floor(Math.max(0, Math.min(18, Math.floor(spow(v / mv, 0.5) * 9 + 9.5)))); for (const a of ac) hash += enc83(qa(a[0]) * 361 + qa(a[1]) * 19 + qa(a[2]), 2);
  return hash;
}
function blurhashDecode(hash, w, h) {
  const dec = (s) => { let v = 0; for (const c of s) v = v * 83 + B83.indexOf(c); return v; }; if (hash.length < 6) throw new Error('A BlurHash has at least 6 characters.'); const sf = dec(hash[0]), cy = Math.floor(sf / 9) + 1, cx = (sf % 9) + 1; if (hash.length !== 4 + 2 * cx * cy) throw new Error('This BlurHash has the wrong length for its component count.'); if ([...hash].some((c) => B83.indexOf(c) < 0)) throw new Error('This BlurHash has characters outside the base 83 alphabet.');
  const mv = (dec(hash[1]) + 1) / 166, col = []; const dcv = dec(hash.slice(2, 6)); col.push([s2l(dcv >> 16), s2l((dcv >> 8) & 255), s2l(dcv & 255)]); for (let i = 1; i < cx * cy; i++) { const v = dec(hash.slice(4 + 2 * i, 6 + 2 * i)), sp = (x) => spow((x - 9) / 9, 2) * mv; col.push([sp(Math.floor(v / 361)), sp(Math.floor(v / 19) % 19), sp(v % 19)]); }
  const px = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let r = 0, g = 0, b = 0; for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) { const bs = Math.cos((Math.PI * x * i) / w) * Math.cos((Math.PI * y * j) / h), c = col[i + j * cx]; r += c[0] * bs; g += c[1] * bs; b += c[2] * bs; } const p = 4 * (y * w + x); px[p] = l2s(r); px[p + 1] = l2s(g); px[p + 2] = l2s(b); px[p + 3] = 255; }
  return px;
}
T.push({
  id: 'blurhash-generator', cat: IMG, title: 'BlurHash Generator (Compact Image Placeholder String)',
  desc: 'Compute a BlurHash for an image, a short string that decodes to a blurred placeholder while the real picture loads, and preview the blurred result for the component count you choose.',
  inputs: 0, sample: '', dom: true, file: IMG1, opts: [num('cx', 'Horizontal components (1-9)', 4), num('cy', 'Vertical components (1-9)', 3)],
  run: async (_i, o, files) => {
    const f = need(files)[0], cx = Math.round(+o.cx), cy = Math.round(+o.cy); if (!(cx >= 1 && cx <= 9 && cy >= 1 && cy <= 9)) throw new Error('Components must be from 1 to 9.'); const bmp = await bmpOf(f), k = Math.min(1, 64 / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k)), im = rgba(bmp, w, h), hash = blurhashEncode(im.data, im.width, im.height, cx, cy);
    const pw = 32, ph = Math.max(1, Math.round((32 * bmp.height) / bmp.width)), c = mk(pw, ph); c.getContext('2d').putImageData(new ImageData(blurhashDecode(hash, pw, ph), pw, ph), 0, 0); c.style.width = '256px'; c.style.imageRendering = 'auto'; c.setAttribute('aria-label', `Blurred preview decoded from the BlurHash of ${f.name}`);
    return { canvas: c, text: `${hash}\n\nImage: ${f.name}, ${bmp.width}x${bmp.height}; components ${cx} x ${cy}; ${hash.length} characters.\nAspect ratio ${R(bmp.width / bmp.height, 3)}: store it with the hash so the placeholder can be drawn at the right size.\n\nThe image is reduced to at most 64 px before encoding, which is enough for a blur. More components keep more detail and make the string longer (4 x 3 is the usual choice). Decode it on your site with any BlurHash decoder.` };
  },
});

// ======================= PNG quantizer =======================
function medianCut(d, n, ncol) { // d: RGBA bytes -> { pal: [[r,g,b,a]], hist }
  let map = new Map(); const add = (shift) => { map = new Map(); const m = shift ? 255 ^ ((1 << shift) - 1) : 255; for (let i = 0; i < n; i++) { const a = d[i * 4 + 3], k = a === 0 ? 0 : (((d[i * 4] & m) << 24) | ((d[i * 4 + 1] & m) << 16) | ((d[i * 4 + 2] & m) << 8) | a) >>> 0; map.set(k, (map.get(k) || 0) + 1); } }; add(0); if (map.size > 60000) add(2);
  const cols = [...map].map(([k, c]) => [k >>> 24, (k >>> 16) & 255, (k >>> 8) & 255, k & 255, c]);
  if (cols.length <= ncol) return cols.map((c) => c.slice(0, 4));
  let boxes = [cols]; const range = (b) => { const mn = [255, 255, 255, 255], mx = [0, 0, 0, 0]; for (const c of b) for (let k = 0; k < 4; k++) { if (c[k] < mn[k]) mn[k] = c[k]; if (c[k] > mx[k]) mx[k] = c[k]; } return mx.map((v, k) => v - mn[k]); };
  while (boxes.length < ncol) {
    let bi = -1, bs = 0, bk = 0; boxes.forEach((b, i) => { if (b.length < 2) return; const r = range(b), k = r.indexOf(Math.max(...r)), pop = b.reduce((s, c) => s + c[4], 0), s = r[k] * Math.sqrt(pop); if (s > bs) { bs = s; bi = i; bk = k; } }); if (bi < 0) break;
    const b = boxes[bi].sort((p, q) => p[bk] - q[bk]), half = b.reduce((s, c) => s + c[4], 0) / 2; let acc = 0, cut = 1; for (let i = 0; i < b.length - 1; i++) { acc += b[i][4]; cut = i + 1; if (acc >= half) break; } boxes.splice(bi, 1, b.slice(0, cut), b.slice(cut));
  }
  return boxes.map((b) => { let s = [0, 0, 0, 0], t = 0; for (const c of b) { for (let k = 0; k < 4; k++) s[k] += c[k] * c[4]; t += c[4]; } return s.map((v) => Math.round(v / t)); });
}
function quantizeRgba(d, w, h, ncol, dither) {
  const n = w * h, pal = medianCut(d, n, ncol), idx = new Uint8Array(n), cache = new Map();
  const near = (r, g, b, a) => { let bi = 0, bd = Infinity; for (let i = 0; i < pal.length; i++) { const p = pal[i], da = (a - p[3]) * 1.0, dr = r - p[0], dg = g - p[1], db = b - p[2], dist = (a === 0 || p[3] === 0 ? 0 : 1) * (dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11) + da * da * 1.5; if (dist < bd) { bd = dist; bi = i; } } return bi; };
  if (!dither) { for (let i = 0; i < n; i++) { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3], k = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0; let v = cache.get(k); if (v === undefined) { v = near(r, g, b, a); cache.set(k, v); } idx[i] = v; } return { pal, idx }; }
  let e0 = new Float32Array(w * 3), e1 = new Float32Array(w * 3);
  for (let y = 0; y < h; y++) { e1.fill(0); for (let x = 0; x < w; x++) { const i = y * w + x, a = d[i * 4 + 3]; const r = Math.max(0, Math.min(255, d[i * 4] + e0[x * 3])), g = Math.max(0, Math.min(255, d[i * 4 + 1] + e0[x * 3 + 1])), b = Math.max(0, Math.min(255, d[i * 4 + 2] + e0[x * 3 + 2])); const v = near(r, g, b, a); idx[i] = v; if (a === 0) continue; const p = pal[v], er = r - p[0], eg = g - p[1], eb = b - p[2]; const put = (arr, xx, f) => { if (xx < 0 || xx >= w) return; arr[xx * 3] += er * f; arr[xx * 3 + 1] += eg * f; arr[xx * 3 + 2] += eb * f; }; put(e0, x + 1, 7 / 16); put(e1, x - 1, 3 / 16); put(e1, x, 5 / 16); put(e1, x + 1, 1 / 16); } const t = e0; e0 = e1; e1 = t; }
  return { pal, idx };
}
async function deflateZ(u) { const s = new Blob([u]).stream().pipeThrough(new CompressionStream('deflate')); return new Uint8Array(await new Response(s).arrayBuffer()); }
const pngChunk = (type, data) => { const t = new TextEncoder().encode(type); return cat(be32(data.length), t, data, be32(crc32(cat(t, data)))); };
async function encodeIndexedPng(w, h, pal, idx) {
  const bd = pal.length <= 2 ? 1 : pal.length <= 4 ? 2 : pal.length <= 16 ? 4 : 8, rb = Math.ceil((w * bd) / 8), raw = new Uint8Array(h * (rb + 1)); let prev = new Uint8Array(rb);
  for (let y = 0; y < h; y++) { const row = new Uint8Array(rb); if (bd === 8) row.set(idx.subarray(y * w, y * w + w)); else for (let x = 0; x < w; x++) row[(x * bd) >> 3] |= idx[y * w + x] << (8 - bd - ((x * bd) & 7)); const bpp = 1, cand = [row, row.map((v, i) => (v - (i >= bpp ? row[i - bpp] : 0)) & 255), row.map((v, i) => (v - prev[i]) & 255)]; let best = 0, bs = Infinity; cand.forEach((c, k) => { let s = 0; for (const v of c) s += v < 128 ? v : 256 - v; if (s < bs) { bs = s; best = k; } }); raw[y * (rb + 1)] = best; raw.set(cand[best], y * (rb + 1) + 1); prev = row; }
  const ihdr = new Uint8Array(13); const dv = new DataView(ihdr.buffer); dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = bd; ihdr[9] = 3; const plte = new Uint8Array(pal.length * 3); pal.forEach((p, i) => plte.set(p.slice(0, 3), i * 3)); let last = pal.length; while (last > 0 && pal[last - 1][3] === 255) last--; const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('PLTE', plte)]; if (last > 0) parts.push(pngChunk('tRNS', Uint8Array.from(pal.slice(0, last), (p) => p[3])));
  parts.push(pngChunk('IDAT', await deflateZ(raw)), pngChunk('IEND', new Uint8Array(0))); return cat(...parts);
}
T.push({
  id: 'png-quantizer', cat: IMG, title: 'PNG Quantizer (Shrink PNG Files with a Reduced Colour Palette)',
  desc: 'Reduce a PNG to 256, 64 or fewer colours with median-cut and optional dithering, and save a smaller indexed PNG. Transparency is kept.',
  inputs: 0, sample: '', dom: true, file: IMGF, opts: [num('colors', 'Number of colours (2-256)', 128), chk('dither', 'Dither (smoother gradients, larger file)', false), chk('keep', 'Keep the original when the result is not smaller', true)],
  run: async (_i, o, files) => {
    const nc = Math.round(+o.colors); if (!(nc >= 2 && nc <= 256)) throw new Error('Use 2 to 256 colours.'); const out = [], notes = []; let a = 0, z = 0;
    for (const f of need(files)) { const bmp = await bmpOf(f), im = rgba(bmp, bmp.width, bmp.height), q = quantizeRgba(im.data, im.width, im.height, nc, o.dither), png = await encodeIndexedPng(im.width, im.height, q.pal, q.idx), orig = f.type === 'image/png' && o.keep && png.length >= f.size; out.push(orig ? f : new File([png], `${bn(f)}-${q.pal.length}colors.png`, { type: 'image/png' })); a += f.size; z += orig ? f.size : png.length; notes.push(`${f.name}: ${im.width}x${im.height}, ${q.pal.length} colours, ${kb(f.size)} -> ${kb(orig ? f.size : png.length)}${orig ? ' (original kept, new file was not smaller)' : ''}`); }
    return { blob: out, text: notes.join('\n') + `\n\nTotal ${kb(a)} -> ${kb(z)}. Method: median cut on the colour histogram (weighted by pixel count), nearest-colour mapping, optional Floyd-Steinberg dithering, PNG filters picked per row. Photos with smooth gradients can band at low colour counts; logos, icons and screenshots usually survive 64 colours well. Check the result by eye.` };
  },
});

// ======================= GIF decoder =======================
function decodeGif(b) {
  if (!/^GIF8[79]a/.test(asc(b, 0, 6))) throw new Error('This is not a GIF file.');
  const w = b[6] | (b[7] << 8), h = b[8] | (b[9] << 8); if (!w || !h || w * h > 40e6) throw new Error('The GIF size is not supported.'); let p = 13, gct = null; if (b[10] & 0x80) { const n = 2 << (b[10] & 7); gct = b.subarray(p, p + n * 3); p += n * 3; }
  const frames = [], canvas = new Uint8ClampedArray(w * h * 4); let gce = null, prev = null;
  const blocks = () => { const parts = []; while (p < b.length && b[p]) { parts.push(b.subarray(p + 1, p + 1 + b[p])); p += b[p] + 1; } p++; return cat(...parts); };
  while (p < b.length) {
    const c = b[p++]; if (c === 0x3b) break;
    if (c === 0x21) { const lab = b[p++]; if (lab === 0xf9) { gce = { disp: (b[p + 1] >> 2) & 7, trans: b[p + 1] & 1 ? b[p + 4] : -1, delay: (b[p + 2] | (b[p + 3] << 8)) * 10 }; } blocks(); continue; }
    if (c !== 0x2c) throw new Error('The GIF is damaged.');
    const x0 = b[p] | (b[p + 1] << 8), y0 = b[p + 2] | (b[p + 3] << 8), fw = b[p + 4] | (b[p + 5] << 8), fh = b[p + 6] | (b[p + 7] << 8), fl = b[p + 8]; p += 9; let ct = gct; if (fl & 0x80) { const n = 2 << (fl & 7); ct = b.subarray(p, p + n * 3); p += n * 3; } const mcs = b[p++], data = blocks();
    // lzw
    const clear = 1 << mcs, eoi = clear + 1, out = new Uint8Array(fw * fh); let size = mcs + 1, next = eoi + 1, bits = 0, nb = 0, di = 0, op = 0; const pre = new Int32Array(4096), suf = new Uint8Array(4096), stack = new Uint8Array(4097); let prevc = -1, first = 0;
    for (let i = 0; i < clear; i++) suf[i] = i;
    while (op < out.length) { while (nb < size && di < data.length) { bits |= data[di++] << nb; nb += 8; } if (nb < size) break; let code = bits & ((1 << size) - 1); bits >>= size; nb -= size; if (code === clear) { size = mcs + 1; next = eoi + 1; prevc = -1; continue; } if (code === eoi) break;
      let sp = 0, cur = code; if (prevc === -1) { out[op++] = suf[code]; prevc = code; first = suf[code]; continue; } if (code >= next) { stack[sp++] = first; cur = prevc; } while (cur >= clear) { stack[sp++] = suf[cur]; cur = pre[cur]; } first = suf[cur]; stack[sp++] = first; while (sp > 0 && op < out.length) out[op++] = stack[--sp];
      if (next < 4096) { pre[next] = prevc; suf[next] = first; next++; if (next === 1 << size && size < 12) size++; } prevc = code; }
    // dispose previous
    if (prev) { if (prev.disp === 2) for (let y = prev.y; y < prev.y + prev.h; y++) for (let x = prev.x; x < prev.x + prev.w; x++) if (x < w && y < h) canvas.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 4); if (prev.disp === 3 && prev.saved) canvas.set(prev.saved); }
    const disp = gce ? gce.disp : 0, saved = disp === 3 ? canvas.slice() : null, order = []; if (fl & 0x40) { for (const [s, st] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = s; y < fh; y += st) order.push(y); } else for (let y = 0; y < fh; y++) order.push(y);
    for (let r = 0; r < fh; r++) { const y = y0 + order[r]; if (y >= h) continue; for (let x = 0; x < fw; x++) { const xx = x0 + x; if (xx >= w) continue; const v = out[r * fw + x]; if (gce && v === gce.trans) continue; if (!ct || v * 3 + 2 >= ct.length) continue; const o = (y * w + xx) * 4; canvas[o] = ct[v * 3]; canvas[o + 1] = ct[v * 3 + 1]; canvas[o + 2] = ct[v * 3 + 2]; canvas[o + 3] = 255; } }
    frames.push({ rgba: canvas.slice(), delay: gce ? gce.delay : 0 }); prev = { disp, x: x0, y: y0, w: fw, h: fh, saved }; gce = null; if (frames.length > 2000) throw new Error('More than 2000 frames: not supported.');
  }
  if (!frames.length) throw new Error('The GIF has no frames.'); return { w, h, frames };
}
const rangeList = (s, n) => { const t = String(s).trim().toLowerCase(); if (!t || t === 'all') return Array.from({ length: n }, (_, i) => i); const set = new Set(); for (const part of t.split(',')) { const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(part); if (!m) throw new Error('Frames must look like all or 1,3,5-8.'); const a = +m[1], b = m[2] ? +m[2] : a; for (let i = a; i <= b; i++) if (i >= 1 && i <= n) set.add(i - 1); } if (!set.size) throw new Error(`No such frames. The GIF has ${n}.`); return [...set].sort((x, y) => x - y); };
T.push({
  id: 'gif-frame-extractor', cat: IMG, title: 'GIF Frame Extractor (Split an Animated GIF into PNG Frames)',
  desc: 'Decode every frame of an animated GIF, view them as numbered thumbnails with their delays, and download chosen frames as PNG files or all of them in a ZIP.',
  inputs: 0, sample: '', dom: true, file: IMG1, opts: [txt('sel', 'Frames (all, or 1,3,5-8)', 'all'), chk('zip', 'Download as one ZIP', true)],
  run: async (_i, o, files) => {
    const f = need(files)[0], g = decodeGif(await u8f(f)), pick = rangeList(o.sel, g.frames.length); if (pick.length > 400) throw new Error('Pick at most 400 frames at a time.'); const pngs = [], cells = [], pad = String(g.frames.length).length;
    for (const i of pick) { const c = mk(g.w, g.h); c.getContext('2d').putImageData(new ImageData(g.frames[i].rgba, g.w, g.h), 0, 0); const b = await toBlob(c, 'image/png'); pngs.push({ name: `${bn(f)}-frame-${String(i + 1).padStart(pad, '0')}.png`, data: await bytesOf(b) }); if (cells.length < 60) { const t = mk(Math.min(g.w, 160), Math.round((Math.min(g.w, 160) * g.h) / g.w)); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); cells.push(`<figure style="margin:0;text-align:center"><img src="${t.toDataURL('image/png')}" alt="Frame ${i + 1}" style="background:repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 50%/12px 12px;max-width:100%"><figcaption>${i + 1} (${g.frames[i].delay} ms)</figcaption></figure>`); } }
    const total = g.frames.reduce((s, x) => s + x.delay, 0), html = `<!doctype html><meta charset="utf-8"><body style="margin:12px;font:13px system-ui;color-scheme:light dark"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px">${cells.join('')}</div>${pick.length > 60 ? '<p>Showing the first 60 thumbnails.</p>' : ''}`;
    return { html, blob: o.zip && pngs.length > 1 ? zipFile(pngs, `${bn(f)}-frames.zip`) : pngs.map((p) => new File([p.data], p.name, { type: 'image/png' })), text: `${f.name}: ${g.w}x${g.h}, ${g.frames.length} frames, ${hms(total / 1000)} total.\nExtracted ${pngs.length} frame(s). Each PNG is the full picture as it appears at that point in the animation, with the GIF disposal rules applied and transparency kept.` };
  },
});

// ======================= sprite sheet =======================
T.push({
  id: 'sprite-sheet-packer', cat: IMG, title: 'Sprite Sheet Packer (PNG Atlas with JSON and CSS Map)',
  desc: 'Pack many images into one sprite sheet PNG and get a JSON map of each sprite name, position and size, plus ready CSS classes for use on a page.',
  inputs: 0, sample: '', dom: true, file: IMGF, opts: [num('maxw', 'Maximum sheet width (px)', 1024), num('pad', 'Padding between sprites (px)', 2), chk('pot', 'Round the sheet size up to powers of two', false), txt('prefix', 'CSS class prefix', 'sprite-')],
  run: async (_i, o, files) => {
    const pad = Math.max(0, Math.round(+o.pad)), maxw = Math.round(+o.maxw); if (!(maxw >= 16 && maxw <= 8192)) throw new Error('Maximum width must be 16 to 8192.'); const items = []; for (const f of need(files)) items.push({ name: bn(f), bmp: await bmpOf(f) });
    for (const it of items) if (it.bmp.width > maxw) throw new Error(`${it.name} is wider than the maximum sheet width.`); items.sort((a, b) => b.bmp.height - a.bmp.height || a.name.localeCompare(b.name)); let x = 0, y = 0, rowH = 0, sw = 0;
    for (const it of items) { if (x > 0 && x + it.bmp.width > maxw) { x = 0; y += rowH + pad; rowH = 0; } it.x = x; it.y = y; x += it.bmp.width + pad; rowH = Math.max(rowH, it.bmp.height); sw = Math.max(sw, x - pad); } let sh = y + rowH; const p2 = (v) => 2 ** Math.ceil(Math.log2(v)); if (o.pot) { sw = p2(sw); sh = p2(sh); }
    const c = mk(sw, sh), cx = c.getContext('2d'); for (const it of items) cx.drawImage(it.bmp, it.x, it.y); const png = await toBlob(c, 'image/png'), names = uniq(items.map((i) => i.name)), frames = {};
    items.forEach((it, i) => { frames[names[i]] = { frame: { x: it.x, y: it.y, w: it.bmp.width, h: it.bmp.height }, sourceSize: { w: it.bmp.width, h: it.bmp.height } }; });
    const json = JSON.stringify({ frames, meta: { image: 'sprites.png', size: { w: sw, h: sh } } }, null, 2), cl = (s) => s.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'img';
    const css = items.map((it, i) => `.${o.prefix.replace(/[^\w-]/g, '')}${cl(names[i])} { width: ${it.bmp.width}px; height: ${it.bmp.height}px; background: url(sprites.png) -${it.x}px -${it.y}px; }`).join('\n');
    c.setAttribute('aria-label', `Sprite sheet of ${items.length} images, ${sw} by ${sh} pixels`);
    return { blob: [new File([png], 'sprites.png', { type: 'image/png' }), new File([json], 'sprites.json', { type: 'application/json' })], text: `${items.length} sprites on a ${sw}x${sh}px sheet.\n\nJSON map (sprites.json):\n${json}\n\nCSS:\n${css}\n\nSprites are placed in rows, tallest first (a simple shelf packer, not the tightest possible). Names come from the file names.` };
  },
});

// ======================= perspective corrector =======================
function homography(from, to) { // 4 points each; returns [a..h] so that to = H(from)
  const A = [], bb = []; for (let i = 0; i < 4; i++) { const [x, y] = from[i], [u, v] = to[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); bb.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); bb.push(v); }
  for (let c = 0; c < 8; c++) { let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (Math.abs(A[p][c]) < 1e-12) throw new Error('The four corners must form a real four-sided shape (no three in a line).'); [A[c], A[p]] = [A[p], A[c]]; [bb[c], bb[p]] = [bb[p], bb[c]]; for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; bb[r] -= f * bb[c]; } }
  return bb.map((v, i) => v / A[i][i]);
}
function warpPerspective(src, sw, sh, quad, dw, dh) { // quad: TL,TR,BR,BL in source pixel coordinates
  const H = homography([[0, 0], [dw, 0], [dw, dh], [0, dh]], quad), out = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const X = x + 0.5, Y = y + 0.5, den = H[6] * X + H[7] * Y + 1, u = (H[0] * X + H[1] * Y + H[2]) / den - 0.5, v = (H[3] * X + H[4] * Y + H[5]) / den - 0.5, o = (y * dw + x) * 4;
    if (u < -1 || v < -1 || u > sw || v > sh) continue; const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    for (let k = 0; k < 4; k++) { const g = (xx, yy) => src[(Math.min(sh - 1, Math.max(0, yy)) * sw + Math.min(sw - 1, Math.max(0, xx))) * 4 + k]; out[o + k] = g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy; }
  }
  return out;
}
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
T.push({
  id: 'perspective-corrector', cat: IMG, title: 'Perspective Corrector (Straighten a Photo of a Page or Building)',
  desc: 'Mark the four corners of a document, whiteboard or facade in a photo and warp it into a flat rectangle. Drag the corners or type their positions.',
  custom: true, dom: true,
  render(root) {
    const h = (tag, attrs = {}, kids = []) => el(tag, attrs, kids), NM = ['top left', 'top right', 'bottom right', 'bottom left'], DEF = [[8, 8], [92, 8], [92, 92], [8, 92]]; let bmp = null, name = 'photo', q = DEF.map((p) => p.slice()), drag = -1, lastUrl = '';
    const file = h('input', { type: 'file', accept: 'image/*', id: 'pc-file' }), cv = h('canvas', { width: 640, height: 400, role: 'img', style: 'max-width:100%;touch-action:none;border:1px solid currentColor;cursor:crosshair' }), status = h('p', { role: 'status' }), res = h('div'), ins = [];
    const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));gap:.5rem' });
    NM.forEach((nm, i) => { for (const [a, ax] of [[0, 'X'], [1, 'Y']]) { const inp = h('input', { type: 'number', min: '0', max: '100', step: '0.5', value: String(DEF[i][a]), style: 'width:6rem', id: `pc-${i}${ax}` }); inp.addEventListener('input', () => { q[i][a] = Math.max(0, Math.min(100, +inp.value || 0)); draw(); }); ins.push([i, a, inp]); grid.append(h('label', { style: 'display:grid;gap:.2rem;font-size:.9rem' }, [`Corner ${i + 1} ${nm}, ${ax} (% of ${ax === 'X' ? 'width' : 'height'})`, inp])); } });
    const ow = h('input', { type: 'number', min: '0', value: '0', id: 'pc-ow', style: 'width:6rem' }), oh = h('input', { type: 'number', min: '0', value: '0', id: 'pc-oh', style: 'width:6rem' }), go = h('button', { type: 'button', style: BTN, text: 'Straighten' }), reset = h('button', { type: 'button', style: BTN, text: 'Reset corners' });
    root.append(h('div', { style: 'display:grid;gap:1rem' }, [field('Photo', file), h('p', { class: 'muted', text: 'Corners go clockwise from the top left: 1 top left, 2 top right, 3 bottom right, 4 bottom left. Drag a numbered handle on the picture, or use the number boxes below.' }), cv, grid, h('div', { style: 'display:flex;gap:1rem;flex-wrap:wrap;align-items:end' }, [field('Output width px (0 = automatic)', ow), field('Output height px (0 = automatic)', oh), go, reset]), status, res]));
    const sync = () => { for (const [i, a, inp] of ins) inp.value = String(Math.round(q[i][a] * 10) / 10); };
    const draw = () => {
      const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); if (!bmp) { x.fillStyle = '#8884'; x.fillRect(0, 0, cv.width, cv.height); cv.setAttribute('aria-label', 'No photo chosen yet'); return; } x.drawImage(bmp, 0, 0, cv.width, cv.height); const P = q.map((p) => [(p[0] / 100) * cv.width, (p[1] / 100) * cv.height]);
      x.lineJoin = 'round'; for (const [w, c] of [[5, '#000'], [2, '#fff']]) { x.lineWidth = w; x.strokeStyle = c; x.beginPath(); P.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); x.stroke(); }
      P.forEach((p, i) => { x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 2; x.beginPath(); x.arc(p[0], p[1], 11, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#000'; x.font = 'bold 13px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(i + 1), p[0], p[1] + 1); });
      cv.setAttribute('aria-label', `Photo ${name} with the four corners at ${q.map((p, i) => `${i + 1}: ${Math.round(p[0])}%, ${Math.round(p[1])}%`).join('; ')}`);
    };
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100]; };
    cv.addEventListener('pointerdown', (e) => { if (!bmp) return; const p = pos(e), r = cv.getBoundingClientRect(); let b = 0, bd = 1e9; q.forEach((c, i) => { const d = Math.hypot(((c[0] - p[0]) / 100) * r.width, ((c[1] - p[1]) / 100) * r.height); if (d < bd) { bd = d; b = i; } }); if (bd < 40) { drag = b; cv.setPointerCapture(e.pointerId); } });
    cv.addEventListener('pointermove', (e) => { if (drag < 0) return; const p = pos(e); q[drag] = [Math.max(0, Math.min(100, p[0])), Math.max(0, Math.min(100, p[1]))]; sync(); draw(); });
    cv.addEventListener('pointerup', () => { drag = -1; });
    reset.onclick = () => { q = DEF.map((p) => p.slice()); sync(); draw(); };
    file.addEventListener('change', async () => { const f = file.files[0]; if (!f) return; try { bmp = await createImageBitmap(f); name = f.name; const k = Math.min(1, 800 / bmp.width); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k); res.replaceChildren(); status.textContent = `${f.name}: ${bmp.width} x ${bmp.height} px. Move the corners onto the four corners of the flat object.`; draw(); } catch { bmp = null; status.textContent = 'That file is not an image this browser can read.'; status.setAttribute('role', 'alert'); draw(); } });
    go.onclick = () => {
      status.setAttribute('role', 'status'); if (!bmp) { status.textContent = 'Choose a photo first.'; status.setAttribute('role', 'alert'); return; }
      try { const k = 1, im = rgba(bmp, bmp.width, bmp.height), Q = q.map((p) => [(p[0] / 100) * im.width * k, (p[1] / 100) * im.height * k]); let W = Math.round(+ow.value) || Math.round(Math.max(dist2(Q[0], Q[1]), dist2(Q[3], Q[2]))), H = Math.round(+oh.value) || Math.round(Math.max(dist2(Q[0], Q[3]), dist2(Q[1], Q[2]))); if (!(W >= 8 && H >= 8)) throw new Error('The output would be too small. Move the corners apart.'); if (W > 5000 || H > 5000) throw new Error('The output would be larger than 5000 px. Set a smaller output size.');
        const out = mk(W, H), data = warpPerspective(im.data, im.width, im.height, Q, W, H); out.getContext('2d').putImageData(new ImageData(data, W, H), 0, 0); out.style.maxWidth = '100%'; out.setAttribute('role', 'img'); out.setAttribute('aria-label', `Straightened result, ${W} by ${H} pixels`);
        out.toBlob((b) => { if (lastUrl) URL.revokeObjectURL(lastUrl); lastUrl = URL.createObjectURL(b); const a = h('a', { href: lastUrl, download: `${name.replace(/\.[^.]+$/, '')}-straight.png`, class: 'btn', text: 'Download PNG' }); res.replaceChildren(out, h('p', {}, [a])); }, 'image/png'); status.textContent = `Straightened to ${W} x ${H} px.`; } catch (e) { status.textContent = e.message; status.setAttribute('role', 'alert'); }
    };
    draw(); return () => { if (lastUrl) URL.revokeObjectURL(lastUrl); };
  },
});

// ======================= mask painter =======================
T.push({
  id: 'image-mask-painter', cat: IMG, title: 'Image Mask Painter (Paint Transparency, Export PNG)',
  desc: 'Brush over parts of a picture to make them transparent, or restore them, then save a PNG. Works with a mouse, touch or the keyboard, and has rectangle controls and undo.',
  custom: true, dom: true,
  render(root) {
    const h = el; let kdown = false, orig = null, work = null, name = "image", brush = 30, cx = 0, cy = 0, down = false, mode = 'erase', undo = [], lastUrl = '';
    const file = h('input', { type: 'file', accept: 'image/*', id: 'mp-file' }), cv = h('canvas', { width: 640, height: 400, tabindex: '0', role: 'img', style: 'max-width:100%;touch-action:none;border:1px solid currentColor;cursor:crosshair;background:repeating-conic-gradient(#8885 0 25%,#8882 0 50%) 50%/16px 16px' }), status = h('p', { role: 'status' });
    const mSel = h('select', { id: 'mp-mode' }, [h('option', { value: 'erase', text: 'Make transparent' }), h('option', { value: 'restore', text: 'Restore picture' })]), bs = h('input', { type: 'range', min: '2', max: '200', value: '30', id: 'mp-brush' }), bv = h('output', { text: '30 px' });
    const rect = Object.fromEntries(['x', 'y', 'w', 'h'].map((k) => [k, h('input', { type: 'number', min: '0', value: '0', id: 'mp-r' + k, style: 'width:6rem' })])), mkb = (t, fn) => { const b = h('button', { type: 'button', style: BTN, text: t }); b.onclick = fn; return b; };
    root.append(h('div', { style: 'display:grid;gap:1rem' }, [field('Picture', file), h('div', { style: 'display:flex;gap:1rem;flex-wrap:wrap;align-items:end' }, [field('Brush does', mSel), field('Brush size', h('span', {}, [bs, ' ', bv]))]), h('p', { class: 'muted', text: 'Paint with the pointer. Keyboard: focus the picture, press Space to put the brush down or lift it, move with the arrow keys (hold Shift for small steps), Enter makes a single dab.' }), cv, h('fieldset', {}, [h('legend', { text: 'Rectangle (picture pixels)' }), h('div', { style: 'display:flex;gap:.75rem;flex-wrap:wrap;align-items:end' }, [field('Left', rect.x), field('Top', rect.y), field('Width', rect.w), field('Height', rect.h), mkb('Apply rectangle', () => rectApply(false)), mkb('Apply to everything outside', () => rectApply(true))])]), h('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap' }, [mkb('Undo', doUndo), mkb('Restore all', () => { if (!orig) return; push(); const x = work.getContext('2d'); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, work.width, work.height); x.drawImage(orig, 0, 0); draw(); say('All restored.'); }), mkb('Make all transparent', () => { if (!orig) return; push(); work.getContext('2d').clearRect(0, 0, work.width, work.height); draw(); say('Everything is transparent now.'); }), mkb('Save PNG', save)]), status, h('div', { id: 'mp-dl' })]));
    const say = (m, bad) => { status.setAttribute('role', bad ? 'alert' : 'status'); status.textContent = m; };
    const draw = () => { const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); if (!work) { cv.setAttribute('aria-label', 'No picture chosen yet'); return; } x.drawImage(work, 0, 0, cv.width, cv.height); const s = cv.width / work.width; x.lineWidth = 2; for (const [w, c] of [[4, '#000'], [2, '#fff']]) { x.lineWidth = w; x.strokeStyle = c; x.beginPath(); x.arc(cx * s, cy * s, (brush / 2) * s, 0, 7); x.stroke(); } cv.setAttribute('aria-label', `${name}: transparency mask editor, ${work.width} by ${work.height} pixels. Brush at ${Math.round(cx)}, ${Math.round(cy)}, ${down || kdown ? "down" : "up"}.`); };
    const push = () => { undo.push(work.getContext('2d').getImageData(0, 0, work.width, work.height)); if (undo.length > 8) undo.shift(); };
    function doUndo() { if (!undo.length) { say('Nothing to undo.'); return; } work.getContext('2d').putImageData(undo.pop(), 0, 0); draw(); say('Undone.'); }
    const dab = (x0, y0, x1, y1) => { const x = work.getContext('2d'), n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(1, brush / 4))); for (let i = 0; i <= n; i++) { const px = x0 + ((x1 - x0) * i) / n, py = y0 + ((y1 - y0) * i) / n; x.save(); x.beginPath(); x.arc(px, py, brush / 2, 0, 7); if (mSel.value === 'erase') { x.globalCompositeOperation = 'destination-out'; x.fill(); } else { x.clip(); x.globalCompositeOperation = 'source-over'; x.drawImage(orig, 0, 0); } x.restore(); } };
    function rectApply(outside) { if (!work) { say('Choose a picture first.', true); return; } const r = { x: +rect.x.value || 0, y: +rect.y.value || 0, w: +rect.w.value || 0, h: +rect.h.value || 0 }; if (!(r.w > 0 && r.h > 0)) { say('Give the rectangle a width and height above zero.', true); return; } push(); const x = work.getContext('2d'); x.save(); const clipPath = new Path2D(); if (outside) clipPath.rect(0, 0, work.width, work.height); clipPath.rect(r.x, r.y, r.w, r.h); x.clip(clipPath, outside ? 'evenodd' : 'nonzero'); if (mSel.value === 'erase') x.clearRect(0, 0, work.width, work.height); else x.drawImage(orig, 0, 0); x.restore(); draw(); say(`Rectangle applied${outside ? ' to the outside' : ''}.`); }
    const toImg = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * work.width, ((e.clientY - r.top) / r.height) * work.height]; };
    cv.addEventListener('pointerdown', (e) => { if (!work) return; push(); cv.setPointerCapture(e.pointerId); [cx, cy] = toImg(e); down = true; dab(cx, cy, cx, cy); draw(); });
    cv.addEventListener('pointermove', (e) => { if (!work) return; const [nx, ny] = toImg(e); if (down) dab(cx, cy, nx, ny); cx = nx; cy = ny; draw(); });
    const up = () => { down = false; draw(); }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

    cv.addEventListener('keydown', (e) => { if (!work) return; const st = (e.shiftKey ? 1 : Math.max(2, work.width / 100)); let mx = 0, my = 0; if (e.key === 'ArrowLeft') mx = -st; else if (e.key === 'ArrowRight') mx = st; else if (e.key === 'ArrowUp') my = -st; else if (e.key === 'ArrowDown') my = st; else if (e.key === ' ') { e.preventDefault(); kdown = !kdown; if (kdown) { push(); dab(cx, cy, cx, cy); } say(kdown ? 'Brush down.' : 'Brush up.'); draw(); return; } else if (e.key === 'Enter') { e.preventDefault(); push(); dab(cx, cy, cx, cy); draw(); return; } else return; e.preventDefault(); const nx = Math.max(0, Math.min(work.width, cx + mx)), ny = Math.max(0, Math.min(work.height, cy + my)); if (kdown) dab(cx, cy, nx, ny); cx = nx; cy = ny; draw(); });
    bs.addEventListener('input', () => { brush = +bs.value; bv.textContent = brush + ' px'; draw(); });
    file.addEventListener('change', async () => { const f = file.files[0]; if (!f) return; try { const b = await createImageBitmap(f), k = Math.min(1, 2400 / Math.max(b.width, b.height)); orig = mk(b.width * k, b.height * k); orig.getContext('2d').drawImage(b, 0, 0, orig.width, orig.height); work = mk(orig.width, orig.height); work.getContext('2d').drawImage(orig, 0, 0); name = f.name; undo = []; cx = orig.width / 2; cy = orig.height / 2; brush = Math.round(Math.max(10, orig.width / 20)); bs.value = String(Math.max(2, Math.min(200, brush))); brush = +bs.value; bv.textContent = brush + ' px'; const s = Math.min(1, 800 / orig.width); cv.width = Math.round(orig.width * s); cv.height = Math.round(orig.height * s); rect.w.value = String(orig.width); rect.h.value = String(orig.height); draw(); say(`${f.name}: ${orig.width} x ${orig.height} px${k < 1 ? ' (scaled down to 2400 px)' : ''}.`); } catch { say('That file is not an image this browser can read.', true); } });
    function save() { if (!work) { say('Choose a picture first.', true); return; } work.toBlob((b) => { if (lastUrl) URL.revokeObjectURL(lastUrl); lastUrl = URL.createObjectURL(b); const a = h('a', { href: lastUrl, download: name.replace(/\.[^.]+$/, '') + '-masked.png', class: 'btn', text: 'Download masked PNG' }); root.querySelector('#mp-dl').replaceChildren(a); say('PNG ready: use the download link.'); }, 'image/png'); }
    draw(); return () => { if (lastUrl) URL.revokeObjectURL(lastUrl); };
  },
});
export default T;

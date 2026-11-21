// Calculators, time/productivity widgets and randomness tools. Pure client-side, no dependencies.
// SKIPPED (need live data / not mine): currency converter and currency-conversion, stock prices, aspect-ratio tool.
// Calculators use `inputs: 0` + opts defaults (sample ''). Time & Productivity tools use custom `render` (no network;
// localStorage only inside try/catch). Health outputs are informational only, not medical advice.

const FIN = 'Calculators – Finance', HEA = 'Calculators – Health', EVR = 'Calculators – Everyday', BLD = 'Calculators – Build';
const TIME = 'Time & Productivity', RND = 'Randomness';

// ---------- helpers ----------
const num = (id, label, def) => ({ id, label, type: 'number', def });
const sel = (id, label, choices, def) => ({ id, label, type: 'select', choices, def: def ?? choices[0] });
const chk = (id, label, def = false) => ({ id, label, type: 'checkbox', def });
const txt = (id, label, def) => ({ id, label, type: 'text', def });
const dat = (id, label, def) => ({ id, label, type: 'date', def });
const calc = (id, cat, title, desc, opts, fn) => ({ id, cat, title, desc, inputs: 0, sample: '', opts, run: (_i, o) => fn(o) });
const m = (x) => Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r = (x, d = 2) => Number(x).toLocaleString('en-US', { maximumFractionDigits: d });
const need = (o, ...ks) => { for (const k of ks) if (!Number.isFinite(o[k])) throw new Error('Enter a valid number for ' + k); };
const pos = (o, ...ks) => { need(o, ...ks); for (const k of ks) if (o[k] <= 0) throw new Error(k + ' must be greater than 0'); };
const tbl = (head, rows) => {
  const all = [head, ...rows].map((x) => x.map(String));
  const w = head.map((_, i) => Math.max(...all.map((x) => x[i].length)));
  return all.map((x) => x.map((c, i) => c.padStart(w[i])).join('  ')).join('\n');
};
const pad2 = (n) => String(n).padStart(2, '0');
const iso = (d) => d.toISOString().slice(0, 10);
const D = (s) => {
  const mt = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '').trim());
  if (!mt) throw new Error('Enter a valid date (YYYY-MM-DD)');
  const d = new Date(Date.UTC(+mt[1], +mt[2] - 1, +mt[3]));
  if (isNaN(d)) throw new Error('Invalid date');
  return d;
};
const wd = (d) => d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
const dstr = (d) => iso(d) + ' (' + wd(d) + ')';
const dim = (y, mo) => new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const addMonths = (d, n) => {
  const t = d.getUTCFullYear() * 12 + d.getUTCMonth() + n, y = Math.floor(t / 12), mo = t % 12;
  return new Date(Date.UTC(y, mo, Math.min(d.getUTCDate(), dim(y, mo))));
};
const ymd = (a, b) => { // a <= b
  let y = b.getUTCFullYear() - a.getUTCFullYear(), mo = b.getUTCMonth() - a.getUTCMonth(), d = b.getUTCDate() - a.getUTCDate();
  if (d < 0) { mo--; const pm = (b.getUTCMonth() + 11) % 12; d += dim(pm === 11 ? b.getUTCFullYear() - 1 : b.getUTCFullYear(), pm); }
  if (mo < 0) { y--; mo += 12; }
  return { y, mo, d };
};
const todayUTC = () => { const n = new Date(); return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())); };
const dur = (s) => {
  s = Math.round(s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), mi = Math.floor(s % 3600 / 60), se = s % 60;
  return [d && d + 'd', (d || h) && h + 'h', (d || h || mi) && mi + 'm', se + 's'].filter(Boolean).join(' ');
};
const rint = (lo, hi) => { // inclusive, unbiased
  const span = hi - lo + 1, lim = Math.floor(2 ** 32 / span) * span, a = new Uint32Array(1);
  do crypto.getRandomValues(a); while (a[0] >= lim);
  return lo + (a[0] % span);
};
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = rint(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const lines = (s) => String(s).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

// ---------- Finance ----------
const finance = [
  calc('percentage-calculator', FIN, 'Percentage Calculator', 'X% of Y, X is what % of Y, and change from X to Y.',
    [sel('mode', 'Mode', ['X% of Y', 'X is what % of Y', 'Change from X to Y'], 'X% of Y'), num('x', 'X', 15), num('y', 'Y', 200)], (o) => {
      need(o, 'x', 'y');
      if (o.mode === 'X% of Y') return `${r(o.x, 6)}% of ${r(o.y, 6)} = ${r(o.x, 6)} / 100 × ${r(o.y, 6)} = ${r(o.x / 100 * o.y, 6)}`;
      if (o.mode === 'X is what % of Y') { if (!o.y) throw new Error('Y cannot be 0'); return `${r(o.x, 6)} is ${r(o.x / o.y * 100, 6)}% of ${r(o.y, 6)}\nFormula: X / Y × 100`; }
      if (!o.x) throw new Error('X cannot be 0');
      const c = (o.y - o.x) / Math.abs(o.x) * 100;
      return `Change from ${r(o.x, 6)} to ${r(o.y, 6)} = ${r(c, 6)}% (${c >= 0 ? 'increase' : 'decrease'})\nFormula: (Y − X) / |X| × 100`;
    }),
  calc('percent-change', FIN, 'Percent Change Calculator', 'Percentage increase or decrease between two values.',
    [num('from', 'Old value', 80), num('to', 'New value', 100)], (o) => {
      need(o, 'from', 'to'); if (!o.from) throw new Error('Old value cannot be 0');
      const c = (o.to - o.from) / Math.abs(o.from) * 100;
      return `Change: ${r(o.to - o.from, 6)}\nPercent change: ${r(c, 4)}% (${c >= 0 ? 'increase' : 'decrease'})\nFormula: (new − old) / |old| × 100`;
    }),
  calc('discount-calculator', FIN, 'Discount Calculator', 'Sale price after one or two discounts, plus optional tax.',
    [num('price', 'Original price', 120), num('d1', 'Discount %', 25), num('d2', 'Extra discount % (0 = none)', 0), num('tax', 'Sales tax %', 0)], (o) => {
      need(o, 'price', 'd1', 'd2', 'tax');
      const a = o.price * (1 - o.d1 / 100), b = a * (1 - o.d2 / 100), t = b * o.tax / 100;
      return [`Original: ${m(o.price)}`, `After ${o.d1}%: ${m(a)}  (price × (1 − d/100))`, o.d2 ? `After extra ${o.d2}%: ${m(b)}` : null,
        `You save: ${m(o.price - b)} (${r((1 - b / o.price) * 100)}% total)`, o.tax ? `Tax ${o.tax}%: ${m(t)}` : null, `Final price: ${m(b + t)}`].filter((x) => x != null).join('\n');
    }),
  calc('compound-interest', FIN, 'Compound Interest Calculator', 'Growth with regular contributions, any compounding frequency, yearly table.',
    [num('p', 'Initial amount', 10000), num('rate', 'Annual rate %', 5), num('years', 'Years', 10),
      sel('freq', 'Compounding', ['Annually', 'Semiannually', 'Quarterly', 'Monthly', 'Daily'], 'Monthly'), num('pmt', 'Monthly contribution', 0)], (o) => {
      need(o, 'p', 'rate', 'years', 'pmt');
      const n = { Annually: 1, Semiannually: 2, Quarterly: 4, Monthly: 12, Daily: 365 }[o.freq];
      const im = Math.pow(1 + o.rate / 100 / n, n / 12) - 1, months = Math.round(o.years * 12);
      let bal = o.p, contrib = o.p; const rows = [];
      for (let k = 1; k <= months; k++) {
        bal = bal * (1 + im) + o.pmt; contrib += o.pmt;
        if (k % 12 === 0 || k === months) rows.push([r(k / 12, 2), m(contrib), m(bal - contrib), m(bal)]);
      }
      return `A = P(1 + r/n)^(n·t) [+ monthly contributions at month end, each growing at the same effective rate]\n` +
        `P=${m(o.p)}, r=${o.rate}%, n=${n}, t=${o.years}\n\nFinal balance: ${m(bal)}\nTotal contributed: ${m(contrib)}\nInterest earned: ${m(bal - contrib)}\n\n` +
        tbl(['Year', 'Contributed', 'Interest', 'Balance'], rows);
    }),
  calc('loan-calculator', FIN, 'Loan Calculator', 'Monthly payment, total interest and the first amortization rows.',
    [num('amt', 'Loan amount', 100000), num('rate', 'Annual rate %', 5), num('years', 'Term (years)', 30), num('rows', 'Schedule rows to show', 12)], (o) => {
      pos(o, 'amt', 'years'); need(o, 'rate', 'rows');
      const n = Math.round(o.years * 12), i = o.rate / 1200;
      const pay = i ? o.amt * i / (1 - Math.pow(1 + i, -n)) : o.amt / n;
      let bal = o.amt; const rows = [];
      for (let k = 1; k <= n; k++) {
        const int = bal * i, pr = pay - int; bal = Math.max(0, bal - pr);
        if (k <= o.rows) rows.push([k, m(pay), m(pr), m(int), m(bal)]);
      }
      return `Payment = P·i / (1 − (1+i)^−n), i = rate/12, n = months\n\nMonthly payment: ${m(pay)}\nTotal paid: ${m(pay * n)}\nTotal interest: ${m(pay * n - o.amt)}\nPayments: ${n}\n\n` +
        tbl(['#', 'Payment', 'Principal', 'Interest', 'Balance'], rows);
    }),
  calc('emi-calculator', FIN, 'EMI Calculator', 'Equated monthly installment for a loan.',
    [num('amt', 'Principal', 500000), num('rate', 'Annual rate %', 8.5), num('months', 'Tenure (months)', 60)], (o) => {
      pos(o, 'amt', 'months'); need(o, 'rate');
      const i = o.rate / 1200, e = i ? o.amt * i * Math.pow(1 + i, o.months) / (Math.pow(1 + i, o.months) - 1) : o.amt / o.months;
      return `EMI = P·i·(1+i)^n / ((1+i)^n − 1)\n\nEMI: ${m(e)}\nTotal payment: ${m(e * o.months)}\nTotal interest: ${m(e * o.months - o.amt)}`;
    }),
  calc('sip-calculator', FIN, 'SIP Calculator', 'Future value of a monthly systematic investment plan.',
    [num('pmt', 'Monthly investment', 500), num('rate', 'Expected annual return %', 12), num('years', 'Years', 10)], (o) => {
      pos(o, 'pmt', 'years'); need(o, 'rate');
      const n = Math.round(o.years * 12), i = o.rate / 1200;
      const fv = i ? o.pmt * ((Math.pow(1 + i, n) - 1) / i) * (1 + i) : o.pmt * n;
      return `FV = P × ((1+i)^n − 1)/i × (1+i), i = rate/12, n = months (payments at start of month)\n\nInvested: ${m(o.pmt * n)}\nEstimated returns: ${m(fv - o.pmt * n)}\nFuture value: ${m(fv)}`;
    }),
  calc('roi-calculator', FIN, 'ROI Calculator', 'Return on investment and annualized return.',
    [num('inv', 'Amount invested', 10000), num('fin', 'Final value', 15000), num('years', 'Years held (0 = skip)', 3)], (o) => {
      pos(o, 'inv'); need(o, 'fin', 'years');
      const roi = (o.fin - o.inv) / o.inv * 100;
      return `ROI = (final − invested) / invested × 100\n\nGain: ${m(o.fin - o.inv)}\nROI: ${r(roi, 3)}%` +
        (o.years > 0 && o.fin > 0 ? `\nAnnualized: ${r((Math.pow(o.fin / o.inv, 1 / o.years) - 1) * 100, 3)}%  ((final/invested)^(1/years) − 1)` : '');
    }),
  calc('markup-margin', FIN, 'Markup & Margin Calculator', 'Convert between cost, markup % and margin %.',
    [num('cost', 'Cost', 60), sel('mode', 'Given', ['Markup %', 'Margin %', 'Selling price'], 'Markup %'), num('v', 'Value', 50)], (o) => {
      pos(o, 'cost'); need(o, 'v');
      let price;
      if (o.mode === 'Markup %') price = o.cost * (1 + o.v / 100);
      else if (o.mode === 'Margin %') { if (o.v >= 100) throw new Error('Margin must be below 100%'); price = o.cost / (1 - o.v / 100); }
      else price = o.v;
      return `Markup = (price − cost)/cost; Margin = (price − cost)/price\n\nCost: ${m(o.cost)}\nSelling price: ${m(price)}\nProfit: ${m(price - o.cost)}\nMarkup: ${r((price - o.cost) / o.cost * 100, 3)}%\nMargin: ${r((price - o.cost) / price * 100, 3)}%`;
    }),
  calc('profit-margin', FIN, 'Profit Margin Calculator', 'Gross profit, margin and markup from revenue and cost.',
    [num('rev', 'Revenue', 1000), num('cost', 'Cost of goods / expenses', 650)], (o) => {
      pos(o, 'rev'); need(o, 'cost');
      return `Margin = (revenue − cost) / revenue × 100\n\nProfit: ${m(o.rev - o.cost)}\nProfit margin: ${r((o.rev - o.cost) / o.rev * 100, 3)}%\nMarkup on cost: ${o.cost ? r((o.rev - o.cost) / o.cost * 100, 3) + '%' : 'n/a'}`;
    }),
  calc('break-even', FIN, 'Break-Even Calculator', 'Units and revenue needed to cover fixed costs.',
    [num('fixed', 'Fixed costs', 5000), num('price', 'Price per unit', 25), num('vc', 'Variable cost per unit', 10)], (o) => {
      need(o, 'fixed', 'price', 'vc'); if (o.price <= o.vc) throw new Error('Price must exceed variable cost');
      const cm = o.price - o.vc, u = o.fixed / cm;
      return `Break-even units = fixed / (price − variable cost)\n\nContribution per unit: ${m(cm)} (${r(cm / o.price * 100)}%)\nBreak-even units: ${r(u)} → ${Math.ceil(u)} whole units\nBreak-even revenue: ${m(u * o.price)}`;
    }),
  calc('salary-hourly', FIN, 'Salary ↔ Hourly Converter', 'Convert between hourly, weekly, monthly and annual pay.',
    [num('amt', 'Amount', 25), sel('per', 'Amount is', ['Hourly', 'Weekly', 'Monthly', 'Annual'], 'Hourly'), num('hrs', 'Hours per week', 40), num('wks', 'Weeks per year', 52)], (o) => {
      pos(o, 'hrs', 'wks'); need(o, 'amt');
      const yr = { Hourly: o.amt * o.hrs * o.wks, Weekly: o.amt * o.wks, Monthly: o.amt * 12, Annual: o.amt }[o.per];
      return `Annual = hourly × hours/week × weeks\n\nHourly: ${m(yr / o.wks / o.hrs)}\nDaily (5d): ${m(yr / o.wks / 5)}\nWeekly: ${m(yr / o.wks)}\nBi-weekly: ${m(yr / o.wks * 2)}\nMonthly: ${m(yr / 12)}\nAnnual: ${m(yr)}`;
    }),
  calc('tip-calculator', FIN, 'Tip Calculator', 'Tip, total and per-person split.',
    [num('bill', 'Bill', 84.5), num('tip', 'Tip %', 18), num('n', 'People', 3), chk('round', 'Round total per person up')], (o) => {
      pos(o, 'bill', 'n'); need(o, 'tip');
      const t = o.bill * o.tip / 100, tot = o.bill + t; let per = tot / o.n; if (o.round) per = Math.ceil(per);
      return `Tip = bill × tip%\n\nTip: ${m(t)}\nTotal: ${m(tot)}\nPer person: ${m(per)}${o.round ? ' (rounded up)' : ''}\nTip per person: ${m(t / o.n)}`;
    }),
  calc('vat-calculator', FIN, 'VAT Calculator', 'Add VAT to a net price or remove it from a gross price.',
    [num('amt', 'Amount', 100), num('rate', 'VAT rate %', 21), sel('mode', 'Mode', ['Add VAT (amount is net)', 'Remove VAT (amount is gross)'])], (o) => {
      need(o, 'amt', 'rate');
      if (o.mode.startsWith('Add')) return `Gross = net × (1 + rate/100)\n\nNet: ${m(o.amt)}\nVAT ${o.rate}%: ${m(o.amt * o.rate / 100)}\nGross: ${m(o.amt * (1 + o.rate / 100))}`;
      const net = o.amt / (1 + o.rate / 100);
      return `Net = gross / (1 + rate/100)\n\nGross: ${m(o.amt)}\nVAT ${o.rate}%: ${m(o.amt - net)}\nNet: ${m(net)}`;
    }),
  calc('retirement-estimator', FIN, 'Retirement Estimator', 'Projected nest egg and sustainable income (4% rule).',
    [num('age', 'Current age', 35), num('ret', 'Retirement age', 65), num('sav', 'Current savings', 50000), num('pmt', 'Monthly contribution', 800),
      num('rate', 'Annual return %', 6), num('infl', 'Inflation %', 2.5), num('goal', "Desired monthly income (today's money)", 3000)], (o) => {
      need(o, 'age', 'ret', 'sav', 'pmt', 'rate', 'infl', 'goal'); if (o.ret <= o.age) throw new Error('Retirement age must exceed current age');
      const y = o.ret - o.age, n = y * 12, i = o.rate / 1200;
      const fv = o.sav * Math.pow(1 + i, n) + (i ? o.pmt * (Math.pow(1 + i, n) - 1) / i : o.pmt * n);
      const f = Math.pow(1 + o.infl / 100, y), real = fv / f, inc = real * 0.04 / 12, target = o.goal * 12 / 0.04;
      return `FV = S(1+i)^n + PMT((1+i)^n − 1)/i  (i = rate/12, n = ${n} months)\nReal value = FV / (1+inflation)^years\n\nNest egg at ${o.ret}: ${m(fv)}\nIn today's money: ${m(real)}\nSafe income (4% rule, today's money): ${m(inc)}/month\nNeeded for ${m(o.goal)}/month: ${m(target)} (today's money)\n` +
        (real >= target ? 'On track: surplus ' + m(real - target) : 'Shortfall: ' + m(target - real) + " (today's money)");
    }),
  calc('savings-goal', FIN, 'Savings Goal Calculator', 'Monthly saving needed to reach a target.',
    [num('goal', 'Goal amount', 20000), num('cur', 'Already saved', 2000), num('rate', 'Annual return %', 3), num('years', 'Years', 5)], (o) => {
      need(o, 'goal', 'cur', 'rate'); pos(o, 'years');
      const n = Math.round(o.years * 12), i = o.rate / 1200, g = Math.pow(1 + i, n);
      const pmt = i ? (o.goal - o.cur * g) * i / (g - 1) : (o.goal - o.cur) / n;
      return `PMT = (goal − saved·(1+i)^n) · i / ((1+i)^n − 1)\n\n` + (pmt <= 0 ? 'Your current savings already reach the goal with growth alone.' : `Monthly saving needed: ${m(pmt)}\nTotal deposits: ${m(pmt * n)}\nGrowth: ${m(o.goal - o.cur - pmt * n)}`);
    }),
  calc('inflation-calculator', FIN, 'Inflation Calculator', 'Future cost and lost purchasing power at a constant rate.',
    [num('amt', 'Amount today', 1000), num('rate', 'Inflation % per year', 3), num('years', 'Years', 10)], (o) => {
      need(o, 'amt', 'rate', 'years'); const f = Math.pow(1 + o.rate / 100, o.years);
      return `Future cost = amount × (1+rate)^years\n\n${m(o.amt)} today costs ${m(o.amt * f)} in ${o.years} years.\n${m(o.amt)} in ${o.years} years buys what ${m(o.amt / f)} buys today.\nPurchasing power lost: ${r((1 - 1 / f) * 100)}%`;
    }),
  calc('simple-interest', FIN, 'Simple Interest Calculator', 'Interest = P × r × t.',
    [num('p', 'Principal', 5000), num('rate', 'Annual rate %', 4), num('years', 'Years', 3)], (o) => {
      need(o, 'p', 'rate', 'years'); const i = o.p * o.rate / 100 * o.years;
      return `I = P × r × t = ${m(o.p)} × ${o.rate / 100} × ${o.years}\n\nInterest: ${m(i)}\nTotal: ${m(o.p + i)}`;
    }),
];

// ---------- Health ----------
const NOTE = '\n\nNote: informational estimate only, not medical advice. Consult a professional.';
const ACT = { 'Sedentary (×1.2)': 1.2, 'Light, 1-3 days/wk (×1.375)': 1.375, 'Moderate, 3-5 days/wk (×1.55)': 1.55, 'Very active, 6-7 days/wk (×1.725)': 1.725, 'Extra active (×1.9)': 1.9 };
const health = [
  calc('bmi-calculator', HEA, 'BMI Calculator', 'Body mass index with WHO category.',
    [sel('u', 'Units', ['Metric (kg, cm)', 'Imperial (lb, in)']), num('w', 'Weight', 70), num('h', 'Height', 175)], (o) => {
      pos(o, 'w', 'h'); const imp = o.u.startsWith('Imp');
      const kg = imp ? o.w * 0.45359237 : o.w, cm = imp ? o.h * 2.54 : o.h, b = kg / (cm / 100) ** 2;
      const cat = b < 18.5 ? 'Underweight' : b < 25 ? 'Normal weight' : b < 30 ? 'Overweight' : 'Obese';
      return `BMI = kg / m²\n\nBMI: ${b.toFixed(1)}\nCategory: ${cat}\nHealthy weight range for this height: ${(18.5 * (cm / 100) ** 2).toFixed(1)}–${(24.9 * (cm / 100) ** 2).toFixed(1)} kg` + NOTE;
    }),
  calc('bmr-tdee', HEA, 'BMR & TDEE Calculator', 'Mifflin-St Jeor basal metabolic rate and daily calories.',
    [sel('sex', 'Sex', ['Male', 'Female']), num('age', 'Age', 30), num('w', 'Weight (kg)', 70), num('h', 'Height (cm)', 175), sel('act', 'Activity', Object.keys(ACT), 'Moderate, 3-5 days/wk (×1.55)')], (o) => {
      pos(o, 'age', 'w', 'h'); const bmr = 10 * o.w + 6.25 * o.h - 5 * o.age + (o.sex === 'Male' ? 5 : -161), t = bmr * ACT[o.act];
      return `BMR = 10·kg + 6.25·cm − 5·age ${o.sex === 'Male' ? '+ 5' : '− 161'}   (Mifflin-St Jeor)\nTDEE = BMR × activity factor\n\nBMR: ${r(bmr, 0)} kcal/day\nTDEE (maintenance): ${r(t, 0)} kcal/day\nMild loss (−10%): ${r(t * 0.9, 0)}\nLose ~0.5 kg/wk (−500): ${r(t - 500, 0)}\nGain ~0.5 kg/wk (+500): ${r(t + 500, 0)}` + NOTE;
    }),
  calc('body-fat-navy', HEA, 'Body Fat Calculator (US Navy)', 'Body fat % from tape measurements (cm).',
    [sel('sex', 'Sex', ['Male', 'Female']), num('h', 'Height (cm)', 178), num('neck', 'Neck (cm)', 38), num('waist', 'Waist at navel (cm)', 85), num('hip', 'Hip (cm, women)', 95)], (o) => {
      pos(o, 'h', 'neck', 'waist');
      const f = o.sex === 'Male' ? (o.waist > o.neck ? 495 / (1.0324 - 0.19077 * Math.log10(o.waist - o.neck) + 0.15456 * Math.log10(o.h)) - 450 : NaN)
        : (o.waist + o.hip > o.neck ? 495 / (1.29579 - 0.35004 * Math.log10(o.waist + o.hip - o.neck) + 0.221 * Math.log10(o.h)) - 450 : NaN);
      if (!Number.isFinite(f)) throw new Error('Check measurements (waist must exceed neck)');
      return `Navy method: BF% = 495 / (1.0324 − 0.19077·log10(waist−neck) + 0.15456·log10(height)) − 450 (men)\n(women use waist+hip−neck with 1.29579, 0.35004, 0.22100)\n\nEstimated body fat: ${f.toFixed(1)}%` + NOTE;
    }),
  calc('macro-calculator', HEA, 'Macro Calculator', 'Split calories into carbs, protein and fat grams.',
    [num('cal', 'Daily calories', 2200), sel('split', 'Split (carb/protein/fat)', ['Balanced 40/30/30', 'Low-carb 25/35/40', 'High-protein 30/40/30', 'Keto 5/25/70', 'High-carb 55/20/25'])], (o) => {
      pos(o, 'cal'); const [c, p, f] = o.split.split(' ').pop().split('/').map(Number);
      return `Carbs & protein = 4 kcal/g, fat = 9 kcal/g\n\nCarbs (${c}%): ${r(o.cal * c / 100 / 4, 0)} g\nProtein (${p}%): ${r(o.cal * p / 100 / 4, 0)} g\nFat (${f}%): ${r(o.cal * f / 100 / 9, 0)} g` + NOTE;
    }),
  calc('due-date-calculator', HEA, 'Pregnancy Due Date Calculator', 'Estimated due date from last period or conception date.',
    [sel('mode', 'Based on', ['Last menstrual period (LMP)', 'Conception date']), dat('date', 'Date', '2026-01-10'), num('cycle', 'Cycle length (days, LMP only)', 28)], (o) => {
      const d = D(o.date), lmp = o.mode.startsWith('Last') ? addDays(d, -(o.cycle - 28)) : addDays(d, -14), due = addDays(lmp, 280);
      const ga = Math.floor((todayUTC() - lmp) / 864e5);
      return `Due date = LMP + 280 days (conception + 266), adjusted for cycle length\n\nDue date: ${dstr(due)}\nEstimated LMP: ${iso(lmp)}\nEnd of 1st trimester (wk 13): ${iso(addDays(lmp, 91))}\nEnd of 2nd trimester (wk 27): ${iso(addDays(lmp, 189))}\n` +
        (ga >= 0 && ga <= 300 ? `Today: ${Math.floor(ga / 7)} weeks ${ga % 7} days` : 'Today is outside the pregnancy window.') + NOTE;
    }),
  calc('water-intake', HEA, 'Daily Water Intake Calculator', 'Rough daily hydration target.',
    [num('w', 'Weight (kg)', 70), num('ex', 'Exercise minutes per day', 30)], (o) => {
      pos(o, 'w'); need(o, 'ex'); const l = o.w * 0.033 + o.ex / 30 * 0.35;
      return `Water ≈ 0.033 L × kg + 0.35 L per 30 min exercise\n\nTarget: ${l.toFixed(2)} L/day (${r(l * 33.814, 0)} fl oz, about ${Math.round(l / 0.25)} cups)` + NOTE;
    }),
  calc('ideal-weight', HEA, 'Ideal Weight Calculator', 'Devine, Robinson, Miller and Hamwi formulas.',
    [sel('sex', 'Sex', ['Male', 'Female']), num('h', 'Height (cm)', 175)], (o) => {
      pos(o, 'h'); const inch = o.h / 2.54 - 60, M = o.sex === 'Male';
      if (inch < 0) throw new Error('Formulas apply to heights over 152.4 cm (5 ft)');
      const rows = [['Devine', M ? 50 + 2.3 * inch : 45.5 + 2.3 * inch], ['Robinson', M ? 52 + 1.9 * inch : 49 + 1.7 * inch], ['Miller', M ? 56.2 + 1.41 * inch : 53.1 + 1.36 * inch], ['Hamwi', M ? 48 + 2.7 * inch : 45.4 + 2.2 * inch]];
      const bm = (o.h / 100) ** 2;
      return `Inches over 5 ft = ${inch.toFixed(1)}\n\n` + rows.map(([n, v]) => `${n}: ${v.toFixed(1)} kg (${(v * 2.20462).toFixed(1)} lb)`).join('\n') + `\nHealthy BMI range (18.5–24.9): ${(18.5 * bm).toFixed(1)}–${(24.9 * bm).toFixed(1)} kg` + NOTE;
    }),
  calc('heart-rate-zones', HEA, 'Heart Rate Zones', 'Training zones from max heart rate (Karvonen if resting HR given).',
    [num('age', 'Age', 35), num('rest', 'Resting HR (0 = skip)', 60)], (o) => {
      pos(o, 'age'); need(o, 'rest'); const mx = 220 - o.age, k = o.rest > 0;
      const z = [['1 Very light', 50, 60], ['2 Light (fat burn)', 60, 70], ['3 Moderate (aerobic)', 70, 80], ['4 Hard (threshold)', 80, 90], ['5 Maximum', 90, 100]];
      return `Max HR = 220 − age = ${mx} bpm (Tanaka: ${Math.round(208 - 0.7 * o.age)})\n` + (k ? `Karvonen: target = rest + %·(max − rest), rest ${o.rest}\n` : 'Zones = % of max HR\n') + '\n' +
        z.map(([n, a, b]) => { const f = (p) => Math.round(k ? o.rest + p / 100 * (mx - o.rest) : p / 100 * mx); return `Zone ${n}: ${a}-${b}%  ${f(a)}–${f(b)} bpm`; }).join('\n') + NOTE;
    }),
];

// ---------- Everyday ----------
const U = { // factors to base unit
  Length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254, nmi: 1852 },
  Mass: { kg: 1, g: 0.001, mg: 1e-6, lb: 0.45359237, oz: 0.028349523125, t: 1000, st: 6.35029318 },
  Temperature: { C: 1, F: 1, K: 1 },
  Volume: { L: 1, mL: 0.001, m3: 1000, 'gal(US)': 3.785411784, qt: 0.946352946, pt: 0.473176473, cup: 0.2365882365, floz: 0.0295735295625, tbsp: 0.01478676478125, tsp: 0.00492892159375 },
  Area: { m2: 1, km2: 1e6, ha: 1e4, acre: 4046.8564224, ft2: 0.09290304, in2: 0.00064516, yd2: 0.83612736, mi2: 2589988.110336 },
  Speed: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, knot: 1852 / 3600, 'ft/s': 0.3048 },
  Data: { bit: 1 / 8, B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1048576, GiB: 1073741824, TiB: 1099511627776 },
  Time: { ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, week: 604800, year: 31557600 },
  Energy: { J: 1, kJ: 1000, cal: 4.184, kcal: 4184, Wh: 3600, kWh: 3.6e6, BTU: 1055.05585262 },
  Pressure: { Pa: 1, kPa: 1000, bar: 1e5, atm: 101325, psi: 6894.757293168, mmHg: 133.322387415 },
};
const allUnits = [...new Set(Object.values(U).flatMap(Object.keys))];
const toK = (v, u) => (u === 'C' ? v + 273.15 : u === 'F' ? (v - 32) * 5 / 9 + 273.15 : v);
const fromK = (k, u) => (u === 'C' ? k - 273.15 : u === 'F' ? (k - 273.15) * 9 / 5 + 32 : k);
const cvt = (cat, v, a, b) => (cat === 'Temperature' ? fromK(toK(v, a), b) : v * U[cat][a] / U[cat][b]);

const GR = { 'A+': 4, A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7, 'C+': 2.3, C: 2, 'C-': 1.7, 'D+': 1.3, D: 1, 'D-': 0.7, F: 0 };
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const frac = (s) => {
  const t = String(s).trim(); let mt;
  if ((mt = /^(-?\d+)\s+(\d+)\/(\d+)$/.exec(t))) { const w = +mt[1], d = +mt[3]; if (!d) throw new Error('Zero denominator'); return [(Math.abs(w) * d + +mt[2]) * (t[0] === '-' ? -1 : 1), d]; }
  if ((mt = /^(-?\d+)\/(-?\d+)$/.exec(t))) { if (!+mt[2]) throw new Error('Zero denominator'); return [+mt[1], +mt[2]]; }
  if ((mt = /^-?\d+(\.\d+)?$/.exec(t))) { const dp = (mt[1] || '').length - 1, d = Math.pow(10, Math.max(dp, 0)); return [Math.round(+t * d), d]; }
  throw new Error('Invalid fraction: ' + t + ' (use 3/4, 1 1/2, 2.5)');
};
const fstr = (n, d) => {
  if (d < 0) { n = -n; d = -d; } const g = gcd(n, d) || 1; n /= g; d /= g;
  const w = Math.trunc(n / d), rem = Math.abs(n % d);
  return `${d === 1 ? n : n + '/' + d}` + (d !== 1 && Math.abs(w) ? `  =  ${w} ${rem}/${d}` : '') + `  =  ${r(n / d, 8)}`;
};

// safe recursive-descent expression evaluator
function evalExpr(src, deg) {
  const toks = []; const re = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|([A-Za-z_]\w*)|(.))/gy; let mt;
  while (re.lastIndex < src.length && (mt = re.exec(src))) {
    if (mt[1] != null) toks.push({ n: parseFloat(mt[1]) }); else if (mt[2]) toks.push({ id: mt[2].toLowerCase() }); else if (mt[3]) toks.push({ op: mt[3] });
  }
  let p = 0; const peek = () => toks[p], isOp = (c) => peek() && peek().op === c;
  const ang = (x) => (deg ? x * Math.PI / 180 : x), back = (x) => (deg ? x * 180 / Math.PI : x);
  const F = { sqrt: Math.sqrt, sin: (x) => Math.sin(ang(x)), cos: (x) => Math.cos(ang(x)), tan: (x) => Math.tan(ang(x)), asin: (x) => back(Math.asin(x)), acos: (x) => back(Math.acos(x)), atan: (x) => back(Math.atan(x)),
    ln: Math.log, log: Math.log10, log2: Math.log2, abs: Math.abs, exp: Math.exp, floor: Math.floor, ceil: Math.ceil, round: Math.round, cbrt: Math.cbrt };
  const C = { pi: Math.PI, e: Math.E };
  const startsOperand = (t) => t && (t.n != null || t.id || t.op === '(');
  function expr() { let v = term(); while (isOp('+') || isOp('-')) { const o = toks[p++].op; const t = term(); v = o === '+' ? v + t : v - t; } return v; }
  function term() {
    let v = unary();
    for (;;) {
      if (isOp('*')) { p++; v *= unary(); } else if (isOp('/')) { p++; v /= unary(); }
      else if (isOp('%') && startsOperand(toks[p + 1])) { p++; v %= unary(); }
      else if (isOp('%')) { p++; v /= 100; } else return v;
    }
  }
  function unary() { if (isOp('-')) { p++; return -unary(); } if (isOp('+')) { p++; return unary(); } return power(); }
  function power() { const b = atom(); if (isOp('^')) { p++; return Math.pow(b, unary()); } return b; }
  function atom() {
    const t = toks[p++]; if (!t) throw new Error('Unexpected end of expression');
    if (t.n != null) return t.n;
    if (t.op === '(') { const v = expr(); if (!isOp(')')) throw new Error('Missing )'); p++; return v; }
    if (t.id) {
      if (t.id in F && isOp('(')) { p++; const v = expr(); if (!isOp(')')) throw new Error('Missing )'); p++; return F[t.id](v); }
      if (Object.hasOwn(C, t.id)) return C[t.id];
      throw new Error('Unknown name: ' + t.id);
    }
    throw new Error('Unexpected "' + t.op + '"');
  }
  const v = expr(); if (p < toks.length) throw new Error('Unexpected "' + (toks[p].op || toks[p].id || toks[p].n) + '"'); return v;
}

const SHOE = [['Men', [['6', '5.5', '39', '24.5'], ['7', '6.5', '40', '25.4'], ['8', '7.5', '41', '26.0'], ['9', '8.5', '42', '26.7'], ['10', '9.5', '43.5', '27.6'], ['11', '10.5', '45', '28.6'], ['12', '11.5', '46', '29.5']]],
  ['Women', [['5', '3', '35.5', '22.0'], ['6', '4', '37', '23.0'], ['7', '5', '38', '24.0'], ['8', '6', '39', '24.8'], ['9', '7', '40.5', '25.7'], ['10', '8', '42', '26.7']]]];
const everyday = [
  calc('unit-converter', EVR, 'Unit Converter', 'Length, mass, temperature, volume, area, speed, data, time, energy, pressure.',
    [sel('cat', 'Category', Object.keys(U), 'Length'), num('v', 'Value', 1), sel('from', 'From', allUnits, 'km'), sel('to', 'To', allUnits, 'mi')], (o) => {
      need(o, 'v'); const c = U[o.cat];
      if (!(o.from in c) || !(o.to in c)) throw new Error(`Pick ${o.cat} units for From/To: ${Object.keys(c).join(', ')}`);
      return `${r(o.v, 10)} ${o.from} = ${r(cvt(o.cat, o.v, o.from, o.to), 10)} ${o.to}\n\nAll ${o.cat.toLowerCase()} units:\n` + Object.keys(c).map((u) => `  ${r(cvt(o.cat, o.v, o.from, u), 8)} ${u}`).join('\n');
    }),
  calc('age-calculator', EVR, 'Age Calculator', 'Exact age in years, months and days.',
    [dat('dob', 'Date of birth', '1990-06-15'), dat('on', 'Age at date (blank = today)', '')], (o) => {
      const b = D(o.dob), t = o.on ? D(o.on) : todayUTC(); if (b > t) throw new Error('Birth date is after the target date');
      const a = ymd(b, t); let nb = new Date(Date.UTC(t.getUTCFullYear(), b.getUTCMonth(), Math.min(b.getUTCDate(), dim(t.getUTCFullYear(), b.getUTCMonth())))); if (nb <= t && iso(nb) !== iso(t)) nb = new Date(Date.UTC(t.getUTCFullYear() + 1, b.getUTCMonth(), Math.min(b.getUTCDate(), dim(t.getUTCFullYear() + 1, b.getUTCMonth()))));
      const days = Math.round((t - b) / 864e5);
      return `Age: ${a.y} years, ${a.mo} months, ${a.d} days\nTotal: ${r(days)} days (${r(days / 7, 1)} weeks, ${r(a.y * 12 + a.mo)} months)\nBorn on a ${wd(b)}\nNext birthday: ${dstr(nb)}, in ${Math.round((nb - t) / 864e5)} days`;
    }),
  calc('date-difference', EVR, 'Date Difference Calculator', 'Years, months, days and total days between two dates.',
    [dat('a', 'From', '2026-01-01'), dat('b', 'To', '2026-12-25')], (o) => {
      let a = D(o.a), b = D(o.b), neg = false; if (a > b) { [a, b] = [b, a]; neg = true; }
      const x = ymd(a, b), days = Math.round((b - a) / 864e5);
      return `${neg ? '(dates swapped) ' : ''}${x.y} years, ${x.mo} months, ${x.d} days\nTotal days: ${r(days)}\nWeeks: ${Math.floor(days / 7)} weeks ${days % 7} days\nHours: ${r(days * 24)}`;
    }),
  calc('add-subtract-dates', EVR, 'Add / Subtract Dates', 'Add or subtract years, months, weeks and days.',
    [dat('d', 'Start date', '2026-01-31'), sel('op', 'Operation', ['Add', 'Subtract']), num('y', 'Years', 0), num('mo', 'Months', 1), num('w', 'Weeks', 0), num('dd', 'Days', 10)], (o) => {
      need(o, 'y', 'mo', 'w', 'dd'); const s = o.op === 'Add' ? 1 : -1;
      const res = addDays(addMonths(D(o.d), s * (o.y * 12 + o.mo)), s * (o.w * 7 + o.dd));
      return `${iso(D(o.d))} ${o.op === 'Add' ? '+' : '−'} ${o.y}y ${o.mo}m ${o.w}w ${o.dd}d\n\nResult: ${dstr(res)}`;
    }),
  calc('business-days', EVR, 'Business Days Calculator', 'Count weekdays between two dates, excluding holidays.',
    [dat('a', 'Start', '2026-01-01'), dat('b', 'End', '2026-01-31'), chk('incl', 'Include end date', true), txt('hol', 'Holidays (YYYY-MM-DD, comma separated)', '2026-01-01')], (o) => {
      let a = D(o.a), b = D(o.b); if (a > b) [a, b] = [b, a];
      const hol = new Set(o.hol.split(/[\s,;]+/).filter(Boolean).map((h) => iso(D(h)))); let bd = 0, h = 0, we = 0;
      for (let d = a; o.incl ? d <= b : d < b; d = addDays(d, 1)) {
        const w = d.getUTCDay(); if (w === 0 || w === 6) we++; else if (hol.has(iso(d))) h++; else bd++;
      }
      return `${iso(a)} → ${iso(b)}${o.incl ? ' (inclusive)' : ''}\n\nBusiness days: ${bd}\nWeekend days: ${we}\nHolidays on weekdays: ${h}\nCalendar days: ${Math.round((b - a) / 864e5) + (o.incl ? 1 : 0)}`;
    }),
  calc('day-of-week', EVR, 'Day of the Week Calculator', 'Which weekday a date falls on.', [dat('d', 'Date', '2026-07-04')], (o) => {
    const d = D(o.d), y0 = Date.UTC(d.getUTCFullYear(), 0, 0); return `${iso(d)} is a ${wd(d)}\nDay of year: ${Math.round((d - y0) / 864e5)}\nLeap year: ${dim(d.getUTCFullYear(), 1) === 29 ? 'yes' : 'no'}`;
  }),
  calc('week-number', EVR, 'Week Number Calculator', 'ISO 8601 week number of a date.', [dat('d', 'Date', '2026-03-15')], (o) => {
    const d = D(o.d), t = new Date(d), dn = (d.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - dn + 3);
    const ft = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)), wk = 1 + Math.round(((t - ft) / 864e5 - 3 + ((ft.getUTCDay() + 6) % 7)) / 7);
    return `${iso(d)} (${wd(d)}) is in ISO week ${wk} of ${t.getUTCFullYear()}\nISO weeks start on Monday; week 1 contains the first Thursday of the year.`;
  }),
  calc('countdown-to-date', EVR, 'Countdown to Date', 'Time remaining until a date and time.', [{ id: 't', label: 'Target (local time)', type: 'datetime-local', def: '2027-01-01T00:00' }], (o) => {
    const t = new Date(o.t); if (isNaN(t)) throw new Error('Enter a valid date and time');
    const s = (t - Date.now()) / 1000; return s >= 0 ? `Until ${o.t}: ${dur(s)}\n(${r(s / 86400, 2)} days, ${r(s / 3600, 1)} hours)` : `${o.t} was ${dur(-s)} ago.`;
  }),
  { id: 'gpa-calculator', cat: EVR, title: 'GPA Calculator', desc: 'Weighted 4.0-scale GPA from "grade credits" lines.', inputs: 1, labels: ['One course per line: [name] grade credits'],
    sample: 'Calculus A 4\nHistory B+ 3\nChemistry C 4\nArt A- 2', opts: [],
    run: ([t]) => {
      let pts = 0, cr = 0;
      for (const l of lines(t)) {
        const w = l.split(/\s+/), c = parseFloat(w.pop()), g = w.pop() || ''; const gp = g.toUpperCase() in GR ? GR[g.toUpperCase()] : Number(g);
        if (!(c > 0) || !Number.isFinite(gp) || g === '') throw new Error('Bad line: "' + l + '" (expected: grade credits, e.g. B+ 3)');
        pts += gp * c; cr += c;
      }
      if (!cr) throw new Error('Enter at least one course');
      return `GPA = Σ(grade points × credits) / Σ credits\nScale: A 4.0, A- 3.7, B+ 3.3, B 3.0 ... D 1.0, F 0\n\nCredits: ${cr}\nQuality points: ${r(pts, 2)}\nGPA: ${(pts / cr).toFixed(2)}`;
    } },
  calc('fraction-calculator', EVR, 'Fraction Calculator', 'Add, subtract, multiply, divide fractions and mixed numbers.',
    [txt('a', 'Fraction A (3/4, 1 1/2, 2.5)', '3/4'), sel('op', 'Operation', ['+', '−', '×', '÷']), txt('b', 'Fraction B', '2/3')], (o) => {
      const [an, ad] = frac(o.a), [bn, bd] = frac(o.b); let n, d;
      if (o.op === '+') { n = an * bd + bn * ad; d = ad * bd; } else if (o.op === '−') { n = an * bd - bn * ad; d = ad * bd; }
      else if (o.op === '×') { n = an * bn; d = ad * bd; } else { if (!bn) throw new Error('Cannot divide by zero'); n = an * bd; d = ad * bn; }
      return `${an}/${ad} ${o.op} ${bn}/${bd}\n\n= ${fstr(n, d)}`;
    }),
  { id: 'scientific-expression-calculator', cat: EVR, title: 'Scientific Calculator', desc: 'Evaluate expressions: + - * / ^ % ( ) sqrt sin cos tan ln log abs pi e. One per line.', inputs: 1, labels: ['Expression(s)'],
    placeholder: ['2 * (3 + 4)^2 / sqrt(16)'], sample: '2 * (3 + 4)^2 / sqrt(16)\nsin(pi/2) + ln(e)\n17 % 5\n50% * 80',
    opts: [sel('angle', 'Angle unit', ['Radians', 'Degrees'])],
    run: ([t], o) => {
      const ls = lines(t); if (!ls.length) throw new Error('Enter an expression');
      return ls.map((l) => { const v = evalExpr(l, o.angle === 'Degrees'); return `${l} = ${Number.isInteger(v) ? v : +v.toPrecision(12)}`; }).join('\n');
    } },
  { id: 'average-median-mode', cat: EVR, title: 'Average, Median & Mode', desc: 'Statistics for a list of numbers.', inputs: 1, labels: ['Numbers (space, comma or newline separated)'], sample: '4, 8, 15, 16, 23, 42, 8', opts: [],
    run: ([t]) => {
      const a = t.split(/[\s,;]+/).filter(Boolean).map(Number); if (!a.length || a.some((x) => !Number.isFinite(x))) throw new Error('Enter numbers only');
      const s = [...a].sort((x, y) => x - y), n = s.length, sum = a.reduce((x, y) => x + y, 0), mean = sum / n, med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
      const cnt = new Map(); a.forEach((x) => cnt.set(x, (cnt.get(x) || 0) + 1)); const mx = Math.max(...cnt.values());
      const vp = a.reduce((x, y) => x + (y - mean) ** 2, 0) / n;
      return `Count: ${n}\nSum: ${r(sum, 10)}\nMean: ${r(mean, 10)}\nMedian: ${r(med, 10)}\nMode: ${mx === 1 ? 'none (all unique)' : [...cnt].filter(([, c]) => c === mx).map(([v]) => v).join(', ') + ` (×${mx})`}\nMin: ${s[0]}  Max: ${s[n - 1]}  Range: ${r(s[n - 1] - s[0], 10)}\nStd dev (population): ${r(Math.sqrt(vp), 8)}\nStd dev (sample): ${n > 1 ? r(Math.sqrt(vp * n / (n - 1)), 8) : 'n/a'}`;
    } },
  { id: 'chmod-calculator', cat: EVR, title: 'chmod Calculator', desc: 'Convert between octal (755) and symbolic (rwxr-xr-x) permissions.', inputs: 1, labels: ['Octal (e.g. 755) or symbolic (rwxr-xr-x)'], sample: '755', opts: [],
    run: ([t]) => {
      t = t.trim(); let oct;
      if (/^[0-7]{3,4}$/.test(t)) oct = t.slice(-3); else if (/^[-rwxsStT]{9}$/.test(t)) oct = [0, 3, 6].map((i) => [...t.slice(i, i + 3)].reduce((s, c, k) => s + (c !== '-' && c !== 'S' && c !== 'T' ? [4, 2, 1][k] : 0), 0)).join('');
      else throw new Error('Use octal like 644 or symbolic like rw-r--r--');
      const sym = [...oct].map((d) => 'rwx'.split('').map((c, k) => (d & [4, 2, 1][k] ? c : '-')).join('')).join(''), who = ['Owner', 'Group', 'Others'];
      return `Octal: ${oct}\nSymbolic: ${sym}\n\n` + [...oct].map((d, i) => `${who[i]}: ${sym.slice(i * 3, i * 3 + 3)}  (read ${d & 4 ? 'yes' : 'no'}, write ${d & 2 ? 'yes' : 'no'}, execute ${d & 1 ? 'yes' : 'no'})`).join('\n') + `\n\nCommand: chmod ${oct} filename`;
    } },
  calc('bandwidth-download-time', EVR, 'Download Time Calculator', 'Time to transfer a file at a given connection speed.',
    [num('size', 'File size', 4.7), sel('su', 'Size unit', ['KB', 'MB', 'GB', 'TB'], 'GB'), num('speed', 'Speed', 100), sel('bu', 'Speed unit', ['kbps', 'Mbps', 'Gbps', 'MB/s'], 'Mbps'), num('ov', 'Protocol overhead %', 5)], (o) => {
      pos(o, 'size', 'speed'); need(o, 'ov');
      const bits = o.size * { KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 }[o.su] * 8, bps = o.speed * { kbps: 1e3, Mbps: 1e6, Gbps: 1e9, 'MB/s': 8e6 }[o.bu] * (1 - o.ov / 100);
      return `Time = size (bits) / (speed × (1 − overhead))\n(1 byte = 8 bits, decimal units)\n\nDownload time: ${dur(bits / bps)}\nEffective speed: ${r(bps / 1e6, 2)} Mbps (${r(bps / 8e6, 2)} MB/s)`;
    }),
  calc('fuel-cost', EVR, 'Fuel Cost Calculator', 'Trip fuel use and cost.',
    [num('dist', 'Distance', 500), sel('du', 'Distance unit', ['km', 'miles']), num('cons', 'Consumption', 7), sel('cu', 'Consumption unit', ['L/100km', 'km/L', 'mpg (US)']), num('price', 'Price per litre (or per US gallon for mpg)', 1.8)], (o) => {
      pos(o, 'dist', 'cons'); need(o, 'price');
      const km = o.du === 'km' ? o.dist : o.dist * 1.609344, mi = km / 1.609344; let fuel, u;
      if (o.cu === 'L/100km') { fuel = km * o.cons / 100; u = 'L'; } else if (o.cu === 'km/L') { fuel = km / o.cons; u = 'L'; } else { fuel = mi / o.cons; u = 'US gal'; }
      return `Fuel = distance × consumption (converted)\n\nFuel needed: ${r(fuel, 2)} ${u}\nTotal cost: ${m(fuel * o.price)}\nCost per ${o.du === 'km' ? 'km' : 'mile'}: ${m(fuel * o.price / o.dist)}`;
    }),
  calc('clothing-shoe-size-chart', EVR, 'Clothing & Shoe Size Chart', 'Reference conversion tables (approximate).', [sel('chart', 'Chart', ['Shoes', 'Clothing (tops)'])], (o) => {
    if (o.chart === 'Shoes') return SHOE.map(([n, rows]) => `${n}\n` + tbl(['US', 'UK', 'EU', 'Foot cm'], rows)).join('\n\n') + '\n\nSizes vary by brand; measure your foot and check the brand chart.';
    return tbl(['Size', 'Chest (cm)', 'Chest (in)', 'EU', 'US'], [['XS', '81-86', '32-34', '44', '34'], ['S', '86-94', '34-37', '46-48', '36'], ['M', '94-102', '37-40', '50-52', '38-40'], ['L', '102-110', '40-43', '54-56', '42'], ['XL', '110-118', '43-46', '58-60', '44-46'], ['XXL', '118-126', '46-50', '62-64', '48']]) + '\n\nApproximate men\'s tops; brands differ.';
  }),
  calc('screen-size-ppi', EVR, 'Screen Size & PPI Calculator', 'Pixel density and physical size from resolution and diagonal.',
    [num('w', 'Width (px)', 2560), num('h', 'Height (px)', 1440), num('d', 'Diagonal (inches)', 27)], (o) => {
      pos(o, 'w', 'h', 'd'); const hyp = Math.hypot(o.w, o.h), ppi = hyp / o.d, wi = o.d * o.w / hyp, hi = o.d * o.h / hyp, g = gcd(o.w, o.h);
      return `PPI = √(w² + h²) / diagonal\n\nPPI: ${ppi.toFixed(1)}\nSize: ${wi.toFixed(2)} × ${hi.toFixed(2)} in (${(wi * 2.54).toFixed(1)} × ${(hi * 2.54).toFixed(1)} cm)\nPixel pitch: ${(25.4 / ppi).toFixed(3)} mm\nAspect ratio: ${o.w / g}:${o.h / g}\nMegapixels: ${(o.w * o.h / 1e6).toFixed(2)}`;
    }),
];

// ---------- Build ----------
const build = [
  calc('concrete-calculator', BLD, 'Concrete Calculator', 'Concrete volume and bag count for a slab.',
    [num('l', 'Length (m)', 4), num('w', 'Width (m)', 3), num('t', 'Thickness (cm)', 10), num('waste', 'Waste %', 10)], (o) => {
      pos(o, 'l', 'w', 't'); need(o, 'waste'); const v = o.l * o.w * o.t / 100, vw = v * (1 + o.waste / 100);
      return `Volume = L × W × thickness\n\nVolume: ${v.toFixed(3)} m³ (${(v * 1.30795).toFixed(2)} yd³)\nWith ${o.waste}% waste: ${vw.toFixed(3)} m³ (${(vw * 1.30795).toFixed(2)} yd³)\nBags: ${Math.ceil(vw / 0.017)} × 80 lb (36 kg) bags at ≈0.017 m³ (0.6 ft³) each\nBags: ${Math.ceil(vw / 0.0075)} × ≈ 25 kg premix bags at ≈0.0075 m³ each (check bag label)`;
    }),
  calc('brick-calculator', BLD, 'Brick Calculator', 'Bricks needed for a wall (215×65 mm face, 10 mm mortar).',
    [num('l', 'Wall length (m)', 6), num('h', 'Wall height (m)', 2.4), num('open', 'Openings area (m²)', 3), num('waste', 'Waste %', 5), num('bw', 'Brick length (mm)', 215), num('bh', 'Brick height (mm)', 65), num('mort', 'Mortar joint (mm)', 10)], (o) => {
      pos(o, 'l', 'h', 'bw', 'bh'); need(o, 'open', 'waste', 'mort');
      const area = Math.max(0, o.l * o.h - o.open), per = 1e6 / ((o.bw + o.mort) * (o.bh + o.mort)), n = area * per;
      return `Bricks per m² = 1,000,000 / ((L+joint) × (H+joint))\n\nNet wall area: ${area.toFixed(2)} m²\nBricks per m²: ${per.toFixed(1)}\nBricks: ${Math.ceil(n)}\nWith ${o.waste}% waste: ${Math.ceil(n * (1 + o.waste / 100))} (single skin, one brick thick)`;
    }),
  calc('paint-coverage', BLD, 'Paint Coverage Calculator', 'Litres of paint for the walls of a room.',
    [num('l', 'Room length (m)', 5), num('w', 'Room width (m)', 4), num('h', 'Wall height (m)', 2.5), num('open', 'Doors/windows area (m²)', 4), num('coats', 'Coats', 2), num('cov', 'Coverage (m² per litre)', 10)], (o) => {
      pos(o, 'l', 'w', 'h', 'coats', 'cov'); need(o, 'open'); const wall = 2 * (o.l + o.w) * o.h - o.open, lit = wall * o.coats / o.cov;
      return `Paintable area = 2(L+W)·H − openings\nPaint = area × coats / coverage\n\nWall area: ${wall.toFixed(1)} m²\nPaint needed: ${lit.toFixed(2)} L (≈ ${Math.ceil(lit / 0.5) * 0.5} L to buy)\nCeiling (extra, 1 coat): ${(o.l * o.w / o.cov).toFixed(2)} L`;
    }),
  calc('roof-pitch', BLD, 'Roof Pitch Calculator', 'Pitch, angle, slope and rafter length from rise and run.',
    [num('rise', 'Rise', 6), num('run', 'Run', 12), num('span', 'Building span / width (same unit)', 24)], (o) => {
      pos(o, 'rise', 'run', 'span'); const s = o.rise / o.run, ang = Math.atan(s) * 180 / Math.PI, f = Math.sqrt(1 + s * s);
      return `Pitch = rise : run   Angle = atan(rise/run)\n\nPitch: ${r(s * 12, 2)}:12\nAngle: ${ang.toFixed(2)}°\nSlope: ${(s * 100).toFixed(1)}%\nRafter length factor: ${f.toFixed(4)}\nRafter length (no overhang) for span ${o.span}: ${(o.span / 2 * f).toFixed(2)}\nRidge height above plate: ${(o.span / 2 * s).toFixed(2)}`;
    }),
  calc('tile-calculator', BLD, 'Tile Calculator', 'Number of tiles for a floor or wall.',
    [num('l', 'Area length (m)', 4), num('w', 'Area width (m)', 3), num('tw', 'Tile width (cm)', 30), num('th', 'Tile height (cm)', 30), num('g', 'Grout joint (mm)', 3), num('waste', 'Waste %', 10)], (o) => {
      pos(o, 'l', 'w', 'tw', 'th'); need(o, 'g', 'waste');
      const area = o.l * o.w, tile = (o.tw + o.g / 10) * (o.th + o.g / 10) / 1e4, n = area / tile;
      return `Tiles = area / (tile + grout)²\n\nArea: ${area.toFixed(2)} m²\nTiles: ${Math.ceil(n)}\nWith ${o.waste}% waste: ${Math.ceil(n * (1 + o.waste / 100))}\nTile area to buy: ${(Math.ceil(n * (1 + o.waste / 100)) * o.tw * o.th / 1e4).toFixed(2)} m²`;
    }),
  calc('flooring-calculator', BLD, 'Flooring Calculator', 'Flooring area and boxes needed.',
    [num('l', 'Room length (m)', 5), num('w', 'Room width (m)', 4), num('box', 'Coverage per box (m²)', 2.2), num('waste', 'Waste %', 10)], (o) => {
      pos(o, 'l', 'w', 'box'); need(o, 'waste'); const a = o.l * o.w, aw = a * (1 + o.waste / 100);
      return `Area: ${a.toFixed(2)} m² (${(a * 10.7639).toFixed(1)} ft²)\nWith ${o.waste}% waste: ${aw.toFixed(2)} m²\nBoxes: ${Math.ceil(aw / o.box)} (${(Math.ceil(aw / o.box) * o.box).toFixed(2)} m² total)`;
    }),
];

// ---------- Time & Productivity (custom UI) ----------
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'style') e.style.cssText = v; else if (k in e) e[k] = v; else e.setAttribute(k, v);
  }
  e.append(...kids.flat().filter((x) => x != null)); return e;
};
const every = (root, fn, ms) => { const id = setInterval(() => { if (!root.isConnected) clearInterval(id); else fn(); }, ms); return id; };
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const beep = () => { try { const a = new AudioContext(), o = a.createOscillator(); o.connect(a.destination); o.start(); setTimeout(() => { o.stop(); a.close(); }, 400); } catch { /* no audio */ } };
const hms = (ms) => { const s = Math.ceil(ms / 1000); return (s >= 3600 ? Math.floor(s / 3600) + ':' : '') + pad2(Math.floor(s % 3600 / 60)) + ':' + pad2(s % 60); };
const BIG = 'font-size:3rem;font-family:monospace;margin:.5rem 0';
const num2 = (v, w = '5rem') => el('input', { type: 'number', value: v, min: 0, style: 'width:' + w });
const lbl = (t, e) => el('label', { style: 'margin-right:1rem' }, t + ' ', e);

// Sequential segment timer used by countdown, pomodoro and exam timers. getSegs() -> [{n, s}] (seconds)
function runner(root, getSegs, loop) {
  let segs = [], i = 0, left = 0, end = 0, run = false, fresh = true, msg = '';
  const name = el('div', { style: 'font-size:1.1rem', role: 'status' }), big = el('div', { style: BIG }), sub = el('div', { style: 'opacity:.7' });
  const go = el('button', { onclick: () => toggle() }, 'Start');
  const load = () => { try { segs = getSegs(); if (!segs.length) throw new Error('No segments'); msg = ''; } catch (e) { segs = []; msg = e.message; } i = 0; left = segs.length ? segs[0].s * 1000 : 0; };
  const draw = () => {
    name.textContent = msg || (segs[i] ? segs[i].n : 'Done'); big.textContent = hms(Math.max(left, 0));
    const rest = segs.slice(i + 1).reduce((a, x) => a + x.s, 0) * 1000 + Math.max(left, 0);
    sub.textContent = segs.length ? `Segment ${Math.min(i + 1, segs.length)} of ${segs.length}${loop ? ' (repeats)' : ' · total remaining ' + hms(rest)}` : '';
    go.textContent = run ? 'Pause' : 'Start';
  };
  const toggle = () => { if (fresh) { load(); fresh = false; } if (!segs.length) return draw(); if (left <= 0 && !segs[i]) return; run = !run; end = Date.now() + left; draw(); };
  const next = () => { i++; if (i >= segs.length) { if (loop) i = 0; else { run = false; left = 0; draw(); name.textContent = 'Done'; return; } } left = segs[i].s * 1000; end = Date.now() + left; };
  const reset = () => { run = false; fresh = true; load(); draw(); };
  every(root, () => { if (!run) return; left = end - Date.now(); if (left <= 0) { beep(); next(); } draw(); }, 200);
  root.append(name, big, sub, el('div', { className: 'row' }, go, el('button', { onclick: () => { if (!fresh && segs.length) { beep(); next(); draw(); } } }, 'Skip'), el('button', { onclick: reset }, 'Reset')));
  load(); draw();
  return reset; // call when inputs change
}

const timeTools = [
  { id: 'stopwatch', cat: TIME, title: 'Stopwatch', desc: 'Stopwatch with laps. Runs in your browser.', custom: true, render: (root) => {
    let acc = 0, t0 = 0, run = false; const laps = [];
    const big = el('div', { style: BIG }), list = el('pre', { className: 'out' }), go = el('button', { onclick: () => { run ? (acc += Date.now() - t0, run = false) : (t0 = Date.now(), run = true); draw(); } }, 'Start');
    const now = () => acc + (run ? Date.now() - t0 : 0);
    const f = (ms) => `${pad2(Math.floor(ms / 60000))}:${pad2(Math.floor(ms / 1000) % 60)}.${pad2(Math.floor(ms % 1000 / 10))}`;
    const draw = () => { big.textContent = f(now()); go.textContent = run ? 'Stop' : 'Start'; list.textContent = laps.map((l, k) => `Lap ${k + 1}  ${f(l.split)}  (${f(l.total)})`).reverse().join('\n'); };
    root.append(big, el('div', { className: 'row' }, go, el('button', { onclick: () => { if (run || acc) { const tot = now(); laps.push({ total: tot, split: tot - (laps.length ? laps[laps.length - 1].total : 0) }); draw(); } } }, 'Lap'),
      el('button', { onclick: () => { run = false; acc = 0; laps.length = 0; draw(); } }, 'Reset')), list);
    every(root, () => { if (run) { big.textContent = f(now()); } }, 50); draw();
  } },
  { id: 'countdown-timer', cat: TIME, title: 'Countdown Timer', desc: 'Set hours, minutes and seconds; beeps at zero.', custom: true, render: (root) => {
    const h = num2(0), mi = num2(5), s = num2(0), box = el('div');
    let reset; const sync = () => reset && reset();
    root.append(el('div', {}, lbl('Hours', h), lbl('Minutes', mi), lbl('Seconds', s)), box);
    [h, mi, s].forEach((x) => x.addEventListener('input', sync));
    reset = runner(box, () => { const t = (+h.value || 0) * 3600 + (+mi.value || 0) * 60 + (+s.value || 0); if (t <= 0) throw new Error('Set a time above 0'); return [{ n: 'Countdown', s: t }]; }, false);
  } },
  { id: 'pomodoro-timer', cat: TIME, title: 'Pomodoro Timer', desc: 'Work/break cycles with a long break every 4 rounds.', custom: true, render: (root) => {
    const w = num2(25), b = num2(5), l = num2(15), box = el('div'); let reset;
    root.append(el('div', {}, lbl('Work min', w), lbl('Break min', b), lbl('Long break min', l)), box);
    [w, b, l].forEach((x) => x.addEventListener('input', () => reset && reset()));
    reset = runner(box, () => { const W = +w.value, B = +b.value, L = +l.value; if (!(W > 0 && B > 0 && L > 0)) throw new Error('Minutes must be above 0'); const o = []; for (let k = 1; k <= 4; k++) { o.push({ n: `Work ${k}/4`, s: W * 60 }); o.push(k < 4 ? { n: 'Short break', s: B * 60 } : { n: 'Long break', s: L * 60 }); } return o; }, true);
  } },
  { id: 'exam-section-timer', cat: TIME, title: 'Exam Section Timer', desc: 'Run through timed sections one after another.', custom: true, render: (root) => {
    const ta = el('textarea', { spellcheck: false, rows: 5, value: 'Reading, 20\nWriting, 30\nMath, 45' }), box = el('div'); let reset;
    root.append(el('label', {}, 'Sections: one per line as "name, minutes"'), ta, box);
    ta.addEventListener('input', () => reset && reset());
    reset = runner(box, () => lines(ta.value).map((l) => { const k = l.lastIndexOf(','), mn = parseFloat(l.slice(k + 1)); if (k < 0 || !(mn > 0)) throw new Error('Bad line: ' + l); return { n: l.slice(0, k).trim(), s: mn * 60 }; }), false);
  } },
  { id: 'world-clock', cat: TIME, title: 'World Clock', desc: 'Current time in several time zones (uses Intl, offline).', custom: true, render: (root) => {
    const fallback = ['UTC', 'America/New_York', 'America/Los_Angeles', 'America/Sao_Paulo', 'Europe/London', 'Europe/Brussels', 'Europe/Moscow', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];
    let all = fallback; try { all = Intl.supportedValuesOf('timeZone'); if (!all.includes('UTC')) all = ['UTC', ...all]; } catch { /* use fallback */ }
    let zones = store.get('ft-worldclock', ['UTC', 'America/New_York', 'Europe/Brussels', 'Asia/Tokyo']);
    const pick = el('select', { 'aria-label': 'Time zone' }, ...all.map((z) => el('option', { value: z }, z))), out = el('pre', { className: 'out' });
    let paused = false; const pz = el('button', { 'aria-pressed': 'false', onclick: () => { paused = !paused; pz.setAttribute('aria-pressed', String(paused)); pz.textContent = paused ? 'Resume updates' : 'Pause updates'; if (!paused) draw(); } }, 'Pause updates');
    const draw = () => {
      const n = new Date(); out.textContent = zones.map((z) => {
        try { return `${z.padEnd(24)} ${n.toLocaleTimeString('en-GB', { timeZone: z })}  ${n.toLocaleDateString('en-CA', { timeZone: z })}  ${new Intl.DateTimeFormat('en-US', { timeZone: z, timeZoneName: 'short' }).formatToParts(n).find((p) => p.type === 'timeZoneName').value}`; } catch { return z + ' (unsupported)'; }
      }).join('\n');
    };
    root.append(el('div', { className: 'row' }, pick, el('button', { onclick: () => { if (!zones.includes(pick.value)) { zones.push(pick.value); store.set('ft-worldclock', zones); draw(); } } }, 'Add'),
      el('button', { onclick: () => { zones = zones.filter((z) => z !== pick.value); store.set('ft-worldclock', zones); draw(); } }, 'Remove selected'), pz), out);
    every(root, () => { if (!paused) draw(); }, 1000); draw();
  } },
  { id: 'habit-streak-tracker', cat: TIME, title: 'Habit Streak Tracker', desc: 'Track daily habits and streaks. Saved only in this browser.', custom: true, render: (root) => {
    const key = 'ft-habits', today = () => new Date().toLocaleDateString('en-CA'), back = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
    let hs = store.get(key, []); const list = el('div'), inp = el('input', { type: 'text', placeholder: 'New habit, e.g. Read 20 min' });
    const streak = (h) => { let s = 0, k = h.days.includes(today()) ? 0 : 1; while (h.days.includes(back(k))) { s++; k++; } return s; };
    const best = (h) => { const d = [...new Set(h.days)].sort(); let b = 0, c = 0, prev = null; for (const x of d) { c = prev && Math.round((new Date(x) - new Date(prev)) / 864e5) === 1 ? c + 1 : 1; b = Math.max(b, c); prev = x; } return b; };
    const draw = () => {
      list.replaceChildren(...hs.map((h, idx) => el('div', { style: 'margin:.6rem 0;padding:.5rem;border:1px solid #8884;border-radius:6px' },
        el('strong', {}, h.name), `  streak ${streak(h)}, best ${best(h)}, total ${h.days.length}  `,
        el('div', { style: 'font-family:monospace;letter-spacing:2px' }, [...Array(14)].map((_, k) => (h.days.includes(back(13 - k)) ? '■' : '□')).join('') + '  (last 14 days, today at right)'),
        el('button', { 'aria-label': `${h.days.includes(today()) ? 'Undo today' : 'Done today'}: ${h.name}`, onclick: () => { const t = today(); h.days = h.days.includes(t) ? h.days.filter((x) => x !== t) : [...h.days, t]; store.set(key, hs); draw(); } }, h.days.includes(today()) ? 'Undo today' : 'Done today'),
        el('button', { 'aria-label': `Delete habit: ${h.name}`, onclick: () => { hs.splice(idx, 1); store.set(key, hs); draw(); } }, 'Delete'))));
    };
    const add = () => { const n = inp.value.trim(); if (n) { hs.push({ name: n, days: [] }); inp.value = ''; store.set(key, hs); draw(); } };
    inp.addEventListener('keydown', (e) => e.key === 'Enter' && add());
    root.append(el('div', { className: 'row' }, inp, el('button', { onclick: add }, 'Add habit')), list); draw();
  } },
  { id: 'bill-tracker', cat: TIME, title: 'Monthly Bill Tracker', desc: 'Track recurring bills and mark them paid each month. Saved only in this browser.', custom: true, render: (root) => {
    const key = 'ft-bills', ym = () => new Date().toISOString().slice(0, 7); let bs = store.get(key, []);
    const name = el('input', { type: 'text', placeholder: 'Bill name' }), amt = el('input', { type: 'number', placeholder: 'Amount', step: 'any', style: 'width:7rem' }), day = el('input', { type: 'number', placeholder: 'Due day', min: 1, max: 31, style: 'width:6rem' });
    const sum = el('pre', { className: 'out' }), list = el('div');
    const draw = () => {
      const k = ym(), dn = new Date().getDate(), tot = bs.reduce((a, b) => a + b.amount, 0), paid = bs.filter((b) => b.paid && b.paid[k]).reduce((a, b) => a + b.amount, 0);
      sum.textContent = `Month ${k}\nTotal: ${m(tot)}   Paid: ${m(paid)}   Remaining: ${m(tot - paid)}`;
      list.replaceChildren(...[...bs].sort((a, b) => a.day - b.day).map((b) => {
        const p = !!(b.paid && b.paid[k]);
        return el('div', { className: 'row' }, el('input', { type: 'checkbox', 'aria-label': `Paid this month: ${b.name}`, checked: p, onchange: (e) => { b.paid = b.paid || {}; b.paid[k] = e.target.checked; store.set(key, bs); draw(); } }),
          `${b.name}  ${m(b.amount)}  due day ${b.day}` + (!p && b.day < dn ? '  OVERDUE' : ''), el('button', { 'aria-label': `Delete bill: ${b.name}`, onclick: () => { bs = bs.filter((x) => x !== b); store.set(key, bs); draw(); } }, 'Delete'));
      }));
    };
    root.append(el('div', { className: 'row' }, name, amt, day, el('button', { onclick: () => { const a = parseFloat(amt.value), d = parseInt(day.value, 10); if (name.value.trim() && a >= 0 && d >= 1 && d <= 31) { bs.push({ name: name.value.trim(), amount: a, day: d, paid: {} }); name.value = amt.value = day.value = ''; store.set(key, bs); draw(); } } }, 'Add bill')), sum, list); draw();
  } },
  { id: 'decision-wheel', cat: TIME, title: 'Decision Wheel', desc: 'Spin a wheel to pick one of your options.', custom: true, render: (root) => {
    const ta = el('textarea', { spellcheck: false, rows: 5, value: 'Pizza\nSushi\nTacos\nCurry\nSalad' }), cv = el('canvas', { width: 340, height: 340, style: 'max-width:100%' }), res = el('div', { role: 'status', style: 'font-size:1.4rem;margin:.5rem 0' });
    let rot = 0, busy = false; const opts = () => lines(ta.value).slice(0, 40);
    const draw = () => {
      const g = cv.getContext('2d'), o = opts(), n = o.length, c = 170, R = 160; g.clearRect(0, 0, 340, 340); cv.setAttribute('aria-label', n ? `Wheel with ${n} options: ${o.join(', ')}` : 'Wheel with no options'); if (!n) return;
      const a = 2 * Math.PI / n;
      o.forEach((t, k) => {
        g.beginPath(); g.moveTo(c, c); g.arc(c, c, R, rot + k * a, rot + (k + 1) * a); g.closePath(); g.fillStyle = `hsl(${k * 360 / n},65%,60%)`; g.fill(); g.stroke();
        g.save(); g.translate(c, c); g.rotate(rot + (k + 0.5) * a); g.fillStyle = '#000'; g.font = '14px sans-serif'; g.textAlign = 'right'; g.fillText(t.length > 18 ? t.slice(0, 17) + '…' : t, R - 10, 5); g.restore();
      });
      g.beginPath(); g.moveTo(c - 10, 2); g.lineTo(c + 10, 2); g.lineTo(c, 24); g.closePath(); g.fillStyle = '#000'; g.fill();
    };
    const spin = () => {
      const o = opts(); if (busy || o.length < 2) { if (o.length < 2) res.textContent = 'Add at least 2 options'; return; }
      busy = true; res.textContent = ''; const start = rot, total = (5 + rint(0, 300) / 100) * 2 * Math.PI, t0 = performance.now(), dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 4000;
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur); rot = start + total * (1 - Math.pow(1 - p, 3)); draw();
        if (p < 1 && cv.isConnected) requestAnimationFrame(step); else {
          busy = false; const a = 2 * Math.PI / o.length, ang = (((1.5 * Math.PI - rot) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); res.textContent = 'Winner: ' + o[Math.floor(ang / a) % o.length];
        }
      };
      requestAnimationFrame(step);
    };
    ta.addEventListener('input', draw);
    root.append(el('label', {}, 'Options (one per line)'), ta, el('div', { className: 'row' }, el('button', { onclick: spin }, 'Spin')), res, cv); draw();
  } },
];

// ---------- Randomness ----------
const random = [
  { id: 'dice-roller', cat: RND, title: 'Dice Roller', desc: 'Roll dice in NdM+K notation (e.g. 2d6+3, d20). Cryptographically random.', inputs: 1, labels: ['Dice (comma separated)'], sample: '2d6+3, d20', opts: [],
    run: ([t]) => {
      const out = [];
      for (const part of t.split(/[,;\n]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)) {
        const mt = /^(\d*)d(\d+)\s*([+-]\s*\d+)?$/.exec(part); if (!mt) throw new Error('Bad dice: "' + part + '" (use e.g. 2d6+3)');
        const n = +(mt[1] || 1), s = +mt[2], k = mt[3] ? +mt[3].replace(/\s/g, '') : 0; if (n < 1 || n > 1000 || s < 2 || s > 1e6) throw new Error('Use 1-1000 dice with 2-1000000 sides');
        const rolls = Array.from({ length: n }, () => rint(1, s)); out.push(`${part}: [${rolls.length > 50 ? rolls.slice(0, 50).join(', ') + ', …' : rolls.join(', ')}]${k ? (k > 0 ? ' +' : ' ') + k : ''} = ${rolls.reduce((a, b) => a + b, 0) + k}`);
      }
      if (!out.length) throw new Error('Enter dice such as 2d6'); return out.join('\n');
    } },
  calc('coin-flip', RND, 'Coin Flip', 'Flip one or many fair coins.', [num('n', 'Number of flips', 1)], (o) => {
    need(o, 'n'); const n = Math.min(Math.max(Math.floor(o.n), 1), 10000), f = Array.from({ length: n }, () => rint(0, 1)), h = f.reduce((a, b) => a + b, 0);
    return n === 1 ? (h ? 'Heads' : 'Tails') : `Heads: ${h}  Tails: ${n - h}\n` + (n <= 100 ? f.map((x) => (x ? 'H' : 'T')).join(' ') : '(sequence hidden for large counts)');
  }),
  calc('random-number-picker', RND, 'Random Number Picker', 'Pick random integers in a range.', [num('min', 'Min', 1), num('max', 'Max', 100), num('n', 'How many', 5), chk('uniq', 'Unique numbers', true)], (o) => {
    need(o, 'min', 'max', 'n'); const lo = Math.ceil(o.min), hi = Math.floor(o.max), n = Math.floor(o.n); if (hi < lo) throw new Error('Max must be ≥ min'); if (n < 1 || n > 10000) throw new Error('How many: 1-10000');
    if (o.uniq && n > hi - lo + 1) throw new Error('Not enough unique values in range'); const res = [], seen = new Set();
    while (res.length < n) { const v = rint(lo, hi); if (o.uniq) { if (seen.has(v)) continue; seen.add(v); } res.push(v); }
    return res.join(', ');
  }),
  { id: 'raffle-picker', cat: RND, title: 'Raffle Picker', desc: 'Draw random winners from a list of names.', inputs: 1, labels: ['Names (one per line)'], sample: 'Alice\nBob\nCarol\nDave\nEve', opts: [num('n', 'Winners', 1)],
    run: ([t], o) => {
      const names = lines(t), n = Math.floor(o.n); if (!names.length) throw new Error('Enter at least one name'); if (!(n >= 1) || n > names.length) throw new Error('Winners must be between 1 and ' + names.length);
      return `${names.length} entries\n\n` + shuffle(names).slice(0, n).map((x, k) => `${k + 1}. ${x}`).join('\n');
    } },
  { id: 'random-team-splitter', cat: RND, title: 'Random Team Splitter', desc: 'Shuffle names into balanced teams.', inputs: 1, labels: ['Names (one per line)'], sample: 'Alice\nBob\nCarol\nDave\nEve\nFrank\nGrace', opts: [num('teams', 'Number of teams', 2)],
    run: ([t], o) => {
      const names = lines(t), k = Math.floor(o.teams); if (!names.length) throw new Error('Enter names'); if (!(k >= 2) || k > names.length) throw new Error('Teams must be between 2 and ' + names.length);
      const teams = Array.from({ length: k }, () => []); shuffle(names).forEach((x, i) => teams[i % k].push(x));
      return teams.map((tm, i) => `Team ${i + 1} (${tm.length}): ${tm.join(', ')}`).join('\n');
    } },
];

export default [...finance, ...health, ...everyday, ...build, ...timeTools, ...random];

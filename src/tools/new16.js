// Tools from free-browser-tools.md, batch 16 (rows 1054-1118): finance, tax, VAT and invoicing helpers.
// Pure client-side maths on typed or pasted input. No rates are fetched. Where a tool bundles data (euro area HICP,
// EU VAT rates) the source and date are printed in its output. Tax and legal rules differ by country and change:
// every result is an estimate, not advice. SKIPPED (need live data or accounts): exchange rate history, crypto prices,
// VIES VAT lookup, EORI lookup, foreign-currency invoice rates, country payroll/self-employment tax tables, tax calendar.
import { _qr } from './gen.js';

const FIN = 'Calculators – Finance', DOCS = 'Documents', REF = 'Reference';
const num = (id, label, def) => ({ id, label, type: 'number', def });
const sel = (id, label, choices, def) => ({ id, label, type: 'select', choices, def: def ?? choices[0] });
const chk = (id, label, def = false) => ({ id, label, type: 'checkbox', def });
const txt = (id, label, def) => ({ id, label, type: 'text', def });
const dat = (id, label, def) => ({ id, label, type: 'date', def });
const calc = (id, cat, title, desc, opts, fn) => ({ id, cat, title, desc, inputs: 0, sample: '', opts, run: (_i, o) => fn(o) });
const text = (id, cat, title, desc, label, sample, opts, fn) => ({ id, cat, title, desc, inputs: 1, labels: [label], sample, opts, run: ([s], o) => fn(s, o) });
const m = (x) => Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r = (x, d = 2) => Number(x).toLocaleString('en-US', { maximumFractionDigits: d });
const need = (o, ...ks) => { for (const k of ks) if (!Number.isFinite(o[k])) throw new Error('Enter a valid number for ' + k); };
const pos = (o, ...ks) => { need(o, ...ks); for (const k of ks) if (!(o[k] > 0)) throw new Error(k + ' must be greater than 0'); };
const nn = (o, ...ks) => { need(o, ...ks); for (const k of ks) if (o[k] < 0) throw new Error(k + ' cannot be negative'); };
const tbl = (head, rows) => {
  const all = [head, ...rows].map((x) => x.map(String));
  const w = head.map((_, i) => Math.max(...all.map((x) => x[i].length)));
  return all.map((x) => x.map((c, i) => c.padStart(w[i])).join('  ')).join('\n');
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const D = (s) => {
  const mt = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '').trim());
  if (!mt) throw new Error('Enter a valid date (YYYY-MM-DD)');
  const d = new Date(Date.UTC(+mt[1], +mt[2] - 1, +mt[3]));
  if (isNaN(d) || d.getUTCDate() !== +mt[3]) throw new Error('Invalid date: ' + s);
  return d;
};
const iso = (d) => d.toISOString().slice(0, 10);
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dstr = (d) => iso(d) + ' (' + WD[d.getUTCDay()] + ')';
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const dim = (y, mo) => new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
const lines = (s) => String(s).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const parts = (l) => l.split(/\t|;|\||,(?![0-9]{3}\b)/).map((x) => x.trim());
const money = (v, what) => {
  const x = Number(String(v).replace(/[\s€$£]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
  if (!Number.isFinite(x)) throw new Error('Not a number for ' + what + ': "' + v + '"');
  return x;
};
const pmtOf = (P, i, n) => (i ? (P * i) / (1 - Math.pow(1 + i, -n)) : P / n);
const NOTE = '\n\nEstimate for planning. Not financial, tax or legal advice.';

// ---------- loans ----------
function amort(P, ratePct, n, extra = 0, oneAmt = 0, oneMonth = 0) {
  const i = ratePct / 1200, pmt = pmtOf(P, i, n), rows = [];
  let bal = P, totI = 0;
  for (let k = 1; k <= n + 1 && bal > 0.005; k++) {
    const intr = bal * i;
    let pr = Math.min(bal, pmt - intr + extra + (k === oneMonth ? oneAmt : 0));
    if (pr < 0) pr = 0;
    bal -= pr; totI += intr;
    rows.push([k, intr + pr, pr, intr, Math.max(bal, 0)]);
  }
  return { pmt, rows, totI };
}
const monthsText = (n) => `${Math.floor(n / 12)} y ${n % 12} m (${n} months)`;

const loans = [
  calc('mortgage-amortization-calculator', FIN, 'Mortgage Calculator with Full Amortization Schedule and Overpayments',
    'Monthly payment from price, deposit, rate and term, with a month-by-month schedule. Add a monthly or one-off overpayment to see interest saved and time cut.',
    [num('price', 'Property price', 300000), num('down', 'Down payment (amount)', 60000), num('rate', 'Annual interest rate %', 4), num('years', 'Term in years', 25),
      num('extra', 'Extra payment every month (0 = none)', 0), num('one', 'One-off extra payment (0 = none)', 0), num('onem', 'One-off paid in month number', 12),
      sel('view', 'Schedule', ['every month', 'yearly summary', 'none'])], (o) => {
      pos(o, 'price', 'years'); nn(o, 'down', 'rate', 'extra', 'one'); if (o.down >= o.price) throw new Error('Down payment must be smaller than the price');
      const P = o.price - o.down, n = Math.round(o.years * 12), base = amort(P, o.rate, n), over = amort(P, o.rate, n, o.extra, o.one, Math.round(o.onem));
      let out = `Loan = price - down payment = ${m(P)}\nPayment = P·i / (1 - (1+i)^-n), i = rate/12, n = ${n}\n\nMonthly payment: ${m(base.pmt)}\nTotal interest: ${m(base.totI)}\nTotal repaid: ${m(P + base.totI)}\n`;
      if (o.extra > 0 || o.one > 0) {
        out += `\nWith overpayments (${m(o.extra)} monthly${o.one > 0 ? ', ' + m(o.one) + ' in month ' + Math.round(o.onem) : ''}):\nPaid off after: ${monthsText(over.rows.length)} instead of ${monthsText(base.rows.length)}\nTotal interest: ${m(over.totI)}\nInterest saved: ${m(base.totI - over.totI)}\nTime saved: ${monthsText(base.rows.length - over.rows.length)}\n`;
      }
      const sc = (o.extra > 0 || o.one > 0) ? over : base;
      if (o.view === 'every month') out += '\n' + tbl(['Month', 'Payment', 'Principal', 'Interest', 'Balance'], sc.rows.map((x) => [x[0], m(x[1]), m(x[2]), m(x[3]), m(x[4])]));
      else if (o.view === 'yearly summary') {
        const ys = [];
        sc.rows.forEach((x) => { const y = Math.ceil(x[0] / 12) - 1; ys[y] = ys[y] || [y + 1, 0, 0, 0, 0]; ys[y][1] += x[1]; ys[y][2] += x[2]; ys[y][3] += x[3]; ys[y][4] = x[4]; });
        out += '\n' + tbl(['Year', 'Paid', 'Principal', 'Interest', 'Balance'], ys.map((x) => [x[0], m(x[1]), m(x[2]), m(x[3]), m(x[4])]));
      }
      return out + '\n\nFixed rate, payments at month end, no fees or insurance. Lenders round payments to cents, so the last payment can differ by a few cents.' + NOTE;
    }),
  calc('mortgage-affordability-calculator', FIN, 'Mortgage Affordability Calculator (Income, Debts and Debt-to-Income Limit)',
    'Estimate the largest loan and property price from gross income, monthly debts, deposit, rate and a debt-to-income limit you set.',
    [num('income', 'Gross annual income (all borrowers)', 72000), num('debts', 'Monthly debt payments (cards, car, loans)', 400), num('down', 'Deposit available', 50000),
      num('rate', 'Annual interest rate %', 4), num('years', 'Term in years', 25), num('dti', 'Maximum share of gross income for all debt payments %', 36),
      num('extra', 'Monthly property tax, insurance and fees (not in the loan)', 250)], (o) => {
      pos(o, 'income', 'years', 'dti'); nn(o, 'debts', 'down', 'rate', 'extra'); if (o.dti > 100) throw new Error('dti cannot be above 100');
      const n = Math.round(o.years * 12), i = o.rate / 1200, cap = o.income / 12 * o.dti / 100, room = cap - o.debts - o.extra;
      if (room <= 0) return `At a ${o.dti}% limit your total monthly allowance is ${m(cap)}. Existing debts and fixed costs (${m(o.debts + o.extra)}) already use all of it, so no mortgage fits.` + NOTE;
      const loan = i ? room * (1 - Math.pow(1 + i, -n)) / i : room * n;
      return `Allowed total payments: ${o.dti}% x ${m(o.income / 12)} gross per month = ${m(cap)}\nMinus other debts ${m(o.debts)} and property costs ${m(o.extra)} = ${m(room)} for the mortgage payment\n\nMaximum monthly mortgage payment: ${m(room)}\nMaximum loan: ${m(loan)}\nMaximum property price (loan + deposit): ${m(loan + o.down)}\nLoan as a share of that price: ${r(loan / (loan + o.down) * 100, 1)}%\n\nLenders also test your rate with a stress margin, check your credit record and cap the loan-to-value. A common rule of thumb is 28% for housing and 36% for all debt, but limits differ by country and lender.` + NOTE;
    }),
  calc('car-loan-balloon-calculator', FIN, 'Car Finance Calculator with Deposit and Balloon Payment',
    'Monthly instalment and total cost of a car loan with a deposit and an optional final balloon payment.',
    [num('price', 'Car price', 28000), num('down', 'Deposit', 3000), num('rate', 'Annual interest rate %', 6.5), num('months', 'Term in months', 48), num('balloon', 'Final balloon payment (0 = none)', 8000)], (o) => {
      pos(o, 'price', 'months'); nn(o, 'down', 'rate', 'balloon'); if (o.down >= o.price) throw new Error('Deposit must be smaller than the price');
      const P = o.price - o.down, n = Math.round(o.months), i = o.rate / 1200;
      if (o.balloon > P * Math.pow(1 + i, n)) throw new Error('Balloon is larger than the balance would ever be');
      const pmt = pmtOf(P - o.balloon / Math.pow(1 + i, n), i, n), tot = pmt * n + o.balloon;
      return `Financed amount: ${m(P)}\nPayment = (P - balloon/(1+i)^n) · i / (1 - (1+i)^-n)\n\nMonthly payment: ${m(pmt)} x ${n}\nBalloon due at the end: ${m(o.balloon)}\nTotal interest: ${m(tot - P)}\nTotal paid to the lender: ${m(tot)}\nTotal cost including deposit: ${m(tot + o.down)}\n\nThe balloon is not forgiven: you pay it, refinance it or hand the car back if the contract allows. Fees and insurance are not included.` + NOTE;
    }),
  calc('credit-card-payoff-calculator', FIN, 'Credit Card Payoff Calculator (Months to Zero, Interest, Payment Needed)',
    'Months to clear a card at a fixed monthly payment and the total interest, or the payment needed to clear it in a set number of months.',
    [num('bal', 'Balance', 5000), num('apr', 'APR %', 21.9), num('pay', 'Fixed monthly payment (0 = solve for a target)', 200), num('target', 'Target months (used when payment is 0)', 24)], (o) => {
      pos(o, 'bal'); nn(o, 'apr', 'pay', 'target'); const i = o.apr / 1200;
      let pay = o.pay, out = '';
      if (pay === 0) { pos(o, 'target'); pay = pmtOf(o.bal, i, Math.round(o.target)); out = `Payment needed to clear in ${Math.round(o.target)} months: ${m(pay)}\n`; }
      if (pay <= o.bal * i + 1e-9) throw new Error(`A payment of ${m(pay)} does not cover the first month's interest (${m(o.bal * i)}). The balance never falls.`);
      let b = o.bal, k = 0, ti = 0;
      while (b > 0.005 && k < 1200) { const it = b * i; ti += it; b = b + it - Math.min(pay, b + it); k++; }
      return out + `Monthly payment: ${m(pay)}\nTime to pay off: ${monthsText(k)}\nTotal interest: ${m(ti)}\nTotal paid: ${m(o.bal + ti)}\nFirst month: ${m(o.bal * i)} of the payment is interest\n\nMonthly interest = balance x APR/12, paid at the end of each month, no new purchases or fees. Card issuers compute daily, so real figures differ slightly.` + NOTE;
    }),
  text('debt-snowball-avalanche-planner', FIN, 'Debt Snowball vs Avalanche Planner',
    'Compare paying the smallest balance first with the highest rate first for several debts. Shows months to debt-free, total interest and payoff order.',
    'Debts (name, balance, APR %, minimum payment; one per line)', 'Card A, 1200, 12, 40\nCard B, 4800, 24.9, 110\nCar loan, 9500, 7.5, 260\nStore card, 600, 9.9, 25',
    [num('budget', 'Total monthly amount for debts', 800)], (s, o) => {
      const ds = lines(s).map((l, k) => { const p = parts(l); if (p.length < 4) throw new Error(`Line ${k + 1}: use name, balance, APR, minimum`); return { name: p[0], bal: money(p[1], 'balance'), apr: money(p[2], 'APR'), min: money(p[3], 'minimum') }; });
      if (!ds.length) throw new Error('Add at least one debt');
      pos(o, 'budget'); const mins = ds.reduce((a, d) => a + d.min, 0);
      if (o.budget < mins) throw new Error(`Budget ${m(o.budget)} is below the minimum payments (${m(mins)})`);
      const sim = (order) => {
        const d = ds.map((x) => ({ ...x })), done = []; let k = 0, ti = 0;
        while (d.some((x) => x.bal > 0.005) && k < 1200) {
          k++; let left = o.budget;
          d.forEach((x) => { if (x.bal > 0.005) { const it = x.bal * x.apr / 1200; x.bal += it; ti += it; } });
          d.forEach((x) => { if (x.bal > 0.005) { const p = Math.min(x.min, x.bal); x.bal -= p; left -= p; } });
          for (const x of order(d)) { if (left <= 0) break; if (x.bal > 0.005) { const p = Math.min(left, x.bal); x.bal -= p; left -= p; } }
          d.forEach((x) => { if (x.bal <= 0.005 && !x.at) { x.at = k; done.push(`${x.name} (month ${k})`); } });
        }
        return { k, ti, done, ok: k < 1200 };
      };
      const sn = sim((d) => [...d].sort((a, b) => a.bal - b.bal)), av = sim((d) => [...d].sort((a, b) => b.apr - a.apr));
      const f = (x) => (x.ok ? `${monthsText(x.k)}\n  Total interest: ${m(x.ti)}\n  Order: ${x.done.join(', ')}` : 'not paid off within 100 years: raise the budget');
      const diff = sn.ok && av.ok ? `\nAvalanche saves ${m(sn.ti - av.ti)} in interest and ${Math.max(0, sn.k - av.k)} months compared with snowball. Snowball clears the first debt sooner, which some people find easier to stick with.` : '';
      return `Budget ${m(o.budget)} per month, minimums ${m(mins)}. Freed minimums roll into the next debt.\n\nSnowball (smallest balance first):\n  ${f(sn)}\n\nAvalanche (highest rate first):\n  ${f(av)}\n${diff}\n\nInterest is added monthly at APR/12. No new borrowing, fees or changing rates.` + NOTE;
    }),
  calc('emergency-fund-calculator', FIN, 'Emergency Fund Calculator (Months of Expenses)',
    'Target emergency fund from essential monthly costs and the number of months to cover, with the gap and the time to close it.',
    [num('exp', 'Essential monthly expenses', 2400), num('months', 'Months to cover', 6), num('have', 'Current emergency savings', 4000), num('save', 'Monthly amount you can add', 300)], (o) => {
      pos(o, 'exp', 'months'); nn(o, 'have', 'save');
      const t = o.exp * o.months, gap = t - o.have;
      return `Target = essential expenses x months = ${m(o.exp)} x ${r(o.months)} = ${m(t)}\nSaved: ${m(o.have)} (${r(Math.min(o.have / t * 100, 999), 1)}% of target, covers ${r(o.have / o.exp, 1)} months)\n` +
        (gap <= 0 ? 'Target reached. Surplus: ' + m(-gap) : `Gap: ${m(gap)}\n` + (o.save > 0 ? `Time to close at ${m(o.save)} per month: ${Math.ceil(gap / o.save)} months (no interest counted)` : 'Add a monthly amount to see the time needed.')) +
        `\n\nCommon guidance is three to six months of essentials. Consider more with one income, variable income or dependants, and less with a large safety net elsewhere. Essentials: housing, food, utilities, insurance, minimum debt payments, transport.` + NOTE;
    }),
  calc('fire-number-calculator', FIN, 'FIRE Number Calculator (Target Portfolio and Years to Reach It)',
    'Portfolio needed for financial independence from annual spending and a withdrawal rate, plus years to get there from your savings and expected return.',
    [num('spend', 'Annual spending in retirement', 36000), num('swr', 'Safe withdrawal rate %', 4), num('have', 'Invested today', 90000), num('save', 'Saved per year', 18000), num('ret', 'Real return per year % (after inflation)', 5)], (o) => {
      pos(o, 'spend', 'swr'); nn(o, 'have', 'save', 'ret');
      const T = o.spend / (o.swr / 100), g = o.ret / 100;
      let out = `FIRE number = annual spending / withdrawal rate = ${m(o.spend)} / ${r(o.swr, 2)}% = ${m(T)}\n(${r(100 / o.swr, 1)} times annual spending)\nProgress: ${r(o.have / T * 100, 1)}%\n`;
      if (o.have >= T) return out + 'You already have more than the target.' + NOTE;
      let yrs;
      if (g === 0) yrs = o.save > 0 ? (T - o.have) / o.save : Infinity;
      else yrs = o.save + o.have * g > 0 ? Math.log((T * g + o.save) / (o.have * g + o.save)) / Math.log(1 + g) : Infinity;
      out += Number.isFinite(yrs) ? `Years to reach it: ${r(yrs, 1)} (contributions at year end, constant real return)` : 'Not reachable with zero savings and zero return.';
      return out + '\n\nThe withdrawal rate is a rule of thumb based on historical US market data over about 30 years; a longer retirement, other markets or lower expected returns suggest a lower rate. Use real (after inflation) returns. Taxes and fees are not modelled.' + NOTE;
    }),
];

// ---------- inflation, budgeting, investing ----------
// Euro area HICP annual average index, 2015=100. Source: Eurostat dataset prc_hicp_aind (unit INX_A_AVG, geo EA, coicop CP00), data updated 2026-02-06.
const HICP = { 1996: 71.74, 1997: 72.87, 1998: 73.67, 1999: 74.48, 2000: 76.05, 2001: 77.83, 2002: 79.58, 2003: 81.24, 2004: 82.98, 2005: 84.79, 2006: 86.64, 2007: 88.49, 2008: 91.38, 2009: 91.65, 2010: 93.14, 2011: 95.66, 2012: 98.05, 2013: 99.38, 2014: 99.81, 2015: 100, 2016: 100.23, 2017: 101.78, 2018: 103.56, 2019: 104.8, 2020: 105.06, 2021: 107.78, 2022: 116.82, 2023: 123.15, 2024: 126.07, 2025: 128.75 };

const money2 = [
  calc('euro-area-inflation-calculator', FIN, 'Euro Area Inflation Calculator (HICP 1996-2025)',
    'Adjust an amount between two years with the euro area HICP annual average index bundled in the page. Shows the equivalent value and average yearly inflation.',
    [num('amt', 'Amount', 1000), num('from', 'From year', 2010), num('to', 'To year', 2024)], (o) => {
      need(o, 'amt', 'from', 'to'); const a = HICP[o.from], b = HICP[o.to];
      if (!a || !b) throw new Error('Years must be between 1996 and 2025');
      const f = b / a, y = o.to - o.from, avg = y ? (Math.pow(f, 1 / Math.abs(y)) - 1) * 100 * (y < 0 ? -1 : 1) : 0;
      const rows = []; for (let yr = Math.min(o.from, o.to); yr <= Math.max(o.from, o.to); yr++) rows.push([yr, HICP[yr].toFixed(2), m(o.amt * HICP[yr] / a)]);
      return `${m(o.amt)} in ${o.from} has the same buying power as ${m(o.amt * f)} in ${o.to}.\nPrice level change: ${r((f - 1) * 100, 2)}%\nAverage per year: ${r(avg, 2)}%\n\n` + tbl(['Year', 'HICP (2015=100)', 'Equivalent amount'], rows) +
        '\n\nSource: Eurostat, HICP annual data (prc_hicp_aind), euro area aggregate (its membership grew from 11 to 21 states over the period), all-items, annual average index, 2015=100, data updated 2026-02-06. The index is the average of the year, so this compares average price levels, not January to January. Averages use the rounded index, so they can differ in the second decimal from published rates. Your own basket of goods may have inflated differently.';
    }),
  calc('purchasing-power-calculator', FIN, 'Purchasing Power Calculator (Year-by-Year Table)',
    'Table of what a sum will buy in today\'s terms after each year of inflation, with the cost of living adjustment you would need to stand still.',
    [num('amt', 'Amount', 10000), num('rate', 'Assumed inflation % per year', 3), num('years', 'Years', 10)], (o) => {
      need(o, 'amt', 'rate'); pos(o, 'years'); const n = Math.round(o.years); if (n > 100) throw new Error('At most 100 years');
      const rows = []; for (let y = 0; y <= n; y++) { const f = Math.pow(1 + o.rate / 100, y); rows.push([y, m(o.amt / f), r((1 - 1 / f) * 100, 1) + '%', m(o.amt * f)]); }
      return `Real value = amount / (1 + inflation)^years\n\n` + tbl(['Year', "Worth in today's money", 'Lost', 'Needed to match'], rows) + '\n\nA constant inflation rate is an assumption. Use the euro area inflation calculator for real historical figures.';
    }),
  text('budget-50-30-20-planner', FIN, 'Budget Planner (50/30/20 Rule) with Actual Spending Check',
    'Split take-home pay into needs, wants and savings, then paste your real spending to see which category is over or under its share.',
    'Spending (category, label, amount; category is need, want or save)', 'need, Rent, 1100\nneed, Groceries, 380\nneed, Transport, 120\nwant, Dining out, 220\nwant, Streaming and hobbies, 140\nsave, Pension, 250\nsave, Savings account, 150',
    [num('income', 'Monthly take-home pay', 3000), num('n', 'Needs %', 50), num('w', 'Wants %', 30), num('s', 'Savings and debt repayment %', 20)], (s, o) => {
      pos(o, 'income'); nn(o, 'n', 'w', 's'); if (Math.abs(o.n + o.w + o.s - 100) > 0.001) throw new Error('Percentages must add up to 100');
      const act = { need: 0, want: 0, save: 0 };
      lines(s).forEach((l, k) => { const p = parts(l); if (p.length < 3) throw new Error(`Line ${k + 1}: use category, label, amount`); const c = p[0].toLowerCase().replace(/^(saving|savings|debt)$/, 'save').replace(/^needs$/, 'need').replace(/^wants$/, 'want'); if (!(c in act)) throw new Error(`Line ${k + 1}: category must be need, want or save`); act[c] += money(p[p.length - 1], 'amount'); });
      const rows = [['Needs', o.n, 'need'], ['Wants', o.w, 'want'], ['Savings', o.s, 'save']].map(([nm, pc, k]) => { const tg = o.income * pc / 100, d = act[k] - tg; return [nm, pc + '%', m(tg), m(act[k]), (d > 0 ? '+' : '') + m(d), r(act[k] / o.income * 100, 1) + '%', k === 'save' ? (d < -0.005 ? 'under target' : 'on or above target') : (d > 0.005 ? 'over' : 'within')]; });
      const tot = act.need + act.want + act.save;
      return tbl(['Category', 'Share', 'Target', 'Actual', 'Difference', 'Actual share', 'Status'], rows) + `\n\nTotal planned or spent: ${m(tot)} of ${m(o.income)}. ${tot > o.income ? 'Over income by ' + m(tot - o.income) : 'Unassigned: ' + m(o.income - tot)}\n\nThe 50/30/20 split is a rule of thumb from Elizabeth Warren and Amelia Warren Tyagi. In high-rent cities needs can exceed 50%; adjust the shares.`;
    }),
  text('net-worth-calculator', FIN, 'Net Worth Calculator (Assets Minus Liabilities)',
    'Total assets and liabilities from a pasted list and get net worth, the debt-to-asset ratio and the largest items.',
    'Items (asset or debt, name, value; one per line)', 'asset, Current account, 3200\nasset, Savings, 14000\nasset, Index funds, 38500\nasset, Home, 280000\ndebt, Mortgage, 195000\ndebt, Credit card, 1450\ndebt, Car loan, 8300',
    [], (s) => {
      const A = [], L = [];
      lines(s).forEach((l, k) => { const p = parts(l); if (p.length < 3) throw new Error(`Line ${k + 1}: use asset or debt, name, value`); const t = p[0].toLowerCase(), v = Math.abs(money(p[p.length - 1], 'value')); if (/^(a|asset|assets)$/.test(t)) A.push([p[1], v]); else if (/^(l|d|debt|liability|liabilities)$/.test(t)) L.push([p[1], v]); else throw new Error(`Line ${k + 1}: start with asset or debt`); });
      if (!A.length && !L.length) throw new Error('Add at least one item');
      const sa = A.reduce((a, x) => a + x[1], 0), sl = L.reduce((a, x) => a + x[1], 0), top = (x) => [...x].sort((a, b) => b[1] - a[1]).slice(0, 3).map((y) => `${y[0]} ${m(y[1])}`).join(', ') || '-';
      return `Total assets: ${m(sa)}\nTotal liabilities: ${m(sl)}\nNet worth: ${m(sa - sl)}\nLiabilities as a share of assets: ${sa ? r(sl / sa * 100, 1) + '%' : 'n/a'}\n\nLargest assets: ${top(A)}\nLargest debts: ${top(L)}\n\nEnter assets at what you could sell them for, and debts at the amount still owed.`;
    }),
  calc('dividend-yield-calculator', FIN, 'Dividend Yield Calculator (Yield and Annual Income)',
    'Dividend yield from share price and annual dividend, plus yearly and monthly income for the shares you hold and the yield on your cost.',
    [num('price', 'Share price', 54.2), num('div', 'Annual dividend per share', 2.1), num('shares', 'Shares held', 300), num('cost', 'Your average purchase price (0 = skip)', 40), num('tax', 'Withholding tax on dividends % (0 = skip)', 15)], (o) => {
      pos(o, 'price'); nn(o, 'div', 'shares', 'cost', 'tax'); const inc = o.div * o.shares;
      return `Yield = annual dividend / price = ${m(o.div)} / ${m(o.price)} = ${r(o.div / o.price * 100, 3)}%\nAnnual dividend income: ${m(inc)} (${m(inc / 12)} per month)\nPosition value: ${m(o.price * o.shares)}\n` +
        (o.cost > 0 ? `Yield on cost: ${r(o.div / o.cost * 100, 3)}%\n` : '') + (o.tax > 0 ? `After ${o.tax}% withholding: ${m(inc * (1 - o.tax / 100))} per year (net yield ${r(o.div * (1 - o.tax / 100) / o.price * 100, 3)}%)\n` : '') + '\nUse the dividends declared for the next 12 months, or the last 12 months paid. One-off special dividends inflate the yield.';
    }),
  text('dollar-cost-averaging-calculator', FIN, 'Dollar-Cost Averaging Calculator',
    'Simulate investing a fixed amount each period at a list of prices: shares bought, average cost per share, current value and gain or loss.',
    'Prices at each purchase date (one per line or comma separated, oldest first)', '42.10\n39.80\n44.50\n47.20\n41.60\n45.90\n48.30',
    [num('amt', 'Amount invested each period', 200), num('fee', 'Fee per purchase', 0), num('now', 'Current price (0 = last price in the list)', 0)], (s, o) => {
      pos(o, 'amt'); nn(o, 'fee', 'now'); const pr = s.split(/[\s,;]+/).filter(Boolean).map((x) => money(x, 'price'));
      if (!pr.length || pr.some((x) => !(x > 0))) throw new Error('Enter positive prices');
      let sh = 0, spent = 0; const rows = pr.map((p, k) => { const b = (o.amt - o.fee) / p; sh += b; spent += o.amt; return [k + 1, m(p), b.toFixed(4), sh.toFixed(4), m(spent), m(spent / sh)]; });
      const cur = o.now > 0 ? o.now : pr[pr.length - 1], val = sh * cur, avgP = pr.reduce((a, x) => a + x, 0) / pr.length;
      if (o.fee >= o.amt) throw new Error('Fee must be smaller than the amount');
      return tbl(['#', 'Price', 'Shares bought', 'Total shares', 'Invested', 'Avg cost'], rows) + `\n\nInvested: ${m(spent)}\nShares: ${sh.toFixed(4)}\nAverage cost per share: ${m(spent / sh)} (harmonic mean of prices)\nSimple average of prices: ${m(avgP)}\nValue at ${m(cur)}: ${m(val)}\nGain or loss: ${m(val - spent)} (${r((val / spent - 1) * 100, 2)}%)\n\nFractional shares assumed. Dividends and taxes not included. Past prices do not predict returns.`;
    }),
  calc('stock-profit-calculator', FIN, 'Stock Profit Calculator (Gain or Loss After Fees)',
    'Net profit or loss on a trade including broker commissions, as an amount, as a percentage of what you invested, and the break-even sell price.',
    [num('shares', 'Number of shares', 100), num('buy', 'Buy price per share', 25.4), num('sell', 'Sell price per share', 31.8), num('bfee', 'Commission when buying', 5), num('sfee', 'Commission when selling', 5), num('tax', 'Tax on gains % (0 = skip)', 0)], (o) => {
      pos(o, 'shares', 'buy'); nn(o, 'sell', 'bfee', 'sfee', 'tax');
      const cost = o.shares * o.buy + o.bfee, proceeds = o.shares * o.sell - o.sfee, pl = proceeds - cost, be = (cost + o.sfee) / o.shares;
      const tx = o.tax > 0 && pl > 0 ? pl * o.tax / 100 : 0;
      return `Invested (shares + buy fee): ${m(cost)}\nProceeds (after sell fee): ${m(proceeds)}\nProfit or loss: ${m(pl)} (${r(pl / cost * 100, 2)}% of invested)\nBreak-even sell price: ${m(be)}\nFees total: ${m(o.bfee + o.sfee)}\n` + (o.tax > 0 ? `Tax at ${o.tax}%: ${m(tx)}\nAfter tax: ${m(pl - tx)}\n` : '') + '\nTax rules (allowances, loss offsets) differ by country; the tax line is a flat rate on a gain only.';
    }),
  calc('pay-raise-calculator', FIN, 'Pay Raise Calculator (New Salary and Increase)',
    'New salary and the increase per year, month, week and hour after a percentage or fixed raise.',
    [num('sal', 'Current annual salary', 48000), sel('mode', 'Raise is', ['percent', 'fixed yearly amount']), num('raise', 'Raise (percent or amount)', 4), num('hrs', 'Hours per week', 40), num('wks', 'Weeks per year', 52), num('infl', 'Inflation % to compare (0 = skip)', 0)], (o) => {
      pos(o, 'sal', 'hrs', 'wks'); need(o, 'raise', 'infl'); const inc = o.mode === 'percent' ? o.sal * o.raise / 100 : o.raise, ns = o.sal + inc;
      return `Current: ${m(o.sal)} per year\nNew salary: ${m(ns)} per year (${r(inc / o.sal * 100, 2)}% raise)\n\nIncrease per year: ${m(inc)}\nPer month: ${m(inc / 12)}\nPer week: ${m(inc / o.wks)}\nPer hour: ${m(inc / o.wks / o.hrs)}\nNew hourly rate: ${m(ns / o.wks / o.hrs)} (was ${m(o.sal / o.wks / o.hrs)})\n` + (o.infl ? `\nAfter ${o.infl}% inflation the real change is ${r(((1 + inc / o.sal) / (1 + o.infl / 100) - 1) * 100, 2)}%.\n` : '') + '\nGross figures. Higher earnings can be taxed at a higher marginal rate.';
    }),
  calc('apr-apy-converter', FIN, 'APR to APY Converter (Nominal to Effective Annual Rate)',
    'Convert a nominal annual rate to the effective annual yield for any compounding frequency, or work backwards from APY to the nominal rate.',
    [sel('mode', 'Convert', ['APR to APY', 'APY to APR']), num('rate', 'Rate %', 5), num('n', 'Compounding periods per year (0 = continuous)', 12)], (o) => {
      need(o, 'rate'); nn(o, 'n'); const x = o.rate / 100; if (o.mode === 'APY to APR' && x <= -1) throw new Error('APY must be above -100%');
      const nn_ = Math.round(o.n);
      if (o.mode === 'APR to APY') { const y = nn_ ? Math.pow(1 + x / nn_, nn_) - 1 : Math.exp(x) - 1; return `APY = (1 + APR/n)^n - 1${nn_ ? '' : '  (continuous: e^APR - 1)'}\n\nAPR: ${r(o.rate, 4)}% compounded ${nn_ ? nn_ + ' times per year' : 'continuously'}\nAPY: ${r(y * 100, 4)}%\nExtra from compounding: ${r(y * 100 - o.rate, 4)} points\nOn 1,000.00 that is ${m(1000 * (1 + y))} after one year.`; }
      const a = nn_ ? nn_ * (Math.pow(1 + x, 1 / nn_) - 1) : Math.log(1 + x);
      return `APR = n · ((1 + APY)^(1/n) - 1)${nn_ ? '' : '  (continuous: ln(1 + APY))'}\n\nAPY: ${r(o.rate, 4)}%\nNominal APR compounded ${nn_ ? nn_ + ' times per year' : 'continuously'}: ${r(a * 100, 4)}%`;
    }),
];

// ---------- rent vs buy, lease vs buy ----------
const decisions = [
  calc('rent-vs-buy-calculator', FIN, 'Rent vs Buy Calculator (Wealth After N Years)',
    'Compare the net wealth of renting and investing against buying a home, with mortgage, upkeep, price growth, rent growth and selling costs.',
    [num('price', 'Home price', 350000), num('down', 'Down payment %', 20), num('rate', 'Mortgage rate %', 4), num('term', 'Mortgage term in years', 25), num('close', 'Buying costs % of price (taxes, fees)', 6),
      num('maint', 'Yearly upkeep and property tax % of home value', 1.8), num('growth', 'Home price growth % per year', 2.5), num('rent', 'Monthly rent for a similar home', 1300), num('rg', 'Rent growth % per year', 2.5),
      num('inv', 'Investment return % per year (renter portfolio)', 4.5), num('sell', 'Selling costs % of price', 3), num('years', 'Years to compare', 15)], (o) => {
      pos(o, 'price', 'term', 'rent', 'years'); nn(o, 'down', 'rate', 'close', 'maint', 'rent', 'rg', 'inv', 'sell'); need(o, 'growth'); if (o.down > 100) throw new Error('Down payment cannot exceed 100%');
      const Y = Math.round(o.years), N = Y * 12, n = Math.round(o.term * 12), i = o.rate / 1200, mi = Math.pow(1 + o.inv / 100, 1 / 12) - 1;
      let loan = o.price * (1 - o.down / 100), pm = pmtOf(loan, i, n), bal = loan;
      let pb = 0, pr = o.price * o.down / 100 + o.price * o.close / 100, rows = [];
      for (let k = 1; k <= N; k++) {
        const val = o.price * Math.pow(1 + o.growth / 100, (k - 1) / 12), rent = o.rent * Math.pow(1 + o.rg / 100, Math.floor((k - 1) / 12));
        const intr = bal * i, pay = bal > 0 ? Math.min(pm, bal + intr) : 0; bal = Math.max(0, bal + intr - pay);
        const buyOut = pay + val * o.maint / 1200, d = buyOut - rent;
        pb *= 1 + mi; pr *= 1 + mi; if (d > 0) pr += d; else pb += -d;
        if (k % 12 === 0) { const v = o.price * Math.pow(1 + o.growth / 100, k / 12); rows.push([k / 12, m(v), m(bal), m(v * (1 - o.sell / 100) - bal + pb), m(pr)]); }
      }
      const hv = o.price * Math.pow(1 + o.growth / 100, N / 12), buyW = hv * (1 - o.sell / 100) - bal + pb, diff = buyW - pr;
      return `Buying: home worth ${m(hv)}, mortgage left ${m(bal)}, minus selling costs and plus the savings the buyer could invest ${m(pb)}\nWealth if you buy: ${m(buyW)}\nWealth if you rent: ${m(pr)}\n\n${Math.abs(diff) < 1 ? 'About equal.' : diff > 0 ? 'Buying leaves you ' + m(diff) + ' ahead' : 'Renting leaves you ' + m(-diff) + ' ahead'} after ${Y} years.\nMortgage payment: ${m(pm)} per month. First-year upkeep and tax: ${m(o.price * o.maint / 100)}.\n\n` +
        tbl(['Year', 'Home value', 'Mortgage left', 'Buyer wealth', 'Renter wealth'], rows) + '\n\nModel: the renter invests the down payment and buying costs, and each month whoever pays less invests the difference. No income tax on returns, no mortgage interest relief, constant rates. Results are very sensitive to growth and return assumptions; try a few.' + NOTE;
    }),
  calc('lease-vs-buy-car-calculator', FIN, 'Lease vs Buy Car Calculator',
    'Total cost of leasing against buying a car over the same period, using lease payments and fees, loan terms and expected resale value.',
    [num('months', 'Period to compare in months', 48), num('lpay', 'Lease payment per month', 380), num('lup', 'Lease payment due at signing', 1500), num('lend', 'Lease end fees (disposal, excess mileage, wear)', 400),
      num('price', 'Purchase price', 30000), num('down', 'Deposit', 3000), num('rate', 'Loan rate %', 6), num('term', 'Loan term in months', 60), num('resale', 'Expected resale value at the end of the period', 14000)], (o) => {
      pos(o, 'months', 'price', 'term'); nn(o, 'lpay', 'lup', 'lend', 'down', 'rate', 'resale'); if (o.down >= o.price) throw new Error('Deposit must be smaller than the price');
      const L = o.lup + o.lpay * o.months + o.lend, P = o.price - o.down, n = Math.round(o.term), i = o.rate / 1200, pm = pmtOf(P, i, n), k = Math.min(n, Math.round(o.months));
      let bal = P; for (let j = 0; j < k; j++) bal = bal * (1 + i) - pm; bal = Math.max(0, bal);
      const paid = pm * k, B = o.down + paid + bal - o.resale;
      return `Lease over ${o.months} months\n  Signing ${m(o.lup)} + ${o.months} x ${m(o.lpay)} + end fees ${m(o.lend)}\n  Total cost: ${m(L)}  (you own nothing at the end)\n\nBuy over ${o.months} months\n  Deposit ${m(o.down)} + ${k} loan payments of ${m(pm)} (${m(paid)})\n  Loan balance paid off at the end: ${m(bal)}\n  Minus resale value: ${m(o.resale)}\n  Total cost: ${m(B)}\n\n${Math.abs(L - B) < 1 ? 'About equal.' : (L < B ? 'Leasing' : 'Buying') + ' costs ' + m(Math.abs(L - B)) + ' less over this period.'}\nPer month: lease ${m(L / o.months)}, buy ${m(B / o.months)}.\n\nIgnores interest you could earn on the cash, insurance and tax differences, and assumes the resale value you entered. Resale value is the biggest unknown.` + NOTE;
    }),
  text('bill-splitter', FIN, 'Bill Splitter (Uneven Shares, Tax and Tip)',
    'Split a bill among people with items each person ordered, a shared amount split by weight, tax and tip. Amounts are rounded to cents and always add up to the total.',
    'People (name | own items e.g. 12.50 + 4 | share weight for shared items, default 1)', 'Ana | 18.50 + 4.00 | 1\nBen | 22.00 | 1\nChris | 9.50 | 1\nDana | 0 | 2',
    [num('shared', 'Shared items total (starters, drinks for the table)', 36), num('tax', 'Tax % added to items', 0), num('tip', 'Tip %', 10), sel('base', 'Tip is calculated on', ['amount before tax', 'amount after tax'])], (s, o) => {
      nn(o, 'shared', 'tax', 'tip'); const ppl = lines(s).map((l, k) => { const p = l.split('|').map((x) => x.trim()); if (!p[0]) throw new Error(`Line ${k + 1}: name missing`); const own = (p[1] || '0').split('+').reduce((a, x) => a + money(x || 0, 'item'), 0), w = p[2] ? money(p[2], 'weight') : 1; if (w < 0) throw new Error('Weight cannot be negative'); return { name: p[0], own, w }; });
      if (!ppl.length) throw new Error('Add at least one person'); const tw = ppl.reduce((a, x) => a + x.w, 0); if (o.shared > 0 && tw <= 0) throw new Error('Weights add up to zero');
      const share = (total) => { const c = Math.round(total * 100); return c; };
      const subs = ppl.map((x) => x.own + (tw ? o.shared * x.w / tw : 0)), sub = subs.reduce((a, x) => a + x, 0);
      const taxA = sub * o.tax / 100, tipA = (o.base === 'amount after tax' ? sub + taxA : sub) * o.tip / 100;
      const totals = subs.map((x) => x * (1 + o.tax / 100) + (sub ? (x * (1 + (o.base === 'amount after tax' ? o.tax / 100 : 0))) * o.tip / 100 : 0));
      const grand = share(sub + taxA + tipA), raw = totals.map((x) => x * 100), fl = raw.map(Math.floor); let rest = grand - fl.reduce((a, x) => a + x, 0);
      raw.map((x, k) => [x - fl[k], k]).sort((a, b) => b[0] - a[0]).forEach(([, k]) => { if (rest > 0) { fl[k]++; rest--; } });
      return tbl(['Person', 'Items', 'Shared part', 'Pays'], ppl.map((x, k) => [x.name, m(x.own), m(subs[k] - x.own), m(fl[k] / 100)])) + `\n\nItems and shared: ${m(sub)}\nTax: ${m(taxA)}\nTip: ${m(tipA)}\nTotal: ${m(grand / 100)}\n\nRounding leftover cents go to the largest fractions so the shares add up to the total exactly.`;
    }),
  text('subscription-cost-tracker', FIN, 'Subscription Cost Tracker (Monthly and Yearly Total)',
    'Paste your subscriptions with price and billing cycle to get the monthly and yearly total, sorted by cost with each one\'s share.',
    'Subscriptions (name, price, cycle: weekly, monthly, quarterly, half-yearly, yearly)', 'Streaming video, 13.99, monthly\nMusic, 10.99, monthly\nCloud storage, 99.99, yearly\nNews site, 29.90, quarterly\nGym, 39, monthly\nDomain name, 14.50, yearly',
    [num('keep', 'Highlight items above this monthly cost (0 = none)', 12)], (s, o) => {
      const per = { weekly: 52 / 12, week: 52 / 12, monthly: 1, month: 1, quarterly: 1 / 3, quarter: 1 / 3, 'half-yearly': 1 / 6, biannual: 1 / 6, semiannual: 1 / 6, yearly: 1 / 12, annual: 1 / 12, annually: 1 / 12, year: 1 / 12 };
      const it = lines(s).map((l, k) => { const p = parts(l); if (p.length < 3) throw new Error(`Line ${k + 1}: use name, price, cycle`); const f = per[p[2].toLowerCase()]; if (!f) throw new Error(`Line ${k + 1}: unknown cycle "${p[2]}"`); return { n: p[0], p: money(p[1], 'price'), c: p[2].toLowerCase(), mo: money(p[1], 'price') * f }; }).sort((a, b) => b.mo - a.mo);
      if (!it.length) throw new Error('Add at least one subscription'); const tot = it.reduce((a, x) => a + x.mo, 0);
      return tbl(['Name', 'Price', 'Cycle', 'Per month', 'Per year', 'Share', ''], it.map((x) => [x.n, m(x.p), x.c, m(x.mo), m(x.mo * 12), r(tot ? x.mo / tot * 100 : 0, 1) + '%', o.keep > 0 && x.mo > o.keep ? '<- review' : ''])) + `\n\nTotal per month: ${m(tot)}\nTotal per year: ${m(tot * 12)}\nSubscriptions: ${it.length}\n\nWeekly prices use 52 weeks a year. Nothing is stored; the list lives in this page only.`;
    }),
];

const part1 = [...loans, ...money2, ...decisions];

// ---------- EU VAT ----------
// Source: europa.eu "VAT rules and rates" (Your Europe), page showed "Last checked: 13/07/2026". Transcribed by hand; region-specific rates are not listed there.
const VAT_AS_OF = '13 July 2026 (europa.eu, Your Europe, VAT rules and rates)';
const VATR = {
  AT: ['Austria', 20, '10, 13', '', '13'], BE: ['Belgium', 21, '6, 12', '', '12'], BG: ['Bulgaria', 20, '9', '', ''], CY: ['Cyprus', 19, '5, 9', '3', ''], CZ: ['Czechia', 21, '12, 0', '', ''],
  DE: ['Germany', 19, '7', '', ''], DK: ['Denmark', 25, '0', '', ''], EE: ['Estonia', 24, '9', '', ''], EL: ['Greece', 24, '6, 13, 17', '4', ''], ES: ['Spain', 21, '10', '4', ''],
  FI: ['Finland', 25.5, '10, 13.5', '', ''], FR: ['France', 20, '5.5, 10', '2.1', ''], HR: ['Croatia', 25, '5, 13', '', ''], HU: ['Hungary', 27, '5, 18', '', ''], IE: ['Ireland', 23, '9, 13.5', '', ''],
  IT: ['Italy', 22, '5, 10', '4', ''], LT: ['Lithuania', 21, '5, 12', '', ''], LU: ['Luxembourg', 17, '8', '3', '14'], LV: ['Latvia', 21, '5, 12', '', ''], MT: ['Malta', 18, '5, 7', '', '12'],
  NL: ['Netherlands', 21, '9', '', ''], PL: ['Poland', 23, '5, 8', '', ''], PT: ['Portugal', 23, '6, 13', '', '13'], RO: ['Romania', 21, '11', '', ''], SE: ['Sweden', 25, '6, 12', '', ''],
  SI: ['Slovenia', 22, '5, 9.5', '', ''], SK: ['Slovakia', 23, '5, 19', '', ''],
};
const cc = (c) => { const x = String(c).trim().toUpperCase(); return x === 'GR' ? 'EL' : x; };
const BIG = '999999999999';

const vat = [
  calc('eu-vat-rates-lookup', REF, 'EU VAT Rates by Country (Standard, Reduced, Super-Reduced, Parking)',
    'Standard, reduced, super-reduced and parking VAT rates for all 27 EU member states, from a table bundled in the page with its source and date.',
    [txt('country', 'Country code or name (empty = all)', ''), sel('sort', 'Sort', ['country', 'standard rate high to low', 'standard rate low to high'])], (o) => {
      const q = String(o.country || '').trim().toLowerCase();
      let rows = Object.entries(VATR).filter(([c, v]) => !q || c.toLowerCase() === q || (q === 'gr' && c === 'EL') || v[0].toLowerCase().includes(q));
      if (!rows.length) throw new Error('No EU member state matches "' + o.country + '"');
      if (o.sort === 'standard rate high to low') rows.sort((a, b) => b[1][1] - a[1][1]); else if (o.sort === 'standard rate low to high') rows.sort((a, b) => a[1][1] - b[1][1]);
      return tbl(['Code', 'Country', 'Standard %', 'Reduced %', 'Super-reduced %', 'Parking %'], rows.map(([c, v]) => [c, v[0], v[1], v[2] || '-', v[3] || '-', v[4] || '-'])) +
        `\n\nSource: ${VAT_AS_OF}. Copied by hand, not checked against national law. The source table leaves out region-specific rates (for example the Canary Islands, the Azores, Madeira). Which goods and services get a reduced rate is set nationally and not listed here. Greece uses the code EL for VAT. Rates change: check the national tax authority before invoicing.`;
    }),
  text('oss-vat-calculator', DOCS, 'OSS VAT Calculator (One-Stop-Shop VAT per Destination Country)',
    'Work out VAT due in each EU destination country for distance sales to consumers, at each country\'s standard rate or one you enter, with totals for the OSS return.',
    'Sales per customer country (country code, amount; optional third column: rate % override)', 'DE, 4200.00\nFR, 1850.50\nNL, 960\nIT, 700, 4\nES, 1320.75',
    [sel('mode', 'Amounts are', ['net (without VAT)', 'gross (VAT included)']), txt('home', 'Your own country code (not OSS, flagged if present)', 'BE')], (s, o) => {
      const home = cc(o.home), by = {}; const net = o.mode.startsWith('net');
      lines(s).forEach((l, k) => { const p = parts(l); if (p.length < 2) throw new Error(`Line ${k + 1}: use country, amount`); const c = cc(p[0]); if (!VATR[c]) throw new Error(`Line ${k + 1}: unknown EU country code "${p[0]}"`); if (c === home) throw new Error(`Line ${k + 1}: ${c} is your own country, domestic sales go on your normal VAT return, not OSS`); const rate = p[2] ? money(p[2], 'rate') : VATR[c][1]; const a = money(p[1], 'amount'); const key = c + '|' + rate; by[key] = by[key] || { c, rate, base: 0 }; by[key].base += net ? a : a / (1 + rate / 100); });
      const rows = Object.values(by).sort((a, b) => a.c.localeCompare(b.c) || a.rate - b.rate); if (!rows.length) throw new Error('Add at least one sale');
      const tn = rows.reduce((a, x) => a + x.base, 0), tv = rows.reduce((a, x) => a + x.base * x.rate / 100, 0);
      return tbl(['Country', 'Net sales', 'Rate %', 'VAT due'], rows.map((x) => [x.c + ' ' + VATR[x.c][0], m(x.base), x.rate, m(x.base * x.rate / 100)])) + `\n\nTotal net sales: ${m(tn)}\nTotal VAT to report: ${m(tv)}\nGross total: ${m(tn + tv)}\n\nUses standard rates as of ${VAT_AS_OF} unless you give a rate. Reduced rates apply only to qualifying goods and services (set per country). OSS returns are filed through your home tax authority; check its rules for the filing period and for currency conversion. This sheet does not file anything.` + NOTE;
    }),
  calc('eu-distance-selling-threshold-tracker', FIN, 'EU Distance Selling Threshold Tracker (EUR 10,000)',
    'Track monthly B2C sales to customers in other EU countries against the EUR 10,000 Union-wide threshold, with headroom and the month you pass it.',
    [txt('months', 'Monthly sales to consumers in other EU states, excl. VAT (comma separated, January first)', '1200, 1800, 2100, 1500, 2600, 1900'), chk('prev', 'The threshold was already exceeded in the previous calendar year'), num('thr', 'Threshold', 10000)], (o) => {
      pos(o, 'thr'); const a = String(o.months).split(/[\s,;]+/).filter(Boolean).map((x) => money(x, 'month')); if (!a.length || a.length > 12) throw new Error('Enter 1 to 12 monthly amounts');
      const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; let cum = 0, hit = -1; const rows = a.map((v, k) => { cum += v; if (hit < 0 && cum > o.thr) hit = k; return [M[k], m(v), m(cum), m(o.thr - cum)]; });
      return tbl(['Month', 'Sales', 'Running total', 'Headroom'], rows) + '\n\n' +
        (o.prev ? 'The threshold was exceeded last year, so destination-country VAT already applies to all your distance sales this year.' : hit >= 0 ? `The threshold is passed in ${M[hit]}. From the supply that takes you over it, destination-country VAT applies (register for the One-Stop-Shop or in each country). Check how your country treats the month itself.` : `Below the threshold: ${m(o.thr - cum)} headroom left after ${M[a.length - 1]} (${r(cum / o.thr * 100, 1)}% used). Average pace ${m(cum / a.length)} per month would reach it ${cum / a.length > 0 ? 'in about ' + Math.ceil((o.thr - cum) / (cum / a.length)) + ' more months' : 'never'}.`) +
        '\n\nBasis: Article 59c of Directive 2006/112/EC (consolidated text of 1 January 2025 read on EUR-Lex): the EUR 10,000 limit covers the total of your cross-border B2C supplies of goods and telecom, broadcasting and electronic services to all other member states together, in the current and the previous calendar year; it applies only if you are established in one member state. You may opt out and charge destination VAT from the start. Amounts excl. VAT.' + NOTE;
    }),
  text('vat-return-summary-builder', DOCS, 'VAT Return Summary Builder (Output VAT, Input VAT, Net Payable)',
    'Paste sales and purchase lines to total VAT collected and VAT paid by rate and see the net amount payable or reclaimable.',
    'Lines (type S or P, date, description, net amount, VAT rate %)', 'S, 2026-01-05, Consulting January, 4000, 21\nS, 2026-01-18, Training, 1500, 21\nS, 2026-01-22, Export sale, 2500, 0\nP, 2026-01-09, Software, 240, 21\nP, 2026-01-14, Office rent, 900, 21\nP, 2026-01-30, Books, 80, 6',
    [chk('gross', 'Amounts include VAT')], (s, o) => {
      const S = {}, P = {};
      lines(s).forEach((l, k) => { const p = parts(l); if (p.length < 5) throw new Error(`Line ${k + 1}: use S or P, date, description, amount, rate`); const t = p[0].toUpperCase(), rate = money(p[p.length - 1], 'rate'), a = money(p[p.length - 2], 'amount'), base = o.gross ? a / (1 + rate / 100) : a; const tgt = t === 'S' ? S : t === 'P' ? P : null; if (!tgt) throw new Error(`Line ${k + 1}: start with S (sale) or P (purchase)`); tgt[rate] = tgt[rate] || [0, 0]; tgt[rate][0] += base; tgt[rate][1]++; });
      const sec = (T) => Object.keys(T).map(Number).sort((a, b) => a - b).map((rt) => [rt + '%', T[rt][1], m(T[rt][0]), m(T[rt][0] * rt / 100)]);
      const sum = (T) => Object.keys(T).reduce((a, rt) => [a[0] + T[rt][0], a[1] + T[rt][0] * rt / 100], [0, 0]), [sn, sv] = sum(S), [pn, pv] = sum(P), net = sv - pv;
      if (sn === 0 && pn === 0) throw new Error('Add at least one line');
      return 'Sales (output VAT)\n' + tbl(['Rate', 'Lines', 'Net', 'VAT'], sec(S)) + `\nTotal: net ${m(sn)}, VAT ${m(sv)}\n\nPurchases (input VAT)\n` + tbl(['Rate', 'Lines', 'Net', 'VAT'], sec(P)) + `\nTotal: net ${m(pn)}, VAT ${m(pv)}\n\n` + (net >= 0 ? `VAT payable: ${m(net)}` : `VAT reclaimable: ${m(-net)}`) + '\n\nA summary for your own bookkeeping, not a filing. Boxes, special schemes, reverse-charge entries, non-deductible input VAT and rounding rules differ by country.';
    }),
  calc('reverse-charge-checker', REF, 'EU Reverse Charge Checker for Cross-Border B2B Sales',
    'Answer a few questions about seller, buyer and supply to see whether VAT is normally reverse-charged or the sale is exempt, and the invoice wording to consider.',
    [sel('where', 'Where is the buyer?', ['another EU country', 'same EU country as me', 'outside the EU']), sel('who', 'Who is the buyer?', ['business with a valid VAT ID', 'business without a VAT ID', 'consumer or private person']),
      sel('what', 'What do you supply?', ['services', 'goods']), chk('moved', 'Goods only: they are shipped to the buyer\'s country (not collected for use in my country)', true), chk('exc', 'Services only: land or buildings, passenger transport, event admission, restaurant, short-term vehicle hire or similar')], (o) => {
      const b2b = o.who.startsWith('business with'); let v, w = '', why = '';
      if (o.where.startsWith('same')) { v = 'No cross-border reverse charge. Charge your local VAT.'; why = 'Domestic sale. Some countries apply a domestic reverse charge to listed items (for example construction work, scrap, emissions allowances). Check national rules.'; }
      else if (o.where.startsWith('outside')) {
        if (o.what === 'goods') { v = 'Export of goods: normally exempt from VAT with proof of exit (zero-rated).'; w = 'Exempt export of goods - Article 146 Directive 2006/112/EC'; why = 'Article 146 exempts goods dispatched outside the Union. You must keep evidence of export. The buyer may owe import VAT and duty.'; }
        else { v = b2b ? 'Services to a business outside the EU: usually outside the scope of EU VAT. No EU VAT charged.' : 'Services to a non-EU consumer: usually outside scope, with exceptions (for example some digital services). Check.'; w = 'Not subject to EU VAT - place of supply outside the EU (Article 44 Directive 2006/112/EC)'; why = 'Place of supply for B2B services is where the buyer is established (Article 44).'; }
      } else if (!b2b) { v = 'No reverse charge. This is a B2C sale: normally VAT of your country, or the buyer\'s country above the EUR 10,000 distance-selling threshold (OSS).'; why = 'Reverse charge needs a business buyer with a VAT ID. If you cannot validate the ID, treat the sale as B2C.'; }
      else if (o.what === 'services') {
        if (o.exc) { v = 'The general B2B rule probably does not apply: these services have special place-of-supply rules (often where the property, event or activity is).'; why = 'Look up the exceptions in Articles 45 to 59a of the VAT Directive and the national law. VAT may be due in the other country and you may have to register there.'; }
        else { v = 'Reverse charge applies: you invoice without VAT and the buyer accounts for it.'; w = 'VAT reverse charge - the customer is liable for VAT (Article 196 Directive 2006/112/EC)'; why = 'The place of supply is the buyer\'s country (Article 44) and the buyer is liable (Article 196). Put both VAT IDs on the invoice and report the sale on your EC Sales List.'; }
      } else if (o.moved) { v = 'Intra-Community supply of goods: exempt from VAT in your country (zero-rated); the buyer accounts for acquisition VAT.'; w = 'Intra-Community supply, exempt from VAT - Article 138 Directive 2006/112/EC'; why = 'Article 138 exempts goods moved to another member state for a buyer with a valid VAT ID. You must report it on the recapitulative statement (Article 262) and keep transport proof. This is an exemption plus acquisition VAT, often loosely called reverse charge.'; }
      else { v = 'No exemption: the goods stay in your country, so charge local VAT.'; why = 'The intra-EU exemption needs the goods to leave for another member state.'; }
      return `Result: ${v}\n\n` + (w ? `Invoice wording to consider: "${w}"\n\n` : '') + `Why: ${why}\n\nChecks: validate the buyer's VAT ID in VIES on the day (this tool cannot, it works offline), show both VAT IDs on the invoice, keep the proof.\n\nThis is a rule-of-thumb guide to the main cases in Directive 2006/112/EC (texts of Articles 44, 138, 146, 196 and 262 read on EUR-Lex, consolidated version of 1 January 2025). National rules, chain transactions, triangulation and special schemes are not covered. Not tax advice.`;
    }),
];

// ---------- invoicing helpers ----------
const ART226 = [
  ['date', '1', 'Date of issue', true], ['seq', '2', 'Sequential number that uniquely identifies the invoice', true], ['svat', '3', 'Your VAT identification number', true],
  ['cvat', '4', 'Customer VAT identification number (required for reverse charge and intra-EU supplies of goods)', 'cvatIf'], ['names', '5', 'Full name and address of you and the customer', true],
  ['what', '6', 'Quantity and nature of the goods, or extent and nature of the services', true], ['sdate', '7', 'Date of supply (or of the payment on account), if different from the issue date', true],
  ['base', '8', 'Taxable amount per rate or exemption, unit price excluding VAT, and discounts not already in the price', true], ['rate', '9', 'VAT rate applied', 'vatIf'], ['amt', '10', 'VAT amount payable', 'vatIf'],
  ['ref', '11', 'Reference to the exemption or reverse-charge provision (or wording that says so)', 'exIf'], ['nmot', '12', 'Characteristics of a new means of transport', 'nmotIf'],
  ['tour', '13', 'Reference to the margin scheme for travel agents (Article 306)', 'tourIf'], ['marg', '14', 'Reference to the second-hand goods, art or antiques margin scheme (Articles 313, 326 or 333)', 'margIf'],
  ['rep', '15', 'VAT ID, full name and address of the tax representative', 'repIf'],
];
const more = [
  calc('eu-invoice-requirements-checker', REF, 'EU Invoice Requirements Checker (VAT Directive Article 226)',
    'Tick what your invoice shows and which special case applies to see which of the 15 mandatory details of Article 226 are missing.',
    [chk('exIf', 'Case: the supply is exempt or the customer pays the VAT (reverse charge)'), chk('cvatIf', 'Case: reverse charge or intra-EU supply of goods (customer VAT ID required)'), chk('vatIf', 'Case: VAT is charged on this invoice', true), chk('nmotIf', 'Case: new means of transport'), chk('tourIf', 'Case: travel agent margin scheme'), chk('margIf', 'Case: second-hand, art or antiques margin scheme'), chk('repIf', 'Case: a tax representative is liable for the VAT'),
      ...ART226.map((a) => chk('has_' + a[0], `Shown: ${a[2]}`, !['has_ref', 'has_sdate'].includes('has_' + a[0]) && !['nmot', 'tour', 'marg', 'rep'].includes(a[0])))], (o) => {
      const rows = ART226.map((a) => { const need_ = a[3] === true || o[a[3]]; const has = o['has_' + a[0]]; return { a, need_, has }; });
      const miss = rows.filter((x) => x.need_ && !x.has), ok = rows.filter((x) => x.need_ && x.has), na = rows.filter((x) => !x.need_);
      return (miss.length ? `Review ${miss.length} missing detail${miss.length > 1 ? 's' : ''}:\n` + miss.map((x) => `  [ ] (${x.a[1]}) ${x.a[2]}`).join('\n') : 'All details required for your case are ticked.') + `\n\nPresent (${ok.length}):\n` + ok.map((x) => `  [x] (${x.a[1]}) ${x.a[2]}`).join('\n') + (na.length ? `\n\nNot required in your case (${na.length}):\n` + na.map((x) => `  - (${x.a[1]}) ${x.a[2]}`).join('\n') : '') +
        '\n\nBasis: the list of "only the following details are required for VAT purposes" in Article 226 of Directive 2006/112/EC (text read on EUR-Lex). Member states can allow fewer details (simplified invoices, Article 238) and many add national rules such as company registration numbers, payment terms or e-invoice formats. Point 7 is only needed when the supply date differs from the issue date; tick it if it does not apply.';
    }),
  calc('invoice-number-generator', DOCS, 'Invoice Number Generator (Prefix, Year, Padding, Yearly Reset)',
    'Generate the next invoice numbers with a prefix, separator, year part and zero padding. Continue from your last number, and restart each new year.',
    [txt('prefix', 'Prefix', 'INV'), txt('sep', 'Separator', '-'), sel('year', 'Year part', ['YYYY', 'YY', 'YYYYMM', 'none']), num('pad', 'Digits in the counter', 4), num('start', 'Start the counter at', 1), num('count', 'How many numbers', 5),
      dat('on', 'Invoice date', '2026-03-14'), txt('last', 'Last number issued (blank = start fresh)', 'INV-2026-0041'), chk('reset', 'Restart the counter when the year changes', true)], (o) => {
      const d = D(o.on), Y = String(d.getUTCFullYear()), mm = String(d.getUTCMonth() + 1).padStart(2, '0'); nn(o, 'pad', 'start'); const cnt = Math.round(o.count); if (!(cnt >= 1 && cnt <= 500)) throw new Error('Count must be 1 to 500');
      const yp = o.year === 'YYYY' ? Y : o.year === 'YY' ? Y.slice(2) : o.year === 'YYYYMM' ? Y + mm : '';
      let n = Math.round(o.start), note = 'Starting at ' + n;
      const last = String(o.last).trim();
      if (last) {
        const t = /(\d+)\s*$/.exec(last); if (!t) throw new Error('The last number must end in digits');
        const prevYear = o.year === 'none' ? null : (last.slice(o.prefix.length).match(/\d{2,6}/) || [''])[0];
        const same = o.year === 'none' || !o.reset || !prevYear || prevYear === yp || (o.year === 'YYYYMM' && prevYear.slice(0, 4) === Y);
        if (same) { n = parseInt(t[1], 10) + 1; note = 'Continuing after ' + last; } else note = `New year or period (${prevYear} -> ${yp}): counter restarts at ${n}`;
      }
      const out = []; for (let k = 0; k < cnt; k++) out.push([o.prefix, yp, String(n + k).padStart(Math.round(o.pad), '0')].filter((x) => x !== '').join(o.sep));
      return out.join('\n') + '\n\n' + note + '\n\nMost EU countries require a sequential number that uniquely identifies each invoice (Article 226(2) allows several series). Gaps are not banned by the Directive but explain any in your records. Never reuse a number. Check national rules (some require no gaps).';
    }),
  text('credit-note-generator', DOCS, 'Credit Note Generator (Printable, Referencing the Original Invoice)',
    'Create a credit note that references the original invoice, lists the credited lines with negative amounts and recalculates VAT per rate. Print it or save as PDF.',
    'Credited lines (description | qty | unit price excl. VAT | VAT %)', 'Website design, returned item | 1 | 1200 | 21\nHosting, 3 months refunded | 3 | 25 | 21',
    [txt('from', 'Your name and address (use / for a new line)', 'Example BV / Main Street 1 / 1000 Brussels'), txt('vatid', 'Your VAT ID', 'BE0123456789'), txt('to', 'Customer name and address (use / for a new line)', 'Client NV / Side Road 2 / 2000 Antwerp'),
      txt('cn', 'Credit note number', 'CN-2026-0003'), dat('date', 'Credit note date', '2026-03-14'), txt('inv', 'Original invoice number', 'INV-2026-0041'), dat('invdate', 'Original invoice date', '2026-02-20'), txt('cur', 'Currency', 'EUR'), txt('reason', 'Reason', 'Service not delivered')],
    (s, o) => {
      const items = lines(s).map((l, k) => { const p = l.split('|').map((x) => x.trim()); if (p.length < 4) throw new Error(`Line ${k + 1}: use description | qty | unit price | VAT %`); const q = money(p[1], 'qty'), u = money(p[2], 'price'), v = money(p[3], 'VAT'); return { d: p[0], q, u, v, net: -(q * u) }; });
      if (!items.length) throw new Error('Add at least one line'); D(o.date); D(o.invdate);
      const by = {}; items.forEach((x) => { by[x.v] = (by[x.v] || 0) + x.net; }); const f = (n) => esc(o.cur) + ' ' + m(n);
      const vats = Object.keys(by).map(Number).sort((a, b) => a - b), tn = items.reduce((a, x) => a + x.net, 0), tv = vats.reduce((a, v) => a + by[v] * v / 100, 0);
      const br = (x) => esc(x).split('/').map((y) => y.trim()).join('<br>');
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Credit note ${esc(o.cn)}</title><style>body{font:14px/1.4 system-ui,sans-serif;margin:32px;color:#111;background:#fff}h1{font-size:24px;margin:0 0 4px}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border-bottom:1px solid #ccc;padding:6px;text-align:left}th.r,td.r{text-align:right}.g{display:flex;gap:40px;justify-content:space-between}.t td{font-weight:700;border-top:2px solid #111}@media print{body{margin:0}}</style></head><body><div class="g"><div><h1>Credit note</h1><div>No. ${esc(o.cn)}<br>Date ${esc(o.date)}<br>Refers to invoice ${esc(o.inv)} of ${esc(o.invdate)}</div></div><div><b>${br(o.from)}</b><br>VAT ID ${esc(o.vatid)}</div></div><p><b>To</b><br>${br(o.to)}</p><p>Reason: ${esc(o.reason)}</p>
<table><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">VAT %</th><th class="r">Amount</th></tr>${items.map((x) => `<tr><td>${esc(x.d)}</td><td class="r">${r(x.q, 4)}</td><td class="r">${m(x.u)}</td><td class="r">${r(x.v, 2)}</td><td class="r">${m(x.net)}</td></tr>`).join('')}</table>
<table><tr><th>VAT rate</th><th class="r">Net credited</th><th class="r">VAT credited</th></tr>${vats.map((v) => `<tr><td>${r(v, 2)}%</td><td class="r">${m(by[v])}</td><td class="r">${m(by[v] * v / 100)}</td></tr>`).join('')}<tr class="t"><td>Total credited</td><td class="r">${f(tn)}</td><td class="r">${f(tv)}</td></tr><tr class="t"><td colspan="2">Total including VAT</td><td class="r">${f(tn + tv)}</td></tr></table>
<p>This credit note reduces the amount due on the invoice named above.</p></body></html>`;
      return { html, text: `Credit note ${o.cn} for invoice ${o.inv}: net ${m(tn)}, VAT ${m(tv)}, total ${m(tn + tv)} ${o.cur}` };
    }),
  calc('sepa-epc-qr-code-generator', DOCS, 'SEPA Payment QR Code Generator (EPC QR for Banking Apps)',
    'Create an EPC (GiroCode style) QR code with beneficiary, IBAN, amount and reference. Banking apps in the euro area scan it to pre-fill a SEPA credit transfer.',
    [txt('name', 'Beneficiary name (max 70 characters)', 'Example BV'), txt('iban', 'IBAN', 'BE68 5390 0754 7034'), txt('bic', 'BIC (optional)', ''), num('amount', 'Amount in EUR (0 = let the payer enter it)', 125.5),
      sel('reftype', 'Reference type', ['unstructured text', 'structured creditor reference (RF or OGM)']), txt('ref', 'Payment reference or text (max 140 / 35 characters)', 'Invoice INV-2026-0041'), txt('purpose', 'Purpose code (optional, 4 letters, e.g. CHAR)', ''), sel('ecc', 'Error correction', ['M', 'L', 'Q', 'H'])], (o) => {
      const name = o.name.trim(); if (!name) throw new Error('Beneficiary name is required'); if ([...name].length > 70) throw new Error('Name is longer than 70 characters');
      const chkv = _qr.ibanCheck(o.iban); if (!chkv.startsWith('valid')) throw new Error('IBAN ' + chkv); const iban = o.iban.replace(/\s+/g, '').toUpperCase();
      const bic = o.bic.trim().toUpperCase(); if (bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) throw new Error('BIC must be 8 or 11 characters');
      if (!(o.amount >= 0 && o.amount <= 999999999.99)) throw new Error('Amount must be between 0 and 999,999,999.99'); const amt = o.amount > 0 ? 'EUR' + o.amount.toFixed(2) : '';
      const ref = o.ref.trim(), struct = o.reftype.startsWith('structured'); if (struct && [...ref].length > 35) throw new Error('A structured reference is at most 35 characters'); if (!struct && [...ref].length > 140) throw new Error('Text is longer than 140 characters');
      const pu = o.purpose.trim().toUpperCase(); if (pu && !/^[A-Z]{4}$/.test(pu)) throw new Error('Purpose code is 4 letters');
      const payload = ['BCD', '002', '1', 'SCT', bic, name, iban, amt, pu, struct ? ref.replace(/\s+/g, '') : '', struct ? '' : ref, ''].join('\n').replace(/\n+$/, '');
      if (new TextEncoder().encode(payload).length > 331) throw new Error('Payload is over the 331 byte EPC limit');
      const mx = _qr.qrMatrix(payload, o.ecc, -1);
      return { text: _qr.qrSvg(mx.matrix, 4), blob: [_qr.pngBlob(mx.matrix, 8, 4)], filename: 'sepa-payment-qr.png' };
    }),
  calc('structured-payment-reference-generator', REF, 'Payment Reference Generator and Checker (ISO 11649 RF, Belgian OGM/VCS)',
    'Generate an RF creditor reference or a Belgian +++000/0000/00000+++ structured communication with its check digits, or verify one you already have.',
    [sel('mode', 'Action', ['create RF reference', 'create Belgian OGM/VCS', 'verify a reference']), txt('val', 'Invoice or customer number (RF: up to 21 letters or digits; OGM: up to 10 digits; verify: full reference)', '2026-0041')], (o) => {
      const v = String(o.val).trim(); if (!v) throw new Error('Enter a value');
      const cd = (body) => { const s = (body + 'RF00').toUpperCase().replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55); let rem = 0; for (const ch of s) rem = (rem * 10 + +ch) % 97; return String(98 - rem).padStart(2, '0'); };
      const rfOk = (x) => { const s = x.replace(/\s+/g, '').toUpperCase(); if (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(s)) return null; const t = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55); let rem = 0; for (const ch of t) rem = (rem * 10 + +ch) % 97; return rem === 1 ? s : false; };
      if (o.mode.startsWith('create RF')) { const b = v.replace(/[\s\-/.]/g, '').toUpperCase(); if (!/^[A-Z0-9]{1,21}$/.test(b)) throw new Error('Use letters and digits only, at most 21 (spaces and dashes are dropped)'); const rf = 'RF' + cd(b) + b; return `RF reference (electronic): ${rf}\nPrint format: ${rf.match(/.{1,4}/g).join(' ')}\nCheck digits: ${cd(b)}\n\nISO 11649: move RF00 behind the reference, turn letters into numbers (A=10 ... Z=35), check digits = 98 - (number mod 97). Put the reference in the structured remittance field of a SEPA transfer.`; }
      if (o.mode.startsWith('create Belgian')) { const d = v.replace(/\D/g, ''); if (!d || d.length > 10) throw new Error('Use 1 to 10 digits'); const base = d.padStart(10, '0'); let c = Number(BigInt(base) % 97n); if (c === 0) c = 97; const full = base + String(c).padStart(2, '0'); return `Structured communication: +++${full.slice(0, 3)}/${full.slice(3, 7)}/${full.slice(7)}+++\nDigits only: ${full}\nCheck digits: ${String(c).padStart(2, '0')}\n\nThe last two digits are the first ten digits modulo 97 (97 when the remainder is 0). Payers enter it as the structured communication ("gestructureerde mededeling" / "communication structuree").`; }
      const rf = rfOk(v); if (rf) return `Valid ISO 11649 RF reference.\nElectronic: ${rf}\nPrint: ${rf.match(/.{1,4}/g).join(' ')}`; if (rf === false) return 'Invalid RF reference: the check digits do not match.';
      const d = v.replace(/\D/g, ''); if (d.length === 12) { let c = Number(BigInt(d.slice(0, 10)) % 97n); if (c === 0) c = 97; return c === +d.slice(10) ? `Valid Belgian structured communication: +++${d.slice(0, 3)}/${d.slice(3, 7)}/${d.slice(7)}+++` : `Invalid Belgian structured communication: the check digits should be ${String(c).padStart(2, '0')}.`; }
      throw new Error('Not recognised: an RF reference starts with RF and two digits, a Belgian one has 12 digits');
    }),
  text('late-payment-interest-calculator', FIN, 'Late Payment Interest Calculator (EU Directive 2011/7/EU)',
    'Statutory interest on an overdue B2B invoice at the reference rate plus 8 points, with the fixed EUR 40 recovery sum, split across the semesters you enter.',
    'Reference rate by semester (date the rate took effect, rate %; the ECB rate in force on 1 January or 1 July)', '2025-01-01, 3.15\n2025-07-01, 2.15\n2026-01-01, 2.15',
    [num('amt', 'Overdue amount (incl. VAT)', 2500), dat('due', 'Due date', '2025-11-15'), dat('paid', 'Paid (or calculate until) date', '2026-03-10'), num('margin', 'Margin over the reference rate, points (minimum 8)', 8), num('fix', 'Fixed recovery sum', 40)],
    (s, o) => {
      pos(o, 'amt'); nn(o, 'margin', 'fix'); const due = D(o.due), paid = D(o.paid); if (paid <= due) return 'Not overdue: the payment date is on or before the due date. No interest is due.';
      const rt = lines(s).map((l, k) => { const p = parts(l); if (p.length < 2) throw new Error(`Rate line ${k + 1}: use date, rate`); return [D(p[0]), money(p[1], 'rate')]; }).sort((a, b) => a[0] - b[0]); if (!rt.length) throw new Error('Enter the reference rate');
      const first = addDays(due, 1); if (first < rt[0][0]) throw new Error('The first rate must start on or before ' + iso(first));
      const days = Math.round((paid - due) / 864e5), rows = []; let tot = 0;
      for (let k = 0; k < rt.length; k++) { const a = rt[k][0] > first ? rt[k][0] : first, b = k + 1 < rt.length ? addDays(rt[k + 1][0], -1) : paid, e = b < paid ? b : paid; if (e < a) continue; const dd = Math.round((e - a) / 864e5) + 1; const rate = rt[k][1] + o.margin, it = o.amt * rate / 100 * dd / 365; tot += it; rows.push([iso(a), iso(e), dd, r(rt[k][1], 3), r(rate, 3), m(it)]); }
      return tbl(['From', 'To', 'Days', 'Reference %', 'Interest %', 'Interest'], rows) + `\n\nDays late: ${days} (interest starts the day after the due date)\nInterest: ${m(tot)}\nFixed recovery sum: ${m(o.fix)}\nTotal claim on top of ${m(o.amt)}: ${m(tot + o.fix)}\n\nBasis: Directive 2011/7/EU read on EUR-Lex: statutory interest is simple interest at the reference rate plus at least eight percentage points (Article 2(6)), the rate of the first semester is the one in force on 1 January and of the second on 1 July (Article 3(2)), and the creditor is entitled to a fixed sum of at least EUR 40 (Article 6(1)). The reference rate is the ECB main refinancing rate for euro countries; the sample rates above are examples, enter the real ones. Interest is computed on 365 days. Countries can set higher rates and sums and apply other rules to consumers; contract terms may differ. Not legal advice.`;
    }),
  calc('payment-terms-due-date-calculator', FIN, 'Payment Terms Due Date Calculator (Net 30, Net 60, End of Month)',
    'Due date for an invoice from its date and a payment term such as net 14, net 30, net 60 or end of month plus days, with the days left until it falls due.',
    [dat('inv', 'Invoice date', '2026-03-14'), sel('term', 'Payment term', ['Net 7', 'Net 14', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90', 'End of month', '30 days end of month', '60 days end of month', 'Custom days'], 'Net 30'), num('days', 'Custom days', 21), dat('asof', 'Today (to count days left)', '2026-03-20'), sel('wk', 'If the due date falls on a weekend', ['keep it', 'move to the next Monday'])], (o) => {
      const d = D(o.inv); let due;
      const eom = (x) => new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), dim(x.getUTCFullYear(), x.getUTCMonth())));
      if (o.term === 'End of month') due = eom(d); else if (o.term.endsWith('end of month')) due = eom(addDays(d, parseInt(o.term, 10))); else if (o.term === 'Custom days') { nn(o, 'days'); due = addDays(d, Math.round(o.days)); } else due = addDays(d, parseInt(o.term.slice(4), 10));
      let note = ''; const dow = due.getUTCDay(); if (o.wk.startsWith('move') && (dow === 0 || dow === 6)) { due = addDays(due, dow === 6 ? 2 : 1); note = ' (moved from a weekend)'; }
      const left = Math.round((due - D(o.asof)) / 864e5);
      return `Invoice date: ${dstr(d)}\nTerm: ${o.term === 'Custom days' ? Math.round(o.days) + ' days' : o.term}\nDue date: ${dstr(due)}${note}\n` + (left > 0 ? `${left} day${left > 1 ? 's' : ''} left from ${o.asof}` : left === 0 ? 'Due today' : `${-left} day${left < -1 ? 's' : ''} overdue on ${o.asof}`) +
        '\n\nNet N counts N calendar days from the invoice date. "30 days end of month" means 30 days from the invoice date, then the end of that month. Terms are what the contract says; the invoice date, not the receipt date, is used. Public holidays are not considered. Under Directive 2011/7/EU (Article 3(5)) B2B payment periods over 60 days must be expressly agreed and not grossly unfair to the creditor.';
    }),
];

const part2 = [...vat, ...more];

// ---------- tax and business calculators (rates are always typed in by the user; none are bundled) ----------
const parseCsv = (s) => lines(s).map((l) => { const out = []; let cur = '', q = false; for (let k = 0; k < l.length; k++) { const c = l[k]; if (q) { if (c === '"' && l[k + 1] === '"') { cur += '"'; k++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',' || c === ';' || c === '\t') { out.push(cur.trim()); cur = ''; } else cur += c; } out.push(cur.trim()); return out; });
const csvCell = (x) => (/[",;\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : String(x));

const taxes = [
  text('income-tax-bracket-calculator', FIN, 'Income Tax Bracket Calculator (Progressive Brackets, Marginal and Effective Rate)',
    'Apply progressive tax brackets that you enter to an income. Shows tax per bracket, the marginal rate, the average (effective) rate and the net amount.',
    'Brackets (upper limit, rate %; leave the limit empty or write "and above" for the last one)', '0 - 15000, 0\n15000 - 45000, 25\n45000 - 90000, 40\nabove 90000, 50',
    [num('income', 'Taxable income', 62000), num('credit', 'Tax credits subtracted from the tax', 0), num('other', 'Other taxes paid on top, e.g. social contributions', 0)], (s, o) => {
      pos(o, 'income'); nn(o, 'credit', 'other');
      let prev = 0; const br = lines(s).map((l, k) => { const p = parts(l); if (p.length < 2) throw new Error(`Line ${k + 1}: use limit, rate`); const rate = money(p[p.length - 1], 'rate'); const lim = p[0].replace(/\s/g, ''); let up = Infinity; const mt = /^(?:[\d.,]+[-–])?([\d.,]+)$/.exec(lim); if (mt && !/^above|over|more/i.test(lim)) up = money(mt[1], 'limit'); if (up <= prev) throw new Error(`Line ${k + 1}: limits must increase`); const row = { from: prev, up, rate }; if (up !== Infinity) prev = up; return row; });
      if (!br.length) throw new Error('Add at least one bracket'); let tax = 0, marg = br[0].rate;
      const rows = br.map((b) => { const part = Math.max(0, Math.min(o.income, b.up) - b.from); tax += part * b.rate / 100; if (o.income > b.from) marg = b.rate; return [m(b.from) + ' - ' + (b.up === Infinity ? 'and above' : m(b.up)), b.rate + '%', m(part), m(part * b.rate / 100)]; });
      const due = Math.max(0, tax - o.credit), all = due + o.other;
      return tbl(['Bracket', 'Rate', 'Income in bracket', 'Tax'], rows) + `\n\nTax before credits: ${m(tax)}\nCredits: ${m(o.credit)}\nIncome tax: ${m(due)}\nMarginal rate (on the next unit earned): ${marg}%\nEffective rate (income tax / income): ${r(due / o.income * 100, 2)}%\n` + (o.other > 0 ? `All taxes including other ${m(o.other)}: ${m(all)}\nEffective rate on all taxes: ${r(all / o.income * 100, 2)}%\n` : '') + `Income after tax: ${m(o.income - all)}\n\nYou supply the brackets. The sample brackets are made up and are not any country's. Look up your country's current table at its tax authority. Deductions, allowances, family quotients and local taxes are not modelled.`;
    }),
  calc('capital-gains-tax-calculator', FIN, 'Capital Gains Tax Calculator (Holding Period, Exemption and Losses)',
    'Estimate tax on the gain from selling an asset with your rates: short and long holding-period rates, an annual exempt amount, losses and costs.',
    [num('buy', 'Purchase price', 20000), num('sell', 'Sale price', 31000), num('bcost', 'Buying costs', 150), num('scost', 'Selling costs', 150), num('days', 'Days held', 540), num('long', 'Days after which the long-term rate applies (0 = never)', 365),
      num('srate', 'Rate for short holding %', 30), num('lrate', 'Rate for long holding %', 15), num('exempt', 'Annual exempt amount', 1000), num('loss', 'Losses to offset', 0)], (o) => {
      pos(o, 'buy'); nn(o, 'sell', 'bcost', 'scost', 'days', 'long', 'srate', 'lrate', 'exempt', 'loss');
      const gain = o.sell - o.scost - o.buy - o.bcost, isLong = o.long > 0 && o.days >= o.long, rate = isLong ? o.lrate : o.srate;
      if (gain <= 0) return `Result: loss of ${m(-gain)}. No tax. Many tax systems let you carry a loss forward or set it against other gains: ${m(-gain)} to note down.`;
      const net = Math.max(0, gain - o.loss), tx = Math.max(0, net - o.exempt), tax = tx * rate / 100;
      return `Gain = sale - selling costs - purchase - buying costs = ${m(gain)}\nHolding: ${o.days} days -> ${isLong ? 'long' : 'short'} holding rate ${rate}%\nLosses offset: ${m(Math.min(o.loss, gain))}\nExempt amount used: ${m(Math.min(o.exempt, net))}\nTaxable gain: ${m(tx)}\n\nTax: ${m(tax)}\nNet profit after tax: ${m(gain - tax)}\nEffective rate on the gain: ${r(tax / gain * 100, 2)}%\n\nYou enter the rates and thresholds. Countries differ a lot (flat rates, income-tax bands, inflation indexation, exemptions for a home or small gains, a discount instead of a lower rate). Check your tax authority. For crypto or share lots with FIFO, see the capital gains calculator for crypto and shares.` + NOTE;
    }),
  calc('corporate-tax-estimator', FIN, 'Corporate Tax Estimator (Flat or Two-Tier Rate)',
    'Estimate company profit tax at the rate you enter, with an optional reduced rate on the first slice of profit and losses brought forward.',
    [num('profit', 'Taxable profit before loss relief', 180000), num('loss', 'Losses brought forward', 0), num('rate', 'Standard rate %', 25), num('rrate', 'Reduced rate % (0 = none)', 0), num('rlim', 'Reduced rate applies to profit up to', 100000), num('div', 'Share of the after-tax profit distributed % (0 = skip)', 0), num('dtax', 'Tax on dividends %', 0)], (o) => {
      need(o, 'profit'); nn(o, 'loss', 'rate', 'rrate', 'rlim', 'div', 'dtax'); const base = Math.max(0, o.profit - o.loss);
      const red = o.rrate > 0 ? Math.min(base, o.rlim) : 0, std = base - red, tax = red * o.rrate / 100 + std * o.rate / 100;
      let out = `Taxable base: ${m(base)}${o.loss ? ' (profit ' + m(o.profit) + ' minus losses ' + m(o.loss) + ')' : ''}\n` + (red ? `  ${m(red)} at ${o.rrate}% = ${m(red * o.rrate / 100)}\n` : '') + `  ${m(std)} at ${o.rate}% = ${m(std * o.rate / 100)}\n\nCorporate tax: ${m(tax)}\nEffective rate: ${base ? r(tax / base * 100, 2) : 0}%\nProfit after tax: ${m(o.profit - tax)}\n`;
      if (o.div > 0) { const d = (o.profit - tax) * o.div / 100, dt = d * o.dtax / 100; out += `\nDistributed: ${m(d)}, tax on it ${m(dt)}, shareholder receives ${m(d - dt)}\nTotal tax burden (company + dividend): ${m(tax + dt)} (${o.profit > 0 ? r((tax + dt) / o.profit * 100, 1) : 0}% of profit)\n`; }
      return out + '\nYou enter the rates; none are bundled because they differ by country and change. Taxable profit is accounting profit adjusted by non-deductible costs, depreciation rules and incentives, which this tool does not do. Minimum taxes and surcharges are not included.' + NOTE;
    }),
  calc('withholding-tax-calculator', FIN, 'Withholding Tax Calculator (Net from Gross, Gross-Up from Net)',
    'Compute withholding on a payment and the net amount, or the gross amount you must invoice so that a chosen net arrives after withholding.',
    [sel('mode', 'Calculate', ['net received from gross', 'gross needed for a net amount']), num('amt', 'Amount', 10000), num('rate', 'Withholding rate %', 15), num('treaty', 'Reduced treaty rate % (0 = not used)', 0)], (o) => {
      pos(o, 'amt'); nn(o, 'rate', 'treaty'); if (o.rate >= 100) throw new Error('Rate must be below 100'); const rt = o.treaty > 0 ? o.treaty : o.rate;
      if (o.mode.startsWith('net')) { const w = o.amt * rt / 100; return `Gross payment: ${m(o.amt)}\nWithholding at ${rt}%: ${m(w)}\nNet received: ${m(o.amt - w)}\n` + (o.treaty > 0 ? `Saved by the treaty rate vs ${o.rate}%: ${m(o.amt * (o.rate - o.treaty) / 100)}\n` : '') + '\nThe payer withholds and pays the tax authority; the receiver can often credit it in their own country. Treaty relief usually needs a residence certificate.'; }
      const g = o.amt / (1 - rt / 100); return `Net wanted: ${m(o.amt)}\nGross to invoice: ${m(g)}  (= net / (1 - ${rt}%))\nWithholding at ${rt}%: ${m(g - o.amt)}\n\nThe gross-up is only right if the payer withholds on the grossed-up amount and the contract says the payer bears the tax. Check the contract and local rules.`;
    }),
  calc('mileage-allowance-calculator', FIN, 'Mileage Allowance Calculator (Business Kilometres at Your Rate)',
    'Calculate a mileage reimbursement from kilometres driven at a per-km rate, with an optional lower rate above a distance threshold.',
    [num('km', 'Business kilometres', 4200), num('rate', 'Rate per km', 0.42), num('tier', 'Switch to the second rate after this many km (0 = single rate)', 0), num('rate2', 'Second rate per km', 0.2), num('limit', 'Annual tax-free cap in money (0 = none)', 0)], (o) => {
      nn(o, 'km', 'rate', 'tier', 'rate2', 'limit'); const t = o.tier > 0 ? Math.min(o.km, o.tier) : o.km, rest = o.km - t, a = t * o.rate, b = rest * o.rate2, tot = a + b;
      return `${r(t, 2)} km x ${o.rate} = ${m(a)}\n` + (rest > 0 ? `${r(rest, 2)} km x ${o.rate2} = ${m(b)}\n` : '') + `\nReimbursement: ${m(tot)}\nAverage per km: ${o.km ? m(tot / o.km) : '0.00'}\n` + (o.limit > 0 ? (tot > o.limit ? `Above the cap by ${m(tot - o.limit)}: that part may be taxable.\n` : `Within the cap of ${m(o.limit)}.\n`) : '') + '\nYou enter the rate. Official per-km rates and caps are set by each country and year, so none are built in; look up your tax authority\'s current figure. Keep a log of date, route, purpose and odometer.';
    }),
  calc('per-diem-allowance-calculator', FIN, 'Per Diem Allowance Calculator (Business Trip Daily Allowance)',
    'Add up a business trip allowance from departure and return times, your full-day and part-day rates and meals provided. You enter the rates.',
    [txt('dep', 'Departure (YYYY-MM-DD HH:MM)', '2026-03-09 07:30'), txt('ret', 'Return (YYYY-MM-DD HH:MM)', '2026-03-12 19:15'), num('full', 'Full-day rate (per 24 hours)', 60), num('part', 'Part-day rate for a remaining period', 30), num('hrs', 'Remaining period counts when it is at least this many hours', 8),
      num('b', 'Breakfasts provided', 3), num('l', 'Lunches provided', 0), num('d', 'Dinners provided', 2), num('bp', 'Cut per breakfast % of full rate', 20), num('lp', 'Cut per lunch %', 40), num('dp', 'Cut per dinner %', 40)], (o) => {
      const pt = (x, w) => { const mt = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(String(x).trim()); if (!mt) throw new Error(w + ' must look like 2026-03-09 07:30'); return Date.UTC(+mt[1], +mt[2] - 1, +mt[3], +mt[4], +mt[5]); };
      const a = pt(o.dep, 'Departure'), z = pt(o.ret, 'Return'); if (z <= a) throw new Error('Return must be after departure'); nn(o, 'full', 'part', 'hrs', 'b', 'l', 'd', 'bp', 'lp', 'dp');
      const h = (z - a) / 36e5, days = Math.floor(h / 24), rem = h - days * 24, remPay = rem >= o.hrs && rem > 0 ? o.part : 0, gross = days * o.full + remPay;
      const cut = Math.round(o.b) * o.full * o.bp / 100 + Math.round(o.l) * o.full * o.lp / 100 + Math.round(o.d) * o.full * o.dp / 100;
      return `Trip length: ${r(h, 2)} hours = ${days} full 24-hour period${days === 1 ? '' : 's'} + ${r(rem, 2)} hours\nFull periods: ${days} x ${m(o.full)} = ${m(days * o.full)}\nRemaining ${r(rem, 2)} h: ${remPay ? m(remPay) : 'no allowance (under ' + o.hrs + ' h)'}\nBefore meal cuts: ${m(gross)}\nMeals provided cut: ${m(Math.min(cut, gross))}\n\nAllowance: ${m(Math.max(0, gross - cut))}\n\nA simple model: 24-hour blocks plus one part-day band. Real systems differ by country, destination and trip type (for example a rate for the day of arrival and departure, or a minimum of 8 hours). Enter your tax authority's rates; none are bundled.`;
    }),
  calc('depreciation-calculator', FIN, 'Depreciation Calculator (Straight-Line, Declining Balance, Sum-of-Years)',
    'Depreciation schedule for an asset from cost, residual value and life in years, using straight-line, declining-balance or sum-of-the-years-digits.',
    [num('cost', 'Asset cost', 12000), num('res', 'Residual (salvage) value', 1000), num('life', 'Useful life in years', 5), sel('method', 'Method', ['straight-line', 'declining balance', 'sum-of-years-digits']), num('factor', 'Declining balance factor (2 = double)', 2)], (o) => {
      pos(o, 'cost', 'life'); nn(o, 'res', 'factor'); if (o.res >= o.cost) throw new Error('Residual must be below the cost'); const n = Math.round(o.life); if (n < 1 || n > 100) throw new Error('Life must be 1 to 100 years'); const dep = o.cost - o.res;
      let bv = o.cost; const rows = [];
      for (let y = 1; y <= n; y++) {
        let d;
        if (o.method === 'straight-line') d = dep / n; else if (o.method === 'sum-of-years-digits') d = dep * (n - y + 1) / (n * (n + 1) / 2); else { d = Math.min(bv * o.factor / n, bv - o.res); if (y === n) d = bv - o.res; }
        bv -= d; rows.push([y, m(d), m(o.cost - bv), m(bv)]);
      }
      return `Depreciable amount: ${m(dep)}\n` + tbl(['Year', 'Depreciation', 'Accumulated', 'Book value'], rows) + (o.method === 'declining balance' ? '\n\nDeclining balance: book value x factor / life each year, never below residual; the last year takes what is left to reach the residual.' : '') + '\n\nAccounting and tax depreciation rules differ by country (allowed methods, rates per asset class, part-year conventions). This is the textbook schedule with full-year periods.';
    }),
  text('expense-report-builder', DOCS, 'Expense Report Builder (VAT Split and CSV Export)',
    'Itemize business expenses with date, category, amount and VAT rate, get totals by category and VAT, and copy the result as CSV.',
    'Expenses as CSV (date, category, description, amount, VAT %)', '2026-03-02, Travel, Train Brussels-Paris, 112.00, 6\n2026-03-02, Meals, Client lunch, 64.50, 12\n2026-03-04, Software, Design tool, 24.20, 21\n2026-03-05, Office, Printer paper, 18.15, 21',
    [chk('inc', 'Amounts include VAT', true), txt('cur', 'Currency', 'EUR')], (s, o) => {
      const rows = parseCsv(s).map((p, k) => { if (p.length < 5) throw new Error(`Row ${k + 1}: use date, category, description, amount, VAT %`); const rate = money(p[4], 'VAT %'), a = money(p[3], 'amount'), net = o.inc ? a / (1 + rate / 100) : a; return { d: p[0], c: p[1] || 'Other', t: p[2], rate, net, vat: net * rate / 100, gross: net * (1 + rate / 100) }; });
      if (!rows.length) throw new Error('Add at least one expense'); const cat = {}, vr = {}; rows.forEach((x) => { cat[x.c] = (cat[x.c] || [0, 0, 0]); cat[x.c][0] += x.net; cat[x.c][1] += x.vat; cat[x.c][2] += x.gross; vr[x.rate] = (vr[x.rate] || [0, 0]); vr[x.rate][0] += x.net; vr[x.rate][1] += x.vat; });
      const tn = rows.reduce((a, x) => a + x.net, 0), tv = rows.reduce((a, x) => a + x.vat, 0);
      const csv = ['date,category,description,net,vat_rate,vat,gross', ...rows.map((x) => [x.d, x.c, x.t, x.net.toFixed(2), x.rate, x.vat.toFixed(2), x.gross.toFixed(2)].map(csvCell).join(','))].join('\n');
      return tbl(['Date', 'Category', 'Description', 'Net', 'VAT %', 'VAT', 'Gross'], rows.map((x) => [x.d, x.c, x.t, m(x.net), x.rate, m(x.vat), m(x.gross)])) + '\n\nBy category\n' + tbl(['Category', 'Net', 'VAT', 'Gross'], Object.entries(cat).map(([c, v]) => [c, m(v[0]), m(v[1]), m(v[2])])) + '\n\nBy VAT rate\n' + tbl(['Rate', 'Net', 'VAT'], Object.keys(vr).map(Number).sort((a, b) => a - b).map((k) => [k + '%', m(vr[k][0]), m(vr[k][1])])) + `\n\nTotal net: ${m(tn)} ${o.cur}\nTotal VAT: ${m(tv)} ${o.cur}\nTotal gross: ${m(tn + tv)} ${o.cur}\n\nCSV\n${csv}\n\nWhether VAT on an expense can be reclaimed (meals, cars, entertainment) depends on national rules.`;
    }),
  calc('intrastat-threshold-checker', REF, 'Intrastat Threshold Checker (Compare Your Trade with the Limits)',
    'Compare your yearly intra-EU arrivals and dispatches with the Intrastat thresholds you enter for your country, and see the headroom or the excess.',
    [txt('country', 'Country (label only)', 'Example'), num('arr', 'Intra-EU arrivals (purchases) this year', 380000), num('dis', 'Intra-EU dispatches (sales) this year', 520000), num('tarr', 'Arrivals threshold from your statistics office', 500000), num('tdis', 'Dispatches threshold', 500000), num('prev', 'Last year\'s highest of the two (0 = skip)', 0)], (o) => {
      nn(o, 'arr', 'dis', 'tarr', 'tdis', 'prev'); const f = (name, v, t) => `${name}: ${m(v)} of ${m(t)} (${t ? r(v / t * 100, 1) : 0}%) - ` + (v > t ? `OVER by ${m(v - t)}: reporting is likely required` : `headroom ${m(t - v)}`);
      return `${o.country}\n${f('Arrivals', o.arr, o.tarr)}\n${f('Dispatches', o.dis, o.tdis)}\n\n` + (o.arr > o.tarr || o.dis > o.tdis ? 'Review: at least one flow is over its threshold. The month from which reporting starts and how long it lasts differ by country; check the trigger and deadlines with your statistics office (not verified here).' : 'Both flows are under their thresholds. Keep watching: the check runs on the running total.') + '\n\nThresholds are set per country and per flow (arrivals and dispatches separately), are updated regularly, and many countries add a separate threshold for the detailed data. None are bundled here: take them from your national statistics office. Intrastat is about goods only, not services, and is separate from the EC Sales List for VAT.';
    }),
];

const T = [...part1, ...part2, ...taxes];
export default T;

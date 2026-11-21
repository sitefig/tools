// Tools from free-browser-tools.md, batch 15 (rows 990-1053: e-commerce and business/startup calculators).
// See TOOLS.md for the contract. All pure client-side; no tax rates or fee schedules are hard-coded as fact:
// fee tools take YOUR rates (defaults are labelled examples). Skipped: live currency rates, UK Companies House and
// GLEIF registry lookups, LLM-written text (need network, accounts or API keys).

const FIN = 'Calculators – Finance', EVR = 'Calculators – Everyday', PLAN = 'Product Planning', GEN = 'Generators';

// ---------- helpers ----------
const num = (id, label, def) => ({ id, label, type: 'number', def });
const sel = (id, label, choices, def) => ({ id, label, type: 'select', choices, def: def ?? choices[0] });
const txt = (id, label, def) => ({ id, label, type: 'text', def });
const dat = (id, label, def) => ({ id, label, type: 'date', def });
const calc = (id, cat, title, desc, opts, fn) => ({ id, cat, title, desc, inputs: 0, sample: '', opts, run: (_i, o) => fn(o) });
const m = (x) => Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r = (x, d = 2) => Number(x).toLocaleString('en-US', { maximumFractionDigits: d });
const pc = (x, d = 2) => r(x, d) + '%';
const need = (o, ...ks) => { for (const k of ks) if (!Number.isFinite(o[k])) throw new Error('Enter a valid number for ' + k); };
const pos = (o, ...ks) => { need(o, ...ks); for (const k of ks) if (o[k] <= 0) throw new Error(k + ' must be greater than 0'); };
const nonneg = (o, ...ks) => { need(o, ...ks); for (const k of ks) if (o[k] < 0) throw new Error(k + ' cannot be negative'); };
const tbl = (head, rows) => {
  const all = [head, ...rows].map((x) => x.map(String));
  const w = head.map((_, i) => Math.max(...all.map((x) => x[i].length)));
  return all.map((x) => x.map((c, i) => (i ? c.padStart(w[i]) : c.padEnd(w[i]))).join('  ')).join('\n');
};
const lines = (s) => String(s || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const csv = (l) => l.split(',').map((x) => x.trim());
const toNum = (s, what) => {
  const v = Number(String(s ?? '').replace(/[\s,_$€£]/g, ''));
  if (String(s ?? '').trim() === '' || !Number.isFinite(v)) throw new Error(`"${s}" is not a number (${what})`);
  return v;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round2 = (x) => Math.round(x * 100) / 100;

// Inverse standard normal CDF (Acklam's rational approximation, relative error about 1e-9).
function zScore(p) {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const lo = 0.02425;
  if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - lo) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, s = q * q;
  return (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * q / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}

const T = [];

// =====================================================================================
// E-COMMERCE: pricing and fees
// =====================================================================================
T.push({
  id: 'stacked-discount-calculator', cat: FIN, title: 'Stacked Discount Calculator (Percent and Fixed Amounts in Order)',
  desc: 'Apply several discounts one after another, percent or fixed amount, and see each step, the total saved and the real combined percentage.',
  inputs: 1, labels: ['Discounts in order, one per line (20% = percent, 5 = fixed amount off)'], placeholder: ['20%\n10%\n5'],
  sample: '20%\n10%\n5', opts: [num('price', 'Original price', 100)],
  run: ([text], o) => {
    pos(o, 'price');
    const ds = lines(text);
    if (!ds.length) throw new Error('Add at least one discount, one per line');
    let p = o.price, pctSum = 0, allPct = true;
    const rows = [];
    for (const l of ds) {
      const mt = /^(-?\d+(?:\.\d+)?)\s*(%?)\s*(?:off)?$/i.exec(l.replace(/[$€£]/g, ''));
      if (!mt) throw new Error(`Cannot read "${l}". Use 20% or 5`);
      const v = +mt[1]; if (v < 0) throw new Error('Discounts cannot be negative');
      let cut;
      if (mt[2]) { if (v > 100) throw new Error('A percent discount cannot exceed 100%'); cut = p * v / 100; pctSum += v; } else { cut = v; allPct = false; }
      if (cut > p + 1e-9) throw new Error(`"${l}" takes off more than the remaining price (${m(p)})`);
      p -= cut;
      rows.push([l, '-' + m(cut), m(p)]);
    }
    const saved = o.price - p;
    let out = tbl(['Discount', 'Takes off', 'Price after'], rows);
    out += `\n\nStart price: ${m(o.price)}\nFinal price: ${m(p)}\nTotal saved: ${m(saved)} (${pc(saved / o.price * 100)} of the original)`;
    if (allPct) out += `\nAdding the percentages would suggest ${pc(pctSum)}, but stacked they give ${pc(saved / o.price * 100)}.`;
    return out;
  },
});

T.push(calc('break-even-price-calculator', FIN, 'Break-Even Selling Price Calculator (Product, Shipping, Fees, Ads)',
  'Find the lowest price that covers product cost, packaging, shipping, platform fees and ad spend, with an optional target profit per order.',
  [num('cost', 'Product cost', 8), num('pack', 'Packaging', 0.5), num('ship', 'Shipping you pay', 3), num('ads', 'Ad cost per order', 2), num('feepct', 'Platform + payment fees, % of price', 12), num('feefix', 'Fixed fee per order', 0.3), num('target', 'Target profit per order', 0)],
  (o) => {
    nonneg(o, 'cost', 'pack', 'ship', 'ads', 'feepct', 'feefix', 'target');
    if (o.feepct >= 100) throw new Error('Fee percent must be below 100');
    const fixed = o.cost + o.pack + o.ship + o.ads + o.feefix;
    const price = (fixed + o.target) / (1 - o.feepct / 100), be = fixed / (1 - o.feepct / 100);
    return `Price = (fixed costs + target) / (1 - fee%)\n\nCosts not tied to the price: ${m(fixed)}\nBreak-even price: ${m(be)}\nPrice for target profit (${m(o.target)}): ${m(price)}\nFees at that price: ${m(price * o.feepct / 100 + o.feefix)}\nProfit at that price: ${m(price * (1 - o.feepct / 100) - fixed)}\nMargin at that price: ${pc((price - fixed - price * o.feepct / 100) / price * 100)}`;
  }));

T.push(calc('amazon-fba-profit-calculator', FIN, 'Amazon FBA Profit Calculator (Your Own Referral and Fulfilment Fees)',
  'Net profit, margin and ROI per unit from price, product cost and the referral and fulfilment fees you copy from Amazon. No fee table is built in.',
  [num('price', 'Selling price', 24.99), num('cost', 'Product cost (landed)', 7), num('ref', 'Referral fee, % of price (your category)', 15), num('ful', 'Fulfilment fee per unit', 3.5), num('store', 'Storage and inbound per unit', 0.4), num('ads', 'Advertising per unit', 2), num('ret', 'Returns loss per unit', 0.5)],
  (o) => {
    pos(o, 'price'); nonneg(o, 'cost', 'ref', 'ful', 'store', 'ads', 'ret');
    const ref = o.price * o.ref / 100, costs = o.cost + ref + o.ful + o.store + o.ads + o.ret, net = o.price - costs;
    const be = (o.cost + o.ful + o.store + o.ads + o.ret) / (1 - o.ref / 100);
    return `Fee rates are NOT built in. Copy the referral % and fulfilment fee for your category, size and weight from Amazon's own fee pages, then enter them.\n\nReferral fee: ${m(ref)}\nFulfilment fee: ${m(o.ful)}\nTotal costs per unit: ${m(costs)}\nNet profit per unit: ${m(net)}\nMargin: ${pc(net / o.price * 100)}\nROI on product cost: ${o.cost ? pc(net / o.cost * 100) : 'n/a'}\nBreak-even price: ${m(be)}`;
  }));

T.push(calc('etsy-fee-calculator', FIN, 'Etsy Fee Calculator (Listing, Transaction and Payment Fees With Your Rates)',
  'Net earnings per sale from item price, shipping charged and the listing, transaction and payment rates you enter. Rate defaults are examples to check.',
  [num('price', 'Item price', 30), num('shipc', 'Shipping charged to buyer', 5), num('qty', 'Quantity', 1), num('list', 'Listing fee per item', 0.2), num('tx', 'Transaction fee %, on item + shipping', 6.5), num('pp', 'Payment processing %', 3), num('ppf', 'Payment processing fixed fee', 0.25), num('ads', 'Offsite ads fee %, on item + shipping (0 if none)', 0), num('icost', 'Your item cost', 10), num('scost', 'Your real shipping cost', 4.5)],
  (o) => {
    pos(o, 'price', 'qty'); nonneg(o, 'shipc', 'list', 'tx', 'pp', 'ppf', 'ads', 'icost', 'scost');
    const total = o.price * o.qty + o.shipc, listing = o.list * o.qty, tx = total * o.tx / 100, pay = total * o.pp / 100 + o.ppf, ads = total * o.ads / 100;
    const fees = listing + tx + pay + ads, net = total - fees - o.icost * o.qty - o.scost;
    return `Defaults are examples only. Check Etsy's current fee page for your country and shop, and which charges apply to your sale.\n\nBuyer pays (items + shipping): ${m(total)}\nListing fee: ${m(listing)}\nTransaction fee: ${m(tx)}\nPayment processing: ${m(pay)}\nOffsite ads fee: ${m(ads)}\nTotal fees: ${m(fees)} (${pc(fees / total * 100)} of the sale)\nAfter fees: ${m(total - fees)}\nProfit after item and shipping cost: ${m(net)}`;
  }));

T.push(calc('ebay-fee-calculator', FIN, 'eBay Fee and Profit Calculator (Your Final Value Fee Rate)',
  'Estimate final value fee, per-order fee, promoted listing cost and profit on an eBay sale using the rates you enter. Defaults are examples to check.',
  [num('price', 'Item sale price', 40), num('shipc', 'Shipping charged to buyer', 6), num('tax', 'Sales tax collected (fees may apply to it)', 0), num('fvf', 'Final value fee %', 13.6), num('fix', 'Per-order fee', 0.3), num('promo', 'Promoted listing %, on item + shipping', 0), num('icost', 'Your item cost', 15), num('scost', 'Your real shipping cost', 6)],
  (o) => {
    pos(o, 'price'); nonneg(o, 'shipc', 'tax', 'fvf', 'fix', 'promo', 'icost', 'scost');
    const base = o.price + o.shipc + o.tax, fvf = base * o.fvf / 100, pro = (o.price + o.shipc) * o.promo / 100;
    const fees = fvf + o.fix + pro, net = o.price + o.shipc - fees - o.icost - o.scost;
    return `Defaults are examples only. Rates differ by category, seller type and country; check eBay's fee page. Whether the fee applies to shipping and tax depends on the market, so adjust the inputs to match.\n\nFee base (price + shipping + tax): ${m(base)}\nFinal value fee: ${m(fvf)}\nPer-order fee: ${m(o.fix)}\nPromoted listing: ${m(pro)}\nTotal fees: ${m(fees)}\nProfit after item and shipping cost: ${m(net)}\nMargin on price + shipping: ${pc(net / (o.price + o.shipc) * 100)}`;
  }));

T.push(calc('shopify-payment-fee-calculator', FIN, 'Shopify Payment Fee Calculator (Compare Plans With Your Card Rates)',
  'Compare card processing fees across three plans for one order value or a month of orders, using the rates you enter. Defaults are examples to check.',
  [num('val', 'Order value', 80), num('orders', 'Orders per month', 100), num('r1', 'Basic plan card rate %', 2.9), num('r2', 'Middle plan card rate %', 2.7), num('r3', 'Top plan card rate %', 2.5), num('fix', 'Fixed fee per order', 0.3), num('plan1', 'Basic plan monthly price', 39), num('plan2', 'Middle plan monthly price', 105), num('plan3', 'Top plan monthly price', 399)],
  (o) => {
    pos(o, 'val', 'orders'); nonneg(o, 'r1', 'r2', 'r3', 'fix', 'plan1', 'plan2', 'plan3');
    const rows = [['Basic', o.r1, o.plan1], ['Middle', o.r2, o.plan2], ['Top', o.r3, o.plan3]].map(([n, rate, pr]) => {
      const per = o.val * rate / 100 + o.fix, mo = per * o.orders;
      return [n, m(per), m(mo), m(pr), m(mo + pr)];
    });
    const best = rows.reduce((a, b) => (+b[4].replace(/,/g, '') < +a[4].replace(/,/g, '') ? b : a));
    return `Rates and plan prices are examples. Copy the current ones from Shopify's pricing page for your country; third-party gateway surcharges are not included.\n\n${tbl(['Plan', 'Fee per order', 'Fees per month', 'Plan price', 'Total per month'], rows)}\n\nCheapest in total at ${r(o.orders)} orders of ${m(o.val)}: ${best[0]} plan (${best[4]} per month).`;
  }));

T.push(calc('payment-fee-gross-up-calculator', FIN, 'Payment Fee Gross-Up Calculator (Charge So You Net a Target Amount)',
  'Work out the fee on a payment, or the amount to charge so that you receive a set net after a percentage plus fixed processing fee.',
  [sel('mode', 'What do you need', ['Fee on a charge', 'Charge needed for a target net'], 'Charge needed for a target net'), num('amt', 'Charge amount, or target net', 100), num('pct', 'Percentage fee', 2.9), num('fix', 'Fixed fee per payment', 0.3)],
  (o) => {
    pos(o, 'amt'); nonneg(o, 'pct', 'fix');
    if (o.pct >= 100) throw new Error('Percentage fee must be below 100');
    if (o.mode === 'Fee on a charge') {
      const fee = o.amt * o.pct / 100 + o.fix;
      return `Fee = amount x % + fixed\n\nCharge: ${m(o.amt)}\nFee: ${m(fee)} (${pc(fee / o.amt * 100)} effective)\nYou receive: ${m(o.amt - fee)}`;
    }
    const ch = (o.amt + o.fix) / (1 - o.pct / 100), fee = ch - o.amt;
    return `Charge = (target net + fixed) / (1 - %)\n\nTarget net: ${m(o.amt)}\nCharge the customer: ${m(ch)}\nFee taken: ${m(fee)}\nCheck: ${m(ch)} - ${m(ch * o.pct / 100 + o.fix)} = ${m(ch - ch * o.pct / 100 - o.fix)}\nSurcharging may be limited or banned where you sell; check the rules before passing fees on.`;
  }));

T.push(calc('dropshipping-profit-calculator', FIN, 'Dropshipping Profit Calculator (Supplier, Shipping, Fees, Ads, Refunds)',
  'Profit per order after supplier cost, shipping, payment fees, ad cost and refunds, plus the maximum ad cost per order and break-even ROAS.',
  [num('price', 'Selling price', 39.99), num('sup', 'Supplier cost', 12), num('ship', 'Supplier shipping', 4), num('pct', 'Payment fee %', 2.9), num('fix', 'Payment fixed fee', 0.3), num('cpa', 'Ad cost per order (CPA)', 10), num('ref', 'Refunds and chargebacks, % of orders', 4), num('oth', 'Other cost per order', 0.5)],
  (o) => {
    pos(o, 'price'); nonneg(o, 'sup', 'ship', 'pct', 'fix', 'cpa', 'ref', 'oth');
    if (o.ref >= 100) throw new Error('Refund percent must be below 100');
    const keep = 1 - o.ref / 100, fee = o.price * o.pct / 100 + o.fix;
    const pre = (o.price - fee) * keep - o.sup - o.ship - o.oth;
    const profit = pre - o.cpa;
    return `Refunds are modelled as orders where the sale is lost (cost of goods kept as a loss) on ${pc(o.ref)} of orders.\n\nPayment fee: ${m(fee)}\nProfit before ads: ${m(pre)}\nProfit after ads: ${m(profit)}\nMargin: ${pc(profit / o.price * 100)}\nMax ad cost per order to break even: ${m(Math.max(pre, 0))}\nBreak-even ROAS: ${pre > 0 ? r(o.price / pre, 2) : 'never (costs exceed price before ads)'}`;
  }));

// =====================================================================================
// E-COMMERCE: store metrics
// =====================================================================================
T.push(calc('average-order-value-calculator', FIN, 'Average Order Value (AOV) Calculator With Period Comparison',
  'Average order value and units per order from revenue and order count, with a change against a previous period.',
  [num('rev', 'Revenue', 52000), num('ord', 'Orders', 800), num('units', 'Units sold (0 to skip)', 1900), num('prev', 'Previous period revenue (0 to skip)', 48000), num('pord', 'Previous period orders (0 to skip)', 790)],
  (o) => {
    pos(o, 'rev', 'ord'); nonneg(o, 'units', 'prev', 'pord');
    const aov = o.rev / o.ord; let out = `AOV = revenue / orders\n\nAOV: ${m(aov)}`;
    if (o.units) out += `\nUnits per order: ${r(o.units / o.ord)}\nAverage price per unit: ${m(o.rev / o.units)}`;
    if (o.prev && o.pord) { const pa = o.prev / o.pord; out += `\nPrevious AOV: ${m(pa)}\nChange: ${(aov >= pa ? '+' : '') + pc((aov - pa) / pa * 100)}`; }
    return out + '\nUse the same revenue definition both times (before or after tax, shipping and refunds).';
  }));

T.push(calc('cart-abandonment-rate-calculator', EVR, 'Cart Abandonment Rate and Recoverable Revenue Calculator',
  'Abandonment rate from carts created and purchases completed, the revenue left in abandoned carts and what a recovery rate you assume could win back.',
  [num('carts', 'Carts created', 5000), num('done', 'Completed purchases', 1500), num('val', 'Average cart value', 65), num('rec', 'Recovery rate you assume, % of abandoned carts', 8)],
  (o) => {
    pos(o, 'carts'); nonneg(o, 'done', 'val', 'rec');
    if (o.done > o.carts) throw new Error('Completed purchases cannot exceed carts created');
    const ab = o.carts - o.done, lost = ab * o.val;
    return `Abandonment rate = (carts - purchases) / carts\n\nAbandoned carts: ${r(ab)}\nAbandonment rate: ${pc(ab / o.carts * 100)}\nConversion from cart: ${pc(o.done / o.carts * 100)}\nRevenue in abandoned carts: ${m(lost)}\nRecovered at ${pc(o.rec)}: ${m(lost * o.rec / 100)} (${r(ab * o.rec / 100, 0)} orders)\nThe recovery rate is your own assumption, not a benchmark.`;
  }));

T.push(calc('free-shipping-threshold-calculator', EVR, 'Free Shipping Threshold Calculator (Margin and Basket Size)',
  'Suggest a free-shipping minimum from average order value, shipping cost, margin and the basket lift you want, and check the shipping cost stays inside the margin.',
  [num('aov', 'Average order value', 48), num('ship', 'Average shipping cost to you', 5.5), num('mar', 'Gross margin %', 40), num('lift', 'Basket lift you aim for, %', 15)],
  (o) => {
    pos(o, 'aov', 'mar'); nonneg(o, 'ship', 'lift');
    if (o.mar > 100) throw new Error('Margin cannot exceed 100');
    const minCover = o.ship / (o.mar / 100), sug = Math.max(o.aov * (1 + o.lift / 100), minCover), mg = sug * o.mar / 100;
    const rounded = Math.ceil(sug / 5) * 5;
    return `Heuristic, not a guarantee: a threshold slightly above current AOV nudges baskets up, and the margin on it must pay for shipping.\n\nMinimum order that pays for shipping from its margin: ${m(minCover)}\nSuggested threshold (AOV + ${pc(o.lift, 0)}, never below the minimum): ${m(sug)}, round to ${m(rounded)}\nMargin at the suggested value: ${m(mg)}; shipping takes ${pc(o.ship / mg * 100, 1)} of it\n${o.ship / mg > 0.5 ? 'Review: shipping takes more than half the margin. Consider a higher threshold or a shipping fee.' : 'Shipping stays under half the margin at this threshold.'}\nTest it: compare AOV and conversion before and after.`;
  }));

T.push(calc('return-rate-cost-calculator', EVR, 'Return Rate and Cost of Returns Calculator',
  'Return rate from units sold and returned, and the profit lost to reversed sales, handling and unsellable stock.',
  [num('sold', 'Units sold', 2000), num('ret', 'Units returned', 220), num('price', 'Price per unit', 45), num('cost', 'Product cost per unit', 18), num('hand', 'Handling and shipping cost per return', 6), num('resell', 'Returns that can be resold, %', 70)],
  (o) => {
    pos(o, 'sold', 'price'); nonneg(o, 'ret', 'cost', 'hand', 'resell');
    if (o.ret > o.sold) throw new Error('Returned units cannot exceed units sold');
    if (o.resell > 100) throw new Error('Resell share cannot exceed 100');
    const lostMargin = o.ret * (o.price - o.cost), hand = o.ret * o.hand, wo = o.ret * (1 - o.resell / 100) * o.cost, tot = lostMargin + hand + wo;
    return `Return rate: ${pc(o.ret / o.sold * 100)}\nRefunded revenue: ${m(o.ret * o.price)}\nMargin lost on reversed sales: ${m(lostMargin)}\nHandling cost: ${m(hand)}\nWritten off (unsellable, at cost): ${m(wo)}\nTotal profit impact: ${m(tot)}\nPer unit sold: ${m(tot / o.sold)}\nProfit before returns: ${m(o.sold * (o.price - o.cost))}; after: ${m(o.sold * (o.price - o.cost) - tot)}`;
  }));

// =====================================================================================
// E-COMMERCE: shipping and stock
// =====================================================================================
T.push(calc('dimensional-weight-calculator', EVR, 'Dimensional (Volumetric) Weight Calculator With Carrier Divisors',
  'Volumetric weight from box size and a carrier divisor, compared with actual weight to give the billable weight. Confirm the divisor with your carrier.',
  [num('l', 'Length', 40), num('w', 'Width', 30), num('h', 'Height', 20), sel('du', 'Dimensions in', ['cm', 'in'], 'cm'), num('wt', 'Actual weight', 3), sel('wu', 'Weight in', ['kg', 'lb'], 'kg'),
    sel('div', 'Divisor (cm3 per kg)', ['5000 (about 139 in3/lb)', '6000 (about 166 in3/lb)', '7000 (about 194 in3/lb)', '4000 (about 111 in3/lb)', 'Custom (below)'], '5000 (about 139 in3/lb)'), num('cdiv', 'Custom divisor, cm3 per kg', 5000)],
  (o) => {
    pos(o, 'l', 'w', 'h', 'wt', 'cdiv');
    const k = o.du === 'in' ? 2.54 : 1;
    const cm3 = o.l * o.w * o.h * k ** 3;
    const div = /^Custom/.test(o.div) ? o.cdiv : parseInt(o.div, 10);
    const volKg = cm3 / div, actKg = o.wu === 'lb' ? o.wt * 0.45359237 : o.wt;
    const bill = Math.max(volKg, actKg), show = (kg) => (o.wu === 'lb' ? r(kg / 0.45359237, 2) + ' lb' : r(kg, 2) + ' kg');
    return `Volumetric weight = L x W x H / divisor. Divisors seen in public sources: about 5000 (UPS and FedEx international, DHL Express), 6000, 7000 (USPS domestic over 1 cu ft), 4000 (some regions). Carriers change them and round up, so confirm with yours.\n\nVolume: ${r(cm3)} cm3 (${r(cm3 / 1000, 2)} L)\nDivisor: ${r(div)} cm3/kg (about ${r(div / 16.387064 * 0.45359237, 0)} in3/lb)\nVolumetric weight: ${show(volKg)}\nActual weight: ${show(actKg)}\nBillable weight (larger of the two): ${show(bill)} (${volKg > actKg ? 'volume' : 'actual weight'} decides)`;
  }));

T.push({
  id: 'shipping-box-fit-calculator', cat: EVR, title: 'Shipping Box Volume and Item Fit Calculator',
  desc: 'Box volume in litres and cubic units, and how many identical boxes-shaped items fit in a simple grid in the best of the six orientations.',
  inputs: 0, sample: '', opts: [num('bl', 'Box inner length', 40), num('bw', 'Box inner width', 30), num('bh', 'Box inner height', 20), num('il', 'Item length', 12), num('iw', 'Item width', 8), num('ih', 'Item height', 5), sel('u', 'Units', ['cm', 'in'], 'cm')],
  run: (_i, o) => {
    pos(o, 'bl', 'bw', 'bh', 'il', 'iw', 'ih');
    const box = [o.bl, o.bw, o.bh], it = [o.il, o.iw, o.ih], perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    let best = 0, bp = null;
    for (const p of perms) { const n = Math.floor(box[0] / it[p[0]]) * Math.floor(box[1] / it[p[1]]) * Math.floor(box[2] / it[p[2]]); if (n > best) { best = n; bp = p; } }
    const vb = box[0] * box[1] * box[2], vi = it[0] * it[1] * it[2], ub = Math.floor(vb / vi + 1e-9);
    const L = o.u === 'cm' ? vb / 1000 : vb * 16.387064 / 1000;
    const arr = bp ? bp.map((k, i) => Math.floor(box[i] / it[k])).join(' x ') : '';
    return `Box volume: ${r(vb)} ${o.u}3 (${r(L, 2)} litres)\nItem volume: ${r(vi, 2)} ${o.u}3\nUpper limit by volume alone: ${ub} items\nFit in a simple grid, best orientation: ${best} items${bp ? ` (${arr} along length x width x height, item rotated as ${bp.map((k) => ['L', 'W', 'H'][k]).join('')})` : ''}\nSpace used by that grid: ${pc(best * vi / vb * 100, 1)}\nThe grid keeps every item in one orientation. Mixed orientations can fit more, and padding takes space, so test with a real box.`;
  },
});

T.push(calc('reorder-point-calculator', EVR, 'Inventory Reorder Point Calculator',
  'When to reorder: average daily sales times supplier lead time, plus safety stock, with the stock level that triggers an order.',
  [num('d', 'Average daily sales (units)', 12), num('lt', 'Supplier lead time (days)', 21), num('ss', 'Safety stock (units)', 60), num('onhand', 'Stock on hand now (0 to skip)', 400)],
  (o) => {
    pos(o, 'd', 'lt'); nonneg(o, 'ss', 'onhand');
    const rop = o.d * o.lt + o.ss; let out = `Reorder point = daily sales x lead time + safety stock\n\nDemand during lead time: ${r(o.d * o.lt)}\nSafety stock: ${r(o.ss)}\nReorder point: ${r(Math.ceil(rop))} units`;
    if (o.onhand) out += `\nStock on hand: ${r(o.onhand)}; ${o.onhand <= rop ? 'at or below the reorder point: order now' : `reorder in about ${r((o.onhand - rop) / o.d, 1)} days`}\nDays of cover: ${r(o.onhand / o.d, 1)}`;
    return out;
  }));

T.push(calc('safety-stock-calculator', EVR, 'Safety Stock Calculator (Service Level or Max-Minus-Average)',
  'Buffer stock from demand variability and a service level using the normal distribution, or from worst case against average sales and lead time.',
  [sel('method', 'Method', ['Service level (normal demand)', 'Max minus average'], 'Service level (normal demand)'), num('avg', 'Average daily demand', 40), num('max', 'Maximum daily demand (max-minus-average)', 70), num('lt', 'Average lead time (days)', 14), num('maxlt', 'Maximum lead time (max-minus-average)', 21), num('sd', 'Standard deviation of daily demand', 9), num('sdlt', 'Standard deviation of lead time, days (0 if fixed)', 0), num('sl', 'Service level %', 95)],
  (o) => {
    pos(o, 'avg', 'lt'); nonneg(o, 'max', 'maxlt', 'sd', 'sdlt');
    if (o.method === 'Max minus average') {
      if (o.max < o.avg || o.maxlt < o.lt) throw new Error('Maximum values cannot be below the averages');
      const ss = o.max * o.maxlt - o.avg * o.lt;
      return `Safety stock = max daily x max lead time - average daily x average lead time\n\nSafety stock: ${r(Math.ceil(ss))} units\nReorder point with it: ${r(Math.ceil(o.avg * o.lt + ss))} units\nThis protects against the worst case seen, so it tends to overstock.`;
    }
    if (!(o.sl > 50 && o.sl < 100)) throw new Error('Service level must be above 50 and below 100');
    const z = zScore(o.sl / 100), ss = z * Math.sqrt(o.lt * o.sd ** 2 + o.avg ** 2 * o.sdlt ** 2);
    return `Safety stock = z x sqrt(LT x sd_demand^2 + demand^2 x sd_LT^2)\n\nService level ${pc(o.sl)} -> z = ${r(z, 4)}\nSafety stock: ${r(Math.ceil(ss))} units\nReorder point: ${r(Math.ceil(o.avg * o.lt + ss))} units\nAssumes demand per day is roughly normal and independent day to day; spiky or seasonal demand needs a larger buffer.`;
  }));

T.push(calc('economic-order-quantity-calculator', EVR, 'Economic Order Quantity (EOQ) Calculator',
  'The order size that minimises ordering plus holding cost, with orders per year, days between orders and the cost at that size.',
  [num('dem', 'Annual demand (units)', 12000), num('ord', 'Cost per order', 60), num('hold', 'Holding cost per unit per year', 2.4), num('unit', 'Unit cost (for total cost, 0 to skip)', 15)],
  (o) => {
    pos(o, 'dem', 'ord', 'hold'); nonneg(o, 'unit');
    const q = Math.sqrt(2 * o.dem * o.ord / o.hold), n = o.dem / q, tc = o.dem * o.ord / q + q * o.hold / 2;
    return `EOQ = sqrt(2 x demand x order cost / holding cost)\n\nEOQ: ${r(q, 1)} units (order ${r(Math.round(q))})\nOrders per year: ${r(n, 2)}\nDays between orders: ${r(365 / n, 1)}\nOrdering cost per year: ${m(n * o.ord)}\nHolding cost per year: ${m(q / 2 * o.hold)}\nOrdering + holding: ${m(tc)}${o.unit ? `\nWith purchase cost: ${m(tc + o.dem * o.unit)}` : ''}\nAssumes steady demand, fixed costs and no quantity discounts.`;
  }));

T.push(calc('inventory-turnover-calculator', EVR, 'Inventory Turnover and Days of Inventory Calculator',
  'Turnover ratio and days sales of inventory from cost of goods sold and opening and closing inventory value.',
  [num('cogs', 'Cost of goods sold for the period', 480000), num('beg', 'Inventory value at start', 110000), num('end', 'Inventory value at end', 130000), num('days', 'Days in the period', 365)],
  (o) => {
    pos(o, 'cogs', 'days'); nonneg(o, 'beg', 'end');
    const avg = (o.beg + o.end) / 2; if (!avg) throw new Error('Average inventory is zero');
    const t = o.cogs / avg;
    return `Turnover = COGS / average inventory\n\nAverage inventory: ${m(avg)}\nTurnover: ${r(t, 2)} times per period\nDays of inventory: ${r(o.days / t, 1)}\nUse the same cost basis for COGS and inventory. A good value depends heavily on the product type.`;
  }));

// =====================================================================================
// E-COMMERCE: catalogue helpers
// =====================================================================================
T.push({
  id: 'sku-code-generator', cat: GEN, title: 'SKU Code Generator From Product Attributes',
  desc: 'Build consistent stock keeping unit codes from attributes such as category, colour and size, with fixed segment length and an optional running number.',
  inputs: 1, labels: ['Attributes per product, comma separated, one product per line'], placeholder: ['Shirt, Blue, M'],
  sample: 'Shirt, Blue, M\nShirt, Blue, L\nShirt, Red, M\nMug, White, 350ml', opts: [txt('prefix', 'Prefix (optional)', ''), txt('sep', 'Separator', '-'), num('len', 'Letters kept per word segment', 3), num('seq', 'Add running number with this many digits (0 = none)', 0), { id: 'up', label: 'Uppercase', type: 'checkbox', def: true }],
  run: ([text], o) => {
    const ls = lines(text); if (!ls.length) throw new Error('Add one product per line');
    const len = Math.max(1, Math.min(10, Math.floor(o.len) || 3)), seqd = Math.max(0, Math.min(8, Math.floor(o.seq) || 0));
    const seen = new Map(), out = [];
    for (const l of ls) {
      const segs = csv(l).filter(Boolean).map((s) => {
        let t = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '');
        if (!t) throw new Error(`Segment "${s}" has no letters or digits`);
        if (!/^\d+[A-Za-z]*$/.test(t)) t = t.slice(0, len);
        return o.up ? t.toUpperCase() : t;
      });
      if (o.prefix) segs.unshift(o.up ? o.prefix.toUpperCase() : o.prefix);
      let base = segs.join(o.sep ?? '-');
      if (seqd) { const n = (seen.get(base) || 0) + 1; seen.set(base, n); base += (o.sep ?? '-') + String(n).padStart(seqd, '0'); } else seen.set(base, (seen.get(base) || 0) + 1);
      out.push(base);
    }
    const dups = [...seen.entries()].filter(([, n]) => n > 1 && !seqd).map(([k]) => k);
    return out.join('\n') + (dups.length ? `\n\nDuplicate codes (review, use a longer segment or the running number): ${dups.join(', ')}` : '');
  },
});

T.push({
  id: 'gtin-check-digit-calculator', cat: GEN, title: 'GTIN Check Digit Calculator (EAN-13, UPC-A, EAN-8, GTIN-14)',
  desc: 'Compute the GS1 check digit for a barcode number or validate a full one. Handles 7, 8, 11, 12, 13 and 14 digit numbers, one per line.',
  inputs: 1, labels: ['Numbers, one per line'], placeholder: ['400638133393'],
  sample: '400638133393\n4006381333931\n036000291452\n96385074\n9638507', opts: [],
  run: ([text]) => {
    const chk = (d) => { let s = 0; for (let i = 0; i < d.length; i++) s += +d[d.length - 1 - i] * (i % 2 === 0 ? 3 : 1); return (10 - (s % 10)) % 10; };
    const ls = lines(text); if (!ls.length) throw new Error('Enter at least one number');
    return ls.map((l) => {
      const d = l.replace(/[\s-]/g, '');
      if (!/^\d+$/.test(d)) return `${l}: not digits only`;
      const full = (n) => { const c = chk(d.slice(0, n - 1)); return d[n - 1] === String(c) ? `valid (check digit ${c})` : `INVALID (check digit should be ${c}, found ${d[n - 1]})`; };
      switch (d.length) {
        case 7: return `${d}: EAN-8 payload, check digit ${chk(d)} -> ${d}${chk(d)}`;
        case 8: return `${d}: EAN-8 ${full(8)}`;
        case 11: return `${d}: UPC-A payload, check digit ${chk(d)} -> ${d}${chk(d)}`;
        case 12: return `${d}: as EAN-13 payload, check digit ${chk(d)} -> ${d}${chk(d)}; as full UPC-A ${full(12)}`;
        case 13: return `${d}: EAN-13 / GTIN-13 ${full(13)}`;
        case 14: return `${d}: GTIN-14 ${full(14)}`;
        default: return `${d}: ${d.length} digits, expected 7, 8, 11, 12, 13 or 14`;
      }
    }).join('\n');
  },
});

T.push({
  id: 'product-title-formatter', cat: GEN, title: 'Product Title Formatter From Attribute Fields',
  desc: 'Join brand, product type, model, colour, size and keywords into clean product titles in three orders, with a length count and review flags.',
  inputs: 0, sample: '', opts: [txt('brand', 'Brand', 'Acme'), txt('type', 'Product type', 'insulated water bottle'), txt('model', 'Model or line', 'Trail'), txt('color', 'Colour', 'forest green'), txt('size', 'Size or capacity', '750 ml'), txt('mat', 'Material', 'stainless steel'), txt('extra', 'Other keyword', 'leakproof'), num('max', 'Length limit to check against', 80), { id: 'tc', label: 'Title Case', type: 'checkbox', def: true }],
  run: (_i, o) => {
    const f = (s) => String(s || '').trim().replace(/\s+/g, ' ');
    const parts = { brand: f(o.brand), type: f(o.type), model: f(o.model), mat: f(o.mat), extra: f(o.extra), color: f(o.color), size: f(o.size) };
    if (!parts.type) throw new Error('Enter at least the product type');
    const tc = (s) => (o.tc ? s.split(' ').map((w) => (/\d/.test(w) || !w ? w : w[0].toUpperCase() + w.slice(1))).join(' ') : s);
    for (const k of Object.keys(parts)) if (k !== 'size') parts[k] = tc(parts[k]);
    const mk = (order, sep) => order.map((k) => parts[k]).filter(Boolean).join(sep);
    const variants = [
      ['Brand first', mk(['brand', 'model', 'type', 'mat', 'extra'], ' ') + (parts.color || parts.size ? ', ' + [parts.color, parts.size].filter(Boolean).join(', ') : '')],
      ['Product first', mk(['type', 'brand', 'model', 'mat', 'extra'], ' ') + (parts.color || parts.size ? ' - ' + [parts.color, parts.size].filter(Boolean).join(', ') : '')],
      ['Short', mk(['brand', 'type', 'size'], ' ')],
    ];
    const max = Math.floor(o.max) || 80;
    return variants.map(([n, t]) => {
      const flags = [];
      if (t.length > max) flags.push(`over ${max} characters by ${t.length - max}`);
      const w = t.toLowerCase().match(/[a-z0-9]+/g) || [], dup = [...new Set(w.filter((x, i) => x.length > 3 && w.indexOf(x) !== i))];
      if (dup.length) flags.push('repeated words: ' + dup.join(', '));
      if (/[!$?*]{1}|free shipping|best seller|\bsale\b/i.test(t)) flags.push('promotional wording or symbols; many marketplaces reject these');
      return `${n} (${t.length} characters)\n${t}${flags.length ? '\nReview: ' + flags.join('; ') : ''}`;
    }).join('\n\n') + '\n\nMarketplace title rules differ and change. This tool checks only the limit you set, not any marketplace policy.';
  },
});

// ---------- size converters ----------
T.push(calc('shoe-size-converter', EVR, 'Shoe Size Converter From Foot Length (EU, UK, US Men and Women)',
  'Convert between foot length in mm, EU Paris points, UK and US adult shoe sizes with the standard formulas. Adult sizes only.',
  [sel('from', 'You know', ['Foot length (mm)', 'EU size', 'UK size', 'US men size', 'US women size'], 'Foot length (mm)'), num('v', 'Value', 270)],
  (o) => {
    pos(o, 'v');
    // ISO/TS 19407 as quoted on Wikipedia "Shoe size": EU = 0.15 L + 2, UK = 3 L / 25.4 - 23; US men = UK + 1; US women = US men + 1.5 (common scale)
    let L;
    if (o.from === 'Foot length (mm)') L = o.v; else if (o.from === 'EU size') L = (o.v - 2) / 0.15;
    else { const uk = o.from === 'UK size' ? o.v : o.from === 'US men size' ? o.v - 1 : o.v - 2.5; L = (uk + 23) * 25.4 / 3; }
    if (L < 150 || L > 400) throw new Error('That is outside the adult range this converter covers');
    const eu = 0.15 * L + 2, uk = 3 * L / 25.4 - 23, half = (x) => r(Math.round(x * 2) / 2, 1);
    return `Formulas from ISO/TS 19407 as quoted on Wikipedia (Shoe size), plus the common US offsets (men = UK + 1, women = men + 1.5). Sizes are approximate: brands and lasts differ by up to a size, so check the brand chart. Adult sizes only.\n\nFoot length: ${r(L, 1)} mm (${r(L / 25.4, 2)} in)\nEU: ${r(eu, 2)} (nearest half: ${half(eu)})\nUK: ${r(uk, 2)} (nearest half: ${half(uk)})\nUS men: ${r(uk + 1, 2)} (nearest half: ${half(uk + 1)})\nUS women: ${r(uk + 2.5, 2)} (nearest half: ${half(uk + 2.5)})\nIn practice add room for the toes; pick the size from the longer foot.`;
  }));

const WOMEN = [[0, 4, 30, 32, 36], [2, 6, 32, 34, 38], [4, 8, 34, 36, 40], [6, 10, 36, 38, 42], [8, 12, 38, 40, 44], [10, 14, 40, 42, 46], [12, 16, 42, 44, 48], [14, 18, 44, 46, 50], [16, 20, 46, 48, 52], [18, 22, 48, 50, 54], [20, 24, 50, 52, 56], [22, 26, 52, 54, 58], [24, 28, 54, 56, 60]];
const MEN = [['XS', '36', 84], ['S', '37/38', 92], ['M', '39/40', 100], ['L', '41/42', 108], ['XL', '43/44', 116], ['XXL', '45/46', 124]];
T.push(calc('clothing-size-converter', EVR, 'Clothing Size Converter (Women US, UK, DE, FR, IT and Men Letters to EU)',
  'Convert women\'s dress and top sizes between US, UK, German, French and Italian numbers, and men\'s shirt letters to EU numbers and chest size.',
  [sel('who', 'Garment table', ['Women dresses and tops', 'Men shirts and tops'], 'Women dresses and tops'), sel('sys', 'Your size is in (women)', ['US', 'UK', 'DE', 'FR', 'IT'], 'US'), txt('size', 'Size (women: number; men: XS-XXL, EU number or chest cm)', '8')],
  (o) => {
    const v = String(o.size).trim().toUpperCase(); if (!v) throw new Error('Enter a size');
    const note = '\nTables from Wikipedia (Clothing sizes). They are approximate: brands differ and vanity sizing is common, so check the brand chart.';
    if (o.who.startsWith('Women')) {
      const idx = ['US', 'UK', 'DE', 'FR', 'IT'].indexOf(o.sys), row = WOMEN.find((x) => String(x[idx]) === v);
      if (!row) throw new Error(`No ${o.sys} size "${o.size}" in the table (US 0-24, UK 4-28, DE 30-54, FR 32-56, IT 36-60)`);
      return `Women, dresses and tops\n\nUS: ${row[0]}\nUK: ${row[1]}\nDE: ${row[2]}\nFR: ${row[3]}\nIT: ${row[4]}` + note;
    }
    const row = MEN.find((x) => x[0] === v || x[1].split('/').includes(v) || String(x[2]) === v);
    if (!row) throw new Error('For men enter XS, S, M, L, XL, XXL, an EU number (36-46) or chest in cm (84-124)');
    return `Men, shirts and tops\n\nLetter (UK/US): ${row[0]}\nEU: ${row[1]}\nChest: ${row[2]} cm` + note;
  }));

T.push(calc('ring-size-converter', EVR, 'Ring Size Converter (US, UK Letters, ISO, Swiss, Diameter, Circumference)',
  'Convert a ring size between US, UK letters, ISO and Swiss numbers, and inside diameter or circumference in millimetres.',
  [sel('from', 'You know', ['US size', 'UK letter', 'ISO / EU size (circumference mm)', 'Swiss size', 'Inside diameter (mm)', 'Inside circumference (mm)'], 'US size'), txt('v', 'Value', '7')],
  (o) => {
    const raw = String(o.v).trim(); if (!raw) throw new Error('Enter a value');
    // Wikipedia "Ring size": diameter = 0.8128 * US + 11.63 mm; circumference = pi * d (about 2.55 per size); Swiss = circumference - 40; UK letter: C = 40 mm, 1.25 mm per step.
    let c;
    if (o.from === 'UK letter') {
      const mt = /^([A-Za-z])(\s*\+?\s*(1\/2|½))?$/.exec(raw); if (!mt) throw new Error('UK size is a letter A-Z, optionally with 1/2, for example N or N 1/2');
      c = 40 + 1.25 * (mt[1].toUpperCase().charCodeAt(0) - 67 + (mt[2] ? 0.5 : 0));
    } else {
      const x = Number(raw); if (!Number.isFinite(x)) throw new Error('Enter a number');
      if (o.from === 'US size') c = Math.PI * (0.8128 * x + 11.63);
      else if (o.from === 'Swiss size') c = x + 40;
      else if (o.from === 'Inside diameter (mm)') c = Math.PI * x; else c = x;
    }
    const d = c / Math.PI, us = (d - 11.63) / 0.8128, uk = (c - 40) / 1.25 + 3;
    if (c < 30 || c > 90) throw new Error('That is outside the ring range this converter covers');
    const letter = (k) => { const i = Math.round(k * 2) / 2, base = String.fromCharCode(64 + Math.floor(i)); return i < 0 || i > 25.5 ? 'outside A-Z' : base + (i % 1 ? ' 1/2' : ''); };
    return `Formulas from Wikipedia (Ring size). Japanese sizes are not linear and are not included. The UK letter scale here uses C = 40 mm with 1.25 mm per step; printed UK charts can differ by a few tenths of a millimetre.\n\nInside diameter: ${r(d, 2)} mm\nInside circumference: ${r(c, 2)} mm\nUS / Canada: ${r(us, 2)} (nearest quarter: ${r(Math.round(us * 4) / 4, 2)})\nUK / Australia: ${letter(uk)}\nISO (circumference mm, nearest): ${r(Math.round(c), 0)}\nSwiss: ${r(c - 40, 1)}\nMeasure the inside of a ring that fits, not the finger, and size up for wide bands.`;
  }));

T.push({
  id: 'charm-pricing-helper', cat: EVR, title: 'Psychological Pricing Helper (Charm Price Options Around a Target)',
  desc: 'List price points near a target such as 9.99, 9.95 or a round 10, with the change from your target, so you can pick one on purpose.',
  inputs: 0, sample: '', opts: [num('p', 'Target price', 47.3), num('dec', 'Currency decimals (0 or 2)', 2)],
  run: (_i, o) => {
    pos(o, 'p'); const dec = o.dec === 0 ? 0 : 2;
    const opts = new Map();
    const add = (v, label) => { v = dec ? round2(v) : Math.round(v); if (v > 0 && !opts.has(v)) opts.set(v, label); };
    const fl = Math.floor(o.p), ce = Math.ceil(o.p);
    if (dec) { add(fl + 0.99, 'ends in .99 (common retail style)'); add(ce - 0.01, 'just below the next whole number'); add(fl + 0.95, 'ends in .95 (softer)'); add(fl + 0.49, 'ends in .49'); }
    add(ce - 1 + (dec ? 0 : 0), 'whole number, rounded down'); add(ce, 'whole number, rounded up');
    const five = Math.round(o.p / 5) * 5; if (five) add(five, 'multiple of 5 (clean, premium feel)');
    if (o.p >= 20) { const t = Math.round(o.p / 10) * 10; add(t - (dec ? 0.01 : 1), 'one cent or unit under a multiple of 10'); add(t, 'multiple of 10'); }
    const rows = [...opts.entries()].sort((a, b) => a[0] - b[0]).map(([v, l]) => [m(v), (v >= o.p ? '+' : '') + pc((v - o.p) / o.p * 100, 1), l]);
    return `${tbl(['Price', 'vs target', 'Style'], rows)}\n\nThis only lists candidates. Studies on charm pricing are mixed and depend on the product and audience; run a price test before committing. Check what your margin does at each price.`;
  },
});

T.push({
  id: 'bundle-pricing-calculator', cat: FIN, title: 'Bundle Pricing Calculator (Discount Against Item Margins)',
  desc: 'Compare a bundle price with selling items one by one, see the margin you keep, and the biggest discount that still meets a target margin.',
  inputs: 1, labels: ['Items: name, cost, price (one per line)'], placeholder: ['Camera, 220, 399'],
  sample: 'Camera, 220, 399\nCase, 8, 29\nMemory card, 9, 24', opts: [num('disc', 'Bundle discount %', 12), num('tm', 'Target margin % (for the maximum discount)', 30)],
  run: ([text], o) => {
    const items = lines(text).map((l) => { const c = csv(l); if (c.length < 3) throw new Error(`"${l}": use name, cost, price`); return { n: c[0], c: toNum(c[1], 'cost'), p: toNum(c[2], 'price') }; });
    if (!items.length) throw new Error('Add at least one item');
    nonneg(o, 'disc', 'tm'); if (o.disc >= 100 || o.tm >= 100) throw new Error('Percentages must be below 100');
    const C = items.reduce((a, x) => a + x.c, 0), P = items.reduce((a, x) => a + x.p, 0), B = P * (1 - o.disc / 100);
    const maxd = (1 - C / ((1 - o.tm / 100) * P)) * 100;
    return `${tbl(['Item', 'Cost', 'Price', 'Margin'], items.map((x) => [x.n, m(x.c), m(x.p), pc((x.p - x.c) / x.p * 100, 1)]))}\n\nSold separately: revenue ${m(P)}, cost ${m(C)}, profit ${m(P - C)} (${pc((P - C) / P * 100, 1)})\nBundle at ${pc(o.disc)} off: price ${m(B)}, profit ${m(B - C)} (${pc((B - C) / B * 100, 1)})\nProfit given up per bundle: ${m(P - B)}\nBiggest discount that keeps a ${pc(o.tm, 0)} margin: ${maxd > 0 ? pc(maxd, 1) : 'none, the margin is already below target'}\nA bundle pays off only if it sells extra items or raises basket size; compare against how often these are bought together.`;
  },
});

T.push({
  id: 'coupon-code-generator', cat: GEN, title: 'Unique Coupon Code Batch Generator',
  desc: 'Generate a batch of random, unique discount codes with a prefix, length, character set and optional dashes, using the browser crypto random source.',
  inputs: 0, sample: '', opts: [num('n', 'How many codes', 20), txt('prefix', 'Prefix', 'SPRING'), num('len', 'Random characters per code', 8), num('grp', 'Dash every N characters (0 = none)', 4), sel('set', 'Characters', ['Letters and digits, no look-alikes', 'Letters only', 'Digits only', 'Hex'], 'Letters and digits, no look-alikes')],
  run: (_i, o) => {
    const n = Math.floor(o.n), len = Math.floor(o.len);
    if (!(n >= 1 && n <= 10000)) throw new Error('Count must be 1 to 10000');
    if (!(len >= 4 && len <= 32)) throw new Error('Length must be 4 to 32');
    const set = { 'Letters and digits, no look-alikes': 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 'Letters only': 'ABCDEFGHJKLMNPQRSTUVWXYZ', 'Digits only': '0123456789', Hex: '0123456789ABCDEF' }[o.set];
    if (Math.pow(set.length, len) < n * 4) throw new Error('Too few possible codes for that count. Raise the length or use more characters');
    const lim = 256 - (256 % set.length), seen = new Set(), out = [], g = Math.floor(o.grp) || 0;
    const pre = String(o.prefix || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    while (out.length < n) {
      let s = ''; const buf = new Uint8Array(len * 2);
      while (s.length < len) { crypto.getRandomValues(buf); for (const b of buf) if (b < lim && s.length < len) s += set[b % set.length]; }
      if (seen.has(s)) continue; seen.add(s);
      const body = g > 0 ? s.match(new RegExp(`.{1,${g}}`, 'g')).join('-') : s;
      out.push(pre ? pre + '-' + body : body);
    }
    return out.join('\n');
  },
});

// =====================================================================================
// BUSINESS: naming and pitch
// =====================================================================================
T.push({
  id: 'business-name-idea-generator', cat: GEN, title: 'Business Name Idea Generator From Your Keywords',
  desc: 'Combine one to three keywords with prefixes, suffixes and blends into a list of name ideas. It does not check trademarks or domains.',
  inputs: 1, labels: ['Keywords, one per line (1 to 3)'], placeholder: ['garden\nloop'], sample: 'garden\nloop', opts: [num('max', 'Longest name, characters', 14)],
  run: ([text], o) => {
    const k = lines(text).map((x) => x.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean).slice(0, 3);
    if (!k.length) throw new Error('Enter at least one keyword');
    const pre = ['get', 'go', 'my', 'the', 'try', 'true', 'pure', 'bright', 'next', 'open', 'smart', 'swift'];
    const suf = ['ly', 'ify', 'hub', 'lab', 'works', 'stack', 'base', 'wise', 'nest', 'forge', 'hq', 'kit', 'ful', 'io', 'loop', 'craft'];
    const cap = (s) => s[0].toUpperCase() + s.slice(1), set = new Set(), max = Math.max(4, Math.floor(o.max) || 14);
    const add = (s) => { if (s.length >= 3 && s.length <= max) set.add(s); };
    for (const a of k) {
      for (const p of pre) add(cap(p) + cap(a));
      for (const s of suf) { add(cap(a) + s); if (a.endsWith('e') || /[aeiou]$/.test(a)) add(cap(a.slice(0, -1) + s)); }
    }
    for (const a of k) for (const b of k) if (a !== b) { add(cap(a) + cap(b)); add(cap(a.slice(0, Math.ceil(a.length / 2)) + b.slice(Math.floor(b.length / 2)))); add(cap(a) + 'And' + cap(b)); }
    const list = [...set]; if (!list.length) throw new Error('No names fit the length limit. Raise it or shorten the keywords');
    return `${list.length} ideas (deterministic: the same keywords give the same list)\n\n${list.join('\n')}\n\nThis tool does not check domain names, trademarks, social handles or what the name means in other languages. Search those yourself before you commit.`;
  },
});

T.push(calc('elevator-pitch-generator', PLAN, 'Elevator Pitch Generator From Problem, Solution and Audience',
  'Fill in who you help, the problem, your solution and proof to get pitch drafts in two structures with word count and speaking time.',
  [txt('who', 'Who you help', 'small online shops'), txt('prob', 'Their problem', 'lose sales because shipping costs are hard to predict'), txt('name', 'Product or company name', 'ShipSure'), txt('cat', 'What it is (category)', 'shipping cost calculator'), txt('sol', 'How it solves it', 'shows the exact shipping cost before checkout'), txt('diff', 'What makes it different', 'works with any carrier and needs no plugin'), txt('proof', 'Proof (optional)', 'used by 300 shops'), txt('ask', 'Ask (optional)', 'Could we set up a ten minute demo this week?')],
  (o) => {
    const g = (k) => String(o[k] || '').trim().replace(/[.!\s]+$/, '');
    if (!g('who') || !g('prob') || !g('sol')) throw new Error('Fill in who you help, the problem and how it solves it');
    const proof = g('proof') ? ` ${g('proof')[0].toUpperCase() + g('proof').slice(1)}.` : '', ask = g('ask') ? ` ${g('ask')}` : '';
    const name = g('name') || 'We', cat = g('cat') || 'solution';
    const a = `Problem first\n${g('who')[0].toUpperCase() + g('who').slice(1)} ${g('prob')}. ${name === 'We' ? 'We' : name} ${name === 'We' ? g('sol') : g('sol').replace(/^(\w)/, (c) => c.toLowerCase())}${g('diff') ? `, and it ${g('diff')}` : ''}.${proof}${ask}`;
    const b = `Positioning statement\nFor ${g('who')} who ${g('prob').replace(/^(lose|waste|struggle|have|need)/, (w) => w)}, ${name} is a ${cat} that ${g('sol')}. Unlike alternatives, it ${g('diff') || 'is simpler to use'}.${proof}${ask}`;
    const wc = (s) => s.split(/\s+/).length;
    return `${a}\n(${wc(a) - 2} words, about ${Math.round((wc(a) - 2) / 150 * 60)} seconds at a relaxed 150 words a minute)\n\n${b}\n(${wc(b) - 2} words, about ${Math.round((wc(b) - 2) / 150 * 60)} seconds)\n\nThese are template drafts. Read them aloud, cut anything you would not say, and keep one idea per sentence.`;
  }));

// =====================================================================================
// BUSINESS: runway, burn, break-even-like
// =====================================================================================
T.push(calc('startup-runway-calculator', FIN, 'Startup Runway Calculator (Cash, Burn, Revenue Growth)',
  'Months of cash left from balance, expenses and revenue, optionally with monthly growth rates, and the month the cash runs out.',
  [num('cash', 'Cash in the bank', 250000), num('exp', 'Monthly expenses', 45000), num('rev', 'Monthly revenue', 12000), num('g', 'Monthly revenue growth %', 5), num('eg', 'Monthly expense growth %', 1), dat('start', 'Starting month (date)', '2026-11-01')],
  (o) => {
    need(o, 'cash', 'exp', 'rev', 'g', 'eg'); nonneg(o, 'exp', 'rev');
    if (o.cash <= 0) throw new Error('Cash must be above 0');
    const sd = /^(\d{4})-(\d{2})/.exec(o.start); if (!sd) throw new Error('Enter a start date');
    let cash = o.cash, e = o.exp, rv = o.rev, mo = 0; const rows = [];
    const flat = o.exp - o.rev;
    while (cash > 0 && mo < 120) { cash -= e - rv; mo++; if (mo <= 12 || cash <= 0) rows.push([mo, m(Math.max(cash, 0))]); e *= 1 + o.eg / 100; rv *= 1 + o.g / 100; }
    const d = new Date(Date.UTC(+sd[1], +sd[2] - 1 + mo, 1)), end = d.toISOString().slice(0, 7);
    const flatRun = flat > 0 ? o.cash / flat : Infinity;
    return `Net burn today: ${m(flat)} per month\nRunway at today's burn, no growth: ${flatRun === Infinity ? 'unlimited (revenue covers expenses)' : r(flatRun, 1) + ' months'}\nRunway with your growth rates: ${mo >= 120 && cash > 0 ? 'more than 120 months (cash never runs out in the model)' : `${mo} months, cash runs out in ${end}`}\n\n${tbl(['Month', 'Cash left'], rows)}\nGrowth rates compound and are guesses; test a flat and a pessimistic case. Remember that fundraising takes months, so start well before zero.`;
  }));

T.push(calc('burn-rate-calculator', FIN, 'Burn Rate Calculator (Gross and Net Monthly Burn)',
  'Gross and net monthly burn from expenses and revenue, or from cash at the start and end of a period, with runway.',
  [sel('mode', 'Calculate from', ['Expenses and revenue', 'Cash at start and end'], 'Expenses and revenue'), num('exp', 'Monthly expenses', 45000), num('rev', 'Monthly revenue', 12000), num('c0', 'Cash at start of period', 400000), num('c1', 'Cash at end of period', 310000), num('mo', 'Months in the period', 3), num('cash', 'Cash now (for runway, 0 to skip)', 310000)],
  (o) => {
    let net, gross = null;
    if (o.mode === 'Expenses and revenue') { nonneg(o, 'exp', 'rev'); gross = o.exp; net = o.exp - o.rev; } else { pos(o, 'mo'); nonneg(o, 'c0', 'c1'); net = (o.c0 - o.c1) / o.mo; }
    let out = `Net burn = cash out - cash in\n\n${gross != null ? `Gross burn: ${m(gross)} per month\n` : ''}Net burn: ${m(net)} per month${net <= 0 ? ' (cash is growing, no burn)' : ''}`;
    if (o.cash > 0 && net > 0) out += `\nRunway at this burn: ${r(o.cash / net, 1)} months`;
    return out + '\nCash-based burn includes timing effects such as annual prepayments and one-off purchases.';
  }));

T.push(calc('startup-break-even-analysis-calculator', FIN, 'Startup Break-Even Analysis With Margin of Safety and Profit Target',
  'Break-even units and revenue from fixed costs, price and variable cost, plus units needed for a target profit and the margin of safety at your expected sales.',
  [num('fixed', 'Fixed costs per month', 8000), num('price', 'Price per unit', 49), num('vc', 'Variable cost per unit', 17), num('target', 'Target monthly profit', 4000), num('exp', 'Expected units per month (0 to skip)', 400)],
  (o) => {
    need(o, 'fixed', 'price', 'vc', 'target', 'exp'); nonneg(o, 'fixed', 'vc', 'target', 'exp'); pos(o, 'price');
    if (o.price <= o.vc) throw new Error('Price must exceed variable cost');
    const cm = o.price - o.vc, be = o.fixed / cm, tu = (o.fixed + o.target) / cm;
    let out = `Contribution per unit: ${m(cm)} (${pc(cm / o.price * 100)})\nBreak-even: ${r(be, 1)} units -> ${r(Math.ceil(be))} whole units, revenue ${m(Math.ceil(be) * o.price)}\nFor a profit of ${m(o.target)}: ${r(Math.ceil(tu))} units, revenue ${m(Math.ceil(tu) * o.price)}`;
    if (o.exp) out += `\nAt ${r(o.exp)} units: profit ${m(o.exp * cm - o.fixed)}; margin of safety ${pc((o.exp - be) / o.exp * 100, 1)} (sales can fall that far before losses)`;
    return out;
  }));

// =====================================================================================
// BUSINESS: equity and funding
// =====================================================================================
T.push({
  id: 'equity-dilution-calculator', cat: FIN, title: 'Equity Dilution Calculator Across Funding Rounds',
  desc: 'Follow founder ownership through several rounds from investment, pre-money valuation and option pool top-ups, and see the value of your stake.',
  inputs: 1, labels: ['Rounds: name, investment, pre-money valuation, option pool added % of post-money (optional)'], placeholder: ['Seed, 1000000, 4000000, 5'],
  sample: 'Pre-seed, 250000, 1750000\nSeed, 1500000, 6000000, 8\nSeries A, 8000000, 32000000, 5', opts: [num('own', 'Your starting ownership %', 50)],
  run: ([text], o) => {
    pos(o, 'own'); if (o.own > 100) throw new Error('Ownership cannot exceed 100');
    const rs = lines(text).map((l) => { const c = csv(l); if (c.length < 3) throw new Error(`"${l}": use name, investment, pre-money[, pool %]`); const a = toNum(c[1], 'investment'), p = toNum(c[2], 'pre-money'), pl = c[3] ? toNum(c[3], 'pool %') : 0; if (a <= 0 || p <= 0 || pl < 0 || a / (a + p) + pl / 100 >= 1) throw new Error(`Check the numbers in "${l}"`); return { n: c[0], a, p, pl }; });
    if (!rs.length) throw new Error('Add at least one round');
    let you = o.own / 100; const rows = []; let invested = 0;
    for (const x of rs) {
      const post = x.p + x.a, inv = x.a / post, f = 1 - inv - x.pl / 100;
      you *= f; invested += x.a;
      rows.push([x.n, m(x.p), m(post), pc(inv * 100, 2), pc(x.pl, 2), pc(f * 100, 2), pc(you * 100, 2), m(you * post)]);
    }
    return `${tbl(['Round', 'Pre-money', 'Post-money', 'New investor', 'New pool', 'You keep', 'You own', 'Stake value'], rows)}\n\nTotal raised: ${m(invested)}\nYour ownership after all rounds: ${pc(you * 100, 2)} (started at ${pc(o.own)})\nSimplified: new investors and pool top-ups (taken in the pre-money) dilute everyone else equally; SAFEs, notes and anti-dilution terms are not modelled. Not legal or financial advice.`;
  },
});

T.push({
  id: 'cap-table-round-simulator', cat: FIN, title: 'Cap Table Simulator With Option Pool and New Round',
  desc: 'Enter holders and shares, add a priced round with a pre-money valuation and optional pool top-up, and get the table before and after with price per share.',
  inputs: 1, labels: ['Holders: name, shares (a row with "pool" in the name is the option pool)'], placeholder: ['Founder A, 4000000'],
  sample: 'Founder A, 4000000\nFounder B, 3000000\nOption pool, 800000\nAngel, 200000', opts: [txt('rn', 'New round name', 'Seed'), num('inv', 'New investment', 1500000), num('pre', 'Pre-money valuation', 6000000), num('pool', 'Pool target % of post-round shares (0 = leave as is)', 10)],
  run: ([text], o) => {
    pos(o, 'inv', 'pre'); nonneg(o, 'pool'); if (o.pool >= 100) throw new Error('Pool target must be below 100');
    const hs = lines(text).map((l) => { const c = csv(l); if (c.length < 2) throw new Error(`"${l}": use name, shares`); const s = toNum(c[1], 'shares'); if (s < 0) throw new Error('Shares cannot be negative'); return { n: c[0], s }; });
    if (!hs.length) throw new Error('Add at least one holder');
    const S = hs.reduce((a, x) => a + x.s, 0); if (S <= 0) throw new Error('Total shares must be above 0');
    const E = hs.filter((x) => /pool/i.test(x.n)).reduce((a, x) => a + x.s, 0);
    const k = o.inv / o.pre, p = o.pool / 100;
    let P = 0;
    if (p > 0) { P = (p * S * (1 + k) - E) / (1 - p * (1 + k)); if (P < 0) P = 0; if (1 - p * (1 + k) <= 0) throw new Error('Pool target is too high for this round size'); }
    const pre = S + P, pps = o.pre / pre, newSh = o.inv / pps, post = pre + newSh;
    const rows = hs.map((x) => [x.n, r(x.s), pc(x.s / S * 100, 2), r(x.s + (/pool/i.test(x.n) && P && x === hs.find((y) => /pool/i.test(y.n)) ? P : 0)), '']);
    let poolRow = hs.find((x) => /pool/i.test(x.n));
    if (P && !poolRow) rows.push(['Option pool (new)', '0', '0%', r(P), '']);
    rows.push([o.rn + ' investor', '0', '0%', r(newSh), '']);
    for (const row of rows) row[4] = pc(+row[3].replace(/,/g, '') / post * 100, 2);
    rows.push(['Total', r(S), '100%', r(post), '100%']);
    return `${tbl(['Holder', 'Shares before', '% before', 'Shares after', '% after'], rows)}\n\nPrice per share: ${m(pps)} (pre-money ${m(o.pre)} / ${r(pre)} fully diluted shares including pool top-up)\nNew shares issued: ${r(newSh)} for ${m(o.inv)}; post-money ${m(post * pps)}\nPool top-up is added before the round (pre-money), which dilutes existing holders only.\nSimplified: one round, common-equivalent shares, no preferences, SAFEs or notes. Not legal advice.`;
  },
});

T.push(calc('safe-conversion-calculator', FIN, 'SAFE Conversion Calculator (Valuation Cap and Discount)',
  'Shares and ownership a SAFE converts into at a priced round, using the lower of the cap price and the discounted round price. Covers one SAFE only.',
  [sel('type', 'SAFE type', ['Post-money SAFE', 'Pre-money SAFE'], 'Post-money SAFE'), num('amt', 'SAFE purchase amount', 100000), num('cap', 'Valuation cap', 5000000), num('disc', 'Discount % (0 = none)', 20), num('ex', 'Existing fully diluted shares before the SAFE (incl. pool)', 10000000), num('pps', 'Price per share in the priced round', 0.9)],
  (o) => {
    pos(o, 'amt', 'cap', 'ex', 'pps'); nonneg(o, 'disc'); if (o.disc >= 100) throw new Error('Discount must be below 100');
    if (o.type === 'Post-money SAFE' && o.amt >= o.cap) throw new Error('Purchase amount must be below the cap');
    // post-money: company capitalization includes the SAFE shares themselves => cap price = (cap - amt) / existing; pre-money: cap price = cap / existing
    const capP = o.type === 'Post-money SAFE' ? (o.cap - o.amt) / o.ex : o.cap / o.ex, dP = o.pps * (1 - o.disc / 100);
    const conv = Math.min(capP, o.disc ? dP : Infinity), shares = o.amt / conv;
    const why = !o.disc || capP <= dP ? 'cap price' : 'discount price';
    return `Cap price: ${r(capP, 6)}\nDiscount price: ${o.disc ? r(dP, 6) : 'n/a'}\nConversion price (lower of the two): ${r(conv, 6)} (${why} applies)\nSAFE shares: ${r(shares, 0)}\nOwnership right after converting (before the new money): ${pc(shares / (o.ex + shares) * 100, 3)}\n${o.type === 'Post-money SAFE' ? 'Post-money SAFE: with the cap applying, ownership equals amount / cap, here ' + pc(o.amt / o.cap * 100, 3) + ' of the company capitalization.' : ''}\nSimplified model from public SAFE descriptions: one SAFE, no other converting notes, no pool increase counted in the capitalization. Real conversions follow the signed document and your lawyer\'s cap table. Not legal advice.`;
  }));

T.push(calc('pre-post-money-valuation-calculator', FIN, 'Pre-Money and Post-Money Valuation Calculator',
  'Fill in any two of pre-money valuation, investment and post-money valuation (leave the third at 0) and get the third plus the investor share.',
  [num('pre', 'Pre-money valuation (0 = unknown)', 4000000), num('inv', 'Investment (0 = unknown)', 1000000), num('post', 'Post-money valuation (0 = unknown)', 0)],
  (o) => {
    nonneg(o, 'pre', 'inv', 'post');
    const known = [o.pre, o.inv, o.post].filter((x) => x > 0).length;
    if (known !== 2) throw new Error('Fill in exactly two of the three values and leave the third at 0');
    let { pre, inv, post } = o;
    if (!post) post = pre + inv; else if (!pre) { pre = post - inv; if (pre <= 0) throw new Error('Investment must be below post-money'); } else { inv = post - pre; if (inv <= 0) throw new Error('Post-money must exceed pre-money'); }
    return `Post-money = pre-money + investment\n\nPre-money: ${m(pre)}\nInvestment: ${m(inv)}\nPost-money: ${m(post)}\nInvestor ownership: ${pc(inv / post * 100, 3)}\nExisting holders keep: ${pc(pre / post * 100, 3)}`;
  }));

T.push(calc('vesting-schedule-calculator', PLAN, 'Vesting Schedule Calculator (Cliff and Monthly Vesting)',
  'Shares vested at each month for a cliff plus monthly schedule, and the vested amount on a date you choose.',
  [num('sh', 'Total shares or options', 48000), dat('start', 'Vesting start date', '2026-01-15'), num('mo', 'Vesting length, months', 48), num('cliff', 'Cliff, months (0 = none)', 12), dat('asof', 'Check date', '2027-06-30')],
  (o) => {
    pos(o, 'sh', 'mo'); nonneg(o, 'cliff');
    if (o.mo > 120) throw new Error('Vesting length is limited to 120 months'); if (o.cliff > o.mo) throw new Error('Cliff cannot be longer than the schedule');
    const p = (s) => { const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!mt) throw new Error('Enter valid dates'); return { y: +mt[1], mo: +mt[2], d: +mt[3] }; };
    const st = p(o.start), as = p(o.asof);
    const vestedAt = (k) => (k < o.cliff || k <= 0 ? 0 : Math.min(o.sh, Math.floor(o.sh * Math.min(k, o.mo) / o.mo)));
    const date = (k) => { const t = st.y * 12 + st.mo - 1 + k, y = Math.floor(t / 12), mo = t % 12, last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(); return `${y}-${String(mo + 1).padStart(2, '0')}-${String(Math.min(st.d, last)).padStart(2, '0')}`; };
    let k = 0; while (k < o.mo && date(k + 1) <= o.asof) k++;
    if (as.y * 12 + as.mo < st.y * 12 + st.mo - 24 && date(0) > o.asof) k = 0;
    const rows = []; const marks = new Set([o.cliff || 1, o.mo]);
    for (let i = 1; i <= o.mo; i++) if (i <= 12 || i % 6 === 0 || marks.has(i)) rows.push([i, date(i), r(vestedAt(i)), pc(vestedAt(i) / o.sh * 100, 2)]);
    return `On ${o.asof}: ${r(vestedAt(k))} vested (${pc(vestedAt(k) / o.sh * 100, 2)}), ${k} full months since ${o.start}\n\n${tbl(['Month', 'Date', 'Vested', '%'], rows)}\nVesting rounds down to whole shares; the last month vests the rest. Real plans can use quarterly steps, acceleration or different rounding, so follow your grant document.`;
  }));

// =====================================================================================
// BUSINESS: SaaS metrics
// =====================================================================================
T.push({
  id: 'mrr-arr-calculator', cat: FIN, title: 'MRR and ARR Calculator With Net New MRR',
  desc: 'Monthly and annual recurring revenue from plan prices and subscriber counts, plus new, expansion, contraction and churned MRR to get net new MRR and growth.',
  inputs: 1, labels: ['Plans: name, monthly price, subscribers'], placeholder: ['Starter, 19, 240'],
  sample: 'Starter, 19, 240\nPro, 49, 120\nBusiness, 149, 30', opts: [num('new', 'New MRR this month', 1800), num('exp', 'Expansion MRR', 400), num('con', 'Contraction MRR', 150), num('chu', 'Churned MRR', 600)],
  run: ([text], o) => {
    const ps = lines(text).map((l) => { const c = csv(l); if (c.length < 3) throw new Error(`"${l}": use name, price, subscribers`); return { n: c[0], p: toNum(c[1], 'price'), s: toNum(c[2], 'subscribers') }; });
    if (!ps.length) throw new Error('Add at least one plan'); nonneg(o, 'new', 'exp', 'con', 'chu');
    const tot = ps.reduce((a, x) => a + x.p * x.s, 0), subs = ps.reduce((a, x) => a + x.s, 0);
    const net = o.new + o.exp - o.con - o.chu, start = tot - net;
    return `${tbl(['Plan', 'Price', 'Subscribers', 'MRR', 'Share'], ps.map((x) => [x.n, m(x.p), r(x.s), m(x.p * x.s), pc(x.p * x.s / tot * 100, 1)]))}\n\nMRR now: ${m(tot)}\nARR (MRR x 12): ${m(tot * 12)}\nSubscribers: ${r(subs)}; ARPU: ${m(tot / subs)}\n\nNet new MRR = new + expansion - contraction - churned = ${m(net)}\nMRR at start of month: ${m(start)}\nGrowth: ${start > 0 ? pc(net / start * 100, 2) : 'n/a'}\nUse the same definition as your investors: MRR normally excludes one-off fees and usage you cannot predict.`;
  },
});

T.push(calc('churn-rate-calculator', FIN, 'Churn Rate Calculator (Customer, Revenue, Net Revenue Retention)',
  'Customer churn, gross and net revenue churn, retention, annualised churn and expected lifetime from start-of-period figures.',
  [num('c0', 'Customers at start', 1000), num('lost', 'Customers lost in the period', 35), num('r0', 'Recurring revenue at start', 60000), num('rl', 'Revenue lost from cancelled customers', 2300), num('con', 'Revenue lost from downgrades', 400), num('exp', 'Revenue gained from upgrades', 1500), num('mo', 'Months in the period', 1)],
  (o) => {
    pos(o, 'c0', 'r0', 'mo'); nonneg(o, 'lost', 'rl', 'con', 'exp');
    if (o.lost > o.c0) throw new Error('Lost customers cannot exceed starting customers');
    const cc = o.lost / o.c0, gr = (o.rl + o.con) / o.r0, nr = (o.rl + o.con - o.exp) / o.r0, mcc = 1 - Math.pow(1 - cc, 1 / o.mo);
    return `Customer (logo) churn: ${pc(cc * 100, 2)} per period (${pc(mcc * 100, 2)} per month)\nCustomer retention: ${pc((1 - cc) * 100, 2)}\nGross revenue churn: ${pc(gr * 100, 2)}\nGross revenue retention: ${pc((1 - gr) * 100, 2)}\nNet revenue churn: ${pc(nr * 100, 2)} ${nr < 0 ? '(negative: upgrades outweigh losses)' : ''}\nNet revenue retention: ${pc((1 - nr) * 100, 2)}\nAnnualised customer churn at the monthly rate: ${pc((1 - Math.pow(1 - mcc, 12)) * 100, 1)}\nExpected customer lifetime: ${mcc > 0 ? r(1 / mcc, 1) + ' months' : 'unbounded'}\nCount only customers who were active at the start; new customers of the period do not belong in the base.`;
  }));

T.push(calc('saas-metrics-calculator', FIN, 'SaaS Metrics Calculator (ARPU, LTV, CAC, Payback, LTV to CAC)',
  'Combine MRR, churn, gross margin and acquisition spend into ARPU, customer lifetime value, CAC, CAC payback and the LTV to CAC ratio.',
  [num('mrr', 'MRR', 60000), num('cust', 'Customers at start of month', 1000), num('lost', 'Customers lost this month', 25), num('new', 'New customers this month', 40), num('sm', 'Sales and marketing spend this month', 28000), num('gm', 'Gross margin %', 80)],
  (o) => {
    pos(o, 'mrr', 'cust', 'new', 'gm'); nonneg(o, 'lost', 'sm');
    if (o.lost > o.cust) throw new Error('Lost customers cannot exceed starting customers');
    if (o.gm > 100) throw new Error('Gross margin cannot exceed 100');
    const arpu = o.mrr / o.cust, ch = o.lost / o.cust, cac = o.sm / o.new, gp = arpu * o.gm / 100;
    const ltv = ch > 0 ? gp / ch : Infinity, pay = cac / gp;
    return `ARPU: ${m(arpu)} per customer per month\nARR: ${m(o.mrr * 12)}\nMonthly customer churn: ${pc(ch * 100, 2)}\nLifetime: ${ch > 0 ? r(1 / ch, 1) + ' months' : 'unbounded'}\nLTV (ARPU x gross margin / churn): ${ltv === Infinity ? 'unbounded at zero churn' : m(ltv)}\nCAC (spend / new customers): ${m(cac)}\nCAC payback: ${r(pay, 1)} months\nLTV : CAC: ${ltv === Infinity ? 'n/a' : r(ltv / cac, 2)} ${ltv !== Infinity ? (ltv / cac >= 3 ? '(3 or more is a common rule of thumb)' : '(below the common rule of thumb of 3; review)') : ''}\nThe 3:1 and payback rules are rough benchmarks, and one month of data is noisy. Use several months.`;
  }));

T.push(calc('rule-of-40-calculator', FIN, 'Rule of 40 Calculator for SaaS Growth and Profit',
  'Add yearly revenue growth and a profit margin (EBITDA, operating or free cash flow) to see whether the total reaches the Rule of 40 benchmark.',
  [num('g', 'Yearly revenue growth %', 35), num('pm', 'Profit margin %', 8), sel('basis', 'Margin type', ['EBITDA', 'Operating', 'Free cash flow'], 'EBITDA')],
  (o) => {
    need(o, 'g', 'pm'); const s = o.g + o.pm;
    return `Score = growth % + ${o.basis.toLowerCase()} margin %\n\nGrowth: ${pc(o.g)}\nMargin: ${pc(o.pm)}\nRule of 40 score: ${r(s, 1)} -> ${s >= 40 ? 'at or above 40' : r(40 - s, 1) + ' points below 40'}\nA rule of thumb for scaled SaaS companies, not a law. Pick one margin definition and keep it fixed so scores are comparable over time.`;
  }));

T.push({
  id: 'unit-economics-calculator', cat: FIN, title: 'Unit Economics Calculator (Contribution Margin per Order or Customer)',
  desc: 'Contribution per unit from revenue and a list of variable costs, plus payback of acquisition cost if you add it.',
  inputs: 1, labels: ['Variable costs per unit: name, amount (one per line)'], placeholder: ['Product, 12'], sample: 'Product, 12.50\nPackaging, 1.20\nShipping, 4.80\nPayment fees, 1.70',
  opts: [num('rev', 'Revenue per unit (order)', 39), num('cac', 'Acquisition cost per customer (0 to skip)', 18), num('orders', 'Orders per customer over the period you track', 2.5)],
  run: ([text], o) => {
    pos(o, 'rev'); nonneg(o, 'cac', 'orders');
    const cs = lines(text).map((l) => { const c = csv(l); if (c.length < 2) throw new Error(`"${l}": use name, amount`); return [c[0], toNum(c[1], 'amount')]; });
    if (!cs.length) throw new Error('Add at least one cost line');
    const vc = cs.reduce((a, x) => a + x[1], 0), cm = o.rev - vc;
    let out = `${tbl(['Cost', 'Amount'], cs.map((x) => [x[0], m(x[1])]))}\n\nRevenue per unit: ${m(o.rev)}\nVariable cost: ${m(vc)}\nContribution per unit: ${m(cm)} (${pc(cm / o.rev * 100, 1)})`;
    if (o.cac) out += `\nAcquisition cost: ${m(o.cac)}\nContribution per customer over ${r(o.orders)} orders: ${m(cm * o.orders)}\nAfter acquisition cost: ${m(cm * o.orders - o.cac)}\nOrders needed to pay back acquisition: ${cm > 0 ? r(o.cac / cm, 2) : 'never, contribution is not positive'}`;
    return out + '\nFixed costs are left out on purpose. Contribution must cover them before there is profit.';
  },
});

T.push({
  id: 'pricing-tier-planner', cat: FIN, title: 'Pricing Tier Planner (Good-Better-Best Revenue and Margin)',
  desc: 'Compare plans by price, expected customers and cost per customer: revenue, margin, mix and blended revenue per customer.',
  inputs: 1, labels: ['Plans: name, price, expected customers, cost to serve per customer'], placeholder: ['Basic, 15, 500, 4'],
  sample: 'Basic, 15, 500, 4\nPlus, 39, 250, 9\nPremium, 99, 60, 25', opts: [],
  run: ([text]) => {
    const ps = lines(text).map((l) => { const c = csv(l); if (c.length < 4) throw new Error(`"${l}": use name, price, customers, cost`); return { n: c[0], p: toNum(c[1], 'price'), c: toNum(c[2], 'customers'), k: toNum(c[3], 'cost') }; });
    if (ps.length < 1) throw new Error('Add at least one plan');
    if (ps.some((x) => x.p <= 0 || x.c < 0 || x.k < 0)) throw new Error('Price must be above 0; customers and cost cannot be negative');
    const R = ps.reduce((a, x) => a + x.p * x.c, 0), K = ps.reduce((a, x) => a + x.k * x.c, 0), N = ps.reduce((a, x) => a + x.c, 0);
    if (!N) throw new Error('Total customers must be above 0');
    return `${tbl(['Plan', 'Price', 'Customers', 'Mix', 'Revenue', 'Margin each', 'Margin total'], ps.map((x) => [x.n, m(x.p), r(x.c), pc(x.c / N * 100, 1), m(x.p * x.c), pc((x.p - x.k) / x.p * 100, 1), m((x.p - x.k) * x.c)]))}\n\nTotal revenue: ${m(R)}\nTotal cost to serve: ${m(K)}\nGross profit: ${m(R - K)} (${pc((R - K) / R * 100, 1)})\nBlended revenue per customer: ${m(R / N)}\nBest plan by profit per customer: ${ps.reduce((a, b) => (b.p - b.k > a.p - a.k ? b : a)).n}\nCustomer counts are your forecast. Use the same period (month or year) for price and cost.`;
  },
});

// =====================================================================================
// BUSINESS: people and time
// =====================================================================================
T.push(calc('employee-total-cost-calculator', FIN, 'Employee Total Cost Calculator (Salary, Employer Charges, Benefits, Overhead)',
  'Total yearly cost of an employee from gross salary and the employer tax rate, benefits, equipment and overhead you enter, with monthly and hourly cost.',
  [num('sal', 'Gross yearly salary', 52000), num('tax', 'Employer charges, % of salary (your country)', 20), num('bonus', 'Bonus or 13th month', 0), num('ben', 'Benefits and insurance per year', 2400), num('eq', 'Equipment and software per year', 1800), num('oh', 'Office and overhead per year', 3000), num('days', 'Productive working days per year', 215)],
  (o) => {
    pos(o, 'sal', 'days'); nonneg(o, 'tax', 'bonus', 'ben', 'eq', 'oh');
    const base = o.sal + o.bonus, chg = base * o.tax / 100, tot = base + chg + o.ben + o.eq + o.oh;
    return `No tax rate is built in: employer charges differ by country and change yearly. Use the rate from your payroll provider or tax authority.\n\nGross salary + bonus: ${m(base)}\nEmployer charges: ${m(chg)}\nBenefits: ${m(o.ben)}\nEquipment and software: ${m(o.eq)}\nOverhead: ${m(o.oh)}\nTotal yearly cost: ${m(tot)} (${r(tot / o.sal, 2)} x salary)\nPer month: ${m(tot / 12)}\nPer productive day: ${m(tot / o.days)}\nPer productive hour (8 h days): ${m(tot / o.days / 8)}\nProductive days should exclude holidays, public days and sick leave.`;
  }));

T.push({
  id: 'meeting-cost-timer', cat: 'Time & Productivity', title: 'Live Meeting Cost Timer', custom: true,
  desc: 'See what a meeting costs in money as time passes, from attendee count and average salary, with start, pause and reset buttons.',
  render: (el) => {
    el.innerHTML = '';
    const mk = (tag, props = {}, kids = []) => { const e = Object.assign(document.createElement(tag), props); kids.forEach((k) => e.append(k)); return e; };
    const field = (label, id, val, step) => { const i = mk('input', { id, type: 'number', value: val, min: 0, step: step || 1 }); i.style.width = '9rem'; return [mk('label', { htmlFor: id, textContent: label }), i, i]; };
    const [l1, attendees] = field('Attendees', 'mc-att', 6), [l2, salary] = field('Average yearly salary per attendee', 'mc-sal', 60000, 1000), [l3, hours] = field('Working hours per year', 'mc-hrs', 1800, 10), [l4, plan] = field('Planned length in minutes (optional)', 'mc-plan', 60, 5);
    const rows = [[l1, attendees], [l2, salary], [l3, hours], [l4, plan]].map(([l, i]) => mk('div', { style: 'display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin:.35rem 0' }, [l, i]));
    const live = mk('div', { style: 'font-size:2rem;font-weight:700;margin:.8rem 0', textContent: '0.00' });
    live.setAttribute('aria-hidden', 'true');
    const status = mk('div', { style: 'min-height:1.5em' }); status.setAttribute('role', 'status');
    const planned = mk('p');
    const btn = (t, f) => mk('button', { type: 'button', textContent: t, onclick: f });
    let ms = 0, t0 = 0, timer = 0;
    const rate = () => { const a = +attendees.value, s = +salary.value, h = +hours.value; if (!(a >= 0 && s >= 0 && h > 0)) return NaN; return a * s / h / 3600000; }; // cost per millisecond
    const fmt = (x) => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const time = (t) => { const s = Math.floor(t / 1000); return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`; };
    const cur = () => ms + (timer ? Date.now() - t0 : 0);
    const draw = () => {
      const rt = rate(); live.textContent = Number.isFinite(rt) ? fmt(cur() * rt) : 'Check the numbers';
      const p = +plan.value; planned.textContent = Number.isFinite(rt) && p > 0 ? `A ${p} minute meeting costs ${fmt(p * 60000 * rt)} in salary time. Per minute: ${fmt(60000 * rt)}.` : '';
    };
    const stop = () => { if (timer) { ms += Date.now() - t0; clearInterval(timer); timer = 0; } };
    const startB = btn('Start', () => { if (!timer) { t0 = Date.now(); timer = setInterval(draw, 500); } draw(); });
    const pauseB = btn('Pause', () => { stop(); draw(); const rt = rate(); status.textContent = `Paused after ${time(ms)}: cost so far ${fmt(ms * rt)}.`; });
    const resetB = btn('Reset', () => { stop(); ms = 0; status.textContent = 'Reset.'; draw(); });
    [attendees, salary, hours, plan].forEach((i) => i.addEventListener('input', draw));
    el.append(...rows, mk('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap;margin:.5rem 0' }, [startB, pauseB, resetB]), mk('div', {}, [mk('span', { textContent: 'Cost so far: ' }), live]), status, planned,
      mk('p', { style: 'color:var(--muted)', textContent: 'Uses salary only (no employer charges), which understates the real cost. The running amount updates visually; the total is announced when you pause. Nothing is stored or sent.' }));
    draw();
  },
});

T.push(calc('freelance-hourly-rate-calculator', FIN, 'Freelance Hourly Rate Calculator From Income Target',
  'The hourly rate you need to reach a take-home target after business costs, your own tax rate and realistic billable hours.',
  [num('net', 'Desired yearly take-home income', 50000), num('exp', 'Business expenses per year', 6000), num('tax', 'Tax and social charges, % of earnings (your estimate)', 28), num('wk', 'Working weeks per year', 46), num('hw', 'Working hours per week', 40), num('bill', 'Share of working hours you can bill, %', 60)],
  (o) => {
    pos(o, 'net', 'wk', 'hw', 'bill'); nonneg(o, 'exp', 'tax');
    if (o.tax >= 100 || o.bill > 100) throw new Error('Check the tax and billable percentages');
    const gross = o.net / (1 - o.tax / 100) + o.exp, hrs = o.wk * o.hw * o.bill / 100, rate = gross / hrs;
    return `Rate = (take-home / (1 - tax%) + expenses) / billable hours\n\nRevenue needed: ${m(gross)}\nBillable hours per year: ${r(hrs, 0)} (${r(hrs / o.wk, 1)} per week)\nMinimum hourly rate: ${m(rate)}\nDay rate (8 h): ${m(rate * 8)}\nWith a 15% buffer for unpaid gaps: ${m(rate * 1.15)}\nThe tax rate is your own estimate; ask an accountant for the real figure. Expenses are treated as paid before tax here.`;
  }));

T.push(calc('day-rate-to-salary-converter', FIN, 'Contractor Day Rate to Annual Salary Converter',
  'Turn a day rate and days worked into yearly income, hourly rate and an employee-equivalent salary after a benefits uplift you choose.',
  [num('rate', 'Day rate', 450), num('days', 'Days worked per year', 210), num('hrs', 'Hours per day', 8), num('up', 'Employee benefits worth, % of salary (holiday, pension, sick pay)', 25)],
  (o) => {
    pos(o, 'rate', 'days', 'hrs'); nonneg(o, 'up');
    const yr = o.rate * o.days;
    return `Yearly income at ${r(o.days)} days: ${m(yr)}\nMonthly average: ${m(yr / 12)}\nHourly: ${m(o.rate / o.hrs)}\nEmployee-equivalent salary: ${m(yr / (1 + o.up / 100))} (income divided by 1 + ${pc(o.up, 0)} benefits)\nWorking days at full employment, 260 less holidays, are often 215 to 230; contractors also pay for gaps between jobs, so count only days you really bill.\nThe uplift is your own assumption. Taxes and costs differ for contractors and employees and are not included.`;
  }));

T.push({
  id: 'project-quote-estimator', cat: PLAN, title: 'Project Quote Estimator From Tasks, Hours and Rates',
  desc: 'Total a project from tasks with hours and rates, add contingency, discount and tax, and see the price, hours and blended rate.',
  inputs: 1, labels: ['Tasks: name, hours, rate (rate optional)'], placeholder: ['Design, 20, 85'],
  sample: 'Discovery, 8, 95\nDesign, 24, 85\nDevelopment, 60\nTesting, 12\nHandover, 4', opts: [num('rate', 'Default hourly rate', 80), num('cont', 'Contingency %', 15), num('disc', 'Discount %', 0), num('tax', 'Tax %', 0)],
  run: ([text], o) => {
    nonneg(o, 'rate', 'cont', 'disc', 'tax');
    const ts = lines(text).map((l) => { const c = csv(l); if (c.length < 2) throw new Error(`"${l}": use name, hours[, rate]`); const h = toNum(c[1], 'hours'), rt = c[2] ? toNum(c[2], 'rate') : o.rate; if (h < 0 || rt < 0) throw new Error('Hours and rate cannot be negative'); return { n: c[0], h, r: rt }; });
    if (!ts.length) throw new Error('Add at least one task');
    const H = ts.reduce((a, x) => a + x.h, 0), S = ts.reduce((a, x) => a + x.h * x.r, 0), C = S * o.cont / 100, D = (S + C) * o.disc / 100, N = S + C - D, X = N * o.tax / 100;
    return `${tbl(['Task', 'Hours', 'Rate', 'Amount'], ts.map((x) => [x.n, r(x.h, 2), m(x.r), m(x.h * x.r)]))}\n\nSubtotal: ${m(S)} (${r(H, 2)} hours)\nContingency (${pc(o.cont, 1)}): ${m(C)}\nDiscount (${pc(o.disc, 1)}): -${m(D)}\nNet price: ${m(N)}\nTax (${pc(o.tax, 1)}): ${m(X)}\nTotal: ${m(N + X)}\nBlended rate on net price: ${m(N / H)} per hour\nWrite down what is out of scope and how changes are priced; an estimate is not a fixed price until both sides agree.`;
  },
});

// =====================================================================================
// BUSINESS: canvases and planning
// =====================================================================================
const canvasDoc = (title, boxes, areas) => {
  const cells = boxes.map(([name, text], i) => `<section style="grid-area:${areas[i]}"><h2>${esc(name)}</h2>${text.trim() ? '<ul>' + text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).map((x) => `<li>${esc(x.replace(/^[-*]\s*/, ''))}</li>`).join('') + '</ul>' : '<p class="e">Empty</p>'}</section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
:root{color-scheme:light dark}body{font:14px/1.4 system-ui,sans-serif;margin:12px;color:CanvasText;background:Canvas}h1{font-size:1.2rem;margin:0 0 .6rem}
.g{display:grid;gap:6px}section{border:1px solid GrayText;border-radius:6px;padding:8px;min-width:0}h2{font-size:.85rem;margin:0 0 .3rem;text-transform:uppercase;letter-spacing:.03em}ul{margin:0;padding-left:1.1rem}.e{color:color-mix(in srgb,CanvasText 72%,Canvas);margin:0}
@media(max-width:700px){.g{display:block}section{margin-bottom:6px}}</style></head><body><h1>${esc(title)}</h1><div class="g" style="grid-template-columns:repeat(10,1fr)">${cells}</div></body></html>`;
};
const canvasRun = (title, names, areas, grid) => ([...inputs]) => {
  const boxes = names.map((n, i) => [n, inputs[i] || '']);
  if (!boxes.some((b) => b[1].trim())) throw new Error('Fill in at least one box');
  return { html: canvasDoc(title, boxes, areas).replace('repeat(10,1fr)', 'repeat(10,1fr);grid-template-areas:' + grid), filename: title.toLowerCase().replace(/\W+/g, '-') + '.html' };
};
const LEAN = ['Problem', 'Solution', 'Unique value proposition', 'Unfair advantage', 'Customer segments', 'Key metrics', 'Channels', 'Cost structure', 'Revenue streams'];
T.push({
  id: 'lean-canvas-builder', cat: PLAN, title: 'Lean Canvas Builder (One-Page Business Plan)',
  desc: 'Fill in the nine boxes of a lean canvas as short lists and get a printable one-page canvas you can save as HTML or print to PDF.',
  inputs: 9, labels: LEAN, placeholder: LEAN.map((n) => n + ', one point per line'),
  sample: 'Shipping costs surprise small shops\nExisting alternatives: carrier calculators, spreadsheets', sample2: 'Show exact shipping cost before checkout', opts: [],
  run: canvasRun('Lean canvas', LEAN, ['p', 's', 'u', 'a', 'c', 'm', 'h', 'k', 'r'], '"p p s s u u a a c c" "p p s s u u a a c c" "p p m m u u h h c c" "k k k k k r r r r r"'),
});
const BMC = ['Key partners', 'Key activities', 'Key resources', 'Value propositions', 'Customer relationships', 'Channels', 'Customer segments', 'Cost structure', 'Revenue streams'];
T.push({
  id: 'business-model-canvas-builder', cat: PLAN, title: 'Business Model Canvas Builder (Nine Blocks)',
  desc: 'Write notes in the nine blocks of the business model canvas and get a printable one-page canvas as HTML you can save or print to PDF.',
  inputs: 9, labels: BMC, placeholder: BMC.map((n) => n + ', one point per line'),
  sample: 'Carriers\nPayment provider', sample2: 'Rate lookup\nPlatform upkeep', opts: [],
  run: canvasRun('Business model canvas', BMC, ['kp', 'ka', 'kr', 'vp', 'cr', 'ch', 'cs', 'co', 'rs'], '"kp kp ka ka vp vp cr cr cs cs" "kp kp ka ka vp vp cr cr cs cs" "kp kp kr kr vp vp ch ch cs cs" "co co co co co rs rs rs rs rs"'),
});

T.push(calc('market-size-tam-sam-som-calculator', PLAN, 'Market Size Calculator (TAM, SAM, SOM)',
  'Estimate total, serviceable and obtainable market from customer counts, price per customer and the shares you assume, bottom-up.',
  [num('n', 'Customers who could use the product (total)', 400000), num('price', 'Revenue per customer per year', 600), num('sam', 'Share you can serve with your product and channels, %', 30), num('som', 'Share of that you can win in the plan period, %', 3)],
  (o) => {
    pos(o, 'n', 'price'); nonneg(o, 'sam', 'som'); if (o.sam > 100 || o.som > 100) throw new Error('Shares cannot exceed 100');
    const tam = o.n * o.price, sam = tam * o.sam / 100, som = sam * o.som / 100;
    return `TAM = customers x price\nSAM = TAM x serviceable share\nSOM = SAM x obtainable share\n\nTAM: ${m(tam)} (${r(o.n)} customers)\nSAM: ${m(sam)} (${r(o.n * o.sam / 100, 0)} customers)\nSOM: ${m(som)} (${r(o.n * o.sam / 100 * o.som / 100, 0)} customers)\nThe shares are your assumptions and carry most of the uncertainty. Back each one with a source, such as industry counts or survey data, and show a low and high case.`;
  }));

T.push({
  id: 'okr-planner-scorer', cat: PLAN, title: 'OKR Planner and Progress Scorer',
  desc: 'Write objectives with measurable key results and see each key result scored from start, target and current values, with objective averages.',
  inputs: 1, labels: ['Lines: "O: objective" then "KR: name | start | target | current"'], placeholder: ['O: Grow signups\nKR: Weekly signups | 100 | 300 | 180'],
  sample: 'O: Launch the self-serve plan\nKR: Paying accounts | 0 | 200 | 130\nKR: Activation rate % | 30 | 50 | 41\nO: Make support faster\nKR: First response hours | 12 | 4 | 6', opts: [],
  run: ([text]) => {
    const objs = []; let cur = null;
    for (const l of lines(text)) {
      let mt;
      if ((mt = /^O\s*\d*\s*:\s*(.+)$/i.exec(l))) { cur = { n: mt[1], k: [] }; objs.push(cur); } else if ((mt = /^KR\s*\d*\s*:\s*(.+)$/i.exec(l))) {
        if (!cur) throw new Error('Put an "O:" line before the first KR');
        const c = mt[1].split('|').map((x) => x.trim()); if (c.length < 4) throw new Error(`"${l}": use KR: name | start | target | current`);
        const s = toNum(c[1], 'start'), t = toNum(c[2], 'target'), v = toNum(c[3], 'current'); if (s === t) throw new Error(`"${c[0]}": start and target are equal`);
        cur.k.push({ n: c[0], s, t, v, sc: Math.max(0, Math.min(1, (v - s) / (t - s))) });
      } else throw new Error(`Cannot read "${l}". Lines start with O: or KR:`);
    }
    if (!objs.length) throw new Error('Add an objective');
    const bar = (x) => '#'.repeat(Math.round(x * 10)).padEnd(10, '.');
    return objs.map((ob, i) => {
      if (!ob.k.length) return `O${i + 1}: ${ob.n}\n  no key results yet`;
      const avg = ob.k.reduce((a, x) => a + x.sc, 0) / ob.k.length;
      return `O${i + 1}: ${ob.n}  -> ${r(avg, 2)} [${bar(avg)}]\n` + ob.k.map((x, j) => `  KR${j + 1}: ${x.n}  ${r(x.s)} -> ${r(x.t)}, now ${r(x.v)}  score ${r(x.sc, 2)} [${bar(x.sc)}]`).join('\n');
    }).join('\n\n') + '\n\nScore = (current - start) / (target - start), kept between 0 and 1; it works for targets that go down too. Some teams treat about 0.7 as a good result for stretch goals; others expect 1.0. Decide which before you start.';
  },
});

T.push({
  id: 'raci-matrix-builder', cat: PLAN, title: 'RACI Matrix Builder With Role Checks',
  desc: 'Turn tasks and role assignments into a RACI table and flag tasks with no accountable owner, several accountable owners or nobody responsible.',
  inputs: 1, labels: ['First line "People: a, b, c". Then one task per line: "Task: a=R, b=A, c=C"'], placeholder: ['People: Ana, Ben\nWrite spec: Ana=R, Ben=A'],
  sample: 'People: Ana, Ben, Chloe, Dev\nWrite spec: Ana=R, Ben=A, Chloe=C, Dev=I\nBuild feature: Dev=R, Ben=A, Ana=C\nRelease: Dev=R, Chloe=A, Ben=A\nAnnounce: Ana=C', opts: [],
  run: ([text]) => {
    const ls = lines(text), h = /^people\s*:\s*(.+)$/i.exec(ls[0] || '');
    if (!h) throw new Error('First line must be "People: name, name, ..."');
    const people = csv(h[1]).filter(Boolean); if (new Set(people).size !== people.length || people.length < 2) throw new Error('List at least two different people');
    const tasks = ls.slice(1).map((l) => {
      const i = l.lastIndexOf(':'); const j = l.indexOf(':'); const k = /=/.test(l.slice(0, j)) ? i : j;
      if (k < 1) throw new Error(`"${l}": use Task: person=R, person=A`);
      const a = {};
      for (const p of csv(l.slice(k + 1)).filter(Boolean)) { const mt = /^(.+?)\s*=\s*([RACI])$/i.exec(p); if (!mt) throw new Error(`"${p}": use name=R, A, C or I`); if (!people.includes(mt[1])) throw new Error(`"${mt[1]}" is not in the People list`); a[mt[1]] = mt[2].toUpperCase(); }
      return { n: l.slice(0, k).trim(), a };
    });
    if (!tasks.length) throw new Error('Add at least one task');
    const warn = [];
    for (const t of tasks) {
      const v = Object.values(t.a), A = v.filter((x) => x === 'A').length, R = v.filter((x) => x === 'R').length;
      if (A === 0) warn.push(`"${t.n}": no Accountable owner`); if (A > 1) warn.push(`"${t.n}": ${A} Accountable owners (should be one)`); if (R === 0) warn.push(`"${t.n}": nobody Responsible`);
    }
    const lo = people.map((p) => ({ p, c: tasks.filter((t) => t.a[p] === 'R' || t.a[p] === 'A').length }));
    return `${tbl(['Task', ...people], tasks.map((t) => [t.n, ...people.map((p) => t.a[p] || '-')]))}\n\nR = Responsible (does the work), A = Accountable (one owner who signs off), C = Consulted, I = Informed.\n${warn.length ? 'Review:\n' + warn.map((x) => '  ' + x).join('\n') : 'Every task has one Accountable owner and at least one Responsible person.'}\nTasks where each person is R or A: ${lo.map((x) => `${x.p} ${x.c}`).join(', ')}`;
  },
});

T.push({
  id: 'eisenhower-matrix-planner', cat: 'Time & Productivity', title: 'Eisenhower Matrix Planner (Urgent and Important Sorter)',
  desc: 'Sort a task list into do now, schedule, delegate and drop from the urgent and important flags you type, with no dragging needed.',
  inputs: 1, labels: ['Tasks: "task | flags" where flags are u (urgent) and/or i (important)'], placeholder: ['Fix outage | u i'],
  sample: 'Fix checkout bug | u i\nPlan Q4 roadmap | i\nAnswer routine emails | u\nCheck social feeds\nPrepare board update | u i\nLearn a new tool | i', opts: [],
  run: ([text]) => {
    const q = { 'Do now (urgent and important)': [], 'Schedule (important, not urgent)': [], 'Delegate (urgent, not important)': [], 'Drop or limit (neither)': [] };
    const ks = Object.keys(q), ls = lines(text); if (!ls.length) throw new Error('Add at least one task');
    for (const l of ls) {
      const [t, f = ''] = l.split('|').map((x) => x.trim()); if (!t) throw new Error(`"${l}": the task name is empty`);
      const fl = f.toLowerCase().replace(/urgent/g, 'u').replace(/important/g, 'i'); if (/[^ui\s,&+]/.test(fl)) throw new Error(`"${l}": flags can only be u and i`);
      q[ks[fl.includes('u') ? (fl.includes('i') ? 0 : 2) : (fl.includes('i') ? 1 : 3)]].push(t);
    }
    return ks.map((k) => `${k} (${q[k].length})\n${q[k].length ? q[k].map((x) => '  - ' + x).join('\n') : '  (none)'}`).join('\n\n') + '\n\nFlags are your judgement. If most tasks land in "Do now", the urgency flags are probably too generous.';
  },
});

// =====================================================================================
// BUSINESS: identifiers
// =====================================================================================
T.push({
  id: 'lei-code-validator', cat: GEN, title: 'LEI Code Validator and Parser (ISO 17442 Check Digits)',
  desc: 'Check the format and the two ISO 7064 check digits of 20-character Legal Entity Identifiers, and split out the issuer prefix and entity part. No registry lookup.',
  inputs: 1, labels: ['LEI codes, one per line'], placeholder: ['5493001KJTIIGC8Y1R12'], sample: '5493001KJTIIGC8Y1R12\n5493001KJTIIGC8Y1R13\n12345', opts: [],
  run: ([text]) => {
    const ls = lines(text); if (!ls.length) throw new Error('Enter at least one LEI');
    return ls.map((l) => {
      const s = l.replace(/\s/g, '').toUpperCase();
      if (!/^[A-Z0-9]{18}[0-9]{2}$/.test(s)) return `${l}: INVALID format (needs 18 letters or digits then 2 digits, ${s.length} characters found)`;
      let rem = 0; for (const ch of s) for (const d of String(parseInt(ch, 36))) rem = (rem * 10 + +d) % 97;
      const ok = rem === 1;
      return `${s}: ${ok ? 'check digits valid' : 'INVALID check digits'}\n  Prefix (issuer, 4): ${s.slice(0, 4)}  Reserved (2): ${s.slice(4, 6)}  Entity part (12): ${s.slice(6, 18)}  Check (2): ${s.slice(18)}`;
    }).join('\n') + '\n\nA valid check only proves the code is well formed, not that it is registered or active. Look the code up in the public GLEIF register to see the entity (this tool makes no network calls).';
  },
});

export default T;

// Tools from free-browser-tools.md, batch 14 (email marketing, marketing calculators). See TOOLS.md for the contract.
// Skipped (need network): MX lookup, live SPF/DMARC lookup, AI writers, holiday API, Wikipedia pageviews.
const T = [];
const M = 'Marketing';
const num = (id, label, def) => ({ id, label, type: 'number', def });
const txt = (id, label, def) => ({ id, label, type: 'text', def });
const chk = (id, label, def = false) => ({ id, label, type: 'checkbox', def });
const sel = (id, label, choices, def) => ({ id, label, type: 'select', choices, def: def ?? choices[0] });
const calc = (id, title, desc, opts, fn) => T.push({ id, cat: M, title, desc, inputs: 0, sample: '', opts, run: (_i, o) => fn(o) });
const lines = (s) => String(s || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f = (x, d = 2) => (Number.isFinite(x) ? Number(x.toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: d }) : 'n/a');
const pct = (x, d = 2) => (Number.isFinite(x) ? f(x * 100, d) + '%' : 'n/a');
const nz = (o, ...ks) => { for (const k of ks) if (!Number.isFinite(o[k]) || o[k] < 0) throw new Error(`Enter a number of 0 or more for "${k}"`); };
const pos = (o, ...ks) => { for (const k of ks) if (!Number.isFinite(o[k]) || o[k] <= 0) throw new Error(`"${k}" must be greater than 0`); };
const div = (a, b) => (b > 0 ? a / b : NaN);
const bar = (share, w = 30) => '#'.repeat(Math.round(Math.max(0, Math.min(1, share)) * w));
const csvCell = (s) => (/[",\n]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
const title = (s) => s.replace(/\b([a-z])([a-z']*)/gi, (_, a, b) => a.toUpperCase() + b.toLowerCase());

// ---------- shared: spam words, email parsing ----------
// Common trigger phrases collected from public deliverability advice. A heuristic, not any real filter's rule set.
const SPAM = ['free', 'free gift', 'free trial', 'free money', '100% free', 'act now', 'apply now', 'order now', 'buy now', 'click here', 'click below', 'call now', 'limited time', 'limited offer', 'offer expires', 'urgent', 'hurry', "don't miss", 'last chance', 'final notice', 'guarantee', 'guaranteed', '100% guaranteed', 'money back', 'no obligation', 'no risk', 'risk free', 'no cost', 'no fees', 'no credit check', 'winner', 'you won', "you've been selected", 'congratulations', 'cash', 'cash bonus', 'earn money', 'earn extra cash', 'make money', 'extra income', 'work from home', 'be your own boss', 'double your', 'increase sales', 'incredible deal', 'amazing', 'miracle', 'lowest price', 'best price', 'cheap', 'discount', 'save big', 'bargain', 'special promotion', 'exclusive deal', 'once in a lifetime', 'what are you waiting for', 'while supplies last', 'this is not spam', 'not spam', 'unsubscribe', 'dear friend', 'credit card', 'lose weight', 'weight loss', 'viagra', 'casino', 'lottery', 'investment', 'million dollars', 'billion', 'prize', 'bonus', 'promise you', 'pre-approved', 'refinance', 'debt', 'eliminate debt', 'instant', 'increase traffic', 'no questions asked', 'satisfaction guaranteed', 'trial', 'sign up free', 'get paid', 'income', 'password', 'verify your account', 'act immediately', 'expires today', 'only $', 'as seen on', 'fast cash', 'online pharmacy', 'cures', 'online degree'];
const spamRe = (() => { const parts = [...SPAM].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); return new RegExp('(?<![\\p{L}\\p{N}])(' + parts.join('|') + ')(?![\\p{L}\\p{N}])', 'giu'); })();
const spamHits = (s) => [...String(s).matchAll(spamRe)].map((m) => ({ w: m[0], i: m.index }));

const LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i;
function checkAddr(a) {
  const at = a.lastIndexOf('@');
  if (at < 1) return 'no @ or empty local part';
  const l = a.slice(0, at), d = a.slice(at + 1);
  if (/[^\x00-\x7f]/.test(a)) return 'non-ASCII address (review)';
  if (a.length > 254) return 'longer than 254 characters';
  if (l.length > 64) return 'local part longer than 64 characters';
  if (!LOCAL.test(l)) return 'invalid characters or dots in local part';
  const ls = d.split('.');
  if (ls.length < 2) return 'domain has no dot';
  if (!ls.every((x) => x.length <= 63 && LABEL.test(x))) return 'invalid domain';
  if (!/^([a-z]{2,}|xn--[a-z0-9-]+)$/i.test(ls[ls.length - 1])) return 'invalid top-level domain';
  return '';
}
function tokens(text) {
  const t = String(text).replace(/"[^"]*"\s*<([^>]*)>|[^\n,;<]*<([^>]*)>/g, (m, a, b) => ' ' + (a || b) + ' ');
  return t.split(/[\s,;]+/).map((x) => x.replace(/^[<"'()]+|[>"'().]+$/g, '')).filter(Boolean);
}
const TYPO = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com', 'gmil.com': 'gmail.com', 'gmeil.com': 'gmail.com', 'googlemail.con': 'googlemail.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotnail.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'homail.com': 'hotmail.com', 'hotamil.com': 'hotmail.com', 'hitmail.com': 'hotmail.com',
  'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahou.com': 'yahoo.com', 'yhoo.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'yahho.com': 'yahoo.com', 'yaoo.com': 'yahoo.com',
  'outlok.com': 'outlook.com', 'outllok.com': 'outlook.com', 'outook.com': 'outlook.com', 'outlook.co': 'outlook.com', 'oulook.com': 'outlook.com', 'outlookk.com': 'outlook.com',
  'iclould.com': 'icloud.com', 'icoud.com': 'icloud.com', 'icloud.co': 'icloud.com', 'iclod.com': 'icloud.com', 'aol.co': 'aol.com', 'msn.co': 'msn.com', 'live.co': 'live.com', 'protonmail.co': 'protonmail.com' };
const TLDFIX = { con: 'com', cmo: 'com', ocm: 'com', vom: 'com', comm: 'com', cim: 'com', xom: 'com' };
function fixDomain(d) {
  if (TYPO[d]) return TYPO[d];
  const p = d.split('.');
  if (p.length >= 2 && TLDFIX[p[p.length - 1]]) return [...p.slice(0, -1), TLDFIX[p[p.length - 1]]].join('.');
  return d;
}
// Well-known throwaway providers. Short and not exhaustive; not checked against a published list.
const DISPOSABLE = new Set(['mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz', 'guerrillamail.de', 'sharklasers.com', 'grr.la', 'guerrillamailblock.com', '10minutemail.com', '10minutemail.net', '20minutemail.com', 'temp-mail.org', 'tempmail.com', 'temp-mail.io', 'tempmailo.com', 'tempmail.net', 'tempinbox.com', 'yopmail.com', 'yopmail.net', 'yopmail.fr', 'trashmail.com', 'trashmail.net', 'trashmail.de', 'throwawaymail.com', 'getnada.com', 'nada.email', 'maildrop.cc', 'dispostable.com', 'fakeinbox.com', 'moakt.com', 'mintemail.com', 'mailnesia.com', 'spambox.us', 'emailondeck.com', 'mohmal.com', 'mytemp.email', 'mailcatch.com', 'mailnull.com', 'spamgourmet.com', 'discard.email', 'getairmail.com', 'burnermail.io', 'mailtemp.net', 'tmpmail.org', 'tmpmail.net', 'dropmail.me', 'fakemail.net', 'mail-temporary.com', 'anonbox.net', 'jetable.org', 'harakirimail.com', 'inboxkitten.com', 'emailfake.com', 'spam4.me', 'tempr.email', 'luxusmail.org', 'mailforspam.com', 'trbvm.com', 'mvrht.net', 'owlymail.com', 'tempail.com', 'throwam.com', 'zetmail.com', 'e4ward.com', 'mailexpire.com', 'meltmail.com', 'incognitomail.com', 'mailmoat.com', 'sneakemail.com', 'spamex.com', 'tempemail.net', 'wegwerfmail.de', 'wegwerfmail.net', 'einrot.com']);

// ---------- 932 subject line tester ----------
T.push({
  id: 'email-subject-line-tester', cat: M, title: 'Email Subject Line Tester (Score and Notes)',
  desc: 'Score an email subject line out of 100 for length, spam words, caps, punctuation, personalisation and more, with specific notes for each point. Heuristic rules, one subject per line.',
  labels: ['Subject lines (one per line)'], sample: "Quick question about {{first_name}}'s Q3 plan\nFREE!!! ACT NOW to WIN $$$ cash prize\nYour March invoice is ready",
  run: ([t]) => {
    const subs = String(t).split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
    if (!subs.length) throw new Error('Enter at least one subject line');
    return subs.map((raw) => {
      const s = raw.trim(); let score = 90; const n = [];
      const add = (d, m) => { score += d; n.push((d > 0 ? '+' : d < 0 ? '' : ' ') + (d || '') + (d ? '  ' : '') + m); };
      const len = [...s].length;
      if (len < 15) add(-10, `very short (${len} characters): little room to say what the email is about`);
      else if (len <= 40) add(0, `length ${len} characters: fits most mobile previews`);
      else if (len <= 60) add(-5, `${len} characters: the end may be cut on mobile (roughly 30 to 40 characters show)`);
      else add(-15, `${len} characters: likely truncated on mobile and some desktop clients`);
      if (s.split(/\s+/).length > 10) add(-5, 'more than 10 words');
      const hits = spamHits(s);
      if (hits.length) add(-Math.min(30, hits.length * 8), `spam trigger word${hits.length > 1 ? 's' : ''}: ${[...new Set(hits.map((h) => h.w.toLowerCase()))].join(', ')}`);
      const letters = s.replace(/[^\p{L}]/gu, ''), up = letters.replace(/[^\p{Lu}]/gu, '');
      const capsWords = (s.match(/\b[A-Z]{4,}\b/g) || []).length;
      if (letters.length > 8 && up.length / letters.length > 0.5) add(-15, 'mostly capital letters');
      else if (capsWords) add(-8, `${capsWords} ALL-CAPS word${capsWords > 1 ? 's' : ''} (review: acronyms are fine)`);
      if (/!{2,}|\?{2,}|[!?]{3,}/.test(s)) add(-10, 'repeated punctuation (!! or ??)');
      else if ((s.match(/!/g) || []).length === 1) add(0, 'one exclamation mark: fine, but avoid more');
      if (/\${2,}|€{2,}|£{2,}/.test(s)) add(-10, 'repeated currency symbols');
      const emoji = (s.match(/\p{Extended_Pictographic}/gu) || []).length;
      if (emoji > 2) add(-5, `${emoji} emoji: more than two can look like a promotion`);
      if (/^(re|fw|fwd):/i.test(s)) add(-15, 'starts with Re: or Fwd: (looks like a fake reply)');
      if (/(\{\{.+?\}\}|\[\[.+?\]\]|%%.+?%%|\*\|.+?\|\*|\{[a-z_]+\}|\[(first|last)\s?name\])/i.test(s)) add(10, 'contains a personalisation tag');
      else n.push('  no personalisation tag: optional, a first name or company can help');
      if (/\d/.test(s)) n.push('  has a number: specific numbers often read as concrete');
      if (/\?\s*$/.test(s)) n.push('  ends with a question: works when it is a real question');
      if (/https?:\/\/|www\./i.test(s)) add(-8, 'contains a link');
      if (raw !== raw.trimStart()) add(-2, 'leading space');
      score = Math.max(0, Math.min(100, score));
      return `"${s}"\nScore: ${score}/100\n${n.map((x) => '  ' + x).join('\n')}`;
    }).join('\n\n') + '\n\nHeuristic only: a rule-based score from common advice, not a measurement of real opens. Test with your own audience.';
  },
});

// ---------- 933 preheader previewer ----------
T.push({
  id: 'email-preheader-previewer', cat: M, title: 'Subject and Preheader Inbox Previewer',
  desc: 'See how a sender name, subject and preheader may be cut off in a mock desktop and mobile inbox row (Gmail, Outlook and iPhone Mail styles). Widths are approximations.',
  inputs: 2, labels: ['Subject', 'Preheader text'], sample: 'Your spring plan is ready: three steps to get started this week', sample2: 'Open to see the checklist and the two dates you should not miss before Friday.',
  opts: [txt('sender', 'Sender name', 'Anna from Acme')],
  run: ([s, p], o) => {
    s = String(s).trim(); p = String(p).trim();
    if (!s) throw new Error('Enter a subject');
    const rows = [['Gmail desktop', 680, 'sub-pre'], ['Outlook desktop', 560, 'sub-pre2'], ['iPhone Mail', 340, 'two']];
    const row = ([name, w, mode]) => {
      const sn = `<b style="display:inline-block;width:110px;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom">${esc(o.sender || 'Sender')}</b>`;
      let body;
      if (mode === 'two') body = `<div style="width:${w}px;padding:6px 8px;box-sizing:border-box"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(o.sender || 'Sender')}</div><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s)}</div><div style="color:#666;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(p || '(no preheader: the client shows the first text of the email)')}</div></div>`;
      else body = `<div style="width:${w}px;padding:6px 8px;box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sn} <b>${esc(s)}</b><span style="color:#666"> - ${esc(p || '(no preheader: the client shows the first text of the email)')}</span></div>`;
      return `<h2 style="font-size:1rem;margin:1em 0 .3em">${name} (about ${w}px wide)</h2><div style="border:1px solid #999;border-radius:6px;width:${w}px;max-width:100%;background:#fff;color:#111;font:14px system-ui,sans-serif">${body}</div>`;
    };
    const note = `<p style="font:14px system-ui,sans-serif;color:#444">Subject: ${[...s].length} characters. Preheader: ${[...p].length} characters. ${[...s].length > 40 ? 'The subject is long for mobile (about 30 to 40 characters usually show). ' : ''}${!p ? 'No preheader set. ' : [...p].length < 40 ? 'Preheader is short: clients may fill the gap with other text. ' : [...p].length > 130 ? 'Preheader is long: most of it will be cut. ' : ''}Real clients vary by font, window width and settings, so treat this as a guide.</p>`;
    return { html: `<!doctype html><meta charset="utf-8"><title>Inbox preview</title><body style="margin:12px;font-family:system-ui,sans-serif;color:CanvasText;background:Canvas">${rows.map(row).join('')}${note}</body>` };
  },
});

// ---------- 934 spam trigger word checker ----------
T.push({
  id: 'spam-trigger-word-checker', cat: M, title: 'Spam Trigger Word Checker (Subject and Body)',
  desc: 'Highlight words and phrases in an email subject and body that are often cited as spam triggers, with a count and a list. A word list heuristic, not a real spam filter.',
  inputs: 2, labels: ['Subject', 'Body'], sample: 'Last chance: free trial ends today', sample2: 'Hi Sam,\n\nAct now and get a free trial of the new planner. Limited time offer, no obligation. Click here to see the details.\n\nThanks,\nAnna',
  run: ([s, b]) => {
    if (!String(s).trim() && !String(b).trim()) throw new Error('Enter a subject or a body');
    const mark = (txt) => { const ms = spamHits(txt); let out = '', last = 0; for (const m of ms) { out += esc(txt.slice(last, m.i)) + '<mark>' + esc(m.w) + '</mark>'; last = m.i + m.w.length; } return [out + esc(txt.slice(last)), ms]; };
    const [hs, ms] = mark(String(s)), [hb, mb] = mark(String(b));
    const all = [...ms, ...mb], uniq = {};
    for (const h of all) uniq[h.w.toLowerCase()] = (uniq[h.w.toLowerCase()] || 0) + 1;
    const list = Object.entries(uniq).sort((a, c) => c[1] - a[1]).map(([w, c]) => `<li>${esc(w)} x ${c}</li>`).join('');
    return { html: `<!doctype html><meta charset="utf-8"><title>Spam word check</title><body style="margin:12px;font:15px/1.5 system-ui,sans-serif;color:CanvasText;background:Canvas"><style>mark{background:#ffd54a;color:#000;padding:0 2px}</style><p role="status"><b>${all.length}</b> trigger match${all.length === 1 ? '' : 'es'} (${Object.keys(uniq).length} different): ${ms.length} in the subject, ${mb.length} in the body.</p><h2 style="font-size:1rem">Subject</h2><p>${hs || '(empty)'}</p><h2 style="font-size:1rem">Body</h2><p style="white-space:pre-wrap">${hb || '(empty)'}</p>${list ? `<h2 style="font-size:1rem">Matches</h2><ul>${list}</ul>` : ''}<p style="color:#555">A match is a prompt to review, not a verdict. Modern filters weigh sender reputation, authentication and engagement far more than single words.</p></body>` };
  },
});

// ---------- 935-938 campaign rates ----------
calc('email-campaign-rates', 'Email Campaign Rates Calculator (Open, Click, Bounce, Unsubscribe)', 'Open rate, click-through rate, click-to-open rate, hard and soft bounce rate, unsubscribe and complaint rate from your campaign counts, with review flags.',
  [num('sent', 'Emails sent', 10000), num('hard', 'Hard bounces', 40), num('soft', 'Soft bounces', 110), num('delivered', 'Delivered (0 = sent minus bounces)', 0), num('opened', 'Unique opens', 2300), num('clicked', 'Unique clicks', 280), num('unsub', 'Unsubscribes', 25), num('spam', 'Spam complaints', 4)],
  (o) => {
    nz(o, 'sent', 'hard', 'soft', 'delivered', 'opened', 'clicked', 'unsub', 'spam'); pos(o, 'sent');
    const d = o.delivered || o.sent - o.hard - o.soft;
    if (d <= 0) throw new Error('Delivered must be above 0: check sent and bounce counts');
    if (o.delivered > o.sent) throw new Error('Delivered cannot be more than sent');
    if (o.opened > d || o.clicked > d) throw new Error('Opens and clicks cannot be more than delivered (use unique counts)');
    const L = [];
    L.push(`Delivered: ${f(d, 0)} (${pct(d / o.sent)} of sent)`);
    L.push(`Open rate: ${pct(o.opened / d)}  (unique opens / delivered)`);
    L.push(`Click-through rate (CTR): ${pct(o.clicked / d)}  (unique clicks / delivered)`);
    L.push(`Click-to-open rate (CTOR): ${pct(div(o.clicked, o.opened))}  (unique clicks / unique opens)`);
    L.push(`Hard bounce rate: ${pct(o.hard / o.sent)}   Soft bounce rate: ${pct(o.soft / o.sent)}   Total: ${pct((o.hard + o.soft) / o.sent)}`);
    L.push(`Unsubscribe rate: ${pct(o.unsub / d)}`);
    L.push(`Spam complaint rate: ${pct(o.spam / d, 3)}`);
    L.push('', 'Review flags:');
    const fl = [];
    if ((o.hard + o.soft) / o.sent > 0.02) fl.push('Bounce rate is above 2%, a common rule of thumb. Clean the list and check where the addresses came from.');
    if (o.hard / o.sent > 0.005) fl.push('Hard bounces above 0.5%: remove those addresses now.');
    if (o.spam / d >= 0.003) fl.push('Complaint rate is 0.3% or higher. Google asks bulk senders to never reach 0.3%.');
    else if (o.spam / d >= 0.001) fl.push('Complaint rate is at or above 0.1%. Google asks bulk senders to keep it below 0.1%.');
    if (o.unsub / d > 0.005) fl.push('Unsubscribe rate above 0.5% is often seen as high (rule of thumb, varies by industry).');
    L.push(...(fl.length ? fl.map((x) => '  - ' + x) : ['  - none of the checked limits are exceeded']));
    L.push('', 'Open counts are inflated by Apple Mail Privacy Protection and image blocking, so compare your own campaigns over time rather than against industry averages. The 0.1% and 0.3% complaint limits come from Google\'s email sender guidelines (support.google.com/a/answer/14229414, read in October 2026); the 2% bounce and 0.5% unsubscribe figures are common rules of thumb, not rules.');
    return L.join('\n');
  });

// ---------- 939 list growth ----------
calc('email-list-growth-calculator', 'Email List Growth Calculator (Net Growth Rate)', 'Net email list growth for a period from starting size, new signups, unsubscribes, bounces and complaints, as a number and a percentage, with a projection.',
  [num('start', 'List size at start', 10000), num('add', 'New subscribers', 650), num('unsub', 'Unsubscribes', 180), num('bounce', 'Removed bounces', 90), num('spam', 'Complaints removed', 6), num('periods', 'Periods to project', 12)],
  (o) => {
    nz(o, 'start', 'add', 'unsub', 'bounce', 'spam', 'periods'); pos(o, 'start');
    const lost = o.unsub + o.bounce + o.spam, net = o.add - lost, end = o.start + net, r = net / o.start;
    const L = [`End size: ${f(end, 0)}`, `Net growth: ${net >= 0 ? '+' : ''}${f(net, 0)} (${pct(r)})`, `Gross growth: ${pct(o.add / o.start)}   Churn (lost / start): ${pct(lost / o.start)}`, `Subscribers lost: ${f(lost, 0)} (${f(o.unsub, 0)} unsubscribes, ${f(o.bounce, 0)} bounces, ${f(o.spam, 0)} complaints)`];
    if (o.periods >= 1) { let s = o.start; const n = Math.min(60, Math.floor(o.periods)); L.push('', `If the same net growth rate (${pct(r)} per period) held for ${n} periods:`); for (let i = 1; i <= n; i++) { s *= 1 + r; if (i <= 3 || i === n) L.push(`  period ${i}: ${f(s, 0)}`); else if (i === 4) L.push('  ...'); } }
    return L.join('\n');
  });

// ---------- 940 email ROI ----------
calc('email-marketing-roi-calculator', 'Email Campaign Revenue and ROI Estimator', 'Project revenue and ROI of an email campaign from list size, open, click and conversion rates, order value and costs.',
  [num('list', 'List size (delivered)', 20000), num('open', 'Open rate %', 22), num('ctor', 'Click rate, % of opens', 12), num('conv', 'Conversion rate, % of clicks', 4), num('aov', 'Average order value', 70), num('margin', 'Gross margin % (0 = ignore)', 0), num('cost', 'Campaign cost (tool, design, time)', 400)],
  (o) => {
    nz(o, 'list', 'open', 'ctor', 'conv', 'aov', 'margin', 'cost'); pos(o, 'list');
    const opens = o.list * o.open / 100, clicks = opens * o.ctor / 100, orders = clicks * o.conv / 100, rev = orders * o.aov, base = o.margin > 0 ? rev * o.margin / 100 : rev, profit = base - o.cost;
    return [`Opens: ${f(opens, 0)}`, `Clicks: ${f(clicks, 0)}`, `Orders: ${f(orders, 1)}`, `Revenue: ${f(rev)}`, o.margin > 0 ? `Gross profit (${o.margin}% margin): ${f(base)}` : '', `Cost: ${f(o.cost)}`, `Net result: ${f(profit)}`, `ROI: ${o.cost > 0 ? pct(profit / o.cost, 1) : 'n/a (cost is 0)'}   (net result / cost${o.margin > 0 ? ', on gross profit' : ', on revenue'})`, `Revenue per email delivered: ${f(rev / o.list, 3)}`, `Cost per order: ${orders > 0 ? f(o.cost / orders) : 'n/a'}`, '', 'A projection from your assumptions, not a forecast. Replace the rates with your own past campaigns.'].filter((x) => x !== '').join('\n');
  });

// ---------- 941-943 address list tools ----------
function addrTool(id, ttl, desc, sample, opts, fn) {
  T.push({ id, cat: M, title: ttl, desc, labels: ['Email addresses (any separators, "Name <email>" works)'], sample, opts, run: ([t], o) => { const tk = tokens(t); if (!tk.length) throw new Error('Paste some email addresses'); return fn(tk, o); } });
}
addrTool('email-list-cleaner', 'Email List Cleaner (Dedupe, Lowercase, Validate)', 'Clean a pasted email list: split on any separator, lowercase, remove duplicates and syntax-invalid addresses, with a separate list of what was removed and why. Syntax only.',
  'Jane.Doe@Example.com; jane.doe@example.com\nsam@example.org, bad..dot@example.com\nAnna <anna@Example.net>\nnot-an-email\ntom@localhost', [chk('lower', 'Lowercase everything', true), chk('sort', 'Sort A to Z', false)],
  (tk, o) => {
    const seen = new Set(), ok = [], bad = [], dup = [];
    for (let a of tk) {
      if (o.lower) a = a.toLowerCase(); else { const i = a.lastIndexOf('@'); if (i > 0) a = a.slice(0, i) + '@' + a.slice(i + 1).toLowerCase(); }
      const why = checkAddr(a);
      if (why) { bad.push(`${a}    (${why})`); continue; }
      const k = a.toLowerCase();
      if (seen.has(k)) { dup.push(a); continue; }
      seen.add(k); ok.push(a);
    }
    if (o.sort) ok.sort();
    return `Clean list (${ok.length}):\n${ok.join('\n')}\n\nRemoved as invalid (${bad.length}):\n${bad.join('\n') || '-'}\n\nRemoved as duplicates (${dup.length}):\n${dup.join('\n') || '-'}\n\nSyntax check only. It cannot tell whether a mailbox exists. When not lowercasing, only the domain is lowercased, and duplicates are matched ignoring case.`;
  });
addrTool('email-domain-typo-fixer', 'Email Domain Typo Fixer (gmial.com, hotmial.com)', 'Fix common domain typos such as gmial.com, hotmial.com, yahooo.com and .con endings in a pasted address list, and see every change before you import.',
  'jane@gmial.com\nsam@hotmial.com\nanna@yahooo.com\ntom@outlook.con\nok@example.com', [chk('apply', 'Apply fixes in the output list', true)],
  (tk, o) => {
    const out = [], ch = [];
    for (const a of tk) {
      const i = a.lastIndexOf('@'); if (i < 1) { out.push(a); continue; }
      const d = a.slice(i + 1), nd = fixDomain(d.toLowerCase());
      if (nd !== d.toLowerCase()) { ch.push(`${a}  ->  ${a.slice(0, i)}@${nd}`); out.push(o.apply ? `${a.slice(0, i)}@${nd}` : a); } else out.push(a);
    }
    return `Changes (${ch.length}):\n${ch.join('\n') || '-'}\n\nList (${out.length}):\n${out.join('\n')}\n\nBuilt-in list of common typos for big providers and .con/.cmo/.ocm style endings. Always review: a rule can be wrong for an unusual real domain.`;
  });
addrTool('disposable-email-detector', 'Disposable Email Detector (Throwaway Domains)', 'Check pasted addresses against a built-in list of well-known disposable email providers like mailinator.com and yopmail.com. The list is short and not exhaustive.',
  'jane@gmail.com\nbot123@mailinator.com\nsam@yopmail.com\nanna@example.org', [],
  (tk) => {
    const rows = tk.map((a) => { const i = a.lastIndexOf('@'); const d = i > 0 ? a.slice(i + 1).toLowerCase() : ''; const hit = d && (DISPOSABLE.has(d) || [...DISPOSABLE].some((x) => d.endsWith('.' + x))); return [a, hit]; });
    const n = rows.filter((r) => r[1]).length;
    return `${n} of ${rows.length} on the built-in disposable list\n\n${rows.map(([a, h]) => `${h ? 'DISPOSABLE' : 'ok        '}  ${a}`).join('\n')}\n\nThe list has ${DISPOSABLE.size} well-known domains, written from general knowledge and not checked against a published list. New throwaway domains appear daily, so "ok" does not mean real.`;
  });

// ---------- 947 mailto ----------
T.push({
  id: 'mailto-link-generator', cat: M, title: 'Mailto Link Generator (Subject, Body, CC, BCC)',
  desc: 'Build a mailto: link with prefilled recipients, CC, BCC, subject and body, correctly percent-encoded, plus an HTML anchor tag ready to paste.',
  inputs: 1, labels: ['Body (optional, line breaks are kept)'], sample: 'Hi team,\n\nI would like to book a demo.\n\nThanks',
  opts: [txt('to', 'To (comma separated)', 'sales@example.com'), txt('cc', 'CC', 'boss@example.com'), txt('bcc', 'BCC', ''), txt('subject', 'Subject', 'Demo request & pricing'), txt('text', 'Link text', 'Email us')],
  run: ([body], o) => {
    const addrs = (s) => String(s || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    const to = addrs(o.to), cc = addrs(o.cc), bcc = addrs(o.bcc);
    if (!to.length && !cc.length && !bcc.length) throw new Error('Enter at least one address');
    for (const a of [...to, ...cc, ...bcc]) if (checkAddr(a)) throw new Error(`"${a}" does not look like an email address`);
    const enc = (s) => encodeURIComponent(s).replace(/%40/g, '@').replace(/%2C/gi, ',');
    const q = [];
    if (cc.length) q.push('cc=' + cc.map(enc).join(','));
    if (bcc.length) q.push('bcc=' + bcc.map(enc).join(','));
    if (o.subject) q.push('subject=' + encodeURIComponent(o.subject));
    const b = String(body || '').replace(/\r?\n/g, '\r\n'); if (b.trim()) q.push('body=' + encodeURIComponent(b));
    const href = 'mailto:' + to.map(enc).join(',') + (q.length ? '?' + q.join('&') : '');
    return `${href}\n\n<a href="${esc(href)}">${esc(o.text || 'Email us')}</a>\n\nLength: ${href.length} characters. Keep links under about 2000 characters: some mail clients and browsers cut or refuse longer ones. Line breaks in the body are encoded as %0D%0A as RFC 6068 describes.`;
  },
});

// ---------- 948 fatigue ----------
calc('email-frequency-fatigue-estimator', 'Email Send Frequency Fatigue Estimator', 'A simple what-if model: how more emails per week may change open rate, unsubscribes and list size month by month. You set the assumptions; it is not a prediction.',
  [num('list', 'List size now', 20000), num('open', 'Open rate % at current frequency', 24), num('cur', 'Sends per week now', 1), num('plan', 'Planned sends per week', 3), num('unsub', 'Unsubscribe % per send now', 0.15), num('openDrop', 'Relative open-rate drop per extra weekly send %', 8), num('unsubRise', 'Relative unsubscribe rise per extra weekly send %', 25), num('signups', 'New subscribers per month', 400), num('months', 'Months', 6)],
  (o) => {
    nz(o, 'list', 'open', 'cur', 'plan', 'unsub', 'openDrop', 'unsubRise', 'signups', 'months'); pos(o, 'list', 'cur', 'plan');
    const extra = o.plan - o.cur, op = Math.max(0.01, o.open / 100 * Math.pow(1 - o.openDrop / 100, extra)), un = o.unsub / 100 * Math.pow(1 + o.unsubRise / 100, extra), m = Math.min(36, Math.floor(o.months) || 1);
    const run = (sends, openR, unR) => { let s = o.list, opens = 0, lost = 0; const rows = []; for (let i = 1; i <= m; i++) { const n = sends * 52 / 12, lm = s * (1 - Math.pow(1 - unR, n)); opens += s * openR * n; lost += lm; s = s - lm + o.signups; rows.push([i, s, opens, lost]); } return rows; };
    const a = run(o.cur, o.open / 100, o.unsub / 100), b = run(o.plan, op, un);
    const L = [`Assumed open rate at ${o.plan}/week: ${pct(op)} (now ${o.open}% at ${o.cur}/week)`, `Assumed unsubscribe per send at ${o.plan}/week: ${pct(un, 3)} (now ${o.unsub}%)`, '', 'Month  List(now freq)  List(plan)  Opens total(now)  Opens total(plan)'];
    for (let i = 0; i < m; i++) L.push(`${String(i + 1).padStart(5)}  ${f(a[i][1], 0).padStart(14)}  ${f(b[i][1], 0).padStart(10)}  ${f(a[i][2], 0).padStart(16)}  ${f(b[i][2], 0).padStart(17)}`);
    const A = a[m - 1], B = b[m - 1];
    L.push('', `After ${m} months: list ${f(B[1] - A[1], 0)} vs staying at ${o.cur}/week, total opens ${f(B[2] - A[2], 0)} (${pct(div(B[2] - A[2], A[2]), 1)}), unsubscribes ${f(B[3] - A[3], 0)} more.`, '', 'The two "relative" percentages are your guesses, applied per extra weekly send. Measure them with a test on a part of your list before trusting any output. Opens are not revenue.');
    return L.join('\n');
  });

// ---------- 949 time zone planner (shared tz helpers) ----------
function tzOffsetMs(utcMs, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(utcMs / 1000) * 1000;
}
function zonedToUtc(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi); let u = guess - tzOffsetMs(guess, tz); u = guess - tzOffsetMs(u, tz); return u;
}
const parseDate = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim()); if (!m) throw new Error('Date must look like 2025-03-18'); const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); if (d.getUTCMonth() !== +m[2] - 1) throw new Error('That date does not exist'); return [+m[1], +m[2], +m[3]]; };
const parseTime = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim()); if (!m || +m[1] > 23 || +m[2] > 59) throw new Error('Time must look like 09:30 (24 hour)'); return [+m[1], +m[2]]; };
const checkTz = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { throw new Error(`Unknown time zone "${tz}". Use names like Europe/Paris`); } };
T.push({
  id: 'email-send-time-zone-planner', cat: M, title: 'Email Send Time Zone Planner (Local Arrival Times)',
  desc: 'Enter the time you plan to send a campaign and your subscriber time zones to see the local arrival time in each, with overnight arrivals flagged. Daylight saving is applied for the chosen date.',
  labels: ['Subscriber regions (one per line: IANA zone, optional "Label | zone")'], sample: 'America/New_York\nAmerica/Los_Angeles\nEurope/London\nAsia/Kolkata\nAsia/Tokyo\nAustralia/Sydney',
  opts: [txt('from', 'Your time zone', 'Europe/Brussels'), txt('date', 'Send date (YYYY-MM-DD)', '2025-03-18'), txt('time', 'Send time (24 h)', '09:00'), txt('quiet', 'Overnight hours (start-end)', '22-7')],
  run: ([t], o) => {
    const ls = lines(t); if (!ls.length) throw new Error('Enter at least one time zone');
    checkTz(o.from); const [y, mo, d] = parseDate(o.date), [h, mi] = parseTime(o.time);
    const q = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(o.quiet.trim()); if (!q) throw new Error('Overnight hours look like 22-7'); const qs = +q[1], qe = +q[2];
    const u = zonedToUtc(y, mo, d, h, mi, o.from);
    const rows = ls.map((l) => {
      const [a, b] = l.includes('|') ? l.split('|').map((x) => x.trim()) : [l, l]; checkTz(b);
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: b, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(u)).map((x) => [x.type, x.value]));
      const hh = +p.hour, night = qs > qe ? hh >= qs || hh < qe : hh >= qs && hh < qe;
      const off = tzOffsetMs(u, b) / 60000, sg = off < 0 ? '-' : '+', ao = Math.abs(off);
      return [a, `${p.weekday} ${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`, `UTC${sg}${String(Math.floor(ao / 60)).padStart(2, '0')}:${String(ao % 60).padStart(2, '0')}`, night ? 'overnight (review)' : ''];
    });
    const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
    return `Send: ${o.date} ${o.time} in ${o.from}  (= ${new Date(u).toISOString().slice(0, 16).replace('T', ' ')} UTC)\n\n` + rows.map((r) => r.map((c, i) => (i < 3 ? c.padEnd(w[i]) : c)).join('  ').trimEnd()).join('\n') + `\n\nOvernight means ${qs}:00 to ${qe}:00 local. Subscribers open emails when they like, so arrival time is a guide.`;
  },
});

// ---------- 950 drip cadence ----------
T.push({
  id: 'email-drip-cadence-planner', cat: M, title: 'Email Drip Sequence Cadence Planner (Send Dates)',
  desc: 'List the emails in a drip sequence with delays such as "2 days after signup" or "3 days after previous" and get a timeline with exact send dates from a chosen start date.',
  labels: ['Emails: Name | delay (e.g. "2 days after signup", "3 days after previous", "1 week after Offer")'], sample: 'Welcome | 0\nGetting started tips | 2 days after signup\nCase study | 3 days after previous\nOffer | 2 days after previous\nLast chance | 1 day after Offer',
  opts: [txt('start', 'Start (signup) date', '2025-03-17'), txt('time', 'Send time (24 h)', '09:00'), chk('weekends', 'Move weekend sends to Monday', false)],
  run: ([t], o) => {
    const [y, mo, d] = parseDate(o.start), [hh, mm] = parseTime(o.time), ls = lines(t); if (!ls.length) throw new Error('Add at least one email');
    const t0 = Date.UTC(y, mo - 1, d, hh, mm), U = { h: 3600e3, d: 864e5, w: 6048e5 }, at = [], names = [];
    const rows = ls.map((l, i) => {
      const [nm, spec = '0'] = l.split('|').map((x) => x.trim()); const m = /^(\d+(?:\.\d+)?)\s*(h|hours?|d|days?|w|weeks?)?\s*(?:after\s+(.+))?$/i.exec(spec);
      if (!m) throw new Error(`Line ${i + 1}: could not read the delay "${spec}"`);
      const amt = +m[1] * U[(m[2] || 'd')[0].toLowerCase()], ref = (m[3] || 'previous').trim().toLowerCase();
      let base;
      if (ref === 'previous') base = i ? at[i - 1] : t0; else if (/^(signup|sign-up|start|subscribe|subscription|joining|trigger)/.test(ref)) base = t0;
      else { const j = names.findIndex((n) => n.startsWith(ref)); if (j < 0 || j >= i) throw new Error(`Line ${i + 1}: "${ref}" is not an earlier email`); base = at[j]; }
      let when = base + amt;
      if (o.weekends) { const wd = new Date(when).getUTCDay(); if (wd === 6) when += 2 * U.d; else if (wd === 0) when += U.d; }
      at.push(when); names.push(nm.toLowerCase());
      const dt = new Date(when);
      return [String(i + 1), nm, spec, dt.toISOString().slice(0, 10) + ' ' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()] + ' ' + dt.toISOString().slice(11, 16), 'day ' + f((when - t0) / U.d, 1)];
    });
    const head = ['#', 'Email', 'Delay', 'Send', 'Since start']; const w = head.map((_, i) => Math.max(head[i].length, ...rows.map((r) => r[i].length)));
    return [head, ...rows].map((r) => r.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd()).join('\n') + '\n\nTimes are in the time zone you plan the sends in (no zone conversion). A delay of "after previous" counts from the previous email\'s send time.';
  },
});

// ---------- 952 newsletter names ----------
const WORDS = (s) => title(String(s).trim().replace(/\s+/g, ' '));
T.push({
  id: 'newsletter-name-generator', cat: M, title: 'Newsletter Name Generator (from Topic and Audience)',
  desc: 'Get newsletter name ideas from your topic and audience, built from common patterns like "The Weekly Topic", "Topic Digest" and "Audience Brief". Template based, no AI.',
  inputs: 1, labels: ['Topic words (one topic per line)'], sample: 'product design\nremote work',
  opts: [txt('audience', 'Audience (optional)', 'founders'), sel('freq', 'Rhythm', ['Weekly', 'Daily', 'Monthly', 'none'], 'Weekly')],
  run: ([t], o) => {
    const tp = lines(t).map(WORDS); if (!tp.length) throw new Error('Enter a topic');
    const au = o.audience.trim() ? WORDS(o.audience) : '', fr = o.freq === 'none' ? '' : o.freq, out = [];
    for (const x of tp) {
      if (fr) out.push(`The ${fr} ${x}`, `${x} ${fr === 'Daily' ? 'Daily' : fr === 'Monthly' ? 'Monthly' : 'Weekly'}`);
      out.push(`${x} Digest`, `${x} Briefing`, `The ${x} Dispatch`, `The ${x} Letter`, `${x} Notes`, `${x} Insider`, `${x} Roundup`, `The ${x} Playbook`, `Inside ${x}`, `${x} in Brief`, `${x} Signal`, `The ${x} Brief`);
      if (au) out.push(`${x} for ${au}`, `The ${au} ${x} Digest`, `The ${x} Brief for ${au}`, `${au} ${fr || 'Weekly'}: ${x}`);
    }
    if (au) out.push(`The ${au} Brief`, `${au} Digest`, `Dear ${au}`, `The ${au} Newsletter`);
    const u = [...new Set(out)];
    return u.join('\n') + `\n\n${u.length} ideas. Check that the name is free as a domain, on your platform and in a web search before you commit; this tool cannot check that.`;
  },
});

// ---------- 955 deliverability checklist (custom UI) ----------
const DELIV = [['Authentication', ['SPF record published and under 10 DNS lookups', 'DKIM signing enabled for your sending domain (2048-bit key if possible)', 'DMARC record published (start with p=none, move to quarantine or reject)', 'From domain aligns with the SPF/DKIM domain', 'Reverse DNS (PTR) set for dedicated sending IPs', 'Sending from a subdomain separate from your main mail, if volume is high']],
  ['List hygiene', ['Double opt-in or confirmed consent for new subscribers', 'Hard bounces removed right after each send', 'Unengaged subscribers removed or sent a re-engagement series', 'No purchased or scraped lists', 'Signup forms protected against bots', 'Role addresses (info@, sales@) and typos reviewed']],
  ['Sending practice', ['Domain and IP warmed up gradually when new', 'Steady volume, no sudden large spikes', 'Spam complaint rate monitored (Google: keep below 0.1%, never reach 0.3%)', 'Postmaster tools set up for the major mailbox providers', 'Consistent From name and address']],
  ['Content and format', ['Clear one-click unsubscribe link in every marketing email', 'List-Unsubscribe and List-Unsubscribe-Post headers set (bulk senders)', 'Plain text version included', 'Reasonable image-to-text ratio and image alt text', 'No URL shorteners or mismatched link domains', 'Subject line honest and not all caps or full of spam words', 'Physical address and sender identity in the footer where the law asks for it', 'Message size kept small (Gmail clips long messages)']]];
T.push({
  id: 'email-deliverability-checklist', cat: M, title: 'Email Deliverability Checklist (Authentication, List, Content)',
  desc: 'A tick-off checklist for email authentication (SPF, DKIM, DMARC), list hygiene, sending practice and content. Progress is saved in this browser only.',
  custom: true, dom: true,
  render(root) {
    const KEY = 'ft-email-deliverability-v1'; let st = {}; try { st = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { st = {}; }
    const total = DELIV.reduce((a, s) => a + s[1].length, 0), h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, attrs); e.append(...kids); return e; };
    const stat = h('p', { role: 'status' }); stat.setAttribute('role', 'status'); root.append(stat);
    const upd = () => { const n = Object.values(st).filter(Boolean).length; stat.textContent = `${n} of ${total} done (${Math.round(n / total * 100)}%)`; };
    DELIV.forEach(([ttl, items], si) => {
      root.append(h('h2', {}, ttl));
      items.forEach((txt, ii) => { const k = si + '.' + ii, cb = h('input', { type: 'checkbox', checked: !!st[k], onchange: (e) => { st[k] = e.target.checked; try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* storage unavailable */ } upd(); } }); const lab = h('label', {}, cb, ' ', txt); lab.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin:4px 0'; root.append(lab); });
    });
    const rb = h('button', { type: 'button', onclick: () => { st = {}; root.querySelectorAll('input').forEach((i) => { i.checked = false; }); try { localStorage.setItem(KEY, '{}'); } catch { /* storage unavailable */ } upd(); } }, 'Reset all');
    root.append(h('p', {}, rb), h('p', {}, 'A starting list, not a guarantee of inbox placement. Requirements differ by mailbox provider and change over time. Check current Google and Yahoo sender requirements.'));
    upd();
  },
});

// ---------- 956 subscriber value ----------
calc('email-subscriber-value-calculator', 'Email Subscriber Lifetime Value Calculator', 'Estimate what one email subscriber is worth: yearly email revenue divided by list size, times the average time a subscriber stays, with the value of a lost subscriber.',
  [num('rev', 'Revenue from email per year', 120000), num('list', 'Average list size', 30000), num('months', 'Average months a subscriber stays', 24), num('margin', 'Gross margin % (0 = use revenue)', 0), num('acq', 'Cost to acquire one subscriber (optional)', 2)],
  (o) => {
    nz(o, 'rev', 'list', 'months', 'margin', 'acq'); pos(o, 'list', 'months');
    const y = o.rev / o.list, m = y / 12, base = o.margin > 0 ? o.margin / 100 : 1, v = m * o.months * base;
    return [`Revenue per subscriber per year: ${f(y)}`, `Per month: ${f(m, 3)}`, `Value over ${o.months} months${o.margin > 0 ? ' (gross profit)' : ''}: ${f(v)}`, o.acq > 0 ? `Acquisition cost: ${f(o.acq)}  ->  value to cost ratio ${f(v / o.acq, 1)} : 1, payback in ${f(o.acq / (m * base), 1)} months` : '', '', 'An average over the whole list. Buyers are worth far more than readers, so split by segment if you can.'].filter((x) => x !== '').join('\n');
  });

// ---------- 957 out of office ----------
T.push({
  id: 'out-of-office-message-generator', cat: M, title: 'Out-of-Office Message Generator (Email Auto-Reply)',
  desc: 'Write an out-of-office auto-reply with away dates, return date and a backup contact, in a formal, friendly or short version, ready to copy into Gmail or Outlook.',
  inputs: 0, sample: '',
  opts: [txt('name', 'Your name', 'Sam Lee'), txt('from', 'Away from (YYYY-MM-DD)', '2025-07-21'), txt('back', 'Back on (YYYY-MM-DD)', '2025-08-04'), txt('backup', 'Backup contact name', 'Anna Smith'), txt('email', 'Backup email', 'anna@example.com'), txt('phone', 'Backup phone (optional)', ''), sel('tone', 'Tone', ['Formal', 'Friendly', 'Short']), sel('access', 'Email access', ['No access to email', 'Limited access to email', 'Not mentioned'])],
  run: (_i, o) => {
    const [a, b, c] = parseDate(o.from), [d, e, g] = parseDate(o.back);
    const fmt = (y, m, dd) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, dd)));
    if (Date.UTC(d, e - 1, g) <= Date.UTC(a, b - 1, c)) throw new Error('The return date must be after the away date');
    const F = fmt(a, b, c), B = fmt(d, e, g), n = o.name.trim() || 'me', bk = o.backup.trim(), ct = [o.email.trim(), o.phone.trim()].filter(Boolean).join(' or ');
    const acc = o.access === 'No access to email' ? 'I will not have access to my email' : o.access === 'Limited access to email' ? 'I will have limited access to my email' : '';
    const help = bk || ct ? (o.tone === 'Formal' ? `For urgent matters, please contact ${bk || 'my colleague'}${ct ? ' at ' + ct : ''}.` : `If it is urgent, please reach out to ${bk || 'my colleague'}${ct ? ' (' + ct + ')' : ''}.`) : '';
    let sub, body;
    if (o.tone === 'Short') { sub = `Out of office until ${B}`; body = `Thanks for your email. I am out of office from ${F} and back on ${B}.${help ? '\n' + help : ''}\n\n${n}`; }
    else if (o.tone === 'Friendly') { sub = `Out of office: back on ${B}`; body = `Hi there,\n\nThanks for getting in touch! I am away from ${F} and will be back on ${B}.${acc ? ' ' + acc + ' while I am gone.' : ''} I will reply as soon as I can after I return.\n\n${help}\n\nBest,\n${n}`; }
    else { sub = `Automatic reply: out of office until ${B}`; body = `Dear sender,\n\nThank you for your message. I am out of the office from ${F} until ${B}.${acc ? ' ' + acc + ' during this time.' : ''} I will respond to your message after my return.\n\n${help}\n\nKind regards,\n${n}`; }
    return `Subject: ${sub}\n\n${body.replace(/\n{3,}/g, '\n\n')}`;
  },
});

// ---------- 958 name formatter ----------
T.push({
  id: 'email-name-formatter', cat: M, title: 'Email Name and Address Formatter ("Name <email>" List)',
  desc: 'Turn names and addresses pasted from a spreadsheet into an RFC 5322 style list of "Name" <email> entries, quoted where needed, separated by commas or semicolons for To or BCC.',
  labels: ['Rows: "Name, email", "Name<TAB>email", "Name <email>" or just an email'], sample: 'Jane Doe\tjane@example.com\n"Smith, Tom", tom@example.org\nAnna Müller <anna@example.net>\nsolo@example.com',
  opts: [sel('sep', 'Separator', ['comma', 'semicolon (Outlook)', 'new line'], 'comma'), chk('encode', 'Encode non-ASCII names (RFC 2047)', false)],
  run: ([t], o) => {
    const out = [], bad = [];
    for (const l of lines(t)) {
      let name = '', mail = '', m;
      if ((m = /^(.*?)\s*<([^<>]+)>\s*$/.exec(l))) { name = m[1]; mail = m[2]; }
      else if ((m = /^(.*?)[\t,;]\s*([^\s,;\t]+@[^\s,;\t]+)\s*$/.exec(l))) { name = m[1]; mail = m[2]; }
      else if ((m = /^([^\s]+@[^\s]+?)(?:[\t,;]\s*(.*))?$/.exec(l))) { mail = m[1]; name = m[2] || ''; }
      else if ((m = /^(.*\S)\s+([^\s]+@[^\s]+)$/.exec(l))) { name = m[1]; mail = m[2]; }
      else { bad.push(`${l}  (no email found)`); continue; }
      name = name.trim().replace(/^"(.*)"$/, '$1').replace(/\\(.)/g, '$1').trim(); mail = mail.trim();
      const why = checkAddr(mail); if (why) { bad.push(`${l}  (${why})`); continue; }
      if (!name) { out.push(mail); continue; }
      if (/[^\x00-\x7f]/.test(name)) {
        if (o.encode) { out.push(`=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(name)))}?= <${mail}>`); continue; }
      }
      out.push(/^[A-Za-z0-9 !#$%&'*+/=?^_`{|}~-]+$/.test(name) || /[^\x00-\x7f]/.test(name) && !/[()<>[\]:;@\\,."]/.test(name) ? `${name} <${mail}>` : `"${name.replace(/(["\\])/g, '\\$1')}" <${mail}>`);
    }
    if (!out.length && !bad.length) throw new Error('Paste some rows');
    const sep = o.sep === 'new line' ? '\n' : o.sep.startsWith('semi') ? '; ' : ', ';
    return out.join(sep) + (bad.length ? `\n\nSkipped (${bad.length}):\n${bad.join('\n')}` : '') + '\n\nNames with special characters (comma, quote, dot, @, brackets) are put in quotes. Non-ASCII names are left as-is unless you choose RFC 2047 encoding.';
  },
});

// ---------- 959 bulk UTM matrix ----------
T.push({
  id: 'utm-channel-matrix', cat: M, title: 'UTM Channel Matrix Generator (URLs x Channels, CSV)',
  desc: 'Paste URLs and a list of channels (source, medium, optional campaign and content) and get every combination tagged with UTM parameters as a table you can copy as CSV.',
  inputs: 2, labels: ['URLs (one per line)', 'Channels: source | medium | campaign (optional) | content (optional)'], sample: 'https://example.com/spring-sale\nhttps://example.com/pricing', sample2: 'newsletter | email\nfacebook | paid_social | | video_a\nlinkedin | social',
  opts: [txt('campaign', 'Default campaign', 'spring_sale'), chk('lower', 'Lowercase values', true), chk('space', 'Replace spaces with _', true)],
  run: ([u, c], o) => {
    const urls = lines(u), ch = lines(c); if (!urls.length || !ch.length) throw new Error('Enter at least one URL and one channel');
    const clean = (v) => { v = (v || '').trim(); if (o.lower) v = v.toLowerCase(); if (o.space) v = v.replace(/\s+/g, '_'); return v; };
    const rows = [['url', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'tagged_url']];
    for (const raw of urls) {
      let b; try { b = new URL(raw); } catch { throw new Error('Invalid URL: ' + raw); }
      if (!/^https?:$/.test(b.protocol)) throw new Error('Only http and https URLs: ' + raw);
      for (const l of ch) {
        const [s, m, cp, ct] = l.split('|').map(clean); if (!s || !m) throw new Error(`Channel needs a source and a medium: "${l}"`);
        const camp = cp || clean(o.campaign); if (!camp) throw new Error('Set a default campaign or give one per channel');
        const x = new URL(b.href); x.searchParams.set('utm_source', s); x.searchParams.set('utm_medium', m); x.searchParams.set('utm_campaign', camp); if (ct) x.searchParams.set('utm_content', ct);
        rows.push([raw, s, m, camp, ct || '', x.href]);
      }
    }
    return rows.map((r) => r.map(csvCell).join(',')).join('\n') + `\n\n${rows.length - 1} links (${urls.length} URLs x ${ch.length} channels). Existing query strings and #fragments are kept.`;
  },
});

// ---------- 960 UTM parser ----------
T.push({
  id: 'utm-parameter-parser', cat: M, title: 'UTM Parameter Parser (Source, Medium, Campaign Table)',
  desc: 'Break tagged campaign links into utm_source, utm_medium, utm_campaign, utm_term and utm_content, with the clean URL and any other tracking IDs (gclid, fbclid) found.',
  labels: ['Tagged URLs (one per line)'], sample: 'https://example.com/pricing?plan=pro&utm_source=newsletter&utm_medium=email&utm_campaign=spring_sale&utm_content=hero&gclid=abc123#plans',
  run: ([t]) => {
    const ls = lines(t); if (!ls.length) throw new Error('Paste at least one URL');
    const UT = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id'], OTHER = ['gclid', 'fbclid', 'msclkid', 'dclid', 'gbraid', 'wbraid', 'ttclid', 'twclid', 'li_fat_id', 'mc_cid', 'mc_eid', '_ga', '_gl', 'yclid'];
    return ls.map((l) => {
      let u; try { u = new URL(l); } catch { return `${l}\n  not a valid URL`; }
      const p = u.searchParams, clean = new URL(u.href), seen = [], oth = [];
      for (const k of [...p.keys()]) if (/^utm_/i.test(k) || OTHER.includes(k.toLowerCase())) clean.searchParams.delete(k);
      const rows = UT.map((k) => { const v = p.get(k); if (v !== null) seen.push(k); return `  ${k.padEnd(13)} ${v === null ? '-' : v}`; });
      for (const [k, v] of p) if ((/^utm_/i.test(k) && !UT.includes(k)) || OTHER.includes(k.toLowerCase())) oth.push(`  ${k.padEnd(13)} ${v}`);
      const notes = [];
      if (!seen.includes('utm_source') || !seen.includes('utm_medium') || !seen.includes('utm_campaign')) notes.push('review: utm_source, utm_medium and utm_campaign are the usual required three');
      if (UT.some((k) => (p.get(k) || '') !== (p.get(k) || '').toLowerCase())) notes.push('review: values contain capitals; analytics treats "Email" and "email" as different');
      return `${l}\n${rows.join('\n')}${oth.length ? '\n  Other tracking parameters:\n' + oth.join('\n') : ''}\n  Clean URL: ${clean.href}${notes.length ? '\n  ' + notes.join('\n  ') : ''}`;
    }).join('\n\n');
  },
});

// ---------- 961/962 ad cost solver ----------
const optNum = (s, name) => { s = String(s ?? '').trim().replace(/,/g, ''); if (!s) return null; const n = Number(s); if (!Number.isFinite(n) || n < 0) throw new Error(`"${name}" must be a number of 0 or more, or empty`); return n; };
calc('ad-cost-solver', 'CPM, CPC and CPA Solver (Fill Any Two, Get the Third)', 'Enter any two of spend, units and cost per unit for impressions (CPM), clicks (CPC) and conversions (CPA); leave one empty and it solves for the missing value.',
  [txt('spend', 'Total spend', '500'), txt('impr', 'Impressions', '100000'), txt('cpm', 'CPM (cost per 1000 impressions)', ''), txt('clicks', 'Clicks', ''), txt('cpc', 'CPC (cost per click)', '0.8'), txt('conv', 'Conversions', '20'), txt('cpa', 'CPA (cost per conversion)', '')],
  (o) => {
    const spend = optNum(o.spend, 'spend'); const out = [];
    const trio = (nm, units, rate, k, uLabel, rLabel) => {
      let u = optNum(units, uLabel), r = optNum(rate, rLabel), s = spend; const known = [s, u, r].filter((x) => x !== null).length;
      if (known < 2) { out.push(`${nm}: needs two of spend, ${uLabel}, ${rLabel}`); return; }
      if (known === 3) { const e = (u / k) * r; if (Math.abs(e - s) > Math.max(0.01, s * 0.005)) out.push(`${nm}: warning, these do not agree (${uLabel} x ${rLabel} = ${f(e)}, spend is ${f(s)})`); return out.push(`${nm}: spend ${f(s)}, ${uLabel} ${f(u, 0)}, ${rLabel} ${f(r, 4)}`); }
      if (s === null) { s = u / k * r; out.push(`${nm} group: spend = ${f(s)}`); } else if (u === null) { if (r === 0) throw new Error(`${rLabel} cannot be 0`); u = s / r * k; out.push(`${nm} group: ${uLabel} = ${f(u, 0)}`); } else { if (u === 0) throw new Error(`${uLabel} cannot be 0`); r = s / u * k; out.push(`${nm} group: ${rLabel} = ${f(r, 4)}`); }
    };
    trio('CPM', o.impr, o.cpm, 1000, 'impressions', 'CPM'); trio('CPC', o.clicks, o.cpc, 1, 'clicks', 'CPC'); trio('CPA', o.conv, o.cpa, 1, 'conversions', 'CPA');
    const im = optNum(o.impr, 'impressions'), cl = optNum(o.clicks, 'clicks'), cv = optNum(o.conv, 'conversions');
    if (im && cl) out.push(`CTR (clicks / impressions): ${pct(cl / im)}`); if (cl && cv) out.push(`Click to conversion rate: ${pct(cv / cl)}`);
    return out.join('\n') + '\n\nSolved rows are one value each. Fill spend plus one unit and its rate in each group you need.';
  });

// ---------- 965 conversion rate ----------
calc('conversion-rate-calculator', 'Conversion Rate Calculator (and Conversions Needed for a Target)', 'Conversion rate from visitors and conversions, plus how many conversions or visitors you need to reach a target rate.',
  [num('visitors', 'Visitors (or sessions)', 12000), num('conv', 'Conversions', 288), num('target', 'Target conversion rate % (0 = skip)', 3)],
  (o) => {
    nz(o, 'visitors', 'conv', 'target'); pos(o, 'visitors'); if (o.conv > o.visitors) throw new Error('Conversions cannot be more than visitors');
    const r = o.conv / o.visitors, L = [`Conversion rate: ${pct(r, 3)}  (${f(o.conv, 0)} / ${f(o.visitors, 0)})`, `Visitors per conversion: ${f(div(1, r), 1)}`];
    if (o.target > 0) { const need = Math.ceil(o.visitors * o.target / 100); L.push('', `At ${o.target}% with the same ${f(o.visitors, 0)} visitors you need ${f(need, 0)} conversions (${need - o.conv >= 0 ? '+' : ''}${f(need - o.conv, 0)} vs now).`, r > 0 ? `At your current rate, ${f(Math.ceil(need / r), 0)} visitors would give ${f(need, 0)} conversions.` : ''); }
    return L.filter((x) => x !== '').join('\n');
  });

// ---------- 968 test duration ----------
calc('ab-test-duration-calculator', 'A/B Test Duration Calculator (Days and Full Weeks)', 'How many days an A/B test must run: from the sample size per variant, number of variants, daily visitors and share of traffic in the test, rounded up to full weeks.',
  [num('sample', 'Required sample size per variant', 39475), num('variants', 'Number of variants (including control)', 2), num('daily', 'Daily visitors to the tested page', 3000), num('share', 'Share of traffic in the test %', 100)],
  (o) => {
    pos(o, 'sample', 'daily', 'share'); if (!(o.variants >= 2)) throw new Error('Use at least 2 variants'); if (o.share > 100) throw new Error('Share cannot be above 100');
    const tot = o.sample * Math.floor(o.variants), per = o.daily * o.share / 100, days = Math.ceil(tot / per), wk = Math.ceil(days / 7);
    return `Total visitors needed: ${f(tot, 0)}\nVisitors per day in the test: ${f(per, 0)}\nDays needed: ${f(days, 0)}\nRounded up to full weeks: ${wk} week${wk > 1 ? 's' : ''} (${wk * 7} days)\n\nFull weeks cover each weekday equally. Many teams also run at least 1 to 2 business cycles and do not stop early when the result first looks significant. Get the sample size from a sample size calculator for your baseline rate and minimum lift.`;
  });

// ---------- 970/971 CAC and LTV ----------
calc('cac-ltv-calculator', 'CAC and LTV:CAC Ratio Calculator (with Payback)', 'Customer acquisition cost from marketing and sales spend, customer lifetime value from revenue, margin and lifespan, the LTV to CAC ratio and CAC payback in months.',
  [num('mkt', 'Marketing spend in the period', 18000), num('sales', 'Sales spend in the period', 12000), num('cust', 'New customers in the period', 150), num('arpa', 'Average revenue per customer per month', 60), num('margin', 'Gross margin %', 75), num('life', 'Customer lifespan in months', 30), num('churn', 'Monthly churn % (0 = use lifespan)', 0)],
  (o) => {
    nz(o, 'mkt', 'sales', 'cust', 'arpa', 'margin', 'life', 'churn'); pos(o, 'cust', 'arpa', 'margin');
    const cac = (o.mkt + o.sales) / o.cust, life = o.churn > 0 ? 100 / o.churn : o.life; if (!(life > 0)) throw new Error('Enter a lifespan or a churn rate');
    const gp = o.arpa * o.margin / 100, ltv = gp * life, ratio = ltv / cac, pay = cac / gp;
    return [`CAC: ${f(cac)}  ((${f(o.mkt, 0)} + ${f(o.sales, 0)}) / ${f(o.cust, 0)})`, `Lifespan used: ${f(life, 1)} months${o.churn > 0 ? ` (1 / ${o.churn}% churn)` : ''}`, `LTV (gross profit): ${f(ltv)}  (${f(gp)} per month x ${f(life, 1)})`, `LTV : CAC = ${f(ratio, 2)} : 1  ->  ${ratio >= 3 ? 'at or above the 3:1 rule of thumb' : ratio >= 1 ? 'below the 3:1 rule of thumb: review' : 'below 1:1, each customer costs more than they return'}`, `CAC payback: ${f(pay, 1)} months`, '', 'The 3:1 figure is a common rule of thumb, not a law. A very high ratio can also mean you under-invest in growth. Use the same period for spend and customers, and include salaries in the spend.'].join('\n');
  });

// ---------- 972 funnel ----------
calc('marketing-funnel-calculator', 'Marketing Funnel Calculator (Visitors Needed for a Revenue Goal)', 'Work backwards from a revenue goal and deal size through your stage conversion rates to the customers, opportunities, qualified leads, leads and visitors you need.',
  [num('goal', 'Revenue goal', 500000), num('deal', 'Average deal size', 5000), num('win', 'Opportunity to customer %', 25), num('qual', 'Qualified lead to opportunity %', 40), num('lead', 'Lead to qualified lead %', 30), num('vis', 'Visitor to lead %', 2)],
  (o) => {
    pos(o, 'goal', 'deal', 'win', 'qual', 'lead', 'vis'); for (const k of ['win', 'qual', 'lead', 'vis']) if (o[k] > 100) throw new Error(`"${k}" cannot be above 100%`);
    const cust = Math.ceil(o.goal / o.deal), opp = Math.ceil(cust / (o.win / 100)), ql = Math.ceil(opp / (o.qual / 100)), ld = Math.ceil(ql / (o.lead / 100)), vs = Math.ceil(ld / (o.vis / 100));
    const rows = [['Visitors', vs], ['Leads', ld], ['Qualified leads', ql], ['Opportunities', opp], ['Customers', cust]];
    return rows.map(([n, v]) => `${n.padEnd(16)} ${f(v, 0).padStart(12)}`).join('\n') + `\n\nOverall visitor to customer rate: ${pct(cust / vs, 3)}\nRevenue: ${f(cust * o.deal)} (${f(cust, 0)} x ${f(o.deal)})\n\nEach stage is rounded up. Use rates from your own past data; this shows the volume implied, not whether it is reachable.`;
  });

// ---------- 975 value proposition ----------
T.push({
  id: 'value-proposition-generator', cat: M, title: 'Value Proposition Statement Generator (Canvas to Sentence)',
  desc: 'Turn customer jobs, pains and gains and your product benefits into value proposition statements using the classic fill-in-the-blank patterns. Edit the result.',
  inputs: 0, sample: '',
  opts: [txt('customer', 'Customer segment', 'busy freelancers'), txt('job', 'Job they want done', 'send invoices and get paid on time'), txt('pain', 'Main pain', 'chasing late payments'), txt('gain', 'Main gain', 'a steady cash flow'), txt('product', 'Product name', 'PayLoop'), txt('category', 'Product category', 'invoicing app'), txt('relief', 'How it removes the pain (start with -ing)', 'sending polite automatic reminders'), txt('creator', 'How it creates the gain (start with -ing)', 'showing exactly when money will arrive'), txt('alt', 'Alternative / competitor (optional)', 'spreadsheets and manual follow-ups')],
  run: (_i, o) => {
    const need = ['customer', 'job', 'product']; for (const k of need) if (!o[k].trim()) throw new Error('Fill in customer, job and product');
    const c = o.customer.trim(), j = o.job.trim(), p = o.product.trim(), cat = o.category.trim() || 'product', ln = (a, b) => (a && b ? `${a} and ${b}` : a || b), rl = o.relief.trim(), cr = o.creator.trim(), pn = o.pain.trim(), gn = o.gain.trim();
    const a = [`1. Fill-in sentence\n${p} helps ${c} who want to ${j}${pn || gn ? ' by ' + ln(rl, cr) : ''}.`];
    a.push(`2. Positioning statement (Geoffrey Moore pattern)\nFor ${c} who ${pn ? 'struggle with ' + pn : 'want to ' + j}, ${p} is ${/^[aeiou]/i.test(cat) ? 'an' : 'a'} ${cat} that works by ${ln(rl, cr) || 'delivering the result they want'}.${o.alt.trim() ? ` Unlike ${o.alt.trim()}, ${p} is built around ${cr || rl || 'doing the job better'}.` : ''}`);
    a.push(`3. Headline options\n- ${gn ? title(gn) : title(j)}, without ${pn || 'the hassle'}\n- ${title(j)}: ${pn ? 'no more ' + pn : p}\n- ${p}: ${cat} for ${c}`);
    a.push('Check the draft: is it specific, does it name a real customer, and could a competitor say the same? If yes, tighten it.');
    return a.join('\n\n');
  },
});

// ---------- 976 slogan ----------
T.push({
  id: 'slogan-generator', cat: M, title: 'Slogan and Tagline Generator (Templates)',
  desc: 'Get tagline ideas from your brand name and a benefit word using common slogan patterns such as "Brand: Benefit made simple". Template based, you pick and polish.',
  inputs: 0, sample: '',
  opts: [txt('brand', 'Brand name', 'PayLoop'), txt('benefit', 'Benefit word (noun)', 'cash flow'), txt('verb', 'Action verb (optional)', 'get paid'), txt('audience', 'Audience (optional)', 'freelancers')],
  run: (_i, o) => {
    const B = o.brand.trim(), n = o.benefit.trim(), v = o.verb.trim(), a = o.audience.trim(); if (!B || !n) throw new Error('Enter a brand and a benefit');
    const N = title(n), out = [`${B}: ${N}, made simple.`, `${B}. Better ${n}.`, `Your ${n}, sorted.`, `${B}: where ${n} gets easier.`, `More ${n}. Less stress.`, `Think ${n}. Think ${B}.`, `${B} puts ${n} first.`, `Built for ${n}.`, `${N} that works for you.`, `The simple way to ${v || 'improve your ' + n}.`, `${B}. ${N} without the hassle.`, `Make ${n} your strength.`, `${N}, every time.`, `Because ${n} matters.`, `${B}: ${N} you can count on.`, `Where ${n} meets simple.`];
    if (v) out.push(`${title(v)} the easy way.`, `${B}: ${title(v)}. Simply.`, `Want to ${v}? ${B}.`, `${title(v)} with confidence.`);
    if (a) out.push(`${B}: made for ${a}.`, `${N} for ${a}.`, `By ${a}, for ${a}.`, `${title(a)}, meet better ${n}.`);
    return [...new Set(out)].join('\n') + '\n\nGeneric patterns: expect to rewrite. Search the phrase in quotes and check trademark databases before using a slogan commercially.';
  },
});

// ---------- 978 NPS ----------
T.push({
  id: 'nps-calculator', cat: M, title: 'Net Promoter Score (NPS) Calculator',
  desc: 'Calculate NPS from raw 0 to 10 survey scores or from promoter, passive and detractor counts. Get the score from -100 to 100 with a breakdown bar chart.',
  labels: ['Raw scores 0 to 10 (any separators; leave empty to use the counts below)'], sample: '10 9 9 10 8 7 6 9 10 3 8 9 10 7 5',
  opts: [num('p', 'Promoters (9-10), if no scores', 0), num('a', 'Passives (7-8), if no scores', 0), num('d', 'Detractors (0-6), if no scores', 0)],
  run: ([t], o) => {
    let p = 0, a = 0, d = 0; const sc = String(t).split(/[\s,;]+/).filter(Boolean);
    if (sc.length) for (const s of sc) { const v = Number(s); if (!Number.isInteger(v) || v < 0 || v > 10) throw new Error(`"${s}" is not a whole score from 0 to 10`); if (v >= 9) p++; else if (v >= 7) a++; else d++; }
    else { nz(o, 'p', 'a', 'd'); [p, a, d] = [o.p, o.a, o.d]; }
    const n = p + a + d; if (!n) throw new Error('Enter scores or counts');
    const row = (l, c) => `${l.padEnd(11)} ${String(c).padStart(6)}  ${pct(c / n, 1).padStart(7)}  ${bar(c / n)}`;
    return `NPS = ${f((p - d) / n * 100, 1)}   (% promoters ${pct(p / n, 1)} minus % detractors ${pct(d / n, 1)})\nResponses: ${n}\n\n${row('Promoters', p)}\n${row('Passives', a)}\n${row('Detractors', d)}\n\nWith few responses the score swings a lot: ${n < 30 ? 'under 30 responses, treat it as a rough signal.' : 'compare over time with a similar number of responses.'}`;
  },
});

// ---------- 979 CSAT ----------
calc('csat-calculator', 'CSAT Score Calculator (Customer Satisfaction %)', 'Customer satisfaction score from the number of responses at each rating from 1 to 5: share of satisfied customers (4 and 5 by default) and the average rating.',
  [num('r1', 'Responses rated 1 (very unsatisfied)', 4), num('r2', 'Rated 2', 6), num('r3', 'Rated 3', 18), num('r4', 'Rated 4', 62), num('r5', 'Rated 5 (very satisfied)', 110), sel('min', 'Count as satisfied from rating', ['4', '5'], '4')],
  (o) => {
    const r = [o.r1, o.r2, o.r3, o.r4, o.r5]; nz(o, 'r1', 'r2', 'r3', 'r4', 'r5'); const n = r.reduce((a, b) => a + b, 0); if (!n) throw new Error('Enter some responses');
    const m = Number(o.min), s = r.slice(m - 1).reduce((a, b) => a + b, 0), avg = r.reduce((a, c, i) => a + c * (i + 1), 0) / n;
    return `CSAT: ${pct(s / n, 1)}  (${f(s, 0)} satisfied of ${f(n, 0)}, ratings ${m} to 5)\nAverage rating: ${f(avg, 2)} / 5\n\n` + r.map((c, i) => `${i + 1}  ${String(c).padStart(6)}  ${pct(c / n, 1).padStart(7)}  ${bar(c / n)}`).join('\n') + '\n\nCSAT = satisfied responses / all responses x 100. Some teams count only 5 as satisfied; use the option for that.';
  });

// ---------- 980/981 survey statistics ----------
const Z = { '80': 1.2816, '90': 1.6449, '95': 1.96, '98': 2.3263, '99': 2.5758, '99.9': 3.2905 };
calc('survey-sample-size-calculator', 'Survey Sample Size Calculator (Confidence and Margin of Error)', 'Minimum survey responses for a confidence level and margin of error, with a finite population correction. Based on the standard proportion formula.',
  [num('pop', 'Population size (0 = very large)', 0), sel('conf', 'Confidence level %', Object.keys(Z), '95'), num('moe', 'Margin of error %', 5), num('p', 'Expected proportion % (50 is safest)', 50)],
  (o) => {
    nz(o, 'pop'); pos(o, 'moe', 'p'); if (o.p >= 100 || o.moe >= 50) throw new Error('Use a proportion below 100% and a margin below 50%');
    const z = Z[o.conf], p = o.p / 100, e = o.moe / 100, n0 = z * z * p * (1 - p) / (e * e), n = o.pop > 0 ? n0 / (1 + (n0 - 1) / o.pop) : n0, N = Math.ceil(n);
    if (o.pop > 0 && N > o.pop) throw new Error('Needed sample is larger than the population');
    return `Responses needed: ${f(N, 0)}\n(unadjusted for population: ${f(Math.ceil(n0), 0)})\n\nz = ${z} for ${o.conf}% confidence, p = ${o.p}%, margin ±${o.moe}%${o.pop > 0 ? `, population ${f(o.pop, 0)}` : ''}\n\nThis is the number of completed answers, so divide by your expected response rate to know how many people to invite. It assumes a random sample; self-selected surveys are biased whatever the size.`;
  });
calc('margin-of-error-calculator', 'Survey Margin of Error Calculator', 'Margin of error for a survey result from sample size, result percentage and confidence level, with the plus or minus range and optional population correction.',
  [num('n', 'Sample size (responses)', 400), num('p', 'Result %', 56), sel('conf', 'Confidence level %', Object.keys(Z), '95'), num('pop', 'Population size (0 = very large)', 0)],
  (o) => {
    pos(o, 'n'); nz(o, 'pop', 'p'); if (o.p > 100) throw new Error('Result cannot be above 100%'); if (o.pop > 0 && o.n > o.pop) throw new Error('Sample cannot be larger than the population');
    const z = Z[o.conf], p = o.p / 100, fpc = o.pop > 1 ? Math.sqrt((o.pop - o.n) / (o.pop - 1)) : 1, moe = z * Math.sqrt(p * (1 - p) / o.n) * fpc, worst = z * Math.sqrt(0.25 / o.n) * fpc;
    return `Margin of error: ±${f(moe * 100, 2)} points\nRange at ${o.conf}% confidence: ${f(Math.max(0, (p - moe) * 100), 2)}% to ${f(Math.min(100, (p + moe) * 100), 2)}%\nWorst case (result at 50%): ±${f(worst * 100, 2)} points\n\nNormal approximation. It is rough with results near 0% or 100%, or small samples (under about 30), and only covers sampling error in a random sample, not bias.`;
  });

// ---------- 982 share of voice ----------
T.push({
  id: 'share-of-voice-calculator', cat: M, title: 'Share of Voice Calculator (Brand vs Competitors)',
  desc: 'Calculate share of voice from mentions, ad spend, impressions or any metric for your brand and competitors, as percentages with a bar chart.',
  labels: ['One brand per line: "Name: value"'], sample: 'Our Brand: 1200\nCompetitor A: 3400\nCompetitor B: 2100\nCompetitor C: 900', opts: [txt('own', 'Your brand name (optional, marked)', 'Our Brand')],
  run: ([t], o) => {
    const rows = lines(t).map((l) => { const m = /^(.*?)[:=\t]\s*([\d.,]+)\s*$/.exec(l); if (!m) throw new Error(`Cannot read "${l}". Use "Name: 123"`); return [m[1].trim(), Number(m[2].replace(/,/g, ''))]; });
    if (rows.length < 2) throw new Error('Enter at least two brands'); const tot = rows.reduce((a, r) => a + r[1], 0); if (!tot) throw new Error('Total is 0');
    const w = Math.max(...rows.map((r) => r[0].length));
    return rows.sort((a, b) => b[1] - a[1]).map(([n, v]) => `${n.padEnd(w)} ${f(v, 0).padStart(10)}  ${pct(v / tot, 1).padStart(7)}  ${bar(v / tot)}${o.own && n.toLowerCase() === o.own.trim().toLowerCase() ? '  <- you' : ''}`).join('\n') + `\n\nTotal: ${f(tot, 0)}. Share = brand / total of the brands listed, so it changes when you add or remove a competitor. Use one metric for every brand.`;
  },
});

// ---------- 983 reach and frequency ----------
calc('reach-frequency-calculator', 'Reach, Average Frequency and GRP Calculator', 'Average frequency, reach percentage and gross rating points (GRPs) from total impressions, unique reach and target population, plus cost per point if you add spend.',
  [num('impr', 'Total impressions', 1500000), num('reach', 'Unique people reached', 400000), num('pop', 'Target population', 1000000), num('spend', 'Spend (optional)', 20000)],
  (o) => {
    nz(o, 'impr', 'reach', 'pop', 'spend'); pos(o, 'reach', 'pop'); if (o.reach > o.pop) throw new Error('Reach cannot be more than the target population'); if (o.impr < o.reach) throw new Error('Impressions cannot be less than unique reach');
    const fr = o.impr / o.reach, rp = o.reach / o.pop * 100, grp = o.impr / o.pop * 100;
    return [`Average frequency: ${f(fr, 2)} impressions per person reached`, `Reach: ${f(rp, 1)}% of the target population`, `GRPs: ${f(grp, 1)}  (impressions / population x 100 = reach % x frequency)`, o.spend > 0 ? `Cost per GRP (cost per rating point): ${f(o.spend / grp)}\nCPM: ${f(o.spend / o.impr * 1000)}` : '', '', 'Frequency is an average: some people saw the ad once and a few many times. Reach numbers from different platforms cannot be added up because the same person can be counted in each.'].filter((x) => x !== '').join('\n');
  });

// ---------- 984 event ROI ----------
calc('event-roi-calculator', 'Event ROI Calculator (Trade Show and Conference)', 'Compare event costs with leads, pipeline and closed revenue: total cost, cost per lead, cost per opportunity, pipeline multiple and ROI.',
  [num('booth', 'Booth / ticket cost', 8000), num('travel', 'Travel and lodging', 3500), num('staff', 'Staff time cost', 4000), num('other', 'Other costs (swag, shipping, ads)', 2500), num('leads', 'Leads collected', 220), num('opps', 'Opportunities created', 18), num('pipe', 'Pipeline value', 150000), num('won', 'Closed revenue so far', 36000), num('margin', 'Gross margin % (0 = use revenue)', 0)],
  (o) => {
    nz(o, 'booth', 'travel', 'staff', 'other', 'leads', 'opps', 'pipe', 'won', 'margin');
    const cost = o.booth + o.travel + o.staff + o.other; pos({ cost }, 'cost'); const ret = o.margin > 0 ? o.won * o.margin / 100 : o.won;
    return [`Total cost: ${f(cost)}`, `Cost per lead: ${o.leads ? f(cost / o.leads) : 'n/a'}`, `Cost per opportunity: ${o.opps ? f(cost / o.opps) : 'n/a'}`, `Pipeline multiple: ${f(o.pipe / cost, 1)}x cost`, `ROI on closed revenue${o.margin > 0 ? ' (gross profit)' : ''}: ${pct((ret - cost) / cost, 1)}  (${f(ret)} returned for ${f(cost)} spent)`, '', 'Pipeline is not revenue, and deals from events often close months later. Re-run this with updated closed revenue. Count staff time at a real hourly cost to avoid flattering the result.'].join('\n');
  });

// ---------- 985 affiliate ----------
T.push({
  id: 'affiliate-commission-calculator', cat: M, title: 'Affiliate Commission Calculator (Tiered or Flat)',
  desc: 'Calculate an affiliate payout under tiered commission plans by sales volume, either marginal (each slice at its tier rate) or retroactive (the whole amount at the tier reached), or a flat rate.',
  labels: ['Tiers: "from - to : rate%" (leave "to" empty for the top tier)'], sample: '0 - 10000 : 5%\n10000 - 50000 : 7%\n50000 - : 10%',
  opts: [num('sales', 'Affiliate sales in the period', 62000), sel('mode', 'How tiers apply', ['marginal (each slice at its rate)', 'retroactive (all sales at the tier reached)'])],
  run: ([t], o) => {
    nz(o, 'sales'); const tiers = lines(t).map((l) => { const m = /^([\d.,]+)\s*-\s*([\d.,]*)\s*[:=]\s*([\d.]+)\s*%?$/.exec(l); if (!m) throw new Error(`Cannot read tier "${l}". Use "0 - 10000 : 5%"`); return { a: Number(m[1].replace(/,/g, '')), b: m[2] ? Number(m[2].replace(/,/g, '')) : Infinity, r: Number(m[3]) / 100 }; }).sort((x, y) => x.a - y.a);
    if (!tiers.length) throw new Error('Enter at least one tier'); for (let i = 1; i < tiers.length; i++) if (tiers[i].a < tiers[i - 1].b) throw new Error('Tiers overlap: each "from" must be at or above the previous "to"');
    const marginal = o.mode.startsWith('marginal'), L = []; let total = 0;
    if (marginal) { for (const x of tiers) { const amt = Math.max(0, Math.min(o.sales, x.b) - x.a); if (amt > 0) { const c = amt * x.r; total += c; L.push(`${f(x.a, 0)} - ${x.b === Infinity ? 'and up' : f(x.b, 0)}: ${f(amt)} x ${f(x.r * 100, 2)}% = ${f(c)}`); } } }
    else { const x = [...tiers].reverse().find((y) => o.sales >= y.a) || tiers[0]; total = o.sales * x.r; L.push(`Tier reached: from ${f(x.a, 0)} at ${f(x.r * 100, 2)}%: ${f(o.sales)} x ${f(x.r * 100, 2)}% = ${f(total)}`); }
    return L.join('\n') + `\n\nTotal commission: ${f(total)}\nEffective rate: ${pct(div(total, o.sales), 2)}\n\nCheck your program terms for refunds, cookie windows and whether tiers use gross or net sales.`;
  },
});

// ---------- 986 lead scoring ----------
T.push({
  id: 'lead-scoring-calculator', cat: M, title: 'Lead Scoring Calculator (Hot, Warm, Cold)',
  desc: 'Define weighted scoring criteria, list which ones each lead meets, and get a score and a hot, warm or cold label for every lead. Negative points are allowed.',
  inputs: 2, labels: ['Criteria: "name: points"', 'Leads: "Lead: criterion; criterion"'], sample: 'Company over 100 staff: 20\nDecision maker title: 25\nVisited pricing page: 15\nOpened 3+ emails: 10\nFree email address: -15\nRequested demo: 40',
  sample2: 'Acme Corp: Company over 100 staff; Decision maker title; Requested demo\nJo Smith: Free email address; Opened 3+ emails\nNorth Ltd: Visited pricing page; Company over 100 staff',
  opts: [num('hot', 'Hot from (points)', 60), num('warm', 'Warm from (points)', 30)],
  run: ([c, l], o) => {
    const crit = new Map(); for (const x of lines(c)) { const m = /^(.*?)\s*:\s*(-?\d+(?:\.\d+)?)$/.exec(x); if (!m) throw new Error(`Cannot read criterion "${x}". Use "name: 20"`); crit.set(m[1].trim().toLowerCase(), [m[1].trim(), Number(m[2])]); }
    if (!crit.size) throw new Error('Add criteria'); if (o.hot < o.warm) throw new Error('Hot must be at least the warm threshold');
    const ld = lines(l); if (!ld.length) throw new Error('Add leads');
    const res = ld.map((x) => { const i = x.indexOf(':'), nm = i < 0 ? x : x.slice(0, i).trim(), ms = i < 0 ? [] : x.slice(i + 1).split(';').map((y) => y.trim()).filter(Boolean); let s = 0; const unk = [], hit = []; for (const mm of ms) { const k = crit.get(mm.toLowerCase()); if (k) { s += k[1]; hit.push(`${k[0]} (${k[1] > 0 ? '+' : ''}${k[1]})`); } else unk.push(mm); } return { nm, s, hit, unk }; }).sort((a, b) => b.s - a.s);
    return res.map((r) => `${r.nm}: ${r.s} points, ${r.s >= o.hot ? 'HOT' : r.s >= o.warm ? 'WARM' : 'COLD'}\n  ${r.hit.join('; ') || 'no criteria met'}${r.unk.length ? '\n  unknown criteria ignored: ' + r.unk.join('; ') : ''}`).join('\n') + `\n\nMax possible: ${[...crit.values()].filter((v) => v[1] > 0).reduce((a, v) => a + v[1], 0)} points. Calibrate the weights and thresholds against leads that really became customers.`;
  },
});

export default T;

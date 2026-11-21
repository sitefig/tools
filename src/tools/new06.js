// Tools from free-browser-tools.md, batch 06 (privacy, consent, security headers). See TOOLS.md for the contract.
const T = [];
const L = 'Privacy – Legal', B = 'Privacy – Browser', S = 'Privacy – Secrets', N = 'Network & HTTP';
const lines = (t) => String(t || '').split(/\r?\n/);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const DISC = 'Template and heuristic output, not legal advice. Have it reviewed against the laws that apply to you.\n';
// Tracker domain list copied from privacy.js (own copy: modules must not import each other).
const TRK = {};
const trk = (cat, ...pairs) => { for (let i = 0; i < pairs.length; i += 2) TRK[pairs[i]] = [pairs[i + 1], cat]; };
trk('Analytics', 'google-analytics.com', 'Google Analytics', 'analytics.google.com', 'Google Analytics', 'stats.g.doubleclick.net', 'Google Analytics', 'hotjar.com', 'Hotjar', 'clarity.ms', 'Microsoft Clarity', 'mixpanel.com', 'Mixpanel', 'mxpnl.com', 'Mixpanel', 'amplitude.com', 'Amplitude', 'segment.com', 'Segment', 'segment.io', 'Segment', 'heap.io', 'Heap', 'heapanalytics.com', 'Heap', 'plausible.io', 'Plausible (privacy-friendly)', 'matomo.cloud', 'Matomo', 'posthog.com', 'PostHog', 'fullstory.com', 'FullStory', 'mouseflow.com', 'Mouseflow', 'crazyegg.com', 'Crazy Egg', 'luckyorange.com', 'Lucky Orange', 'omtrdc.net', 'Adobe Analytics', 'demdex.net', 'Adobe Audience Manager', '2o7.net', 'Adobe Analytics', 'quantserve.com', 'Quantcast', 'scorecardresearch.com', 'comScore', 'chartbeat.com', 'Chartbeat', 'newrelic.com', 'New Relic', 'nr-data.net', 'New Relic', 'mc.yandex.ru', 'Yandex Metrica', 'statcounter.com', 'StatCounter', 'cloudflareinsights.com', 'Cloudflare Web Analytics', 'simpleanalytics.com', 'Simple Analytics (privacy-friendly)', 'usefathom.com', 'Fathom (privacy-friendly)');
trk('Tag manager', 'googletagmanager.com', 'Google Tag Manager', 'tealiumiq.com', 'Tealium', 'tiqcdn.com', 'Tealium', 'ensighten.com', 'Ensighten', 'adobedtm.com', 'Adobe Launch');
trk('Advertising', 'doubleclick.net', 'Google DoubleClick', 'googlesyndication.com', 'Google AdSense', 'googleadservices.com', 'Google Ads', 'adservice.google.com', 'Google Ads', 'googletagservices.com', 'Google Publisher Tag', 'adnxs.com', 'Xandr / AppNexus', 'criteo.com', 'Criteo', 'criteo.net', 'Criteo', 'taboola.com', 'Taboola', 'outbrain.com', 'Outbrain', 'adsrvr.org', 'The Trade Desk', 'rubiconproject.com', 'Magnite', 'pubmatic.com', 'PubMatic', 'openx.net', 'OpenX', 'amazon-adsystem.com', 'Amazon Ads', 'bat.bing.com', 'Microsoft Ads UET', 'ads-twitter.com', 'X/Twitter Ads', 'analytics.tiktok.com', 'TikTok Pixel', 'snap.licdn.com', 'LinkedIn Insight', 'px.ads.linkedin.com', 'LinkedIn Insight', 'sc-static.net', 'Snap Pixel', 'ct.pinterest.com', 'Pinterest Tag', 'rlcdn.com', 'LiveRamp', 'bluekai.com', 'Oracle BlueKai', 'smartadserver.com', 'Smart AdServer', 'casalemedia.com', 'Index Exchange', 'mathtag.com', 'MediaMath', 'bidswitch.net', 'BidSwitch', 'adform.net', 'Adform', 'teads.tv', 'Teads', 'hs-scripts.com', 'HubSpot', 'hs-analytics.net', 'HubSpot', 'hsforms.com', 'HubSpot', 'marketo.net', 'Marketo', 'mktoresp.com', 'Marketo', 'pardot.com', 'Pardot', 'klaviyo.com', 'Klaviyo');
trk('Social', 'facebook.net', 'Meta (Facebook SDK/Pixel)', 'facebook.com', 'Meta (Facebook)', 'instagram.com', 'Instagram', 'twitter.com', 'X/Twitter', 'linkedin.com', 'LinkedIn', 'youtube.com', 'YouTube embed', 'youtube-nocookie.com', 'YouTube (no-cookie)', 'ytimg.com', 'YouTube', 'vimeo.com', 'Vimeo', 'addthis.com', 'AddThis', 'sharethis.com', 'ShareThis', 'disqus.com', 'Disqus', 'redditstatic.com', 'Reddit', 'tiktok.com', 'TikTok', 'pinimg.com', 'Pinterest');
trk('Session replay / A-B testing', 'optimizely.com', 'Optimizely', 'vwo.com', 'VWO', 'visualwebsiteoptimizer.com', 'VWO', 'abtasty.com', 'AB Tasty', 'logrocket.com', 'LogRocket', 'smartlook.com', 'Smartlook', 'inspectlet.com', 'Inspectlet');
trk('Error monitoring', 'sentry.io', 'Sentry', 'sentry-cdn.com', 'Sentry', 'bugsnag.com', 'Bugsnag', 'rollbar.com', 'Rollbar', 'datadoghq.com', 'Datadog RUM', 'datadoghq-browser-agent.com', 'Datadog RUM');
trk('Chat / support', 'intercom.io', 'Intercom', 'intercomcdn.com', 'Intercom', 'drift.com', 'Drift', 'zendesk.com', 'Zendesk', 'zdassets.com', 'Zendesk', 'crisp.chat', 'Crisp', 'tawk.to', 'Tawk.to', 'livechatinc.com', 'LiveChat', 'freshchat.com', 'Freshchat');
trk('Consent management', 'cookiebot.com', 'Cookiebot', 'onetrust.com', 'OneTrust', 'cookielaw.org', 'OneTrust', 'trustarc.com', 'TrustArc', 'usercentrics.eu', 'Usercentrics', 'didomi.io', 'Didomi', 'iubenda.com', 'iubenda');
trk('Fonts', 'fonts.googleapis.com', 'Google Fonts (visitor IP sent to Google; self-host to avoid GDPR risk)', 'fonts.gstatic.com', 'Google Fonts', 'use.typekit.net', 'Adobe Fonts', 'fast.fonts.net', 'Fonts.com', 'use.fontawesome.com', 'Font Awesome kit');
trk('CDN / third-party libs', 'cdnjs.cloudflare.com', 'cdnjs', 'cdn.jsdelivr.net', 'jsDelivr', 'unpkg.com', 'unpkg', 'ajax.googleapis.com', 'Google Hosted Libraries', 'code.jquery.com', 'jQuery CDN', 'stackpath.bootstrapcdn.com', 'BootstrapCDN', 'maxcdn.bootstrapcdn.com', 'BootstrapCDN', 'cloudfront.net', 'Amazon CloudFront', 'akamaihd.net', 'Akamai', 'fastly.net', 'Fastly', 'azureedge.net', 'Azure CDN', 'maps.googleapis.com', 'Google Maps', 'recaptcha.net', 'reCAPTCHA', 'gstatic.com', 'Google static', 'hcaptcha.com', 'hCaptcha');
function trackerFor(host) {
  host = host.toLowerCase().replace(/\.$/, '');
  for (let h = host; h.includes('.'); h = h.slice(h.indexOf('.') + 1)) if (TRK[h]) return TRK[h];
  return null;
}
const baseDomain = (h) => { const p = h.split('.'); return p.length > 2 && /^(co|com|org|net|gov|ac)$/.test(p[p.length - 2]) && p[p.length - 1].length === 2 ? p.slice(-3).join('.') : p.slice(-2).join('.'); };

// ---------- cookies and consent ----------
// [regex on cookie name, category, vendor, purpose]. Name-based guess only.
const CK = [
  [/^_ga(_.+)?$/, 'Analytics', 'Google Analytics', 'Distinguishes visitors / keeps session state'],
  [/^_gid$|^_gat/, 'Analytics', 'Google Analytics', 'Distinguishes visitors / throttles requests'],
  [/^__utm[a-z]$/, 'Analytics', 'Google Analytics (legacy)', 'Legacy visitor and campaign tracking'],
  [/^_gcl_|^_gac_|^_gaexp/, 'Marketing', 'Google Ads', 'Ad click and conversion attribution'],
  [/^(IDE|DSID|ANID|test_cookie|__gads|__gpi|1P_JAR|NID|AEC)$/, 'Marketing', 'Google (ads)', 'Ad personalisation and measurement'],
  [/^_fbp$|^_fbc$|^fr$|^datr$|^sb$/, 'Marketing', 'Meta', 'Ad targeting and conversion measurement'],
  [/^_uet|^MUID$|^_clck$|^_clsk$|^CLID$|^ANONCHK$|^SM$/, 'Marketing', 'Microsoft (Ads / Clarity)', 'Ad conversion tracking or session recording'],
  [/^_hj/, 'Analytics', 'Hotjar', 'Behaviour analytics and recordings'],
  [/^_pk_(id|ses|ref|cvar)|^mtm_|^_pk_/, 'Analytics', 'Matomo', 'Visitor analytics'],
  [/^(mp_.*_mixpanel|ajs_(anonymous_id|user_id)|amplitude_id.*|_hp2_.*|ph_.*_posthog|_pendo_.*|_vwo_.*|_vis_opt_.*|optimizelyEndUserId)$/, 'Analytics', 'Product analytics / A-B testing tool', 'Visitor identification for analytics or experiments'],
  [/^__hs(tc|sc|p)$|^hubspotutk$|^__hs_/, 'Marketing', 'HubSpot', 'Visitor tracking and lead attribution'],
  [/^_ttp$|^_tt_|^ttwid$|^tt_/, 'Marketing', 'TikTok', 'Ad measurement'],
  [/^_scid|^sc_at$|^_scid_r$/, 'Marketing', 'Snapchat', 'Ad measurement'],
  [/^_pin_unauth$|^_pinterest_/, 'Marketing', 'Pinterest', 'Ad measurement'],
  [/^(li_sugr|bcookie|bscookie|lidc|UserMatchHistory|AnalyticsSyncHistory|li_gc|_li_)/, 'Marketing', 'LinkedIn', 'Ad targeting and analytics'],
  [/^(personalization_id|guest_id|guest_id_ads|guest_id_marketing|muc_ads)$/, 'Marketing', 'X (Twitter)', 'Ad targeting'],
  [/^_rdt_uuid$/, 'Marketing', 'Reddit', 'Ad measurement'],
  [/^(VISITOR_INFO1_LIVE|YSC|VISITOR_PRIVACY_METADATA|GPS|PREF)$/, 'Marketing', 'YouTube', 'Video embed preferences and view tracking'],
  [/^(cf_clearance|__cf_bm|__cflb|__cfruid|cf_chl_.*)$/, 'Necessary', 'Cloudflare', 'Bot management / security'],
  [/^(AWSALB|AWSALBCORS|AWSELB|AWSELBCORS)$/, 'Necessary', 'AWS load balancer', 'Session stickiness'],
  [/^(PHPSESSID|JSESSIONID|ASP\.NET_SessionId|connect\.sid|sessionid|session|sid|_session_id|laravel_session|ci_session|_csrf|csrftoken|XSRF-TOKEN|csrf_token|__RequestVerificationToken|_xsrf)$/i, 'Necessary', 'Site / framework', 'Session or CSRF protection'],
  [/^__Host-|^__Secure-/, 'Necessary', 'Site', 'Prefixed cookies are normally session or security cookies'],
  [/^(CookieConsent|OptanonConsent|OptanonAlertBoxClosed|euconsent-v2|cookieconsent_status|cmplz_.*|cookie_notice_accepted|borlabs-cookie|moove_gdpr_popup|tarteaucitron|didomi_token|usprivacy|__cmpconsent.*)$/i, 'Necessary', 'Consent tool', 'Stores the visitor\'s consent choice'],
  [/^wordpress_(logged_in|sec)_|^wordpress_test_cookie$|^wp-settings-|^comment_author/, 'Necessary', 'WordPress', 'Login, settings and comment form state'],
  [/^(woocommerce_(cart_hash|items_in_cart|recently_viewed)|wp_woocommerce_session_.*|PrestaShop-.*|frontend|_shopify_(s|y)|cart|cart_sig|secure_customer_sig|localization)$/i, 'Necessary', 'Shop platform', 'Shopping cart and checkout state'],
  [/^(lang|language|locale|i18next|NEXT_LOCALE|currency|country|theme|dark_mode|pll_language|wpml_.*)$/i, 'Functional', 'Site', 'Remembers a language, region or display choice'],
];
const TRACKING_CATS = ['Analytics', 'Marketing'];
function classifyCookie(name) {
  for (const [re, cat, vendor, why] of CK) if (re.test(name)) return { cat, vendor, why };
  return { cat: 'Unknown', vendor: '', why: 'Not in the built-in list. Check the vendor documentation or the script that sets it.' };
}
const cookieNames = (t) => lines(t).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).flatMap((l) => (/^cookie:/i.test(l) ? l.replace(/^cookie:\s*/i, '').split(/;\s*/) : [l.replace(/^set-cookie:\s*/i, '')])).map((l) => l.split(/[=;\s]/)[0]).filter(Boolean);
const needsConsent = (cat) => ({ Necessary: 'Usually exempt (strictly necessary)', Functional: 'Review: exempt only if the visitor asked for that feature', Analytics: 'Usually needs consent (some regulators exempt narrow first-party audience measurement)', Marketing: 'Needs consent', Unknown: 'Review' }[cat]);

T.push({
  id: 'cookie-classifier', cat: B, title: 'Cookie Classifier (Necessary, Analytics, Marketing)',
  desc: 'Paste cookie names (or Set-Cookie / Cookie lines) and sort them into necessary, functional, analytics and marketing using a built-in name list. Unknown names are marked for review.',
  placeholder: ['_ga\n_fbp\nPHPSESSID\nOptanonConsent\nmystery_cookie'],
  sample: '_ga\n_ga_ABC123\n_fbp\nPHPSESSID\nOptanonConsent\ncf_clearance\nlang\nmystery_cookie=1',
  labels: ['Cookie names, one per line (or paste a Cookie / Set-Cookie header)'],
  run: ([t]) => {
    const names = [...new Set(cookieNames(t))];
    if (!names.length) throw new Error('Enter at least one cookie name');
    const rows = names.map((n) => ({ n, ...classifyCookie(n) }));
    const count = {}; rows.forEach((r) => { count[r.cat] = (count[r.cat] || 0) + 1; });
    let o = `${rows.length} cookie name(s): ` + Object.entries(count).map(([k, v]) => `${k} ${v}`).join(', ') + '\n\n';
    o += rows.map((r) => `${r.n}\n  Category: ${r.cat}${r.vendor ? ' (' + r.vendor + ')' : ''}\n  Purpose: ${r.why}\n  Consent: ${needsConsent(r.cat)}`).join('\n\n');
    return o + '\n\nHeuristic: this matches names only. A site can reuse any name, so confirm each cookie against the script that sets it. Regulators differ on which analytics cookies are exempt. Not legal advice.';
  },
});

const MONTH = 30.44;
function durText(s) {
  s = String(s || '').trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(second|sec|minute|min|hour|day|week|month|year|session)s?/i);
  if (!m) return s || 'Session';
  return s;
}
T.push({
  id: 'cookie-table-builder', cat: L, title: 'Cookie Table Builder for a Cookie Policy',
  desc: 'Turn a list of cookies, purposes and durations into a cookie policy table grouped by category. Missing categories are guessed from the cookie name.',
  inputs: 1, labels: ['One cookie per line: name | purpose | duration | provider | category (last two optional)'],
  opts: [{ id: 'format', label: 'Output format', type: 'select', choices: ['Markdown', 'HTML'], def: 'Markdown' }],
  sample: '_ga | Distinguishes visitors for statistics | 2 years | Google\n_fbp | Ad measurement | 3 months | Meta | Marketing\nPHPSESSID | Keeps your session | Session | This site\nlang | Remembers your language | 1 year | This site | Functional',
  run: ([t], o) => {
    const rows = lines(t).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split('|').map((x) => x.trim()));
    if (!rows.length) throw new Error('Enter at least one cookie');
    const groups = {};
    for (const [name, purpose = '', dur = '', prov = '', cat = ''] of rows) {
      const g = classifyCookie(name);
      const c = ['Necessary', 'Functional', 'Analytics', 'Marketing'].find((x) => x.toLowerCase() === cat.toLowerCase()) || (g.cat === 'Unknown' ? 'Unclassified' : g.cat);
      (groups[c] ||= []).push({ name, purpose: purpose || (g.cat === 'Unknown' ? '' : g.why), dur: durText(dur), prov: prov || g.vendor });
    }
    const order = ['Necessary', 'Functional', 'Analytics', 'Marketing', 'Unclassified'];
    let out = '';
    for (const c of order.filter((x) => groups[x])) {
      const miss = groups[c].some((r) => !r.purpose || !r.dur || !r.prov);
      if (o.format === 'HTML') {
        out += `<h3>${c} cookies</h3>\n<table>\n<thead><tr><th scope="col">Cookie</th><th scope="col">Purpose</th><th scope="col">Duration</th><th scope="col">Provider</th></tr></thead>\n<tbody>\n` + groups[c].map((r) => `<tr><th scope="row">${esc(r.name)}</th><td>${esc(r.purpose)}</td><td>${esc(r.dur)}</td><td>${esc(r.prov)}</td></tr>`).join('\n') + '\n</tbody>\n</table>\n\n';
      } else {
        out += `### ${c} cookies\n\n| Cookie | Purpose | Duration | Provider |\n|---|---|---|---|\n` + groups[c].map((r) => `| ${r.name} | ${r.purpose} | ${r.dur} | ${r.prov} |`).join('\n') + '\n\n';
      }
      if (miss) out += (o.format === 'HTML' ? '<!-- ' : '') + `Review: some ${c} rows have an empty purpose, duration or provider.` + (o.format === 'HTML' ? ' -->' : '') + '\n\n';
    }
    return out.trim() + '\n';
  },
});

const CHECKS = [
  ['reject', 'A "Reject all" (or equivalent) button is on the first layer', 'Regulators expect refusing to be as easy as accepting.'],
  ['equal', 'Accept and reject look equally prominent (same size, colour weight and position)', 'Unequal styling is a common finding in banner reviews.'],
  ['noprechecked', 'No optional category or vendor box is pre-ticked', 'Pre-ticked boxes are not valid consent under GDPR (CJEU Planet49, C-673/17).'],
  ['granular', 'Visitors can choose by purpose or category, not only all-or-nothing', 'Consent should be specific to each purpose (GDPR Art. 4(11), recital 32).'],
  ['noscripts', 'No analytics or marketing script or cookie loads before the choice', 'Check with browser dev tools, not the banner settings.'],
  ['withdraw', 'A permanent link or button lets visitors change or withdraw consent', 'Withdrawing must be as easy as giving consent (GDPR Art. 7(3)).'],
  ['nowall', 'The site works without accepting (no cookie wall)', 'Access made conditional on tracking consent is often not "freely given".'],
  ['info', 'The first layer names the purposes, and vendors are listed on request', 'Consent needs to be informed.'],
  ['closex', 'Closing the banner (X, Esc, ignoring it) counts as no consent', 'Scrolling or continuing to browse is not a clear affirmative act.'],
  ['remember', 'The choice is stored and not asked again on every page', 'Avoids pressure from repeated prompts.'],
  ['gpc', 'A Global Privacy Control signal is treated as an opt-out where the law requires it', 'Relevant mainly for US state laws such as California.'],
  ['log', 'Consent records are kept (what, when, which version of the text)', 'The controller must be able to show consent was given (GDPR Art. 7(1)).'],
];
T.push({
  id: 'consent-banner-checklist', cat: L, title: 'Consent Banner Compliance Checklist',
  desc: 'Tick what your cookie banner does and get a list of items to review: equal reject button, no pre-ticked boxes, granular choices, withdrawal and more. Checklist, not legal advice.',
  inputs: 0, sample: '',
  opts: CHECKS.map(([id, label], i) => ({ id, label, type: 'checkbox', def: i % 4 !== 1 })),
  run: (_i, o) => {
    const fails = CHECKS.filter(([id]) => !o[id]);
    let out = `${CHECKS.length - fails.length} of ${CHECKS.length} items ticked. ${fails.length ? fails.length + ' to review.' : 'Nothing to review from this list.'}\n\n`;
    out += CHECKS.map(([id, label, why]) => `${o[id] ? '[ok]    ' : '[review]'} ${label}${o[id] ? '' : '\n         Why it matters: ' + why}`).join('\n');
    return out + '\n\nThis checklist covers common points from EU data protection authority guidance on cookie banners. Rules and enforcement differ by country and change over time, and a ticked box here is your own statement, not a test of the live banner. Not legal advice.';
  },
});

const CM_SIGNALS = ['ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization', 'functionality_storage', 'personalization_storage', 'security_storage'];
T.push({
  id: 'google-consent-mode-snippet', cat: L, title: 'Google Consent Mode v2 Snippet Builder',
  desc: 'Generate the gtag consent default and update code with ad_storage, analytics_storage, ad_user_data and ad_personalization, plus optional region and wait_for_update.',
  inputs: 0, sample: '',
  opts: [
    ...CM_SIGNALS.map((s, i) => ({ id: s, label: `Default for ${s}`, type: 'select', choices: ['denied', 'granted'], def: i === 6 ? 'granted' : 'denied' })),
    { id: 'region', label: 'Apply default only to these regions (comma separated ISO codes, empty = everywhere)', type: 'text', def: '' },
    { id: 'wait', label: 'wait_for_update (ms, 0 = off)', type: 'number', def: 500 },
    { id: 'redact', label: 'ads_data_redaction while ad_storage is denied', type: 'checkbox', def: true },
    { id: 'passthrough', label: 'url_passthrough', type: 'checkbox', def: false },
  ],
  run: (_i, o) => {
    const q = (s) => `'${s}'`;
    const def = CM_SIGNALS.map((s) => `    ${q(s)}: ${q(o[s])}`).join(',\n');
    const w = Math.max(0, parseInt(o.wait, 10) || 0);
    const regs = String(o.region || '').split(/[\s,]+/).filter(Boolean);
    if (regs.some((r) => !/^[A-Za-z]{2}(-[A-Za-z0-9]{1,3})?$/.test(r))) throw new Error('Regions must be ISO codes such as DE or US-CA');
    let s = '<script>\nwindow.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\n\n// 1. Defaults. This must run BEFORE the Google tag or Tag Manager loads.\ngtag(\'consent\', \'default\', {\n' + def + (w ? ',\n    \'wait_for_update\': ' + w : '') + (regs.length ? ',\n    \'region\': [' + regs.map((r) => q(r.toUpperCase())).join(', ') + ']' : '') + '\n});\n';
    if (o.redact) s += "gtag('set', 'ads_data_redaction', true);\n";
    if (o.passthrough) s += "gtag('set', 'url_passthrough', true);\n";
    s += `\n// 2. Call this from your consent banner when the visitor chooses.\nfunction updateConsent(choice) {\n  // choice: { analytics: true/false, ads: true/false }\n  var a = choice.ads ? 'granted' : 'denied', s = choice.analytics ? 'granted' : 'denied';\n  gtag('consent', 'update', {\n    'ad_storage': a,\n    'ad_user_data': a,\n    'ad_personalization': a,\n    'analytics_storage': s\n  });\n}\n</script>\n`;
    s += '\n<!-- Then load the Google tag / Tag Manager snippet below this block. -->\n';
    return s + '\nNotes: with a region list, add a second default call without regions for the rest of the world if you want different behaviour there. Only your consent banner (CMP) can decide what the visitor chose; this code does not collect consent. Google documents these signals in the Consent Mode reference; check it for changes.';
  },
});

const GCD = { l: 'not set through consent mode', p: 'denied by default, no update', q: 'denied by default, still denied after update', t: 'granted by default, no update', r: 'denied by default, granted by update', m: 'denied by update, no default set', n: 'granted by update, no default set', u: 'granted by default, denied by update', v: 'granted by default, still granted after update' };
const GCD_SIGNALS = ['ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization'];
T.push({
  id: 'consent-mode-debugger', cat: B, title: 'Consent Mode gcs and gcd Decoder',
  desc: 'Paste Google tag request URLs or the gcs and gcd values and see the consent state for ad_storage, analytics_storage, ad_user_data and ad_personalization.',
  placeholder: ['https://www.google-analytics.com/g/collect?v=2&tid=G-XXXX&gcs=G101&gcd=13r3r3r2r5'],
  labels: ['Request URLs, query strings, or values like gcs=G111 / gcd=11t1t1t1t5 (one per line)'],
  sample: 'https://www.google-analytics.com/g/collect?v=2&tid=G-XXXX&gcs=G101&gcd=13r3r3q3q5\ngcs=G100&gcd=13p3p3p3p5\ngcd=11t1t1t1t5',
  run: ([t]) => {
    const ls = lines(t).map((l) => l.trim()).filter(Boolean);
    if (!ls.length) throw new Error('Paste at least one request or value');
    const out = [];
    ls.forEach((l, i) => {
      const gcs = (l.match(/(?:^|[?&\s])gcs=([^&\s]+)/) || [])[1];
      const gcd = (l.match(/(?:^|[?&\s])gcd=([^&\s]+)/) || [])[1];
      const b = [`Line ${i + 1}: ${l.length > 90 ? l.slice(0, 90) + '...' : l}`];
      if (!gcs && !gcd) b.push('  No gcs or gcd parameter found. These are only sent by Google tags (and may be missing on some hits).');
      if (gcs) {
        const m = gcs.match(/^G1([01])([01])$/);
        b.push(m ? `  gcs=${gcs} (original Consent Mode v1 signal)\n    ad_storage: ${m[1] === '1' ? 'granted' : 'denied'}\n    analytics_storage: ${m[2] === '1' ? 'granted' : 'denied'}` : `  gcs=${gcs}: not in the usual G1xy form (x = ad_storage, y = analytics_storage). Review.`);
      }
      if (gcd) {
        const m = gcd.match(/^(\d)(\d)([a-z])(\d)([a-z])(\d)([a-z])(\d)([a-z])(\d)$/);
        if (!m) b.push(`  gcd=${gcd}: not in the expected form 1<n><letter> x4 <n>. Review.`);
        else {
          b.push(`  gcd=${gcd} (v2 signal)`);
          [3, 5, 7, 9].forEach((k, j) => b.push(`    ${GCD_SIGNALS[j]}: ${m[k]} = ${GCD[m[k]] || 'unknown letter'}`));
        }
      }
      out.push(b.join('\n'));
    });
    return out.join('\n\n') + '\n\nGoogle does not publish the gcd format. The letter table comes from third-party documentation (CookieHub) and may change, so treat it as a debugging aid. The gcs mapping is the original Consent Mode form.';
  },
});

T.push({
  id: 'gpc-snippet-generator', cat: L, title: 'Global Privacy Control Script Gate (JavaScript Generator)',
  desc: 'Generate JavaScript that checks navigator.globalPrivacyControl before loading the third-party scripts you list, plus the matching Sec-GPC server check.',
  labels: ['Scripts to gate, one per line: name | https://script-url'],
  sample: 'Analytics | https://analytics.example.com/tag.js\nAd pixel | https://ads.example.com/pixel.js',
  opts: [
    { id: 'dnt', label: 'Also treat Do Not Track as an opt-out (legacy, widely ignored)', type: 'checkbox', def: false },
    { id: 'consent', label: 'Also require a consent check function (window.hasConsent)', type: 'checkbox', def: true },
  ],
  run: ([t], o) => {
    const items = lines(t).map((l) => l.trim()).filter(Boolean).map((l) => { const [n, u] = l.split('|').map((x) => x.trim()); if (!u || !/^https:\/\//i.test(u)) throw new Error(`Use "name | https://url" (line: ${l})`); return [n, u]; });
    if (!items.length) throw new Error('List at least one script');
    const list = items.map(([n, u]) => `    { name: ${JSON.stringify(n)}, src: ${JSON.stringify(u)} }`).join(',\n');
    return `<script>
(function () {
  var scripts = [
${list}
  ];
  function optedOut() {
    if (navigator.globalPrivacyControl === true) return true;${o.dnt ? "\n    if (navigator.doNotTrack === '1') return true;" : ''}
    return false;
  }
  window.loadGatedScripts = function () {
    if (optedOut()) return;${o.consent ? "\n    if (typeof window.hasConsent !== 'function' || !window.hasConsent()) return;" : ''}
    scripts.forEach(function (s) {
      var el = document.createElement('script');
      el.src = s.src; el.async = true; el.dataset.gated = s.name;
      document.head.appendChild(el);
    });
  };
  // Call loadGatedScripts() on page load (if consent is already stored) and again after the visitor consents.
  document.addEventListener('DOMContentLoaded', window.loadGatedScripts);
})();
</script>

# Server side: browsers send "Sec-GPC: 1" on every request when GPC is on.
# Honour it there too, for example in nginx:
#   map $http_sec_gpc $gpc_optout { default 0; "1" 1; }
# Then skip tracking tags in your templates when $gpc_optout is 1.

Notes: GPC is a legal opt-out signal under some US state laws (California treats it as a valid request to opt out of sale and sharing). In the EU it does not replace consent. Check which rules apply to you.`;
  },
});

// ---------- IAB strings ----------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function bitsOf(s) {
  let b = '';
  for (const c of s.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')) { const v = B64.indexOf(c); if (v < 0) throw new Error(`Invalid base64url character "${c}"`); b += v.toString(2).padStart(6, '0'); }
  return b;
}
class Rd {
  constructor(b) { this.b = b; this.p = 0; }
  left() { return this.b.length - this.p; }
  n(k) { if (this.p + k > this.b.length) throw new Error('String is too short for the fields it declares'); const v = parseInt(this.b.slice(this.p, this.p + k) || '0', 2); this.p += k; return v; }
  big(k) { if (this.p + k > this.b.length) throw new Error('String is too short for the fields it declares'); const v = BigInt('0b' + this.b.slice(this.p, this.p + k)); this.p += k; return v; }
  bit() { return this.n(1) === 1; }
  flags(k) { const a = []; for (let i = 1; i <= k; i++) if (this.bit()) a.push(i); return a; }
}
const TCF_PURPOSES = ['Store and/or access information on a device', 'Use limited data to select advertising', 'Create profiles for personalised advertising', 'Use profiles to select personalised advertising', 'Create profiles to personalise content', 'Use profiles to select personalised content', 'Measure advertising performance', 'Measure content performance', 'Understand audiences through statistics or combinations of data from different sources', 'Develop and improve services', 'Use limited data to select content'];
const TCF_SPECIAL = ['Use precise geolocation data', 'Actively scan device characteristics for identification'];
function vendorSection(r) {
  const max = r.n(16);
  if (!r.bit()) return { max, ids: r.flags(max) };
  const ids = []; let k = r.n(12);
  while (k--) { const range = r.bit(); const a = r.n(16); if (range) { const z = r.n(16); if (z < a || z - a > 70000) throw new Error('Invalid vendor range'); for (let v = a; v <= z; v++) ids.push(v); } else ids.push(a); }
  return { max, ids };
}
const rangeText = (ids) => { if (!ids.length) return 'none'; const o = []; let a = ids[0], p = a; for (const v of ids.slice(1).concat([Infinity])) { if (v === p + 1) { p = v; continue; } o.push(a === p ? '' + a : `${a}-${p}`); a = p = v; } const s = o.join(', '); return `${ids.length} vendor(s): ${s.length > 400 ? s.slice(0, 400) + ', ...' : s}`; };
const lang2 = (a, b) => String.fromCharCode(65 + a, 65 + b);
const tcfDate = (n) => new Date(n * 100).toISOString().replace('.000Z', 'Z');
function decodeTcf(str) {
  const segs = str.split('.'); const o = [];
  const r = new Rd(bitsOf(segs[0]));
  const version = r.n(6);
  if (version !== 2) throw new Error(`Only TCF v2 strings are supported (this one says version ${version})`);
  const created = r.n(36), updated = r.n(36), cmp = r.n(12), cmpV = r.n(12), screen = r.n(6), la = r.n(6), lb = r.n(6), vl = r.n(12), pol = r.n(6), svc = r.bit(), nst = r.bit();
  const sf = r.flags(12), pc = r.flags(24), pli = r.flags(24), p1 = r.bit(), cc = lang2(r.n(6), r.n(6));
  o.push('Core segment', `  TCF version: ${version}, policy version ${pol}${pol === 4 ? ' (TCF v2.2 uses policy version 4)' : ''}`, `  Created: ${tcfDate(created)}`, `  Last updated: ${tcfDate(updated)}`, `  CMP id: ${cmp}, CMP version ${cmpV}, consent screen ${screen}`, `  Consent language: ${lang2(la, lb)}`, `  Vendor list version: ${vl}`, `  Service specific: ${svc ? 'yes (applies to this service only)' : 'no (global)'}`, `  Non-standard texts used: ${nst ? 'yes' : 'no'}`, `  Purpose one treatment: ${p1 ? 'yes (purpose 1 disclosure special case for this country)' : 'no'}`, `  Publisher country: ${cc}`);
  o.push('', 'Special features opted in', sf.length ? sf.map((i) => `  ${i}. ${TCF_SPECIAL[i - 1] || 'Special feature ' + i}`).join('\n') : '  none');
  const allP = new Set([...pc, ...pli]);
  o.push('', 'Purposes (C = consent, LI = legitimate interest transparency established)');
  if (!allP.size) o.push('  none');
  for (const i of [...allP].sort((a, b) => a - b)) o.push(`  ${String(i).padStart(2)}. ${TCF_PURPOSES[i - 1] || 'Purpose ' + i}: ${[pc.includes(i) ? 'C' : '', pli.includes(i) ? 'LI' : ''].filter(Boolean).join(' + ')}`);
  const vc = vendorSection(r), vli = vendorSection(r);
  o.push('', 'Vendors with consent', '  ' + rangeText(vc.ids), '', 'Vendors with legitimate interest', '  ' + rangeText(vli.ids));
  let np = r.n(12);
  o.push('', 'Publisher restrictions');
  if (!np) o.push('  none');
  const RT = ['not allowed', 'require consent', 'require legitimate interest', 'undefined'];
  while (np--) { const pid = r.n(6), rt = r.n(2); let k = r.n(12); const ids = []; while (k--) { const range = r.bit(); const a = r.n(16); if (range) { const z = r.n(16); for (let v = a; v <= z && ids.length < 5000; v++) ids.push(v); } else ids.push(a); } o.push(`  Purpose ${pid}: ${RT[rt]} for ${rangeText(ids)}`); }
  for (const s of segs.slice(1)) {
    const q = new Rd(bitsOf(s)); const ty = q.n(3);
    if (ty === 1) { const d = vendorSection(q); o.push('', 'Disclosed vendors segment', '  ' + rangeText(d.ids)); }
    else if (ty === 3) { const a = q.flags(24), b = q.flags(24), n = q.n(6); o.push('', 'Publisher TC segment', `  Publisher purposes consent: ${a.join(', ') || 'none'}`, `  Publisher purposes legitimate interest: ${b.join(', ') || 'none'}`, `  Custom purposes: ${n}`); }
    else o.push('', `Segment type ${ty}: not decoded`);
  }
  return o;
}
const TCF_SAMPLE = 'CQSbk4AQSbk4ANwAAAENAwCgAAAAAAAAAAYgACPAAAAA.IDKQA4AAgAKAGQAygAAA.YAAAAAAAAAAA';
T.push({
  id: 'tcf-string-decoder', cat: B, title: 'IAB TCF v2 Consent String Decoder',
  desc: 'Decode a TC string (euconsent-v2) into dates, CMP id, purposes with consent or legitimate interest, vendor ids, publisher restrictions and extra segments.',
  labels: ['TC string (the euconsent-v2 cookie value)'], sample: TCF_SAMPLE, placeholder: [TCF_SAMPLE],
  run: ([t]) => {
    const s = t.trim().replace(/^["']|["']$/g, ''); if (!s) throw new Error('Paste a TC string');
    return decodeTcf(s).join('\n') + '\n\nVendor ids are shown as numbers: names need IAB\'s Global Vendor List, which is not bundled. Purpose names follow the TCF policy text.';
  },
});

const GPP_SECTIONS = { 1: 'EU TCF v1 (deprecated)', 2: 'EU TCF v2', 3: 'GPP header', 4: 'GPP signal integrity', 5: 'Canadian TCF', 6: 'US Privacy String (uspv1)', 7: 'US National (usnat)', 8: 'US California (usca)', 9: 'US Virginia (usva)', 10: 'US Colorado (usco)', 11: 'US Utah (usut)', 12: 'US Connecticut (usct)', 13: 'US Florida (usfl)', 14: 'US Montana (usmt)', 15: 'US Oregon (usor)', 16: 'US Texas (ustx)', 17: 'US Delaware (usde)', 18: 'US Iowa (usia)', 19: 'US Nebraska (usne)', 20: 'US New Hampshire (usnh)', 21: 'US New Jersey (usnj)', 22: 'US Tennessee (ustn)', 23: 'US Minnesota (usmn)', 24: 'US Maryland (usmd)', 25: 'US Indiana (usin)', 26: 'US Kentucky (usky)', 27: 'US Rhode Island (usri)' };
function fibRead(r) {
  const f = [1, 2]; let v = 0, prev = 0, i = 0;
  for (;;) {
    const b = r.n(1);
    if (b && prev) return v;
    if (i >= f.length) f.push(f[i - 1] + f[i - 2]);
    if (b) v += f[i];
    prev = b; i++;
    if (i > 40) throw new Error('Invalid Fibonacci code in header');
  }
}
function gppHeader(h) {
  const r = new Rd(bitsOf(h));
  const ty = r.n(6), ver = r.n(6);
  if (ty !== 3) throw new Error('Header type is not 3: not a GPP string');
  let k = r.n(12); const ids = []; let last = 0;
  while (k--) { const grp = r.n(1); const a = last + fibRead(r); if (grp) { const len = fibRead(r); for (let v = a; v <= a + len; v++) ids.push(v); last = a + len; } else { ids.push(a); last = a; } }
  return { ver, ids };
}
function ynNA(v, kind) {
  if (kind === 'notice') return ['not applicable', 'notice provided', 'notice not provided', 'invalid'][v];
  if (kind === 'opt') return ['not applicable or not provided', 'opted out', 'did not opt out', 'invalid'][v];
  if (kind === 'consent') return ['not applicable', 'no consent', 'consent', 'invalid'][v];
  return ['not applicable', 'yes', 'no', 'invalid'][v];
}
const SENS = ['racial or ethnic origin', 'religious or philosophical beliefs', 'health', 'sex life or sexual orientation', 'citizenship or immigration status', 'genetic data', 'biometric data', 'precise geolocation', 'government ID numbers', 'account credentials', 'union membership', 'private communications', 'consumer health data', 'victim of crime status', 'national origin', 'transgender or nonbinary status'];
function decodeUsNat(body) {
  const segs = body.split('.'); const r = new Rd(bitsOf(segs[0])); const o = [];
  o.push(`  Version: ${r.n(6)}`);
  [['SharingNotice', 'notice'], ['SaleOptOutNotice', 'notice'], ['SharingOptOutNotice', 'notice'], ['TargetedAdvertisingOptOutNotice', 'notice'], ['SensitiveDataProcessingOptOutNotice', 'notice'], ['SensitiveDataLimitUseNotice', 'notice'], ['SaleOptOut', 'opt'], ['SharingOptOut', 'opt'], ['TargetedAdvertisingOptOut', 'opt']].forEach(([n, k]) => o.push(`  ${n}: ${ynNA(r.n(2), k)}`));
  const sd = SENS.map((n) => [n, r.n(2)]).filter(([, v]) => v); o.push('  SensitiveDataProcessing: ' + (sd.length ? sd.map(([n, v]) => `${n}=${ynNA(v, 'consent')}`).join('; ') : 'all not applicable'));
  const kc = ['ages 13 to 16', 'under 13', 'ages 16 to 17'].map((n) => [n, r.n(2)]).filter(([, v]) => v); o.push('  KnownChildSensitiveDataConsents: ' + (kc.length ? kc.map(([n, v]) => `${n}=${ynNA(v, 'consent')}`).join('; ') : 'all not applicable'));
  o.push(`  PersonalDataConsents: ${ynNA(r.n(2), 'consent')}`, `  MspaCoveredTransaction: ${ynNA(r.n(2), 'yn')}`, `  MspaOptOutOptionMode: ${ynNA(r.n(2), 'yn')}`, `  MspaServiceProviderMode: ${ynNA(r.n(2), 'yn')}`);
  for (const s of segs.slice(1)) { const q = new Rd(bitsOf(s)); const ty = q.n(2); o.push(ty === 1 ? `  GPC subsection: Gpc = ${q.bit() ? 'true' : 'false'}` : `  Subsection type ${ty}: not decoded`); }
  return o;
}
function decodeUsp(s) {
  const m = s.match(/^1([YN-])([YN-])([YN-])$/i); if (!m) throw new Error('A US Privacy string has 4 characters, for example 1YNN');
  const w = { Y: 'yes', N: 'no', '-': 'unknown or not applicable' };
  return [`  Version: 1`, `  Notice and opportunity to opt out given: ${w[m[1].toUpperCase()]}`, `  User opted out of sale: ${w[m[2].toUpperCase()]}`, `  LSPA covered transaction: ${w[m[3].toUpperCase()]}`];
}
T.push({
  id: 'gpp-string-decoder', cat: B, title: 'IAB GPP String Decoder (Global Privacy Platform)',
  desc: 'Decode a Global Privacy Platform string: header, section ids, plus the contents of the EU TCF v2, US Privacy and US National sections. Other US state sections are listed only.',
  labels: ['GPP string (sections separated by ~)'], placeholder: ['DBABM~CPXxRfAPXxRfAAfKABENB-CgAAAAAAAAAAYgAAAAAAAA'],
  sample: 'DBACNY~CPXxRfAPXxRfAAfKABENB-CgAAAAAAAAAAYgAAAAAAAA~1YNN',
  run: ([t]) => {
    const s = t.trim().replace(/^["']|["']$/g, ''); if (!s) throw new Error('Paste a GPP string');
    const parts = s.split('~'); const h = gppHeader(parts[0]);
    const o = [`Header: GPP version ${h.ver}, ${h.ids.length} section(s): ${h.ids.map((i) => `${i} = ${GPP_SECTIONS[i] || 'unknown id'}`).join('; ')}`];
    if (parts.length - 1 !== h.ids.length) o.push(`Review: the header lists ${h.ids.length} section(s) but the string has ${parts.length - 1}.`);
    h.ids.forEach((id, i) => {
      const body = parts[i + 1]; o.push('', `Section ${id}: ${GPP_SECTIONS[id] || 'unknown'}`);
      if (body == null) { o.push('  missing'); return; }
      try {
        if (id === 2) o.push(...decodeTcf(body).map((l) => (l ? '  ' + l : l)));
        else if (id === 6) o.push(...decodeUsp(body));
        else if (id === 7) o.push(...decodeUsNat(body));
        else o.push(`  Not decoded by this tool. Raw: ${body.length > 80 ? body.slice(0, 80) + '...' : body}`);
      } catch (e) { o.push('  Could not decode: ' + e.message); }
    });
    return o.join('\n') + '\n\nSection ids come from the IAB Tech Lab section list. US state sections other than National are not decoded here.';
  },
});

T.push({
  id: 'us-privacy-string-decoder', cat: B, title: 'US Privacy String (CCPA usprivacy) Decoder',
  desc: 'Decode a legacy 4-character CCPA US Privacy string such as 1YNN into notice given, sale opt-out and LSPA covered transaction. Shows what each position means.',
  labels: ['US Privacy string'], sample: '1YNN', placeholder: ['1YNN'],
  run: ([t]) => {
    const s = t.trim().replace(/^["']|["']$/g, '');
    const o = decodeUsp(s);
    const note = /^1---$/.test(s) ? '\nThe string 1--- means the CCPA does not apply to this transaction.' : '';
    return o.join('\n') + note + '\n\nIAB Tech Lab states the US Privacy signal was deprecated as of 31 January 2024 in favour of the Global Privacy Platform (see the GPP decoder).';
  },
});

T.push({
  id: 'gpc-signal-tester', cat: B, title: 'Global Privacy Control Signal Tester', custom: true,
  desc: 'Shows whether this browser sends the Global Privacy Control signal (navigator.globalPrivacyControl) and Do Not Track, and how a site is expected to react.',
  render: (el) => {
    el.innerHTML = '';
    const box = document.createElement('div');
    const st = document.createElement('p'); st.setAttribute('role', 'status');
    const ul = document.createElement('ul');
    const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'Check again';
    const note = document.createElement('p');
    note.textContent = 'A website can read the JavaScript value and also sees the Sec-GPC: 1 request header, which this page cannot display. Under some US state laws (California, for example) a site should treat GPC as an opt-out of sale and sharing. In the EU it is not a consent mechanism. If a site ignores it, that is worth reporting. The result below comes only from your browser.';
    const go = () => {
      const g = navigator.globalPrivacyControl, d = navigator.doNotTrack;
      st.textContent = g === true ? 'Global Privacy Control is ON: this browser asks sites not to sell or share your data.' : g === false ? 'Global Privacy Control is supported but OFF.' : 'This browser does not expose navigator.globalPrivacyControl (unsupported, or hidden by privacy settings).';
      ul.innerHTML = '';
      [['navigator.globalPrivacyControl', String(g)], ['navigator.doNotTrack (legacy)', String(d)]].forEach(([k, v]) => { const li = document.createElement('li'); li.textContent = `${k}: ${v}`; ul.appendChild(li); });
    };
    btn.addEventListener('click', go);
    box.append(st, ul, btn, note); el.appendChild(box); go();
  },
});

// ---------- trackers and domains ----------
const hostOf = (s) => { s = s.trim(); try { return new URL(/^[a-z]+:\/\//i.test(s) ? s : 'https://' + s).hostname.toLowerCase(); } catch { return ''; } };
T.push({
  id: 'third-party-domain-classifier', cat: B, title: 'Third-Party Domain Classifier (Vendor and Category)',
  desc: 'Paste domains or URLs and see the vendor and category of each: analytics, advertising, social, session replay, fonts, CDN and more. Unknown domains are listed for review.',
  labels: ['Domains or URLs, one per line'],
  sample: 'www.google-analytics.com\nhttps://connect.facebook.net/en_US/fbevents.js\nfonts.gstatic.com\nstatic.hotjar.com\ncdn.example-vendor.net\nsentry.io',
  run: ([t]) => {
    const hosts = [...new Set(lines(t).map(hostOf).filter(Boolean))];
    if (!hosts.length) throw new Error('Enter at least one domain');
    const by = {}; const unk = [];
    for (const h of hosts) { const r = trackerFor(h); if (r) (by[r[1]] ||= []).push(`${h}  ->  ${r[0]}`); else unk.push(h); }
    let o = `${hosts.length} domain(s): ${hosts.length - unk.length} classified, ${unk.length} not in the list.\n`;
    for (const [c, l] of Object.entries(by)) o += `\n${c}\n` + l.map((x) => '  ' + x).join('\n');
    if (unk.length) o += '\n\nNot classified (review: could be first-party, a small vendor or a tracker)\n' + unk.map((x) => '  ' + x).join('\n');
    return o + '\n\nThe list has about 150 well-known domains, matched by domain suffix. It is not a complete tracker database and does not say what a request actually sends.';
  },
});

const PRE_HIGH = ['Analytics', 'Advertising', 'Social', 'Session replay / A-B testing', 'Tag manager'];
const PRE_REVIEW = ['Fonts', 'Chat / support', 'Error monitoring', 'CDN / third-party libs'];
T.push({
  id: 'pre-consent-request-finder', cat: B, title: 'Pre-Consent Request Finder (HAR)',
  desc: 'Paste a HAR recorded on first visit before clicking the banner. Lists tracker requests and cookies set before consent, in time order.',
  labels: ['HAR JSON recorded before any consent click'],
  opts: [{ id: 'first', label: 'First-party domain (empty = host of the first request)', type: 'text', def: '' }],
  sample: JSON.stringify({ log: { entries: [
    { startedDateTime: '2026-01-01T10:00:00.000Z', request: { url: 'https://www.example.com/', cookies: [] }, response: { headers: [{ name: 'Set-Cookie', value: 'PHPSESSID=abc; Path=/; HttpOnly' }] } },
    { startedDateTime: '2026-01-01T10:00:00.400Z', request: { url: 'https://www.googletagmanager.com/gtm.js?id=GTM-X', cookies: [] }, response: { headers: [] } },
    { startedDateTime: '2026-01-01T10:00:00.900Z', request: { url: 'https://www.google-analytics.com/g/collect?v=2', cookies: [] }, response: { headers: [{ name: 'set-cookie', value: '_ga=GA1.2.3; Max-Age=63072000' }] } },
    { startedDateTime: '2026-01-01T10:00:01.200Z', request: { url: 'https://fonts.googleapis.com/css2?family=Inter', cookies: [] }, response: { headers: [] } },
    { startedDateTime: '2026-01-01T10:00:01.500Z', request: { url: 'https://www.example.com/app.js', cookies: [] }, response: { headers: [] } }] } }),
  run: ([t], o) => {
    let h; try { h = JSON.parse(t); } catch { throw new Error('Not valid JSON: paste the HAR file contents'); }
    const es = h?.log?.entries; if (!Array.isArray(es) || !es.length) throw new Error('No log.entries found in this HAR');
    const t0 = Date.parse(es[0].startedDateTime) || 0;
    const first = (o.first.trim() ? hostOf(o.first) : hostOf(es[0].request.url)); const fb = baseDomain(first);
    const high = [], rev = [], cks = [];
    for (const e of es) {
      const host = hostOf(e.request?.url || ''); if (!host) continue;
      const dt = ((Date.parse(e.startedDateTime) || t0) - t0) / 1000;
      const tr = trackerFor(host);
      if (tr && baseDomain(host) !== fb) {
        const line = `+${dt.toFixed(2)}s  ${tr[1]}: ${tr[0]}  (${host})`;
        if (PRE_HIGH.includes(tr[1])) high.push(line); else if (PRE_REVIEW.includes(tr[1])) rev.push(line);
      }
      for (const hd of e.response?.headers || []) if (/^set-cookie$/i.test(hd.name)) {
        const nm = String(hd.value).split('=')[0].trim(); const c = classifyCookie(nm);
        if (TRACKING_CATS.includes(c.cat) || c.cat === 'Unknown') cks.push(`+${dt.toFixed(2)}s  ${nm}  from ${host}  [${c.cat}${c.vendor ? ', ' + c.vendor : ''}]`);
      }
    }
    let out = `${es.length} requests. First-party: ${fb}.\n\nTracking requests before consent (likely need consent first): ${high.length}\n` + (high.join('\n') || '  none found') + `\n\nOther third-party requests to review (send the visitor's IP to a third party): ${rev.length}\n` + (rev.join('\n') || '  none found') + `\n\nCookies set by responses that look like analytics, marketing or unknown: ${cks.length}\n` + (cks.join('\n') || '  none found');
    return out + '\n\nThe tool cannot tell when you clicked the banner: only use a HAR recorded with a clean profile and no click. Cookies set by scripts (document.cookie) do not appear in a HAR. Classification is by domain and cookie name only. HAR files can contain secrets: do not share them.';
  },
});

// ---------- GDPR documents ----------
T.push({
  id: 'ropa-builder', cat: L, title: 'Record of Processing Activities (GDPR Art. 30) Builder',
  desc: 'Build an Article 30 record of processing as a table. One processing activity per line; missing Art. 30(1) fields are flagged for review.',
  labels: ['One activity per line: name | purpose | data subjects | data categories | recipients | third-country transfers | retention | security measures | legal basis'],
  opts: [{ id: 'controller', label: 'Controller name and contact', type: 'text', def: 'Example Ltd, privacy@example.com' }, { id: 'dpo', label: 'DPO / representative (optional)', type: 'text', def: '' }],
  sample: 'Newsletter | Send product news | Subscribers | Email, name | Email service provider | None | Until unsubscribe | Access control, TLS | Consent\nPayroll | Pay employees | Employees | Name, bank account, salary | Payroll provider, tax office | None | 7 years after leaving | Encrypted storage, role-based access | Legal obligation',
  run: ([t], o) => {
    const H = ['Activity', 'Purpose', 'Data subjects', 'Data categories', 'Recipients', 'Third-country transfers', 'Retention', 'Security measures', 'Legal basis'];
    const rows = lines(t).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => { const c = l.split('|').map((x) => x.trim()); while (c.length < 9) c.push(''); return c; });
    if (!rows.length) throw new Error('Enter at least one processing activity');
    const art = ['', 'Art. 30(1)(b)', '30(1)(c)', '30(1)(c)', '30(1)(d)', '30(1)(e)', '30(1)(f)', '30(1)(g)', 'not required by Art. 30, useful'];
    let s = `# Record of processing activities (Art. 30 GDPR)\n\nController: ${o.controller || '(missing)'}\n${o.dpo ? 'DPO / representative: ' + o.dpo + '\n' : ''}Last reviewed: ${new Date().toISOString().slice(0, 10)}\n\n| ${H.join(' | ')} |\n|${H.map(() => '---').join('|')}|\n`;
    s += rows.map((r) => '| ' + r.map((c) => c || '**MISSING**').join(' | ') + ' |').join('\n') + '\n';
    const miss = []; rows.forEach((r, i) => r.forEach((c, j) => { if (!c && j < 8) miss.push(`  "${r[0] || 'row ' + (i + 1)}": ${H[j]} (${art[j] || 'Art. 30(1)(b)'})`); }));
    s += '\nReview:\n' + (miss.length ? miss.join('\n') : '  all fields filled') + (o.controller ? '' : '\n  Controller name and contact (Art. 30(1)(a))');
    return s + '\n\nArt. 30(1) asks for: controller and DPO contact, purposes, categories of data subjects and data, recipients, third-country transfers with safeguards, erasure time limits (where possible) and a general description of security measures. Processors keep a separate record under Art. 30(2). Some organisations under 250 staff are exempt in part (Art. 30(5)); check whether that applies to you. Not legal advice.';
  },
});

const DPIA = [
  ['c1', 'Evaluation or scoring, including profiling and predicting (work performance, economic situation, health, preferences, behaviour, location)'],
  ['c2', 'Automated decision-making with legal or similarly significant effect'],
  ['c3', 'Systematic monitoring of people (including in publicly accessible areas or online)'],
  ['c4', 'Sensitive data or highly personal data (special categories, criminal data, finances, location)'],
  ['c5', 'Data processed on a large scale (many people, large volume, long duration or wide area)'],
  ['c6', 'Matching or combining datasets from different sources or purposes'],
  ['c7', 'Data about vulnerable people (children, employees, patients, elderly, asylum seekers)'],
  ['c8', 'Innovative use or new technology (biometrics, AI, IoT, new combinations)'],
  ['c9', 'Processing that blocks people from exercising a right, using a service or entering a contract'],
];
T.push({
  id: 'dpia-screening', cat: L, title: 'DPIA Screening Questionnaire (Is a DPIA Needed?)',
  desc: 'Tick which of the nine EDPB/WP29 high-risk criteria apply to a processing activity and get a screening result: DPIA likely required, consider one, or document why not.',
  inputs: 0, sample: '',
  opts: [...DPIA.map(([id, label], i) => ({ id, label, type: 'checkbox', def: i === 3 || i === 4 })),
    { id: 'a35', label: 'It matches an Art. 35(3) case: large-scale profiling with legal effects, large-scale special category or criminal data, or large-scale systematic monitoring of a public area', type: 'checkbox', def: false },
    { id: 'listed', label: 'It is on your national supervisory authority DPIA list ("must do")', type: 'checkbox', def: false }],
  run: (_i, o) => {
    const n = DPIA.filter(([id]) => o[id]).length;
    let v;
    if (o.a35 || o.listed) v = 'DPIA REQUIRED. ' + (o.a35 ? 'An Art. 35(3) case applies. ' : '') + (o.listed ? 'The processing is on a national "must do" list. ' : '');
    else if (n >= 2) v = 'DPIA LIKELY REQUIRED. WP29 guidelines (WP248 rev.01) say processing meeting two or more criteria will in most cases need one.';
    else if (n === 1) v = 'REVIEW. One criterion applies. A DPIA may still be needed; decide with your DPO and write the reasoning down.';
    else v = 'DPIA PROBABLY NOT REQUIRED. Record this screening and the reasons.';
    return `${v}\n\nCriteria met: ${n} of 9\n` + DPIA.map(([id, l]) => `${o[id] ? '[x]' : '[ ]'} ${l}`).join('\n') + '\n\nA DPIA is also worth doing for any processing you are unsure about. If it shows high risk you cannot mitigate, Art. 36 requires prior consultation of the supervisory authority. This is a screening aid, not legal advice; the nine criteria come from the WP29/EDPB guidelines on DPIAs and the Art. 35(3) cases are read from the GDPR text.';
  },
});

const DSR_TYPES = { access: ['Art. 15', 'right of access'], rectification: ['Art. 16', 'right to rectification'], erasure: ['Art. 17', 'right to erasure'], restriction: ['Art. 18', 'right to restriction of processing'], portability: ['Art. 20', 'right to data portability'], objection: ['Art. 21', 'right to object'] };
T.push({
  id: 'dsr-response-templates', cat: L, title: 'Data Subject Request Response Template Generator',
  desc: 'Generate a controller reply to a GDPR request: access, erasure, portability, rectification, restriction or objection, with versions for fulfilled, partly refused, ID check and extension.',
  inputs: 0, sample: '',
  opts: [
    { id: 'type', label: 'Request type', type: 'select', choices: Object.keys(DSR_TYPES), def: 'access' },
    { id: 'outcome', label: 'Outcome', type: 'select', choices: ['fulfilled', 'partly refused', 'refused', 'identity check needed', 'extension of deadline'], def: 'fulfilled' },
    { id: 'company', label: 'Your company', type: 'text', def: 'Example Ltd' },
    { id: 'name', label: 'Requester name', type: 'text', def: 'Alex Smith' },
    { id: 'date', label: 'Date request received (YYYY-MM-DD)', type: 'text', def: '2026-01-15' },
    { id: 'contact', label: 'Privacy contact', type: 'text', def: 'privacy@example.com' },
    { id: 'reason', label: 'Reason (for refusal or extension)', type: 'text', def: '' },
  ],
  run: (_i, o) => {
    const [art, right] = DSR_TYPES[o.type]; const rem = `You can lodge a complaint with a supervisory authority (Art. 77 GDPR) and you have the right to a judicial remedy (Art. 79).`;
    const body = {
      fulfilled: {
        access: `We confirm that we process personal data about you. Enclosed are a copy of the data, and the following information: the purposes of processing, the categories of data, the recipients, the retention period (or the criteria used to decide it), the source of the data if not collected from you, and your rights to rectification, erasure, restriction and objection.`,
        rectification: `We have corrected the inaccurate data you pointed out and completed it where needed. We have also told the recipients of the data about the correction, unless that proved impossible or involved disproportionate effort.`,
        erasure: `We have erased your personal data from our active systems. Copies in backups will be overwritten within [period]. We have told the recipients we shared the data with, where required. We keep only the data we must keep by law ([describe]).`,
        restriction: `We have restricted the processing of your data as you asked. We will only store it, and will not use it otherwise, until [event]. We will tell you before we lift the restriction.`,
        portability: `Enclosed is the personal data you gave us, in a structured, commonly used, machine-readable format ([JSON/CSV]). You may send it to another controller. Where technically feasible and you ask us to, we can transmit it directly.`,
        objection: `We have stopped processing your data for the purpose you objected to, because [we have no compelling legitimate grounds / the processing was direct marketing]. We have noted your objection on your record.`,
      }[o.type],
      'partly refused': `We have complied with your request in part. We cannot comply with the rest because: ${o.reason || '[give the specific legal reason]'}.`,
      refused: `We cannot comply with your request because: ${o.reason || '[give the specific legal reason, for example Art. 12(5) manifestly unfounded or excessive, or an exemption under Art. 17(3)]'}.`,
      'identity check needed': `Before we can act on your request we need to confirm your identity (Art. 12(6)). Please send [a minimal proof, for example the email address linked to your account, or a copy of ID with all unneeded details covered]. We will only use it for this check. The deadline starts to run once we have enough information to identify you.`,
      'extension of deadline': `We need more time to handle your request. Art. 12(3) lets us extend the one-month period by up to two further months where necessary, taking into account the complexity and number of requests. The reason is: ${o.reason || '[complexity / number of requests]'}. We will reply by [date].`,
    }[o.outcome];
    return `Subject: Your request under the GDPR (${right}), received ${o.date}\n\nDear ${o.name},\n\nThank you for your request of ${o.date} under ${art} GDPR (${right}).\n\n${body}\n\n${o.outcome === 'fulfilled' || o.outcome === 'extension of deadline' || o.outcome === 'identity check needed' ? '' : rem + '\n\n'}If you have questions, write to ${o.contact}.\n\nKind regards,\n${o.company}\n\n---\nChecklist before sending: replace the [brackets]; reply within one month of receipt (Art. 12(3)); keep a record of the request and your answer; never send data about other people.\n` + DISC;
  },
});

const addMonthsUTC = (d, m) => { const y = d.getUTCFullYear(), mo = d.getUTCMonth() + m, day = d.getUTCDate(); const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, mo, Math.min(day, last))); };
const iso = (d) => d.toISOString().slice(0, 10);
const wd = (d) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()];
T.push({
  id: 'dsar-deadline-calculator', cat: L, title: 'DSAR Deadline Calculator (GDPR and CCPA)',
  desc: 'Enter the date a data subject request arrived and get the response deadline with the extension: one month plus two under GDPR Art. 12(3), 45 days plus 45 under CCPA.',
  inputs: 0, sample: '',
  opts: [
    { id: 'date', label: 'Date request received (YYYY-MM-DD, empty = today)', type: 'text', def: '' },
    { id: 'now', label: 'Today (YYYY-MM-DD, empty = your clock)', type: 'text', def: '' },
  ],
  run: (_i, o) => {
    const p = (s) => { const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) throw new Error('Use the date format YYYY-MM-DD'); const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); if (iso(d) !== s.trim()) throw new Error('That date does not exist'); return d; };
    const td = new Date().toISOString().slice(0, 10); const today = p(o.now.trim() || td); const r = p(o.date.trim() || td);
    const g1 = addMonthsUTC(r, 1), g3 = addMonthsUTC(r, 3), c1 = new Date(r.getTime() + 45 * 864e5), c2 = new Date(r.getTime() + 90 * 864e5);
    const left = (d) => { const n = Math.round((d - today) / 864e5); return n >= 0 ? `${n} day(s) left` : `${-n} day(s) overdue`; };
    const line = (l, d) => `  ${l}: ${iso(d)} (${wd(d)}), ${left(d)}`;
    return `Request received: ${iso(r)} (${wd(r)}). Today: ${iso(today)}.\n\nGDPR (Art. 12(3))\n${line('Reply by', g1)}\n${line('With extension (tell the person within the first month, with reasons)', g3)}\n\nCCPA / CPRA (California)\n  Confirm receipt: within 10 days of receipt (check whether the current regulations count business days)\n${line('Respond by (45 days)', c1)}\n${line('With one 45-day extension (90 days total, with notice and reason)', c2)}\n\nAssumptions: GDPR months are counted as calendar months (same day next month, or the last day when the month is shorter); CCPA days are calendar days counted from receipt. Weekends and public holidays are not shifted, and some authorities count differently. Other laws (UK GDPR repeats the one-month rule; other US states differ) are not included. Not legal advice.`;
  },
});

const LB = [
  ['consent', 'Is the person really free to say no, and can they withdraw as easily as they agreed?'],
  ['contract', 'Is the processing necessary to perform a contract with the person, or to take steps they asked for before a contract?'],
  ['legal', 'Is it necessary to comply with a legal obligation in EU or member state law?'],
  ['vital', 'Is it necessary to protect someone\'s life, and the person cannot give consent?'],
  ['public', 'Is it necessary for a task in the public interest, or an official authority, set out in law?'],
  ['li', 'Do you have a legitimate interest (yours or a third party\'s), is the processing necessary for it, and do the person\'s rights not override it?'],
];
T.push({
  id: 'lawful-basis-selector', cat: L, title: 'GDPR Lawful Basis Selector (Article 6)',
  desc: 'Answer yes or no for each Article 6(1) basis and see which ones could fit your purpose, with the checks to make for each and a note on special category data.',
  inputs: 0, sample: '',
  opts: [
    ...LB.map(([id, label]) => ({ id, label, type: 'checkbox', def: id === 'contract' })),
    { id: 'authority', label: 'You are a public authority and this is for your tasks', type: 'checkbox', def: false },
    { id: 'special', label: 'The data includes special categories (health, beliefs, biometrics for ID, and so on)', type: 'checkbox', def: false },
    { id: 'child', label: 'The data subjects may be children', type: 'checkbox', def: false },
  ],
  run: (_i, o) => {
    const ok = LB.filter(([id]) => o[id] && !(id === 'li' && o.authority));
    const names = { consent: 'Art. 6(1)(a) consent', contract: 'Art. 6(1)(b) contract', legal: 'Art. 6(1)(c) legal obligation', vital: 'Art. 6(1)(d) vital interests', public: 'Art. 6(1)(e) public task', li: 'Art. 6(1)(f) legitimate interests' };
    const tips = { consent: 'Needs a clear affirmative act, specific to the purpose, with no pre-ticked boxes. Keep a record. Withdrawal must be easy. Do not use it if refusing would harm the person (power imbalance).', contract: '"Necessary" is strict: useful, not required, is not enough. Marketing and analytics rarely fit here.', legal: 'Name the law. It must actually require the processing.', vital: 'Only for emergencies. Prefer another basis when you can.', public: 'Needs a basis in law. The person may have a right to object (Art. 21).', li: 'Do a written three-step test: purpose, necessity, balance. Tell people about it and offer an easy objection route (Art. 21).' };
    let s = ok.length ? 'Bases that could fit your answers:\n' + ok.map(([id]) => `  - ${names[id]}\n    ${tips[id]}`).join('\n') : 'None of the bases fits your answers. Do not process the data until one does, or until you change the purpose.';
    if (o.authority && o.li) s += '\n\nNote: Art. 6(1) says legitimate interests (f) does not apply to processing by public authorities in the performance of their tasks.';
    if (o.special) s += '\n\nSpecial category data: you need an Art. 6 basis AND an Art. 9(2) condition (for example explicit consent). Art. 9 sets its own list: it is not covered by this tool.';
    if (o.child) s += '\n\nChildren: for information society services offered directly to a child, consent needs parental authorisation below the age set by each member state (between 13 and 16, Art. 8). Give children\'s interests extra weight in a legitimate interests test.';
    if (ok.length > 1) s += '\n\nPick the basis that truly fits and say it in your privacy notice. Do not swap to another basis later because the first one was withdrawn. One basis per purpose is the usual approach.';
    return s + '\n\nThis is a decision aid based on the text of Art. 6, not legal advice.';
  },
});

T.push({
  id: 'retention-schedule-builder', cat: L, title: 'Data Retention Schedule Builder',
  desc: 'Turn data categories, retention periods, triggers and justifications into a retention schedule table. Flags empty justifications and open-ended periods.',
  labels: ['One category per line: category | retention period | starts when | justification | disposal method'],
  opts: [{ id: 'format', label: 'Output format', type: 'select', choices: ['Markdown', 'CSV'], def: 'Markdown' }],
  sample: 'Customer invoices | 7 years | End of financial year | Tax record keeping law (confirm the country rule) | Secure deletion\nNewsletter subscribers | Until unsubscribe | Sign-up | Consent | Delete from list\nServer logs | 90 days | Log creation | Security monitoring | Automatic rotation\nJob applicants | as long as necessary | Application | | Delete',
  run: ([t], o) => {
    const rows = lines(t).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => { const c = l.split('|').map((x) => x.trim()); while (c.length < 5) c.push(''); return c; });
    if (!rows.length) throw new Error('Enter at least one data category');
    const H = ['Data category', 'Retention period', 'Starts when', 'Justification', 'Disposal'];
    const rev = [];
    rows.forEach((r) => { if (!r[3]) rev.push(`"${r[0]}": no justification`); if (!r[1]) rev.push(`"${r[0]}": no period`); else if (/as long as (is )?necessary|indefinite|forever|unlimited|n\/a/i.test(r[1])) rev.push(`"${r[0]}": "${r[1]}" is not a fixed period; state a number or the criterion that ends it`); if (!r[4]) rev.push(`"${r[0]}": no disposal method`); });
    let s;
    if (o.format === 'CSV') s = [H, ...rows].map((r) => r.map((c) => '"' + c.replace(/"/g, '""') + '"').join(',')).join('\n');
    else s = `| ${H.join(' | ')} |\n|${H.map(() => '---').join('|')}|\n` + rows.map((r) => '| ' + r.map((c) => c || '**MISSING**').join(' | ') + ' |').join('\n');
    return s + '\n\nReview:\n' + (rev.length ? rev.map((x) => '  ' + x).join('\n') : '  nothing flagged') + '\n\nThis tool formats your entries. It does not know legal retention periods, so check each period against the law of the country concerned. GDPR Art. 5(1)(e) requires keeping data no longer than necessary for the purpose. Not legal advice.';
  },
});

T.push({
  id: 'privacy-law-applicability-checker', cat: L, title: 'Privacy Law Applicability Checker (GDPR, UK GDPR, LGPD, CCPA)',
  desc: 'Tick facts about your business and see whether GDPR, UK GDPR, Brazil LGPD and California CCPA/CPRA may apply, with the reason and the source article for each.',
  inputs: 0, sample: '',
  opts: [
    { id: 'eu_est', label: 'You have an establishment in the EU/EEA (office, staff, branch) and process personal data in its activities', type: 'checkbox', def: false },
    { id: 'eu_offer', label: 'You offer goods or services to people in the EU/EEA (language, currency, shipping, marketing aimed there)', type: 'checkbox', def: true },
    { id: 'eu_mon', label: 'You monitor the behaviour of people in the EU/EEA (tracking, profiling)', type: 'checkbox', def: false },
    { id: 'uk_est', label: 'You have an establishment in the UK', type: 'checkbox', def: false },
    { id: 'uk_target', label: 'You offer to, or monitor, people in the UK', type: 'checkbox', def: false },
    { id: 'br_proc', label: 'You process data in Brazil', type: 'checkbox', def: false },
    { id: 'br_offer', label: 'You offer goods or services to people in Brazil, or process data of people located there', type: 'checkbox', def: false },
    { id: 'br_coll', label: 'The data was collected in Brazil', type: 'checkbox', def: false },
    { id: 'ca_biz', label: 'You are a for-profit business that does business in California and collects California residents\' personal information', type: 'checkbox', def: false },
    { id: 'ca_rev', label: 'Annual gross revenue is above the CCPA threshold (USD 26,625,000 from 1 Jan 2025)', type: 'checkbox', def: false },
    { id: 'ca_100k', label: 'You buy, sell or share the personal information of 100,000 or more California consumers or households per year', type: 'checkbox', def: false },
    { id: 'ca_50', label: '50 percent or more of your annual revenue comes from selling or sharing personal information', type: 'checkbox', def: false },
  ],
  run: (_i, o) => {
    const v = (a, why) => (a ? 'LIKELY APPLIES' : 'NOT INDICATED') + ' - ' + why;
    const eu = o.eu_est || o.eu_offer || o.eu_mon, uk = o.uk_est || o.uk_target, br = o.br_proc || o.br_offer || o.br_coll, ca = o.ca_biz && (o.ca_rev || o.ca_100k || o.ca_50);
    return `GDPR (EU/EEA): ${v(eu, o.eu_est ? 'establishment in the EU (Art. 3(1))' : eu ? 'targeting or monitoring people in the EU (Art. 3(2))' : 'none of the Art. 3 triggers ticked')}\nUK GDPR and Data Protection Act 2018: ${v(uk, uk ? 'UK establishment or UK targeting/monitoring (UK GDPR Art. 3, same structure as the EU text)' : 'no UK trigger ticked')}\nBrazil LGPD: ${v(br, br ? 'processing in Brazil, offering to people in Brazil, or data collected in Brazil (LGPD Art. 3)' : 'no Art. 3 trigger ticked')}\nCalifornia CCPA/CPRA: ${v(ca, ca ? 'for-profit business in California meeting at least one threshold (Civil Code 1798.140(d))' : o.ca_biz ? 'no threshold ticked' : 'not a for-profit business doing business in California')}\n\nThresholds: the CCPA revenue figure is USD 26,625,000 per the California Privacy Protection Agency, effective 1 January 2025 (adjusted for inflation every odd year, so the next change is expected 2027). The 100,000 and 50 percent tests come from secondary sources and were not checked against the statute text. Check the current figures.\n\nNot covered: other US state laws (Virginia, Colorado, Texas and others have their own thresholds), PIPEDA, Australia, India, Switzerland, China and the rest. Extra-territorial reach and exemptions (small business, non-profits, employee data) have many details. Not legal advice.`;
  },
});

const ADEQ = { 'andorra': 'Andorra', 'argentina': 'Argentina', 'brazil': 'Brazil', 'canada': 'Canada (commercial organisations only)', 'faroe islands': 'Faroe Islands', 'guernsey': 'Guernsey', 'israel': 'Israel', 'isle of man': 'Isle of Man', 'japan': 'Japan', 'jersey': 'Jersey', 'new zealand': 'New Zealand', 'south korea': 'Republic of Korea', 'switzerland': 'Switzerland', 'united kingdom': 'United Kingdom', 'united states': 'United States (only organisations certified under the EU-US Data Privacy Framework)', 'uruguay': 'Uruguay', 'european patent organisation': 'European Patent Organisation' };
const ALIAS = { uk: 'united kingdom', 'great britain': 'united kingdom', england: 'united kingdom', scotland: 'united kingdom', us: 'united states', usa: 'united states', america: 'united states', 'united states of america': 'united states', korea: 'south korea', 'republic of korea': 'south korea', 'czech republic': 'czechia', holland: 'netherlands', 'the netherlands': 'netherlands', 'european patent office': 'european patent organisation' };
const EEA = 'austria belgium bulgaria croatia cyprus czechia denmark estonia finland france germany greece hungary ireland italy latvia lithuania luxembourg malta netherlands poland portugal romania slovakia slovenia spain sweden iceland liechtenstein norway'.split(' ');
T.push({
  id: 'cross-border-transfer-checker', cat: L, title: 'EU Cross-Border Data Transfer Checker (Adequacy or SCCs)',
  desc: 'Enter destination countries and see whether the EU has an adequacy decision for them or whether you need safeguards such as Standard Contractual Clauses. Offline list with a date.',
  labels: ['Destination countries, one per line'], sample: 'United States\nIndia\nUK\nCanada\nGermany\nBrazil',
  run: ([t]) => {
    const ls = lines(t).map((l) => l.trim()).filter(Boolean); if (!ls.length) throw new Error('Enter at least one country');
    const out = ls.map((l) => {
      let k = l.toLowerCase().replace(/\s+/g, ' '); k = ALIAS[k] || k;
      if (ADEQ[k]) return `${l}: ADEQUACY DECISION - ${ADEQ[k]}. Transfers can rely on it without extra safeguards, within its scope.${k === 'united states' ? ' Check that the recipient is on the Data Privacy Framework list; otherwise use SCCs.' : ''}${k === 'canada' ? ' It does not cover non-commercial bodies.' : ''}`;
      if (EEA.includes(k)) return `${l}: INSIDE THE EEA - not a third-country transfer; GDPR applies there.`;
      return `${l}: NO ADEQUACY DECISION in the list. Use an Art. 46 safeguard: Standard Contractual Clauses (Commission Decision 2021/914), binding corporate rules, or another listed tool, plus a transfer impact assessment. Art. 49 derogations are narrow and for occasional transfers.`;
    });
    return out.join('\n\n') + '\n\nList source: European Commission page "Adequacy decisions", as read on 23 October 2026 (the page lists Andorra, Argentina, Brazil, Canada (commercial), Faroe Islands, Guernsey, Israel, Isle of Man, Japan, Jersey, New Zealand, Republic of Korea, Switzerland, United Kingdom, United States (DPF), Uruguay and the European Patent Organisation). Decisions change and are reviewed: check the Commission page before relying on this. Country names are matched by exact text. Not legal advice.';
  },
});

// ---------- hashing, IPs, cookies, text ----------
const HEX = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
T.push({
  id: 'email-ip-pseudonymizer', cat: S, title: 'Email and IP Hasher for Pseudonymized Uploads',
  desc: 'Normalize emails or IP addresses (trim, lowercase, optional plus-tag removal) and hash each line with SHA-256, SHA-384 or SHA-512 plus an optional salt. Runs in your browser.',
  labels: ['Values, one per line'], sample: ' Alex.Smith@Example.com \nalex.smith@example.com\nsomeone+news@gmail.com',
  opts: [
    { id: 'kind', label: 'Value type', type: 'select', choices: ['email', 'ip', 'plain'], def: 'email' },
    { id: 'algo', label: 'Algorithm', type: 'select', choices: ['SHA-256', 'SHA-384', 'SHA-512'], def: 'SHA-256' },
    { id: 'salt', label: 'Salt (placed before the value; empty for none)', type: 'text', def: '' },
    { id: 'plus', label: 'Emails: remove +tag from the local part', type: 'checkbox', def: false },
    { id: 'dots', label: 'Emails: remove dots in gmail.com / googlemail.com addresses', type: 'checkbox', def: false },
  ],
  run: async ([t], o) => {
    const ls = lines(t).map((l) => l.trim()).filter(Boolean); if (!ls.length) throw new Error('Enter at least one value');
    const res = [];
    for (const v of ls) {
      let n = o.kind === 'plain' ? v : v.toLowerCase();
      if (o.kind === 'email') {
        const m = n.match(/^([^@\s]+)@([^@\s]+)$/); if (!m) { res.push(`${v}\t(not an email: skipped)`); continue; }
        let [, l, d] = m; if (o.plus) l = l.replace(/\+.*$/, ''); if (o.dots && /^(gmail|googlemail)\.com$/.test(d)) l = l.replace(/\./g, '');
        n = `${l}@${d}`;
      } else if (o.kind === 'ip') n = n.replace(/%.*$/, '');
      const h = await crypto.subtle.digest(o.algo, new TextEncoder().encode(String(o.salt) + n));
      res.push(`${n}\t${HEX(h)}`);
    }
    return res.join('\n') + `\n\n${o.algo}(salt + normalized value), UTF-8, lowercase hex. A hash of an email or IP is pseudonymised data, still personal data under GDPR: anyone with a list of candidate emails can hash them and match. A secret salt helps only if the other side does not need to match your hashes without it. Match the normalization rules of the platform you upload to.`;
  },
});

function parse6(s) {
  s = s.replace(/%.*$/, ''); let tail = null;
  const m = s.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (m) { const q = m[2].split('.').map(Number); if (q.some((x) => x > 255)) return null; tail = [(q[0] << 8) | q[1], (q[2] << 8) | q[3]]; s = m[1] + '0:0'; }
  if (!/^[0-9a-f:]+$/i.test(s) || (s.match(/::/g) || []).length > 1) return null;
  const [a, b] = s.split('::'); const A = a ? a.split(':') : [], Bv = b != null && b ? b.split(':') : [];
  if (b == null ? A.length !== 8 : A.length + Bv.length > 7) return null;
  const g = b == null ? A : [...A, ...Array(8 - A.length - Bv.length).fill('0'), ...Bv];
  if (g.some((x) => x.length < 1 || x.length > 4)) return null;
  const r = g.map((x) => parseInt(x, 16)); if (tail) { r[6] = tail[0]; r[7] = tail[1]; } return r;
}
function fmt6(a) {
  let bs = -1, bl = 0;
  for (let i = 0; i < 8;) { if (a[i]) { i++; continue; } let j = i; while (j < 8 && !a[j]) j++; if (j - i > bl) { bs = i; bl = j - i; } i = j; }
  const h = a.map((x) => x.toString(16));
  if (bl < 2) return h.join(':');
  return h.slice(0, bs).join(':') + '::' + h.slice(bs + bl).join(':');
}
T.push({
  id: 'ip-anonymizer', cat: S, title: 'IP Address Anonymizer (Truncate IPv4 and IPv6)',
  desc: 'Zero the host part of IPv4 and IPv6 addresses in a list or in whole log lines. Choose how many bits to keep. Timestamps and other text stay unchanged.',
  labels: ['Addresses or log lines'], sample: '203.0.113.77 - - [10/Oct/2026:13:55:36 +0000] "GET / HTTP/1.1" 200\n2001:db8:85a3:8d3:1319:8a2e:370:7348 login ok\n::ffff:198.51.100.23 connected',
  opts: [{ id: 'v4', label: 'IPv4 bits to keep (1-32)', type: 'number', def: 24 }, { id: 'v6', label: 'IPv6 bits to keep (1-128)', type: 'number', def: 48 }],
  run: ([t], o) => {
    const k4 = Math.floor(+o.v4), k6 = Math.floor(+o.v6);
    if (!(k4 >= 1 && k4 <= 32) || !(k6 >= 1 && k6 <= 128)) throw new Error('IPv4 bits must be 1-32 and IPv6 bits 1-128');
    let c4 = 0, c6 = 0;
    let s = t.replace(/[0-9A-Fa-f:.%\w]*:[0-9A-Fa-f:.]*/g, (m) => {
      const tr = m.match(/^(.*?)([0-9A-Fa-f:.]+(?:%\w+)?)$/); const cand = tr ? tr[2] : m;
      const a = cand.includes(':') ? parse6(cand) : null; if (!a || (!cand.includes('::') && !/\./.test(cand) && cand.split(':').length !== 8)) return m;
      c6++; const mapped = a.slice(0, 5).every((x) => !x) && a[5] === 0xffff; const b = mapped ? a.map((x, i) => { if (i < 6) return x; const n = ((a[6] << 16) | a[7]) >>> 0; const mk = k4 >= 32 ? 0xffffffff : (0xffffffff << (32 - k4)) >>> 0; const r = (n & mk) >>> 0; return i === 6 ? r >>> 16 : r & 0xffff; }) : a.map((x, i) => { const keep = Math.max(0, Math.min(16, k6 - i * 16)); return keep >= 16 ? x : keep <= 0 ? 0 : (x >> (16 - keep)) << (16 - keep); });
      return m.slice(0, m.length - cand.length) + (mapped ? '::ffff:' + (b[6] >> 8) + '.' + (b[6] & 255) + '.' + (b[7] >> 8) + '.' + (b[7] & 255) : fmt6(b));
    });
    s = s.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (m) => {
      const q = m.split('.').map(Number); if (q.some((x) => x > 255)) return m; c4++;
      const n = ((q[0] << 24) >>> 0) + (q[1] << 16) + (q[2] << 8) + q[3]; const mask = k4 >= 32 ? 0xffffffff : (0xffffffff << (32 - k4)) >>> 0; const r = (n & mask) >>> 0;
      return [r >>> 24, (r >>> 16) & 255, (r >>> 8) & 255, r & 255].join('.');
    });
    return s + `\n\n(${c4} IPv4 and ${c6} IPv6 address(es) truncated to /${k4} and /${k6})\nTruncated addresses can still be personal data in some cases, for example in a small network. Version strings that look like IPv4 (1.2.3.4) are changed too.`;
  },
});

T.push({
  id: 'cookie-expiry-auditor', cat: B, title: 'Cookie Expiry Auditor (13-Month Limit Check)',
  desc: 'Paste Set-Cookie headers and flag cookies whose lifetime is longer than a limit you choose, 13 months by default as in CNIL guidance. Reads Max-Age and Expires.',
  labels: ['Set-Cookie headers or cookie lines with Max-Age / Expires'],
  sample: 'Set-Cookie: _ga=GA1.1.1; Max-Age=63072000; Path=/\nSet-Cookie: sid=abc; Path=/; HttpOnly\nSet-Cookie: consent=1; Max-Age=15552000; Path=/\nSet-Cookie: old=1; Expires=Fri, 01 Jan 2100 00:00:00 GMT',
  opts: [{ id: 'months', label: 'Limit in months', type: 'number', def: 13 }, { id: 'now', label: 'Reference date (YYYY-MM-DD, empty = today)', type: 'text', def: '' }],
  run: ([t], o) => {
    const ls = lines(t).map((l) => l.trim().replace(/^set-cookie:\s*/i, '')).filter((l) => l && !l.startsWith('#')); if (!ls.length) throw new Error('Paste at least one Set-Cookie line');
    if (!(+o.months > 0)) throw new Error('Limit must be more than 0 months');
    const ref = o.now.trim() ? new Date(o.now.trim() + 'T00:00:00Z') : new Date(); if (isNaN(ref)) throw new Error('Use YYYY-MM-DD for the reference date');
    const lim = addMonthsUTC(ref, Math.floor(+o.months)); const lim2 = new Date(lim.getTime() + (+o.months % 1) * 30.44 * 864e5);
    const rows = ls.map((l) => {
      const parts = l.split(';').map((x) => x.trim()); const name = parts[0].split('=')[0];
      const at = (k) => (parts.find((p) => p.toLowerCase().startsWith(k + '=')) || '').slice(k.length + 1);
      const ma = at('max-age'), ex = at('expires'); let end = null, src = 'session';
      if (ma !== '' && /^-?\d+$/.test(ma)) { end = new Date(ref.getTime() + +ma * 1000); src = 'Max-Age=' + ma; } else if (ex) { const d = new Date(ex); if (!isNaN(d)) { end = d; src = 'Expires'; } }
      if (!end) return `${name}: session cookie (no Max-Age or Expires), no lifetime issue`;
      const days = Math.round((end - ref) / 864e5);
      if (days <= 0) return `${name}: already expired or deleted (${src})`;
      return `${name}: ${days} days (${(days / 30.44).toFixed(1)} months) via ${src}, ends ${iso(end)}  ${end > lim2 ? '[review: over the limit]' : '[ok]'}`;
    });
    const bad = rows.filter((r) => r.includes('[review')).length;
    return `Limit: ${o.months} months from ${iso(ref)} (${iso(lim2)}). ${bad} of ${rows.length} cookie(s) over.\n\n` + rows.join('\n') + '\n\nNote: the CNIL recommends about 13 months as the lifetime of cookies that are exempt from consent (such as audience measurement), and about 6 months before asking for consent again. These are guidance figures, not a hard rule for every country; the figures come from secondary sources and were not checked against the CNIL text. Chrome also caps cookie lifetime at 400 days. Max-Age wins over Expires when both are set.';
  },
});

const syl = (w) => { w = w.toLowerCase().replace(/[^a-z]/g, ''); if (w.length <= 3) return w ? 1 : 0; return Math.max(1, (w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g) || []).length); };
const VAGUE = ['may', 'might', 'from time to time', 'including but not limited to', 'such as', 'third parties', 'affiliates', 'legitimate interests', 'as necessary', 'where appropriate', 'certain', 'in some cases', 'at our discretion'];
T.push({
  id: 'privacy-policy-readability', cat: L, title: 'Privacy Policy Readability Grader',
  desc: 'Paste a privacy policy and get word count, reading time, Flesch scores, long sentences and a count of vague phrases such as "may" and "third parties".',
  labels: ['Privacy policy text'], sample: 'We may collect certain information about you from time to time, including but not limited to your name, email address and device data, and we may share it with third parties and affiliates where appropriate.\nYou can ask us to delete your data. Write to us and we will answer within one month.',
  run: ([t]) => {
    const txt = t.replace(/\s+/g, ' ').trim(); if (txt.split(' ').length < 5) throw new Error('Paste a longer text');
    const words = txt.match(/[A-Za-z][A-Za-z'’-]*/g) || []; const sents = txt.split(/(?<=[.!?])\s+(?=[A-Z0-9"(])|\n+/).map((s) => s.trim()).filter((s) => /[A-Za-z]/.test(s));
    const sy = words.reduce((a, w) => a + syl(w), 0); const W = words.length, S = Math.max(1, sents.length);
    const fre = 206.835 - 1.015 * (W / S) - 84.6 * (sy / W), fk = 0.39 * (W / S) + 11.8 * (sy / W) - 15.59;
    const long = sents.map((s) => [s.split(/\s+/).length, s]).sort((a, b) => b[0] - a[0]).filter((x) => x[0] >= 30).slice(0, 5);
    const lower = txt.toLowerCase(); const vg = VAGUE.map((v) => [v, (lower.match(new RegExp('\\b' + v + '\\b', 'g')) || []).length]).filter((x) => x[1]);
    const lab = fre >= 70 ? 'plain' : fre >= 50 ? 'fairly difficult' : fre >= 30 ? 'difficult' : 'very difficult';
    return `Words: ${W}\nSentences: ${S}, average ${(W / S).toFixed(1)} words\nReading time: about ${Math.max(1, Math.round(W / 238))} min at 238 words per minute\nFlesch reading ease: ${fre.toFixed(1)} (${lab})\nFlesch-Kincaid grade: ${fk.toFixed(1)}\nSentences over 30 words: ${sents.filter((s) => s.split(/\s+/).length >= 30).length}\n\nVague wording (review: say what, who and when)\n${vg.map(([v, n]) => `  "${v}": ${n}`).join('\n') || '  none found'}\n\nLongest sentences\n${long.map(([n, s]) => `  (${n} words) ${s.length > 200 ? s.slice(0, 200) + '...' : s}`).join('\n') || '  none over 30 words'}\n\nHeuristic for English text only: syllables are estimated, and the 238 words per minute figure is an average silent-reading speed. Regulators expect privacy information to be concise, transparent and in plain language (GDPR Art. 12(1)); a score does not prove compliance.`;
  },
});

T.push({
  id: 'privacy-contact-page-generator', cat: L, title: 'Privacy Contact Page and privacy.txt Generator',
  desc: 'Build a privacy contact page (HTML) and a security.txt-style text file listing DPO, privacy contacts, request form and policy links. The text file format is not a standard.',
  inputs: 0, sample: '',
  opts: [
    { id: 'org', label: 'Organisation', type: 'text', def: 'Example Ltd' },
    { id: 'dpo', label: 'DPO name (optional)', type: 'text', def: 'Jane Doe' },
    { id: 'email', label: 'Privacy email', type: 'text', def: 'privacy@example.com' },
    { id: 'post', label: 'Postal address (optional)', type: 'text', def: '1 Example Street, 1000 Brussels, Belgium' },
    { id: 'phone', label: 'Phone (optional)', type: 'text', def: '' },
    { id: 'policy', label: 'Privacy policy URL', type: 'text', def: 'https://www.example.com/privacy' },
    { id: 'form', label: 'Request form URL (optional)', type: 'text', def: '' },
    { id: 'langs', label: 'Languages', type: 'text', def: 'en, nl' },
    { id: 'auth', label: 'Supervisory authority (optional)', type: 'text', def: '' },
  ],
  run: (_i, o) => {
    if (!o.org.trim() || !o.email.trim()) throw new Error('Organisation and privacy email are required');
    const kv = [['Organisation', o.org], ['DPO', o.dpo], ['Contact', 'mailto:' + o.email], ['Postal', o.post], ['Phone', o.phone], ['Policy', o.policy], ['Requests', o.form], ['Preferred-Languages', o.langs], ['Supervisory-Authority', o.auth]].filter(([, v]) => v && v.trim());
    const txt = '# Privacy contacts. Informal format modelled on security.txt; no standard defines it.\n' + kv.map(([k, v]) => `${k}: ${v.trim()}`).join('\n');
    const li = [o.dpo && `<li>Data Protection Officer: ${esc(o.dpo)}</li>`, `<li>Email: <a href="mailto:${esc(o.email)}">${esc(o.email)}</a></li>`, o.post && `<li>Post: ${esc(o.post)}</li>`, o.phone && `<li>Phone: ${esc(o.phone)}</li>`, o.form && `<li><a href="${esc(o.form)}">Make a data request</a></li>`, o.policy && `<li><a href="${esc(o.policy)}">Privacy policy</a></li>`, o.langs && `<li>We reply in: ${esc(o.langs)}</li>`, o.auth && `<li>Supervisory authority: ${esc(o.auth)}</li>`].filter(Boolean).join('\n  ');
    return `<!-- Save as /privacy-contact (HTML page) -->\n<h1>Privacy contact</h1>\n<p>Questions about how ${esc(o.org)} handles personal data, or want to use your rights? Contact us:</p>\n<ul>\n  ${li}\n</ul>\n\n=== /.well-known/privacy.txt ===\n${txt}\n\nThe text file is a convention you can publish for people and tools that look for it; browsers and regulators do not read it automatically. Keep it in sync with your privacy policy.`;
  },
});

T.push({
  id: 'impressum-generator', cat: L, title: 'Impressum Generator (German and Austrian Legal Notice)',
  desc: 'Fill in company details and get a German or Austrian site notice (Impressum) in German or English, with register, VAT ID, authority and responsible-editor sections.',
  inputs: 0, sample: '',
  opts: [
    { id: 'country', label: 'Country', type: 'select', choices: ['Germany', 'Austria'], def: 'Germany' },
    { id: 'lang', label: 'Output language', type: 'select', choices: ['Deutsch', 'English'], def: 'Deutsch' },
    { id: 'form', label: 'Legal form', type: 'select', choices: ['Sole trader', 'GmbH', 'UG (haftungsbeschränkt)', 'AG', 'GbR', 'e.K.', 'GmbH & Co. KG', 'Other'], def: 'GmbH' },
    { id: 'name', label: 'Company or person name', type: 'text', def: 'Beispiel GmbH' },
    { id: 'rep', label: 'Authorised representative(s) (for companies)', type: 'text', def: 'Max Mustermann (Geschäftsführer)' },
    { id: 'addr', label: 'Street, postcode, city', type: 'text', def: 'Musterstraße 1, 10115 Berlin' },
    { id: 'email', label: 'Email', type: 'text', def: 'info@beispiel.de' },
    { id: 'phone', label: 'Phone (or contact form URL)', type: 'text', def: '+49 30 1234567' },
    { id: 'reg', label: 'Commercial register court and number', type: 'text', def: 'Amtsgericht Charlottenburg, HRB 123456' },
    { id: 'vat', label: 'VAT ID (USt-IdNr. / UID)', type: 'text', def: 'DE123456789' },
    { id: 'auth', label: 'Supervisory authority, if the activity needs a licence', type: 'text', def: '' },
    { id: 'prof', label: 'Regulated profession: title, chamber, rules', type: 'text', def: '' },
    { id: 'editor', label: 'Person responsible for editorial content (if journalistic)', type: 'text', def: '' },
    { id: 'vsbg', label: 'Add a consumer dispute resolution statement (not willing to take part)', type: 'checkbox', def: false },
  ],
  run: (_i, o) => {
    if (!o.name.trim() || !o.addr.trim() || !o.email.trim()) throw new Error('Name, address and email are required');
    const de = o.lang === 'Deutsch', at = o.country === 'Austria';
    const law = at ? 'ECG § 5, UGB § 14 und MedienG § 25' : 'DDG § 5 (bis Mai 2024: TMG § 5)'; const lawEn = at ? 'ECG s. 5, UGB s. 14 and MedienG s. 25' : 'DDG s. 5 (until May 2024: TMG s. 5)';
    const company = !['Sole trader', 'Other'].includes(o.form);
    const T_ = de ? { h: 'Impressum', info: 'Angaben gemäß ' + law, rep: 'Vertreten durch', c: 'Kontakt', em: 'E-Mail', ph: 'Telefon', reg: 'Registereintrag', vat: at ? 'UID-Nummer' : 'Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG', auth: 'Aufsichtsbehörde', prof: 'Berufsbezeichnung und berufsrechtliche Regelungen', ed: 'Verantwortlich für den Inhalt (§ 18 Abs. 2 MStV)', vs: 'Verbraucherstreitbeilegung: Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.' } : { h: 'Legal notice', info: 'Information pursuant to ' + lawEn, rep: 'Represented by', c: 'Contact', em: 'Email', ph: 'Phone', reg: 'Commercial register', vat: 'VAT ID', auth: 'Supervisory authority', prof: 'Professional title and rules', ed: 'Responsible for content (s. 18(2) MStV)', vs: 'Consumer dispute resolution: we are not willing or obliged to take part in dispute resolution proceedings before a consumer arbitration board.' };
    const L_ = [`# ${T_.h}`, '', T_.info, '', (company && !o.name.toLowerCase().includes(o.form.split(' ')[0].toLowerCase()) ? `${o.name} (${o.form})` : o.name), o.addr];
    if (company && o.rep.trim()) L_.push('', `${T_.rep}: ${o.rep}`);
    L_.push('', `${T_.c}`, `${T_.em}: ${o.email}`); if (o.phone.trim()) L_.push(`${T_.ph}: ${o.phone}`);
    if (company && o.reg.trim()) L_.push('', `${T_.reg}: ${o.reg}`);
    if (o.vat.trim()) L_.push('', `${T_.vat}: ${o.vat}`);
    if (o.auth.trim()) L_.push('', `${T_.auth}: ${o.auth}`);
    if (o.prof.trim()) L_.push('', `${T_.prof}: ${o.prof}`);
    if (o.editor.trim()) L_.push('', `${T_.ed}: ${o.editor}`);
    if (o.vsbg) L_.push('', T_.vs);
    const rev = []; if (company && !o.rep.trim()) rev.push('a company needs its authorised representative named'); if (company && !o.reg.trim()) rev.push('registered companies need register court and number'); if (!o.phone.trim()) rev.push('a second quick contact route (phone or form) is usually expected in addition to email');
    return L_.join('\n') + `\n\n${rev.length ? 'Review: ' + rev.join('; ') + '.\n\n' : ''}Template for a notice under the German Digitale-Dienste-Gesetz (since 14 May 2024) or the Austrian rules named above. Which fields you need depends on your form, trade and profession; additional duties apply to some sectors and to journalistic content. ` + DISC;
  },
});

T.push({
  id: 'google-fonts-gdpr-checker', cat: B, title: 'Google Fonts Loading Checker (Self-Hosting Guide)',
  desc: 'Paste HTML or CSS and find remote Google Fonts requests: link tags, @import, preconnect. Lists the font families and weights and gives a self-hosting plan with @font-face stubs.',
  labels: ['HTML or CSS source'],
  sample: '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Roboto+Mono&display=swap" rel="stylesheet">\n<style>@import url("https://fonts.googleapis.com/css?family=Open+Sans:400,700|Lato");</style>',
  run: ([t]) => {
    const urls = [...new Set(t.match(/(?:https?:)?\/\/fonts\.(?:googleapis|gstatic)\.com[^\s"'()<>\\]*/gi) || [])];
    if (!urls.length) return 'No requests to fonts.googleapis.com or fonts.gstatic.com found in this source.\n\nThis only checks the text you pasted: fonts loaded by scripts, plugins or CSS files you did not paste are not visible. Check the Network tab of your browser dev tools too.';
    const fam = new Map();
    for (const u of urls) {
      const q = u.split('?')[1]; if (!q) continue;
      for (const p of q.replace(/&amp;/g, '&').split('&')) {
        if (!p.startsWith('family=')) continue;
        const v = decodeURIComponent(p.slice(7).replace(/\+/g, ' '));
        for (const f of v.split('|')) { const [n, spec = ''] = f.split(':'); const w = (spec.includes('@') ? spec.split('@')[1] : spec).split(/[;,]/).map((x) => x.trim()).filter(Boolean); (fam.get(n) || fam.set(n, new Set()).get(n)); w.forEach((x) => fam.get(n).add(x)); }
      }
    }
    const faces = [...fam].map(([n, w]) => { const ws = [...w].map((x) => x.replace(/^\d,/, '')).filter((x) => /^\d{3}$/.test(x)); return (ws.length ? ws : ['400']).map((x) => `@font-face {\n  font-family: "${n}";\n  src: url("/fonts/${n.toLowerCase().replace(/\s+/g, '-')}-${x}.woff2") format("woff2");\n  font-weight: ${x};\n  font-display: swap;\n}`).join('\n\n'); }).join('\n\n');
    return `Found ${urls.length} remote Google Fonts URL(s):\n${urls.map((u) => '  ' + u).join('\n')}\n\nFamilies: ${[...fam].map(([n, w]) => n + (w.size ? ' (' + [...w].join(', ') + ')' : '')).join('; ') || 'none readable from the URLs'}\n\nWhy it is flagged: each visitor's browser contacts Google servers, which sends the IP address to a third party before any consent. Some European courts and authorities have treated this as a data protection problem; others are less strict. Review it with your own legal advice.\n\nSelf-hosting plan\n  1. Download the font files for these families and weights (the fonts are open licensed; check each licence).\n  2. Convert to WOFF2 if needed and put them on your own domain.\n  3. Add @font-face rules (stub below) and remove the Google link, @import and preconnect lines.\n  4. Preload the main font file with <link rel="preload" as="font" type="font/woff2" crossorigin>.\n  5. Remove fonts.googleapis.com and fonts.gstatic.com from your Content-Security-Policy.\n\nStub (fix file names and weights):\n${faces}`;
  },
});

T.push({
  id: 'embed-consent-wrapper', cat: L, title: 'Click-to-Load Embed Wrapper (YouTube, Maps, Social)',
  desc: 'Paste an iframe embed and get a placeholder with a button that loads the embed only after the visitor clicks. Optionally swaps YouTube for the youtube-nocookie domain.',
  labels: ['iframe embed code (one or more)'],
  sample: '<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Video" allow="accelerometer; encrypted-media" allowfullscreen></iframe>',
  opts: [{ id: 'msg', label: 'Placeholder text', type: 'text', def: 'This content is hosted by a third party. Loading it shares your IP address with them.' }, { id: 'btn', label: 'Button text', type: 'text', def: 'Load content' }, { id: 'nocookie', label: 'Use youtube-nocookie.com for YouTube', type: 'checkbox', def: true }],
  run: ([t], o) => {
    const fr = t.match(/<iframe\b[^>]*>(?:\s*<\/iframe>)?/gi) || []; if (!fr.length) throw new Error('No <iframe> found. Script-based embeds (such as X posts) are not supported: load their script only after the click.');
    const items = fr.map((f) => { const at = {}; for (const m of f.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) at[m[1].toLowerCase()] = m[2] ?? m[3]; const bare = f.replace(/="[^"]*"|='[^']*'/g, ''); for (const m of bare.matchAll(/\s([\w-]+)(?=[\s>])/g)) if (!(m[1].toLowerCase() in at) && m[1].toLowerCase() !== 'iframe') at[m[1].toLowerCase()] = ''; return at; });
    const out = items.map((at, i) => {
      let src = at.src || ''; if (!/^https:\/\//i.test(src) && !src.startsWith('//')) throw new Error(`iframe ${i + 1} has no https src`);
      if (o.nocookie) src = src.replace(/^((?:https:)?\/\/)(?:www\.)?youtube\.com\//i, '$1www.youtube-nocookie.com/');
      const rest = { ...at }; delete rest.src; for (const k of Object.keys(rest)) if (k.startsWith('on')) delete rest[k];
      const ratio = +at.width > 0 && +at.height > 0 ? `${+at.width} / ${+at.height}` : '16 / 9';
      return `<div class="consent-embed" data-src="${esc(src)}" data-attrs="${esc(JSON.stringify(rest))}" style="aspect-ratio:${ratio}">\n  <p>${esc(o.msg)}</p>\n  <button type="button">${esc(o.btn)}</button>\n</div>`;
    });
    return out.join('\n\n') + `\n\n<style>\n.consent-embed{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.75rem;padding:1rem;max-width:100%;background:#eee;color:#111;text-align:center}\n.consent-embed iframe{width:100%;height:100%;border:0}\n.consent-embed button{font:inherit;padding:.5rem 1rem}\n</style>\n<script>\ndocument.querySelectorAll('.consent-embed button').forEach(function (b) {\n  b.addEventListener('click', function () {\n    var box = b.parentNode, f = document.createElement('iframe'), a = JSON.parse(box.dataset.attrs || '{}');\n    Object.keys(a).forEach(function (k) { f.setAttribute(k, a[k]); });\n    f.src = box.dataset.src; box.replaceChildren(f);\n  });\n});\n</script>\n\nNotes: the embed loads only after the click, so no request goes to the third party before. The click is the visitor's choice for that one embed. Even youtube-nocookie.com contacts Google after the click. Add the embed domain to your CSP frame-src, and mention it in your privacy and cookie policies.`;
  },
});

T.push({
  id: 'breach-notification-timer', cat: L, title: 'GDPR Breach Notification Timer (72 Hours) with Draft Notice',
  desc: 'Enter when you became aware of a personal data breach and get the 72-hour Art. 33 deadline, time left and a draft notification with the four required points.',
  inputs: 0, sample: '',
  opts: [
    { id: 'aware', label: 'Became aware (ISO time with zone, e.g. 2026-03-13T09:30:00Z or +01:00; empty = now)', type: 'text', def: '' },
    { id: 'now', label: 'Now (same format, empty = your clock)', type: 'text', def: '' },
    { id: 'org', label: 'Organisation', type: 'text', def: 'Example Ltd' },
    { id: 'dpo', label: 'DPO / contact', type: 'text', def: 'privacy@example.com' },
  ],
  run: (_i, o) => {
    const a = o.aware.trim() ? new Date(o.aware.trim()) : new Date(), n = o.now.trim() ? new Date(o.now.trim()) : new Date();
    if (isNaN(a) || isNaN(n) || (o.aware.trim() && !/\d{2}:\d{2}/.test(o.aware))) throw new Error('Use an ISO time such as 2026-03-13T09:30:00Z');
    const dl = new Date(a.getTime() + 72 * 36e5), ms = dl - n, h = Math.abs(ms) / 36e5;
    const hm = `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min`;
    return `Aware: ${a.toISOString()}\nDeadline (72 hours later): ${dl.toISOString()}\n${ms >= 0 ? `Time left: ${hm}` : `OVERDUE by ${hm}: notify without further delay and explain the delay (Art. 33(1))`}\n\nDraft notification to the supervisory authority (Art. 33(3))\n----------------------------------------------------------\nFrom: ${o.org}\nBecame aware: ${a.toISOString()}\n1. Nature of the breach, categories and approximate number of data subjects and records: [describe]\n2. Contact point (DPO or other): ${o.dpo}\n3. Likely consequences of the breach: [describe]\n4. Measures taken or proposed to address the breach and reduce harm: [describe]\nIf details are not yet known, say so and send them in phases (Art. 33(4)).\n\nAlso\n  - Document every breach, even ones you do not report (Art. 33(5)).\n  - Tell affected people without undue delay when the breach is likely to result in a high risk to them (Art. 34).\n  - A processor must tell the controller without undue delay (Art. 33(2)).\n  - You need not notify if the breach is unlikely to result in a risk to people; record why.\n\nThe 72 hours are counted from the controller becoming aware, as the regulation says; there is no pause for weekends. When "aware" starts can be argued (reasonable certainty that a breach occurred). Not legal advice.`;
  },
});

// ---------- website security and DNS ----------
const hdrMap = (t) => {
  const m = new Map();
  for (const l of lines(t)) { const x = l.match(/^\s*([A-Za-z0-9!#$%&'*+.^_`|~-]+)\s*:\s*(.*)$/); if (!x || /^HTTP\//i.test(l)) continue; const k = x[1].toLowerCase(); m.set(k, m.has(k) ? m.get(k) + ', ' + x[2].trim() : x[2].trim()); }
  return m;
};
function cspWeak(csp) {
  const d = {}; csp.split(';').forEach((p) => { const a = p.trim().split(/\s+/); if (a[0]) d[a[0].toLowerCase()] = a.slice(1); });
  const sc = d['script-src'] || d['default-src'] || null; const w = [];
  if (!sc) w.push('no script-src or default-src');
  else {
    const has = (x) => sc.includes(x);
    const safeInline = has("'strict-dynamic'") || sc.some((s) => /^'(nonce|sha\d+)-/.test(s));
    if (has("'unsafe-inline'") && !safeInline) w.push("script 'unsafe-inline'");
    if (has("'unsafe-eval'")) w.push("script 'unsafe-eval'");
    if (sc.some((s) => s === '*' || s === 'http:' || s === 'https:' || s === 'data:')) w.push('script wildcard or scheme source');
  }
  return w;
}
T.push({
  id: 'security-headers-grader', cat: N, title: 'Security Headers Grader (A to F from Pasted Headers)',
  desc: 'Paste response headers and get a score and grade for HSTS, CSP, framing, nosniff, Referrer-Policy, Permissions-Policy and cross-origin headers, with the reason for each point lost.',
  labels: ['Response headers (as copied from dev tools or curl -I)'],
  sample: 'HTTP/2 200\nstrict-transport-security: max-age=31536000; includeSubDomains\ncontent-security-policy: default-src \'self\'; script-src \'self\' \'unsafe-inline\'; frame-ancestors \'none\'\nx-content-type-options: nosniff\nreferrer-policy: strict-origin-when-cross-origin\nserver: nginx/1.24.0\nx-powered-by: Express',
  run: ([t]) => {
    const h = hdrMap(t); if (!h.size) throw new Error('No headers found. Paste lines like "name: value"');
    let score = 0; const rows = [];
    const add = (n, max, got, why) => { score += got; rows.push(`${String(got).padStart(2)}/${max}  ${n}: ${why}`); };
    const hs = h.get('strict-transport-security'); const ma = hs && +(hs.match(/max-age\s*=\s*"?(\d+)/i) || [])[1];
    add('Strict-Transport-Security', 20, !hs ? 0 : ma >= 31536000 ? 20 : ma > 0 ? 10 : 0, !hs ? 'missing' : ma >= 31536000 ? `max-age ${ma}${/includesubdomains/i.test(hs) ? ', includeSubDomains' : ' (review: includeSubDomains not set)'}${/preload/i.test(hs) ? ', preload' : ''}` : `max-age ${ma || 0} is under one year`);
    const csp = h.get('content-security-policy');
    if (!csp) add('Content-Security-Policy', 30, 0, 'missing');
    else { const w = cspWeak(csp); add('Content-Security-Policy', 30, w.length ? 15 : 30, w.length ? 'present but review: ' + w.join(', ') : 'present, no common weakness found by this check'); }
    add('X-Content-Type-Options', 10, /nosniff/i.test(h.get('x-content-type-options') || '') ? 10 : 0, h.get('x-content-type-options') ? h.get('x-content-type-options') : 'missing (should be nosniff)');
    const xfo = h.get('x-frame-options') || '', fa = /frame-ancestors\s+([^;]*)/i.exec(csp || '');
    add('Framing protection', 10, fa && !/^\s*\*\s*$/.test(fa[1]) ? 10 : /^(deny|sameorigin)$/i.test(xfo.trim()) ? 10 : 0, fa ? 'CSP frame-ancestors ' + fa[1].trim() : xfo ? 'X-Frame-Options ' + xfo : 'missing (X-Frame-Options or CSP frame-ancestors)');
    const rp = (h.get('referrer-policy') || '').toLowerCase();
    add('Referrer-Policy', 10, !rp ? 0 : /unsafe-url|no-referrer-when-downgrade/.test(rp) ? 3 : 10, !rp ? 'missing (browsers apply a default)' : rp);
    add('Permissions-Policy', 10, h.get('permissions-policy') ? 10 : 0, h.get('permissions-policy') ? 'present' : 'missing');
    add('Cross-Origin-Opener-Policy', 5, /same-origin/i.test(h.get('cross-origin-opener-policy') || '') ? 5 : 0, h.get('cross-origin-opener-policy') || 'missing');
    add('Cross-Origin-Resource-Policy', 5, h.get('cross-origin-resource-policy') ? 5 : 0, h.get('cross-origin-resource-policy') || 'missing');
    const leak = [];
    if (/\d/.test(h.get('server') || '')) leak.push('Server: ' + h.get('server'));
    if (h.get('x-powered-by')) leak.push('X-Powered-By: ' + h.get('x-powered-by'));
    if (h.get('x-aspnet-version')) leak.push('X-AspNet-Version: ' + h.get('x-aspnet-version'));
    const pen = Math.min(10, leak.length * 5); score -= pen;
    if (leak.length) rows.push(`-${pen}    Version leaks: ${leak.join('; ')}`);
    const x = h.get('x-xss-protection'); const notes = x && /^1/.test(x) ? ['X-XSS-Protection is legacy; modern browsers ignore it and "1; mode=block" can add risk in old ones. Use 0 or remove it.'] : [];
    score = Math.max(0, score); const g = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : 'F';
    return `Grade ${g} (${score}/100)\n\n${rows.join('\n')}\n${notes.length ? '\n' + notes.join('\n') + '\n' : ''}\nThis is a simple weighted heuristic made for this site, not the scoring of any other tool, and it reads only the headers you paste. A passing header does not make a site secure, and the CSP check is not a full evaluation (use the CSP Analyzer).`;
  },
});

T.push({
  id: 'csp-violation-report-parser', cat: N, title: 'CSP Violation Report Parser and Grouper',
  desc: 'Paste CSP violation reports (report-uri JSON or Reporting API) and get counts grouped by directive and blocked source, with hints for inline, eval and data: cases.',
  labels: ['Reports: one JSON per line, an array, or a report-to batch'],
  sample: '{"csp-report":{"document-uri":"https://example.com/","violated-directive":"script-src-elem","effective-directive":"script-src-elem","blocked-uri":"https://cdn.badsite.example/x.js"}}\n{"csp-report":{"document-uri":"https://example.com/a","effective-directive":"script-src-elem","blocked-uri":"inline"}}\n{"csp-report":{"document-uri":"https://example.com/b","effective-directive":"img-src","blocked-uri":"https://img.partner.example/p.png"}}\n[{"type":"csp-violation","body":{"documentURL":"https://example.com/","effectiveDirective":"script-src-elem","blockedURL":"https://cdn.badsite.example/y.js"}}]\n{"csp-report":{"document-uri":"https://example.com/","effective-directive":"script-src-elem","blocked-uri":"chrome-extension"}}',
  run: ([t]) => {
    const docs = []; const txt = t.trim(); if (!txt) throw new Error('Paste at least one report');
    try { docs.push(JSON.parse(txt)); } catch { for (const l of lines(txt)) { if (!l.trim()) continue; try { docs.push(JSON.parse(l)); } catch { throw new Error('A line is not valid JSON: ' + l.slice(0, 60)); } } }
    const reps = docs.flat().map((d) => d['csp-report'] ? { dir: d['csp-report']['effective-directive'] || d['csp-report']['violated-directive'], blocked: d['csp-report']['blocked-uri'] ?? d['csp-report']['blocked-url'], doc: d['csp-report']['document-uri'] } : d.body ? { dir: d.body.effectiveDirective || d.body.violatedDirective, blocked: d.body.blockedURL ?? d.body['blocked-uri'], doc: d.body.documentURL } : d['effective-directive'] ? { dir: d['effective-directive'], blocked: d['blocked-uri'], doc: d['document-uri'] } : null).filter(Boolean);
    if (!reps.length) throw new Error('No CSP reports recognised (expected "csp-report" or Reporting API "body")');
    const noise = (b) => /^(chrome|moz|safari|ms-browser)-extension|^(chrome-extension|moz-extension)$|^safari/.test(b || '');
    const real = reps.filter((r) => !noise(r.blocked)); const g = new Map();
    for (const r of real) {
      let b = r.blocked || '(empty)'; try { if (/^https?:/.test(b)) b = new URL(b).origin; } catch { /* keep */ }
      const k = `${(r.dir || '?').split(' ')[0]} | ${b}`; const e = g.get(k) || { n: 0, docs: new Set() }; e.n++; e.docs.add(r.doc); g.set(k, e);
    }
    const hint = (k) => { const [d, b] = k.split(' | '); if (b === 'inline') return "inline code: move it to a file, or add a nonce or hash (avoid 'unsafe-inline')"; if (b === 'eval') return "eval/new Function: remove it or (last resort) allow 'unsafe-eval'"; if (b === 'data') return 'data: URI: allow data: only for img-src/font-src if you accept it'; if (b === 'blob') return 'blob: URI: allow blob: for the directive if the app needs it'; if (/^https?:/.test(b)) return `if this host is wanted, add ${b} to ${d}; if not, the block is working`; return 'review'; };
    return `${reps.length} report(s), ${reps.length - real.length} from browser extensions ignored, ${g.size} distinct directive + source pair(s)\n\n` + [...g].sort((a, b) => b[1].n - a[1].n).map(([k, e]) => `${String(e.n).padStart(4)}x  ${k}  (${e.docs.size} page(s))\n        -> ${hint(k)}`).join('\n') + '\n\nA report shows what the browser blocked, not what is safe: unknown hosts could be an attack, an ad, or a plugin. Review each source before allowing it. Older browsers send fewer fields.';
  },
});

T.push({
  id: 'hsts-header-generator', cat: N, title: 'HSTS Header Generator with Preload Eligibility Check',
  desc: 'Build a Strict-Transport-Security header for nginx, Apache or plain HTTP and check the header part of the hstspreload.org rules: one-year max-age, includeSubDomains and preload.',
  inputs: 0, sample: '',
  opts: [{ id: 'age', label: 'max-age (seconds)', type: 'number', def: 31536000 }, { id: 'sub', label: 'includeSubDomains', type: 'checkbox', def: true }, { id: 'pre', label: 'preload', type: 'checkbox', def: false }],
  run: (_i, o) => {
    const a = Math.floor(+o.age); if (!(a >= 0)) throw new Error('max-age must be 0 or more');
    const v = `max-age=${a}${o.sub ? '; includeSubDomains' : ''}${o.pre ? '; preload' : ''}`;
    const el = [a >= 31536000 || 'max-age is under 31536000 (one year)', !!o.sub || 'includeSubDomains is missing', !!o.pre || 'preload is missing'].filter((x) => x !== true);
    let s = `Strict-Transport-Security: ${v}\n\nnginx:  add_header Strict-Transport-Security "${v}" always;\nApache: Header always set Strict-Transport-Security "${v}"\n\nHeader part of the preload rules: ${el.length ? 'NOT met: ' + el.join('; ') : 'met (max-age at least one year, includeSubDomains, preload)'}\n`;
    s += '\nThe other preload rules cannot be checked from a header: a valid certificate, HTTP redirecting to HTTPS on the same host, and every subdomain (including internal ones) working over HTTPS. The header must be on the base domain, and on the redirect response.\n';
    if (a === 0) s += '\nmax-age=0 tells browsers to forget HSTS for this site (useful to switch it off).\n';
    return s + '\nRoll out in steps: start with a short max-age (for example 300), raise it as you confirm nothing breaks. Preload is hard to undo: removal can take months. Rules read from hstspreload.org on 23 October 2026; check the site before submitting.';
  },
});

const PP = 'accelerometer ambient-light-sensor aria-notify attribution-reporting autoplay bluetooth browsing-topics camera captured-surface-control ch-ua-high-entropy-values compute-pressure cross-origin-isolated deferred-fetch deferred-fetch-minimal display-capture encrypted-media fullscreen gamepad geolocation gyroscope hid identity-credentials-get idle-detection language-detector language-model local-fonts local-network local-network-access loopback-network magnetometer microphone midi on-device-speech-recognition otp-credentials payment picture-in-picture private-state-token-issuance private-state-token-redemption publickey-credentials-create publickey-credentials-get screen-wake-lock serial speaker-selection storage-access translator summarizer unload usb web-share window-management xr-spatial-tracking'.split(' ');
T.push({
  id: 'permissions-policy-generator', cat: N, title: 'Permissions-Policy Header Generator',
  desc: 'Disable browser features you do not use (camera, microphone, geolocation, payment, USB and more) and allow others for self or named origins. Checks names against the MDN directive list.',
  labels: ['Features to disable, one per line', 'Features to allow, one per line: feature = self https://partner.example'],
  sample: 'camera\nmicrophone\ngeolocation\nusb\nserial\nbluetooth\nbrowsing-topics', sample2: 'fullscreen = self\npayment = self https://pay.example.com',
  inputs: 2,
  run: ([a, b]) => {
    const dis = lines(a).map((x) => x.trim().toLowerCase()).filter((x) => x && !x.startsWith('#'));
    const al = lines(b).map((x) => x.trim()).filter((x) => x && !x.startsWith('#')).map((l) => { const [f, ...r] = l.split('='); const toks = r.join('=').trim().split(/\s+/).filter(Boolean); if (!f.trim() || !toks.length) throw new Error(`Use "feature = self https://origin": ${l}`); return [f.trim().toLowerCase(), toks]; });
    if (!dis.length && !al.length) throw new Error('List at least one feature');
    const unk = [...dis, ...al.map((x) => x[0])].filter((f) => !PP.includes(f));
    const seen = new Set(); const parts = [];
    for (const f of dis) if (!seen.has(f)) { seen.add(f); parts.push(`${f}=()`); }
    for (const [f, toks] of al) {
      if (seen.has(f)) throw new Error(`"${f}" is both disabled and allowed`); seen.add(f);
      const v = toks.map((x) => { if (x === '*') return '*'; if (x === 'self') return 'self'; if (!/^https:\/\/[^\s"]+$/.test(x)) throw new Error(`Bad origin "${x}" (use self, * or https://origin)`); return `"${x}"`; });
      parts.push(v.length === 1 && v[0] === '*' ? `${f}=*` : `${f}=(${v.join(' ')})`);
    }
    const h = parts.join(', ');
    return `Permissions-Policy: ${h}\n\nnginx:  add_header Permissions-Policy "${h.replace(/"/g, '\\"')}" always;\nApache: Header always set Permissions-Policy "${h.replace(/"/g, '\\"')}"\niframe: <iframe allow="${al.map(([f, t]) => f + ' ' + t.join(' ')).join('; ')}" ...></iframe>\n${unk.length ? '\nReview: not in the MDN directive list read on 23 October 2026: ' + unk.join(', ') + '. Browsers ignore names they do not know, but check for typos.\n' : ''}\n() means no origin may use the feature. Support differs by browser and some features exist in only one engine. A feature not listed keeps its default. The older Feature-Policy header is obsolete.`;
  },
});

const REF = ['no-referrer', 'no-referrer-when-downgrade', 'origin', 'origin-when-cross-origin', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin', 'unsafe-url'];
function refSent(pol, from, to) {
  const full = from.origin + from.pathname + from.search, org = from.origin + '/';
  const same = from.origin === to.origin, down = from.protocol === 'https:' && to.protocol !== 'https:';
  switch (pol) {
    case 'no-referrer': return null;
    case 'no-referrer-when-downgrade': return down ? null : full;
    case 'origin': return org;
    case 'origin-when-cross-origin': return same ? full : org;
    case 'same-origin': return same ? full : null;
    case 'strict-origin': return down ? null : org;
    case 'strict-origin-when-cross-origin': return same ? full : down ? null : org;
    default: return full;
  }
}
T.push({
  id: 'referrer-policy-explainer', cat: N, title: 'Referrer-Policy Explainer with Sample Scenarios',
  desc: 'Pick a Referrer-Policy value and a page URL and see exactly what Referer a browser sends for same-origin, cross-origin, downgrade and upgrade navigations. Compares all eight values.',
  inputs: 0, sample: '',
  opts: [{ id: 'policy', label: 'Referrer-Policy', type: 'select', choices: REF, def: 'strict-origin-when-cross-origin' }, { id: 'url', label: 'Page URL', type: 'text', def: 'https://example.com/shop/item?id=7&token=abc#top' }],
  run: (_i, o) => {
    let u; try { u = new URL(o.url); } catch { throw new Error('Enter a full URL such as https://example.com/page'); }
    if (!/^https?:$/.test(u.protocol)) throw new Error('Use an http or https URL');
    const https = u.protocol === 'https:';
    const tg = [['same origin', new URL(u.origin + '/other')], ['other site, same scheme', new URL(u.protocol + '//other.example.net/page')], https ? ['other site over plain http (downgrade)', new URL('http://insecure.example.org/page')] : ['other site over https (upgrade)', new URL('https://secure.example.org/page')]];
    const show = (p, to) => refSent(p, u, to) ?? '(no Referer header)';
    let s = `Page: ${u.origin}${u.pathname}${u.search}\nPolicy: ${o.policy}\n\n` + tg.map(([l, to]) => `  to ${l}: ${show(o.policy, to)}`).join('\n');
    s += '\n\nAll policies side by side\n' + REF.map((p) => `  ${p.padEnd(32)} ` + tg.map(([, to]) => (refSent(p, u, to) ?? '-')).join('   |   ')).join('\n');
    s += `\n  columns: ${tg.map(([l]) => l).join('   |   ')}\n\nNotes: fragments (#...) are never sent, nor credentials in the URL. Query strings can hold tokens: the "full URL" policies expose them to the destination. Modern browsers default to strict-origin-when-cross-origin when no policy is set. Based on the W3C Referrer Policy rules; this models navigation links, not every sub-resource case.`;
    return s;
  },
});

T.push({
  id: 'caa-record-analyzer', cat: N, title: 'CAA Record Analyzer (Who May Issue Certificates)',
  desc: 'Paste CAA records from dig or your DNS panel and see which certificate authorities may issue normal and wildcard certificates, the report address and common mistakes.',
  labels: ['CAA records'],
  sample: 'example.com. 3600 IN CAA 0 issue "letsencrypt.org"\nexample.com. 3600 IN CAA 0 issue "pki.goog; cansignhttpexchanges=yes"\nexample.com. 3600 IN CAA 0 issuewild ";"\nexample.com. 3600 IN CAA 0 iodef "mailto:security@example.com"',
  run: ([t]) => {
    const rec = lines(t).map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/(?:^|\s)(\d{1,3})\s+([A-Za-z][A-Za-z0-9]*)\s+(?:"([^"]*)"|(\S+))\s*$/); if (!m) throw new Error('Cannot read this CAA line: ' + l.slice(0, 70)); return { flag: +m[1], tag: m[2].toLowerCase(), val: (m[3] ?? m[4]).trim() }; });
    if (!rec.length) throw new Error('Paste at least one CAA record');
    const by = (tg) => rec.filter((r) => r.tag === tg); const out = [];
    const cas = (l) => l.map((r) => (r.val.split(';')[0].trim() || null));
    const iss = by('issue'), iw = by('issuewild');
    if (!iss.length && !iw.length) out.push('No issue or issuewild tag: any CA may issue (CAA does not restrict anything yet).');
    if (iss.length) { const a = cas(iss).filter(Boolean); out.push(a.length ? `Certificates (incl. wildcard unless issuewild is set): only ${a.join(', ')}` : 'issue ";" means NO CA may issue normal certificates'); }
    if (iw.length) { const a = cas(iw).filter(Boolean); out.push(a.length ? `Wildcard certificates: only ${a.join(', ')} (issuewild overrides issue)` : 'issuewild ";" means NO wildcard certificates may be issued'); }
    else if (iss.length) out.push('No issuewild: wildcard certificates follow the issue list.');
    by('iodef').forEach((r) => out.push(`Violation reports go to: ${r.val}${/^(mailto:|https?:)/.test(r.val) ? '' : '  (review: expected mailto: or https:)'}`));
    for (const r of rec) { if (r.flag & 128) out.push(`Critical flag set on "${r.tag}": CAs must refuse to issue if they do not understand this tag.`); if (!['issue', 'issuewild', 'iodef', 'issuemail', 'contactemail', 'contactphone'].includes(r.tag)) out.push(`Review: unknown tag "${r.tag}"`); if (r.flag !== 0 && r.flag !== 128) out.push(`Review: flag ${r.flag} on "${r.tag}" (only 0 and 128 are defined)`); }
    const names = cas(iss.concat(iw)).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).filter((c) => !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(c)); if (names.length) out.push('Review: CA identifiers should be domain names: ' + names.join(', '));
    return out.join('\n') + '\n\nCAA is defined in RFC 8659. A CA checks CAA at the name and then up the DNS tree, so a record on a parent domain also covers subdomains. Check that your current CA\'s published identifier is listed before adding a restriction, or renewals will fail.';
  },
});

const tagVals = (s) => { const o = {}; s.split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim().toLowerCase()] = p.slice(i + 1).trim(); }); return o; };
const txtJoin = (s) => { const q = [...s.matchAll(/"((?:[^"\\]|\\.)*)"/g)]; return q.length ? q.map((m) => m[1]).join('') : s.replace(/^.*?\bTXT\b\s*/i, '').trim(); };
T.push({
  id: 'dmarc-record-analyzer', cat: N, title: 'DMARC Record Analyzer (Explain a TXT Value)',
  desc: 'Paste a DMARC TXT record and get every tag explained: policy, subdomain policy, percentage, alignment, report addresses, plus warnings such as p=none or pct below 100.',
  labels: ['DMARC TXT record'], sample: 'v=DMARC1; p=quarantine; sp=reject; pct=50; rua=mailto:dmarc@example.com,mailto:agg@reports.example.net; adkim=s; aspf=r; fo=1',
  run: ([t]) => {
    const raw = txtJoin(t.trim()); if (!raw) throw new Error('Paste a DMARC record'); const d = tagVals(raw); const o = [], w = [];
    if (!/^\s*v\s*=\s*DMARC1\s*(;|$)/i.test(raw)) w.push('The record must start with v=DMARC1');
    const p = (d.p || '').toLowerCase(); const POL = { none: 'monitor only: nothing is blocked', quarantine: 'failing mail goes to spam / quarantine', reject: 'failing mail is rejected' };
    if (!p) w.push('p= is missing: it is required'); else if (!POL[p]) w.push(`p=${p} is not none, quarantine or reject`); else o.push(`Policy p=${p}: ${POL[p]}`);
    if (p === 'none') w.push('p=none gives no protection against spoofing; move to quarantine or reject once reports look clean');
    if (d.sp) o.push(`Subdomain policy sp=${d.sp}`); else o.push('Subdomain policy: same as p (no sp=)');
    const pct = d.pct === undefined ? 100 : +d.pct; if (!(pct >= 0 && pct <= 100)) w.push('pct must be 0-100'); else { o.push(`pct=${pct}: policy applies to ${pct}% of failing mail`); if (pct < 100 && p && p !== 'none') w.push(`pct=${pct}: the rest of failing mail is treated with the next weaker policy`); }
    o.push(`DKIM alignment adkim=${d.adkim || 'r'} (${(d.adkim || 'r') === 's' ? 'strict: exact domain match' : 'relaxed: subdomains match'})`, `SPF alignment aspf=${d.aspf || 'r'} (${(d.aspf || 'r') === 's' ? 'strict' : 'relaxed'})`);
    const uris = (k) => (d[k] || '').split(',').map((x) => x.trim()).filter(Boolean);
    for (const [k, l] of [['rua', 'Aggregate reports (rua)'], ['ruf', 'Failure reports (ruf)']]) { const u = uris(k); if (!u.length) { o.push(`${l}: none`); if (k === 'rua') w.push('No rua= address: you will not receive aggregate reports'); } else { o.push(`${l}: ${u.join(', ')}`); u.forEach((x) => { if (!/^mailto:[^@\s]+@[^@\s]+$/i.test(x.split('!')[0])) w.push(`${k}=${x} is not a valid mailto: URI`); }); } }
    if (uris('rua').concat(uris('ruf')).length) w.push('If a report address is on a different domain, that domain must publish a DMARC authorisation record (<yourdomain>._report._dmarc), or reports are not sent (RFC 7489 section 7.1)');
    if (d.fo) o.push(`Failure options fo=${d.fo}`); if (d.ri) o.push(`Report interval ri=${d.ri} seconds`);
    const known = ['v', 'p', 'sp', 'pct', 'rua', 'ruf', 'adkim', 'aspf', 'fo', 'ri', 'rf', 'np', 'psd', 't'];
    Object.keys(d).filter((k) => !known.includes(k)).forEach((k) => w.push(`Unknown tag "${k}" is ignored by receivers`));
    ['np', 'psd', 't'].filter((k) => d[k] !== undefined).forEach((k) => o.push(`${k}=${d[k]}: tag from newer DMARC revisions (not in RFC 7489), not checked here`));
    return o.join('\n') + '\n\nReview\n' + (w.length ? w.map((x) => '  - ' + x).join('\n') : '  nothing flagged') + '\n\nBased on RFC 7489. This reads only the text you paste: it does not look up DNS or check SPF and DKIM.';
  },
});

const tlv = (b, p) => { const t = b[p]; let l = b[p + 1], q = p + 2; if (l & 0x80) { const n = l & 0x7f; l = 0; for (let i = 0; i < n; i++) l = l * 256 + b[q++]; } return { t, s: q, e: q + l }; };
function rsaBits(b) {
  let n = tlv(b, 0); if (n.t !== 0x30) throw new Error('not DER');
  let c = tlv(b, n.s);
  if (c.t === 0x30) { const bs = tlv(b, c.e); if (bs.t !== 0x03) throw new Error('not SPKI'); const inner = tlv(b, bs.s + 1); const ci = tlv(b, inner.s); n = inner; c = ci; }
  if (c.t !== 0x02) throw new Error('no modulus');
  let s = c.s; while (b[s] === 0 && s < c.e - 1) s++;
  const first = b[s]; return (c.e - s - 1) * 8 + (32 - Math.clz32(first));
}
T.push({
  id: 'dkim-record-analyzer', cat: N, title: 'DKIM Record Analyzer (Key Type and RSA Key Length)',
  desc: 'Paste a DKIM TXT record and read its tags, find the RSA key size or Ed25519 key, spot test mode and revoked keys, and get a note when the key is shorter than 2048 bits.',
  labels: ['DKIM TXT record (quoted parts are joined)'],
  sample: '"v=DKIM1; k=rsa; t=s; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvXN3A+CTbQML1CA2Hq76riZ8EKN11RVhWCeXse55To/pr8lIIFqPDq1ysuO99qRXxX26uTx6MlFWp6xkK9jrLJwX86J6aCK8AM7YC2dBcrfUKFkEzapV+VjmFnKfvZBo95+xVWywfd0OIWnAaRXJXhIYSlum" "2C/ogRHC4A3I/aZIBmS53YZCm7SG3O3xyCfyYJMPAZHBb74XPUmB+BkPHIlxNHTsEixftitKnr+waDuluBmt54gr49ezEqhRoF5ODR0nB8qBfRHTfE0eihFg891/S0hSTKcKBlud6umx/dCfcemlACCWJOfEq9au3Y5qm6/eGhbUZcV44udC1Y8s0QIDAQAB"',
  run: ([t]) => {
    const raw = txtJoin(t.trim()); if (!raw) throw new Error('Paste a DKIM record'); const d = tagVals(raw); const o = [], w = [];
    if (d.v && d.v !== 'DKIM1') w.push(`v=${d.v}: expected DKIM1`);
    const k = (d.k || 'rsa').toLowerCase(); o.push(`Key type k=${k}${d.k ? '' : ' (default)'}`);
    const p = (d.p || '').replace(/\s+/g, '');
    if (d.p === undefined) w.push('p= is missing'); else if (!p) w.push('p= is empty: this key is REVOKED, signatures with this selector fail');
    else {
      let bytes; try { bytes = Uint8Array.from(atob(p), (c) => c.charCodeAt(0)); } catch { throw new Error('p= is not valid base64'); }
      if (k === 'rsa') { try { const bits = rsaBits(bytes); o.push(`RSA modulus: ${bits} bits`); if (bits < 1024) w.push('Under 1024 bits: verifiers may reject it (RFC 8301)'); else if (bits < 2048) w.push('1024-bit keys are weak by today\'s standards; use 2048 bits (RFC 8301 sets 1024 as the minimum for signers)'); } catch { w.push('Could not read an RSA public key from p= (check for a truncated or split value)'); } }
      else if (k === 'ed25519') o.push(`Ed25519 key, ${bytes.length} bytes${bytes.length === 32 ? '' : ' (review: should be 32)'}`);
    }
    if (d.t) { const f = d.t.split(':'); if (f.includes('y')) w.push('t=y: domain is in testing mode; verifiers should not treat failures as errors'); if (f.includes('s')) o.push('t=s: the d= domain must match exactly (no subdomains)'); }
    if (d.h) o.push(`Hash algorithms h=${d.h}`); if (d.s) o.push(`Service type s=${d.s}`); if (d.n) o.push(`Notes n=${d.n}`);
    return o.join('\n') + '\n\nReview\n' + (w.length ? w.map((x) => '  - ' + x).join('\n') : '  nothing flagged') + '\n\nThis reads the text only: it does not fetch DNS or verify a signature. One TXT record can be split into several quoted strings of up to 255 characters, which this tool joins. RFC 6376, RFC 8301 and RFC 8463.';
  },
});

async function inflateRaw(u8, fmt) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream(fmt))).arrayBuffer()); }
async function fileXml(f) {
  const u = new Uint8Array(await f.arrayBuffer());
  if (u[0] === 0x1f && u[1] === 0x8b) return new TextDecoder().decode(await inflateRaw(u, 'gzip'));
  if (u[0] === 0x50 && u[1] === 0x4b) {
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength); let e = u.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--; if (e < 0) throw new Error('Broken zip file');
    const cd = dv.getUint32(e + 16, true); const method = dv.getUint16(cd + 10, true), cs = dv.getUint32(cd + 20, true), lo = dv.getUint32(cd + 42, true);
    const nl = dv.getUint16(lo + 26, true), xl = dv.getUint16(lo + 28, true), st = lo + 30 + nl + xl; const data = u.subarray(st, st + cs);
    return new TextDecoder().decode(method === 0 ? data : await inflateRaw(data, 'deflate-raw'));
  }
  return new TextDecoder().decode(u);
}
const xmlTag = (s, t) => { const m = s.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`, 'i')); return m ? m[1].trim() : ''; };
function parseDmarc(xml) {
  const out = [];
  for (const fb of xml.split(/<feedback[\s>]/i).slice(1)) {
    const md = xmlTag(fb, 'report_metadata'), pp = xmlTag(fb, 'policy_published');
    const rep = { org: xmlTag(md, 'org_name'), id: xmlTag(md, 'report_id'), begin: +xmlTag(md, 'begin'), end: +xmlTag(md, 'end'), domain: xmlTag(pp, 'domain'), p: xmlTag(pp, 'p'), recs: [] };
    for (const r of fb.match(/<record>[\s\S]*?<\/record>/gi) || []) {
      const row = xmlTag(r, 'row'), pe = xmlTag(row, 'policy_evaluated'), ar = xmlTag(r, 'auth_results');
      rep.recs.push({ ip: xmlTag(row, 'source_ip'), n: +xmlTag(row, 'count') || 0, disp: xmlTag(pe, 'disposition'), dkim: xmlTag(pe, 'dkim'), spf: xmlTag(pe, 'spf'), from: xmlTag(xmlTag(r, 'identifiers'), 'header_from'), adkim: [...(ar.match(/<dkim>[\s\S]*?<\/dkim>/gi) || [])].map((x) => `${xmlTag(x, 'domain')}:${xmlTag(x, 'result')}`).join(','), aspf: [...(ar.match(/<spf>[\s\S]*?<\/spf>/gi) || [])].map((x) => `${xmlTag(x, 'domain')}:${xmlTag(x, 'result')}`).join(',') });
    }
    out.push(rep);
  }
  return out;
}
T.push({
  id: 'dmarc-aggregate-report-viewer', cat: N, title: 'DMARC Aggregate Report (RUA XML) Viewer',
  desc: 'Open DMARC aggregate report XML (also .gz or .zip) and see pass and fail counts per sending IP, the policy applied, and which sources fail both SPF and DKIM alignment.',
  labels: ['Report XML (or choose .xml / .gz / .zip files below)'], file: { accept: '.xml,.gz,.zip', multiple: true, optional: true },
  sample: '<?xml version="1.0"?><feedback><report_metadata><org_name>google.com</org_name><report_id>1234</report_id><date_range><begin>1767225600</begin><end>1767312000</end></date_range></report_metadata><policy_published><domain>example.com</domain><p>none</p></policy_published><record><row><source_ip>203.0.113.5</source_ip><count>120</count><policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated></row><identifiers><header_from>example.com</header_from></identifiers><auth_results><dkim><domain>example.com</domain><result>pass</result></dkim><spf><domain>example.com</domain><result>pass</result></spf></auth_results></record><record><row><source_ip>198.51.100.9</source_ip><count>14</count><policy_evaluated><disposition>none</disposition><dkim>fail</dkim><spf>fail</spf></policy_evaluated></row><identifiers><header_from>example.com</header_from></identifiers><auth_results><spf><domain>mailer.example.net</domain><result>pass</result></spf></auth_results></record></feedback>',
  run: async ([t], _o, files) => {
    let xml = t || ''; for (const f of files || []) xml += '\n' + (await fileXml(f));
    const reps = parseDmarc(xml); if (!reps.length || !reps.some((r) => r.recs.length)) throw new Error('No DMARC <feedback> records found in this XML');
    const dt = (s) => (s ? new Date(s * 1000).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '?');
    let total = 0, pass = 0; const ip = new Map();
    for (const r of reps) for (const x of r.recs) { total += x.n; const ok = x.dkim === 'pass' || x.spf === 'pass'; if (ok) pass += x.n; const k = x.ip; const e = ip.get(k) || { n: 0, ok: 0, d: 0, s: 0, disp: new Set(), from: new Set() }; e.n += x.n; if (ok) e.ok += x.n; if (x.dkim === 'pass') e.d += x.n; if (x.spf === 'pass') e.s += x.n; e.disp.add(x.disp); e.from.add(x.from); ip.set(k, e); }
    let o = `${reps.length} report(s): ` + reps.map((r) => `${r.org || '?'} for ${r.domain} (p=${r.p || '?'}), ${dt(r.begin)} to ${dt(r.end)}`).join('; ') + `\nMessages: ${total}; DMARC pass (SPF or DKIM aligned): ${pass} (${total ? ((pass / total) * 100).toFixed(1) : 0}%); fail: ${total - pass}\n\nBy source IP (count, DMARC pass, DKIM aligned, SPF aligned, disposition)\n`;
    o += [...ip].sort((a, b) => b[1].n - a[1].n).map(([k, e]) => `  ${k.padEnd(40)} ${String(e.n).padStart(6)}  pass ${e.ok}  dkim ${e.d}  spf ${e.s}  ${[...e.disp].join('/')}${e.ok === 0 ? '   <- review: nothing passes' : ''}`).join('\n');
    const fails = reps.flatMap((r) => r.recs).filter((x) => x.dkim !== 'pass' && x.spf !== 'pass');
    if (fails.length) o += '\n\nFailing records (raw SPF / DKIM results, which can pass without being aligned)\n' + fails.map((x) => `  ${x.ip} x${x.n}: spf ${x.aspf || 'none'}; dkim ${x.adkim || 'none'}`).join('\n');
    return o + '\n\nA failing IP can be a forwarder, a mailing list, a forgotten sender of yours or a spoofer. Find out which before tightening the policy. Read locally; the XML does not leave your browser.';
  },
});

T.push({
  id: 'mta-sts-tls-rpt-checker', cat: N, title: 'MTA-STS and TLS-RPT Record Checker',
  desc: 'Paste your _mta-sts and _smtp._tls TXT records and the mta-sts.txt policy file and check version, id, mode, mx patterns, max_age and report addresses.',
  inputs: 2, labels: ['TXT records (_mta-sts and _smtp._tls)', 'Policy file (https://mta-sts.<domain>/.well-known/mta-sts.txt)'],
  sample: '_mta-sts.example.com. IN TXT "v=STSv1; id=20260101T000000"\n_smtp._tls.example.com. IN TXT "v=TLSRPTv1; rua=mailto:tlsrpt@example.com"',
  sample2: 'version: STSv1\nmode: testing\nmx: mail.example.com\nmx: *.mail.example.net\nmax_age: 86400',
  run: ([a, b]) => {
    const o = [], w = [];
    for (const l of lines(a).map((x) => x.trim()).filter(Boolean)) {
      const v = txtJoin(l); const d = tagVals(v);
      if (/^v=STSv1/i.test(v)) { o.push(`MTA-STS TXT: v=STSv1, id=${d.id || '(missing)'}`); if (!d.id) w.push('MTA-STS TXT needs id= (change it whenever the policy changes)'); else if (!/^[A-Za-z0-9]{1,32}$/.test(d.id)) w.push('id= should be 1-32 letters and digits'); }
      else if (/^v=TLSRPTv1/i.test(v)) { o.push(`TLS-RPT TXT: v=TLSRPTv1, rua=${d.rua || '(missing)'}`); if (!d.rua) w.push('TLS-RPT needs rua='); else d.rua.split(',').forEach((u) => { if (!/^(mailto:[^@\s]+@[^@\s]+|https:\/\/\S+)$/i.test(u.trim())) w.push(`rua ${u} should be mailto: or https:`); }); }
      else w.push('Unrecognised TXT value: ' + v.slice(0, 60));
    }
    if (b.trim()) {
      const m = new Map(); const mx = [];
      for (const l of lines(b)) { const x = l.match(/^\s*([a-z_]+)\s*:\s*(.+?)\s*$/i); if (!x) continue; if (x[1].toLowerCase() === 'mx') mx.push(x[2]); else m.set(x[1].toLowerCase(), x[2]); }
      if (m.get('version') !== 'STSv1') w.push('Policy must start with version: STSv1');
      const mode = m.get('mode'); if (!['enforce', 'testing', 'none'].includes(mode)) w.push('mode must be enforce, testing or none'); else { o.push(`Policy mode: ${mode}`); if (mode === 'testing') w.push('testing mode reports problems but does not stop delivery; move to enforce once reports are clean'); }
      if (!mx.length && mode !== 'none') w.push('At least one mx: line is required'); mx.forEach((x) => { if (!/^(\*\.)?[a-z0-9.-]+$/i.test(x)) w.push(`mx pattern "${x}" looks invalid`); }); if (mx.length) o.push('Allowed MX: ' + mx.join(', '));
      const ma = +m.get('max_age'); if (!(ma > 0)) w.push('max_age must be a number of seconds'); else { o.push(`max_age: ${ma} s (${(ma / 86400).toFixed(1)} days)`); if (ma < 86400) w.push('max_age under a day gives little protection; weeks are typical in enforce mode'); if (ma > 31557600) w.push('max_age above 31557600 (one year) is the maximum allowed by RFC 8461'); }
    } else w.push('No policy file pasted: only the DNS records were checked');
    return (o.join('\n') || 'Nothing recognised') + '\n\nReview\n' + (w.length ? w.map((x) => '  - ' + x).join('\n') : '  nothing flagged') + '\n\nBased on RFC 8461 (MTA-STS) and RFC 8460 (TLS-RPT). The policy must be served over HTTPS with a valid certificate at the mta-sts host; this tool cannot test that.';
  },
});

const DNSALG = { 1: 'RSAMD5 (obsolete)', 3: 'DSA (obsolete)', 5: 'RSASHA1', 6: 'DSA-NSEC3-SHA1', 7: 'RSASHA1-NSEC3-SHA1', 8: 'RSASHA256', 10: 'RSASHA512', 12: 'ECC-GOST', 13: 'ECDSAP256SHA256', 14: 'ECDSAP384SHA384', 15: 'ED25519', 16: 'ED448' };
const DSDIG = { 1: 'SHA-1', 2: 'SHA-256', 3: 'GOST R 34.11-94', 4: 'SHA-384' };
const keyTag = (r) => { let ac = 0; for (let i = 0; i < r.length; i++) ac += i & 1 ? r[i] : r[i] << 8; ac += (ac >>> 16) & 0xffff; return ac & 0xffff; };
const wireName = (n) => { const o = []; for (const l of n.replace(/\.$/, '').toLowerCase().split('.').filter(Boolean)) { const b = new TextEncoder().encode(l); o.push(b.length, ...b); } o.push(0); return Uint8Array.from(o); };
T.push({
  id: 'dnssec-record-decoder', cat: N, title: 'DNSSEC DS, DNSKEY and RRSIG Decoder',
  desc: 'Paste DS, DNSKEY and RRSIG records and see algorithm names, key roles, key tags, signature validity dates, and whether each DS digest matches a DNSKEY you pasted.',
  labels: ['DS / DNSKEY / RRSIG records from dig'],
  sample: 'cloudflare.com. 86400 IN DS 2371 13 2 32996839a6d808afe3eb4a795a0e6a7a39a76fc52ff228b22b76f6d63826f2b9\ncloudflare.com. 1922 IN DNSKEY 256 3 13 oJMRESz5E4gYzS/q6XDrvU1qMPYIjCWzJaOau8XNEZeqCYKD5ar0IRd8KqXXFJkqmVfRvMGPmM1x8fGAa2XhSA==\ncloudflare.com. 1922 IN DNSKEY 257 3 13 mdsswUyr3DPW132mOi8V9xESWE8jTo0dxCjjnopKl+GqJxpVXckHAeF+KkxLbxILfDLUT0rAK9iUzy1L53eKGQ==',
  opts: [{ id: 'now', label: 'Check signatures against date (YYYY-MM-DD, empty = today)', type: 'text', def: '' }],
  run: async ([t], o) => {
    const keys = [], ds = [], out = []; const now = o.now.trim() ? Date.parse(o.now.trim() + 'T00:00:00Z') : Date.now();
    for (const l of lines(t).map((x) => x.trim()).filter(Boolean)) {
      const f = l.split(/\s+/); const i = f.findIndex((x) => /^(DS|DNSKEY|RRSIG)$/i.test(x)); if (i < 0) { out.push('Skipped (not DS, DNSKEY or RRSIG): ' + l.slice(0, 60)); continue; }
      const ty = f[i].toUpperCase(), owner = f[0], r = f.slice(i + 1);
      if (ty === 'DNSKEY') { const key = Uint8Array.from(atob(r.slice(3).join('')), (c) => c.charCodeAt(0)); const rd = Uint8Array.from([(+r[0] >> 8) & 255, +r[0] & 255, +r[1], +r[2], ...key]); keys.push({ owner, rd, tag: keyTag(rd), alg: +r[2], flags: +r[0] }); }
      else if (ty === 'DS') ds.push({ owner, tag: +r[0], alg: +r[1], dt: +r[2], dig: r.slice(3).join('').toLowerCase() });
      else { const [cov, alg, lab, ttl, exp, inc, tag, signer] = r; const pd = (s) => (/^\d{14}$/.test(s) ? Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14)) : +s * 1000); const e = pd(exp), n = pd(inc); out.push(`RRSIG over ${cov} at ${owner}: algorithm ${alg} ${DNSALG[alg] || '?'}, key tag ${tag}, signer ${signer}\n  valid ${new Date(n).toISOString().slice(0, 10)} to ${new Date(e).toISOString().slice(0, 10)}: ${now > e ? 'EXPIRED (review)' : now < n ? 'NOT YET VALID (review)' : 'inside the window'}`); }
    }
    for (const k of keys) out.push(`DNSKEY ${k.owner}: flags ${k.flags} (${k.flags === 257 ? 'KSK / secure entry point' : k.flags === 256 ? 'ZSK' : 'other'}), algorithm ${k.alg} ${DNSALG[k.alg] || '?'}, key tag ${k.tag}${[5, 7, 1, 3, 6].includes(k.alg) ? '  (review: older algorithm, RFC 8624 discourages it for new signing)' : ''}`);
    for (const d of ds) {
      let m = `DS ${d.owner}: key tag ${d.tag}, algorithm ${d.alg} ${DNSALG[d.alg] || '?'}, digest type ${d.dt} ${DSDIG[d.dt] || '?'}`;
      if (d.dt === 1) m += '  (review: SHA-1 digest is discouraged)';
      const kk = keys.find((k) => k.tag === d.tag && k.alg === d.alg);
      if (kk && [1, 2, 4].includes(d.dt)) { const hh = await crypto.subtle.digest({ 1: 'SHA-1', 2: 'SHA-256', 4: 'SHA-384' }[d.dt], Uint8Array.from([...wireName(d.owner), ...kk.rd])); m += HEX(hh) === d.dig ? '\n  digest MATCHES the pasted DNSKEY (the chain link is consistent)' : '\n  digest does NOT match the pasted DNSKEY with that tag (review)'; } else m += '\n  no pasted DNSKEY with this tag and algorithm: cannot compare the digest';
      out.push(m);
    }
    if (!out.length) throw new Error('Paste DS, DNSKEY or RRSIG records');
    return out.join('\n') + '\n\nThis decodes and compares text. It does not verify signatures or walk the chain from the root, so it cannot tell you whether a domain validates. Key tags follow RFC 4034 appendix B; algorithm and digest names follow the IANA registries as remembered, not re-checked.';
  },
});

const TAKE = [
  ['.github.io', 'GitHub Pages', 'confirm the repository / Pages site exists and uses this custom domain'],
  ['.herokuapp.com', 'Heroku', 'confirm the app exists'], ['.herokudns.com', 'Heroku', 'confirm the app and domain are still attached'],
  ['.s3.amazonaws.com', 'AWS S3 bucket', 'confirm the bucket exists and is yours'], ['.s3-website', 'AWS S3 website', 'confirm the bucket exists and is yours'],
  ['.cloudfront.net', 'AWS CloudFront', 'confirm the distribution exists and lists this alternate domain'],
  ['.elasticbeanstalk.com', 'AWS Elastic Beanstalk', 'confirm the environment exists'],
  ['.azurewebsites.net', 'Azure App Service', 'confirm the app exists'], ['.cloudapp.net', 'Azure Cloud Service', 'confirm the service exists'], ['.cloudapp.azure.com', 'Azure VM public IP', 'confirm the resource exists'], ['.trafficmanager.net', 'Azure Traffic Manager', 'confirm the profile exists'], ['.blob.core.windows.net', 'Azure Blob storage', 'confirm the storage account exists'], ['.azureedge.net', 'Azure CDN', 'confirm the endpoint exists'],
  ['.pantheonsite.io', 'Pantheon', 'confirm the site exists'], ['.ghost.io', 'Ghost(Pro)', 'confirm the site exists'], ['.surge.sh', 'Surge', 'confirm the project exists'], ['.bitbucket.io', 'Bitbucket Pages', 'confirm the site exists'],
  ['.myshopify.com', 'Shopify', 'confirm the store exists and the domain is attached'], ['.zendesk.com', 'Zendesk', 'confirm the host mapping is active'], ['.readme.io', 'ReadMe', 'confirm the project exists'], ['.statuspage.io', 'Statuspage', 'confirm the page exists'], ['.helpscoutdocs.com', 'Help Scout Docs', 'confirm the site exists'], ['.wordpress.com', 'WordPress.com', 'confirm the site exists'], ['.tumblr.com', 'Tumblr', 'confirm the blog exists'], ['.unbouncepages.com', 'Unbounce', 'confirm the page exists'], ['.netlify.app', 'Netlify', 'confirm the site exists and the domain is attached'], ['.vercel.app', 'Vercel', 'confirm the project exists'], ['.fly.dev', 'Fly.io', 'confirm the app exists'], ['.webflow.io', 'Webflow', 'confirm the site exists'],
];
T.push({
  id: 'subdomain-takeover-cname-screen', cat: N, title: 'Subdomain Takeover CNAME Screen (Offline)',
  desc: 'Paste CNAME records or subdomain-to-target pairs and list the ones that point to cloud and SaaS services where dangling records are commonly taken over, with what to check.',
  labels: ['CNAME records: "sub.example.com. CNAME target.example.net." or "sub target"'],
  sample: 'blog.example.com. 300 IN CNAME example-blog.ghost.io.\nshop.example.com. CNAME mystore.myshopify.com.\ndocs.example.com CNAME example.github.io\nwww.example.com. CNAME example.com.\nold.example.com CNAME oldapp.herokuapp.com',
  run: ([t]) => {
    const rows = lines(t).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => { const f = l.split(/\s+/); const i = f.findIndex((x) => /^CNAME$/i.test(x)); return i >= 0 ? [f[0], f[i + 1]] : [f[0], f[1]]; }).filter(([a, b]) => a && b).map(([a, b]) => [a.replace(/\.$/, '').toLowerCase(), b.replace(/\.$/, '').toLowerCase()]);
    if (!rows.length) throw new Error('Paste at least one CNAME record');
    const hit = [], ok = [];
    for (const [s, tg] of rows) { const m = TAKE.find(([suf]) => tg.endsWith(suf) || (suf === '.s3-website' && tg.includes('.s3-website'))); (m ? hit : ok).push(m ? `${s} -> ${tg}\n    service: ${m[1]}; review: ${m[2]}. If the target is unclaimed, anyone could register it and serve content on ${s}.` : `${s} -> ${tg}`); }
    return `${rows.length} record(s): ${hit.length} point to a service worth checking.\n\nWorth checking\n${hit.join('\n') || '  none'}\n\nNo match in the list\n${ok.map((x) => '  ' + x).join('\n') || '  none'}\n\nThis cannot see whether the target exists: it only matches the target name against a list of services. Open the subdomain and the provider dashboard to confirm, and delete DNS records for services you stopped using. The list is informal and was not checked against a public takeover database; a service not listed can still be at risk.`;
  },
});

T.push({
  id: 'mixed-content-finder', cat: N, title: 'Mixed Content Finder (http:// in HTTPS Pages)',
  desc: 'Paste the HTML of an HTTPS page and list every http:// resource in src, srcset, link, form action, CSS url() and inline scripts, split into active, passive and navigation.',
  labels: ['HTML source of an HTTPS page'],
  sample: '<link rel="stylesheet" href="http://cdn.example.com/site.css">\n<script src="http://cdn.example.com/app.js"></script>\n<img src="http://img.example.com/a.png" srcset="http://img.example.com/a2.png 2x">\n<iframe src="http://widget.example.com/"></iframe>\n<form action="http://example.com/post"></form>\n<a href="http://example.com/other">link</a>\n<div style="background:url(http://img.example.com/bg.jpg)"></div>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  run: ([t]) => {
    const act = [], pas = [], nav = [], unk = []; const seen = new Set();
    const ADD = (arr, why, url, line) => { const k = why + url; if (!seen.has(k)) { seen.add(k); arr.push(`line ${line}: ${url}  (${why})`); } };
    let inS = false;
    lines(t).forEach((ln, i) => {
      if (/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(ln)) inS = true;
      for (const tag of ln.match(/<[a-z][^>]*>/gi) || []) {
        const name = (tag.match(/^<([a-z0-9]+)/i) || [])[1].toLowerCase();
        for (const m of tag.matchAll(/\s(src|href|action|data|poster|formaction|srcset|data-src|content)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
          const attr = m[1].toLowerCase(), val = m[2] ?? m[3];
          const urls = attr === 'srcset' ? val.split(',').map((x) => x.trim().split(/\s+/)[0]) : [val.trim()];
          for (const u of urls) {
            if (!/^http:\/\//i.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)/i.test(u)) continue;
            if (name === 'a' || name === 'area') ADD(nav, 'link, not mixed content but leaves HTTPS', u, i + 1);
            else if (name === 'script' || name === 'iframe' || name === 'embed' || name === 'object' || (name === 'link' && /stylesheet|preload|modulepreload|import/i.test(tag)) || attr === 'action' || attr === 'formaction') ADD(act, `${name} ${attr}, active`, u, i + 1);
            else if (['img', 'audio', 'video', 'source', 'track'].includes(name) || attr === 'poster' || attr === 'srcset') ADD(pas, `${name} ${attr}, passive`, u, i + 1);
            else if (name === 'meta' && attr === 'content') ADD(unk, 'meta content, review', u, i + 1);
            else if (name !== 'svg' && name !== 'html') ADD(unk, `${name} ${attr}, review`, u, i + 1);
          }
        }
      }
      for (const m of ln.matchAll(/url\(\s*['"]?(http:\/\/[^'")\s]+)/gi)) ADD(pas, 'CSS url(), passive unless it is a font', m[1], i + 1);
      for (const m of ln.matchAll(/@import\s+(?:url\()?\s*['"]?(http:\/\/[^'")\s;]+)/gi)) ADD(act, 'CSS @import, active', m[1], i + 1);
      if (inS) for (const m of ln.matchAll(/['"`](http:\/\/(?!www\.w3\.org)[^'"`\s]+)['"`]/g)) ADD(unk, 'string in script, review (fetch/XHR would be blocked)', m[1], i + 1);
      if (/<\/script>/i.test(ln)) inS = false;
    });
    const n = act.length + pas.length + unk.length;
    return `${n} insecure resource reference(s)${nav.length ? ` and ${nav.length} plain link(s)` : ''}.\n\nActive mixed content (blocked by browsers)\n${act.join('\n') || '  none'}\n\nPassive mixed content (browsers may upgrade or warn)\n${pas.join('\n') || '  none'}\n\nReview\n${unk.join('\n') || '  none'}\n\nLinks to http pages (not mixed content)\n${nav.join('\n') || '  none'}\n\nFix: change the URL to https:// (or a protocol-relative path) after checking the host serves HTTPS. A Content-Security-Policy "upgrade-insecure-requests" can patch the rest, but it hides the problem. Only static HTML is read: resources added by scripts are not seen. Namespace URLs such as xmlns are ignored.`;
  },
});

const EXP = [
  [/(^|\/)\.env(\.[\w-]+)?$/i, 'high', 'environment file (often holds secrets)'], [/(^|\/)\.git(\/|$)/i, 'high', 'git repository metadata (can expose source and history)'], [/(^|\/)\.(svn|hg|bzr)(\/|$)/i, 'high', 'version control metadata'],
  [/(^|\/)\.htpasswd$/i, 'high', 'password file'], [/(^|\/)\.aws\/credentials$|(^|\/)\.npmrc$|(^|\/)\.pypirc$|(^|\/)\.netrc$|(^|\/)\.docker\/config\.json$/i, 'high', 'credentials file'], [/(^|\/)(id_rsa|id_ed25519|id_dsa)(\.pub)?$|\.pem$|\.key$|\.p12$|\.pfx$|\.jks$/i, 'high', 'key or certificate material'],
  [/wp-config\.php(\.|~|$)(?!.*\.php$)|wp-config\.(bak|old|orig|save|txt|zip)$/i, 'high', 'WordPress config backup'], [/\.(sql|sqlite3?|db|dump|mdb)(\.(gz|zip|bz2))?$/i, 'high', 'database dump or file'], [/(^|\/)(backup|backups|dump|db_backup)[^/]*\.(zip|tar|tgz|gz|7z|rar|sql|bak)$/i, 'high', 'backup archive'],
  [/\.(bak|old|orig|save|swp|swo|tmp)$|~$/i, 'medium', 'editor or backup copy of a file (can reveal source)'], [/\.(zip|tar|tgz|tar\.gz|rar|7z)$/i, 'medium', 'archive file (check what it contains)'],
  [/(^|\/)(phpinfo|info|test|debug)\.php$/i, 'medium', 'diagnostic script'], [/(^|\/)(phpmyadmin|adminer|pma)(\/|\.php|$)/i, 'medium', 'database admin tool'], [/(^|\/)(server-status|server-info|actuator(\/env|\/heapdump)?|\.well-known\/security\.txt\.bak)$/i, 'medium', 'server status or management endpoint'],
  [/(^|\/)\.DS_Store$|(^|\/)Thumbs\.db$/i, 'low', 'OS metadata file (leaks file names)'], [/(^|\/)(composer\.(json|lock)|package(-lock)?\.json|yarn\.lock|Gemfile(\.lock)?|requirements\.txt)$/i, 'low', 'dependency manifest (reveals versions)'], [/\.(log)$/i, 'medium', 'log file'], [/(^|\/)(readme|changelog|license)(\.md|\.txt)?$/i, 'low', 'doc file that may reveal software version'],
];
T.push({
  id: 'exposed-file-path-screen', cat: N, title: 'Exposed File Path Screen (.env, .git, Backups) from URL Lists',
  desc: 'Paste URLs or paths from a sitemap, crawl export or archive list and flag ones that look like .env, .git, backups, dumps, keys and admin tools, sorted by severity.',
  labels: ['URLs, paths, or sitemap XML'],
  sample: 'https://example.com/\nhttps://example.com/.env\nhttps://example.com/.git/config\nhttps://example.com/wp-config.php.bak\nhttps://example.com/backup/site-2026.zip\nhttps://example.com/images/logo.png\nhttps://example.com/phpinfo.php\nhttps://example.com/composer.json',
  run: ([t]) => {
    let items = [...t.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]); if (!items.length) items = lines(t).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    if (!items.length) throw new Error('Paste at least one URL or path');
    const hits = []; for (const it of items) { let p = it; try { if (/^https?:/i.test(it)) { const u = new URL(it); p = u.pathname; } } catch { /* keep */ } try { p = decodeURIComponent(p); } catch { /* keep */ } for (const [re, sev, why] of EXP) if (re.test(p)) { hits.push([sev, it, why]); break; } }
    const ord = { high: 0, medium: 1, low: 2 }; hits.sort((a, b) => ord[a[0]] - ord[b[0]]);
    return `${items.length} URL(s) checked, ${hits.length} flagged.\n\n` + (hits.map(([s, u, w]) => `[${s.toUpperCase()}] ${u}\n    ${w}`).join('\n') || 'Nothing matched.') + '\n\nThese are candidates from the file name only. A match does not prove the file is readable or holds anything: open it yourself on your own site, and fix it by removing the file or blocking the path in the web server. Do not request other people\'s sites. This tool makes no requests.';
  },
});
export default T;

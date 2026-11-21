// HTML templates (plain template literals). Everything user-visible comes from i18n/<lang>.json via t(); content from content/<lang>/.
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const FAVICON = "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='#1d4ed8'/><path d='M9 17l5 5 9-12' stroke='#fff' stroke-width='3' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");
const MOON = '<svg class="theme-toggle__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

/** ctx: {cfg, lang, t, abs, cssVer, alts(pathSuffix)->[{lang,path}]} */
export function layout(ctx, p) {
  const { cfg, lang, t, abs } = ctx;
  const canonical = abs(p.path);
  const title = p.rawTitle ?? `${p.title} | ${cfg.siteName}`;
  const alt = (p.alts || []).map((a) => `<link rel="alternate" hreflang="${esc(a.lang)}" href="${esc(abs(a.path))}">`).join('\n');
  const xdef = p.xdefault ? `\n<link rel="alternate" hreflang="x-default" href="${esc(abs(p.xdefault))}">` : '';
  const og = p.noindex ? '' : `
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(cfg.siteName)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(p.desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:locale" content="${esc(cfg.locales?.[lang] || lang)}">
<meta property="og:image" content="${esc(abs('/assets/og.png'))}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(cfg.siteName)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(p.desc)}">
<meta name="twitter:image" content="${esc(abs('/assets/og.png'))}">`;
  const nav = [['hub', `/${lang}/`, t('nav.hub')], ['about', `/${lang}/about/`, t('nav.about')]]
    .map(([k, href, label]) => `<li><a href="${href}"${p.nav === k ? ' aria-current="page"' : ''}>${esc(label)}</a></li>`).join('');
  const langs = ctx.langLinks(p.pathSuffix ?? '');
  const langNav = `<nav aria-label="${esc(t('footer.language'))}"><ul>${langs.map((l) => l.path === `/${lang}/${p.pathSuffix ?? ''}` || l.lang === lang
    ? `<li><span aria-current="true" lang="${l.lang}">${esc(l.name)}</span></li>` : `<li><a href="${l.path}" hreflang="${l.lang}" lang="${l.lang}">${esc(l.name)}</a></li>`).join('')}</ul></nav>`;
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(p.desc)}">
<link rel="canonical" href="${esc(canonical)}">
${alt}${xdef}
<meta name="robots" content="${p.noindex ? 'noindex,follow' : 'index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1'}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1216" media="(prefers-color-scheme: dark)">${og}
<link rel="icon" href="${FAVICON}">
<script src="/assets/theme.js"></script>
<link rel="stylesheet" href="/assets/site.css?v=${ctx.cssVer}">
${(p.ld || []).map(ld).join('\n')}
</head>
<body>
<a class="skip-link" href="#main">${esc(t('skip'))}</a>
<header class="site-header">
<div class="wrapper repel site-header__inner">
<a class="site-header__brand" href="/${lang}/">${esc(cfg.siteName)}</a>
<nav class="site-header__nav" aria-label="${esc(t('nav.label'))}"><ul>${nav}<li><a class="site-header__parent" href="${esc(cfg.parent.url)}" title="${esc(t('nav.parent.title'))}">${esc(cfg.parent.name)}</a></li><li><button type="button" class="theme-toggle" data-theme-toggle aria-pressed="false" hidden>${MOON}<span>${esc(t('theme.toggle'))}</span></button></li></ul></nav>
</div>
</header>
<main id="main" tabindex="-1">
${p.body}
</main>
<footer class="site-footer">
<div class="wrapper stack" style="--space:var(--space-s)">
<nav aria-label="${esc(t('footer.nav'))}"><ul>
<li><a href="/${lang}/about/">${esc(t('footer.about'))}</a></li>
<li><a href="/${lang}/accessibility/">${esc(t('footer.accessibility'))}</a></li>
<li><a href="/${lang}/">${esc(t('footer.hub'))}</a></li>
</ul></nav>
<nav aria-label="${esc(t('footer.network'))}"><ul>${(cfg.footerLinks || []).map((l) => `<li><a href="${esc(l.url)}" rel="noopener">${esc(l.label)}</a></li>`).join('')}</ul></nav>
${langNav}
<p>${esc(t('footer.tagline'))} ${esc(t('footer.by'))} <a href="${esc(cfg.parent.url)}">${esc(cfg.parent.name)}</a>.</p>
</div>
</footer>
${p.scripts || ''}
</body>
</html>
`;
}

const paras = (s) => String(s).split(/\n{2,}/).map((x) => x.trim()).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('\n');

export function crumbs(ctx, items) {
  const { t } = ctx;
  return `<nav class="breadcrumb" aria-label="${esc(t('breadcrumb.label'))}"><ol>${items.map((c, i) => i === items.length - 1
    ? `<li><span aria-current="page">${esc(c.name)}</span></li>` : `<li><a href="${c.href}">${esc(c.name)}</a></li>`).join('')}</ol></nav>`;
}

export function toolBody(ctx, tool, c, related, catHref) {
  const { t, lang } = ctx;
  const bc = crumbs(ctx, [{ name: t('breadcrumb.home'), href: `/${lang}/` }, { name: tool.cat, href: catHref }, { name: tool.title }]);
  return `<div class="wrapper py-8 stack" style="--space:var(--space-l)">
${bc}
<header class="stack" style="--space:var(--space-xs)">
<h1>${esc(tool.title)}</h1>
<p class="lede">${esc(c.intro || tool.desc)}</p>
</header>
<section aria-labelledby="tool-h" class="stack" style="--space:var(--space-xs)">
<h2 id="tool-h">${esc(t('tool.section'))}</h2>
<div id="tool-root" data-tool="${esc(tool.id)}" data-module="${esc(tool.module)}"${tool.sensitive ? ' data-sensitive="1"' : ''}><noscript><p>${esc(t('tool.noscript'))}</p></noscript></div>
</section>
<div class="prose stack">
${c.why ? `<section aria-labelledby="why-h" class="stack"><h2 id="why-h">${esc(t('tool.why'))}</h2>\n${paras(c.why)}</section>` : ''}
${c.howTo?.length ? `<section aria-labelledby="how-h"><h2 id="how-h">${esc(t('tool.how'))}</h2>\n<ol>${c.howTo.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></section>` : ''}
${c.faq?.length ? `<section aria-labelledby="faq-h" class="faq stack"><h2 id="faq-h">${esc(t('tool.faq'))}</h2>\n${c.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n')}</section>` : ''}
</div>
${related.length ? `<section aria-labelledby="rel-h" class="related stack"><h2 id="rel-h">${esc(t('tool.related'))}</h2>
<ul class="card-list grid">${related.map((r) => `<li><a class="link-card" href="/${lang}/${r.id}/"><span class="link-card__title">${esc(r.title)}</span><span class="link-card__desc">${esc(r.desc)}</span></a></li>`).join('')}</ul></section>` : ''}
</div>`;
}

export function hubBody(ctx, groups, count) {
  const { t, lang } = ctx;
  const jump = groups.map((g) => `<li><a class="chip" href="#${g.slug}" data-jump="${g.slug}">${esc(g.name)} <span class="visually-hidden">(${esc(t('hub.count', { n: g.tools.length }))})</span></a></li>`).join('');
  const secs = groups.map((g) => `<section class="cat-section stack" id="${g.slug}" aria-labelledby="${g.slug}-h" style="--space:var(--space-xs)">
<h2 id="${g.slug}-h">${esc(g.name)} <span class="cat-section__count">(${g.tools.length})</span></h2>
<ul class="tool-list">${g.tools.map((x) => `<li data-s="${esc(x.search)}"><a href="/${lang}/${x.id}/">${esc(x.title)}</a><span>${esc(x.desc)}</span></li>`).join('')}</ul>
</section>`).join('\n');
  return `<div class="wrapper py-8 stack" style="--space:var(--space-l)">
<header class="stack" style="--space:var(--space-xs)">
<h1>${esc(t('hub.title'))}</h1>
<p class="lede">${esc(t('hub.intro', { count }))}</p>
</header>
<form class="hub-search" role="search" action="/${lang}/" method="get">
<label for="hub-q">${esc(t('hub.search'))}</label>
<input id="hub-q" name="q" type="search" autocomplete="off" placeholder="${esc(t('hub.searchPlaceholder'))}">
<p id="hub-count" class="hint" role="status" aria-live="polite"></p>
</form>
<nav aria-labelledby="jump-h" class="stack" style="--space:var(--space-2xs)"><h2 id="jump-h" class="text-l">${esc(t('hub.categories'))}</h2><ul class="chip-list">${jump}</ul></nav>
${secs}
</div>
<script type="application/json" id="hub-msg">${JSON.stringify({ results: t('hub.results', { n: '{n}' }), none: t('hub.noResults') }).replace(/</g, '\\u003c')}</script>`;
}

const fmtDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// Section shapes: {h2, paragraphs?, list?, dl?: [{term, desc}], table?: {caption, head: [], rows: [[]]}, contact?: true}
export function textPageBody(ctx, page, crumbName) {
  const { t, lang, cfg } = ctx;
  const contact = (cfg.accessibilityContact || '').trim();
  const contactHtml = contact
    ? `<p>${/^[^\s@]+@[^\s@]+$/.test(contact) ? `<a href="mailto:${esc(contact)}">${esc(contact)}</a>` : /^https?:\/\//.test(contact) ? `<a href="${esc(contact)}">${esc(contact)}</a>` : esc(contact)}</p>`
    : `<p>${esc(t('a11y.contactPending'))}</p>`;
  const section = (s) => `<section><h2>${esc(s.h2)}</h2>\n${(s.paragraphs || []).map((x) => `<p>${esc(x)}</p>`).join('\n')}`
    + (s.list?.length ? `\n<ul>${s.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '')
    + (s.dl?.length ? `\n<dl>${s.dl.map((x) => `<dt>${esc(x.term)}</dt><dd>${esc(x.desc)}</dd>`).join('')}</dl>` : '')
    + (s.table ? `\n<div class="table-scroll" role="region" aria-label="${esc(s.table.caption)}" tabindex="0"><table><caption>${esc(s.table.caption)}</caption><thead><tr>${s.table.head.map((x) => `<th scope="col">${esc(x)}</th>`).join('')}</tr></thead><tbody>${s.table.rows.map((r) => `<tr>${r.map((x, i) => (i ? `<td>${esc(x)}</td>` : `<th scope="row">${esc(x)}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>` : '')
    + (s.contact ? `\n${contactHtml}` : '') + '</section>';
  return `<div class="wrapper py-8 stack" style="--space:var(--space-l)">
${crumbs(ctx, [{ name: t('breadcrumb.home'), href: `/${lang}/` }, { name: crumbName }])}
<article class="prose">
<h1>${esc(page.title)}</h1>
${page.lastReviewed ? `<p class="hint"><time datetime="${esc(page.lastReviewed)}">${esc(t('a11y.lastReviewed', { date: fmtDate(page.lastReviewed) }))}</time></p>\n` : ''}${page.sections.map(section).join('\n')}
</article>
</div>`;
}

export function notFoundBody(ctx) {
  const { t, lang } = ctx;
  return `<div class="wrapper py-8 stack" style="--space:var(--space-m)">
<h1>${esc(t('error.404.title'))}</h1>
<p class="lede">${esc(t('error.404.text'))}</p>
<p><a class="btn btn--primary" href="/${lang}/">${esc(t('error.404.link'))}</a></p>
</div>`;
}

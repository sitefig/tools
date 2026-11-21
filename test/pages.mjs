// Checks the BUILT output (run `npm run build` first). No browser. Exit 1 on failures; duplicate h1s only warn (tool titles live in src/tools).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/tools.json'), 'utf8'));
const siteHost = new URL(cfg.siteUrl).host;
const allowedHosts = new Set([cfg.parent && new URL(cfg.parent.url).host, ...(cfg.footerLinks || []).map((l) => new URL(l.url).host)]); // allowed outbound links: parent brand + footer network links
const fails = [], warns = [];
const fail = (m) => fails.push(m);

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const pageFiles = cfg.langs.flatMap((l) => (fs.existsSync(path.join(ROOT, l)) ? walk(path.join(ROOT, l)).filter((f) => f.endsWith('index.html')) : []));
const html = new Map(pageFiles.map((f) => ['/' + rel(f).replace(/index\.html$/, ''), fs.readFileSync(f, 'utf8')]));

// 1. every tool has a page
for (const t of manifest) for (const l of cfg.langs) if (l === cfg.defaultLang && !html.has(`/${l}/${t.id}/`)) fail(`missing page /${l}/${t.id}/`);
for (const l of cfg.langs) for (const p of ['', 'about/', 'accessibility/']) if (!html.has(`/${l}/${p}`)) fail(`missing page /${l}/${p}`);
for (const f of ['404.html', 'index.html', 'robots.txt', 'llms.txt', 'sitemap.xml', 'assets/site.css', 'assets/og.png', 'assets/tools.json']) if (!fs.existsSync(path.join(ROOT, f))) fail(`missing ${f}`);

// 2. per-page checks
const titles = new Map(), descs = new Map(), h1s = new Map();
const add = (m, k, p) => m.set(k, [...(m.get(k) || []), p]);
const attr = (s, re) => re.exec(s)?.[1];
const ids = new Map();
for (const [p, h] of html) {
  const nh1 = (h.match(/<h1[\s>]/g) || []).length;
  if (nh1 !== 1) fail(`${p}: ${nh1} h1 elements`);
  const title = attr(h, /<title>([^<]*)<\/title>/), desc = attr(h, /<meta name="description" content="([^"]*)"/), h1 = attr(h, /<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (!title) fail(`${p}: no title`); else add(titles, title, p);
  if (!desc) fail(`${p}: no meta description`); else add(descs, desc, p);
  if (h1) add(h1s, h1, p);
  const canon = attr(h, /<link rel="canonical" href="([^"]*)"/);
  if (canon !== cfg.siteUrl.replace(/\/+$/, '') + p) fail(`${p}: canonical ${canon}`);
  if (!/<link rel="alternate" hreflang="[a-z-]+" href="https?:\/\//.test(h) || !h.includes('hreflang="x-default"')) fail(`${p}: hreflang/x-default missing`);
  for (const k of ['og:title', 'og:description', 'og:url', 'og:type', 'og:site_name', 'og:locale', 'og:image']) if (!h.includes(`property="${k}"`)) fail(`${p}: ${k} missing`);
  if (!/<html lang="[a-z-]+"/.test(h)) fail(`${p}: html lang`);
  if (!h.includes('class="skip-link"') || !/<main id="main"/.test(h)) fail(`${p}: skip link/main`);
  ids.set(p, new Set([...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  // JSON-LD
  const blocks = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const types = [];
  for (const b of blocks) {
    let o; try { o = JSON.parse(b); } catch (e) { fail(`${p}: JSON-LD does not parse`); continue; }
    types.push(o['@type']);
    if (o['@context'] !== 'https://schema.org') fail(`${p}: JSON-LD @context`);
    const need = { WebApplication: ['name', 'url', 'description', 'applicationCategory', 'operatingSystem', 'offers', 'isAccessibleForFree'], BreadcrumbList: ['itemListElement'], FAQPage: ['mainEntity'], WebSite: ['name', 'url', 'potentialAction'], CollectionPage: ['name', 'url'], ItemList: ['itemListElement'], WebPage: ['name', 'url'] }[o['@type']];
    if (!need) fail(`${p}: unexpected JSON-LD type ${o['@type']}`);
    else for (const k of need) if (o[k] == null || o[k] === '') fail(`${p}: ${o['@type']} lacks ${k}`);
    if (o['@type'] === 'FAQPage' && !o.mainEntity.every((q) => q.name && q.acceptedAnswer?.text)) fail(`${p}: FAQ item incomplete`);
    if (o['@type'] === 'BreadcrumbList' && !o.itemListElement.every((x, i) => x.position === i + 1 && x.name && x.item)) fail(`${p}: breadcrumb items`);
    if (o.offers && (o.offers.price !== '0' || !o.offers.priceCurrency)) fail(`${p}: offer`);
    if (/"(aggregateRating|review|reviewRating|ratingValue)"/.test(b)) fail(`${p}: ratings/reviews in JSON-LD`);
  }
  const isTool = manifest.some((t) => p === `/${p.split('/')[1]}/${t.id}/`);
  if (isTool && !(types.includes('WebApplication') && types.includes('BreadcrumbList'))) fail(`${p}: tool JSON-LD incomplete`);
  if (/^\/[a-z-]+\/$/.test(p) && !(types.includes('WebSite') && types.includes('CollectionPage') && types.includes('ItemList'))) fail(`${p}: hub JSON-LD incomplete`);
}
for (const [name, m, hard] of [['title', titles, true], ['meta description', descs, true], ['h1', h1s, false]]) {
  const d = [...m].filter(([, v]) => v.length > 1);
  if (d.length) (hard ? fails : warns).push(`${d.length} duplicate ${name}(s): ` + d.slice(0, 5).map(([k, v]) => `"${k.slice(0, 50)}" in ${v.join(' ')}`).join('; '));
}

// 3. internal links and anchors
const exists = (p) => html.has(p) || fs.existsSync(path.join(ROOT, p.replace(/^\//, ''))) && fs.statSync(path.join(ROOT, p.replace(/^\//, ''))).isFile();
let nLinks = 0;
for (const [p, h] of html) {
  for (const m of h.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    let u = m[1];
    if (!u || u.startsWith('data:') || u.startsWith('mailto:')) continue;
    if (/^https?:\/\//.test(u)) { if (new URL(u).host !== siteHost && !allowedHosts.has(new URL(u).host)) fail(`${p}: external reference ${u}`); continue; }
    if (u.startsWith('//')) { fail(`${p}: protocol-relative ${u}`); continue; }
    nLinks++;
    const [pathPart, frag] = u.replace(/\?[^#]*/, '').split('#');
    const target = pathPart === '' ? p : pathPart.startsWith('/') ? pathPart : new URL(pathPart, 'http://x' + p).pathname;
    if (!exists(target)) { fail(`${p}: broken link ${u}`); continue; }
    if (frag && html.has(target) && !ids.get(target)?.has(frag)) fail(`${p}: missing anchor ${u}`);
  }
}

// 4. related ids in content files
for (const l of cfg.langs) {
  const dir = path.join(ROOT, 'content', l);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    let c; try { c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { fail(`content/${l}/${f}: invalid JSON`); continue; }
    for (const r of c.related || []) if (!manifest.some((t) => t.id === r)) fail(`content/${l}/${f}: related id "${r}" does not exist`);
  }
}

// 5. sitemap, robots, llms
{
  const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const locs = [...sm.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  const base = cfg.siteUrl.replace(/\/+$/, '');
  const want = [...html.keys()].map((p) => base + p);
  if (new Set(locs).size !== locs.length) fail('sitemap has duplicate URLs');
  const set = new Set(locs);
  for (const w of want) if (!set.has(w)) fail(`sitemap lacks ${w}`);
  for (const l of locs) if (!want.includes(l)) fail(`sitemap lists unknown page ${l}`);
  if (!/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sm) || !sm.includes('hreflang="x-default"')) fail('sitemap lastmod/hreflang');
  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
  if (!/Allow: \//.test(robots) || !robots.includes(`Sitemap: ${base}/sitemap.xml`)) fail('robots.txt');
  if (!/^# /.test(fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8'))) fail('llms.txt');
}

// 6. no external origins in CSS/JS runtime files
const ALLOWED = [/^https?:\/\/www\.w3\.org\/2000\/svg$/, /^https?:\/\/www\.w3\.org\/1999\/xlink$/];
const runtime = ['assets/site.css', 'assets/theme.js', ...fs.readdirSync(path.join(ROOT, 'src')).filter((f) => f.endsWith('.js') && !f.includes('oauth')).map((f) => 'src/' + f)];
for (const f of runtime) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of s.matchAll(/https?:\/\/[^\s"'`)]+/g)) if (!ALLOWED.some((r) => r.test(m[0]))) fail(`${f}: external origin ${m[0]}`);
}

console.log(`${html.size} pages, ${nLinks} internal links/assets checked`);
for (const w of warns) console.warn('WARN ' + w);
for (const f of fails.slice(0, 60)) console.error('FAIL ' + f);
if (fails.length > 60) console.error(`... and ${fails.length - 60} more`);
console.log(fails.length ? `${fails.length} failure(s)` : 'pages: all checks passed');
process.exit(fails.length ? 1 : 0);

# Peer review: free tool sites (checked 2026-10-22, via page fetch; claims are self-reported)

| Site | Focus | Client-side? | Takeaway |
|---|---|---|---|
| seobility.net/free-seo-tools | SEO checker, keyword/rank/backlink, SERP snippet, redirect checker, TF*IDF | Server (live data) | Strong on data we can't get client-side; web app can't match, extension might partly |
| IamRamgarhia/All-In-One-Free-SEO-Tool (MIT) | 90+ SEO tools: crawler, rank tracking, GSC/GA4 OAuth, AI visibility, MCP server | Server (Next.js + SQLite + Playwright) | Feature map for SEO; self-hosted, not client-side |
| appforcestudio.com/tools | 59 app/SEO tools (meta, schema, sitemap, robots, hreflang, canonical, privacy policy gen) | Not stated; many "coming soon" | Good SEO generator list |
| achromatic.dev/tools | ~45 formatters/converters/SEO (meta analyzer, X card, robots, keyword density) | Mostly not stated | Standard dev utilities |
| all-free-tool.com/developer-tools | 26 tools incl. EXIF viewer/remover, password strength + breach check | Claims browser | EXIF remover = privacy tool |
| devstools.app | ~250 dev tools (crypto/keys, JSON/OpenAPI converters, config generators, LLM token/cost tools); page is behind a bot checkpoint but its sitemap is public | Client-side per its slugs | Reviewed via /sitemap/en.xml; feasible gaps built (devx, devgen, devgen2) |
| devtoolsdaily.com | 300+ tools; SEO Inspector, JSON-LD Inspector, Secret Detector & Redactor, Log & Privacy Workbench, HTTP Security Header Helper, API Workbench (CORS) | Local, explicit for several | Closest to our concept; pipelines idea |
| digitaltoolpad.com/encoding-tools | 31 encoding/hash/JWT tools | Claims all browser | Thin, SEO-page style |
| qubittool (Apache-2.0 community repo) | ~60 JSON/text/image/PDF/calculators | Claims browser; source not public | Not a code source |
| toolcove.dev/private-dev-tools | 27-35 dev tools, privacy-first branding, offline PWA | Claims zero network | Privacy positioning + "check the Network tab" proof |
| usetoolsuite.com | 153 tools, in-browser AI (transformers), PDF suite, Image Redaction, EXIF, Meta/OG, robots | Claims all local | Broadest client-side set; in-browser AI is feasible |
| devtools.page | 90+ tools, OG/meta, password strength, finance/AU calculators | Few marked | Padded with duplicates |
| ideaproof.io dev-tools | Actually a free-tier directory (hosting, auth, analytics) | n/a | Not a tool site |
| itsfree.dev | Directory of 142 free dev services (auth, hosting, analytics, Mozilla Observatory, HIBP) | n/a | Reference for free infra/APIs |
| free-for.dev | Docsify directory of free dev services (repo ripienaar/free-for-dev) | n/a | Not a tool site; nothing to build |
| scrappey.com/tools | Browser fingerprint, WebRTC/DNS leak, HAR analyzer, anti-bot detector, robots validator | Fingerprint/HAR client-side, rest not stated | Good privacy-tool ideas; funnel to paid product |
| devtools.tools | 54 tools, test-data generators, sensors, 3 SEO tools | Most local; network tools use external services | Huge catalog, shallow |
| all-free-tool.com | SEO, dev, image, PDF, calculators | Not stated | Generic |

## Patterns
- Commodity (formatters, hashes, JWT, base64): saturated everywhere; don't differentiate on these.
- Differentiators seen: in-browser AI, EXIF/redaction, leak tests (WebRTC/DNS/fingerprint), HAR analysis, secret redaction, JSON-LD/SEO inspectors, local-only proof.
- Server-dependent SEO (backlinks, ranks, volumes) is where competitors lean on backends; our extension (cross-origin fetch) can cover page audits, robots/sitemap/headers/redirect checks without one.
- Many "client-side" claims are unverified; verifiable privacy (no network requests) is a selling point.

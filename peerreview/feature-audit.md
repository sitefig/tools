# Feature audit: other tool sites vs our tools

Scope: every individual tool or feature listed by 13 other sites, compared with our tool ids (content/en/*.json, titles and descriptions in assets/tools.json). The devstools.app slug audit (gap-audit.md) was not redone. Library after this audit: 912 tools (747 + 165 built in src/tools/gap2.js).

Method: tool lists came from each site's sitemap, GitHub tree (IamRamgarhia repo; qubittool's repo only has static HTML so its sitemap-tools-en.xml was used), or the page HTML links (seobility, usetoolsuite which has no sitemap). Slugs from all sites were merged (1451 unique slugs; 168 equal one of our ids exactly). Every other slug was matched by title/description, and doubtful ones were run. No site blocked us. ideaproof.io/dev-tools, itsfree.dev and free-for.dev are directories of third-party services and products: there are no tools to build from them.

Status counts over 1451 unique slugs: covered by an existing tool 866, built now 287, skipped (needs network/API/auth/server/paid data) 119, not built (feasible client-side but out of scope, too large, or risky) 175, landing/category pages ignored 4.

Honesty notes: "AI" features that were built are rule, lexicon or statistics based and are labelled so on their pages (text-summarizer, tone-analyzer, headline-generator, meta-description-suggester, entity-extractor, regex-generator, commit-message-suggester, prompt-compressor and others); no model was downloaded. Heavier AI features (image captioning/classification/detection/upscaling, question answering, paraphrase, translation, speech-to-text, AI-text detection) were skipped because no small model with verifiable weights and licence was available, as were network features. Built tools were checked against independent oracles where one exists (reference libraries, openssl, gpg, ssh-keygen, ffprobe, python-docx, pyarrow, zxing-cpp, LibreOffice, ...); see the final report for the list.

## Per-site counts (slug counts; a slug listed by several sites counts for each)

| site | abbrev | listed | covered | built now | skipped | not built | ignored |
|---|---|---|---|---|---|---|---|
| devtools.tools | DT | 506 | 271 | 111 | 41 | 81 | 2 |
| seobility.net | SB | 9 | 2 | 4 | 3 | 0 | 0 |
| IamRamgarhia/All-In-One-Free-SEO-Tool (GitHub) | IR | 92 | 34 | 26 | 32 | 0 | 0 |
| appforcestudio.com | AF | 18 | 18 | 0 | 0 | 0 | 0 |
| all-free-tool.com | AFT | 33 | 31 | 1 | 0 | 1 | 0 |
| usetoolsuite.com | UT | 154 | 123 | 7 | 17 | 7 | 0 |
| achromatic.dev | AC | 42 | 41 | 1 | 0 | 0 | 0 |
| devtools.page | DPG | 107 | 89 | 5 | 11 | 2 | 0 |
| devtoolsdaily.com | DD | 168 | 124 | 16 | 0 | 26 | 2 |
| digitaltoolpad.com | DP | 492 | 308 | 124 | 8 | 52 | 0 |
| qubittool.com | QT | 93 | 81 | 3 | 2 | 7 | 0 |
| scrappey.com/tools | SC | 33 | 19 | 1 | 13 | 0 | 0 |
| toolcove.dev | TC | 14 | 14 | 0 | 0 | 0 | 0 |

## Skip reasons

- (3) backlink data comes from a crawled link index (paid/server data); the disavow-file-generator covers writing the file
- (5) needs live search results or a search API
- (5) needs keyword volume / difficulty databases or live trend APIs (paid or server data)
- (7) depends on an external API, an AI model or a hosted agent, or is a manual editorial judgement
- (17) must fetch other websites or render pages on a server (CORS blocks it in a web page); a browser extension could supply the content to the existing audit tools
- (3) needs the Chrome UX Report API or Search Console OAuth/API
- (16) needs DNS/WHOIS/IP-geolocation queries (network or databases); dns-record-generator, dns-resolution-simulator and browser-info cover the offline parts
- (31) needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere)
- (7) sends or receives live HTTP requests (needs a server or cross-origin access); curl-builder and the converters build the request without sending it
- (1) AI-text detection needs language-model perplexity and is unreliable; building it would mislead users
- (2) browser speech recognition sends audio to a vendor service, and local models are large unverified downloads
- (1) needs live exchange rates (external data feed)
- (3) needs a live TLS handshake with a server; x509-viewer and x509-chain-analyzer inspect certificates you paste
- (1) looks up the Australian Business Register (external API)
- (1) needs an LLM; resume-builder covers layout
- (4) needs yearly tax rates and rules published by a tax authority (maintained data that changes every year)
- (1) burn-after-reading needs server-side one-time storage; aes-encrypt and openpgp-symmetric-encrypt cover local encryption
- (6) needs maintained external data (price lists, tariff codes, benchmark results, visa rules, per-country tax ID checks); existing offline validators cover the format-only part (vat-number-format-validator, luhn-validator, iban-validator)
- (4) depends on third-party anti-bot vendors, proxy lists or probing remote hosts
- (1) fetches captions from YouTube (network/API); transcript-cleaner cleans text you paste

## Not built reasons

- (1) no dedicated quotation template; invoice-generator and receipt-generator produce similar printable documents but their title is fixed
- (3) fake chat/social screenshots can be used to fabricate evidence or impersonate people; deliberately not built
- (1) device-frame mockup design tool (graphics assets); not built
- (23) running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript
- (5) hosted AI service, framework landing page or full terminal emulator: not a self-contained client-side tool
- (1) country reference table (ISO codes, dial codes, currencies) is maintained data; not built
- (3) bank statement PDFs have no common layout; reliable parsing needs per-bank templates and handles sensitive data; csv tools and pdf-text-extract-simple cover generic cases
- (11) transcoding needs audio/video encoders (MP3, H.264) that browsers do not expose and ffmpeg.wasm is third-party code; audio-converter (to WAV) and video-to-gif cover what the platform allows
- (3) object removal needs an inpainting model (hundreds of MB, no verified small model); background-remover-solid handles plain backgrounds only
- (4) real PDF optimisation needs image re-encoding inside the PDF object graph; re-rasterising pages would destroy text, so not built
- (2) needs a curated names dataset with licence; not built
- (2) needs handwriting fonts or a generative model; no licensed font set bundled
- (3) face detection needs a vision model; image-redaction lets you box and blur faces by hand
- (1) holiday dates depend on per-country rules and yearly decrees (maintained data); not built
- (1) PDF417 needs three 929-entry cluster tables and a text-compaction encoder; no reference encoder at hand to verify it, so not built
- (1) FBX is a proprietary binary format with compressed arrays; not built (STL, OBJ, PLY, GLB, glTF and 3MF are supported)
- (2) Outlook .msg is an OLE compound file (CFB) format; reader not built (eml-viewer covers .eml)
- (5) Photoshop / Illustrator formats need large proprietary decoders; not built
- (6) needs a TeX/MathML typesetting engine (KaTeX/MathJax class); third-party code is not used and a faithful engine is too large to hand-write
- (9) seasonal content / list-template pages rather than a computation; scratchpad-notes, bill-tracker and secret-santa-generator cover the practical parts
- (1) image tracing (colour quantisation + curve fitting) is a large algorithm; not built
- (5) directory/listing pages of links, not tools
- (2) editing annotations / AcroForm fields needs a PDF object editor beyond the page-level tools we have; not built
- (3) faithful Office layout needs a full rendering engine (LibreOffice-class); only simple text/Markdown to PDF exist
- (1) PDF password encryption needs object-level RC4/AES with the PDF writer; not built (no verified writer hook yet)
- (3) content/template pages (advice text), not a computation
- (1) safety-critical wiring sizes must come from the licensed electrical code tables of the user's country; deliberately not built
- (1) safe identifier renaming and control-flow changes need a full JavaScript parser; text-obfuscator covers HTML/email obfuscation
- (1) editing Lottie animations (speed, colours, layers) needs a Lottie model; not built
- (2) arcade games are not tools; game-2048, memory-match and minesweeper exist
- (27) educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built
- (2) Apache Arrow IPC and GeoTIFF decoders (with codecs) are large; not built
- (3) cloud architecture diagram editors need vendor icon sets (licensed) and a canvas editor; mermaid-lite-renderer and graphviz-dot-lite draw text-defined diagrams
- (3) niche or end-of-life platform formats; not built (cloudformation-template-generator, circleci-config-generator and kubernetes generators exist)
- (2) font parsing/subsetting needs a font engine (cmap, glyf, GSUB tables); not built
- (1) licence compatibility is legal advice that needs an authoritative maintained table; package-json-license-checker lists licences
- (1) opinionated kernel tuning advice depends on workload; not built
- (1) opening many tabs is blocked by popup blockers; sitemap-url-extractor lists URLs
- (2) a Redis emulator or RDB memory model needs a large behavioural model; redis-command-generator and redis-lua-script-generator exist
- (1) railroad diagrams / DFA stepping are diagram renderers; regex-explainer gives a textual breakdown
- (1) random valid-format wallet addresses add little over bech32-codec, eip55-checksum-address and bip39-generator; not built
- (6) generating tax IDs, national ID or licence numbers risks producing numbers that belong to real people; test-identifier-generator covers identifiers with public check-digit schemes only
- (1) a full synthesiser UI is out of scope; tone-generator and binaural-beat-generator cover oscillators
- (12) astrology/astronomy/pseudo-science tools: ephemeris maths would need an astronomy library and oracle, and the astrology outputs have no evidence base; not built
- (1) recording an arbitrary canvas needs a host page that owns the canvas; screen-recorder covers capture
- (4) language translation needs full parsers and semantics per language pair; not built

## Full table

Decision words: covered-by (existing tool ids), built-now (new id in src/tools/gap2.js), SKIP, NOT BUILT, ignored.

| slug | sites | decision |
|---|---|---|
| 2048 | DT | covered-by: game-2048 |
| seo-checker | seobility | built-now: seo-html-compare (page audit) ; covered-by seo-inspector (single page) |
| keyword-checker | seobility | built-now: keyword-placement-checker |
| seo-compare | seobility | built-now: seo-html-compare |
| redirect-checker | seobility | built-now: redirect-chain-analyzer |
| backlink-checker | seobility | SKIP: backlink data comes from a crawled link index (paid/server data); the disavow-file-generator covers writing the file |
| ranking-checker | seobility | SKIP: needs live search results or a search API |
| serp-snippet-generator | seobility | covered-by: serp-snippet |
| tfidf-tool | seobility | covered-by: tfidf |
| keyword-research-tool | seobility | SKIP: needs keyword volume / difficulty databases or live trend APIs (paid or server data) |
| ads-funnel | iamramgarhia | covered-by: conversion-funnel-visualizer, ads-roas-calculator |
| ai-citation-tactics | iamramgarhia | built-now: geo-readiness-checker |
| ai-overview | iamramgarhia | built-now: geo-readiness-checker |
| ai-robots | iamramgarhia | covered-by: robots-generator, robots-tester, ai-bot-robots-builder |
| ai-schema | iamramgarhia | covered-by: schema-generator, jsonld-inspector |
| aio-passage | iamramgarhia | built-now: geo-readiness-checker |
| anchor-distribution | iamramgarhia | covered-by: anchor-text-distribution |
| auto-link | iamramgarhia | built-now: internal-link-suggester |
| backlink-discovery | iamramgarhia | SKIP: backlink data comes from a crawled link index (paid/server data); the disavow-file-generator covers writing the file |
| bing | iamramgarhia | SKIP: needs live search results or a search API |
| branded-split | iamramgarhia | built-now: branded-query-splitter |
| browser-agent | iamramgarhia | SKIP: depends on an external API, an AI model or a hosted agent, or is a manual editorial judgement |
| bulk-alt | iamramgarhia | covered-by: image-seo (alt text audit; generating alt text needs an image-captioning model) |
| bulk-scan | iamramgarhia | SKIP: must fetch other websites or render pages on a server (CORS blocks it in a web page); a browser extension could supply the content to the existing audit tools |
| cannibalization | iamramgarhia | built-now: keyword-cannibalization-detector |
| canonical-audit | iamramgarhia | covered-by: seo-inspector |
| cluster | iamramgarhia | covered-by: keyword-clusterer, topic-cluster-planner |
| code-generator | iamramgarhia | SKIP: depends on an external API, an AI model or a hosted agent, or is a manual editorial judgement |
| content-grader | iamramgarhia | built-now: keyword-placement-checker |
| content-helpers | iamramgarhia | covered-by: text-statistics, readability, keyword-extractor, headline-generator |
| content-score | iamramgarhia | built-now: keyword-placement-checker |
| crux-origin | iamramgarhia | SKIP: needs the Chrome UX Report API or Search Console OAuth/API |
| crux | iamramgarhia | SKIP: needs the Chrome UX Report API or Search Console OAuth/API |
| disavow | iamramgarhia | covered-by: disavow-file-generator |
| dns-whois | iamramgarhia | SKIP: needs DNS/WHOIS/IP-geolocation queries (network or databases); dns-record-generator, dns-resolution-simulator and browser-info cover the offline parts |
| domain-overview | iamramgarhia | SKIP: needs DNS/WHOIS/IP-geolocation queries (network or databases); dns-record-generator, dns-resolution-simulator and browser-info cover the offline parts |
| eeat-audit | iamramgarhia | built-now: eeat-signal-checker |
| external | iamramgarhia | covered-by: internal-link-extractor |
| facet-trap | iamramgarhia | built-now: url-parameter-analyzer |
| freshness | iamramgarhia | built-now: eeat-signal-checker |
| gbp-reply | iamramgarhia | built-now: review-reply-generator |
| geo-score | iamramgarhia | built-now: geo-readiness-checker |
| geo-swot | iamramgarhia | covered-by: swot-generator |
| github-pr | iamramgarhia | SKIP: depends on an external API, an AI model or a hosted agent, or is a manual editorial judgement |
| gsc-coverage | iamramgarhia | SKIP: needs the Chrome UX Report API or Search Console OAuth/API |
| headers | iamramgarhia | covered-by: http-headers-analyzer, security-headers-generator |
| health-check | iamramgarhia | covered-by: seo-inspector |
| hreflang-gen | iamramgarhia | covered-by: hreflang-generator, hreflang-validator |
| hreflang | iamramgarhia | covered-by: hreflang-generator, hreflang-validator |
| image-gen | iamramgarhia | SKIP: depends on an external API, an AI model or a hosted agent, or is a manual editorial judgement |
| indexnow | iamramgarhia | built-now: indexnow-builder |
| intent-classifier | iamramgarhia | covered-by: keyword-intent-classifier |
| internal-linking | iamramgarhia | built-now: pagerank-calculator, internal-link-suggester |
| keyword-difficulty | iamramgarhia | SKIP: needs keyword volume / difficulty databases or live trend APIs (paid or server data) |
| link-checker | iamramgarhia | SKIP: must fetch other websites or render pages on a server (CORS blocks it in a web page); a browser extension could supply the content to the existing audit tools |
| link-graph | iamramgarhia | built-now: pagerank-calculator |
| link-intersect | iamramgarhia | SKIP: backlink data comes from a crawled link index (paid/server data); the disavow-file-generator covers writing the file |
| link-recommender | iamramgarhia | built-now: internal-link-suggester |
| llms-txt | iamramgarhia | covered-by: llms-txt-generator |
| local-cwv | iamramgarhia | built-now: core-web-vitals-grader (metrics entered by hand; lab run needs a browser/server) |
| meta-tag-generator | iamramgarhia, appforce, AFT, UT, DT | covered-by: covered-by: meta-tag-generator (same id) |
| migration-map | iamramgarhia | built-now: redirect-map-matcher |
| migration-parity | iamramgarhia | built-now: seo-html-compare |
| mobile-friendly | iamramgarhia | SKIP: must fetch other websites or render pages on a server (CORS blocks it in a web page); a browser extension could supply the content to the existing audit tools |
| news-headline | iamramgarhia | built-now: headline-generator (template based) |
| og-image | iamramgarhia | covered-by: opengraph-banner-canvas-generator |
| outreach-personalize | iamramgarhia | SKIP: depends on an external API, an AI model or a hosted agent, or is a manual editorial judgement |
| pagerank | iamramgarhia | built-now: pagerank-calculator |
| perf-budget | iamramgarhia | covered-by: app-performance-budget-calculator |
| person-schema | iamramgarhia | covered-by: schema-generator, jsonld-inspector |
| pixel-preview | iamramgarhia | covered-by: serp-snippet |
| plagiarism | iamramgarhia | built-now: text-similarity-checker (local text-to-text only; web plagiarism search is skipped) |
| programmatic-seo | iamramgarhia | covered-by: mock-data-generator, csv-to-sql ; templates: prompt-template-filler |
| rank-where | iamramgarhia | SKIP: needs live search results or a search API |
| reddit-research | iamramgarhia | SKIP: needs keyword volume / difficulty databases or live trend APIs (paid or server data) |
| redirects-bulk | iamramgarhia | covered-by: redirect-code-generator, redirect-rules-converter, htaccess-generator |
| redirects-manager | iamramgarhia | covered-by: redirect-code-generator, redirect-rules-converter, htaccess-generator |
| refresh | iamramgarhia | SKIP: depends on an external API, an AI model or a hosted agent, or is a manual editorial judgement |
| render | iamramgarhia | SKIP: must fetch other websites or render pages on a server (CORS blocks it in a web page); a browser extension could supply the content to the existing audit tools |
| reputation-abuse-risk | iamramgarhia | SKIP: depends on an external API, an AI model or a hosted agent, or is a manual editorial judgement |
| robots-history | iamramgarhia | covered-by: robots-generator, robots-tester, ai-bot-robots-builder |
| robots | iamramgarhia | covered-by: robots-generator, robots-tester, ai-bot-robots-builder |
| schema-validate | iamramgarhia | covered-by: schema-generator, jsonld-inspector |
| schema | iamramgarhia | covered-by: schema-generator, jsonld-inspector |
| screenshot-import | iamramgarhia | SKIP: must fetch other websites or render pages on a server (CORS blocks it in a web page); a browser extension could supply the content to the existing audit tools |
| search-volume | iamramgarhia | SKIP: needs keyword volume / difficulty databases or live trend APIs (paid or server data) |
| security | iamramgarhia | covered-by: http-headers-analyzer, security-headers-generator |
| serp-features | iamramgarhia | SKIP: needs live search results or a search API |
| serp-volatility | iamramgarhia | SKIP: needs live search results or a search API |
| sitemap | iamramgarhia | covered-by: sitemap-generator, sitemap-validator, sitemap-url-extractor |
| social-preview | iamramgarhia | covered-by: covered-by: social-preview (same id) |
| soft-404 | iamramgarhia | SKIP: must fetch other websites or render pages on a server (CORS blocks it in a web page); a browser extension could supply the content to the existing audit tools |
| summarizer | iamramgarhia | built-now: text-summarizer |
| sxo | iamramgarhia | covered-by: serp-snippet, keyword-intent-classifier |
| traffic-drop | iamramgarhia | built-now: traffic-drop-analyzer |
| trending | iamramgarhia | SKIP: needs keyword volume / difficulty databases or live trend APIs (paid or server data) |
| uptime | iamramgarhia | SKIP: must fetch other websites or render pages on a server (CORS blocks it in a web page); a browser extension could supply the content to the existing audit tools |
| utm-attribution | iamramgarhia | covered-by: utm-builder, utm-bulk-builder |
| wayback | iamramgarhia | SKIP: must fetch other websites or render pages on a server (CORS blocks it in a web page); a browser extension could supply the content to the existing audit tools |
| wp-hack-scan | iamramgarhia | built-now: hacked-html-scanner |
| youtube-audit | iamramgarhia | SKIP: must fetch other websites or render pages on a server (CORS blocks it in a web page); a browser extension could supply the content to the existing audit tools |
| youtube | iamramgarhia | SKIP: must fetch other websites or render pages on a server (CORS blocks it in a web page); a browser extension could supply the content to the existing audit tools |
| schema-markup-generator | appforce, AFT | covered-by: schema-generator, jsonld-inspector |
| heading-analyzer | appforce | covered-by: covered-by: heading-analyzer (same id) |
| readability-analyzer | appforce | covered-by: readability, text-statistics |
| url-slug-generator | appforce | covered-by: slug-generator |
| robots-txt-generator | appforce, AC, AFT, DT | covered-by: robots-generator, robots-tester, ai-bot-robots-builder |
| xml-sitemap-generator | appforce | covered-by: sitemap-generator, sitemap-validator, sitemap-url-extractor |
| canonical-tag-generator | appforce | covered-by: canonical-generator |
| hreflang-tag-generator | appforce | covered-by: hreflang-generator, hreflang-validator |
| image-seo-optimizer | appforce | covered-by: image-seo (alt text audit; generating alt text needs an image-captioning model) |
| privacy-policy-generator | appforce, UT | covered-by: covered-by: privacy-policy-generator (same id) |
| app-name-generator | appforce | covered-by: app-name-ideas |
| api-formatter | appforce | covered-by: json-format |
| color-palette-generator | appforce, DPG | covered-by: palette-generator, tailwind-v4-color-palette, color-mixer |
| qr-code-generator | appforce, DD, DP, UT, DPG, DT | covered-by: covered-by: qr-code-generator (same id) |
| favicon-generator | appforce, AC, DP, UT, DT | covered-by: covered-by: favicon-generator (same id) |
| dark-mode-generator | appforce | covered-by: css-filter-generator, tailwind-converter (dark: variants); palette-generator |
| app-link-generator | appforce | covered-by: universal-links-validator |
| background-remover | AC, DP, UT | built-now: background-remover-solid (plain backgrounds only, no AI) |
| base64 | AC, UT, DT | covered-by: base64-encode, base64-decode, base64url-encoder |
| case-converter | AC, AFT, QT, UT, DT | covered-by: covered-by: case-converter (same id) |
| color-palette | AC, UT | covered-by: palette-generator, tailwind-v4-color-palette, color-mixer |
| cron-parser | AC, UT | covered-by: cron-explainer |
| css-formatter | AC, DD, QT | covered-by: css-format |
| css-unit-converter | AC, DD | covered-by: covered-by: css-unit-converter (same id) |
| csv-to-json | AC, QT, DPG, DT | covered-by: covered-by: csv-to-json (same id) |
| diff-checker | AC, DP, UT, DPG, DT | covered-by: text-diff, code-diff-html, json-diff, json-patch-generator |
| gradient-generator | AC | covered-by: covered-by: gradient-generator (same id) |
| hash-generator | AC, DP, QT, UT, DPG, DT, SC | covered-by: covered-by: hash-generator (same id) |
| html-entity-encoder | AC, QT, DPG | covered-by: html-minify, html-entities, html-entities-reference |
| html-formatter | AC, DD, DP, QT, UT | covered-by: html-format |
| image-compressor | AC, QT, UT, DPG, DT | covered-by: covered-by: image-compressor (same id) |
| image-resizer | AC, DP, QT, UT, DPG | covered-by: covered-by: image-resizer (same id) |
| image-to-base64 | AC, QT | covered-by: covered-by: image-to-base64 (same id) |
| js-formatter | AC, QT | covered-by: js-format |
| json-formatter | AC, AFT, DD, DP, QT, TC, UT, DPG, DT | covered-by: json-format, json-tree |
| json-to-csv | AC, QT, TC, DPG | covered-by: covered-by: json-to-csv (same id) |
| json-to-typescript | AC, DP, QT, TC, UT, DT | covered-by: covered-by: json-to-typescript (same id) |
| json-to-yaml | AC, DD, QT, TC, DPG, DT | covered-by: covered-by: json-to-yaml (same id) |
| jwt-decoder | AC, DP, UT, DPG, DT, SC | covered-by: jwt-decode, jwt-encode, jwt-verify-hs |
| keyword-density-checker | AC | covered-by: keyword-density |
| lorem-ipsum | AC, UT | covered-by: covered-by: lorem-ipsum (same id) |
| markdown-preview | AC, DP, UT | covered-by: covered-by: markdown-preview (same id) |
| meta-tag-analyzer | AC, AFT | covered-by: meta-analyzer, og-twitter-generator, social-preview, meta-tag-generator |
| password-generator | AC, DP, QT, UT, DPG, DT | covered-by: covered-by: password-generator (same id) |
| regex-tester | AC, AFT, DD, DP, QT, UT, DPG, SC | covered-by: covered-by: regex-tester (same id) |
| shadow-generator | AC | covered-by: box-shadow-generator |
| sitemap-generator | AC, AFT, SC | covered-by: covered-by: sitemap-generator (same id) |
| slug-generator | AC, QT, DPG, DT | covered-by: covered-by: slug-generator (same id) |
| sql-formatter | AC, DD, DP, QT, TC, UT, DPG | covered-by: sql-format, sql-minify |
| timestamp-converter | AC, QT, DPG, DT | covered-by: covered-by: timestamp-converter (same id) |
| twitter-card-validator | AC, DT | covered-by: meta-analyzer, og-twitter-generator, social-preview, meta-tag-generator |
| typescript-formatter | AC | covered-by: js-format (TypeScript is not parsed; see notes in the tool) |
| url-encoder | AC, AFT, DD, DP, QT, UT, DPG | covered-by: url-encode, url-decode |
| uuid-generator | AC, DP, QT, UT, DPG, DT | covered-by: covered-by: uuid-generator (same id) |
| word-counter | AC, AFT, DP, DPG | covered-by: covered-by: word-counter (same id) |
| xml-formatter | AC, DD, DP, QT, UT, DPG, DT | covered-by: xml-format, xml-validate |
| yaml-to-json | AC, DD, DP, QT | covered-by: covered-by: yaml-to-json (same id) |
| invoice-generator | AFT, UT, DPG, DT | covered-by: covered-by: invoice-generator (same id) |
| on-page-seo-checker | AFT | covered-by: seo-inspector |
| open-graph-generator | AFT | covered-by: meta-analyzer, og-twitter-generator, social-preview, meta-tag-generator |
| twitter-card-generator | AFT | covered-by: meta-analyzer, og-twitter-generator, social-preview, meta-tag-generator |
| free-serp-preview-tool | AFT | covered-by: serp-snippet |
| html-minifier | AFT, DP, DT | covered-by: html-minify, html-entities, html-entities-reference |
| css-minifier | AFT, UT, DPG | covered-by: css-minify |
| js-minifier | AFT | covered-by: js-minify |
| base64-encoder | AFT, DD, DP, QT, DPG | covered-by: base64-encode, base64-decode, base64url-encoder |
| base64-decoder | AFT, DD, DP | covered-by: base64-encode, base64-decode, base64url-encoder |
| quotation-generator | AFT | BUILT NOW (gap3): quotation-generator |
| receipt-generator | AFT | covered-by: covered-by: receipt-generator (same id) |
| profit-margin-calculator | AFT, DPG | covered-by: markup-margin, profit-margin |
| gst-calculator | AFT | covered-by: vat-calculator, discount-calculator |
| loan-emi-calculator | AFT | covered-by: loan-calculator, emi-calculator |
| roi-calculator | AFT, DPG | covered-by: covered-by: roi-calculator (same id) |
| break-even-calculator | AFT | covered-by: break-even |
| character-counter | AFT, DP, TC | covered-by: word-counter, string-length-bytes, text-statistics |
| remove-duplicate-lines | AFT, DP | covered-by: dedupe-lines, sort-lines |
| text-sorter | AFT | covered-by: sort-lines |
| text-reverser | AFT | covered-by: reverse-text |
| random-text-generator | AFT | built-now: random-text-generator |
| lorem-ipsum-generator | AFT, QT, DPG | covered-by: lorem-ipsum |
| ai-chat-screenshot-generator | DD | NOT BUILT: fake chat/social screenshots can be used to fabricate evidence or impersonate people; deliberately not built |
| app-store-screenshots | DD | NOT BUILT: device-frame mockup design tool (graphics assets); not built |
| ascii/box-drawing | DD | built-now: text-box-drawer |
| ascii/comment-art | DD | built-now: text-box-drawer |
| ascii/drawing | DD | covered-by: ascii-table-generator, ascii-tree-generator |
| ascii/image-to-ascii-art | DD | covered-by: image-to-ascii |
| ascii/text-to-ascii-art | DD | covered-by: ascii-art-text |
| ascii/tools | DD | covered-by: ascii-table-generator, ascii-tree-generator |
| ascii/tree-printer | DD | covered-by: ascii-table-generator, ascii-tree-generator |
| audio/live-code | DD | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| base64-image-encoder | DD, DPG, DT | covered-by: image-to-base64, base64-image-viewer, base64-to-pdf |
| base64/to-hex | DD | covered-by: hex-to-base64 |
| base64/to-pdf | DD | covered-by: image-to-base64, base64-image-viewer, base64-to-pdf |
| big-number | DD | covered-by: bignumber-calculator |
| blockly/playground | DD | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| box-shadow-generator | DD, DPG, DT | covered-by: covered-by: box-shadow-generator (same id) |
| canvas/playground | DD | NOT BUILT: hosted AI service, framework landing page or full terminal emulator: not a self-contained client-side tool |
| code-screenshot | DD | built-now: code-to-image |
| color/contrast | DD | covered-by: contrast-checker (WCAG ratio and APCA) |
| color/converter | DD | covered-by: color-converter |
| color/palette-generator | DD | covered-by: palette-generator, tailwind-v4-color-palette, color-mixer |
| color/picker | DD | covered-by: color-picker-from-image, color-converter |
| command-generators/curl | DD | covered-by: curl-builder |
| command-generators/du | DD | built-now: shell-command-builder |
| command-generators/mysql | DD | built-now: shell-command-builder (mysqldump) |
| command-generators/tar | DD | built-now: shell-command-builder |
| countries | DD | NOT BUILT: country reference table (ISO codes, dial codes, currencies) is maintained data; not built |
| cpp/online | DD | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| csv/query-as-sql | DD | covered-by: sql-on-csv |
| csv/to-json | DD | covered-by: csv-to-json |
| csv/to-sql | DD | covered-by: csv-to-sql |
| csv/viewer | DD | covered-by: csv-viewer, csv-to-json, sql-on-csv, json-tree |
| data/explorer | DD | covered-by: csv-viewer, csv-to-json, sql-on-csv, json-tree |
| date-and-time/cron-builder | DD | covered-by: cron-generator, natural-language-to-cron |
| date-and-time/stopwatch | DD | covered-by: date-difference, add-subtract-dates, stopwatch, countdown-timer |
| date-and-time/timer | DD | covered-by: date-difference, add-subtract-dates, stopwatch, countdown-timer |
| devops/cidr-calculator | DD | covered-by: ip-subnet-calculator, cidr-contains, ip-supernetting-calculator |
| devops/docker-generator | DD | covered-by: docker-compose-generator, dockerfile-generator |
| devops/env-toolkit | DD | covered-by: env-toolkit, env-linter |
| devops/github-actions-explainer | DD | built-now: github-actions-explainer |
| devops/gitignore | DD | covered-by: gitignore-generator |
| docker/mysql | DD | covered-by: docker-compose-generator, dockerfile-generator |
| docker/postgres | DD | covered-by: docker-compose-generator, dockerfile-generator |
| duckdb/playground | DD | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| epoch-converter | DD, DP | covered-by: timestamp-converter, epoch-batch |
| fake-json-api | DD | covered-by: mock-data-generator, random-json-generator, fake-person-generator, api-mock-response-generator |
| file/diff | DD | covered-by: text-diff, code-diff-html, json-diff, json-patch-generator |
| formatters | DD | ignored: landing/category page (ignored) |
| generators/json | DD | covered-by: mock-data-generator, random-json-generator, fake-person-generator, api-mock-response-generator |
| generators/mock-data | DD | covered-by: mock-data-generator, random-json-generator, fake-person-generator, api-mock-response-generator |
| glsl/playground | DD | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| golang-format-stacktrace | DD | built-now: stacktrace-formatter |
| graphql/playground | DD | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| graphviz | DD | covered-by: graphviz-dot-lite (DOT subset renderer) |
| graphviz/how-to/create-decision-tree-with-graphviz | DD | covered-by: graphviz-dot-lite (DOT subset renderer) |
| graphviz/node-shapes | DD | covered-by: graphviz-dot-lite (DOT subset renderer) |
| graphviz/python | DD | covered-by: graphviz-dot-lite (DOT subset renderer) |
| gzip-brotli-inspector | DD | built-now: gzip-inspector (gzip only; Brotli cannot be decoded by browser APIs) |
| html/html-entities | DD | covered-by: html-minify, html-entities, html-entities-reference |
| html-to-jsx | DD | covered-by: covered-by: html-to-jsx (same id) |
| http/api-workbench | DD | covered-by: curl-builder, http-snippet-generator (sending requests is skipped: network) |
| http/curl-to-code | DD | covered-by: curl-to-code, curl-to-more-languages |
| image/meme-generator | DD | built-now: meme-generator |
| image/toolkit | DD | covered-by: image-resizer, image-compressor, image-cropper, image-format-converter, image-filters |
| inline-sql-variables | DD | built-now: sql-variable-inliner |
| java | DD | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| java-exception-formatter | DD | built-now: stacktrace-formatter |
| javascript | DD | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| javascript-formatter | DD | covered-by: js-format |
| jq | DD | covered-by: jq-playground |
| jq-playground | DD | covered-by: covered-by: jq-playground (same id) |
| jscad/playground | DD | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| json/builder | DD | covered-by: json-format, json-tree |
| json/diff | DD | covered-by: json-diff |
| json/escape | DD | covered-by: json-escape, json-unescape |
| json/graph-visualizer | DD | covered-by: json-tree |
| json/minify | DD | covered-by: json-minify |
| json/schema-validator | DD | covered-by: json-schema-validator |
| json/to-base64 | DD | covered-by: base64-encode |
| json/to-csv | DD | covered-by: json-to-csv |
| json/to-schema | DD | covered-by: json-schema-generator |
| json/to-sql | DD | covered-by: json-to-sql |
| json/to-typescript | DD | covered-by: json-to-typescript, json-to-typescript-type-guards, avro-to-json-schema |
| json/to-zod | DD | covered-by: json-to-zod |
| json/unescape | DD | covered-by: json-escape, json-unescape |
| json/viewer | DD | covered-by: json-format, json-tree |
| json-to-toml | DD | covered-by: covered-by: json-to-toml (same id) |
| jsonpath-playground | DD | covered-by: jsonpath-tester |
| kanban-board | DD | covered-by: covered-by: kanban-board (same id) |
| keyboard-event-code | DD | covered-by: keyboard-event-viewer |
| l-system | DD | built-now: l-system-generator |
| langchain | DD | NOT BUILT: hosted AI service, framework landing page or full terminal emulator: not a self-contained client-side tool |
| logo/playground | DD | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| logs/workbench | DD | covered-by: log-privacy-workbench |
| lua/online | DD | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| markdown | DD | covered-by: markdown-preview, markdown-to-html |
| markdown-editor | DD, DP, QT, DPG | covered-by: markdown-preview, markdown-to-html |
| mcp/inspector | DD | covered-by: mcp-message-validator (live connection skipped: needs network) |
| mermaid | DD | covered-by: mermaid-lite-renderer |
| messaging-screenshot-generator | DD | NOT BUILT: fake chat/social screenshots can be used to fabricate evidence or impersonate people; deliberately not built |
| mind-map | DD | covered-by: mind-map-maker |
| number/base-converter | DD | covered-by: number-base-converter, bitwise-calculator, bignumber-calculator |
| p5js/playground | DD | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| parquet/viewer | DD | built-now: parquet-viewer |
| pipelines | DD | NOT BUILT: hosted AI service, framework landing page or full terminal emulator: not a self-contained client-side tool |
| plantuml | DD | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| podcast-generator | DD | NOT BUILT: hosted AI service, framework landing page or full terminal emulator: not a self-contained client-side tool |
| python | DD | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| random-number/java | DD | covered-by: random-number-picker |
| random-number/javascript | DD | covered-by: random-number-picker |
| random-number/python | DD | covered-by: random-number-picker |
| regex-tester/go | DD | covered-by: regex-tester, regex-to-code |
| regex-tester/java | DD | covered-by: regex-tester, regex-to-code |
| regex-tester/javascript | DD | covered-by: regex-tester, regex-to-code |
| regex-tester/python | DD | covered-by: regex-tester, regex-to-code |
| ruby/online | DD | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| rust | DD | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| security/certificate-viewer | DD | covered-by: x509-viewer, x509-csr-decoder |
| security/hash | DD | covered-by: hash-generator |
| security/hmac | DD | covered-by: hmac-generator |
| security/http-headers | DD | covered-by: http-headers-analyzer |
| security/jwt-debugger | DD | covered-by: jwt-decode, jwt-encode, jwt-verify-hs |
| security/password-generator | DD | covered-by: password-generator, passphrase-generator |
| security/secret-detector | DD | covered-by: secret-detector-redactor, env-linter |
| security/secret-generator | DD | covered-by: random-secret-generator, api-key-generator |
| seo/inspector | DD | covered-by: seo-inspector |
| seo/json-ld-inspector | DD | covered-by: jsonld-inspector |
| seo/social-preview | DD | covered-by: social-preview |
| social-post-screenshot-generator | DD | NOT BUILT: fake chat/social screenshots can be used to fabricate evidence or impersonate people; deliberately not built |
| sql | DD | covered-by: sql-format, sql-minify |
| sqlite | DD | built-now: sqlite-file-viewer |
| stacktrace | DD | built-now: stacktrace-formatter |
| string-length | DD | covered-by: word-counter, string-length-bytes, text-statistics |
| svg-preview | DD | covered-by: svg-preview-editor |
| svg-to-jsx | DD | covered-by: covered-by: svg-to-jsx (same id) |
| template-string-with-values | DD | covered-by: prompt-template-filler, prompt-linter |
| terminal | DD | NOT BUILT: hosted AI service, framework landing page or full terminal emulator: not a self-contained client-side tool |
| text-generator/lorem-ipsum | DD | covered-by: lorem-ipsum |
| text/toolbox | DD | covered-by: text tools: word-counter, case-converter, sort-lines, find-replace, text-cleaner |
| timestamp | DD, UT | covered-by: timestamp-converter, epoch-batch |
| timezone | DD | covered-by: timezone-converter, world-clock, timezone-meeting-planner |
| timezones/cities | DD | covered-by: timezone-converter, world-clock, timezone-meeting-planner |
| timezones/compare | DD | covered-by: timezone-converter, world-clock, timezone-meeting-planner |
| toml-to-json | DD | covered-by: covered-by: toml-to-json (same id) |
| tools | DD | ignored: landing/category page (ignored) |
| ulid-generator | DD | covered-by: covered-by: ulid-generator (same id) |
| unicode/ai | DD | covered-by: char-info, unicode-escape, unicode-character-map, fancy-text |
| unicode/flags | DD | covered-by: emoji-picker |
| url-decoder | DD, DP | covered-by: url-encode, url-decode |
| utm-builder | DD | covered-by: covered-by: utm-builder (same id) |
| uuid/generator | DD | covered-by: uuid-generator, uuid-v7-timestamp-extractor |
| xml/editor | DD | covered-by: xml-format, xml-validate |
| xml/validator | DD | covered-by: xml-format, xml-validate |
| xml/viewer | DD | covered-by: xml-format, xml-validate |
| xpath-tester | DD, SC | covered-by: covered-by: xpath-tester (same id) |
| yaml-editor-validator | DP | covered-by: yaml-format (re-indents and validates; a minifier is yaml-to-json -> json-minify) |
| csv-to-json-converter | DP | covered-by: csv-to-json |
| json-to-csv-converter | DP, DT | covered-by: json-to-csv |
| base64-encoder-decoder | DP | covered-by: base64-encode, base64-decode, base64url-encoder |
| uuid-v4-generator | DP | covered-by: uuid-generator, uuid-v7-timestamp-extractor |
| uuid-v7-generator | DP | covered-by: uuid-generator, uuid-v7-timestamp-extractor |
| xsd-schema-viewer | DP | built-now: xsd-viewer |
| og-image-generator | DP, DT | covered-by: opengraph-banner-canvas-generator |
| markdown-to-pdf | DP, UT | covered-by: covered-by: markdown-to-pdf (same id) |
| markdown-to-docx | DP | built-now: markdown-to-docx |
| timestamp-converter-generator | DP | covered-by: timestamp-converter, epoch-batch |
| sql-formatter-beautifier | DP | covered-by: sql-format, sql-minify |
| pdf-to-docx | DP | covered-by: pdf-text-extract-simple + text-to-pdf (text only) |
| html-to-markdown | DP, QT, DT | covered-by: covered-by: html-to-markdown (same id) |
| regex-ai | DP | built-now: regex-generator |
| pomodoro-timer | DP, DT | covered-by: covered-by: pomodoro-timer (same id) |
| text-case-converter | DP, DPG | covered-by: case-converter |
| uppercase-converter | DP | covered-by: case-converter |
| lowercase-converter | DP | covered-by: case-converter |
| title-case-converter | DP | covered-by: case-converter |
| code-snippet-screenshot | DP | built-now: code-to-image |
| crontab-generator | DP, UT | covered-by: cron-generator, natural-language-to-cron |
| random-name-picker | DP | covered-by: raffle-picker, random-number-picker |
| wheel-of-names | DP | covered-by: decision-wheel |
| url-encoder-decoder | DP, DT | covered-by: url-encode, url-decode |
| offline-ai-chat | DP | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| base64-to-pdf-converter | DP | covered-by: image-to-base64, base64-image-viewer, base64-to-pdf |
| baby-name-ai | DP | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| quote-image-maker | DP | built-now: quote-image-maker |
| bank-statement-converter | DP | NOT BUILT: bank statement PDFs have no common layout; reliable parsing needs per-bank templates and handles sensitive data; csv tools and pdf-text-extract-simple cover generic cases |
| json-to-toon | DP, QT | built-now: json-to-toon |
| graphql-schema-viewer-validator | DP | covered-by: graphql-minify-validate (syntax of queries and SDL), graphql-to-typescript, json-to-graphql-schema |
| online-notepad | DP | covered-by: scratchpad-notes |
| notepad-plus-plus-online | DP | covered-by: scratchpad-notes |
| rapidtables-notepad-alternative | DP | covered-by: scratchpad-notes |
| jwt-decoder-encoder | DP | covered-by: jwt-decode, jwt-encode, jwt-verify-hs |
| yaml-json-converter | DP | covered-by: yaml-to-json, json-to-yaml |
| jpg-to-pdf-converter | DP | covered-by: images-to-pdf |
| image-to-pdf | DP, QT, UT, DT | covered-by: images-to-pdf |
| maintenance-calorie-calculator | DP | covered-by: bmr-tdee |
| open-graph-preview | DP | covered-by: meta-analyzer, og-twitter-generator, social-preview, meta-tag-generator |
| merge-pdf | DP | covered-by: pdf-merge |
| hex-rgb-converter | DP | covered-by: color-converter |
| api-tester | DP | SKIP: sends or receives live HTTP requests (needs a server or cross-origin access); curl-builder and the converters build the request without sending it |
| rgb-hex-converter | DP | covered-by: color-converter |
| world-time-converter | DP | covered-by: timezone-converter, world-clock, timezone-meeting-planner |
| webp-converter | DP | covered-by: image-format-converter (formats the browser can decode and encode: PNG, JPEG, WebP; AVIF/TIFF/BMP input depends on the browser) |
| png-to-webp-converter | DP | covered-by: image-format-converter (formats the browser can decode and encode: PNG, JPEG, WebP; AVIF/TIFF/BMP input depends on the browser) |
| webp-to-png-converter | DP | covered-by: image-format-converter (formats the browser can decode and encode: PNG, JPEG, WebP; AVIF/TIFF/BMP input depends on the browser) |
| jpg-to-webp-converter | DP | covered-by: image-format-converter (formats the browser can decode and encode: PNG, JPEG, WebP; AVIF/TIFF/BMP input depends on the browser) |
| webp-to-jpg-converter | DP | covered-by: image-format-converter (formats the browser can decode and encode: PNG, JPEG, WebP; AVIF/TIFF/BMP input depends on the browser) |
| heic-to-jpg-converter | DP | covered-by: heic-to-jpg, heic-decoder |
| png-to-jpg-converter | DP | covered-by: image-format-converter (formats the browser can decode and encode: PNG, JPEG, WebP; AVIF/TIFF/BMP input depends on the browser) |
| jpg-to-png-converter | DP | covered-by: image-format-converter (formats the browser can decode and encode: PNG, JPEG, WebP; AVIF/TIFF/BMP input depends on the browser) |
| split-pdf | DP | covered-by: pdf-split, pdf-extract-pages |
| base64-to-image | DP, QT | covered-by: image-to-base64, base64-image-viewer, base64-to-pdf |
| citation-generator | DP | built-now: citation-generator |
| md5-generator | DP, QT | covered-by: hash-generator, hash-compare, file-hash, checksum-crc32-adler32 |
| sha256-generator | DP | covered-by: hash-generator, hash-compare, file-hash, checksum-crc32-adler32 |
| instagram-grid-maker | DP | built-now: image-grid-splitter |
| remove-duplicate-lines-and-sort | DP | covered-by: dedupe-lines, sort-lines |
| json-diff-compare | DP | covered-by: json-diff |
| photo-metadata-viewer | DP | covered-by: exif-viewer (shows GPS coordinates; the map tiles would need a network request) |
| photo-metadata-remover | DP | covered-by: exif-remover |
| webm-to-mp4-converter | DP | NOT BUILT: transcoding needs audio/video encoders (MP3, H.264) that browsers do not expose and ffmpeg.wasm is third-party code; audio-converter (to WAV) and video-to-gif cover what the platform allows |
| remove-object-from-photo | DP | NOT BUILT: object removal needs an inpainting model (hundreds of MB, no verified small model); background-remover-solid handles plain backgrounds only |
| openapi-viewer | DP | built-now: openapi-viewer |
| llm-token-counter | DP, DT | covered-by: gpt-token-counter, multi-tokenizer-counter, llm-token-estimator |
| graphql-formatter-beautifier | DP | covered-by: graphql-query-formatter |
| graphql-minifier | DP | built-now: graphql-minify-validate |
| graphql-validator | DP | built-now: graphql-minify-validate |
| compress-pdf | DP | NOT BUILT: real PDF optimisation needs image re-encoding inside the PDF object graph; re-rasterising pages would destroy text, so not built |
| bmi-calculator | DP, QT, DPG | covered-by: covered-by: bmi-calculator (same id) |
| pdf-to-jpg-converter | DP | covered-by: pdf-to-image |
| pdf-to-png-converter | DP | covered-by: pdf-to-image |
| pdf-to-image-converter | DP | covered-by: pdf-to-image |
| macro-calculator | DP, DPG | covered-by: covered-by: macro-calculator (same id) |
| font-generator | DP | covered-by: fancy-text (bold, italic, script, small caps, upside-down, strikethrough and more) |
| small-text-generator | DP | covered-by: fancy-text (bold, italic, script, small caps, upside-down, strikethrough and more) |
| bold-text-generator | DP | covered-by: fancy-text (bold, italic, script, small caps, upside-down, strikethrough and more) |
| cursive-text-generator | DP | covered-by: fancy-text (bold, italic, script, small caps, upside-down, strikethrough and more) |
| instagram-fonts | DP | covered-by: fancy-text (bold, italic, script, small caps, upside-down, strikethrough and more) |
| fancy-text-generator | DP, UT | covered-by: fancy-text (bold, italic, script, small caps, upside-down, strikethrough and more) |
| yaml-formatter | DP, TC, DPG | covered-by: yaml-format (re-indents and validates; a minifier is yaml-to-json -> json-minify) |
| username-generator | DP | built-now: username-generator |
| discord-username-generator | DP | built-now: username-generator |
| reddit-username-generator | DP | built-now: username-generator |
| twitch-username-generator | DP | built-now: username-generator |
| apa-citation-generator | DP | built-now: citation-generator |
| mla-citation-generator | DP | built-now: citation-generator |
| chicago-citation-generator | DP | built-now: citation-generator |
| harvard-citation-generator | DP | built-now: citation-generator |
| coin-flip-simulator | DP | covered-by: coin-flip |
| flip-a-coin | DP | covered-by: coin-flip |
| coin-flip | DP | covered-by: covered-by: coin-flip (same id) |
| heads-or-tails | DP | covered-by: coin-flip |
| list-randomizer | DP | built-now: list-shuffler |
| random-item-picker | DP | covered-by: raffle-picker, random-number-picker |
| random-group-generator | DP | covered-by: random-team-splitter |
| random-team-generator | DP | covered-by: random-team-splitter |
| dice-roller | DP | covered-by: covered-by: dice-roller (same id) |
| roll-two-dice | DP | covered-by: dice-roller |
| d20-roller | DP | covered-by: dice-roller |
| dnd-dice-roller | DP | covered-by: dice-roller |
| json-validator | DP, TC | covered-by: json-validate, json-format |
| json-editor | DP | covered-by: json-validate, json-format |
| json-minifier | DP, TC | covered-by: json-minify |
| json-pretty-print | DP | covered-by: json-format, json-tree |
| rest-api-tester | DP | SKIP: sends or receives live HTTP requests (needs a server or cross-origin access); curl-builder and the converters build the request without sending it |
| http-request-tester | DP | SKIP: sends or receives live HTTP requests (needs a server or cross-origin access); curl-builder and the converters build the request without sending it |
| baby-boy-name-generator | DP | NOT BUILT: needs a curated names dataset with licence; not built |
| baby-girl-name-generator | DP | NOT BUILT: needs a curated names dataset with licence; not built |
| transparent-background-maker | DP | built-now: background-remover-solid |
| png-background-remover | DP | built-now: background-remover-solid |
| bank-statement-to-csv | DP | NOT BUILT: bank statement PDFs have no common layout; reliable parsing needs per-bank templates and handles sensitive data; csv tools and pdf-text-extract-simple cover generic cases |
| bank-statement-to-excel | DP | NOT BUILT: bank statement PDFs have no common layout; reliable parsing needs per-bank templates and handles sensitive data; csv tools and pdf-text-extract-simple cover generic cases |
| base64-image-decoder | DP | covered-by: image-to-base64, base64-image-viewer, base64-to-pdf |
| base64-image-viewer | DP | covered-by: covered-by: base64-image-viewer (same id) |
| base64-to-pdf | DP | covered-by: covered-by: base64-to-pdf (same id) |
| base64-to-pdf-decoder | DP | covered-by: image-to-base64, base64-image-viewer, base64-to-pdf |
| adult-bmi-calculator | DP | covered-by: bmi-calculator, bmr-tdee |
| bmi-calculator-for-women | DP | covered-by: bmi-calculator, bmr-tdee |
| string-length-calculator | DP | covered-by: word-counter, string-length-bytes, text-statistics |
| code-to-image | DP, DPG, DT | built-now: code-to-image |
| code-screenshot-generator | DP | built-now: code-to-image |
| pdf-compressor | DP, QT | NOT BUILT: real PDF optimisation needs image re-encoding inside the PDF object graph; re-rasterising pages would destroy text, so not built |
| reduce-pdf-size | DP | NOT BUILT: real PDF optimisation needs image re-encoding inside the PDF object graph; re-rasterising pages would destroy text, so not built |
| cron-expression-generator | DP, DPG | covered-by: cron-generator, natural-language-to-cron |
| cron-expression-parser | DP, TC, DPG | covered-by: cron-explainer |
| tsv-to-json | DP | covered-by: csv-to-json |
| text-compare | DP | covered-by: text-diff, code-diff-html, json-diff, json-patch-generator |
| text-diff | DP, QT | covered-by: covered-by: text-diff (same id) |
| svg-favicon-generator | DP | covered-by: favicon-generator |
| favicon-maker | DP | covered-by: favicon-generator |
| graphql-schema-validator | DP | covered-by: graphql-minify-validate (syntax of queries and SDL), graphql-to-typescript, json-to-graphql-schema |
| graphql-schema-explorer | DP | covered-by: graphql-minify-validate (syntax of queries and SDL), graphql-to-typescript, json-to-graphql-schema |
| hex-to-rgb | DP | covered-by: color-converter |
| hex-to-rgb-calculator | DP | covered-by: color-converter |
| html-to-md | DP | covered-by: html-to-markdown, markdown-to-html |
| html-table-to-markdown | DP | covered-by: html-table-converter, csv-to-markdown-table, csv-to-html-table |
| photo-resizer | DP | covered-by: image-resizer |
| resize-png | DP | covered-by: image-resizer |
| instagram-image-splitter | DP | built-now: image-grid-splitter |
| instagram-photo-splitter | DP | built-now: image-grid-splitter |
| png-to-pdf | DP | covered-by: images-to-pdf |
| json-compare | DP | covered-by: json-diff |
| json-diff | DP, QT, TC | covered-by: covered-by: json-diff (same id) |
| json-to-toon-converter | DP | built-now: json-to-toon |
| toon-to-json | DP, QT | built-now: toon-to-json |
| json-to-typescript-interface | DP | covered-by: json-to-typescript, json-to-typescript-type-guards, avro-to-json-schema |
| json-to-ts | DP | covered-by: json-to-typescript, json-to-typescript-type-guards, avro-to-json-schema |
| jwt-encoder | DP | covered-by: jwt-encode |
| token-counter | DP | covered-by: gpt-token-counter, multi-tokenizer-counter, llm-token-estimator |
| ai-token-counter | DP | covered-by: gpt-token-counter, multi-tokenizer-counter, llm-token-estimator |
| protein-calculator | DP | covered-by: macro-calculator |
| carb-calculator | DP | covered-by: macro-calculator |
| tdee-calculator | DP | covered-by: bmr-tdee |
| bmr-calculator | DP | covered-by: bmr-tdee |
| online-markdown-editor | DP | covered-by: markdown-preview, markdown-to-html |
| markdown-wysiwyg-editor | DP | covered-by: markdown-preview, markdown-to-html |
| markdown-viewer | DP | covered-by: markdown-preview, markdown-to-html |
| markdown-file-viewer | DP | covered-by: markdown-preview, markdown-to-html |
| markdown-to-word | DP | built-now: markdown-to-docx |
| md-to-docx | DP | built-now: markdown-to-docx |
| md-to-pdf | DP | covered-by: markdown-to-pdf |
| markdown-to-pdf-converter | DP | covered-by: markdown-to-pdf |
| pdf-merger | DP, QT | covered-by: pdf-merge |
| combine-pdf | DP | covered-by: pdf-merge |
| local-ai-chat | DP | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| private-ai-chatbot | DP | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| open-graph-image-generator | DP | covered-by: opengraph-banner-canvas-generator |
| og-image-maker | DP | covered-by: opengraph-banner-canvas-generator |
| open-graph-checker | DP | covered-by: meta-analyzer, og-twitter-generator, social-preview, meta-tag-generator |
| social-media-preview | DP | covered-by: meta-analyzer, og-twitter-generator, social-preview, meta-tag-generator |
| swagger-viewer | DP | built-now: openapi-viewer |
| openapi-editor | DP | built-now: openapi-viewer (viewer only; validation: openapi-validator) |
| random-password-generator | DP | covered-by: password-generator, passphrase-generator |
| strong-password-generator | DP | covered-by: password-generator, passphrase-generator |
| pdf-to-word | DP, UT | covered-by: pdf-text-extract-simple + text-to-pdf (text only) |
| pdf-to-word-converter | DP | covered-by: pdf-text-extract-simple + text-to-pdf (text only) |
| exif-remover | DP | covered-by: covered-by: exif-remover (same id) |
| remove-photo-location | DP | covered-by: exif-remover |
| exif-viewer | DP, UT, DT | covered-by: covered-by: exif-viewer (same id) |
| image-metadata-viewer | DP | covered-by: exif-viewer (shows GPS coordinates; the map tiles would need a network request) |
| study-timer | DP | covered-by: pomodoro-timer |
| focus-timer | DP | covered-by: pomodoro-timer |
| url-to-qr-code | DP | covered-by: qr-code-generator (SVG output is transparent; Wi-Fi payload "WIFI:T:WPA;S:name;P:pass;;") |
| transparent-qr-code-generator | DP | covered-by: qr-code-generator (SVG output is transparent; Wi-Fi payload "WIFI:T:WPA;S:name;P:pass;;") |
| quote-maker | DP | built-now: quote-image-maker |
| quote-image-generator | DP | built-now: quote-image-maker |
| random-winner-picker | DP | covered-by: raffle-picker, random-number-picker |
| regex-generator | DP | built-now: regex-generator |
| regex-explainer | DP, DT | built-now: regex-explainer |
| javascript-regex-tester | DP | covered-by: regex-tester, regex-to-code |
| regex-checker | DP | covered-by: regex-tester, regex-to-code |
| alphabetical-order-tool | DP | covered-by: sort-lines |
| magic-eraser | DP | NOT BUILT: object removal needs an inpainting model (hundreds of MB, no verified small model); background-remover-solid handles plain backgrounds only |
| remove-text-from-image | DP | NOT BUILT: object removal needs an inpainting model (hundreds of MB, no verified small model); background-remover-solid handles plain backgrounds only |
| rgb-to-hex | DP | covered-by: color-converter |
| rgb-to-hex-calculator | DP | covered-by: color-converter |
| extract-pdf-pages | DP | covered-by: pdf-split, pdf-extract-pages |
| pdf-splitter | DP, QT | covered-by: pdf-split, pdf-extract-pages |
| sql-beautifier | DP | covered-by: sql-format, sql-minify |
| unix-timestamp-converter | DP, DPG | covered-by: timestamp-converter, epoch-batch |
| webm-to-mp4 | DP | NOT BUILT: transcoding needs audio/video encoders (MP3, H.264) that browsers do not expose and ffmpeg.wasm is third-party code; audio-converter (to WAV) and video-to-gif cover what the platform allows |
| webm-converter | DP | NOT BUILT: transcoding needs audio/video encoders (MP3, H.264) that browsers do not expose and ffmpeg.wasm is third-party code; audio-converter (to WAV) and video-to-gif cover what the platform allows |
| time-zone-converter | DP | covered-by: timezone-converter, world-clock, timezone-meeting-planner |
| meeting-planner | DP | covered-by: timezone-meeting-planner |
| xml-validator | DP | covered-by: xml-format, xml-validate |
| xml-viewer | DP | covered-by: xml-format, xml-validate |
| xsd-viewer | DP | built-now: xsd-viewer |
| xsd-editor | DP | built-now: xsd-viewer (read-only) |
| yaml-validator | DP, DT | covered-by: yaml-format (re-indents and validates; a minifier is yaml-to-json -> json-minify) |
| yaml-editor | DP | covered-by: yaml-format (re-indents and validates; a minifier is yaml-to-json -> json-minify) |
| yaml-beautifier | DP | covered-by: yaml-format (re-indents and validates; a minifier is yaml-to-json -> json-minify) |
| yaml-minifier | DP | covered-by: yaml-format (re-indents and validates; a minifier is yaml-to-json -> json-minify) |
| yml-to-json | DP | covered-by: yaml-to-json, json-to-yaml |
| wifi-qr-code-generator | DP | covered-by: qr-code-generator (SVG output is transparent; Wi-Fi payload "WIFI:T:WPA;S:name;P:pass;;") |
| blur-image | DP | covered-by: image-redaction (black boxes and pixelation) |
| pixelate-image | DP | covered-by: image-redaction (black boxes and pixelation) |
| censor-image | DP | covered-by: image-redaction (black boxes and pixelation) |
| blur-text-in-image | DP | covered-by: image-redaction (black boxes and pixelation) |
| youtube-thumbnail-downloader | DP | built-now: youtube-link-tools (builds the URLs; the image itself is not fetched) |
| youtube-thumbnail-grabber | DP | built-now: youtube-link-tools |
| text-to-handwriting | DP | NOT BUILT: needs handwriting fonts or a generative model; no licensed font set bundled |
| handwriting-generator | DP | NOT BUILT: needs handwriting fonts or a generative model; no licensed font set bundled |
| json-viewer | DP | covered-by: json-format, json-tree |
| pdf-to-markdown | DP | covered-by: pdf-text-extract-simple (text only; layout-aware conversion not built) |
| pdf-to-md | DP | covered-by: pdf-text-extract-simple (text only; layout-aware conversion not built) |
| pdf-to-markdown-for-claude | DP | covered-by: pdf-text-extract-simple (text only; layout-aware conversion not built) |
| mp4-to-mp3 | DP | NOT BUILT: transcoding needs audio/video encoders (MP3, H.264) that browsers do not expose and ffmpeg.wasm is third-party code; audio-converter (to WAV) and video-to-gif cover what the platform allows |
| mov-to-mp4 | DP | NOT BUILT: transcoding needs audio/video encoders (MP3, H.264) that browsers do not expose and ffmpeg.wasm is third-party code; audio-converter (to WAV) and video-to-gif cover what the platform allows |
| video-to-gif | DP, DT | covered-by: covered-by: video-to-gif (same id) |
| m4a-to-mp3 | DP | NOT BUILT: transcoding needs audio/video encoders (MP3, H.264) that browsers do not expose and ffmpeg.wasm is third-party code; audio-converter (to WAV) and video-to-gif cover what the platform allows |
| mkv-to-mp4 | DP | NOT BUILT: transcoding needs audio/video encoders (MP3, H.264) that browsers do not expose and ffmpeg.wasm is third-party code; audio-converter (to WAV) and video-to-gif cover what the platform allows |
| avi-to-mp4 | DP | NOT BUILT: transcoding needs audio/video encoders (MP3, H.264) that browsers do not expose and ffmpeg.wasm is third-party code; audio-converter (to WAV) and video-to-gif cover what the platform allows |
| gif-to-mp4 | DP | NOT BUILT: transcoding needs audio/video encoders (MP3, H.264) that browsers do not expose and ffmpeg.wasm is third-party code; audio-converter (to WAV) and video-to-gif cover what the platform allows |
| mp3-to-wav | DP | covered-by: audio-converter (decodes any browser-supported audio to WAV; MP3 encoding is not possible with browser APIs) |
| wav-to-mp3 | DP | covered-by: audio-converter (decodes any browser-supported audio to WAV; MP3 encoding is not possible with browser APIs) |
| ogg-to-mp3 | DP | NOT BUILT: transcoding needs audio/video encoders (MP3, H.264) that browsers do not expose and ffmpeg.wasm is third-party code; audio-converter (to WAV) and video-to-gif cover what the platform allows |
| flac-to-mp3 | DP | NOT BUILT: transcoding needs audio/video encoders (MP3, H.264) that browsers do not expose and ffmpeg.wasm is third-party code; audio-converter (to WAV) and video-to-gif cover what the platform allows |
| random-number-generator | DP | covered-by: random-number-picker |
| random-letter-generator | DP | covered-by: random-text-generator (characters mode) |
| yes-or-no-wheel | DP | covered-by: decision-wheel |
| secret-santa-generator | DP | built-now: secret-santa-generator |
| gift-exchange-generator | DP | built-now: secret-santa-generator |
| percentage-calculator | DP, QT, UT | covered-by: covered-by: percentage-calculator (same id) |
| percentage-increase-calculator | DP | covered-by: percentage-calculator, percent-change |
| percentage-decrease-calculator | DP | covered-by: percentage-calculator, percent-change |
| percentage-change-calculator | DP | covered-by: percentage-calculator, percent-change |
| percentage-difference-calculator | DP | covered-by: percentage-calculator, percent-change |
| discount-calculator | DP | covered-by: covered-by: discount-calculator (same id) |
| date-calculator | DP, QT, DT | covered-by: date-difference, add-subtract-dates, stopwatch, countdown-timer |
| days-between-dates | DP | covered-by: date-difference, add-subtract-dates, stopwatch, countdown-timer |
| business-days-calculator | DP, UT | covered-by: business-days |
| age-calculator | DP, QT, UT | covered-by: covered-by: age-calculator (same id) |
| time-calculator | DP | covered-by: time-duration-calculator |
| hours-calculator | DP | built-now: work-hours-calculator |
| time-card-calculator | DP | built-now: work-hours-calculator |
| military-time-converter | DP | built-now: time-format-converter |
| concrete-calculator | DP, DPG | covered-by: covered-by: concrete-calculator (same id) |
| square-footage-calculator | DP | built-now: square-footage-calculator |
| gravel-calculator | DP | built-now: gravel-mulch-calculator |
| mulch-calculator | DP | built-now: gravel-mulch-calculator |
| tile-calculator | DP | covered-by: covered-by: tile-calculator (same id) |
| blur-face | DP | NOT BUILT: face detection needs a vision model; image-redaction lets you box and blur faces by hand |
| face-pixelator | DP | NOT BUILT: face detection needs a vision model; image-redaction lets you box and blur faces by hand |
| censor-face | DP | NOT BUILT: face detection needs a vision model; image-redaction lets you box and blur faces by hand |
| redact-pdf | DP | built-now: pdf-redact |
| pdf-redaction-tool | DP | built-now: pdf-redact |
| black-out-text-in-pdf | DP | built-now: pdf-redact (by position, not by search text) |
| redact-bank-statement | DP | built-now: pdf-redact |
| pdf-metadata-remover | DP | covered-by: pdf-remove-metadata |
| pdf-metadata-editor | DP | covered-by: covered-by: pdf-metadata-editor (same id) |
| pdf-metadata-viewer | DP | covered-by: pdf-info, pdf-metadata-editor |
| remove-metadata-from-word | DP | built-now: docx-cleaner |
| remove-comments-from-word | DP | built-now: docx-cleaner |
| accept-all-changes-in-word | DP | built-now: docx-cleaner |
| mic-test | DP | built-now: mic-test |
| webcam-test | DP | covered-by: webcam-recorder (live preview and recording) |
| keyboard-test | DP | covered-by: keyboard-event-viewer |
| gamepad-tester | DP | covered-by: covered-by: gamepad-tester (same id) |
| stick-drift-test | DP | covered-by: gamepad-tester (live axis values) |
| sound-test | DP | covered-by: tone-generator |
| headphone-test | DP | covered-by: tone-generator, binaural-beat-generator |
| tone-generator | DP | covered-by: covered-by: tone-generator (same id) |
| dead-pixel-test | DP | built-now: display-test |
| refresh-rate-test | DP | built-now: display-test |
| mouse-test | DP | covered-by: mouse-click-speed-test |
| double-click-test | DP | covered-by: mouse-click-speed-test |
| cps-test | DP | covered-by: mouse-click-speed-test |
| morse-code-translator | DP, DT | covered-by: morse-translator, morse-code-audio |
| binary-translator | DP | covered-by: binary-text |
| binary-to-text | DP | covered-by: binary-text |
| text-to-binary | DP | covered-by: binary-text |
| hex-to-ascii | DP | covered-by: hex-text |
| text-to-hex | DP | covered-by: hex-text |
| roman-numeral-converter | DP | covered-by: roman-numerals |
| roman-numeral-date-converter | DP | covered-by: roman-numerals |
| number-base-converter | DP, UT, DPG, DT | covered-by: covered-by: number-base-converter (same id) |
| hex-to-decimal | DP | covered-by: number-base-converter, bitwise-calculator, bignumber-calculator |
| decimal-to-hex | DP | covered-by: number-base-converter, bitwise-calculator, bignumber-calculator |
| binary-to-decimal | DP | covered-by: number-base-converter, bitwise-calculator, bignumber-calculator |
| decimal-to-binary | DP | covered-by: number-base-converter, bitwise-calculator, bignumber-calculator |
| hex-to-binary | DP | covered-by: number-base-converter, bitwise-calculator, bignumber-calculator |
| binary-to-hex | DP | covered-by: number-base-converter, bitwise-calculator, bignumber-calculator |
| binary-calculator | DP | covered-by: number-base-converter, bitwise-calculator, bignumber-calculator |
| hex-calculator | DP | covered-by: number-base-converter, bitwise-calculator, bignumber-calculator |
| 2027-calendar | DP | built-now: printable-calendar |
| 2026-calendar | DP | built-now: printable-calendar |
| printable-calendar | DP | built-now: printable-calendar |
| 2027-holidays | DP | NOT BUILT: holiday dates depend on per-country rules and yearly decrees (maintained data); not built |
| days-until-christmas | DP | covered-by: countdown-to-date, countdown-timer |
| thanksgiving-countdown | DP | covered-by: countdown-to-date, countdown-timer |
| new-year-countdown | DP | covered-by: countdown-to-date, countdown-timer |
| days-until-halloween | DP | covered-by: countdown-to-date, countdown-timer |
| countdown-to-date | DP | covered-by: covered-by: countdown-to-date (same id) |
| barcode-generator | DP, UT, DPG, DT | covered-by: covered-by: barcode-generator (same id) |
| upc-barcode-generator | DP | covered-by: barcode-generator (Code 128, Code 39, EAN-13, UPC-A; ISBN is EAN-13) |
| ean-13-barcode-generator | DP | covered-by: barcode-generator (Code 128, Code 39, EAN-13, UPC-A; ISBN is EAN-13) |
| code-128-barcode-generator | DP | covered-by: barcode-generator (Code 128, Code 39, EAN-13, UPC-A; ISBN is EAN-13) |
| code-39-barcode-generator | DP | covered-by: barcode-generator (Code 128, Code 39, EAN-13, UPC-A; ISBN is EAN-13) |
| data-matrix-generator | DP | built-now: data-matrix-generator |
| pdf417-generator | DP | BUILT NOW (gap3): pdf417-generator |
| isbn-barcode-generator | DP | covered-by: barcode-generator (Code 128, Code 39, EAN-13, UPC-A; ISBN is EAN-13) |
| bulk-barcode-generator | DP | covered-by: barcode-generator (Code 128, Code 39, EAN-13, UPC-A; ISBN is EAN-13) |
| svg-to-png | DP, QT, DPG | covered-by: covered-by: svg-to-png (same id) |
| svg-to-jpg | DP | covered-by: svg-to-png |
| avif-to-jpg | DP | covered-by: image-format-converter (formats the browser can decode and encode: PNG, JPEG, WebP; AVIF/TIFF/BMP input depends on the browser) |
| avif-to-png | DP | covered-by: image-format-converter (formats the browser can decode and encode: PNG, JPEG, WebP; AVIF/TIFF/BMP input depends on the browser) |
| jfif-to-jpg | DP | covered-by: image-format-converter (formats the browser can decode and encode: PNG, JPEG, WebP; AVIF/TIFF/BMP input depends on the browser) |
| gif-to-png | DP | covered-by: image-format-converter (formats the browser can decode and encode: PNG, JPEG, WebP; AVIF/TIFF/BMP input depends on the browser) |
| tiff-to-jpg | DP | covered-by: image-format-converter (formats the browser can decode and encode: PNG, JPEG, WebP; AVIF/TIFF/BMP input depends on the browser) |
| bmp-to-jpg | DP | covered-by: image-format-converter (formats the browser can decode and encode: PNG, JPEG, WebP; AVIF/TIFF/BMP input depends on the browser) |
| webp-to-gif | DP | covered-by: gif-maker (animated WebP input is not decoded by browsers into frames) |
| zalgo-text-generator | DP, UT | covered-by: zalgo-text |
| glitch-text-generator | DP | covered-by: zalgo-text |
| strikethrough-text-generator | DP | covered-by: fancy-text (bold, italic, script, small caps, upside-down, strikethrough and more) |
| upside-down-text-generator | DP | covered-by: fancy-text (bold, italic, script, small caps, upside-down, strikethrough and more) |
| backwards-text-generator | DP | covered-by: reverse-text |
| invisible-character | DP | built-now: invisible-text-generator |
| blank-text-generator | DP | built-now: invisible-text-generator |
| text-repeater | DP | built-now: text-repeater |
| ratio-calculator | DP | covered-by: aspect-ratio-calculator |
| average-calculator | DP | covered-by: average-median-mode |
| margin-calculator | DP | covered-by: markup-margin, profit-margin |
| markup-calculator | DP, DPG | covered-by: markup-margin, profit-margin |
| overtime-calculator | DP | built-now: work-hours-calculator |
| hourly-to-salary-calculator | DP | covered-by: salary-hourly |
| salary-to-hourly-calculator | DP, DPG | covered-by: salary-hourly |
| electricity-cost-calculator | DP | built-now: electricity-cost-calculator |
| water-intake-calculator | DP | covered-by: water-intake |
| one-rep-max-calculator | DP | built-now: one-rep-max-calculator |
| dog-age-calculator | DP | built-now: dog-age-calculator |
| paint-calculator | DP | covered-by: paint-coverage |
| roofing-calculator | DP | built-now: roofing-calculator |
| btu-calculator | DP | built-now: btu-calculator |
| subnet-calculator | DP, DT | covered-by: ip-subnet-calculator, cidr-contains, ip-supernetting-calculator |
| cidr-calculator | DP | covered-by: ip-subnet-calculator, cidr-contains, ip-supernetting-calculator |
| ipv6-subnet-calculator | DP | covered-by: ip-subnet-calculator, cidr-contains, ip-supernetting-calculator |
| vlsm-calculator | DP | built-now: vlsm-calculator |
| subnet-cheat-sheet | DP | built-now: subnet-cheat-sheet |
| html-beautifier | DP, DPG | covered-by: html-format |
| png-to-ico | DP | covered-by: favicon-generator (builds favicon.ico from an image) |
| ico-converter | DP | built-now: ico-to-png (ICO to PNG); covered-by favicon-generator (PNG to ICO) |
| jpg-to-ico | DP | covered-by: favicon-generator (builds favicon.ico from an image) |
| svg-to-ico | DP | covered-by: favicon-generator (builds favicon.ico from an image) |
| webp-to-ico | DP | covered-by: favicon-generator (builds favicon.ico from an image) |
| ico-to-png | DP | built-now: ico-to-png |
| ssl-certificate-decoder | DP | covered-by: x509-viewer; chain checks: x509-chain-analyzer |
| csr-decoder | DP, DT | covered-by: x509-viewer, x509-csr-decoder |
| pem-decoder | DP | built-now: asn1-der-decoder |
| asn1-decoder | DP | built-now: asn1-der-decoder |
| stl-viewer | DP | built-now: 3d-model-viewer |
| 3d-viewer | DP | built-now: 3d-model-viewer (STL/OBJ/PLY) |
| glb-viewer | DP | built-now: 3d-model-viewer |
| gltf-viewer | DP | built-now: 3d-model-viewer |
| obj-viewer | DP | built-now: 3d-model-viewer |
| fbx-viewer | DP | NOT BUILT: FBX is a proprietary binary format with compressed arrays; not built (STL, OBJ, PLY, GLB, glTF and 3MF are supported) |
| ply-viewer | DP | built-now: 3d-model-viewer |
| 3mf-viewer | DP | built-now: 3d-model-viewer |
| csv-viewer | DP | covered-by: covered-by: csv-viewer (same id) |
| xlsx-viewer | DP | covered-by: covered-by: xlsx-viewer (same id) |
| excel-viewer | DP | covered-by: xlsx-viewer, xlsx-to-json |
| parquet-viewer | DP | built-now: parquet-viewer (flat tables; Snappy/gzip/none) |
| xlsx-to-csv | DP | covered-by: xlsx-viewer, xlsx-to-json |
| excel-to-csv | DP | covered-by: xlsx-viewer, xlsx-to-json |
| parquet-to-csv | DP | built-now: parquet-viewer (CSV output) |
| svg-viewer | DP | covered-by: svg-preview-editor |
| svg-to-css | DP | covered-by: covered-by: svg-to-css (same id) |
| svg-to-base64 | DP | covered-by: svg-to-css, base64-encode |
| sqlite-viewer | DP | built-now: sqlite-file-viewer |
| sqlite-browser | DP | built-now: sqlite-file-viewer |
| db-viewer | DP | built-now: sqlite-file-viewer |
| sqlite-online | DP | built-now: sqlite-file-viewer (viewer; no SQL engine) |
| docx-viewer | DP | built-now: docx-to-html |
| word-viewer | DP | built-now: docx-to-html |
| word-to-html | DP | built-now: docx-to-html |
| eml-viewer | DP | built-now: eml-viewer |
| msg-viewer | DP | BUILT NOW (gap3): outlook-msg-viewer |
| eml-to-pdf | DP | covered-by: eml-viewer + text-to-pdf (copy the text) |
| msg-to-pdf | DP | BUILT NOW (gap3): outlook-msg-viewer |
| email-header-analyzer | DP, DT | built-now: email-header-analyzer |
| psd-viewer | DP | BUILT NOW (gap3): psd-layer-viewer |
| psd-to-png | DP | BUILT NOW (gap3): psd-layer-viewer |
| psd-to-jpg | DP | BUILT NOW (gap3): psd-layer-viewer |
| ai-viewer | DP | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-to-png | DP | NOT BUILT: Photoshop / Illustrator formats need large proprietary decoders; not built |
| ai-to-pdf | DP | NOT BUILT: Photoshop / Illustrator formats need large proprietary decoders; not built |
| math-editor | DP | NOT BUILT: needs a TeX/MathML typesetting engine (KaTeX/MathJax class); third-party code is not used and a faithful engine is too large to hand-write |
| equation-editor | DP | NOT BUILT: needs a TeX/MathML typesetting engine (KaTeX/MathJax class); third-party code is not used and a faithful engine is too large to hand-write |
| latex-equation-editor | DP | NOT BUILT: needs a TeX/MathML typesetting engine (KaTeX/MathJax class); third-party code is not used and a faithful engine is too large to hand-write |
| latex-to-image | DP | NOT BUILT: needs a TeX/MathML typesetting engine (KaTeX/MathJax class); third-party code is not used and a faithful engine is too large to hand-write |
| math-keyboard | DP | NOT BUILT: needs a TeX/MathML typesetting engine (KaTeX/MathJax class); third-party code is not used and a faithful engine is too large to hand-write |
| latex-to-word-equation | DP | NOT BUILT: needs a TeX/MathML typesetting engine (KaTeX/MathJax class); third-party code is not used and a faithful engine is too large to hand-write |
| white-elephant-generator | DP | built-now: secret-santa-generator (random draw; steal rules are not modelled) |
| white-elephant-rules | DP | NOT BUILT: seasonal content / list-template pages rather than a computation; scratchpad-notes, bill-tracker and secret-santa-generator cover the practical parts |
| yankee-swap-rules | DP | NOT BUILT: seasonal content / list-template pages rather than a computation; scratchpad-notes, bill-tracker and secret-santa-generator cover the practical parts |
| dirty-santa-rules | DP | NOT BUILT: seasonal content / list-template pages rather than a computation; scratchpad-notes, bill-tracker and secret-santa-generator cover the practical parts |
| grade-calculator | DP | built-now: grade-calculator |
| final-grade-calculator | DP | built-now: grade-calculator |
| weighted-grade-calculator | DP | built-now: grade-calculator |
| test-grade-calculator | DP | built-now: grade-calculator |
| easy-grader | DP | built-now: grade-calculator (weighted grades; no answer-key grader) |
| standard-deviation-calculator | DP | built-now: statistics-calculator |
| variance-calculator | DP | built-now: statistics-calculator |
| sample-standard-deviation-calculator | DP | built-now: statistics-calculator |
| population-standard-deviation-calculator | DP | built-now: statistics-calculator |
| z-score-calculator | DP | built-now: statistics-calculator |
| quartile-calculator | DP | built-now: statistics-calculator |
| mean-absolute-deviation-calculator | DP | built-now: statistics-calculator |
| fraction-calculator | DP, QT | covered-by: covered-by: fraction-calculator (same id) |
| mixed-number-calculator | DP | covered-by: fraction-calculator |
| simplify-fractions-calculator | DP | covered-by: fraction-calculator |
| fraction-to-decimal-calculator | DP | covered-by: fraction-calculator |
| decimal-to-fraction-calculator | DP | covered-by: fraction-calculator |
| common-denominator-calculator | DP | covered-by: fraction-calculator |
| gpa-calculator | DP, QT | covered-by: covered-by: gpa-calculator (same id) |
| college-gpa-calculator | DP | covered-by: gpa-calculator, grade-calculator |
| high-school-gpa-calculator | DP | covered-by: gpa-calculator, grade-calculator |
| cumulative-gpa-calculator | DP | covered-by: gpa-calculator, grade-calculator |
| weighted-gpa-calculator | DP | covered-by: gpa-calculator, grade-calculator |
| middle-school-gpa-calculator | DP | covered-by: gpa-calculator, grade-calculator |
| raise-gpa-calculator | DP | covered-by: gpa-calculator, grade-calculator |
| christmas-list-maker | DP | NOT BUILT: seasonal content / list-template pages rather than a computation; scratchpad-notes, bill-tracker and secret-santa-generator cover the practical parts |
| christmas-wish-list-maker | DP | NOT BUILT: seasonal content / list-template pages rather than a computation; scratchpad-notes, bill-tracker and secret-santa-generator cover the practical parts |
| christmas-list-template | DP | NOT BUILT: seasonal content / list-template pages rather than a computation; scratchpad-notes, bill-tracker and secret-santa-generator cover the practical parts |
| letter-to-santa-template | DP | NOT BUILT: seasonal content / list-template pages rather than a computation; scratchpad-notes, bill-tracker and secret-santa-generator cover the practical parts |
| christmas-gift-tracker | DP | NOT BUILT: seasonal content / list-template pages rather than a computation; scratchpad-notes, bill-tracker and secret-santa-generator cover the practical parts |
| christmas-budget-planner | DP | NOT BUILT: seasonal content / list-template pages rather than a computation; scratchpad-notes, bill-tracker and secret-santa-generator cover the practical parts |
| bracket-generator | DP | built-now: tournament-bracket-generator |
| bracket-maker | DP | built-now: tournament-bracket-generator |
| single-elimination-bracket | DP | built-now: tournament-bracket-generator |
| double-elimination-bracket | DP | built-now: tournament-bracket-generator (single elimination and round robin; double elimination not built) |
| round-robin-generator | DP | built-now: tournament-bracket-generator |
| printable-bracket | DP | built-now: tournament-bracket-generator |
| bingo-card-generator | DP | built-now: bingo-card-generator |
| printable-bingo-cards | DP | built-now: bingo-card-generator |
| custom-bingo-card-maker | DP | built-now: bingo-card-generator |
| blank-bingo-card | DP | built-now: bingo-card-generator |
| bingo-caller | DP | built-now: bingo-card-generator (caller sheet) |
| christmas-bingo | DP | built-now: bingo-card-generator (custom words) |
| thanksgiving-bingo | DP | built-now: bingo-card-generator (custom words) |
| new-years-bingo | DP | built-now: bingo-card-generator (custom words) |
| baby-shower-bingo | DP | built-now: bingo-card-generator (custom words) |
| tip-calculator | QT, DPG | covered-by: covered-by: tip-calculator (same id) |
| calorie-calculator | QT, DPG | covered-by: bmr-tdee |
| body-fat-calculator | QT, DPG | covered-by: body-fat-navy |
| compound-interest-calculator | QT, DPG, DT | covered-by: compound-interest |
| loan-calculator | QT | covered-by: covered-by: loan-calculator (same id) |
| image-to-jpg | QT | covered-by: image-format-converter (formats the browser can decode and encode: PNG, JPEG, WebP; AVIF/TIFF/BMP input depends on the browser) |
| image-cropper | QT, UT, DPG | covered-by: covered-by: image-cropper (same id) |
| image-watermark | QT | covered-by: covered-by: image-watermark (same id) |
| image-to-svg | QT | BUILT NOW (gap3): image-to-svg-tracer |
| png-to-jpg | QT | covered-by: image-format-converter (formats the browser can decode and encode: PNG, JPEG, WebP; AVIF/TIFF/BMP input depends on the browser) |
| jpg-to-png | QT | covered-by: image-format-converter (formats the browser can decode and encode: PNG, JPEG, WebP; AVIF/TIFF/BMP input depends on the browser) |
| webp-to-jpg | QT | covered-by: image-format-converter (formats the browser can decode and encode: PNG, JPEG, WebP; AVIF/TIFF/BMP input depends on the browser) |
| gif-maker | QT | covered-by: covered-by: gif-maker (same id) |
| svg-optimizer | QT, UT, DT | covered-by: covered-by: svg-optimizer (same id) |
| image-collage | QT | covered-by: covered-by: image-collage (same id) |
| pdf-to-jpg | QT | covered-by: pdf-to-image |
| json-escaper | QT | covered-by: json-escape, json-unescape |
| json-schema-generator | QT, TC, UT | covered-by: covered-by: json-schema-generator (same id) |
| json-to-code | QT | covered-by: json-to-typescript, json-to-go, json-to-models, json-to-zod |
| json-to-go | QT, DT | covered-by: covered-by: json-to-go (same id) |
| jsonpath-tester | QT | covered-by: covered-by: jsonpath-tester (same id) |
| jwt-generator | QT | covered-by: jwt-encode, jwt-asymmetric-sign-verify |
| bcrypt-generator | QT, UT, DT | covered-by: covered-by: bcrypt-generator (same id) |
| ascii-unicode-converter | QT | covered-by: char-info, unicode-escape, unicode-character-map, fancy-text |
| unit-converter | QT, UT, DT | covered-by: covered-by: unit-converter (same id) |
| base-converter | QT | covered-by: number-base-converter, bitwise-calculator, bignumber-calculator |
| xml-to-json | QT | covered-by: covered-by: xml-to-json (same id) |
| json-to-xml | QT, UT | covered-by: covered-by: json-to-xml (same id) |
| markdown-to-html | QT, DPG | covered-by: covered-by: markdown-to-html (same id) |
| qrcode-generator | QT | covered-by: qr-code-generator (SVG output is transparent; Wi-Fi payload "WIFI:T:WPA;S:name;P:pass;;") |
| cron-generator | QT | covered-by: covered-by: cron-generator (same id) |
| emoji-picker | QT, DPG | covered-by: covered-by: emoji-picker (same id) |
| random-data-generator | QT | covered-by: mock-data-generator, random-json-generator, fake-person-generator, api-mock-response-generator |
| geohash-tool | QT | built-now: geohash-tool |
| world-clock | QT, DT | covered-by: covered-by: world-clock (same id) |
| ip-address-lookup | QT, DPG, DT | SKIP: needs DNS/WHOIS/IP-geolocation queries (network or databases); dns-record-generator, dns-resolution-simulator and browser-info cover the offline parts |
| dns-lookup | QT, UT, DT | SKIP: needs DNS/WHOIS/IP-geolocation queries (network or databases); dns-record-generator, dns-resolution-simulator and browser-info cover the offline parts |
| text-analyzer | QT | covered-by: word-counter, string-length-bytes, text-statistics |
| duplicate-line-remover | QT | covered-by: dedupe-lines, sort-lines |
| color-picker | QT, DPG | covered-by: color-picker-from-image, color-converter |
| code-diff | QT | covered-by: text-diff, code-diff-html, json-diff, json-patch-generator |
| text-binary-converter | QT | covered-by: binary-text |
| number-to-words | QT | covered-by: covered-by: number-to-words (same id) |
| color-converter | QT, UT, DPG, DT | covered-by: covered-by: color-converter (same id) |
| ai-directory | QT | NOT BUILT: directory/listing pages of links, not tools |
| awesome-prompt-directory | QT | NOT BUILT: directory/listing pages of links, not tools |
| mcp-directory | QT | NOT BUILT: directory/listing pages of links, not tools |
| agent-directory | QT | NOT BUILT: directory/listing pages of links, not tools |
| skill-directory | QT | NOT BUILT: directory/listing pages of links, not tools |
| json-beautifier | TC | covered-by: json-format, json-tree |
| json-path-finder | TC, UT | covered-by: jsonpath-tester |
| ai-code-explainer | UT, DT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-content-detector | UT | SKIP: AI-text detection needs language-model perplexity and is unreliable; building it would mislead users |
| ai-entity-extractor | UT | built-now: entity-extractor |
| ai-fill-mask | UT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-image-captioning | UT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-image-classifier | UT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-image-upscaler | UT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-keyword-extractor | UT | covered-by: keyword-extractor |
| ai-language-detector | UT | covered-by: language-detector |
| ai-object-detection | UT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-ocr | UT | covered-by: ocr-image-to-text |
| ai-paraphraser | UT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-question-answering | UT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-readability-analyzer | UT | covered-by: readability, text-statistics |
| ai-regex-generator | UT, DPG, DT | built-now: regex-generator |
| ai-sentiment-analyzer | UT | covered-by: ai-sentiment-classifier, sentiment-lexicon |
| ai-speech-to-text | UT | SKIP: browser speech recognition sends audio to a vendor service, and local models are large unverified downloads |
| ai-text-classifier | UT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-text-summarizer | UT | built-now: text-summarizer |
| ai-text-to-speech | UT | covered-by: text-to-speech |
| ai-tone-analyzer | UT | built-now: tone-analyzer |
| ai-translator | UT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| annotate-pdf | UT | NOT BUILT: editing annotations / AcroForm fields needs a PDF object editor beyond the page-level tools we have; not built |
| api-request-builder | UT | covered-by: curl-builder, http-snippet-generator (builds the request; sending it needs network) |
| ascii-art-generator | UT | covered-by: ascii-art-text |
| aspect-ratio | UT | covered-by: aspect-ratio-calculator |
| border-radius-generator | UT, DPG, DT | covered-by: covered-by: border-radius-generator (same id) |
| box-shadow | UT | covered-by: box-shadow-generator |
| chmod-calculator | UT, DPG, DT | covered-by: covered-by: chmod-calculator (same id) |
| clip-path-generator | UT | covered-by: covered-by: clip-path-generator (same id) |
| code-playground | UT | covered-by: covered-by: code-playground (same id) |
| color-contrast-checker | UT, DT | covered-by: contrast-checker (WCAG ratio and APCA) |
| color-css | UT | covered-by: color-converter |
| compare-pdf | UT | built-now: pdf-compare |
| css-animation-generator | UT | covered-by: covered-by: css-animation-generator (same id) |
| css-filter-generator | UT, DT | covered-by: covered-by: css-filter-generator (same id) |
| css-flexbox-generator | UT | covered-by: flexbox-generator |
| css-gradient | UT | covered-by: gradient-generator |
| css-grid-generator | UT, DT | covered-by: grid-generator |
| css-loader-generator | UT | covered-by: covered-by: css-loader-generator (same id) |
| css-specificity-calculator | UT | covered-by: covered-by: css-specificity-calculator (same id) |
| css-units-converter | UT | covered-by: css-unit-converter, px-to-rem-converter |
| csv-to-sql-converter | UT | covered-by: csv-to-sql |
| csv-viewer-editor | UT | covered-by: csv-viewer, csv-to-json, sql-on-csv, json-tree |
| curl-to-code | UT | covered-by: covered-by: curl-to-code (same id) |
| currency-converter | UT, DT | SKIP: needs live exchange rates (external data feed) |
| dark-mode-pdf | UT | built-now: pdf-dark-mode |
| docker-compose-builder | UT, DT | covered-by: docker-compose-generator, dockerfile-generator |
| excel-to-pdf | UT | NOT BUILT: faithful Office layout needs a full rendering engine (LibreOffice-class); only simple text/Markdown to PDF exist |
| file-hash-verifier | UT | covered-by: hash-generator, hash-compare, file-hash, checksum-crc32-adler32 |
| gitignore-generator | UT, DT | covered-by: covered-by: gitignore-generator (same id) |
| glassmorphism-generator | UT | covered-by: covered-by: glassmorphism-generator (same id) |
| heic-converter | UT | covered-by: heic-to-jpg, heic-decoder |
| hmac-generator | UT, DT | covered-by: covered-by: hmac-generator (same id) |
| html-entity | UT, DPG | covered-by: html-minify, html-entities, html-entities-reference |
| http-header-analyzer | UT | covered-by: http-headers-analyzer, security-headers-generator |
| http-status-codes | UT, DPG, SC | covered-by: http-status-reference |
| image-base64 | UT | covered-by: image-to-base64, base64-image-viewer, base64-to-pdf |
| image-color-picker | UT | covered-by: color-picker-from-image, color-converter |
| image-format-converter | UT, DPG, DT | covered-by: covered-by: image-format-converter (same id) |
| ip-geolocation | UT | SKIP: needs DNS/WHOIS/IP-geolocation queries (network or databases); dns-record-generator, dns-resolution-simulator and browser-info cover the offline parts |
| ip-subnet-calculator | UT | covered-by: covered-by: ip-subnet-calculator (same id) |
| js-beautifier | UT | covered-by: js-format |
| json-csv | UT | covered-by: json-to-csv |
| json-to-excel | UT | covered-by: json-to-xlsx |
| jwt-builder | UT | covered-by: jwt-encode |
| keyboard-event-viewer | UT | covered-by: covered-by: keyboard-event-viewer (same id) |
| markdown-html | UT | covered-by: markdown-preview, markdown-to-html |
| markdown-table-generator | UT, DPG, DT | covered-by: covered-by: markdown-table-generator (same id) |
| mesh-gradient-generator | UT, DT | covered-by: covered-by: mesh-gradient-generator (same id) |
| mock-data-generator | UT, DT | covered-by: covered-by: mock-data-generator (same id) |
| neumorphism-generator | UT | covered-by: covered-by: neumorphism-generator (same id) |
| note-taking-scratchpad | UT | covered-by: scratchpad-notes |
| og-preview | UT | covered-by: meta-analyzer, og-twitter-generator, social-preview, meta-tag-generator |
| pdf-form-filler | UT | NOT BUILT: editing annotations / AcroForm fields needs a PDF object editor beyond the page-level tools we have; not built |
| pdf-page-organizer | UT | covered-by: pdf-reorder-pages, pdf-delete-pages, pdf-rotate |
| placeholder-image-generator | UT, DPG | covered-by: covered-by: placeholder-image-generator (same id) |
| powerpoint-to-pdf | UT | NOT BUILT: faithful Office layout needs a full rendering engine (LibreOffice-class); only simple text/Markdown to PDF exist |
| protect-pdf | UT | NOT BUILT: PDF password encryption needs object-level RC4/AES with the PDF writer; not built (no verified writer hook yet) |
| redact-image | UT | covered-by: image-redaction (black boxes and pixelation) |
| resize-pdf | UT | NOT BUILT: real PDF optimisation needs image re-encoding inside the PDF object graph; re-rasterising pages would destroy text, so not built |
| responsive-previewer | UT | covered-by: responsive-breakpoint-previewer |
| resume-builder | UT | covered-by: covered-by: resume-builder (same id) |
| robots-generator | UT | covered-by: covered-by: robots-generator (same id) |
| rsa-key-generator | UT | covered-by: rsa-key-pair-generator |
| signature-generator | UT | covered-by: covered-by: signature-generator (same id) |
| spin-the-wheel | UT | covered-by: decision-wheel |
| ssl-certificate-checker | UT, DT | SKIP: needs a live TLS handshake with a server; x509-viewer and x509-chain-analyzer inspect certificates you paste |
| stopwatch-countdown | UT | covered-by: stopwatch, countdown-timer |
| string-escape | UT, DT | covered-by: covered-by: string-escape (same id) |
| svg-path-editor | UT, DPG | covered-by: covered-by: svg-path-editor (same id) |
| svg-pattern-generator | UT | covered-by: covered-by: svg-pattern-generator (same id) |
| svg-to-react | UT | covered-by: svg-to-jsx |
| tailwind-converter | UT | covered-by: covered-by: tailwind-converter (same id) |
| test-card-number-generator | UT | covered-by: mock-credit-card-generator |
| text-counter | UT | covered-by: word-counter, string-length-bytes, text-statistics |
| text-shadow-generator | UT | covered-by: covered-by: text-shadow-generator (same id) |
| totp-generator | UT, DT | covered-by: covered-by: totp-generator (same id) |
| typing-speed-test | UT, DT | covered-by: covered-by: typing-speed-test (same id) |
| unzip-files | UT | covered-by: zip-extractor, zip-inspector |
| url-parser | UT, DT | covered-by: covered-by: url-parser (same id) |
| webhook-tester | UT, DT | SKIP: sends or receives live HTTP requests (needs a server or cross-origin access); curl-builder and the converters build the request without sending it |
| white-noise-generator | UT | covered-by: covered-by: white-noise-generator (same id) |
| word-to-pdf | UT | NOT BUILT: faithful Office layout needs a full rendering engine (LibreOffice-class); only simple text/Markdown to PDF exist |
| yaml-json | UT | covered-by: yaml-to-json, json-to-yaml |
| abn-lookup | DPG | SKIP: looks up the Australian Business Register (external API) |
| ai-blog-title-generator | DPG | built-now: headline-generator |
| ai-color-palette-generator | DPG | covered-by: palette-generator, tailwind-v4-color-palette, color-mixer |
| ai-commit-message-generator | DPG, DT | built-now: commit-message-suggester |
| ai-email-writer | DPG | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-linkedin-post-generator | DPG | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-meeting-summary-template | DPG | NOT BUILT: content/template pages (advice text), not a computation |
| ai-meta-description-generator | DPG | built-now: meta-description-suggester |
| ai-paragraph-rewriter | DPG | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-privacy-policy-generator | DPG | covered-by: privacy-policy-generator, cookie-policy-generator, terms-generator |
| ai-product-description-generator | DPG | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-prompt-generator | DPG | covered-by: prompt-template-filler, prompt-linter |
| ai-resume-bullet-points | DPG | SKIP: needs an LLM; resume-builder covers layout |
| aspect-ratio-calculator | DPG, DT | covered-by: covered-by: aspect-ratio-calculator (same id) |
| bas-calculator | DPG | SKIP: needs yearly tax rates and rules published by a tax authority (maintained data that changes every year) |
| brick-calculator | DPG | covered-by: covered-by: brick-calculator (same id) |
| business-name-generator | DPG | covered-by: app-name-ideas |
| character-map | DPG | covered-by: unicode-character-map |
| color-picker-from-image | DPG | covered-by: covered-by: color-picker-from-image (same id) |
| cron-builder | DPG | covered-by: cron-generator, natural-language-to-cron |
| crypto-tax-calculator-au | DPG | SKIP: needs yearly tax rates and rules published by a tax authority (maintained data that changes every year) |
| css-glassmorphism-generator | DPG | covered-by: glassmorphism-generator |
| css-gradient-generator | DPG, DT | covered-by: gradient-generator |
| due-date-calculator | DPG | covered-by: covered-by: due-date-calculator (same id) |
| electrical-cable-size-calculator | DPG | NOT BUILT: safety-critical wiring sizes must come from the licensed electrical code tables of the user's country; deliberately not built |
| http-headers-analyzer | DPG | covered-by: covered-by: http-headers-analyzer (same id) |
| javascript-minifier | DPG | covered-by: js-minify |
| json-path-tester | DPG | covered-by: jsonpath-tester |
| json-schema-validator | DPG, DT | covered-by: covered-by: json-schema-validator (same id) |
| json-tree-viewer | DPG | covered-by: json-tree |
| markdown-to-html-converter | DPG, DT | covered-by: markdown-preview, markdown-to-html |
| og-generator | DPG | covered-by: meta-analyzer, og-twitter-generator, social-preview, meta-tag-generator |
| og-meta-tag-generator | DPG | covered-by: meta-analyzer, og-twitter-generator, social-preview, meta-tag-generator |
| paint-coverage-calculator | DPG | covered-by: paint-coverage |
| password-strength-checker | DPG, DT | covered-by: password-strength |
| roof-pitch-calculator | DPG | covered-by: roof-pitch |
| sole-trader-tax-estimator | DPG | SKIP: needs yearly tax rates and rules published by a tax authority (maintained data that changes every year) |
| svg-to-png-converter | DPG, DT | covered-by: svg-to-png |
| tailwind-css-converter | DPG | covered-by: tailwind-converter, tailwind-to-inline-css, shadcn-theme-generator |
| text-diff-compare | DPG | covered-by: text-diff, code-diff-html, json-diff, json-patch-generator |
| toml-formatter | DPG | covered-by: covered-by: toml-formatter (same id) |
| url-encode-decode | DPG | covered-by: url-encode, url-decode |
| wfh-deduction-calculator | DPG | SKIP: needs yearly tax rates and rules published by a tax authority (maintained data that changes every year) |
| aes-encryption | DT | covered-by: aes-encrypt, aes-decrypt (text and files) |
| basic-auth-generator | DT | covered-by: http-basic-auth-generator |
| bip39-mnemonic-generator | DT | covered-by: bip39-generator |
| burn-note-generator | DT | SKIP: burn-after-reading needs server-side one-time storage; aes-encrypt and openpgp-symmetric-encrypt cover local encryption |
| checksum-calculator | DT | covered-by: hash-generator, hash-compare, file-hash, checksum-crc32-adler32 |
| cors-policy-builder | DT | built-now: cors-policy-builder |
| cors-validator | DT | covered-by: cors-preflight-inspector |
| credit-card-validator | DT | covered-by: luhn-validator |
| csp-builder | DT | covered-by: covered-by: csp-builder (same id) |
| email-validator | DT | built-now: email-validator |
| exif-metadata-stripper | DT | covered-by: exif-remover |
| file-encryptor-aes | DT | covered-by: aes-encrypt, aes-decrypt (text and files) |
| gpg-symmetric-encryption | DT | built-now: openpgp-symmetric-encrypt |
| hash-comparison | DT | covered-by: hash-generator, hash-compare, file-hash, checksum-crc32-adler32 |
| http-security-header-checker | DT | covered-by: http-headers-analyzer, security-headers-generator |
| js-obfuscator | DT | NOT BUILT: safe identifier renaming and control-flow changes need a full JavaScript parser; text-obfuscator covers HTML/email obfuscation |
| jwt-signer | DT | built-now: jwt-asymmetric-sign-verify |
| jwt-validator | DT | built-now: jwt-asymmetric-sign-verify (RS/PS/ES; HS256 covered by jwt-verify-hs) |
| password-breach-checker | DT | built-now: pwned-password-range-matcher (the user opens the range URL; the page itself sends nothing) |
| pem-certificate-inspector | DT | covered-by: x509-viewer, x509-csr-decoder |
| pki-key-pair-generator | DT | covered-by: rsa-key-pair-generator, ed25519-key-generator; ssh-key-pair-generator |
| security-headers-checker | DT | covered-by: http-headers-analyzer, security-headers-generator |
| security-txt-generator | DT | built-now: security-txt-generator |
| sql-injection-detector | DT | built-now: sql-injection-pattern-scanner |
| ssh-key-pair-generator | DT | built-now: ssh-key-pair-generator |
| ssl-chain-analyzer | DT | built-now: x509-chain-analyzer |
| text-encryptor | DT | covered-by: aes-encrypt, aes-decrypt (text and files) |
| tls-handshake-simulator | DT | covered-by: ssl-tls-handshake-simulator |
| token-generator | DT | covered-by: random-secret-generator, api-key-generator |
| birthday-paradox-hasher | DT | built-now: birthday-collision-calculator |
| ai-type-inferencer | DT | covered-by: json-to-typescript, json-to-typescript-type-guards, avro-to-json-schema |
| bson-hex-converter | DT | built-now: bson-hex-converter |
| finetune-jsonl-validator | DT | covered-by: json-lines-tools, jsonl-dataset-validator |
| geojson-topojson-converter | DT | covered-by: geojson-to-csv, csv-to-geojson (TopoJSON is not decoded) |
| json-schema-builder | DT | covered-by: json-schema-generator |
| json-schema-to-typescript | DT | built-now: json-schema-to-typescript |
| json-to-protobuf-converter | DT | built-now: json-to-protobuf |
| json5-validator | DT | built-now: json5-converter |
| jsonl-converter | DT | covered-by: json-lines-tools, jsonl-dataset-validator |
| jsonpath-evaluator | DT | covered-by: jsonpath-tester |
| lottie-json-tweaker | DT | NOT BUILT: editing Lottie animations (speed, colours, layers) needs a Lottie model; not built |
| plist-json-xml-converter | DT | built-now: plist-converter |
| toml-to-json-converter | DT | covered-by: toml-to-json, toml-formatter |
| xml-to-json-converter | DT | covered-by: xml-to-json |
| github-actions-yaml-generator | DT | covered-by: github-actions-generator |
| sitemap-xml-generator | DT | covered-by: sitemap-generator, sitemap-validator, sitemap-url-extractor |
| toml-validator | DT | covered-by: toml-to-json, toml-formatter |
| yaml-to-toml | DT | built-now: yaml-to-toml |
| memory-match | DT | covered-by: covered-by: memory-match (same id) |
| minesweeper | DT | covered-by: covered-by: minesweeper (same id) |
| snake | DT | NOT BUILT: arcade games are not tools; game-2048, memory-match and minesweeper exist |
| tetris | DT | NOT BUILT: arcade games are not tools; game-2048, memory-match and minesweeper exist |
| regexp-tester | DT | covered-by: regex-tester, regex-to-code |
| algorithm-arena-visualizer | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| ansible-playbook-generator | DT | covered-by: covered-by: ansible-playbook-generator (same id) |
| apache-config-generator | DT | built-now: apache-vhost-generator |
| arrow-ipc-stream-viewer | DT | BUILT NOW (gap3): arrow-ipc-viewer |
| ascii-figlet-banner-designer | DT | covered-by: ascii-art-text |
| asn1-der-decoder | DT | built-now: asn1-der-decoder |
| audio-waveform-to-svg | DT | built-now: audio-waveform-svg |
| avro-schema-typescript | DT | covered-by: avro-to-json-schema, json-schema-to-typescript |
| aws-architecture-diagram | DT | NOT BUILT: cloud architecture diagram editors need vendor icon sets (licensed) and a canvas editor; mermaid-lite-renderer and graphviz-dot-lite draw text-defined diagrams |
| aws-iam-least-privilege | DT | covered-by: aws-iam-policy-builder, aws-iam-policy-linter |
| aws-pricing-calculator | DT | SKIP: needs maintained external data (price lists, tariff codes, benchmark results, visa rules, per-country tax ID checks); existing offline validators cover the format-only part (vat-number-format-validator, luhn-validator, iban-validator) |
| azure-architecture-diagram | DT | NOT BUILT: cloud architecture diagram editors need vendor icon sets (licensed) and a canvas editor; mermaid-lite-renderer and graphviz-dot-lite draw text-defined diagrams |
| azure-arm-template-generator | DT | NOT BUILT: niche or end-of-life platform formats; not built (cloudformation-template-generator, circleci-config-generator and kubernetes generators exist) |
| backtracking-solver-lab | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| bash-posix-portability-checker | DT | built-now: bash-posix-portability-checker |
| batch-regex-replace-simulator | DT | covered-by: find-replace |
| big-o-complexity-comparator | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| bitwise-ieee754-explorer | DT | covered-by: ieee754-converter, bitwise-calculator |
| bloom-cuckoo-filter-simulator | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| browser-compatibility-checker | DT | covered-by: browser-info |
| btree-index-visualizer | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| caddyfile-builder | DT | covered-by: caddyfile-generator |
| cellular-automata-studio | DT | built-now: cellular-automaton-generator (1D rules; 2D Life not built) |
| chmod-symbolic-octal-matrix | DT | covered-by: chmod-calculator |
| circleci-config-generator | DT | built-now: circleci-config-generator |
| cloud-init-generator | DT | built-now: cloud-init-generator |
| cloudformation-template-generator | DT | built-now: cloudformation-template-generator |
| code-diff-patch-generator | DT | covered-by: text-diff, code-diff-html, json-diff, json-patch-generator |
| convex-hull-visualizer | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| css-grid-named-areas-builder | DT | covered-by: css-grid-area-builder |
| css-js-minifier | DT | covered-by: css-minify, js-minify |
| css-scroll-driven-animations | DT | built-now: css-scroll-driven-animation-generator |
| css-view-transitions-builder | DT | built-now: css-view-transition-generator |
| csv-type-inference-profiler | DT | built-now: csv-column-profiler |
| db-connection-string-builder | DT | covered-by: postgres-connection-builder |
| design-tokens-to-code | DT | built-now: design-tokens-converter |
| distributed-systems-simulator | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| docker-run-to-compose-converter | DT | covered-by: docker-run-to-compose |
| dockerfile-builder | DT | covered-by: dockerfile-generator, dockerfile-linter |
| dockerfile-layer-optimizer | DT | covered-by: dockerfile-generator, dockerfile-linter |
| duckdb-wasm-playground | DT | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| env-encoder | DT | covered-by: env-toolkit, env-linter |
| env-secret-leak-linter | DT | covered-by: secret-detector-redactor, env-linter |
| exif-gps-map-reverser | DT | covered-by: exif-viewer (shows GPS coordinates; the map tiles would need a network request) |
| fft-fourier-decomposition | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| fluid-particle-sandbox | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| font-subsetter-glyph-stripper | DT | BUILT NOW (gap3): font-subsetter |
| fsm-turing-simulator | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| function-calling-schema-generator | DT | covered-by: llm-tool-definition-builder |
| gcp-architecture-diagram | DT | NOT BUILT: cloud architecture diagram editors need vendor icon sets (licensed) and a canvas editor; mermaid-lite-renderer and graphviz-dot-lite draw text-defined diagrams |
| geotiff-boundary-extractor | DT | BUILT NOW (gap3): geotiff-viewer |
| git-commit-builder | DT | covered-by: conventional-commit-generator |
| github-actions-matrix-calculator | DT | covered-by: github-actions-matrix-builder |
| gitlab-ci-generator | DT | covered-by: covered-by: gitlab-ci-generator (same id) |
| glsl-shader-playground | DT | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| gpio-pinout-interactive | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| grafana-panel-generator | DT | built-now: grafana-panel-generator |
| hallucination-entropy-analyzer | DT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| helm-chart-generator | DT | covered-by: helm-chart-scaffolder |
| helm-values-diff-merge | DT | covered-by: helm-values-evaluator, json-diff |
| htaccess-generator | DT | covered-by: covered-by: htaccess-generator (same id) |
| html-table-generator | DT | covered-by: html-table-converter, csv-to-markdown-table, csv-to-html-table |
| huffman-shannon-tree | DT | built-now: huffman-coding-calculator |
| hyperlink-generator | DT | built-now: html-link-generator |
| iam-policy-generator | DT | covered-by: aws-iam-policy-builder, aws-iam-policy-linter |
| javascript-ast-visualizer | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| jenkins-pipeline-builder | DT | built-now: jenkinsfile-generator |
| k8s-ingress-route-visualizer | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| karnaugh-map-solver | DT | built-now: boolean-minimizer |
| kubernetes-manifest-generator | DT | covered-by: kubernetes-deployment-generator, kubernetes-ingress-generator, kubernetes-configmap-secret-builder |
| kubernetes-resource-calculator | DT | covered-by: k8s-resource-calculator |
| license-compatibility-matrix | DT | NOT BUILT: licence compatibility is legal advice that needs an authoritative maintained table; package-json-license-checker lists licences |
| lighthouse-audit-summary | DT | built-now: core-web-vitals-grader |
| linux-sysctl-tuner | DT | NOT BUILT: opinionated kernel tuning advice depends on workload; not built |
| logic-gate-circuit-simulator | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| lorem-generator | DT | covered-by: lorem-ipsum |
| markdown-artifacts-previewer | DT | covered-by: markdown-preview, markdown-to-html |
| mime-detector | DT | built-now: file-type-detector |
| monorepo-dep-graph-viewer | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| mp4-moov-atom-inspector | DT | built-now: mp4-box-inspector |
| msgpack-cbor-inspector | DT | covered-by: msgpack-cbor-decoder |
| multi-language-code-editor | DT | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| multiple-url-opener | DT | NOT BUILT: opening many tabs is blocked by popup blockers; sitemap-url-extractor lists URLs |
| nginx-config-builder | DT | covered-by: nginx-config-generator, nginx-rate-limit-calculator |
| nginx-reverse-proxy-wizard | DT | covered-by: nginx-config-generator, nginx-rate-limit-calculator |
| nomad-to-k8s-converter | DT | NOT BUILT: niche or end-of-life platform formats; not built (cloudformation-template-generator, circleci-config-generator and kubernetes generators exist) |
| offline-secret-leak-scanner | DT | covered-by: secret-detector-redactor, env-linter |
| openapi-swagger-editor | DT | built-now: openapi-viewer |
| opentelemetry-collector-builder | DT | built-now: otel-collector-config-generator |
| parquet-file-viewer | DT | built-now: parquet-viewer |
| programmer-calculator | DT | covered-by: number-base-converter, bitwise-calculator, bignumber-calculator |
| prometheus-alert-rule-builder | DT | covered-by: prometheus-alert-generator |
| prompt-injection-sandbox | DT | built-now: prompt-injection-scanner |
| promql-builder-validator | DT | built-now: promql-query-builder (builder; no PromQL parser) |
| promql-query-builder | DT | built-now: promql-query-builder |
| protobuf-ast-explorer | DT | covered-by: protobuf-formatter, protobuf-to-json |
| redis-cli-simulator | DT | NOT BUILT: a Redis emulator or RDB memory model needs a large behavioural model; redis-command-generator and redis-lua-script-generator exist |
| redis-rdb-memory-estimator | DT | NOT BUILT: a Redis emulator or RDB memory model needs a large behavioural model; redis-command-generator and redis-lua-script-generator exist |
| regex-railroad-dfa-stepper | DT | NOT BUILT: railroad diagrams / DFA stepping are diagram renderers; regex-explainer gives a textual breakdown |
| regex-to-code | DT | built-now: regex-to-code |
| rss-feed-validator | DT | built-now: rss-feed-validator |
| s3-bucket-policy-generator | DT | built-now: s3-bucket-policy-generator |
| scientific-calculator | DT | covered-by: scientific-expression-calculator |
| semver-calculator | DT | covered-by: covered-by: semver-calculator (same id) |
| semver-range-intersection | DT | built-now: semver-range-intersection |
| service-worker-generator | DT | built-now: service-worker-generator |
| social-media-card-simulator | DT | covered-by: meta-analyzer, og-twitter-generator, social-preview, meta-tag-generator |
| sqlite-wasm-studio | DT | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| svg-displacement-filter-lab | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| svg-path-morpher | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| synthetic-data-faker | DT | covered-by: mock-data-generator, random-json-generator, fake-person-generator, api-mock-response-generator |
| systemd-service-builder | DT | covered-by: systemd-unit-generator, systemd-timer-generator |
| tailwind-to-css-variables | DT | covered-by: tailwind-converter, tailwind-to-inline-css, shadcn-theme-generator |
| terraform-dag-diagrammer | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| terraform-hcl-visualizer | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| traefik-router-generator | DT | built-now: traefik-router-generator |
| travis-ci-config-generator | DT | NOT BUILT: niche or end-of-life platform formats; not built (cloudformation-template-generator, circleci-config-generator and kubernetes generators exist) |
| tsv-matrix-transposer | DT | built-now: csv-transpose |
| uart-baud-rate-calculator | DT | built-now: uart-baud-calculator |
| unix-pipe-builder | DT | built-now: shell-command-builder (common recipes) |
| vector-similarity-calculator | DT | covered-by: embedding-similarity |
| web-vitals-budget-simulator | DT | built-now: core-web-vitals-grader (with app-performance-budget-calculator) |
| web-vitals-calculator | DT | built-now: core-web-vitals-grader |
| wireguard-config-generator | DT | built-now: wireguard-config-generator |
| address-generator | DT | covered-by: fake-person-generator |
| ai-documentation-generator | DT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-mermaid-diagram-generator | DT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-sdk-generator | DT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-sql-query-generator | DT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-unit-test-generator | DT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ambient-noise-generator | DT | covered-by: white-noise-generator |
| ascii-text-art | DT | covered-by: ascii-art-text |
| bic-swift-generator | DT | built-now: test-identifier-generator |
| color-generator | DT | covered-by: color-converter |
| color-shades-generator | DT | covered-by: palette-generator, tailwind-v4-color-palette, color-mixer |
| credit-card-generator | DT | covered-by: mock-credit-card-generator |
| crypto-address-generator | DT | NOT BUILT: random valid-format wallet addresses add little over bech32-codec, eip55-checksum-address and bip39-generator; not built |
| css-spring-physics-generator | DT | built-now: css-spring-easing-generator |
| cubic-bezier-generator | DT | covered-by: css-cubic-bezier |
| db-migration-script-generator | DT | built-now: sql-migration-generator |
| drivers-license-generator | DT | NOT BUILT: generating tax IDs, national ID or licence numbers risks producing numbers that belong to real people; test-identifier-generator covers identifiers with public check-digit schemes only |
| dummy-avatar-generator | DT | built-now: avatar-generator |
| duns-number-generator | DT | built-now: test-identifier-generator |
| ean13-upc-generator | DT | covered-by: barcode-generator (EAN-13, UPC-A) ; test-identifier-generator |
| ein-generator | DT | NOT BUILT: generating tax IDs, national ID or licence numbers risks producing numbers that belong to real people; test-identifier-generator covers identifiers with public check-digit schemes only |
| email-signature-generator | DT | built-now: email-signature-generator |
| er-diagram-generator | DT | covered-by: sql-ddl-to-diagram |
| favicon-pack-generator | DT | covered-by: favicon-generator |
| gst-number-generator | DT | built-now: test-identifier-generator (GSTIN) |
| hs-code-generator | DT | SKIP: needs maintained external data (price lists, tariff codes, benchmark results, visa rules, per-country tax ID checks); existing offline validators cover the format-only part (vat-number-format-validator, luhn-validator, iban-validator) |
| iban-generator | DT | built-now: test-identifier-generator |
| imei-generator | DT | built-now: test-identifier-generator |
| isin-generator | DT | built-now: test-identifier-generator |
| lei-generator | DT | built-now: test-identifier-generator |
| license-generator | DT | covered-by: covered-by: license-generator (same id) |
| mac-address-generator | DT | covered-by: covered-by: mac-address-generator (same id) |
| national-identity-generator | DT | NOT BUILT: generating tax IDs, national ID or licence numbers risks producing numbers that belong to real people; test-identifier-generator covers identifiers with public check-digit schemes only |
| needle-in-haystack-generator | DT | built-now: needle-in-haystack-generator |
| perlin-simplex-terrain | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| phone-number-generator | DT, SC | built-now: test-identifier-generator (fictional 555-01xx numbers) ; covered-by fake-person-generator |
| pwa-manifest-generator | DT | built-now: pwa-manifest-generator |
| random-palette-generator | DT | covered-by: palette-generator, tailwind-v4-color-palette, color-mixer |
| routing-number-generator | DT | built-now: test-identifier-generator |
| rss-feed-generator | DT | built-now: rss-feed-generator |
| shadcn-theme-generator | DT | covered-by: covered-by: shadcn-theme-generator (same id) |
| structured-data-generator | DT | covered-by: schema-generator |
| tax-number-generator | DT | NOT BUILT: generating tax IDs, national ID or licence numbers risks producing numbers that belong to real people; test-identifier-generator covers identifiers with public check-digit schemes only |
| tin-generator | DT | NOT BUILT: generating tax IDs, national ID or licence numbers risks producing numbers that belong to real people; test-identifier-generator covers identifiers with public check-digit schemes only |
| tracking-number-generator | DT | built-now: test-identifier-generator (UPS 1Z and UPU S10) |
| ulid-nanoid-generator | DT | covered-by: ulid-generator, nanoid-generator |
| vat-number-generator | DT | NOT BUILT: generating tax IDs, national ID or licence numbers risks producing numbers that belong to real people; test-identifier-generator covers identifiers with public check-digit schemes only |
| vin-generator | DT | built-now: test-identifier-generator |
| web-audio-synth-studio | DT | NOT BUILT: a full synthesiser UI is out of scope; tone-generator and binaural-beat-generator cover oscillators |
| api-mock-server | DT | SKIP: sends or receives live HTTP requests (needs a server or cross-origin access); curl-builder and the converters build the request without sending it |
| bandwidth-calculator | DT | covered-by: bandwidth-download-time |
| broken-link-checker | DT | SKIP: must fetch other websites or render pages on a server (CORS blocks it in a web page); a browser extension could supply the content to the existing audit tools |
| curl-to-code-converter | DT | covered-by: curl-to-code, curl-to-more-languages |
| dns-propagation | DT | SKIP: needs DNS/WHOIS/IP-geolocation queries (network or databases); dns-record-generator, dns-resolution-simulator and browser-info cover the offline parts |
| http-header-builder | DT | SKIP: sends or receives live HTTP requests (needs a server or cross-origin access); curl-builder and the converters build the request without sending it |
| http-header-parser | DT | covered-by: http-headers-to-json |
| http-request-builder | DT | SKIP: sends or receives live HTTP requests (needs a server or cross-origin access); curl-builder and the converters build the request without sending it |
| ip-intel | DT | SKIP: needs DNS/WHOIS/IP-geolocation queries (network or databases); dns-record-generator, dns-resolution-simulator and browser-info cover the offline parts |
| ipv6-expander | DT | covered-by: ip-validator-converter |
| mx-lookup | DT | SKIP: needs DNS/WHOIS/IP-geolocation queries (network or databases); dns-record-generator, dns-resolution-simulator and browser-info cover the offline parts |
| network-info | DT | SKIP: needs DNS/WHOIS/IP-geolocation queries (network or databases); dns-record-generator, dns-resolution-simulator and browser-info cover the offline parts |
| ns-lookup | DT | SKIP: needs DNS/WHOIS/IP-geolocation queries (network or databases); dns-record-generator, dns-resolution-simulator and browser-info cover the offline parts |
| open-graph-debugger | DT | covered-by: meta-analyzer, og-twitter-generator, social-preview, meta-tag-generator |
| port-reference | DT | covered-by: covered-by: port-reference (same id) |
| port-scanner-guide | DT | SKIP: depends on third-party anti-bot vendors, proxy lists or probing remote hosts |
| postman-collection-builder | DT | covered-by: curl-to-postman, postman-to-openapi |
| reverse-dns-lookup | DT | SKIP: needs DNS/WHOIS/IP-geolocation queries (network or databases); dns-record-generator, dns-resolution-simulator and browser-info cover the offline parts |
| ssl-inspector | DT | SKIP: needs a live TLS handshake with a server; x509-viewer and x509-chain-analyzer inspect certificates you paste |
| subdomain-explorer | DT | SKIP: needs DNS/WHOIS/IP-geolocation queries (network or databases); dns-record-generator, dns-resolution-simulator and browser-info cover the offline parts |
| txt-lookup | DT | SKIP: needs DNS/WHOIS/IP-geolocation queries (network or databases); dns-record-generator, dns-resolution-simulator and browser-info cover the offline parts |
| url-redirect-chain-checker | DT | built-now: redirect-chain-analyzer |
| user-agent-parser | DT | covered-by: covered-by: user-agent-parser (same id) |
| websocket-frame-parser | DT | built-now: websocket-frame-parser |
| whois-lookup | DT | SKIP: needs DNS/WHOIS/IP-geolocation queries (network or databases); dns-record-generator, dns-resolution-simulator and browser-info cover the offline parts |
| ai-token-boundary-colorizer | DT | covered-by: tokenizer-visualizer-hf |
| color-blindness-simulator | DT | covered-by: covered-by: color-blindness-simulator (same id) |
| color-extractor | DT | covered-by: color-picker-from-image, color-converter |
| color-mixer | DT | covered-by: covered-by: color-mixer (same id) |
| color-names | DT | covered-by: color-names-lookup |
| oklch-color-converter | DT | covered-by: color-converter |
| resistor-smd-calculator | DT | built-now: resistor-color-code-calculator |
| apca-contrast-calculator | DT | covered-by: contrast-checker (WCAG ratio and APCA) |
| css-container-queries-lab | DT | built-now: css-container-query-generator |
| image-to-ascii | DT | covered-by: covered-by: image-to-ascii (same id) |
| image-to-text-ocr | DT | covered-by: ocr-image-to-text |
| image-watermarker | DT | covered-by: image-watermark |
| markdown-previewer | DT | covered-by: markdown-preview, markdown-to-html |
| natal-chart | DT | NOT BUILT: astrology/astronomy/pseudo-science tools: ephemeris maths would need an astronomy library and oracle, and the astrology outputs have no evidence base; not built |
| pdf-signer | DT | covered-by: signature-generator + images-to-pdf (no in-place PDF stamping) |
| pdf-to-image | DT | covered-by: covered-by: pdf-to-image (same id) |
| pdf-tools | DT | covered-by: PDF category: pdf-info, pdf-merge, pdf-split, pdf-rotate, images-to-pdf, pdf-to-image and others |
| qr-code-reader | DT | built-now: qr-code-reader |
| responsive-tester | DT | covered-by: responsive-breakpoint-previewer |
| sidereal-tropical-converter | DT | NOT BUILT: astrology/astronomy/pseudo-science tools: ephemeris maths would need an astronomy library and oracle, and the astrology outputs have no evidence base; not built |
| svg-previewer | DT | covered-by: svg-preview-editor |
| world-map | DT | covered-by: world-clock (the map itself is not built) |
| agent-tool-flowchart-builder | DT | covered-by: llm-tool-definition-builder |
| ai-agent-memory-simulator | DT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-code-security-auditor | DT | built-now: code-security-scanner (rule based) |
| ai-code-translator | DT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-db-schema-architect | DT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-design-pattern-refactor | DT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-e2e-test-builder | DT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| ai-shell-command-builder | DT | built-now: shell-command-builder (recipes, not AI) |
| ai-vision-ui-to-code | DT | SKIP: needs a neural model (weights of tens to hundreds of MB plus a hand-written inference runtime) or a hosted LLM; no model with a verifiable hash/licence and a small runtime was available, so no in-browser version was built (rule-based alternatives exist where listed elsewhere) |
| anagram-palindrome-analyzer | DT | covered-by: anagram-checker, palindrome-checker |
| audio-bpm-tap-detector | DT | covered-by: audio-bpm-tap |
| audio-db-level-converter | DT | covered-by: audio-db-converter |
| audio-trimmer | DT | covered-by: covered-by: audio-trimmer (same id) |
| audio-voice-recorder | DT | built-now: audio-recorder |
| bill-tracker | DT | covered-by: covered-by: bill-tracker (same id) |
| binary-text-translator | DT | covered-by: binary-text |
| binaural-noise-synthesizer | DT | built-now: binaural-beat-generator |
| biorhythm-calculator | DT | NOT BUILT: astrology/astronomy/pseudo-science tools: ephemeris maths would need an astronomy library and oracle, and the astrology outputs have no evidence base; not built |
| bmi-tdee-calculator | DT | covered-by: bmi-calculator, bmr-tdee |
| bmr-tdee-calculator | DT | covered-by: bmr-tdee |
| bubble-level | DT | covered-by: covered-by: bubble-level (same id) |
| canvas-webm-recorder | DT | NOT BUILT: recording an arbitrary canvas needs a host page that owns the canvas; screen-recorder covers capture |
| character-frequency | DT | covered-by: covered-by: character-frequency (same id) |
| clothing-shoe-size-converter | DT | covered-by: clothing-shoe-size-chart |
| context-assembler | DT | covered-by: llm-context-window-shrinker |
| creator-tax-form-guide | DT | NOT BUILT: content/template pages (advice text), not a computation |
| csharp-to-vbnet-converter | DT | NOT BUILT: language translation needs full parsers and semantics per language pair; not built |
| csv-data-viewer | DT | covered-by: csv-viewer, csv-to-json, sql-on-csv, json-tree |
| csv-to-chart | DT | built-now: csv-to-chart |
| csv-to-markdown-converter | DT | covered-by: html-table-converter, csv-to-markdown-table, csv-to-html-table |
| csv-to-sql | DT | covered-by: covered-by: csv-to-sql (same id) |
| dart-playground | DT | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| decibel-meter | DT | covered-by: covered-by: decibel-meter (same id) |
| decision-wheel | DT | covered-by: covered-by: decision-wheel (same id) |
| dice-roller-coin-flip | DT | covered-by: dice-roller, coin-flip |
| digital-compass | DT | covered-by: covered-by: digital-compass (same id) |
| discount-vat-calculator | DT | covered-by: vat-calculator, discount-calculator |
| ephemeris-calculator | DT | NOT BUILT: astrology/astronomy/pseudo-science tools: ephemeris maths would need an astronomy library and oracle, and the astrology outputs have no evidence base; not built |
| exam-section-timer | DT | covered-by: covered-by: exam-section-timer (same id) |
| find-and-replace | DT | covered-by: find-replace |
| fire-retirement-calculator | DT | covered-by: retirement-estimator |
| flashcard-study-deck | DT | covered-by: flashcards-spaced-repetition |
| flashlight | DT | covered-by: flashlight-beacon |
| flexbox-playground | DT | covered-by: flexbox-generator |
| font-anatomy-variable-lab | DT | NOT BUILT: font parsing/subsetting needs a font engine (cmap, glyf, GSUB tables); not built |
| fuel-cost-trip-calculator | DT | covered-by: fuel-cost |
| fullscreen-countdown-timer | DT | covered-by: countdown-to-date, countdown-timer |
| golden-blue-hour | DT | NOT BUILT: astrology/astronomy/pseudo-science tools: ephemeris maths would need an astronomy library and oracle, and the astrology outputs have no evidence base; not built |
| gpa-grade-calculator | DT | covered-by: gpa-calculator, grade-calculator |
| gps-speedometer | DT | built-now: gps-speedometer |
| gradient-palette-builder | DT | covered-by: palette-generator, tailwind-v4-color-palette, color-mixer |
| graph-shortest-path-lab | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| graphql-formatter | DT | covered-by: graphql-query-formatter |
| gzip-tools | DT | covered-by: gzip-compress, gzip-decompress, gzip-inspector |
| habit-streak-tracker | DT | covered-by: covered-by: habit-streak-tracker (same id) |
| hourly-rate-calculator | DT | covered-by: salary-hourly |
| html-editor | DT | covered-by: code-playground (HTML/CSS/JS) |
| html-encoder-decoder | DT | covered-by: html-minify, html-entities, html-entities-reference |
| html-to-text-converter | DT | covered-by: html-tag-stripper |
| human-design-bodygraph | DT | NOT BUILT: astrology/astronomy/pseudo-science tools: ephemeris maths would need an astronomy library and oracle, and the astrology outputs have no evidence base; not built |
| i2c-spi-timing-diagram | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| iban-validator | DT | covered-by: covered-by: iban-validator (same id) |
| image-palette-extractor | DT | covered-by: color-picker-from-image, color-converter |
| interactive-periodic-table | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| intermittent-fasting-planner | DT | built-now: fasting-window-planner |
| iot-battery-life-estimator | DT | built-now: battery-life-estimator |
| java-to-kotlin-converter | DT | NOT BUILT: language translation needs full parsers and semantics per language pair; not built |
| javascript-playground | DT | covered-by: code-playground (HTML/CSS/JS) |
| keyword-extractor | DT | covered-by: covered-by: keyword-extractor (same id) |
| kitchen-unit-converter | DT | covered-by: unit-converter |
| laundry-care-decoder | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| life-in-weeks | DT | built-now: life-in-weeks |
| list-deduplicator | DT | covered-by: dedupe-lines, sort-lines |
| llm-benchmarks | DT | SKIP: needs maintained external data (price lists, tariff codes, benchmark results, visa rules, per-country tax ID checks); existing offline validators cover the format-only part (vat-number-format-validator, luhn-validator, iban-validator) |
| llm-cost-budget-forecaster | DT | covered-by: llm-cost-calculator, tokenizer-cost-estimator, embedding-token-cost-estimator |
| llm-guardrails-builder | DT | NOT BUILT: content/template pages (advice text), not a computation |
| loan-mortgage-calculator | DT | covered-by: loan-calculator, emi-calculator |
| local-sidereal-time | DT | NOT BUILT: astrology/astronomy/pseudo-science tools: ephemeris maths would need an astronomy library and oracle, and the astrology outputs have no evidence base; not built |
| log-parser | DT | built-now: access-log-analyzer |
| markdown-linter | DT | built-now: markdown-linter |
| markdown-to-plain-text | DT | built-now: markdown-to-plain-text |
| matrix-affine-transform-3d | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| metronome-instrument-tuner | DT | built-now: instrument-tuner (tuner); metronome already covered |
| mongodb-query-builder | DT | built-now: mongodb-query-builder |
| moon-gardening-calendar | DT | NOT BUILT: astrology/astronomy/pseudo-science tools: ephemeris maths would need an astronomy library and oracle, and the astrology outputs have no evidence base; not built |
| moon-phase-eclipse-predictor | DT | NOT BUILT: astrology/astronomy/pseudo-science tools: ephemeris maths would need an astronomy library and oracle, and the astrology outputs have no evidence base; not built |
| morse-spectrogram-decoder | DT | NOT BUILT: astrology/astronomy/pseudo-science tools: ephemeris maths would need an astronomy library and oracle, and the astrology outputs have no evidence base; not built |
| nosql-validator | DT | covered-by: json-validate, json-format |
| numerology-analyzer | DT | NOT BUILT: astrology/astronomy/pseudo-science tools: ephemeris maths would need an astronomy library and oracle, and the astrology outputs have no evidence base; not built |
| oklch-gamut-gradient-studio | DT | covered-by: gradient-generator, mesh-gradient-generator, tailwind-v4-color-palette |
| palette-accessibility-checker | DT | built-now: palette-contrast-matrix |
| pill-tracker | DT | covered-by: bill-tracker, habit-streak-tracker |
| pixel-art-sprite-studio | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| planet-aspects-retrograde | DT | NOT BUILT: astrology/astronomy/pseudo-science tools: ephemeris maths would need an astronomy library and oracle, and the astrology outputs have no evidence base; not built |
| pregnancy-due-date-calculator | DT | covered-by: due-date-calculator |
| prompt-diff-comparator | DT | covered-by: text-diff, code-diff-html, json-diff, json-patch-generator |
| prompt-template-builder | DT | covered-by: prompt-template-filler, prompt-linter |
| pwm-duty-cycle-motor | DT | built-now: pwm-calculator |
| px-to-rem | DT | covered-by: css-unit-converter, px-to-rem-converter |
| python-to-javascript-converter | DT | NOT BUILT: language translation needs full parsers and semantics per language pair; not built |
| rag-chunking-visualizer | DT | covered-by: covered-by: rag-chunking-visualizer (same id) |
| random-number-picker | DT | covered-by: covered-by: random-number-picker (same id) |
| readability-score | DT | covered-by: readability, text-statistics |
| rf-antenna-wavelength | DT | built-now: wavelength-antenna-calculator |
| rot13-cipher | DT | covered-by: rot13-caesar, classical-ciphers |
| ruby-playground | DT | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| savings-goal-calculator | DT | covered-by: savings-goal |
| screen-recorder | DT | covered-by: covered-by: screen-recorder (same id) |
| screen-ruler | DT | covered-by: covered-by: screen-ruler (same id) |
| sleep-cycle-calculator | DT | built-now: sleep-cycle-calculator |
| smart-mirror | DT | NOT BUILT: educational visualisers and simulators: client-side feasible, but each is a separate interactive app and none is a standard tool; recorded as backlog rather than built |
| soap-formatter | DT | covered-by: xml-format, xml-validate |
| social-frame-studio | DT | covered-by: meta-analyzer, og-twitter-generator, social-preview, meta-tag-generator |
| sql-tools/builder | DT | built-now: sql-select-builder |
| sql-tools/compare | DT | covered-by: text-diff, code-diff-html, json-diff, json-patch-generator |
| sql-performance-analyzer | DT | covered-by: sql-explainer, sql-index-advisor |
| sql-query-builder | DT | built-now: sql-select-builder |
| sql-tools | DT | covered-by: sql-format, sql-select-builder, sql-migration-generator |
| ssml-markup-builder | DT | built-now: ssml-markup-builder |
| stopwatch-lap-timer | DT | covered-by: stopwatch, countdown-timer |
| stored-procedure-formatter | DT | covered-by: sql-format, sql-minify |
| subscription-expense-tracker | DT | covered-by: bill-tracker, habit-streak-tracker |
| subtitle-tools | DT | covered-by: subtitle-srt-vtt-converter, transcript-cleaner |
| system-prompt-compressor | DT | built-now: prompt-compressor |
| tailwind-theme-builder | DT | covered-by: tailwind-converter, tailwind-to-inline-css, shadcn-theme-generator |
| tax-id-validator | DT | SKIP: needs maintained external data (price lists, tariff codes, benchmark results, visa rules, per-country tax ID checks); existing offline validators cover the format-only part (vat-number-format-validator, luhn-validator, iban-validator) |
| temperature-converter | DT | covered-by: unit-converter |
| text-chunker | DT | covered-by: text-chunk-splitter |
| text-cleaner | DT | built-now: text-cleaner |
| text-sentiment-analyzer | DT | covered-by: ai-sentiment-classifier, sentiment-lexicon |
| text-statistics | DT | covered-by: covered-by: text-statistics (same id) |
| text-summarizer | DT | built-now: text-summarizer |
| text-to-speech | DT | covered-by: covered-by: text-to-speech (same id) |
| timezone-converter | DT, SC | covered-by: covered-by: timezone-converter (same id) |
| tip-bill-splitter | DT | covered-by: tip-calculator |
| token-cost-calculator | DT | covered-by: llm-cost-calculator, tokenizer-cost-estimator, embedding-token-cost-estimator |
| typescript-playground | DT | NOT BUILT: running Python, Ruby, C++, Rust, Java or SQL engines needs a WebAssembly runtime or a server (third-party code of tens of MB); code-playground runs HTML, CSS and JavaScript |
| typescript-to-javascript-converter | DT | NOT BUILT: language translation needs full parsers and semantics per language pair; not built |
| unicode-font-styler | DT | covered-by: fancy-text (bold, italic, script, small caps, upside-down, strikethrough and more) |
| unicode-inspector | DT | covered-by: char-info, unicode-escape, unicode-character-map, fancy-text |
| vat-validator | DT | SKIP: needs maintained external data (price lists, tariff codes, benchmark results, visa rules, per-country tax ID checks); existing offline validators cover the format-only part (vat-number-format-validator, luhn-validator, iban-validator) |
| visa-passport-validity-checker | DT | SKIP: needs maintained external data (price lists, tariff codes, benchmark results, visa rules, per-country tax ID checks); existing offline validators cover the format-only part (vat-number-format-validator, luhn-validator, iban-validator) |
| voice-dictation | DT | SKIP: browser speech recognition sends audio to a vendor service, and local models are large unverified downloads |
| whisper-transcript-cleaner | DT | built-now: transcript-cleaner |
| wolfram-1d-automata | DT | built-now: cellular-automaton-generator |
| wsdl-formatter | DT | covered-by: xml-format, xml-validate |
| youtube-seo-builder | DT | built-now: youtube-seo-checker |
| youtube-thumbnail | DT | built-now: youtube-link-tools |
| ai | DT | ignored: landing/directory page (ignored) |
| ai/mcp | DT | covered-by: mcp-message-validator (live connection skipped: needs network) |
| ai/skills | DT | ignored: landing/directory page (ignored) |
| ai/prompts | DT | covered-by: prompt-template-filler, prompt-linter |
| curl-converter | SC | covered-by: curl-to-code, curl-to-more-languages |
| browser-fingerprint-generator | SC | SKIP: depends on third-party anti-bot vendors, proxy lists or probing remote hosts |
| tls-fingerprint-checker | SC | SKIP: needs a live TLS handshake with a server; x509-viewer and x509-chain-analyzer inspect certificates you paste |
| user-agent-generator | SC | covered-by: user-agent-string-list, user-agent-parser |
| http-headers-checker | SC | covered-by: http-headers-analyzer, security-headers-generator |
| antibot-detector | SC | SKIP: depends on third-party anti-bot vendors, proxy lists or probing remote hosts |
| browser-fingerprint-checker | SC | covered-by: browser-fingerprint |
| webrtc-leak-test | SC | covered-by: covered-by: webrtc-leak-test (same id) |
| dns-leak-test | SC | SKIP: needs DNS/WHOIS/IP-geolocation queries (network or databases); dns-record-generator, dns-resolution-simulator and browser-info cover the offline parts |
| har-analyzer | SC | covered-by: covered-by: har-analyzer (same id) |
| ip-proxy-lookup | SC | SKIP: needs DNS/WHOIS/IP-geolocation queries (network or databases); dns-record-generator, dns-resolution-simulator and browser-info cover the offline parts |
| css-selector-tester | SC | covered-by: covered-by: css-selector-tester (same id) |
| robots-txt-validator | SC | covered-by: robots-generator, robots-tester, ai-bot-robots-builder |
| base64-url-encoder | SC | covered-by: base64-encode, base64-decode, base64url-encoder |
| youtube-transcript-extractor | SC | SKIP: fetches captions from YouTube (network/API); transcript-cleaner cleans text you paste |
| free-proxy-lists | SC | SKIP: depends on third-party anti-bot vendors, proxy lists or probing remote hosts |
| website-screenshot-generator | SC | SKIP: must fetch other websites or render pages on a server (CORS blocks it in a web page); a browser extension could supply the content to the existing audit tools |
| html-to-markdown-generator | SC | covered-by: html-to-markdown, markdown-to-html |
| markdown-converter | SC | covered-by: html-to-markdown, markdown-to-html |
| email-scraper | SC | SKIP: must fetch other websites or render pages on a server (CORS blocks it in a web page); a browser extension could supply the content to the existing audit tools |
| url-finder | SC | SKIP: must fetch other websites or render pages on a server (CORS blocks it in a web page); a browser extension could supply the content to the existing audit tools |
| image-finder | SC | SKIP: must fetch other websites or render pages on a server (CORS blocks it in a web page); a browser extension could supply the content to the existing audit tools |
| article-scraper | SC | SKIP: must fetch other websites or render pages on a server (CORS blocks it in a web page); a browser extension could supply the content to the existing audit tools |
| amazon-scraper | SC | SKIP: must fetch other websites or render pages on a server (CORS blocks it in a web page); a browser extension could supply the content to the existing audit tools |
| faker | SC | covered-by: mock-data-generator, random-json-generator, fake-person-generator, api-mock-response-generator |

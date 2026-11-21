# Skip review: which "skipped" rows really need a server

Scope: every SKIP row of gap-audit.md (6) and feature-audit.md (119 distinct slugs, 119 rows across sites), the class "AI without a verifiable client-side model" and the live-only parts of covered rows. Test applied to each: can a useful CLIENT-SIDE version exist as (a) a pasted-input analyser, (b) a local simulator, (c) public offline reference data, (d) a browser-API-only check, or (e) a model whose weights can be downloaded, hash-checked and licence-checked, run by a hand-written engine under about 70 MB? "KEPT" means none applies; the reason is given. "BUILT" means a tool in src/tools/gap5.js (or an earlier module where noted) now covers the useful part; text after the id says what part stays skipped.

Models added (details, hashes and licences in data/SOURCES-gap5.md): ai-language-identifier (fastText lid.176, 0.9 MB), ai-fill-mask (DistilBERT, 69 MB), ai-question-answering (DistilBERT SQuAD, 67 MB), ai-image-classifier (MobileNetV2, 7 MB), ai-speech-to-text (Whisper tiny.en, 43 MB), ai-offline-chat (SmolLM2-135M-Instruct 4-bit, 76 MB, slightly over budget and visibly weak). Each engine is verified against PyTorch or the reference implementation in test/gap5-*.mjs. Models considered and rejected: toxicity/zero-shot classifiers (NLI models are 250 MB and 7 times slower; no oracle-checkable quality gain over sentiment), translation (300 MB per pair), captioning, detection, upscaling, diffusion (all above budget).

Other additions that were not on a skip row but came from the same review: ip-address-offline-lookup data (RIR delegation files), hs-code-lookup (HS 2022), tax-id-checksum-validator, naive-bayes-text-classifier, network-connection-info, battery-status-viewer, browser-permissions-viewer, media-devices-viewer, clipboard-inspector, html-* extractors (listed against their rows below).

Counts: 125 rows reviewed; BUILT 70; KEPT 55.

## gap-audit.md

| slug | status | kept-skipped reason / what stays skipped | now-built id |
|---|---|---|---|
| dns-propagation-checker | KEPT | needs live queries to many public resolvers |  |
| websocket-tester | KEPT | opens a live WebSocket; websocket-frame-parser decodes pasted frames |  |
| claude-token-counter (exact) | KEPT | Claude 3+ vocabularies are unpublished; multi-tokenizer-counter has the legacy tokenizer |  |
| mcp-inspector (live) | KEPT | needs a running MCP server; mcp-message-validator checks pasted traffic |  |
| sse-stream-tester (live) | BUILT | built earlier from pasted capture; live connection skipped | sse-stream-parser |
| ssl-certificate-inspector (live) | KEPT | needs a live TLS handshake; x509-viewer for pasted PEM |  |

## feature-audit.md

| slug | sites | status | kept-skipped reason / what stays skipped | now-built id |
|---|---|---|---|---|
| backlink-checker | seobility | KEPT | needs a crawled link index (paid/server data) |  |
| ranking-checker | seobility | BUILT | live checking stays skipped; pasted tracker exports analysed | rank-history-analyzer |
| keyword-research-tool | seobility | KEPT | needs keyword volume and difficulty databases (paid) |  |
| backlink-discovery | iamramgarhia | KEPT | needs a crawled link index; pasted exports are covered by backlink-export-analyzer |  |
| bing | iamramgarhia | KEPT | needs live Bing results or API; Bing Webmaster exports can use gsc-performance-analyzer (same columns) |  |
| browser-agent | iamramgarhia | KEPT | a hosted agent that drives a browser |  |
| bulk-scan | iamramgarhia | KEPT | needs crawling many sites; an extension could feed pages to the audit tools |  |
| code-generator | iamramgarhia | KEPT | needs a generative language model; the only one that fits the size budget (SmolLM2-135M, ai-offline-chat) is too weak for reliable output of this kind, and a larger one is a 150 MB to multi-GB download |  |
| crux-origin | iamramgarhia | BUILT | same | crux-response-analyzer |
| crux | iamramgarhia | BUILT | API call skipped (key + network); pasted response analysed | crux-response-analyzer |
| dns-whois | iamramgarhia | BUILT | live lookups skipped; pasted WHOIS parsed. ip-address-offline-lookup for addresses | whois-record-parser |
| domain-overview | iamramgarhia | BUILT | same, plus dig-nslookup-output-analyzer | whois-record-parser |
| github-pr | iamramgarhia | BUILT | rule-based description from a pasted diff; no GitHub API | pr-description-generator |
| gsc-coverage | iamramgarhia | BUILT | OAuth skipped; pasted Pages report explained | gsc-page-indexing-explainer |
| image-gen | iamramgarhia | KEPT | image diffusion models are 1 to 7 GB |  |
| keyword-difficulty | iamramgarhia | KEPT | needs link-graph and SERP metrics from a paid index |  |
| link-checker | iamramgarhia | BUILT | status-code checking of targets skipped (CORS); everything checkable from pasted HTML is checked | html-link-auditor |
| link-intersect | iamramgarhia | BUILT | pasted referring-domain lists | link-intersect-tool |
| mobile-friendly | iamramgarhia | BUILT | static checks on pasted HTML; rendering skipped | mobile-friendly-html-check |
| outreach-personalize | iamramgarhia | BUILT | merge/personalisation with fallbacks, not generation | outreach-mail-merge |
| rank-where | iamramgarhia | BUILT | live check skipped; pasted history analysed | rank-history-analyzer |
| reddit-research | iamramgarhia | KEPT | needs Reddit API/search |  |
| refresh | iamramgarhia | BUILT | finds stale content; rewriting needs an LLM | content-freshness-audit |
| render | iamramgarhia | KEPT | needs a server-side headless browser |  |
| reputation-abuse-risk | iamramgarhia | KEPT | manual editorial judgement against Google policy; no data |  |
| screenshot-import | iamramgarhia | KEPT | needs a server-side headless browser |  |
| search-volume | iamramgarhia | KEPT | needs keyword volume data (paid or Google Ads account) |  |
| serp-features | iamramgarhia | KEPT | needs live SERP results; parsing a pasted Google SERP is brittle (markup changes weekly) and has no oracle |  |
| serp-volatility | iamramgarhia | BUILT | volatility of your own tracked keywords from pasted data (not the whole SERP) | rank-history-analyzer |
| soft-404 | iamramgarhia | BUILT | pasted HTML + status | soft-404-detector |
| trending | iamramgarhia | BUILT | live trend feeds skipped; pasted Google Trends export analysed | trends-csv-analyzer |
| uptime | iamramgarhia | BUILT | live probing skipped; pasted monitor log analysed | uptime-log-analyzer |
| wayback | iamramgarhia | BUILT | pasted CDX output analysed; querying archive.org skipped | wayback-cdx-analyzer |
| youtube-audit | iamramgarhia | BUILT | fetching video data skipped; youtube-seo-checker already audits pasted title/description/tags | youtube-caption-format-converter |
| youtube | iamramgarhia | BUILT | same | youtube-caption-format-converter |
| offline-ai-chat | DP | BUILT | SmolLM2-135M-Instruct, 4-bit, hand-written engine | ai-offline-chat |
| baby-name-ai | DP | KEPT | a generator would need a name database with licence checks; ai-offline-chat can brainstorm, poorly |  |
| api-tester | DP | KEPT | sends live HTTP requests (CORS) |  |
| rest-api-tester | DP | KEPT | sends live HTTP requests (CORS) |  |
| http-request-tester | DP | KEPT | sends live HTTP requests (CORS) |  |
| local-ai-chat | DP | BUILT | same | ai-offline-chat |
| private-ai-chatbot | DP | BUILT | same | ai-offline-chat |
| ai-viewer | DP | BUILT | same | ai-offline-chat |
| ip-address-lookup | QT, DPG, DT | BUILT | classification + RIR registry country offline; city/ISP/reputation need paid databases | ip-address-offline-lookup |
| dns-lookup | QT, UT, DT | BUILT | live queries skipped; pasted dig/nslookup output analysed | dig-nslookup-output-analyzer |
| ai-code-explainer | UT, DT | KEPT | needs a generative language model; the only one that fits the size budget (SmolLM2-135M, ai-offline-chat) is too weak for reliable output of this kind, and a larger one is a 150 MB to multi-GB download |  |
| ai-content-detector | UT | KEPT | AI-text detectors are unreliable (high false-positive rates, especially on non-native writers); building one would mislead users |  |
| ai-fill-mask | UT | BUILT | distilbert-base-uncased | ai-fill-mask |
| ai-image-captioning | UT | KEPT | captioning models (ViT-GPT2, BLIP) are 300 MB to 1 GB; nothing under the size budget with usable quality |  |
| ai-image-classifier | UT | BUILT | MobileNetV2 | ai-image-classifier |
| ai-image-upscaler | UT | KEPT | neural super-resolution models are 20+ MB each and need tile processing; image-resizer does non-AI scaling |  |
| ai-object-detection | UT | KEPT | small detectors (YOLO nano) are AGPL; permissive ones (DETR, RT-DETR) are 40 to 160 MB and need a bounding-box decoder; not done |  |
| ai-paraphraser | UT | KEPT | needs a seq2seq or LLM; needs a generative language model; the only one that fits the size budget (SmolLM2-135M, ai-offline-chat) is too weak for reliable output of this kind, and a larger one is a 150 MB to multi-GB download |  |
| ai-question-answering | UT | BUILT | distilbert squad | ai-question-answering |
| ai-speech-to-text | UT | BUILT | Whisper tiny.en | ai-speech-to-text |
| ai-text-classifier | UT | BUILT | train-your-own classifier; ai-sentiment-classifier and ai-language-identifier are pretrained ones | naive-bayes-text-classifier |
| ai-translator | UT | KEPT | translation models (Opus-MT) are about 300 MB per language pair |  |
| currency-converter | UT, DT | BUILT | live feed skipped; pasted ECB file or manual rates | currency-converter-manual-rates |
| ip-geolocation | UT | BUILT | country level only (registry country); city level kept skipped (commercial databases) | ip-address-offline-lookup |
| ssl-certificate-checker | UT, DT | KEPT | needs a live TLS handshake; x509-viewer/x509-chain-analyzer inspect pasted certificates; ja3-ja4-fingerprint-calculator reads a pasted ClientHello |  |
| webhook-tester | UT, DT | KEPT | needs a public endpoint; webhook-payload-simulator and webhook-signature-verifier cover signing/verification |  |
| abn-lookup | DPG | BUILT | checksum only; the ABR lookup stays skipped | tax-id-checksum-validator |
| ai-email-writer | DPG | KEPT | needs a generative language model; the only one that fits the size budget (SmolLM2-135M, ai-offline-chat) is too weak for reliable output of this kind, and a larger one is a 150 MB to multi-GB download |  |
| ai-linkedin-post-generator | DPG | KEPT | needs a generative language model; the only one that fits the size budget (SmolLM2-135M, ai-offline-chat) is too weak for reliable output of this kind, and a larger one is a 150 MB to multi-GB download |  |
| ai-paragraph-rewriter | DPG | KEPT | needs a generative language model; the only one that fits the size budget (SmolLM2-135M, ai-offline-chat) is too weak for reliable output of this kind, and a larger one is a 150 MB to multi-GB download |  |
| ai-product-description-generator | DPG | KEPT | needs a generative language model; the only one that fits the size budget (SmolLM2-135M, ai-offline-chat) is too weak for reliable output of this kind, and a larger one is a 150 MB to multi-GB download |  |
| ai-resume-bullet-points | DPG | BUILT | rule-based checker and rewrite template, not a writer | resume-bullet-improver |
| bas-calculator | DPG | BUILT | worksheet with editable rate | gst-bas-calculator |
| crypto-tax-calculator-au | DPG | BUILT | FIFO/LIFO/HIFO + discount as options | crypto-cgt-calculator |
| sole-trader-tax-estimator | DPG | BUILT | brackets shown and checkable; offsets not included | au-income-tax-estimator |
| wfh-deduction-calculator | DPG | BUILT | rate editable | wfh-deduction-calculator |
| burn-note-generator | DT | KEPT | burn-after-reading needs server-side one-time storage; a link cannot destroy itself |  |
| aws-pricing-calculator | DT | KEPT | needs maintained AWS price lists |  |
| hallucination-entropy-analyzer | DT | BUILT | analyses logprobs you paste from the API; no model needed | llm-logprobs-analyzer |
| ai-documentation-generator | DT | BUILT | signature-based skeletons, not prose | docstring-skeleton-generator |
| ai-mermaid-diagram-generator | DT | BUILT | syntax converter, not an AI | text-to-mermaid-flowchart |
| ai-sdk-generator | DT | KEPT | needs a generative language model; the only one that fits the size budget (SmolLM2-135M, ai-offline-chat) is too weak for reliable output of this kind, and a larger one is a 150 MB to multi-GB download; curl-to-ai-sdk exists |  |
| ai-sql-query-generator | DT | KEPT | needs a generative language model; the only one that fits the size budget (SmolLM2-135M, ai-offline-chat) is too weak for reliable output of this kind, and a larger one is a 150 MB to multi-GB download; text-to-SQL needs a schema-aware model |  |
| ai-unit-test-generator | DT | BUILT | signature-based stubs, not a model | unit-test-stub-generator |
| hs-code-generator | DT | BUILT | HS 2022 six-digit lookup (public-domain dataset); national tariff digits and duty rates stay skipped | hs-code-lookup |
| api-mock-server | DT | KEPT | needs a server; api-mock-response-generator builds responses |  |
| broken-link-checker | DT | BUILT | same | html-link-auditor |
| dns-propagation | DT | KEPT | needs live queries to many public resolvers |  |
| http-header-builder | DT | BUILT | already covered: raw HTTP message <-> JSON, plus http-snippet-generator and curl-builder | http-wire-format |
| http-request-builder | DT | BUILT | already covered | http-wire-format |
| ip-intel | DT | BUILT | classification and registry country; reputation kept skipped | ip-address-offline-lookup |
| mx-lookup | DT | BUILT | same | dig-nslookup-output-analyzer |
| network-info | DT | BUILT | browser Network Information API; public IP/ISP stay skipped | network-connection-info |
| ns-lookup | DT | BUILT | same | dig-nslookup-output-analyzer |
| port-scanner-guide | DT | BUILT | scanning skipped (raw sockets); pasted nmap output analysed | nmap-output-analyzer |
| reverse-dns-lookup | DT | BUILT | PTR name is computed offline; the lookup itself is skipped | ip-address-offline-lookup |
| ssl-inspector | DT | KEPT | same |  |
| subdomain-explorer | DT | BUILT | enumeration skipped; pasted lists organised and flagged | subdomain-list-analyzer |
| txt-lookup | DT | BUILT | same (SPF/DMARC/DKIM checks) | dig-nslookup-output-analyzer |
| whois-lookup | DT | BUILT | live lookups skipped | whois-record-parser |
| ai-agent-memory-simulator | DT | BUILT | deterministic simulation of window strategies | agent-context-window-simulator |
| ai-code-translator | DT | KEPT | needs a generative language model; the only one that fits the size budget (SmolLM2-135M, ai-offline-chat) is too weak for reliable output of this kind, and a larger one is a 150 MB to multi-GB download |  |
| ai-db-schema-architect | DT | KEPT | needs a generative language model; the only one that fits the size budget (SmolLM2-135M, ai-offline-chat) is too weak for reliable output of this kind, and a larger one is a 150 MB to multi-GB download |  |
| ai-design-pattern-refactor | DT | KEPT | needs a generative language model; the only one that fits the size budget (SmolLM2-135M, ai-offline-chat) is too weak for reliable output of this kind, and a larger one is a 150 MB to multi-GB download |  |
| ai-e2e-test-builder | DT | KEPT | needs a generative language model; the only one that fits the size budget (SmolLM2-135M, ai-offline-chat) is too weak for reliable output of this kind, and a larger one is a 150 MB to multi-GB download |  |
| ai-vision-ui-to-code | DT | KEPT | needs a vision-language model (GBs) |  |
| llm-benchmarks | DT | KEPT | needs maintained benchmark results |  |
| tax-id-validator | DT | BUILT | checksum only; registration checks (VIES) skipped | tax-id-checksum-validator |
| vat-validator | DT | BUILT | same | tax-id-checksum-validator |
| visa-passport-validity-checker | DT | BUILT | date rules as options; visa requirements per nationality stay skipped | passport-validity-checker |
| voice-dictation | DT | BUILT | microphone recording then local Whisper (not live streaming) | ai-speech-to-text |
| browser-fingerprint-generator | SC | KEPT | spoofing fingerprints for anti-bot evasion; browser-fingerprint and ja3-ja4 already show your own |  |
| tls-fingerprint-checker | SC | BUILT | JA3/JA4 from a pasted ClientHello | ja3-ja4-fingerprint-calculator |
| antibot-detector | SC | BUILT | signatures in pasted headers/cookies/HTML | antibot-waf-detector |
| dns-leak-test | SC | KEPT | needs DNS queries to a controlled name server |  |
| ip-proxy-lookup | SC | KEPT | proxy/VPN reputation needs commercial feeds |  |
| youtube-transcript-extractor | SC | BUILT | fetching captions skipped; pasted timedtext/json3/SRT/VTT converted | youtube-caption-format-converter |
| free-proxy-lists | SC | KEPT | proxy lists are live third-party data |  |
| website-screenshot-generator | SC | KEPT | needs a server-side headless browser |  |
| email-scraper | SC | BUILT | pasted HTML only; crawling skipped | html-email-extractor |
| url-finder | SC | BUILT | pasted HTML only | html-url-extractor |
| image-finder | SC | BUILT | pasted HTML only | html-image-extractor |
| article-scraper | SC | BUILT | pasted HTML only | article-text-extractor |
| amazon-scraper | SC | BUILT | pasted HTML only; no scraping | product-page-extractor |

## Live-only parts of covered rows (unchanged, all need a network endpoint)

- http/api-workbench (DD): sending requests. Kept skipped; curl-builder and http-snippet-generator build them.
- mcp/inspector and ai/mcp: connecting to a running MCP server. Kept; mcp-message-validator checks pasted traffic.
- ssl-certificate-inspector: live handshake. Kept.
- currency rates, DNS resolution, WHOIS and IP geolocation beyond registry country: see rows above.

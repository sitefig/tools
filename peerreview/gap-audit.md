# Gap audit: devstools.app slugs vs our tools

Source: /tmp/unmatched.txt (262 sitemap slugs that are not an exact tool id). Decisions below; ids were checked against assets/tools.json (747 tools after this audit).

Counts: 64 landing/category pages ignored, 190 covered by an existing tool, 6 built now (module src/tools/gap1.js), 2 skipped with reason. Several covered rows also carry a skip note for a live/network-only part of the page.

Method: titles and descriptions in the manifest were compared; ambiguous ones were run (jq oracle, Tailwind compiler, xlsx built by python zipfile, glyphmaps grep). devstools.app itself returned HTTP 429, so pages were judged from slug and manifest only.

Skips (valid because they need a network endpoint, an account or an unpublished vocabulary): dns-propagation-checker, websocket-tester, claude-token-counter (exact), live parts of mcp-inspector, sse-stream-tester, ssl-certificate-inspector.

| slug | decision |
|---|---|
| about | landing/category page (ignored) |
| aes-crypto-playground | covered-by: aes-encrypt, aes-decrypt, aes-modes-demo |
| ai-agent-prompt-optimizer | covered-by: prompt-linter (rule-based, no model) |
| ai-agents-rag | landing/category page (ignored) |
| ai-engineers | landing/category page (ignored) |
| ai-llm | landing/category page (ignored) |
| ansible-playbook-scaffolder | covered-by: ansible-playbook-generator |
| anthropic-tool-builder | covered-by: llm-tool-definition-builder (Anthropic output) |
| api-debugging | landing/category page (ignored) |
| api-developers | landing/category page (ignored) |
| api-schemas | landing/category page (ignored) |
| app-icon-resizer | covered-by: app-icon-generator |
| argon2-hash-generator | covered-by: argon2-hash |
| ascii-art-generator | covered-by: ascii-art-text, image-to-ascii |
| aspect-ratio-resizer | covered-by: aspect-ratio-calculator |
| backend-developers | landing/category page (ignored) |
| bandwidth-calculator | covered-by: bandwidth-download-time |
| base32-encoder | covered-by: base32 |
| base64 | covered-by: base64-encode, base64-decode |
| base64-pem-certificate-parser | covered-by: x509-viewer |
| base64-to-image | covered-by: base64-image-viewer |
| bcd-binary-coded-decimal-converter | covered-by: bcd-converter |
| bcrypt-hash-calculator | covered-by: bcrypt-generator, bcrypt-verifier |
| bip39-seed-deriver | covered-by: bip39-generator (validates phrase and derives the 512-bit seed, PBKDF2-HMAC-SHA512) |
| bip39-seed-phrase-generator | covered-by: bip39-generator |
| blake3-hash-generator | covered-by: blake3-hash |
| cache-control | covered-by: cache-control-builder, http-cache-control-tester |
| caddyfile-production-generator | covered-by: caddyfile-generator |
| certificate-decoder | covered-by: x509-viewer |
| certificates-keys | landing/category page (ignored) |
| cidr-calculator | covered-by: ip-subnet-calculator, cidr-contains |
| claude-token-counter | covered-by: llm-token-estimator (approximate only) ; SKIP exact: Claude 3+ vocabularies are unpublished, so an exact count is impossible offline; multi-tokenizer-counter includes the legacy Claude 1/2 tokenizer |
| code-side-by-side-diff | covered-by: code-diff-html |
| collections | landing/category page (ignored) |
| color-accessibility | landing/category page (ignored) |
| color-contrast-checker | covered-by: contrast-checker |
| color-harmony-generator | covered-by: palette-generator (complementary, analogous, triadic, tetradic) |
| color-palette-generator | covered-by: palette-generator |
| contact | landing/category page (ignored) |
| contrast-ratio-apca-calculator | covered-by: contrast-checker (WCAG ratio and APCA Lc) |
| conventional-commit-builder | covered-by: conventional-commit-generator |
| cron-next-runs-visualizer | covered-by: cron-explainer (next 10 runs), cron-timezone-converter |
| cron-parser | covered-by: cron-explainer |
| crontab-descriptor | covered-by: cron-explainer |
| crontab-schedule-translator | covered-by: cron-dialect-converter, natural-language-to-cron |
| csp-evaluator | covered-by: csp-analyzer |
| csr-generator | covered-by: x509-san-csr-builder |
| css-border-radius | covered-by: border-radius-generator |
| css-box-shadow | covered-by: box-shadow-generator |
| css-clamp | covered-by: css-clamp-generator, css-clamp-calculator |
| css-clip-path | covered-by: clip-path-generator |
| css-effects | landing/category page (ignored) |
| css-flexbox-generator | covered-by: flexbox-generator |
| css-glassmorphism | covered-by: glassmorphism-generator |
| css-glassmorphism-claymorphism | covered-by: glassmorphism-generator, css-claymorphism-generator |
| css-gradient | covered-by: gradient-generator |
| css-grid-generator | covered-by: grid-generator |
| css-grid-to-tailwind | covered-by: tailwind-converter (grid-template-*, gap and grid-flow map to grid-cols-N etc; spans use arbitrary values); css-grid-area-builder |
| css-keyframes-generator | covered-by: css-animation-generator |
| css-layout-animation | covered-by: css-animation-generator (page not fetchable: devstools returned HTTP 429; no distinct feature identifiable from the slug) |
| css-mesh-gradient | covered-by: mesh-gradient-generator |
| css-minifier | covered-by: css-minify |
| css-neumorphism | covered-by: neumorphism-generator |
| css-text-shadow | covered-by: text-shadow-generator |
| css-to-tailwind | covered-by: tailwind-converter |
| css-triangle-bubble-generator | covered-by: css-triangle-generator, css-speech-bubble-generator |
| csv-to-markdown | covered-by: csv-to-markdown-table |
| csv-to-sql-insert | covered-by: csv-to-sql |
| curl-converters | landing/category page (ignored) |
| curl-to-axios | covered-by: curl-to-more-languages (axios) |
| curl-to-csharp | covered-by: curl-to-more-languages (C# HttpClient) |
| curl-to-fetch | covered-by: curl-to-code (fetch) |
| curl-to-go | covered-by: curl-to-go-http |
| curl-to-java | covered-by: curl-to-more-languages (Java 11 HttpClient) |
| curl-to-javascript | covered-by: curl-to-code (fetch, Node) |
| curl-to-php | covered-by: curl-to-code (PHP cURL) |
| curl-to-php-guzzle | covered-by: curl-to-more-languages (Guzzle) |
| curl-to-python | covered-by: curl-to-code (requests) |
| curl-to-ruby-faraday | covered-by: curl-to-more-languages (Faraday) |
| curl-to-rust | covered-by: curl-to-rust-reqwest |
| database-developers | landing/category page (ignored) |
| data-conversion | landing/category page (ignored) |
| data-engineers | landing/category page (ignored) |
| decode-unicode-escapes | covered-by: unicode-escape |
| deepseek-token-counter | covered-by: multi-tokenizer-counter (exact DeepSeek-V3 and R1 vocabularies) |
| devops-engineers | landing/category page (ignored) |
| devops-infrastructure | landing/category page (ignored) |
| devstools.app | landing/category page (ignored) |
| dns-lookup-simulator | built-now: dns-resolution-simulator (pure zone-record simulator; no live lookups) |
| dns-networking | landing/category page (ignored) |
| dns-propagation-checker | SKIP: needs live queries to many public resolvers around the world (network/API); a no-network page cannot do it |
| dockerfile-ai-optimized-generator | covered-by: dockerfile-generator, dockerfile-linter |
| docker-kubernetes | landing/category page (ignored) |
| docker-to-compose | covered-by: docker-run-to-compose |
| eip712-hasher | covered-by: eip712-typed-data-hash |
| encoding-conversion | landing/category page (ignored) |
| eslint-prettier-config | covered-by: eslint-prettier-config-generator |
| ethereum-abi-storage-slot-calculator | covered-by: solidity-storage-slot, abi-encoder-decoder |
| excel-to-json | built-now: xlsx-to-json (xlsx-viewer only printed CSV) |
| file-checksum-comparator | covered-by: hash-compare, file-hash |
| fluid-typography | covered-by: css-clamp-generator, css-clamp-calculator |
| for | landing/category page (ignored) |
| formatters-minifiers | landing/category page (ignored) |
| frontend-css | landing/category page (ignored) |
| frontend-developers | landing/category page (ignored) |
| git-ci | landing/category page (ignored) |
| git-command-cheat-builder | covered-by: git-command-builder |
| gitlab-ci-pipeline-builder | covered-by: gitlab-ci-generator |
| guides | landing/category page (ignored) |
| har-viewer | covered-by: har-analyzer |
| hashing-checksums | landing/category page (ignored) |
| helm-chart-yaml-generator | covered-by: helm-chart-scaffolder |
| hex-encoder | covered-by: hex-text, hex-dump-viewer |
| hmac-sha384-sha512-calculator | covered-by: hmac-generator (MD5 to SHA-512) |
| html-entity | covered-by: html-entities, html-entities-reference |
| html-formatter | covered-by: html-format |
| html-minifier | covered-by: html-minify |
| html-to-gfm-converter | covered-by: html-to-markdown |
| html-to-jsx-tailwind | covered-by: html-to-jsx |
| ieee754-hex-float-converter | covered-by: ieee754-converter |
| ieee754-visualizer | covered-by: ieee754-converter (sign/exponent/mantissa bit breakdown) |
| image-color-extractor | covered-by: color-picker-from-image (median-cut dominant palette) |
| image-converter | covered-by: image-format-converter |
| image-exif-stripper | covered-by: exif-remover |
| infrastructure-as-code | landing/category page (ignored) |
| ipv6-subnet-calculator | covered-by: ip-subnet-calculator (IPv6 prefix ranges), ip-supernetting-calculator |
| js-minifier | covered-by: js-minify |
| json-array-splitter-chunker | covered-by: json-array-chunker |
| json-csv | landing/category page (ignored) |
| json-development | landing/category page (ignored) |
| json-diff-patch | covered-by: json-diff, json-patch-generator, json-patch-applier |
| json-formatter | covered-by: json-format |
| json-key-sorter | covered-by: json-sort-keys |
| json-minifier | covered-by: json-minify |
| json-pointer | covered-by: json-pointer-tester |
| json-query-transform | built-now: jq-playground (jsonpath-tester covered queries only, no transforms) |
| json-string-escape | covered-by: json-escape, json-unescape |
| json-to-code | covered-by: json-to-typescript, json-to-go, json-to-models, json-to-zod |
| json-to-csharp | covered-by: json-to-models (C#) |
| json-to-excel | covered-by: json-to-xlsx |
| json-to-go-struct | covered-by: json-to-go |
| json-to-graphql | covered-by: json-to-graphql-schema, json-to-graphql-query |
| json-to-java-pojo | covered-by: json-to-models (Java records) |
| json-to-json-schema | covered-by: json-schema-generator |
| json-to-kotlin | covered-by: json-to-models (Kotlin data classes) |
| json-to-python-dataclass | covered-by: json-to-models (Python dataclasses), json-to-pydantic |
| json-to-rust-serde | covered-by: json-to-models (Rust serde) |
| json-to-sql-ddl | covered-by: json-to-sql (column types + CREATE TABLE) |
| json-to-sql-insert | covered-by: json-to-sql (INSERT statements) |
| json-to-swift | covered-by: json-to-models (Swift Codable) |
| json-validator | covered-by: json-validate |
| jwt-authentication | landing/category page (ignored) |
| jwt-builder | covered-by: jwt-encode |
| jwt-decoder | covered-by: jwt-decode |
| jwt-generator | covered-by: jwt-encode |
| key-code-info | covered-by: keyboard-event-viewer |
| llm-function-calling-builder | covered-by: llm-tool-definition-builder |
| llm-pricing-calculator | covered-by: llm-cost-calculator |
| llm-token-counter | covered-by: gpt-token-counter, multi-tokenizer-counter, llm-token-estimator |
| llm-tokens-costs | landing/category page (ignored) |
| markdown-docs | landing/category page (ignored) |
| mcp-inspector | covered-by: mcp-message-validator (paste traffic) ; SKIP live mode: connecting to a running MCP server needs a network/process endpoint |
| md5-hash | covered-by: hash-generator |
| media-files | landing/category page (ignored) |
| meta-tags | covered-by: meta-tag-generator, meta-analyzer |
| mime-type-extension-lookup | covered-by: mime-type-lookup |
| mobile-developers | landing/category page (ignored) |
| mobile-development | landing/category page (ignored) |
| morse-code-audio-converter | covered-by: morse-code-audio |
| morse-code-converter | covered-by: morse-translator |
| multi-llm-token-comparator | covered-by: multi-tokenizer-counter |
| multi-radix-converter | covered-by: number-base-converter |
| nanoid-custom-alphabet | covered-by: nanoid-generator |
| ndjson-to-json | covered-by: json-lines-tools |
| network-http | landing/category page (ignored) |
| network-port-reference | covered-by: port-reference |
| nosql-databases | landing/category page (ignored) |
| number-bases | landing/category page (ignored) |
| opa-rego-policy-builder | covered-by: rego-snippet-helper |
| openai-function-schema | covered-by: llm-tool-definition-builder, openai-structured-outputs |
| open-graph-previewer | covered-by: social-preview |
| opengraph-tag-inspector | covered-by: meta-analyzer |
| orm-schema | landing/category page (ignored) |
| passphrase-wordlist-generator | covered-by: passphrase-generator |
| passwords-secrets | landing/category page (ignored) |
| password-strength-analyzer | covered-by: password-strength |
| pdf-merger | covered-by: pdf-merge |
| pdf-splitter | covered-by: pdf-split |
| percentage-growth-calculator | covered-by: percent-change |
| pgp-key-inspector | covered-by: openpgp-inspector |
| postgres-to-mysql | covered-by: sql-dialect-converter |
| postman-collection-to-curl | covered-by: postman-to-curl |
| privacy | landing/category page (ignored) |
| project-config | landing/category page (ignored) |
| prometheus-alert-builder | covered-by: prometheus-alert-generator |
| prompt-diff | covered-by: text-diff (word mode) |
| prompt-engineering | landing/category page (ignored) |
| prompt-template-formatter | covered-by: prompt-template-filler |
| punycode-converter | covered-by: punycode |
| punycode-idn-converter | covered-by: punycode |
| px-to-rem | covered-by: px-to-rem-converter |
| qa-engineers | landing/category page (ignored) |
| qr-code | covered-by: qr-code-generator |
| query-string-parser | covered-by: query-string |
| quoted-printable-encoder | covered-by: quoted-printable |
| rag-chunking-calculator | covered-by: rag-chunking-visualizer, text-chunk-splitter |
| react-native-icon-finder | built-now: react-native-icon-finder (names only) |
| remove-duplicates | covered-by: dedupe-lines |
| robots-txt-generator | covered-by: robots-generator |
| roman-numeral-converter | covered-by: roman-numerals |
| rot47-encoder-decoder | covered-by: rot47-encoder |
| schema-org-generator | covered-by: schema-generator |
| security-crypto | landing/category page (ignored) |
| security-engineers | landing/category page (ignored) |
| semver-range-evaluator | covered-by: semver-calculator (^ ~ x-ranges, hyphen, //) |
| sha256-hash | covered-by: hash-generator |
| sha512-hash | covered-by: hash-generator |
| sql-database | landing/category page (ignored) |
| sql-formatter | covered-by: sql-format |
| sql-minifier | covered-by: sql-minify |
| sse-stream-tester | built-now: sse-stream-parser (pasted capture) |
| ssl-certificate-inspector | covered-by: x509-viewer (pasted PEM) ; SKIP live fetch of a site's certificate: needs a TLS connection (network) |
| string-byte-counter | covered-by: string-length-bytes, utf8-bytes-viewer |
| subnet-calculator | covered-by: ip-subnet-calculator |
| svg-icons | landing/category page (ignored) |
| svg-minifier | covered-by: svg-optimizer |
| svg-path-visualizer | covered-by: svg-path-editor |
| svg-placeholder-generator | covered-by: placeholder-image-generator (SVG output) |
| svg-to-css-data-uri | covered-by: svg-to-css |
| svg-to-png-hd | covered-by: svg-to-png (scale option) |
| svg-to-webp | covered-by: svg-to-png (WebP output) |
| swagger-to-typescript | covered-by: openapi-to-typescript-fetch |
| systemd-service-hardened-builder | covered-by: systemd-unit-generator |
| tailwind-css | landing/category page (ignored) |
| tailwind-to-css | covered-by: tailwind-converter, tailwind-to-inline-css |
| tailwind-v4-mesh-gradient-generator | built-now: tailwind-mesh-gradient-generator |
| terms | landing/category page (ignored) |
| terraform-module-scaffolder | covered-by: terraform-scaffolder |
| test-data | landing/category page (ignored) |
| testing-debugging | landing/category page (ignored) |
| text-column-tabular-splitter | covered-by: text-column-splitter |
| text-content | landing/category page (ignored) |
| text-processing | landing/category page (ignored) |
| time-cron | landing/category page (ignored) |
| totp-authenticator-simulator | covered-by: totp-generator |
| tsv-to-json | covered-by: csv-to-json (any delimiter incl. tab) |
| typescript-modeling | landing/category page (ignored) |
| unicode-glyph-category-inspector | covered-by: char-info (code point, category, script) |
| unique-ids | landing/category page (ignored) |
| url-encoder | covered-by: url-encode, url-decode |
| url-utm-builder | covered-by: utm-builder, utm-bulk-builder |
| uuid-v4-vs-v7 | covered-by: uuid-generator (v1/v4/v7), uuid-v7-timestamp-extractor |
| uuid-v7-generator | covered-by: uuid-generator |
| verify-sha256-file-checksum | covered-by: hash-compare, file-hash |
| viewport-size-tester | covered-by: responsive-breakpoint-previewer |
| web3-blockchain | landing/category page (ignored) |
| web-seo | landing/category page (ignored) |
| web-servers | landing/category page (ignored) |
| websocket-tester | SKIP: opens a live WebSocket to an endpoint (network); there is no offline equivalent |
| xml-formatter | covered-by: xml-format |
| yaml-json | covered-by: yaml-to-json, json-to-yaml |
| binary-encoder | covered-by: binary-text |

# Second pass C: rows that needed a hand-written parser or engine

Module: `src/tools/new25.js` (about 300 KB, no third-party code, no network). Content: `content/en/<id>.json`.
Oracles were installed in a scratch folder only (typescript 5.6, esbuild, acorn, wabt 1.0.39, python `re`/`regex`, libpcre2 10.42 through a small C harness, gpg 2.4.4, a TeX Live found under the xournalpp snap, mathjax-full as a TS source corpus). None of it is shipped.

| n | name | decision |
|---|------|----------|
| 545 | PCRE Tester | BUILT:pcre-regex-tester |
| 546 | Python re Tester | BUILT:python-re-regex-tester |
| 588 | PGP Encrypt/Decrypt | BUILT:pgp-public-key-encrypt-decrypt (SEIPD v1 and LibrePGP OCB packet; RFC 9580 v2 not built, see below) |
| 680 | JavaScript Obfuscator | BUILT:javascript-obfuscator |
| 681 | TypeScript to JavaScript | BUILT:typescript-to-javascript |
| 687 | AST Explorer | BUILT:javascript-ast-explorer (JavaScript scripts plus a JSON tree) |
| 700 | WASM Text Converter | BUILT:wasm-wat-converter (assembler and disassembler) |
| 1510 | LaTeX Equation Renderer | BUILT:latex-equation-renderer |

## 545 / 546 regex engines
One backtracking matcher with two syntax flavours (continuation-passing closures, step limit of 3,000,000, recursion limit for very long subjects).
Supported: classes, POSIX classes (PCRE), `\d\w\s\h\v\R\N`, `\p{..}` via the browser's Unicode data (PCRE only), anchors, greedy/lazy/possessive quantifiers, capture/named/non-capturing/atomic groups, lookahead, lookbehind (fixed width, per top-level branch in PCRE), backreferences, conditionals, inline flags, `\Q..\E`, `\K`, recursion `(?R) (?1) (?&n)` (PCRE), flags i m s x (and a for Python), finditer-style empty-match rules, `re.sub` templates and PCRE2 substitute templates.
Skipped on purpose (clear error): `(*VERB)`, branch reset, `\G \X`, callouts, `\N{name}`, Python locale flag, variable-length lookbehind.
Verification (generated corpus, random grammar, ASCII plus a few non-ASCII characters, flags none/i/m/s/x combinations):
- Python 3.12 `re`: 67,359 pattern/subject pairs compared across eight 9,000-case runs plus earlier tuning runs, 0 disagreements. 4,638 pairs rejected by both. 3 pairs rejected by us but accepted by Python (not identified, the run was too slow to re-find them). 0 pairs accepted by us but rejected by Python.
- PCRE2 10.42 (C harness, UTF mode, `NOTEMPTY_ATSTART|ANCHORED` global loop): 70,737 pairs compared, 0 disagreements, 1,263 rejected by both.
- `re.sub` templates: 450 cases against Python, 0 diffs. PCRE2 substitute: 10 cases against `pcre2_substitute` with `UNSET_EMPTY`, 0 diffs (unset groups expand to empty, which is documented on the page).
Known gaps, not verified: `\K` inside a repeated atomic group (one corpus case differed before the final fixes, not re-found afterwards); Unicode case folding beyond simple lower/upper; Python `\w`/`\s` for exotic code points; the `regex` module was not used as an oracle (only `re`); lookbehind with captures inside; subjects over a few thousand characters with multi-character group loops hit the JS recursion limit and report an error.

## 681 TypeScript to JavaScript
Token-level transformer (tokenizer with templates and regex literals, bracket matching, contextual annotation removal, small type grammar for skipping types).
Supported: annotations, interfaces, type aliases, generics (declarations, calls, `new`, heritage), enums and const enums (expanded to the var/IIFE form with constant folding), `as`, `as const`, `satisfies`, `!`, access modifiers, readonly, abstract classes, overloads, `declare` statements, optional and definite markers, `this` parameters, parameter properties (assignments plus field declarations), `import type`, inline `type` specifiers, `export type`, unused-import removal by name, class field semantics as ES2022.
Rejected with a message: decorators, `namespace`/`module` blocks, JSX, `<T>expr` assertions, `import x = require()`, `export =`, `export import`, parameter properties plus `this` in a field initialiser, a TS construct it cannot parse.
Verification:
- 66 runnable programs: output executed and compared with esbuild output (stdout identical), `node --check` and parse by acorn.
- 681 real `.ts` files (mathjax-full sources, zod, mhchemparser): syntax tree compared with TypeScript 5.6 `transpileModule` (target ES2022, useDefineForClassFields). 647 identical, 16 differ only by `let` vs `var` for block-level enums or name-based vs scope-based import removal (shadowed names), 18 rejected (mostly `namespace`, one `this`-in-field-initialiser guard).
Not verified: TSX, very old syntax forms, behaviour on files over several MB, the legacy (`useDefineForClassFields: false`) emit.

## 700 WASM text/binary
Binary reader/printer and WAT parser/assembler. Core MVP instruction set (all 198 opcodes in the table), sign extension, saturating truncation, bulk memory, reference types, multi-value blocks, table ops, passive/declarative element and data segments, names via `$id`, inline imports/exports, folded and flat syntax, memarg `offset=`/`align=`, hex floats, `nan:0x...`.
Not supported (clear error): SIMD, threads/atomics, exceptions, tail calls, GC, multi-memory, 64-bit memory, custom/name sections are skipped, `module` names ignored.
Verification against wabt 1.0.39 (npm build, scratch only):
- Every opcode assembled with our assembler is byte-identical to wat2wasm, and wabt re-assembles our disassembly to the same bytes (198/198).
- 24 hand-written modules (control flow, tables, elem forms, bulk memory, imports with inline exports, data abbreviations): byte-identical, 24/24, and the disassembly round trips through wabt.
- 6,000 random f32/f64 literals: identical.
- Real modules (Rust, wasm-bindgen, yoga, blake3, 1.8 MB and 3.4 MB release builds): our disassembly assembled by wabt equals wabt's own wasm2wat/wat2wasm round trip, and our assembler on our own text gives the same bytes (7 files). One module uses SIMD (rejected with an error), the 11 MB Go module and the 66 MB debug build were too large for wabt.js and were not tried.
Not verified: the wabt spec test suite, WAT written with unusual abbreviations, data segment strings with every escape, `(elem)` forms with `item` wrappers beyond the tested ones.

## 687 AST Explorer
ES2022 script parser producing ESTree nodes with start/end. Compared with acorn 8 (script mode, ecmaVersion 2022): 451/451 files of mathjax-full `js/` and acorn itself identical including positions, 213 more library files identical (the others are ES modules, which both we and acorn-in-script-mode reject), 30 hand-written snippets (classes with private names and static blocks, destructuring, optional chaining, tagged templates, generators, async iteration, ASI cases) identical except unicode escapes in identifiers (unsupported by design).
Not supported: `import`/`export` modules, JSX, TypeScript, HTML comments, unicode escapes in identifiers, hashbang. JSON mode is a plain type/value tree from `JSON.parse`. A CSS/HTML tree explorer was not built.

## 680 JavaScript Obfuscator
Token-level transforms: conservative local renaming (function parameters, var/let/const/function declarations inside functions; skipped for destructuring, arrow parameters, shorthand properties, catch, class/method bodies, top-level names, any code with eval/with/new Function), string array with hex escapes, hex numbers, comment and white space removal, deterministic seed, optional report comment. If the input is inside the built-in parser's subset the output is re-parsed before it is returned.
Verification: 22 programs times 4 option sets executed in node, stdout identical for all 88; acorn.js (246 KB) obfuscated and used to parse four inputs, ASTs identical; wabt's emscripten glue (636 KB) obfuscated, `node --check` passes and the obfuscated module compiled and ran a WAT module. 
Limits: names used only via strings are not found by the eval guard unless eval/with/new Function appear; very large outputs (string array hex escapes grow code about 4x for string-heavy files).

## 588 PGP public-key encryption and decryption
Hand-written: armor and CRC-24, packet parsing (including partial lengths), v4 key parsing, key flags and expiry from binding signatures, RSA PKCS#1 v1.5 with BigInt modular exponentiation (WebCrypto has no raw RSA), Curve25519 ECDH with a hand-written X25519, NIST P-256/384/521 ECDH through WebCrypto, ECDH KDF plus AES key wrap (WebCrypto AES-KW), S2K (types 0, 1, 3) and CFB for protected secret keys, SEIPD v1 with MDC, LibrePGP AEAD (OCB, tag 20) decryption with a hand-written AES and OCB (RFC 7253), zip/zlib decompression with `DecompressionStream`.
Verification with gpg 2.4.4 in both directions (ours encrypts, gpg decrypts; gpg encrypts, ours decrypts; ours to ours): RSA 2048 (passphrase protected) and 3072, Curve25519 (plain and passphrase), NIST P-256, P-384, P-521, 5 message sizes up to 100 KB, gpg default (OCB) and `--rfc4880` (SEIPD v1) output, a two-recipient message decrypted by gpg: 35/35 combinations pass, wrong passphrase and wrong key give clear errors. AES (128/192/256) checked against WebCrypto, OCB against two RFC 7253 vectors (empty message, and 8-byte message with 8-byte AD); a third vector recalled from memory (16-byte case) did not match and may simply be misremembered, so multi-block OCB is confirmed only through gpg messages up to 100 KB.
Obstacle for RFC 9580 (SEIPD v2, PKESK v6, v6 keys): gpg 2.4.4 cannot read or write them and no other OpenPGP implementation is installed, so there is no oracle on this machine. The tool therefore refuses v6 keys and SEIPD v2 with a message instead of guessing.
Not verified: multi-chunk OCB messages above the 4 MiB chunk size, BZip2 (unsupported), CAST5/3DES/Blowfish/Twofish session ciphers (unsupported), signing and signature verification (not built), keys with subkey revocations (revocation signatures only partially considered).
Owner note: the id contains `pgp`, so `site.config.json` already marks it sensitive (the build list confirms). Private keys and passphrases are inputs of this tool.

## 1510 LaTeX Equation Renderer
Parser to a math list, layout with TeX's inter-atom spacing table, TeXbook appendix G rules (scripts, fractions, radicals, limits, delimiters, accents), SVG with system-font text and drawn rules, delimiters, radicals, braces and accents. Glyph widths, heights, depths, italic corrections, font parameters and delimiter sizes were measured from real LaTeX (Computer Modern) and embedded as data (about 35 KB).
Supported: letters, digits, operators, Greek, ~170 symbols, `\frac \dfrac \tfrac \binom \sqrt[n]`, scripts and primes, `\sum \prod \int \oint \iint \lim ...` with limits, named functions, `\left \right \middle`, `\big` sizes, `\text`, font commands, accents, over/underline and braces, `\substack`, `\overset \underset \stackrel`, matrices, `cases`, `array`, `aligned`, spacing commands, style switches.
Not supported: macros, packages, colour, tags, `\cancel`, delimiter sizes as extensible glyph assemblies (drawn as scaled paths), kerning pairs in `\text`.
Verification against real LaTeX (width, height, depth of the formula box, display and inline style), 195 formulas (72 used while tuning plus 123 written afterwards): within 0.02 em on all three values for 70/72 and 70/72 (tuning set, display/inline) and 118/123 and 119/123 (unseen set); mean absolute width error 0.003 to 0.005 em. Remaining differences: `\underset` followed by a control space, kerning in `\text` words, `\sum_{\substack}` depth (0.03 em), `\mathbb` height.
Visual check: screenshot in headless Chrome of 14 formulas and of the tool page (preview iframe works). Glyph shapes come from the viewer's system fonts, so they differ from Computer Modern. Other browsers not checked.

## Build and test
`flock /tmp/ft-build.lock npm run build` : 1878 tools, 0 duplicate titles/descriptions/h1s. `npm test`: 0 failures (smoke 8/8 new tools ran, pages and links pass).

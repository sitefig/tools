// Self-check for src/tools/new09.js against independent oracles (GNU grep, bash globbing, openssl, RFC vectors, Python formulas).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import T, * as M from '../src/tools/new09.js';
const tool = (id) => T.find((t) => t.id === id);
const defs = (t) => Object.fromEntries((t.opts || []).map((o) => [o.id, o.def]));
const run = (id, inputs, opts = {}) => { const t = tool(id); return t.run(inputs, { ...defs(t), ...opts }, []); };
let n = 0; const ok = (m) => { n++; };

// 1. ReDoS: flagged patterns really are slow, unflagged ones are fast
for (const [src, flagged] of [['^(a+)+$', 1], ['^(\\w+\\s?)*$', 1], ['^(a|aa)+$', 1], ['^[a-z0-9._-]+@[a-z0-9.-]+\\.[a-z]{2,}$', 0], ['^(ab+)+$', 0], ['^(\\w+@)+$', 0]]) {
  assert.equal(M.analyseRegex(src, '').length > 0, !!flagged, src); ok();
}
for (const src of ['^(a+)+$', '^(\\w+\\s?)*$']) { const t0 = performance.now(); new RegExp(src).test('a'.repeat(27) + '!'); assert.ok(performance.now() - t0 > 300, 'slow ' + src); ok(); }

// 2. Levenshtein vs independent DP, ops rebuild b from a
const dp = (a, b, osa) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]); for (let j = 0; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) { d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (osa && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); } return d[a.length][b.length]; };
const rs = () => Array.from({ length: Math.floor(Math.random() * 9) }, () => 'abc'[Math.floor(Math.random() * 3)]).join('');
for (let k = 0; k < 300; k++) {
  const a = rs(), b = rs();
  assert.equal(M.lev([...a], [...b], 'lev').dist, dp(a, b, false)); assert.equal(M.lev([...a], [...b], 'osa').dist, dp(a, b, true));
  const r = run('levenshtein-calculator', [a || 'x', b || 'x'], { algo: 'Damerau-Levenshtein (adjacent swap, OSA)' }); assert.match(r, /Distance/); ok();
}
assert.equal(M.lev([...'kitten'], [...'sitting'], 'lev').dist, 3);
// 3. published Jaro / Jaro-Winkler values (Winkler 1990 examples)
const near = (x, y) => assert.ok(Math.abs(x - y) < 0.0006, `${x} vs ${y}`);
near(M.jaro([...'MARTHA'], [...'MARHTA']), 0.944); near(M.jaroWinkler([...'MARTHA'], [...'MARHTA']), 0.961);
near(M.jaro([...'DWAYNE'], [...'DUANE']), 0.822); near(M.jaroWinkler([...'DWAYNE'], [...'DUANE']), 0.84);
near(M.jaro([...'DIXON'], [...'DICKSONX']), 0.767); near(M.jaroWinkler([...'DIXON'], [...'DICKSONX']), 0.813); ok();
assert.match(run('string-similarity-comparer', ['night', 'nacht'], { nocase: true }), /Dice \(character bigrams\)\s+0\.2500/); ok();

// 4. grep vs GNU grep
const gtext = 'alpha\nBeta 404\ngamma\nfoo bar\nfoobar\n404 again\nend\nx\ny\n404';
const dir = mkdtempSync(join(tmpdir(), 'n09-')); writeFileSync(join(dir, 't.txt'), gtext + '\n');
const body = (r) => r.replace(/^\d+ matching lines? of \d+\n\n/, '');
for (const [o, args] of [[{ pat: '404', rx: false, n: true, a: 1, b: 1 }, ['-n', '-C1', '404']], [{ pat: '404', rx: false, n: true, v: true }, ['-n', '-v', '404']], [{ pat: 'foo', rx: false, w: true, n: true }, ['-n', '-w', 'foo']], [{ pat: 'BETA', rx: false, i: true, n: false }, ['-i', 'BETA']], [{ pat: 'o+', rx: true, n: true, a: 0 }, ['-nE', 'o+']], [{ pat: '404', rx: false, n: true, a: 2 }, ['-n', '-A2', '404']]]) {
  const want = execFileSync('grep', args.concat(join(dir, 't.txt'))).toString().trimEnd();
  assert.equal(body(run('grep-lines', [gtext], o)), want); ok();
}
assert.equal(run('grep-lines', [gtext], { pat: '404', rx: false, mode: 'count only' }), execFileSync('grep', ['-c', '404', join(dir, 't.txt')]).toString().trim()); ok();
assert.equal(run('grep-lines', [gtext], { pat: '[0-9]+', rx: true, mode: 'only the matching parts', n: false }), execFileSync('grep', ['-oE', '[0-9]+', join(dir, 't.txt')]).toString().trim()); ok();

// 5. glob vs bash (globstar, extglob)
const files = ['a.js', 'b.ts', 'a.test.js', 'src/x.js', 'src/lib/y.js', 'src/lib/y.ts', 'src/lib/deep/z.md', 'docs/g.md', 'README.md', '.hid', 'src/.hid.js', '.cfg/c.js', 'src/ab.js', 'src/ac.js', 'src/ad.js', 'file1.txt', 'file22.txt', 'fileA.txt'];
const gd = mkdtempSync(join(tmpdir(), 'n09g-')); for (const f of files) { mkdirSync(join(gd, f, '..'), { recursive: true }); writeFileSync(join(gd, f), ''); }
for (const p of ['*.js', 'src/*.js', 'src/**/*.js', '**/*.md', '*.{js,ts}', 'src/a[bc].js', 'src/a[!bc].js', 'file?.txt', 'file[0-9]*.txt', 'src/**/y.*', '*.@(js|ts)', 'src/lib/*.+(js|ts)', '**/*.js', 'docs/*', '?(a).js']) {
  const bash = spawnSync('bash', ['-c', `shopt -s globstar extglob nullglob; eval 'for f in ${p}; do [ -f "$f" ] && echo "$f"; done' | sort`], { cwd: gd }).stdout.toString().trim().split('\n').filter(Boolean).sort();
  const mine = files.filter((f) => /MATCH/.test(run('glob-pattern-tester', [p, f]).split('\n').find((l) => l.endsWith(f) || l.includes('  ' + f)) || '')).sort();
  assert.deepEqual(mine, bash, p); ok();
}

// 6. IP extractor vs node:net
const ipsample = 'a 1.2.3.4 b 256.1.1.1 c 01.2.3.4 d ::1 e 2001:db8::ff00:42:8329 f 1::2::3 g ::ffff:1.2.3.4 h fe80::1%eth0 i 1:2:3:4:5:6:7:8 j 1:2:3:4:5:6:7:8:9 k 12345::1';
const found = run('ip-address-extractor', [ipsample], { counts: false }).split('\n').slice(2).filter((l) => /^[0-9a-f:.]+$/i.test(l));
for (const f of found) assert.ok(net.isIP(f), f);
for (const w of ['1.2.3.4', '::1', '2001:db8::ff00:42:8329', '::ffff:1.2.3.4', 'fe80::1', '1:2:3:4:5:6:7:8']) assert.ok(found.includes(w), w);
for (const w of ['256.1.1.1', '01.2.3.4', '1::2::3', '12345::1']) assert.ok(!found.includes(w), w); ok();

// 7. TOTP RFC 6238 vectors (SHA1 secret ASCII 12345678901234567890, 8 digits)
const sec = new TextEncoder().encode('12345678901234567890');
for (const [t, c] of [[59, '94287082'], [1111111109, '07081804'], [1234567890, '89005924'], [20000000000, '65353130']]) assert.equal(await M.totpAt(sec, t, { digits: 8 }), c);
assert.equal(await M.totpAt(new TextEncoder().encode('12345678901234567890123456789012'), 59, { digits: 8, algo: 'SHA-256' }), '46119246'); ok();
const q = await run('totp-qr-builder', [''], { secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' });
assert.match(q.text, /^otpauth:\/\/totp\/Example%20Corp:alice%40example\.com\?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Example%20Corp&algorithm=SHA1&digits=6&period=30/); ok();

// 8. KSUID: Segment README example
assert.equal(M.ksuidEncode(M.ksuidDecode('0ujtsYcgvSTl8PAuAdqWYSMnLOv')), '0ujtsYcgvSTl8PAuAdqWYSMnLOv');
assert.match(run('ksuid-tool', ['0ujtsYcgvSTl8PAuAdqWYSMnLOv']), /Unix 1507608047, KSUID timestamp 107608047[\s\S]*payload: B5A1CD34B5F99D1154FB6853345C9735/);
for (const id of run('ksuid-tool', [''], { count: 20 }).split('\n').slice(0, 20)) assert.match(id, /^[0-9A-Za-z]{27}$/); ok();

// 8b. ULID: spec example and our generator, against an independent Python decode
const pyU = (id) => execFileSync('python3', ['-c', 'import sys;A="0123456789ABCDEFGHJKMNPQRSTVWXYZ";v=0\nfor c in sys.argv[1]: v=v*32+A.index(c)\nprint(v>>80, format(v&((1<<80)-1),"020X"))', id]).toString().trim().split(' ');
const uid = ['01ARZ3NDEKTSV4RRFFQ69G5FAV', ...(await import('../src/tools/gen.js')).default.find((x) => x.id === 'ulid-generator').run(['', ''], { count: 5, lower: false }).split('\n').slice(0, 5)];
for (const id of uid) { const [ms, rnd] = pyU(id), r = M.ulidDecode(id); assert.equal(r.ms, +ms); assert.equal(r.rand, rnd); }
assert.equal(new Date(M.ulidDecode('01ARZ3NDEKTSV4RRFFQ69G5FAV').ms).toISOString(), '2016-07-30T23:54:10.259Z'); ok();
// 9. Snowflake: build IDs with the published formulas and decode them
const mk = (ms, a, b, s, ep, ba, bb) => ((BigInt(ms) - BigInt(ep)) << BigInt(12 + ba + bb)) | (BigInt(a) << BigInt(12 + bb)) | (BigInt(b) << 12n) | BigInt(s);
const idT = mk(1656432460105, 11, 26, 5, 1288834974657, 5, 5);
assert.match(run('snowflake-id-decoder', [String(idT)], { preset: Object.keys({ 'Twitter / X (epoch 2010-11-04, 5+5+12 bits)': 1 })[0] }), /2022-06-28T16:07:40\.105Z[\s\S]*datacenter id: 11 {3}worker id: 26 {3}sequence: 5/);
const dsc = run('snowflake-id-decoder', ['175928847299117063'], { preset: 'Discord (epoch 2015-01-01, 5+5+12 bits)' });
assert.match(dsc, /2016-04-30T11:18:25\.796Z/); ok();

// 10. entropy vs formula
const h = (s) => { const c = {}; for (const x of s) c[x] = (c[x] || 0) + 1; return -Object.values(c).reduce((a, v) => a + (v / s.length) * Math.log2(v / s.length), 0); };
for (const s of ['aaaa', 'abcd', 'hello', 'correct horse']) assert.match(run('entropy-calculator', [s]), new RegExp(`entropy: ${h(s).toFixed(3).replace('.', '\\.')} bits per symbol`)); ok();

// 11. keys vs openssl
const od = mkdtempSync(join(tmpdir(), 'n09k-'));
for (const curve of ['P-256', 'P-384', 'P-521']) {
  const r = await run('ecdsa-key-generator', ['', ''], { curve });
  const priv = r.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/)[0], pub = r.match(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/)[0];
  writeFileSync(join(od, 'k.pem'), priv);
  const text = execFileSync('openssl', ['pkey', '-in', join(od, 'k.pem'), '-text', '-noout']).toString();
  assert.match(text, new RegExp({ 'P-256': 'prime256v1', 'P-384': 'secp384r1', 'P-521': 'secp521r1' }[curve]));
  assert.equal(execFileSync('openssl', ['pkey', '-in', join(od, 'k.pem'), '-pubout']).toString().trim(), pub);
  const jw = JSON.parse(r.match(/Private JWK:\n([\s\S]*?)\n\nPublic JWK/)[1]);
  const back = await run('jwk-pem-converter', [JSON.stringify(jw)]);
  assert.equal(back.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/)[0], priv); assert.equal(back.match(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/)[0], pub);
  const j2 = JSON.parse(await run('jwk-pem-converter', [priv]).then((x) => x.split('\n\nThe "kid"')[0])); assert.equal(j2.d, jw.d); assert.equal(j2.x, jw.x); ok();
}
// RSA: openssl key -> JWK -> PEM, both PKCS#8 and PKCS#1 inputs
execFileSync('openssl', ['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', join(od, 'r8.pem')], { stdio: 'ignore' });
execFileSync('openssl', ['rsa', '-in', join(od, 'r8.pem'), '-traditional', '-out', join(od, 'r1.pem')], { stdio: 'ignore' });
const r8 = execFileSync('cat', [join(od, 'r8.pem')]).toString(), r1 = execFileSync('cat', [join(od, 'r1.pem')]).toString();
const jr8 = JSON.parse((await run('jwk-pem-converter', [r8])).split('\n\nThe "kid"')[0]), jr1 = JSON.parse((await run('jwk-pem-converter', [r1])).split('\n\nThe "kid"')[0]);
assert.deepEqual(jr8, jr1);
const modHex = execFileSync('openssl', ['rsa', '-in', join(od, 'r8.pem'), '-modulus', '-noout']).toString().trim().split('=')[1];
assert.equal(Buffer.from(jr8.n, 'base64url').toString('hex').toUpperCase(), modHex);
const rb = await run('jwk-pem-converter', [JSON.stringify(jr8)]);
assert.equal(rb.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/)[0], r8.trim());
assert.equal(rb.match(/-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----/)[0], r1.trim()); ok();

// 12. random IP, date, number, file
const inCidr = (ip, c) => { const [b, l] = c.split('/'); const f = (s) => s.split('.').reduce((a, x) => a * 256 + +x, 0); const m = 2 ** (32 - +l); return Math.floor(f(ip) / m) === Math.floor(f(b) / m); };
for (const ip of run('random-ip-generator', ['', ''], { scope: 'inside my CIDR block', cidr: '10.1.2.0/24', count: 50 }).split('\n').slice(0, 50)) assert.ok(inCidr(ip, '10.1.2.0/24'));
const special = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4'];
for (const ip of run('random-ip-generator', ['', ''], { count: 300 }).split('\n').slice(0, 300)) assert.ok(!special.some((c) => inCidr(ip, c)), ip);
for (const ip of run('random-ip-generator', ['', ''], { ver: 'IPv6', count: 20 }).split('\n').slice(0, 20)) assert.equal(net.isIPv6(ip), true);
for (const d of run('random-date-generator', ['', ''], { start: '2024-03-01', end: '2024-03-10', count: 6, week: true }).split('\n')) { const w = new Date(d + 'T00:00:00Z'); assert.ok(w >= new Date('2024-03-01') && w <= new Date('2024-03-10') && w.getUTCDay() % 6 !== 0, d); }
for (const v of run('random-number-generator', ['', ''], { min: '-5', max: '5', count: 200, uniq: false }).split('\n').slice(0, 200)) assert.ok(+v >= -5 && +v <= 5 && Number.isInteger(+v));
assert.equal(new Set(run('random-number-generator', ['', ''], { min: '1', max: '20', count: 20, uniq: true }).split('\n').slice(0, 20)).size, 20);
const df = run('dummy-file-generator', ['', ''], { size: 3, unit: 'KB (1000)', fill: 'random bytes' }); assert.equal(df.blob[0].size, 3000);
assert.equal(run('dummy-file-generator', ['', ''], { size: 2.5, unit: 'MiB (1024^2)', fill: 'repeating text' }).blob[0].size, 2621440); ok();
console.log(`new09 self-check: ${n} groups passed`);

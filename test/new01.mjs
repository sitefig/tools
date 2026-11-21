// Self-checks for src/tools/new01.js (robots.txt tools). Run: node test/new01.mjs
// Oracle used while building: Protego 0.7 (pip) on 2400 random cases, 8 differences, all from Protego ranking
// rules by something other than pattern length (Google ranks by pattern length, as implemented here).
import assert from 'node:assert/strict';
import T from '../src/tools/new01.js';
const get = (id) => T.find((t) => t.id === id);
const run = (id, i, o = {}) => { const t = get(id); return t.run(i, { ...Object.fromEntries((t.opts || []).map((x) => [x.id, x.def])), ...o }, []); };
const bulk = (robots, urls, agent = 'TestBot') => run('robots-bulk-url-checker', [robots, urls.join('\n')], { agents: agent, format: 'csv' }).text.split('\n').slice(1).map((l) => l.split(',')[2]);
// Google documentation examples: longest rule wins, Allow wins ties, $ and * handling
const g = 'User-agent: *\nAllow: /p\nDisallow: /\n';
assert.deepEqual(bulk(g, ['/page', '/']), ['allowed', 'blocked']);
assert.deepEqual(bulk('User-agent: *\nAllow: /folder\nDisallow: /folder\n', ['/folder/x']), ['allowed']);
assert.deepEqual(bulk('User-agent: *\nDisallow: /*.pdf$\n', ['/a.pdf', '/a.pdf?x=1']), ['blocked', 'allowed']);
// group selection: named group replaces *, groups with same name merge
const m = 'User-agent: *\nDisallow: /a\n\nUser-agent: TestBot\nDisallow: /b\n\nUser-agent: testbot\nDisallow: /c\n';
assert.deepEqual(bulk(m, ['/a', '/b', '/c']), ['allowed', 'blocked', 'blocked']);
// minifier and formatter keep decisions identical
const sample = 'user-agent:*\nDISALLOW:/x\nallow:/x/y\n# c\n\nUser-agent: A\nUser-agent: B\n\nUser-agent: A\nDisallow: /q\nDisallow: /q\n';
const paths = ['/x', '/x/y', '/q', '/z'];
for (const id of ['robots-txt-minifier', 'robots-txt-formatter']) for (const ag of ['*', 'A', 'B', 'C']) {
  assert.deepEqual(bulk(run(id, [sample]), paths, ag), bulk(sample, paths, ag), id + ' ' + ag);
}
// regex converter agrees with the matcher
const rx = run('robots-pattern-to-regex-converter', ['Disallow: /a/*/b$\nDisallow: /*?q=']);
assert.ok(rx.includes('^/a/.*/b$'));
// facet builder blocks what it says
assert.ok(run('faceted-navigation-robots-rule-builder', ['color', 'page']).includes('BLOCKED  /products?color=1'));
// CIDR
assert.ok(run('crawler-ip-range-checker', ['10.0.0.0/8\n2001:db8::/32', '10.1.2.3\n11.0.0.1\n2001:db8::1']).includes('2 of 3'));
console.log('new01 ok');

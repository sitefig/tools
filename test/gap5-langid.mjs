// Checks src/gap5lib/langid.js against the reference fastText predictor (python fasttext-predict, fixture test/fixtures/gap5-langid-oracle.json).
import { readFileSync } from 'node:fs';
import { getModel, predict } from '../src/gap5lib/langid.js';
const O = JSON.parse(readFileSync(new URL('./fixtures/gap5-langid-oracle.json', import.meta.url))), M = await getModel();
let fail = 0;
for (const c of O) {
  const r = predict(M, c.t, 3);
  const bad = r.some((x, i) => x.lang !== c.top[i][0] || Math.abs(x.prob - c.top[i][1]) > 1e-4);
  if (bad) { fail++; console.error('FAIL', JSON.stringify(c.t), JSON.stringify(r), JSON.stringify(c.top)); }
}
console.log(fail ? fail + ' failures' : `all ${O.length} ok`); process.exit(fail ? 1 : 0);

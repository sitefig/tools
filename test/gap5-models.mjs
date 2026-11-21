// Checks src/gap5lib/distilbert.js against transformers/PyTorch fp32 reference output (test/fixtures/gap5-models-oracle.json).
// Run: node test/gap5-models.mjs   (loads two ~68 MB models from data/, ~1 min)
import { readFileSync } from 'node:fs';
import { getModel, fillMask, answer } from '../src/gap5lib/distilbert.js';
const O = JSON.parse(readFileSync(new URL('./fixtures/gap5-models-oracle.json', import.meta.url)));
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.error('FAIL', m); } };
const M = await getModel('mlm'), Q = await getModel('qa');
for (const k of ['mlm', 'qa']) for (const t of O.tok[k]) { const got = (k === 'mlm' ? M : Q).tok(t.t).ids; ok(JSON.stringify(got) === JSON.stringify(t.ids), `tokenizer ${k}: ${t.t}\n ${got}\n ${t.ids}`); }
let top1 = 0, n = 0, dmax = 0;
for (const c of O.mlm) {
  const r = await fillMask(M.model, M.tok, c.text, 5);
  r.forEach((m, i) => { const ref = c.top[i]; n++; if (m.top[0].token === ref[0][0]) top1++; else console.log('top1 differs', c.text, m.top[0].token, ref[0][0]);
    const names = new Set(m.top.map((x) => x.token)); ok(ref.slice(0, 3).every((x) => names.has(x[0])), 'top3 of ' + c.text);
    dmax = Math.max(dmax, Math.abs(m.top[0].prob - ref[0][1])); });
}
console.log(`fill-mask: top-1 agrees ${top1}/${n}, max |dp| on top-1 = ${dmax.toFixed(4)}`);
ok(top1 >= n - 1 && dmax < 0.05, 'fill-mask agreement');
for (const c of O.qa) {
  const r = await answer(Q.model, Q.tok, c.q, c.c);
  console.log(`qa: "${c.q}" -> "${r.answer}" (${r.score.toFixed(3)}; ref "${c.answer}" ${c.score.toFixed(3)})`);
  ok(r.answer === c.answer && r.start === c.start && r.end === c.end, 'qa ' + c.q);
}
console.log(fail ? fail + ' failures' : 'all ok'); process.exit(fail ? 1 : 0);

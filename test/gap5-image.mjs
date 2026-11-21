// Checks src/gap5lib/imageclass.js against PyTorch/timm on deterministic synthetic tensors (test/fixtures/gap5-image-oracle.json).
import { readFileSync } from 'node:fs';
import { getModel, forward, topK } from '../src/gap5lib/imageclass.js';
const O = JSON.parse(readFileSync(new URL('./fixtures/gap5-image-oracle.json', import.meta.url))), { H } = await getModel();
let fail = 0;
for (const c of O) {
  const x = new Float32Array(3 * 224 * 224); for (let i = 0; i < x.length; i++) { const cc = Math.floor(i / 50176), y = Math.floor(i / 224) % 224, xx = i % 224, s = c.seed; x[i] = 0.9 * Math.sin(0.05 * xx + 0.9 * s + cc) + 0.7 * Math.cos(0.031 * y * (1 + 0.3 * s)) + 0.4 * Math.sin(0.011 * xx * y / (1 + s)); }
  const lg = await forward(H, x), top = topK(lg, 5).map((t) => t.index), sum = lg.reduce((a, b) => a + b, 0);
  const dmax = Math.max(...c.l0.map((v, i) => Math.abs(v - lg[i])));
  console.log(`seed ${c.seed}: top5 ${top.join(',')} (oracle ${c.top.join(',')}), logit sum ${sum.toFixed(3)} vs ${c.sum.toFixed(3)}, max |dlogit| first 5 = ${dmax.toExponential(2)}`);
  if (top.join() !== c.top.join() || dmax > 0.05 || Math.abs(sum - c.sum) > 2) { fail++; console.error('FAIL seed', c.seed); }
}
console.log(fail ? fail + ' failures' : 'all ok'); process.exit(fail ? 1 : 0);

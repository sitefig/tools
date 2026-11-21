// ai-sentiment-classifier: our WordPiece + DistilBERT engine vs PyTorch/transformers (fixtures made by an independent Python
// reimplementation of the .bin loader feeding the HF model; see data/SOURCES.md). Run: node test/sentiment.mjs
import { readFileSync } from 'node:fs';
import { getModel, forward, verdict } from '../src/tools/sentiment.js';
const fx = JSON.parse(readFileSync(new URL('./fixtures/sentiment-oracle.json', import.meta.url), 'utf8'));
const { tok, model } = await getModel();
let fail = 0, dDeq = 0, dFp = 0, flips = 0;
for (const f of fx) {
  const ids = tok(f.text).ids;
  if (JSON.stringify(ids) !== JSON.stringify(f.ids)) { console.error('TOKEN MISMATCH', JSON.stringify(f.text.slice(0, 40)), ids.slice(0, 12), f.ids.slice(0, 12)); fail++; continue; }
  const lg = await forward(model, ids);
  const e1 = Math.max(Math.abs(lg[0] - f.deq[0]), Math.abs(lg[1] - f.deq[1])), e2 = Math.max(Math.abs(lg[0] - f.fp32[0]), Math.abs(lg[1] - f.fp32[1]));
  dDeq = Math.max(dDeq, e1); dFp = Math.max(dFp, e2);
  if (e1 > 1e-2) { console.error('LOGIT MISMATCH vs dequantised oracle', e1, f.text.slice(0, 40)); fail++; }
  if (verdict(lg).label !== verdict(f.fp32).label) { flips++; if (Math.abs(f.fp32[1] - f.fp32[0]) > 0.5) { console.error('flip on a confident text', f.text.slice(0, 40)); fail++; } }
}
if (dFp > 0.5) { console.error('int8 error vs fp32 too large', dFp); fail++; }
console.log(`sentiment: ${fx.length} sentences, max |engine - torch(dequantised)| = ${dDeq.toExponential(2)}, max |engine - torch(fp32)| = ${dFp.toFixed(3)}, label flips vs fp32 = ${flips} (borderline texts only), ${fail} failed`);
process.exit(fail ? 1 : 0);

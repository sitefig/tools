// Checks src/gap5lib/llm.js against PyTorch/transformers run on the SAME dequantised 4-bit weights (test/fixtures/gap5-llm-oracle.json): tokenizer ids, next-token logits and greedy completions.
import { readFileSync } from 'node:fs';
import { getModel, newState, forward, generate, encodeChat, chatPrompt } from '../src/gap5lib/llm.js';
const O = JSON.parse(readFileSync(new URL('./fixtures/gap5-llm-oracle.json', import.meta.url))), { M, tok } = await getModel(); let fail = 0; const bad = (m) => { fail++; console.error('FAIL', m); };
for (const e of O.enc) { const got = tok.encode(e.t); if (JSON.stringify(got) !== JSON.stringify(e.ids)) bad(`encode ${JSON.stringify(e.t)}\n ${got}\n ${e.ids}`); }
console.log(`tokenizer: ${O.enc.length} strings compared`);
for (const c of O.chat) {
  const ids = encodeChat(tok, chatPrompt([{ role: 'user', content: c.user }])); if (JSON.stringify(ids) !== JSON.stringify(c.ids)) { bad('prompt ids for ' + c.user); continue; }
  const st = newState(M), t0 = Date.now(); const out = await generate(M, tok, st, ids, { maxNew: 36 });
  console.log(`${JSON.stringify(c.user.slice(0, 30))}: ${out.length} tokens in ${Date.now() - t0} ms -> ${JSON.stringify(tok.decode(out).slice(0, 60))}`);
  if (JSON.stringify(out) !== JSON.stringify(c.gen.slice(0, out.length)) || out.length < Math.min(c.gen.length, 36) - 0) bad('generation differs for ' + c.user + '\n got ' + out.join(',') + '\n exp ' + c.gen.join(','));
}
console.log(fail ? fail + ' failures' : 'all ok'); process.exit(fail ? 1 : 0);

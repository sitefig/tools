// Node smoke test: runs every non-dom tool on its sample; checks contract + unique ids.
import { resolve } from 'node:path';
const tools = process.argv[2] ? (await import(resolve(process.argv[2]))).default : (await import('../src/tools/index.js')).default;
const ids = new Set(); let fail = 0, ran = 0, skipped = 0;
for (const t of tools) {
  const bad = (m) => { console.error(`FAIL ${t.id}: ${m}`); fail++; };
  if (!t.id || !t.cat || !t.title || !t.desc) { bad('missing id/cat/title/desc'); continue; }
  if (ids.has(t.id)) { bad('duplicate id'); continue; }
  ids.add(t.id);
  if (t.render || t.dom || t.file) { skipped++; continue; }
  if (t.sample == null) { bad('missing sample'); continue; }
  try {
    const r = await t.run([t.sample, t.sample2 ?? ''], Object.fromEntries((t.opts || []).map((o) => [o.id, o.def])), []);
    const s = typeof r === 'string' ? r : r?.text ?? r?.html;
    if (r == null || (typeof r === 'string' && !r) || (typeof r === 'object' && s == null && !r.blob && !r.canvas)) bad('empty result');
    ran++;
  } catch (e) { bad('threw ' + e.message); }
}
console.log(`${tools.length} tools, ${ran} ran, ${skipped} skipped (dom/file/custom), ${fail} failed`);
process.exit(fail ? 1 : 0);

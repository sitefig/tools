#!/usr/bin/env node
// free-tools CLI: runs the same tool functions as the website, locally. Zero dependencies.
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { categories, describe, loadTools, run, runnable, search } from './runner.mjs';

const HELP = `free-tools: ${'run the free browser tools from the terminal'}

  ft search <words...> [--category C] [--limit N]   find tools
  ft list [--category C]                            list all runnable tools (id, title)
  ft categories                                     category names with counts
  ft info <id>                                      inputs, options, sample
  ft run <id> [options]                             run a tool

run options:
  -i, --input TEXT        first input (or pipe it on stdin, or use --input-file)
      --input-file PATH   read first input from a file
  -2, --input2 TEXT       second input, for tools that take two
  -o, --opt KEY=VALUE     tool option (repeatable); see "ft info <id>"
  -f, --file PATH         file input (repeatable); must be inside the current folder or FT_ALLOWED_DIRS
      --sample            use the tool's built-in sample as input
      --out DIR           where generated files go (default $FT_OUT_DIR or the temp folder)
      --json              print JSON ({ text, html, files }) instead of plain text

Nothing is sent over the network. Environment: FT_ALLOWED_DIRS (extra folders for --file), FT_OUT_DIR.`;

const die = (m) => { console.error(m); process.exit(1); };
const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') { console.log(HELP); process.exit(0); }

async function stdinText() {
  if (process.stdin.isTTY) return undefined;
  const chunks = []; for await (const c of process.stdin) chunks.push(c);
  const s = Buffer.concat(chunks).toString('utf8');
  return s.length ? s : undefined;
}

try {
  if (cmd === 'search') {
    const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { category: { type: 'string' }, limit: { type: 'string', default: '20' } } });
    const r = await search(positionals.join(' '), { category: values.category, limit: Number(values.limit) });
    if (!r.length) die('No matching tools.');
    for (const t of r) console.log(`${t.id}\t${t.title}  [${t.category}]`);
  } else if (cmd === 'list') {
    const { values } = parseArgs({ args: rest, options: { category: { type: 'string' } } });
    for (const t of await search('', { category: values.category, limit: 100000 })) console.log(`${t.id}\t${t.title}`);
  } else if (cmd === 'categories') {
    for (const c of await categories()) console.log(`${c.count}\t${c.name}`);
  } else if (cmd === 'info') {
    const t = (await loadTools()).get(rest[0]);
    if (!t) die(`Unknown tool "${rest[0]}".`);
    console.log(JSON.stringify(describe(t), null, 2));
  } else if (cmd === 'run') {
    const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: {
      input: { type: 'string', short: 'i' }, 'input-file': { type: 'string' }, input2: { type: 'string', short: '2' },
      opt: { type: 'string', short: 'o', multiple: true }, file: { type: 'string', short: 'f', multiple: true },
      sample: { type: 'boolean' }, out: { type: 'string' }, json: { type: 'boolean' } } });
    const id = positionals[0]; if (!id) die('Usage: ft run <id> [options]');
    const options = Object.fromEntries((values.opt || []).map((kv) => { const i = kv.indexOf('='); if (i < 1) die(`--opt needs KEY=VALUE, got "${kv}"`); return [kv.slice(0, i), kv.slice(i + 1)]; }));
    let input = values.input;
    if (input === undefined && values['input-file']) input = await readFile(values['input-file'], 'utf8');
    if (input === undefined && !values.sample) input = await stdinText();
    const r = await run(id, { input, input2: values.input2, options, files: values.file || [], useSample: values.sample, outDir: values.out });
    if (values.json) console.log(JSON.stringify(r, null, 2));
    else {
      if (r.text != null) console.log(r.text);
      else if (r.html != null) console.log(r.html);
      for (const f of r.files) console.error(`wrote ${f.path} (${f.type}, ${f.bytes} bytes)`);
    }
  } else die(`Unknown command "${cmd}".\n\n${HELP}`);
} catch (e) { die(`error: ${e.message}`); }

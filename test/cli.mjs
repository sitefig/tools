// CLI/MCP layer: every runnable tool works through the shared runner on its sample, the CLI prints, and the MCP server speaks the protocol.
import { spawn, spawnSync } from 'node:child_process';
import { loadTools, run, runnable } from '../cli/runner.mjs';

let fail = 0;
const bad = (m) => { console.error('FAIL ' + m); fail++; };
const tools = [...(await loadTools()).values()];

// 1. every pure tool (what smoke.mjs runs) also runs through the runner; dom/file tools only count when they work, never fail the test
let ok = 0, browserOnly = 0, skipped = 0;
for (const t of tools) {
  if (!runnable(t)) { skipped++; continue; }
  const pure = !t.dom && !t.file;
  try { await run(t.id, { useSample: true, outDir: '/tmp/ft-test-out' }); ok++; }
  catch (e) {
    if (pure) bad(`${t.id}: ${e.message}`);
    else browserOnly++;
  }
}
console.log(`runner: ${ok} tools ran on their sample, ${browserOnly} dom/file tools need a browser or a file, ${skipped} interactive tools skipped`);

// 2. CLI
const ft = (args, input) => spawnSync('node', ['cli/ft.mjs', ...args], { input, encoding: 'utf8' });
let r = ft(['run', 'json-format', '-o', 'indent=4'], '{"a":1}');
if (r.status !== 0 || !/^\{\n    "a": 1\n\}/.test(r.stdout)) bad('cli json-format: ' + r.stdout + r.stderr);
r = ft(['search', 'jwt', 'decode']);
if (!/^jwt-decode\t/m.test(r.stdout)) bad('cli search jwt decode');
r = ft(['run', 'json-format', '-o', 'nope=1', '-i', '{}']);
if (r.status === 0) bad('cli accepted an unknown option');
r = ft(['run', 'pdf-info', '-f', '/etc/passwd']);
if (r.status === 0 || !/outside the allowed/.test(r.stderr)) bad('cli read a file outside the allowed folders');

// 3. MCP over stdio
const p = spawn('node', ['cli/mcp.mjs']);
let buf = ''; const pend = new Map(); let n = 0;
p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); pend.get(m.id)?.(m); } });
const rpc = (method, params) => new Promise((res) => { const id = ++n; pend.set(id, res); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
if (init.result?.serverInfo?.name !== 'free-tools') bad('mcp initialize');
const list = await rpc('tools/list');
if (list.result.tools.map((t) => t.name).join() !== 'search_tools,list_categories,get_tool,run_tool') bad('mcp tools/list');
const call = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result;
let c = await call('run_tool', { id: 'base64-encode', input: 'hello' });
if (!c.content[0].text.includes('aGVsbG8=')) bad('mcp run_tool base64: ' + JSON.stringify(c));
c = await call('run_tool', { id: 'game-2048' });
if (!c.isError) bad('mcp ran an interactive tool');
c = await call('run_tool', { id: 'pdf-info', files: ['/etc/passwd'] });
if (!c.isError || !/outside the allowed/.test(c.content[0].text)) bad('mcp read outside allowed folders');
c = await call('search_tools', { query: 'gpt tokens' });
if (!/gpt-token-counter/.test(c.content[0].text)) bad('mcp search gpt tokens');
if ((await rpc('nope')).error?.code !== -32601) bad('mcp unknown method');
p.kill();

console.log(fail ? `cli/mcp: ${fail} failed` : 'cli/mcp: all checks passed');
process.exit(fail ? 1 : 0);

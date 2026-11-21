#!/usr/bin/env node
// Local MCP server (stdio, newline-delimited JSON-RPC 2.0) over the same runner as the CLI.
// Four meta-tools instead of ~800 tool definitions, so it costs the model almost no context.
// Runs each tool in a worker thread with a hard timeout. No dependencies, no network.
import { Worker } from 'node:worker_threads';
import { createInterface } from 'node:readline';
import { allowedRoots, categories, describe, loadTools, search } from './runner.mjs';

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const TIMEOUT_MS = Number(process.env.FT_TIMEOUT_MS) || 60000;
const MAX_TEXT = Number(process.env.FT_MAX_TEXT) || 100000;

const TOOLS = [
  { name: 'search_tools', description: 'Find tools among ~1,700 local, offline utilities (formatters, converters, encoders, hashes, SEO and privacy checks, PDF/image helpers, code generators, tokenizers, calculators). Returns ids to use with get_tool / run_tool.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'What you want to do, e.g. "json to yaml", "jwt decode", "count gpt tokens"' }, category: { type: 'string', description: 'Optional category filter, see list_categories' }, limit: { type: 'number', description: 'Max results (default 15)' } }, required: ['query'] }, annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: 'list_categories', description: 'List tool categories with the number of tools in each.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: 'get_tool', description: 'Describe one tool: what its inputs are, its options (with defaults and allowed values), whether it takes a file, and a sample input.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: 'run_tool', description: 'Run a tool locally on the given input and return its result. Generated files (images, zips, PDFs) are written to disk and their paths returned. Input never leaves this machine. Use get_tool first if you are unsure about options.',
    inputSchema: { type: 'object', properties: {
      id: { type: 'string', description: 'Tool id from search_tools' },
      input: { type: 'string', description: 'First text input' }, input2: { type: 'string', description: 'Second text input, only for tools that take two' },
      options: { type: 'object', description: 'Option values by option id, as listed by get_tool', additionalProperties: true },
      files: { type: 'array', items: { type: 'string' }, description: `File paths for tools that take files. Must be inside: ${allowedRoots().join(', ')}` },
      use_sample: { type: 'boolean', description: 'Run on the tool\'s built-in sample input' } }, required: ['id'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
];

const text = (s, isError = false) => ({ content: [{ type: 'text', text: s }], ...(isError ? { isError: true } : {}) });
const fmt = (r) => r.map((t) => `${t.id} - ${t.title} [${t.category}]: ${t.description}`).join('\n');

function runInWorker(args) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { id: args.id, input: args.input, input2: args.input2, options: args.options || {}, files: args.files || [], useSample: !!args.use_sample } });
    const timer = setTimeout(() => { w.terminate(); reject(new Error(`Timed out after ${TIMEOUT_MS / 1000}s`)); }, TIMEOUT_MS);
    w.once('message', (m) => { clearTimeout(timer); m.error ? reject(new Error(m.error)) : resolve(m.result); });
    w.once('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

async function callTool(name, a = {}) {
  try {
    if (name === 'search_tools') {
      const r = await search(String(a.query || ''), { category: a.category, limit: Math.min(Number(a.limit) || 15, 50) });
      return text(r.length ? fmt(r) : 'No matching tools. Try other words or list_categories.');
    }
    if (name === 'list_categories') return text((await categories()).map((c) => `${c.name} (${c.count})`).join('\n'));
    if (name === 'get_tool') {
      const t = (await loadTools()).get(String(a.id));
      return t ? text(JSON.stringify(describe(t), null, 2)) : text(`Unknown tool "${a.id}". Use search_tools.`, true);
    }
    if (name === 'run_tool') {
      const r = await runInWorker(a);
      let out = r.text ?? (r.html != null ? `[HTML preview]\n${r.html}` : '');
      if (out.length > MAX_TEXT) out = out.slice(0, MAX_TEXT) + `\n...[truncated, ${out.length - MAX_TEXT} more characters; raise FT_MAX_TEXT or use the CLI]`;
      if (r.files?.length) out += `${out ? '\n\n' : ''}Files written:\n${r.files.map((f) => `${f.path} (${f.type}, ${f.bytes} bytes)`).join('\n')}`;
      return text(out || '(empty result)');
    }
    return text(`Unknown tool "${name}"`, true);
  } catch (e) { return text(`Error: ${e.message}`, true); }
}

async function handle(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize': {
      const v = VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : VERSIONS[0];
      return { protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'free-tools', version: '1.0.0' },
        instructions: 'Local, offline developer/SEO/privacy utilities. Call search_tools to find one, get_tool for its options, run_tool to execute it. Nothing is sent over the network.' };
    }
    case 'ping': return {};
    case 'tools/list': return { tools: TOOLS };
    case 'tools/call': return callTool(params?.name, params?.arguments);
    default: { const e = new Error(`Method not found: ${method}`); e.code = -32601; throw e; }
  }
}

const send = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const rl = createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  if (msg.id === undefined) return; // notification (e.g. notifications/initialized): no reply
  try { send({ jsonrpc: '2.0', id: msg.id, result: await handle(msg) }); }
  catch (e) { send({ jsonrpc: '2.0', id: msg.id, error: { code: e.code || -32603, message: e.message } }); }
});
rl.on('close', () => process.exit(0));

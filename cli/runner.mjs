// Shared Node runner: the same tool.run() functions the web pages use, behind one small API
// for the CLI (cli/ft.mjs) and the MCP server (cli/mcp.mjs). No dependencies.
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, delimiter, extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Tools lazily fetch same-origin data files with fetch(new URL(rel, import.meta.url)); Node's fetch has no file: support.
const realFetch = globalThis.fetch;
globalThis.fetch = (u, init) => {
  const url = typeof u === 'string' || u instanceof URL ? new URL(u) : null;
  if (url && url.protocol === 'file:') {
    return readFile(fileURLToPath(url)).then((b) => new Response(b, { status: 200 }), () => new Response('not found', { status: 404 }));
  }
  return realFetch(u, init);
};

let cache;
export async function loadTools() {
  if (!cache) {
    const all = (await import(pathToFileURL(join(ROOT, 'src/tools/index.js')))).default;
    cache = new Map(all.map((t) => [t.id, t]));
  }
  return cache;
}

let meta;
function loadMeta() { // keywords + intro from the page content, used only for search ranking
  if (meta) return meta;
  meta = new Map();
  const dir = join(ROOT, 'content/en');
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try { const c = JSON.parse(readFileSync(join(dir, f), 'utf8')); meta.set(c.id || f.slice(0, -5), { kw: (c.keywords || []).join(' '), intro: c.intro || '' }); } catch { /* skip bad file */ }
  }
  return meta;
}

export const runnable = (t) => !t.render && !t.custom;
export const inputCount = (t) => (t.inputs === undefined ? 1 : t.inputs);

export function describe(t) {
  return {
    id: t.id, title: t.title, category: t.cat, description: t.desc,
    runnable: runnable(t),
    needsBrowser: runnable(t) && !!t.dom ? 'may need browser APIs (DOM/canvas); fails with a clear message if so' : undefined,
    inputs: Array.from({ length: inputCount(t) }, (_, i) => ({ name: i === 0 ? 'input' : `input${i + 1}`, label: t.labels?.[i] || `Input ${i + 1}` })),
    file: t.file ? { accept: t.file.accept, multiple: !!t.file.multiple, optional: !!t.file.optional } : undefined,
    options: (t.opts || []).map((o) => ({ id: o.id, label: o.label, type: o.type, default: o.def, choices: o.choices })),
    sample: t.sample, sample2: t.sample2,
  };
}

export async function search(query = '', { category, limit = 20 } = {}) {
  const tools = [...(await loadTools()).values()].filter((t) => runnable(t));
  const m = loadMeta(), words = query.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean);
  const cat = category?.toLowerCase();
  const scored = [];
  for (const t of tools) {
    if (cat && !t.cat.toLowerCase().includes(cat)) continue;
    if (!words.length) { scored.push([0, t]); continue; }
    const id = t.id.toLowerCase(), ti = t.title.toLowerCase(), de = t.desc.toLowerCase(), x = m.get(t.id), kw = (x?.kw || '').toLowerCase(), c = t.cat.toLowerCase();
    let s = 0;
    for (const w of words) {
      const hit = (id.includes(w) ? 4 : 0) + (ti.includes(w) ? 4 : 0) + (kw.includes(w) ? 3 : 0) + (c.includes(w) ? 1 : 0) + (de.includes(w) ? 1 : 0);
      if (!hit) { s = 0; break; } // every word must match somewhere
      s += hit;
    }
    if (id === query.toLowerCase()) s += 20;
    if (s) scored.push([s, t]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].id.localeCompare(b[1].id));
  return scored.slice(0, limit).map(([, t]) => ({ id: t.id, title: t.title, category: t.cat, description: t.desc }));
}

export async function categories() {
  const n = new Map();
  for (const t of (await loadTools()).values()) if (runnable(t)) n.set(t.cat.replace(/\+$/, ''), (n.get(t.cat.replace(/\+$/, '')) || 0) + 1);
  return [...n].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
}

function coerce(o, v) {
  if (o.type === 'checkbox') return typeof v === 'boolean' ? v : /^(1|true|yes|on)$/i.test(String(v));
  if (o.type === 'number') { const n = Number(v); if (!Number.isFinite(n)) throw new Error(`Option "${o.id}" must be a number`); return n; }
  if (o.type === 'select') { const s = String(v); if (o.choices && !o.choices.some((c) => String(c.value ?? c) === s)) throw new Error(`Option "${o.id}" must be one of: ${o.choices.map((c) => c.value ?? c).join(', ')}`); return s; }
  return String(v);
}

// Roots a file path must be inside: the working directory plus FT_ALLOWED_DIRS (path-delimited).
export function allowedRoots() {
  return [process.cwd(), ...(process.env.FT_ALLOWED_DIRS || '').split(delimiter).filter(Boolean)].map((p) => resolve(p));
}
async function readAllowed(p) {
  const real = await realpath(resolve(p)).catch(() => { throw new Error(`File not found: ${p}`); });
  const ok = await Promise.all(allowedRoots().map((r) => realpath(r).catch(() => r)));
  if (!ok.some((r) => real === r || real.startsWith(r + sep))) throw new Error(`File is outside the allowed folders (${allowedRoots().join(', ')}). Set FT_ALLOWED_DIRS to allow more.`);
  return { name: basename(real), bytes: await readFile(real) };
}

const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/svg+xml': '.svg', 'image/webp': '.webp', 'application/pdf': '.pdf', 'application/zip': '.zip', 'text/plain': '.txt', 'application/json': '.json', 'audio/wav': '.wav', 'image/gif': '.gif' };
const safeName = (s) => String(s || 'output').replace(/[^\w.-]+/g, '_').slice(0, 80);

export async function run(id, { input, input2, inputs, options = {}, files = [], useSample = false, outDir } = {}) {
  const t = (await loadTools()).get(id);
  if (!t) throw new Error(`Unknown tool "${id}". Use search to find the id.`);
  if (!runnable(t)) throw new Error(`"${id}" is an interactive tool with its own UI and can only be used in the browser.`);
  const n = inputCount(t), given = inputs || [input, input2];
  const vals = Array.from({ length: Math.max(n, 1) }, (_, i) => {
    const v = given[i];
    if (v !== undefined && v !== null) return String(v);
    return useSample ? String(i === 0 ? t.sample ?? '' : t.sample2 ?? '') : '';
  });
  if (n > 0 && !vals[0].trim() && String(t.sample ?? '').trim() && !(t.file && (files.length || t.file.optional))) throw new Error(`"${id}" needs input (${t.labels?.[0] || 'text'}). Pass it, or use the sample.`);
  const opts = Object.fromEntries((t.opts || []).map((o) => [o.id, o.def]));
  for (const [k, v] of Object.entries(options)) {
    const o = (t.opts || []).find((x) => x.id === k);
    if (!o) throw new Error(`Unknown option "${k}" for ${id}. Options: ${(t.opts || []).map((x) => x.id).join(', ') || 'none'}`);
    opts[k] = coerce(o, v);
  }
  if (t.file && !t.file.optional && !files.length) throw new Error(`"${id}" needs a file (${t.file.accept}).`);
  if (!t.file && files.length) throw new Error(`"${id}" does not take files.`);
  const fl = [];
  for (const f of files) { const { name, bytes } = await readAllowed(f); fl.push(new File([bytes], name)); }
  let r;
  try { r = await t.run(vals, opts, fl); } catch (e) {
    if (e instanceof ReferenceError && /DOMParser|document|window|Image|canvas|OffscreenCanvas|createImageBitmap|HTMLElement|navigator/i.test(e.message)) throw new Error(`"${id}" needs browser APIs (${e.message}); use it on the website.`);
    throw e;
  }
  if (r == null) throw new Error('The tool returned nothing');
  if (typeof r === 'string') return { text: r, files: [] };
  if (r.canvas && !r.blob && r.text == null && r.html == null) throw new Error(`"${id}" draws to a canvas and needs a browser.`);
  const out = { text: r.text, html: r.html, files: [] };
  const blobs = r.blob ? (Array.isArray(r.blob) ? r.blob : [r.blob]) : [];
  if (blobs.length) {
    const dir = resolve(outDir || process.env.FT_OUT_DIR || join(tmpdir(), 'free-tools-out'));
    await mkdir(dir, { recursive: true });
    let i = 0;
    for (const b of blobs) {
      const base = safeName(Array.isArray(r.filename) ? r.filename[i] : r.filename) || id;
      const name = extname(base) ? base : base + (EXT[b.type] || '');
      const path = join(dir, blobs.length > 1 && !Array.isArray(r.filename) ? `${i + 1}-${name}` : name);
      const bytes = new Uint8Array(await b.arrayBuffer());
      await writeFile(path, bytes);
      out.files.push({ path, name: basename(path), type: b.type || 'application/octet-stream', bytes: bytes.length });
      i++;
    }
  }
  return out;
}

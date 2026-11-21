// Tool page bootstrap: import ONLY this tool's module, mount it. Strings come from /i18n/<lang>.json.
import { mountTool } from './mount.js';

// Tools copy with navigator.clipboard.writeText; fall back to execCommand when the write is denied.
if (navigator.clipboard?.writeText) {
  const write = navigator.clipboard.writeText.bind(navigator.clipboard);
  navigator.clipboard.writeText = (s) => write(s).catch(() => {
    const a = document.createElement('textarea');
    a.value = s; a.style.cssText = 'position:fixed;opacity:0';
    document.body.append(a); a.select();
    try { if (!document.execCommand('copy')) throw new Error('copy denied'); } finally { a.remove(); }
  });
}

const root = document.getElementById('tool-root');
const lang = document.documentElement.lang || 'en';
let strings = {};
try { strings = await (await fetch(`/i18n/${lang}.json`)).json(); } catch { /* keys are shown instead of text */ }
const t = (k, v = {}) => (strings[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');

try {
  const mod = await import(`/src/tools/${root.dataset.module}.js`);
  const tool = mod.default.find((x) => x.id === root.dataset.tool);
  if (!tool) throw new Error('tool not found');
  await mountTool(tool, root, { t, sensitive: root.dataset.sensitive === '1' });
} catch (e) {
  console.error(e);
  const p = document.createElement('p');
  p.setAttribute('role', 'alert');
  p.textContent = t('tool.loadError');
  root.replaceChildren(p);
}

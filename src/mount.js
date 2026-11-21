// Generic tool mounting: builds the form from the declaration (TOOLS.md), runs it, renders results, keeps the URL in sync.
import { toSearch, fromSearch } from './urlstate.js';
import { watch } from './a11y.js';

export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (['value', 'checked', 'selected', 'multiple', 'disabled', 'textContent'].includes(k)) e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.flat().filter((x) => x != null));
  return e;
}

let uid = 0;
const nextId = (p) => `${p}-${++uid}`;
const later = (fn, ms) => { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.cancel = () => clearTimeout(t); return f; };

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function setUrl(search) {
  try { history.replaceState(null, '', location.pathname + search + location.hash); } catch { /* sandboxed: ignore */ }
}

export function mountTool(tool, root, ctx) {
  const { t, sensitive } = ctx;
  root.replaceChildren();
  return tool.render ? mountCustom(tool, root, ctx) : mountForm(tool, root, ctx);
}

/* ------------------------------------------------------------------ custom render() tools */
async function mountCustom(tool, root, { t }) {
  const box = h('div', { class: 'tool-panel tool-panel__custom', role: 'group', 'aria-label': t('a11y.toolRegion', { title: tool.title }) });
  root.append(box);
  try { await tool.render(box); }
  catch (e) { box.append(h('p', { role: 'alert', 'data-state': 'error' }, t('mount.error', { message: String(e?.message || e) }))); }
  watch(box, { title: tool.title, t });

  const hook = tool.urlState;
  if (!hook || typeof hook.get !== 'function') return;
  const status = h('p', { class: 'status', role: 'status' });
  const sync = later(async () => { try { const s = await hook.get(); setUrl(s && Object.keys(s).length ? await toSearch({ s }) : ''); } catch { /* ignore */ } }, 400);
  const share = h('button', { type: 'button', class: 'btn', onclick: async () => {
    const s = await hook.get();
    status.textContent = (await copyText(location.origin + location.pathname + await toSearch({ s }))) ? t('mount.shared') : t('mount.shareFailed');
  } }, t('mount.share'));
  root.append(h('div', { class: 'cluster', style: 'margin-block-start:var(--space-s)' }, share, status));
  box.addEventListener('input', sync); box.addEventListener('change', sync); box.addEventListener('click', sync);
  if (location.search) {
    try { const st = await fromSearch(location.search); if (st?.s !== undefined) await hook.set(st.s); }
    catch { status.textContent = t('mount.urlInvalid'); }
  }
}

/* ------------------------------------------------------------------ generic form tools */
async function mountForm(tool, root, { t, sensitive }) {
  const n = tool.inputs ?? 1;
  const opts = tool.opts || [];
  const optIds = opts.map((o) => o.id);
  const id = nextId('tool');
  const defaults = Array.from({ length: n }, (_, i) => String((i === 0 ? tool.sample : i === 1 ? tool.sample2 : '') ?? ''));

  const fields = [];
  const areas = Array.from({ length: n }, (_, i) => {
    const ta = h('textarea', { id: `${id}-i${i}`, spellcheck: 'false', autocomplete: 'off', rows: tool.rows || 8, placeholder: tool.placeholder?.[i] || '', value: defaults[i] });
    const label = tool.labels?.[i] || (n > 1 ? t('mount.inputN', { n: i + 1 }) : t('mount.input'));
    fields.push(h('div', { class: 'field' }, h('label', { for: ta.id }, label), ta));
    return ta;
  });

  const optEls = opts.map((o, k) => {
    const oid = `${id}-o${k}`;
    let el;
    if (o.type === 'select') el = h('select', { id: oid }, ...o.choices.map((c) => h('option', { value: String(c), selected: c === o.def }, String(c))));
    else el = h('input', { id: oid, type: o.type || 'text', autocomplete: 'off', ...(o.type === 'checkbox' ? { checked: !!o.def } : { value: o.def ?? '' }) });
    const field = o.type === 'checkbox'
      ? h('div', { class: 'field field--check' }, el, h('label', { for: oid }, o.label))
      : h('div', { class: 'field' }, h('label', { for: oid }, o.label), el);
    return { o, el, field };
  });
  const ser = (o, el) => (o.type === 'checkbox' ? (el.checked ? '1' : '0') : String(el.value));
  const optDefaults = Object.fromEntries(optEls.map(({ o, el }) => [o.id, ser(o, el)]));

  let fileEl = null;
  if (tool.file) {
    fileEl = h('input', { id: `${id}-file`, type: 'file', accept: tool.file.accept || '', multiple: !!tool.file.multiple });
    fields.push(h('div', { class: 'field' }, h('label', { for: fileEl.id }, tool.file.multiple ? t('mount.files') : t('mount.file')), fileEl));
  }

  const out = h('div', { class: 'output', role: 'region', 'aria-label': t('mount.result') });
  const status = h('p', { class: 'status', role: 'status' });
  const noteBits = [];
  if (tool.file) noteBits.push(t('mount.fileNote'));
  if (sensitive) noteBits.push(t('mount.sensitiveNote'));
  const note = noteBits.length ? h('p', { class: 'hint', id: `${id}-note` }, noteBits.join(' ')) : null;

  // Results are not a live region (re-reading a whole result on every keystroke is hostile); Run/Reset announce a short status instead.
  const announce = (msg) => { status.textContent = ''; setTimeout(() => { status.textContent = msg; }, 60); };
  const runBtn = h('button', { type: 'button', class: 'btn btn--primary', onclick: async () => { await go(); announce(t('mount.updated')); } }, t('mount.run'));
  const shareBtn = h('button', { type: 'button', class: 'btn', ...(note ? { 'aria-describedby': note.id } : {}), onclick: async () => {
    const search = await toSearch(await state(true));
    status.textContent = (await copyText(location.origin + location.pathname + search)) ? t('mount.shared') : t('mount.shareFailed');
  } }, t('mount.share'));
  const resetBtn = h('button', { type: 'button', class: 'btn', onclick: () => { apply(null); if (fileEl) fileEl.value = ''; setUrl(''); announce(t('mount.resetDone')); go(); } }, t('mount.reset'));

  const form = h('form', { class: 'tool-panel stack', novalidate: '', onsubmit: (e) => { e.preventDefault(); go(); } },
    ...fields,
    optEls.length ? h('fieldset', { class: 'options stack' }, h('legend', {}, t('mount.options')), h('div', { class: 'grid', style: '--min:14rem' }, ...optEls.map((x) => x.field))) : null,
    h('div', { class: 'cluster' }, runBtn, shareBtn, resetBtn),
    status, note);
  root.append(form, out);

  /* ---- state <-> UI */
  function apply(st) {
    areas.forEach((a, i) => { a.value = st?.i?.[i] ?? defaults[i]; });
    for (const { o, el } of optEls) {
      const v = st?.o?.[o.id] ?? optDefaults[o.id];
      if (o.type === 'checkbox') el.checked = v === '1' || v === 'true';
      else el.value = v;
    }
  }
  /** Changed entries only; includeInputs=false for sensitive tools' automatic URL sync. */
  async function state(includeInputs) {
    const s = { i: {}, o: {} };
    if (includeInputs) areas.forEach((a, i) => { if (a.value !== defaults[i]) s.i[i] = a.value; });
    for (const { o, el } of optEls) { const v = ser(o, el); if (v !== optDefaults[o.id]) s.o[o.id] = v; }
    return s;
  }
  let urlSeq = 0;
  const syncUrl = later(async () => { const k = ++urlSeq; const search = await toSearch(await state(!sensitive)); if (k === urlSeq) setUrl(search); }, 400);

  /* ---- running */
  let run = 0, blobs = [];
  async function go() {
    const mine = ++run;
    out.dataset.state = 'busy';
    try {
      const o = Object.fromEntries(optEls.map(({ o: d, el }) => [d.id, d.type === 'checkbox' ? el.checked : d.type === 'number' ? Number(el.value) : el.value]));
      const files = fileEl ? [...fileEl.files] : [];
      if (tool.file && !files.length && !tool.file.optional) { out.replaceChildren(); return; }
      const r = await tool.run(areas.map((a) => a.value), o, files);
      if (mine === run) show(r);
    } catch (e) {
      if (mine === run) out.replaceChildren(h('pre', { role: 'alert', 'data-state': 'error' }, t('mount.error', { message: String(e?.message || e) })));
    } finally { if (mine === run) delete out.dataset.state; }
  }
  const goSoon = later(go, 150);
  const onEdit = () => { goSoon(); syncUrl(); };
  areas.forEach((a) => a.addEventListener('input', onEdit));
  optEls.forEach(({ el }) => { el.addEventListener('input', onEdit); el.addEventListener('change', onEdit); });
  if (fileEl) fileEl.addEventListener('change', async () => { await go(); announce(t('mount.updated')); });

  function show(r) {
    blobs.forEach((u) => URL.revokeObjectURL(u)); blobs = [];
    out.replaceChildren();
    if (r == null) return;
    if (typeof r === 'string') r = { text: r };
    if (r.html != null) out.append(h('iframe', { sandbox: '', srcdoc: r.html, title: t('mount.resultHtml') }));
    if (r.canvas) { r.canvas.setAttribute('role', 'img'); r.canvas.setAttribute('aria-label', `${t('mount.resultCanvas')}, ${r.canvas.width} x ${r.canvas.height} px`); out.append(r.canvas); }
    for (const b of [].concat(r.blob || [])) {
      const url = URL.createObjectURL(b); blobs.push(url);
      const name = r.filename || b.name || '';
      if (b.type?.startsWith('image/')) { const im = h('img', { src: url, alt: t('mount.resultImage') }); im.addEventListener('load', () => { im.alt = `${t('mount.resultImage')}${name ? ' ' + name : ''}, ${im.naturalWidth} x ${im.naturalHeight} px`; }); out.append(im); }
      if (b.type?.startsWith('audio/')) out.append(h('audio', { controls: '', src: url, 'aria-label': t('mount.resultAudio') }));
      out.append(h('div', { class: 'cluster' }, h('a', { class: 'btn', href: url, download: name || 'download' }, name ? t('mount.download', { name }) : t('mount.downloadDefault'))));
    }
    if (r.text != null) {
      const msg = h('span', { class: 'status', role: 'status' });
      out.append(
        h('div', { class: 'cluster' }, h('button', { type: 'button', class: 'btn', onclick: async () => { msg.textContent = (await copyText(r.text)) ? t('mount.copied') : t('mount.copyFailed'); } }, t('mount.copy')), msg),
        h('pre', { tabindex: '0', role: 'region', 'aria-label': t('mount.resultText') }, r.text));
    }
  }

  watch(root, { title: tool.title, t });

  /* ---- initial state: URL overrides sample/defaults */
  if (location.search) {
    try { const st = await fromSearch(location.search, optIds); if (st) apply(st); }
    catch { status.textContent = t('mount.urlInvalid'); }
  }
  await go();
}

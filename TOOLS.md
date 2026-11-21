# Tool module contract

Each `src/tools/*.js` default-exports an array of tool objects. No dependencies, no build step, ES modules, browser + (for pure tools) Node 22.

```js
{
  id: 'json-format',          // unique, kebab-case, used as #hash
  cat: 'JSON',                // sidebar group
  title: 'JSON Formatter',
  desc: 'One line.',
  inputs: 1,                  // number of textareas (default 1; 0 = none)
  labels: ['JSON'],           // optional label per textarea
  placeholder: ['...'],       // optional
  opts: [{ id:'indent', label:'Indent', type:'number'|'checkbox'|'select'|'text', def:2, choices:[...] /* select only */ }],
  file: { accept:'image/*', multiple:false, optional:false },   // optional file input
  sample: '{"a":1}',          // REQUIRED for pure text tools: default input AND smoke-test input (inputs[0])
  sample2: '...',             // inputs[1] when inputs:2
  dom: true,                  // set when run() needs DOM/canvas/File APIs: smoke test then runs it in a real browser
  run: (inputs, opts, files) => result,   // may be async; throw Error('msg') for user-visible errors
  render: (el) => {},         // OPTIONAL custom UI instead of the generic form (then no run/sample needed; set `custom:true`)
  urlState: { get(), set(obj) }, // OPTIONAL, render tools only: makes the tool shareable by URL (see below)
}
```

`result` is a string, or `{ text?, html?, canvas?, blob?, filename? }`:
- `text`: shown in a <pre> with Copy.
- `html`: full HTML document string shown in a sandboxed iframe (no scripts run), for previews.
- `canvas`: an HTMLCanvasElement.
- `blob`: a Blob (or array of Blobs); images are previewed, all get a download button. `filename` names the download.

Shareable URLs: generic tools get this for free (input `i`, `i2`..., options by id; booleans `1`/`0`). Option ids `i`, `i2`.., `z`, `s` are reserved and get an `o.` prefix in the URL. A tool whose input should never be echoed into the address bar (secrets, keys, tokens, PII) is classified `sensitive` by `site.config.json`, not in the tool. A `render` tool is only shareable if it exposes `urlState`: `get()` returns a JSON-serialisable object of its current state (called ~400 ms after any input/change/click inside the tool), `set(obj)` restores it (called once after `render` has built the UI, with the object from `?s=`; may be async). Without it the page URL is all that is shared.

Accessibility: generic forms are labelled by the shell. Custom `render` UIs are post-processed by `src/a11y.js` (adds missing names/alt/titles/scope, fixes duplicate ids, makes `onclick` divs keyboard-operable), but give controls a `<label>` or `aria-label` yourself where you can.

Accessibility contract for tool authors (the site claims WCAG 2.2 AA, see `content/en/_pages/accessibility.json`): every control needs a real name (give buttons that repeat, such as per-row Delete, an `aria-label` that says which row); anything you can do with a pointer (drag, click a canvas, right-click) needs a keyboard alternative (buttons, number inputs); `addEventListener('click')` on a `div` is invisible to `a11y.js`, use a `<button>`; canvases get `role="img"` plus an `aria-label` that describes their current content; errors use `class="err"` or `role="alert"`; status text (score, timer result, "copied") goes in `role="status"`; colours must work in both themes (`light-dark()` or the CSS variables `--fg`, `--muted`, ...); respect `prefers-reduced-motion` (sandboxed previews that animate get a Pause switch from `a11y.js`); nothing may flash more than 3 times per second by default. `a11y.js` also repairs lost focus when a tool re-renders its UI, makes scrollable regions keyboard-focusable, gives preview iframes `lang`/`title`, and unique frame titles.

Rules: everything client-side, no network requests at all (no fetch, no CDN, no external fonts). Use only platform APIs (crypto.subtle, DOMParser, canvas, Intl, TextEncoder, CompressionStream...). Throw on invalid input with a short message. Never `innerHTML` untrusted input in the app DOM; use the iframe `html` result for previews and escape text yourself.


No third-party code anywhere: everything is hand-written with platform APIs.

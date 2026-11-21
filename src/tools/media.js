// Media, device/sensor, document and image-extra tools. Platform APIs only, no dependencies, no network.
// SKIPPED: battery status (deprecated), letterhead, zip/qr/colour-blind (other modules).
// Everything but audio-db-converter is browser-only (render / dom). Named exports gifEncode and wavEncode are pure (Node-testable).
// Camera/mic/screen streams never leave the page; recordings are offered as local downloads.

const MEDIA = 'Media & Audio', DEV = 'Device & Sensors', DOC = 'Documents', IMG = 'Image Extras';

// ---------- helpers ----------
const el = (t, p = {}, ...k) => {
  const e = document.createElement(t);
  for (const [a, v] of Object.entries(p)) {
    if (a.startsWith('on')) e.addEventListener(a.slice(2), v);
    else if (a === 'style') e.style.cssText = v;
    else if (a in e) e[a] = v;
    else e.setAttribute(a, v);
  }
  e.append(...k.flat().filter((x) => x != null));
  return e;
};
const lab = (text, ...c) => el('label', { style: 'display:inline-block;margin:4px 12px 4px 0' }, text + ' ', ...c);
const row = (...c) => el('div', { className: 'row' }, ...c);
const BIG = 'font:700 48px/1.2 system-ui,sans-serif;margin:12px 0';
const err = (m) => el('pre', { className: 'out err' }, m);
// run fn once when the tool's root has been removed from the page (navigation); no unmount hook exists
const whenGone = (root, fn) => { const i = setInterval(() => { if (!root.isConnected) { clearInterval(i); fn(); } }, 500); };
const AC = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dl = (blob, name) => { const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); };

// ---------- GIF89a encoder ----------
function medianCut(hist, n) { // hist: Uint32Array(32768) of 5-bit-per-channel counts
  const ents = [];
  for (let k = 0; k < 32768; k++) if (hist[k]) ents.push(k);
  const ch = (k, a) => (k >> (10 - 5 * a)) & 31; // a: 0=r 1=g 2=b
  let boxes = [ents];
  while (boxes.length < n) {
    let bi = -1, best = 1;
    boxes.forEach((b, i) => { if (b.length > best) { best = b.length; bi = i; } });
    if (bi < 0) break;
    const b = boxes[bi];
    let axis = 0, rng = -1;
    for (let a = 0; a < 3; a++) {
      let lo = 31, hi = 0;
      for (const k of b) { const v = ch(k, a); if (v < lo) lo = v; if (v > hi) hi = v; }
      if (hi - lo > rng) { rng = hi - lo; axis = a; }
    }
    b.sort((x, y) => ch(x, axis) - ch(y, axis));
    let tot = 0; for (const k of b) tot += hist[k];
    let acc = 0, cut = 1;
    for (let i = 0; i < b.length - 1; i++) { acc += hist[b[i]]; cut = i + 1; if (acc * 2 >= tot) break; }
    boxes.splice(bi, 1, b.slice(0, cut), b.slice(cut));
  }
  return boxes.map((b) => {
    let r = 0, g = 0, bl = 0, t = 0;
    for (const k of b) { const c = hist[k]; r += ch(k, 0) * c; g += ch(k, 1) * c; bl += ch(k, 2) * c; t += c; }
    const x = (v) => { const q = Math.round(v / t); return (q << 3) | (q >> 2); };
    return [x(r), x(g), x(bl)];
  });
}

function lzw(idx, min) {
  const clear = 1 << min, eoi = clear + 1, out = [];
  let size = min + 1, next = eoi + 1, dict = new Map(), cur = 0, nb = 0;
  const emit = (c) => { cur |= c << nb; nb += size; while (nb >= 8) { out.push(cur & 255); cur >>>= 8; nb -= 8; } };
  emit(clear);
  let prefix = idx[0];
  for (let i = 1; i < idx.length; i++) {
    const c = idx[i], key = prefix * 256 + c, v = dict.get(key);
    if (v !== undefined) { prefix = v; continue; }
    emit(prefix);
    if (next < 4096) { dict.set(key, next); if (next === (1 << size) && size < 12) size++; next++; }
    else { emit(clear); dict = new Map(); size = min + 1; next = eoi + 1; }
    prefix = c;
  }
  emit(prefix); emit(eoi);
  if (nb) out.push(cur & 255);
  return out;
}

// frames: RGBA arrays (alpha composited on white). Global palette, quantised with median cut on 5-bit colour.
export function gifEncode(frames, w, h, delayMs = 500, loop = true) {
  const hist = new Uint32Array(32768), key = (r, g, b) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  const flat = (d, i) => { const a = d[i + 3] / 255; return [d[i] * a + 255 * (1 - a), d[i + 1] * a + 255 * (1 - a), d[i + 2] * a + 255 * (1 - a)]; };
  for (const f of frames) for (let i = 0; i < f.length; i += 4) { const [r, g, b] = flat(f, i); hist[key(r, g, b)]++; }
  let pal = medianCut(hist, 256);
  while (pal.length < 256) pal.push([0, 0, 0]);
  const near = new Int16Array(32768).fill(-1);
  const lookup = (k) => {
    if (near[k] >= 0) return near[k];
    const r = ((k >> 10) << 3) | ((k >> 10) >> 2), g = (((k >> 5) & 31) << 3) | (((k >> 5) & 31) >> 2), b = ((k & 31) << 3) | ((k & 31) >> 2);
    let bd = 1e9, bi = 0;
    for (let i = 0; i < pal.length; i++) { const d = (pal[i][0] - r) ** 2 + (pal[i][1] - g) ** 2 + (pal[i][2] - b) ** 2; if (d < bd) { bd = d; bi = i; } }
    return (near[k] = bi);
  };
  const o = [], w16 = (v) => o.push(v & 255, (v >> 8) & 255), str = (s) => { for (const c of s) o.push(c.charCodeAt(0)); };
  str('GIF89a'); w16(w); w16(h); o.push(0xf7, 0, 0);
  for (const c of pal) o.push(...c);
  if (loop) { o.push(0x21, 0xff, 11); str('NETSCAPE2.0'); o.push(3, 1, 0, 0, 0); }
  const cs = Math.max(2, Math.round(delayMs / 10));
  for (const f of frames) {
    o.push(0x21, 0xf9, 4, 4); w16(cs); o.push(0, 0);
    o.push(0x2c); w16(0); w16(0); w16(w); w16(h); o.push(0);
    const idx = new Uint8Array(w * h);
    for (let i = 0, p = 0; p < idx.length; p++, i += 4) { const [r, g, b] = flat(f, i); idx[p] = lookup(key(r, g, b)); }
    o.push(8);
    const data = lzw(idx, 8);
    for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); o.push(n); for (let j = 0; j < n; j++) o.push(data[i + j]); }
    o.push(0);
  }
  o.push(0x3b);
  return Uint8Array.from(o);
}

// ---------- WAV encoder (16-bit PCM) ----------
export function wavEncode(chans, sr) {
  const n = chans[0].length, c = chans.length, buf = new ArrayBuffer(44 + n * c * 2), v = new DataView(buf);
  const s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + n * c * 2, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, c, true); v.setUint32(24, sr, true); v.setUint32(28, sr * c * 2, true);
  v.setUint16(32, c * 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * c * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) { const x = Math.max(-1, Math.min(1, chans[k][i])); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2; }
  return buf;
}

// ---------- shared: document builders (invoice / resume / receipt) ----------
const money = (n) => (+n || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const items = (t) => String(t || '').split('\n').filter((l) => l.trim()).map((l) => {
  const [d, q, p] = l.split('|').map((x) => x.trim());
  return { d, q: q === undefined || q === '' ? 1 : parseFloat(q) || 0, p: parseFloat(p) || 0 };
});
const nl = (s) => esc(s).replace(/\n/g, '<br>');
const PAGE = (css, body) => `<!doctype html><meta charset="utf-8"><style>body{font:14px/1.5 system-ui,Arial,sans-serif;color:#111;margin:32px;}table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;text-align:left}.r{text-align:right}@media print{body{margin:12mm}}${css}</style>${body}`;

function totals(its, taxPct, sym) {
  const sub = its.reduce((s, i) => s + i.q * i.p, 0), tax = sub * (+taxPct || 0) / 100;
  return { sub, tax, total: sub + tax, f: (n) => sym + money(n) };
}
const invoiceHtml = (v) => {
  const its = items(v.items), t = totals(its, v.tax, v.cur);
  return PAGE('h1{margin:0;font-size:32px;letter-spacing:2px}th{border-bottom:2px solid #111}td{border-bottom:1px solid #ddd}.t td{border:0}.hd{display:flex;justify-content:space-between;gap:24px}.m{color:#555}',
    `<div class="hd"><div><h1>INVOICE</h1><div class="m">No. ${esc(v.number)}<br>Date: ${esc(v.date)}<br>Due: ${esc(v.due)}</div></div><div class="r"><b>${nl(v.from)}</b></div></div>
<p class="m" style="margin-top:28px">Bill to</p><p><b>${nl(v.to)}</b></p>
<table><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr>
${its.map((i) => `<tr><td>${esc(i.d)}</td><td class="r">${i.q}</td><td class="r">${t.f(i.p)}</td><td class="r">${t.f(i.q * i.p)}</td></tr>`).join('')}
<tr class="t"><td colspan="3" class="r">Subtotal</td><td class="r">${t.f(t.sub)}</td></tr>
<tr class="t"><td colspan="3" class="r">Tax (${+v.tax || 0}%)</td><td class="r">${t.f(t.tax)}</td></tr>
<tr class="t"><td colspan="3" class="r"><b>Total due</b></td><td class="r"><b>${t.f(t.total)}</b></td></tr></table>
<p class="m" style="margin-top:28px">${nl(v.notes)}</p>`);
};
const receiptHtml = (v) => {
  const its = items(v.items), t = totals(its, v.tax, v.cur);
  return PAGE('body{font-family:"Courier New",monospace;max-width:340px;margin:24px auto}h2{text-align:center;margin:0}.c{text-align:center}hr{border:0;border-top:1px dashed #111}td{padding:2px 0}',
    `<h2>${esc(v.store)}</h2><div class="c">${nl(v.address)}</div><hr><div>${esc(v.date)} &nbsp; Receipt #${esc(v.number)}</div><hr>
<table>${its.map((i) => `<tr><td colspan="2">${esc(i.d)}</td></tr><tr><td>&nbsp;&nbsp;${i.q} x ${t.f(i.p)}</td><td class="r">${t.f(i.q * i.p)}</td></tr>`).join('')}</table><hr>
<table><tr><td>Subtotal</td><td class="r">${t.f(t.sub)}</td></tr><tr><td>Tax (${+v.tax || 0}%)</td><td class="r">${t.f(t.tax)}</td></tr><tr><td><b>TOTAL</b></td><td class="r"><b>${t.f(t.total)}</b></td></tr></table><hr>
<div>Paid by: ${esc(v.method)}</div><p class="c">${nl(v.footer)}</p>`);
};
const resumeHtml = (v) => {
  const blocks = (txt) => String(txt || '').split(/\n\s*\n/).filter((b) => b.trim()).map((b) => {
    const [head, ...rest] = b.trim().split('\n'), [a, c, d] = head.split('|').map((x) => x.trim());
    return `<div class="e"><div class="eh"><b>${esc(a)}</b>${c ? ' &middot; ' + esc(c) : ''}<span>${esc(d)}</span></div><ul>${rest.filter((l) => l.trim()).map((l) => `<li>${esc(l.replace(/^[-*•]\s*/, ''))}</li>`).join('')}</ul></div>`;
  }).join('');
  const sec = (t, h) => (h ? `<h2>${t}</h2>${h}` : '');
  return PAGE('body{max-width:780px;margin:24px auto}h1{margin:0;font-size:34px}.sub{color:#444}h2{font-size:14px;letter-spacing:2px;text-transform:uppercase;border-bottom:2px solid #111;padding-bottom:2px;margin:22px 0 8px}.eh{display:flex;justify-content:space-between}.eh span{color:#555}ul{margin:4px 0 10px;padding-left:20px}',
    `<h1>${esc(v.name)}</h1><div class="sub">${esc(v.title)}</div><div class="sub">${[v.email, v.phone, v.location].filter(Boolean).map(esc).join(' &middot; ')}</div>
${sec('Summary', v.summary ? `<p>${nl(v.summary)}</p>` : '')}${sec('Experience', blocks(v.experience))}${sec('Education', blocks(v.education))}
${sec('Skills', v.skills ? `<p>${String(v.skills).split(',').map((s) => esc(s.trim())).filter(Boolean).join(' &middot; ')}</p>` : '')}`);
};

function docTool(id, title, desc, fields, build) {
  return { id, cat: DOC, title, desc, custom: true, render: (root) => {
    const key = 'ft-' + id, inputs = {};
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch { /* storage unavailable */ }
    const frame = el('iframe', { sandbox: 'allow-same-origin allow-modals', style: 'width:100%;height:760px;border:1px solid #888;background:#fff;margin-top:8px' });
    const upd = () => {
      const v = Object.fromEntries(Object.entries(inputs).map(([k, e]) => [k, e.value]));
      try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
      frame.srcdoc = build(v);
    };
    const form = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px' });
    for (const f of fields) {
      const val = saved[f.id] ?? f.def ?? '';
      const e = f.rows ? el('textarea', { rows: f.rows, value: val, spellcheck: false, style: 'width:100%' }) : el('input', { type: f.type || 'text', value: val, style: 'width:100%', ...(f.ac ? { autocomplete: f.ac } : {}) });
      e.addEventListener('input', upd); inputs[f.id] = e;
      form.append(el('label', { style: f.rows ? 'grid-column:1/-1' : '' }, f.label, el('br'), e));
    }
    root.append(form, row(el('button', { onclick: () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { alert('Printing is blocked here; use Ctrl+P on this page.'); } } }, 'Print / Save as PDF'),
      el('button', { onclick: () => { try { localStorage.removeItem(key); } catch { /* ignore */ } fields.forEach((f) => { inputs[f.id].value = f.def ?? ''; }); upd(); } }, 'Reset')),
    el('small', {}, 'Saved only in this browser. Choose "Save as PDF" in the print dialog to get a PDF.'), frame);
    upd();
  } };
}
const today = () => new Date().toISOString().slice(0, 10);
const ITEMS_DEF = 'Website design | 1 | 1200\nHosting (12 months) | 12 | 15.50';

// ---------- recorders ----------
function recorder(id, title, desc, getStream, withAudioOpt) {
  return { id, cat: MEDIA, title, desc, custom: true, render: (root) => {
    if (!globalThis.MediaRecorder || !navigator.mediaDevices) { root.append(err('MediaRecorder or media devices are not supported in this browser.')); return; }
    let rec, stream, chunks = [];
    const audio = el('input', { type: 'checkbox', checked: true }), status = el('div', { role: 'status' }), live = el('video', { 'aria-label': 'Live preview', muted: true, autoplay: true, playsInline: true, style: 'max-width:100%;max-height:320px;display:none;background:#000' }), out = el('div');
    const stop = () => { if (rec && rec.state !== 'inactive') rec.stop(); };
    const start = el('button', { onclick: async () => {
      out.replaceChildren(); status.textContent = '';
      try {
        stream = await getStream(audio.checked);
        const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
        rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); chunks = [];
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop()); live.style.display = 'none'; live.srcObject = null; start.disabled = false; end.disabled = true; start.focus();
          const blob = new Blob(chunks, { type: 'video/webm' }), url = URL.createObjectURL(blob);
          status.textContent = `Recorded ${(blob.size / 1048576).toFixed(2)} MB`;
          out.replaceChildren(el('video', { src: url, controls: true, style: 'max-width:100%;max-height:360px' }), row(el('a', { href: url, download: id + '.webm', className: 'btn' }, 'Download WebM')));
        };
        stream.getVideoTracks()[0]?.addEventListener('ended', stop);
        live.srcObject = stream; live.style.display = 'block'; rec.start(1000); start.disabled = true; end.disabled = false; end.focus(); status.textContent = 'Recording...';
      } catch (e) { status.textContent = ''; out.replaceChildren(err('Could not start: ' + (e.message || e.name))); }
    } }, 'Start recording');
    const end = el('button', { onclick: stop, disabled: true }, 'Stop');
    root.append(row(start, end, withAudioOpt ? lab('Include audio', audio) : null), status, live, out);
    whenGone(root, () => { stop(); stream?.getTracks().forEach((t) => t.stop()); });
  } };
}

// ---------- morse ----------
const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.' };
const morseSeq = (text, unit) => { // [[on?, ms], ...]
  const seq = [];
  for (const w of text.toUpperCase().split(/\s+/).filter(Boolean)) {
    for (const ch of w) {
      const code = MORSE[ch]; if (!code) continue;
      for (const s of code) { seq.push([1, unit * (s === '.' ? 1 : 3)], [0, unit]); }
      seq.push([0, unit * 2]);
    }
    seq.push([0, unit * 4]);
  }
  return seq;
};

// ---------- tools ----------
const tools = [
  // ===== Image Extras =====
  { id: 'gif-maker', cat: IMG, title: 'GIF Maker', desc: 'Combine several images into an animated GIF (hand-written GIF89a encoder, nothing uploaded).', dom: true,
    inputs: 0, file: { accept: 'image/*', multiple: true },
    opts: [{ id: 'delay', label: 'Frame delay (ms)', type: 'number', def: 500 }, { id: 'width', label: 'Max width (px)', type: 'number', def: 480 }, { id: 'loop', label: 'Loop forever', type: 'checkbox', def: true }],
    run: async (_i, o, files) => {
      if (!files.length) throw new Error('Choose one or more images (frames are used in the order selected).');
      const bmps = await Promise.all(files.map((f) => createImageBitmap(f).catch(() => { throw new Error(f.name + ' is not a readable image'); })));
      const sc = Math.min(1, Math.max(8, o.width || 480) / bmps[0].width), w = Math.max(1, Math.round(bmps[0].width * sc)), h = Math.max(1, Math.round(bmps[0].height * sc));
      if (w > 65535 || h > 65535) throw new Error('Image too large');
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d', { willReadFrequently: true }), frames = [];
      for (const b of bmps) {
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        const s = Math.min(w / b.width, h / b.height), dw = b.width * s, dh = b.height * s;
        ctx.drawImage(b, (w - dw) / 2, (h - dh) / 2, dw, dh);
        frames.push(new Uint8ClampedArray(ctx.getImageData(0, 0, w, h).data));
      }
      const bytes = gifEncode(frames, w, h, Math.max(20, o.delay || 500), o.loop);
      return { text: `${frames.length} frame(s), ${w}x${h}, ${(bytes.length / 1024).toFixed(1)} KB`, blob: new Blob([bytes], { type: 'image/gif' }), filename: 'animation.gif' };
    } },

  { id: 'image-diff', cat: IMG, title: 'Image Diff', desc: 'Compare two images and highlight changed pixels in red, with the percentage changed.', custom: true, render: (root) => {
    const fa = el('input', { type: 'file', accept: 'image/*' }), fb = el('input', { type: 'file', accept: 'image/*' });
    const thr = el('input', { type: 'number', value: 16, min: 0, max: 255, style: 'width:70px' }), out = el('div');
    let n = 0;
    const go = async () => {
      if (!fa.files[0] || !fb.files[0]) return;
      const id = ++n;
      try {
        const [A, B] = await Promise.all([createImageBitmap(fa.files[0]), createImageBitmap(fb.files[0])]);
        const w = A.width, h = A.height, c = (b) => { const k = document.createElement('canvas'); k.width = w; k.height = h; const x = k.getContext('2d', { willReadFrequently: true }); x.drawImage(b, 0, 0, w, h); return x.getImageData(0, 0, w, h); };
        const da = c(A), db = c(B), res = new ImageData(w, h), t = +thr.value || 0;
        let ch = 0;
        for (let i = 0; i < da.data.length; i += 4) {
          const d = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i + 1] - db.data[i + 1]), Math.abs(da.data[i + 2] - db.data[i + 2]), Math.abs(da.data[i + 3] - db.data[i + 3]));
          if (d > t) { res.data.set([255, 0, 0, 255], i); ch++; } else res.data.set([da.data[i] * 0.3 + 178, da.data[i + 1] * 0.3 + 178, da.data[i + 2] * 0.3 + 178, 255], i);
        }
        const cv = el('canvas', { width: w, height: h, className: 'prev' }); cv.getContext('2d').putImageData(res, 0, 0);
        if (id === n) out.replaceChildren(el('p', {}, `${(ch / (w * h) * 100).toFixed(3)}% of pixels changed (${ch.toLocaleString()} of ${(w * h).toLocaleString()})${A.width !== B.width || A.height !== B.height ? '. Second image was resized to match the first.' : ''}`), cv);
      } catch (e) { out.replaceChildren(err(e.message || 'Could not read images')); }
    };
    [fa, fb, thr].forEach((e) => e.addEventListener('input', go));
    root.append(row(lab('Image A', fa), lab('Image B', fb), lab('Tolerance (0-255)', thr)), out);
  } },

  // ===== Media & Audio =====
  { id: 'white-noise-generator', cat: MEDIA, title: 'Noise Generator', desc: 'White, pink or brown noise with volume control. Generated live in your browser.', custom: true, render: (root) => {
    let ctx, src, gain;
    const type = el('select', {}, ...['white', 'pink', 'brown'].map((t) => el('option', { value: t }, t))), vol = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 0.3 });
    const btn = el('button', {}, 'Start');
    const stop = () => { try { src?.stop(); } catch { /* already stopped */ } src = null; btn.textContent = 'Start'; };
    const start = () => {
      ctx ||= AC(); ctx.resume().catch(() => {});
      const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        if (type.value === 'white') d[i] = w;
        else if (type.value === 'pink') { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
        else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      }
      gain ||= Object.assign(ctx.createGain(), {}); gain.gain.value = +vol.value; gain.connect(ctx.destination);
      src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(gain); src.start(); btn.textContent = 'Stop';
    };
    btn.onclick = () => (src ? stop() : start());
    type.onchange = () => { if (src) { stop(); start(); } };
    vol.oninput = () => { if (gain) gain.gain.value = +vol.value; };
    root.append(row(lab('Type', type), lab('Volume', vol), btn));
    whenGone(root, () => { stop(); ctx?.close(); });
  } },

  { id: 'audio-trimmer', cat: MEDIA, title: 'Audio Trimmer', desc: 'Load an audio file, choose start and end, preview and export the clip as WAV.', custom: true, render: (root) => {
    let buf, ctx, src;
    const file = el('input', { type: 'file', accept: 'audio/*' }), cv = el('canvas', { width: 800, height: 120, style: 'width:100%;max-width:800px;background:#111;display:block' });
    const s = el('input', { type: 'number', min: 0, step: 0.01, value: 0, style: 'width:90px' }), e = el('input', { type: 'number', min: 0, step: 0.01, value: 0, style: 'width:90px' });
    const info = el('div'), out = el('div');
    const draw = () => {
      const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
      if (!buf) return;
      const d = buf.getChannelData(0), step = Math.max(1, Math.floor(d.length / W));
      g.fillStyle = '#4af';
      for (let x = 0; x < W; x++) { let mx = 0; for (let i = x * step; i < (x + 1) * step && i < d.length; i += Math.max(1, step >> 6)) mx = Math.max(mx, Math.abs(d[i])); g.fillRect(x, H / 2 - mx * H / 2, 1, Math.max(1, mx * H)); }
      g.fillStyle = 'rgba(255,200,0,.25)'; g.fillRect(+s.value / buf.duration * W, 0, Math.max(1, (+e.value - +s.value) / buf.duration * W), H);
    };
    const range = () => { const a = Math.max(0, +s.value), b = Math.min(buf.duration, +e.value); if (!(b > a)) throw new Error('End must be after start'); return [a, b]; };
    file.onchange = async () => {
      out.replaceChildren(); if (!file.files[0]) return;
      try {
        ctx ||= AC(); buf = await ctx.decodeAudioData(await file.files[0].arrayBuffer());
        s.value = 0; e.value = buf.duration.toFixed(2); e.max = s.max = buf.duration; info.textContent = `${buf.duration.toFixed(2)} s, ${buf.numberOfChannels} ch, ${buf.sampleRate} Hz`; draw();
      } catch { buf = null; draw(); out.replaceChildren(err('Could not decode this audio file.')); }
    };
    [s, e].forEach((x) => x.addEventListener('input', () => buf && draw()));
    const preview = el('button', { onclick: () => { if (!buf) return; try { const [a, b] = range(); src?.stop(); src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start(0, a, b - a); } catch (x) { out.replaceChildren(err(x.message)); } } }, 'Preview');
    const stopB = el('button', { onclick: () => { try { src?.stop(); } catch { /* ignore */ } } }, 'Stop');
    const exp = el('button', { onclick: () => {
      if (!buf) return; out.replaceChildren();
      try {
        const [a, b] = range(), i0 = Math.floor(a * buf.sampleRate), i1 = Math.floor(b * buf.sampleRate);
        const ch = Array.from({ length: buf.numberOfChannels }, (_, k) => buf.getChannelData(k).subarray(i0, i1));
        const blob = new Blob([wavEncode(ch, buf.sampleRate)], { type: 'audio/wav' }), url = URL.createObjectURL(blob);
        out.replaceChildren(el('audio', { src: url, controls: true }), row(el('a', { href: url, download: 'trimmed.wav', className: 'btn' }, `Download trimmed.wav (${(blob.size / 1024).toFixed(0)} KB)`)));
      } catch (x) { out.replaceChildren(err(x.message)); }
    } }, 'Export WAV');
    root.append(row(file), info, cv, row(lab('Start (s)', s), lab('End (s)', e), preview, stopB, exp), out);
    whenGone(root, () => { try { src?.stop(); } catch { /* ignore */ } ctx?.close(); });
  } },

  { id: 'audio-bpm-tap', cat: MEDIA, title: 'Tap Tempo (BPM)', desc: 'Tap the button or press space in rhythm to find the beats per minute.', custom: true, render: (root) => {
    let taps = [];
    const big = el('div', { style: BIG }, '--'), sub = el('div');
    const tap = () => {
      const t = performance.now(); if (taps.length && t - taps[taps.length - 1] > 3000) taps = [];
      taps.push(t); taps = taps.slice(-9);
      if (taps.length > 1) { const bpm = 60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)); big.textContent = bpm.toFixed(1); sub.textContent = `~${Math.round(bpm)} BPM from ${taps.length} taps`; } else sub.textContent = 'Keep tapping...';
    };
    const key = (ev) => { if (!root.isConnected) return removeEventListener('keydown', key); if (ev.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) { ev.preventDefault(); tap(); } };
    addEventListener('keydown', key);
    root.append(big, sub, row(el('button', { onclick: tap, style: 'padding:24px 48px;font-size:22px' }, 'TAP'), el('button', { onclick: () => { taps = []; big.textContent = '--'; sub.textContent = ''; } }, 'Reset')));
  } },

  { id: 'audio-db-converter', cat: MEDIA, title: 'Audio dB Converter', desc: 'Convert between dBFS, dBu, dBV, volts (RMS) and voltage/power ratios.', dom: false, inputs: 0, sample: '',
    opts: [{ id: 'value', label: 'Value', type: 'number', def: -18 }, { id: 'unit', label: 'Unit', type: 'select', choices: ['dBFS', 'dBu', 'dBV', 'volts (RMS)', 'voltage ratio', 'power ratio'], def: 'dBFS' },
      { id: 'fs', label: '0 dBFS = ? dBu', type: 'number', def: 18 }],
    run: (_i, o) => {
      const v = +o.value, U0 = 0.7745966692, fsV = U0 * 10 ** ((+o.fs) / 20); let volts;
      switch (o.unit) {
        case 'dBFS': volts = fsV * 10 ** (v / 20); break;
        case 'dBu': volts = U0 * 10 ** (v / 20); break;
        case 'dBV': volts = 10 ** (v / 20); break;
        case 'volts (RMS)': volts = v; break;
        case 'voltage ratio': volts = v; break;
        default: volts = Math.sqrt(v);
      }
      if (!(volts > 0) || !isFinite(volts)) throw new Error('Enter a positive value (ratio and volts must be above 0).');
      const f = (n) => (Math.round(n * 1e4) / 1e4).toString();
      if (o.unit === 'voltage ratio') return `Voltage ratio ${v}\n  = ${f(20 * Math.log10(v))} dB\nPower ratio ${f(v * v)}`;
      if (o.unit === 'power ratio') return `Power ratio ${v}\n  = ${f(10 * Math.log10(v))} dB\nVoltage ratio ${f(Math.sqrt(v))}`;
      return [`${f(volts)} V RMS (${f(volts * 1000)} mV)`, `${f(20 * Math.log10(volts / U0))} dBu`, `${f(20 * Math.log10(volts))} dBV`, `${f(20 * Math.log10(volts / fsV))} dBFS (with 0 dBFS = ${o.fs} dBu)`,
        `${f(volts * Math.SQRT2)} V peak, ${f(volts * 2 * Math.SQRT2)} V peak-to-peak`].join('\n');
    } },

  { id: 'decibel-meter', cat: MEDIA, title: 'Decibel Meter', desc: 'Live microphone level in dBFS with an adjustable SPL offset. Audio is analysed locally, never recorded.', custom: true, render: (root) => {
    if (!navigator.mediaDevices?.getUserMedia) { root.append(err('Microphone access is not available in this browser.')); return; }
    let stream, ctx, raf, mn = Infinity, mx = -Infinity, sum = 0, cnt = 0;
    const big = el('div', { style: BIG }, '--'), bar = el('div', { style: 'height:100%;width:0;background:#3a6;' }), stats = el('div'), msg = el('div');
    const cal = el('input', { type: 'number', value: 94, style: 'width:70px' });
    const stop = () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); ctx?.close(); stream = ctx = null; btn.textContent = 'Start'; };
    const btn = el('button', { onclick: async () => {
      if (stream) return stop();
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        ctx = AC(); const an = ctx.createAnalyser(); an.fftSize = 2048; ctx.createMediaStreamSource(stream).connect(an);
        const d = new Float32Array(an.fftSize); mn = Infinity; mx = -Infinity; sum = cnt = 0; btn.textContent = 'Stop'; msg.textContent = '';
        const tick = () => {
          an.getFloatTimeDomainData(d); let s = 0; for (const x of d) s += x * x;
          const db = Math.max(-100, 20 * Math.log10(Math.sqrt(s / d.length) || 1e-5)), spl = db + (+cal.value || 0);
          mn = Math.min(mn, db); mx = Math.max(mx, db); sum += db; cnt++;
          big.textContent = db.toFixed(1) + ' dBFS'; bar.style.width = Math.max(0, Math.min(100, (db + 80) * 1.25)) + '%';
          stats.textContent = `~${spl.toFixed(0)} dB SPL (estimate)   min ${mn.toFixed(1)}   avg ${(sum / cnt).toFixed(1)}   max ${mx.toFixed(1)} dBFS`;
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) { msg.replaceChildren(err('Microphone unavailable: ' + (e.message || e.name))); }
    } }, 'Start');
    root.append(row(btn, lab('SPL offset (dB, calibrate with a reference meter)', cal)), big, el('div', { style: 'height:18px;background:#ddd;max-width:600px' }, bar), stats, msg);
    whenGone(root, stop);
  } },

  recorder('screen-recorder', 'Screen Recorder', 'Record your screen or a window to a WebM file. Stays on your device.', (audio) => navigator.mediaDevices.getDisplayMedia({ video: true, audio }), true),
  recorder('webcam-recorder', 'Webcam Recorder', 'Record your webcam (and optionally the microphone) to a WebM file. Stays on your device.', (audio) => navigator.mediaDevices.getUserMedia({ video: true, audio }), true),

  { id: 'tone-generator', cat: MEDIA, title: 'Tone Generator', desc: 'Generate a sine, square, triangle or sawtooth tone at any frequency.', custom: true, render: (root) => {
    let ctx, osc, gain;
    const type = el('select', {}, ...['sine', 'square', 'triangle', 'sawtooth'].map((t) => el('option', { value: t }, t)));
    const f = el('input', { type: 'number', value: 440, min: 20, max: 20000, style: 'width:90px' }), fr = el('input', { type: 'range', min: 20, max: 2000, value: 440 }), vol = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 0.2 });
    const btn = el('button', {}, 'Start');
    const stop = () => { try { osc?.stop(); } catch { /* ignore */ } osc = null; btn.textContent = 'Start'; };
    btn.onclick = () => {
      if (osc) return stop();
      ctx ||= AC(); ctx.resume().catch(() => {}); gain ||= ctx.createGain(); gain.gain.value = +vol.value; gain.connect(ctx.destination);
      osc = ctx.createOscillator(); osc.type = type.value; osc.frequency.value = +f.value || 440; osc.connect(gain); osc.start(); btn.textContent = 'Stop';
    };
    f.oninput = () => { fr.value = f.value; if (osc) osc.frequency.value = +f.value || 440; };
    fr.oninput = () => { f.value = fr.value; f.oninput(); };
    type.onchange = () => { if (osc) osc.type = type.value; };
    vol.oninput = () => { if (gain) gain.gain.value = +vol.value; };
    root.append(row(lab('Wave', type), lab('Frequency (Hz)', f), fr), row(lab('Volume', vol), btn));
    whenGone(root, () => { stop(); ctx?.close(); });
  } },

  { id: 'metronome', cat: MEDIA, title: 'Metronome', desc: 'Click track with adjustable tempo, beats per bar and accented downbeat.', custom: true, render: (root) => {
    let ctx, timer, next, beat = 0;
    const bpm = el('input', { type: 'number', value: 100, min: 20, max: 300, style: 'width:80px' }), bpb = el('input', { type: 'number', value: 4, min: 1, max: 12, style: 'width:60px' });
    const dot = el('div', { style: 'width:80px;height:80px;border-radius:50%;background:#bbb;margin:12px 0' }), btn = el('button', {}, 'Start');
    const click = (t, accent) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = accent ? 1200 : 800; g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.06);
      setTimeout(() => { dot.style.background = accent ? '#e44' : '#4a4'; setTimeout(() => { dot.style.background = '#bbb'; }, 90); }, Math.max(0, (t - ctx.currentTime) * 1000));
    };
    const sched = () => { while (next < ctx.currentTime + 0.12) { click(next, beat === 0); beat = (beat + 1) % Math.max(1, +bpb.value || 4); next += 60 / Math.min(300, Math.max(20, +bpm.value || 100)); } };
    const stop = () => { clearInterval(timer); timer = null; btn.textContent = 'Start'; };
    btn.onclick = () => { if (timer) return stop(); ctx ||= AC(); ctx.resume().catch(() => {}); beat = 0; next = ctx.currentTime + 0.05; timer = setInterval(sched, 25); btn.textContent = 'Stop'; };
    root.append(row(lab('BPM', bpm), lab('Beats per bar', bpb), btn), dot);
    whenGone(root, () => { stop(); ctx?.close(); });
  } },

  // ===== Device & Sensors =====
  { id: 'digital-compass', cat: DEV, title: 'Digital Compass', desc: 'Compass heading from your device orientation sensor (phones and tablets).', custom: true, render: (root) => {
    const dial = el('div', { style: 'width:220px;height:220px;border:4px solid #888;border-radius:50%;position:relative;margin:16px 0;transition:transform .1s' }, ...['N', 'E', 'S', 'W'].map((c, i) => el('b', { style: `position:absolute;left:50%;top:50%;transform:rotate(${i * 90}deg) translateY(-96px) translateX(-50%) ;transform-origin:0 0;${c === 'N' ? 'color:#d33' : ''}` }, c)));
    const needle = el('div', { style: 'position:absolute;left:50%;top:-14px;margin-left:-7px;width:0;height:0;border:7px solid transparent;border-top:0;border-bottom:16px solid #d33' });
    const read = el('div', { style: BIG }, '--'), msg = el('div');
    let got = false;
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const on = (e) => {
      const hd = e.webkitCompassHeading ?? (e.alpha != null && (e.absolute || e.type === 'deviceorientationabsolute') ? (360 - e.alpha) % 360 : null);
      if (hd == null) return; got = true; msg.textContent = '';
      dial.style.transform = `rotate(${-hd}deg)`; read.textContent = `${Math.round(hd)}° ${names[Math.round(hd / 45) % 8]}`;
    };
    const ev = 'ondeviceorientationabsolute' in globalThis ? 'deviceorientationabsolute' : 'deviceorientation';
    const btn = el('button', { onclick: async () => {
      try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission && (await DeviceOrientationEvent.requestPermission()) !== 'granted') { msg.textContent = 'Permission denied.'; return; } } catch (e) { msg.textContent = 'Permission error: ' + e.message; return; }
      addEventListener(ev, on); msg.textContent = 'Waiting for sensor...';
      setTimeout(() => { if (!got) msg.textContent = 'No compass data. This device or browser has no orientation sensor (desktop computers usually do not), or the page is not on HTTPS/localhost.'; }, 2500);
    } }, 'Enable compass');
    root.append(btn, read, el('div', { style: 'position:relative;width:228px' }, dial, needle), msg);
    whenGone(root, () => removeEventListener(ev, on));
  } },

  { id: 'bubble-level', cat: DEV, title: 'Bubble Level', desc: 'Spirit level using your device accelerometer. Lay the phone flat on a surface.', custom: true, render: (root) => {
    const circle = el('div', { style: 'width:240px;height:240px;border:4px solid #888;border-radius:50%;position:relative;margin:16px 0' }, el('div', { style: 'position:absolute;left:50%;top:50%;width:1px;height:100%;background:#aaa;transform:translate(-50%,-50%)' }), el('div', { style: 'position:absolute;left:50%;top:50%;height:1px;width:100%;background:#aaa;transform:translate(-50%,-50%)' }));
    const bub = el('div', { style: 'position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px;border-radius:50%;background:rgba(80,200,80,.7);border:2px solid #272' }); circle.append(bub);
    const read = el('div', { style: BIG.replace('48px', '28px') }, '--'), msg = el('div');
    let ax = 0, ay = 0, cx = 0, cy = 0, got = false;
    const ios = typeof DeviceMotionEvent !== 'undefined' && !!DeviceMotionEvent.requestPermission, sign = ios ? 1 : -1;
    const on = (e) => {
      const g = e.accelerationIncludingGravity; if (!g || g.x == null) return; got = true; msg.textContent = '';
      ax = Math.asin(Math.max(-1, Math.min(1, g.x / 9.81))) * 180 / Math.PI * sign; ay = Math.asin(Math.max(-1, Math.min(1, g.y / 9.81))) * 180 / Math.PI * -sign;
      const x = ax - cx, y = ay - cy, k = 6; // px per degree
      bub.style.transform = `translate(${Math.max(-90, Math.min(90, -x * k))}px,${Math.max(-90, Math.min(90, -y * k))}px)`;
      read.textContent = `X ${x.toFixed(1)}°   Y ${y.toFixed(1)}°`;
    };
    const btn = el('button', { onclick: async () => {
      try { if (ios && (await DeviceMotionEvent.requestPermission()) !== 'granted') { msg.textContent = 'Permission denied.'; return; } } catch (e) { msg.textContent = e.message; return; }
      addEventListener('devicemotion', on); msg.textContent = 'Waiting for sensor...';
      setTimeout(() => { if (!got) msg.textContent = 'No accelerometer data. This device or browser has no motion sensor (desktop computers usually do not) or the page is not served over HTTPS/localhost.'; else msg.textContent = ''; }, 2500);
    } }, 'Enable level');
    root.append(row(btn, el('button', { onclick: () => { cx = ax; cy = ay; } }, 'Calibrate (set zero)')), circle, read, msg);
    whenGone(root, () => removeEventListener('devicemotion', on));
  } },

  { id: 'screen-ruler', cat: DEV, title: 'Screen Ruler', desc: 'On-screen ruler in cm, inches or pixels. Calibrate against a bank card for real-world accuracy.', custom: true, render: (root) => {
    const ppcm = el('input', { type: 'number', value: (96 / 2.54).toFixed(2), step: 0.01, min: 5, max: 200, style: 'width:90px' });
    const unit = el('select', {}, ...['cm', 'in', 'px'].map((u) => el('option', { value: u }, u)));
    const card = el('div', { style: 'border:2px solid #36c;border-radius:8px;background:rgba(51,102,204,.12);margin:8px 0;display:flex;align-items:center;justify-content:center;color:inherit' }, 'Match this box to a bank card (85.6 x 54 mm)');
    const wrap = el('div', { style: 'overflow-x:auto;max-width:100%' }), reading = el('div', { role: 'status' });
    const at = el('input', { type: 'number', min: 0, step: 1, value: 100, style: 'width:90px' });
    const readAt = () => { const px = +at.value || 0, cm = px / Math.max(5, +ppcm.value || 37.8); reading.textContent = `${px.toFixed(0)} px = ${cm.toFixed(2)} cm = ${(cm / 2.54).toFixed(3)} in`; };
    at.addEventListener('input', readAt);
    let ppu = 1, cvs;
    const draw = () => {
      const pc = Math.max(5, +ppcm.value || 37.8), u = unit.value;
      card.style.width = 8.56 * pc + 'px'; card.style.height = 5.398 * pc + 'px';
      ppu = u === 'cm' ? pc : u === 'in' ? pc * 2.54 : 1;
      const len = u === 'cm' ? 30 : u === 'in' ? 12 : 1200, W = Math.round(len * ppu) + 20, H = 80, dpr = globalThis.devicePixelRatio || 1;
      cvs = el('canvas', { role: 'img', 'aria-label': `Ruler, 0 to ${len} ${u}. Use the position field to read a distance.`, width: W * dpr, height: H * dpr, style: `width:${W}px;height:${H}px;background:#fffbe6;cursor:crosshair;display:block` });
      const g = cvs.getContext('2d'); g.scale(dpr, dpr); g.strokeStyle = '#000'; g.fillStyle = '#000'; g.font = '11px sans-serif';
      const sub = u === 'cm' ? 10 : u === 'in' ? 16 : 10, total = u === 'px' ? 120 : len * sub;
      for (let i = 0; i <= total; i++) {
        const x = 10 + (u === 'px' ? i * 10 : i / sub * ppu) + 0.5, major = u === 'px' ? i % 10 === 0 : i % sub === 0, mid = u === 'cm' ? i % 5 === 0 : u === 'in' ? i % 8 === 0 : i % 5 === 0;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, major ? 36 : mid ? 26 : 16); g.stroke();
        if (major) g.fillText(u === 'px' ? i * 10 : i / sub, x + 2, 50);
      }
      cvs.onclick = (ev) => { const px = ev.offsetX - 10, cm = px / pc; reading.textContent = `${px.toFixed(0)} px = ${cm.toFixed(2)} cm = ${(cm / 2.54).toFixed(3)} in`; };
      wrap.replaceChildren(cvs);
    };
    [ppcm, unit].forEach((x) => x.addEventListener('input', draw));
    root.append(row(lab('Unit', unit), lab('Pixels per cm (calibration)', ppcm), lab('Position to read (px from the ruler start)', at)), el('small', {}, 'Default assumes 96 CSS px per inch. Hold a bank card to the screen and change the value until the blue box matches it. Click the ruler, or type a value in the position field, to read a position.'), card, wrap, reading);
    draw();
  } },

  { id: 'flashlight-beacon', cat: DEV, title: 'Screen Flashlight & Beacon', desc: 'Full-screen white light, strobe or Morse (SOS) beacon. Click or press Esc to exit.', custom: true, render: (root) => {
    const mode = el('select', {}, ...['white light', 'strobe', 'morse / SOS'].map((t) => el('option', {}, t)));
    const slow = matchMedia('(prefers-reduced-motion: reduce)').matches, hz = el('input', { type: 'number', value: 2, min: 0.5, max: slow ? 3 : 10, step: 0.5, style: 'width:70px' }), txt = el('input', { value: 'SOS', style: 'width:140px' }), unitMs = el('input', { type: 'number', value: 200, min: 50, max: 1000, style: 'width:70px' });
    let ov, alive = false, startBtn;
    const close = () => { alive = false; ov?.remove(); ov = null; removeEventListener('keydown', esc2); startBtn?.focus(); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };
    const esc2 = (e) => e.key === 'Escape' && close();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const go = async () => {
      ov = el('div', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Screen flashlight. Press Escape or Enter to exit.', tabIndex: 0, style: 'position:fixed;inset:0;z-index:99999;background:#000;display:flex;align-items:flex-end;justify-content:center;color:#888;font:12px sans-serif', onclick: close, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); } } }, 'Click or press Esc to exit');
      document.body.append(ov); ov.focus(); addEventListener('keydown', esc2); try { await ov.requestFullscreen?.(); } catch { /* fullscreen optional */ }
      alive = true; const set = (on) => { if (ov) ov.style.background = on ? '#fff' : '#000'; };
      if (mode.value === 'white light') return set(1);
      if (mode.value === 'strobe') { let on = 0; while (alive) { set(on = !on); await sleep(500 / Math.min(+hz.value || 2, slow ? 3 : 10)); } return; }
      const seq = morseSeq(txt.value || 'SOS', +unitMs.value || 200); if (!seq.length) { set(0); return; }
      while (alive) { for (const [on, ms] of seq) { if (!alive) break; set(on); await sleep(ms); } set(0); await sleep((+unitMs.value || 200) * 6); }
    };
    root.append(row(lab('Mode', mode), lab('Strobe Hz', hz), lab('Morse text', txt), lab('Unit ms', unitMs), startBtn = el('button', { onclick: go }, 'Start')), el('small', {}, 'Warning: strobe and flashing light can trigger photosensitive seizures. Strobe starts at 2 flashes per second' + (slow ? '; your system asks for reduced motion, so it is limited to 3.' : ' and can be raised to 10; do not use it if you or anyone nearby is photosensitive.')));
    whenGone(root, close);
  } },

  { id: 'signature-generator', cat: DOC, title: 'Signature Generator', desc: 'Draw or type a signature and download it as a transparent PNG.', custom: true, render: (root) => {
    const cv = el('canvas', { role: 'img', 'aria-label': 'Signature canvas. Draw with a pointer, or choose Type mode to type your name instead.', width: 700, height: 220, style: 'width:100%;max-width:700px;border:1px dashed #888;touch-action:none;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/16px 16px;display:block' }), g = cv.getContext('2d', { willReadFrequently: true });
    const mode = el('select', {}, el('option', { value: 'draw' }, 'Draw'), el('option', { value: 'type' }, 'Type'));
    const color = el('input', { type: 'color', value: '#111111' }), wd = el('input', { type: 'number', value: 3, min: 1, max: 20, style: 'width:60px' });
    const txt = el('input', { value: 'Your Name' }), font = el('select', {}, ...['Brush Script MT, Segoe Script, cursive', 'Snell Roundhand, Lucida Handwriting, cursive', 'Zapfino, Apple Chancery, cursive', 'Georgia, serif italic'].map((f, i) => el('option', { value: f }, 'Style ' + (i + 1))));
    const typeDraw = () => { g.clearRect(0, 0, cv.width, cv.height); if (mode.value !== 'type') return; g.fillStyle = color.value; g.font = `italic 90px ${font.value}`; g.textBaseline = 'middle'; g.fillText(txt.value, 20, cv.height / 2, cv.width - 40); };
    let down = false;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
    cv.onpointerdown = (e) => { if (mode.value !== 'draw') return; down = true; try { cv.setPointerCapture(e.pointerId); } catch {} const [x, y] = pos(e); g.strokeStyle = color.value; g.lineWidth = +wd.value || 3; g.lineCap = g.lineJoin = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.01, y); g.stroke(); };
    cv.onpointermove = (e) => { if (!down) return; const [x, y] = pos(e); g.lineTo(x, y); g.stroke(); };
    cv.onpointerup = cv.onpointercancel = () => { down = false; };
    mode.onchange = () => { g.clearRect(0, 0, cv.width, cv.height); typeDraw(); };
    [txt, font, color].forEach((x) => x.addEventListener('input', typeDraw));
    const save = () => {
      const { data, width: W, height: H } = g.getImageData(0, 0, cv.width, cv.height); let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      if (x1 < 0) return alert('Nothing to save yet.');
      const p = 10, o = el('canvas', { width: x1 - x0 + 1 + 2 * p, height: y1 - y0 + 1 + 2 * p });
      o.getContext('2d').putImageData(g.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1), p, p);
      o.toBlob((b) => dl(b, 'signature.png'), 'image/png');
    };
    root.append(row(lab('Mode', mode), lab('Colour', color), lab('Pen width', wd), lab('Text', txt), lab('Font', font)), cv,
      row(el('button', { onclick: () => { g.clearRect(0, 0, cv.width, cv.height); typeDraw(); } }, 'Clear'), el('button', { onclick: save }, 'Download transparent PNG')));
  } },

  docTool('invoice-generator', 'Invoice Generator', 'Fill in the form, get a printable invoice. Print or save as PDF; nothing is uploaded.', [
    { id: 'from', label: 'From (your details)', rows: 3, def: 'Your Company\n1 Main Street\nCity' }, { id: 'to', label: 'Bill to', rows: 3, def: 'Client Name\n2 Other Road\nTown' },
    { id: 'number', label: 'Invoice number', def: 'INV-001' }, { id: 'date', label: 'Date', type: 'date', def: today() }, { id: 'due', label: 'Due date', type: 'date', def: today() },
    { id: 'cur', label: 'Currency symbol', def: '$' }, { id: 'tax', label: 'Tax %', type: 'number', def: '0' },
    { id: 'items', label: 'Line items (one per line: description | qty | unit price)', rows: 5, def: ITEMS_DEF }, { id: 'notes', label: 'Notes / payment details', rows: 3, def: 'Payment due within 14 days.' },
  ], invoiceHtml),

  docTool('resume-builder', 'Resume Builder', 'Type your details, get a clean printable one-page resume. Print or save as PDF.', [
    { id: 'name', label: 'Full name', def: 'Jane Doe', ac: 'name' }, { id: 'title', label: 'Headline', def: 'Software Engineer', ac: 'organization-title' }, { id: 'email', label: 'Email', def: 'jane@example.com', ac: 'email' },
    { id: 'phone', label: 'Phone', def: '', ac: 'tel' }, { id: 'location', label: 'Location', def: 'Brussels, Belgium' },
    { id: 'summary', label: 'Summary', rows: 3, def: 'Engineer with 8 years of experience building reliable web products.' },
    { id: 'experience', label: 'Experience (blocks separated by a blank line; first line: Role | Company | Dates; following lines are bullets)', rows: 8, def: 'Senior Engineer | Acme Corp | 2021 - now\n- Led migration to a new platform\n- Mentored four engineers\n\nEngineer | Beta Ltd | 2017 - 2021\n- Built the billing system' },
    { id: 'education', label: 'Education (same format)', rows: 4, def: 'BSc Computer Science | State University | 2013 - 2017' },
    { id: 'skills', label: 'Skills (comma separated)', def: 'JavaScript, Python, SQL, Docker' },
  ], resumeHtml),

  docTool('receipt-generator', 'Receipt Generator', 'Create a simple printable sales receipt. Print or save as PDF.', [
    { id: 'store', label: 'Business name', def: 'Corner Cafe' }, { id: 'address', label: 'Address', rows: 2, def: '12 High Street\nCity' },
    { id: 'number', label: 'Receipt number', def: '0001' }, { id: 'date', label: 'Date', type: 'date', def: today() }, { id: 'cur', label: 'Currency symbol', def: '$' }, { id: 'tax', label: 'Tax %', type: 'number', def: '0' },
    { id: 'method', label: 'Payment method', def: 'Cash' }, { id: 'items', label: 'Items (description | qty | unit price)', rows: 5, def: 'Coffee | 2 | 3.20\nCroissant | 1 | 2.50' }, { id: 'footer', label: 'Footer', rows: 2, def: 'Thank you!' },
  ], receiptHtml),

  { id: 'keyboard-event-viewer', cat: DEV, title: 'Keyboard Event Viewer', desc: 'Press any key to see key, code, keyCode, location and modifier values.', custom: true, render: (root) => {
    const big = el('div', { style: BIG }, 'Press a key'), tbl = el('pre', { className: 'out' }), log = el('pre', { className: 'out' }); const hist = [];
    const on = (e) => {
      if (!root.isConnected) { removeEventListener('keydown', on); removeEventListener('keyup', on); return; }
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
      big.textContent = e.key === ' ' ? 'Space' : e.key;
      tbl.textContent = [`type      ${e.type}`, `key       ${JSON.stringify(e.key)}`, `code      ${e.code}`, `keyCode   ${e.keyCode}`, `which     ${e.which}`, `location  ${e.location} (${['standard', 'left', 'right', 'numpad'][e.location] || '?'})`, `repeat    ${e.repeat}`, `modifiers ${['ctrl', 'shift', 'alt', 'meta'].filter((m) => e[m + 'Key']).join('+') || 'none'}`].join('\n');
      if (e.type === 'keydown') { hist.unshift(`${e.key === ' ' ? 'Space' : e.key}  [${e.code}]`); hist.length = Math.min(hist.length, 12); log.textContent = hist.join('\n'); }
    };
    addEventListener('keydown', on); addEventListener('keyup', on);
    root.append(big, tbl, el('h3', {}, 'History'), log);
  } },

  { id: 'gamepad-tester', cat: DEV, title: 'Gamepad Tester', desc: 'Connect a controller, press a button, and see live button and axis values.', custom: true, render: (root) => {
    const pre = el('pre', { className: 'out' }, 'Connect a controller and press any button...');
    const rumble = el('button', { onclick: () => { for (const p of navigator.getGamepads?.() || []) p?.vibrationActuator?.playEffect?.('dual-rumble', { duration: 300, strongMagnitude: 1, weakMagnitude: 1 }); } }, 'Test vibration');
    const bar = (v) => '#'.repeat(Math.round(Math.abs(v) * 10)).padEnd(10, '.') + (v < 0 ? ' -' : '  ');
    const tick = () => {
      if (!root.isConnected) return;
      const pads = [...(navigator.getGamepads?.() || [])].filter(Boolean);
      if (pads.length) pre.textContent = pads.map((p) => `#${p.index} ${p.id}  (mapping: ${p.mapping || 'none'})\nButtons: ${p.buttons.map((b, i) => (b.pressed ? `[${i}:${b.value.toFixed(2)}]` : `${i}`)).join(' ')}\nAxes:\n${p.axes.map((a, i) => `  ${i} ${bar(a)} ${a.toFixed(3)}`).join('\n')}`).join('\n\n');
      requestAnimationFrame(tick);
    };
    root.append(row(rumble), pre); tick();
    if (!navigator.getGamepads) pre.textContent = 'The Gamepad API is not supported in this browser.';
  } },

  { id: 'screen-info', cat: DEV, title: 'Screen Info', desc: 'Resolution, pixel ratio, colour depth, touch points, orientation and display capabilities.', custom: true, render: (root) => {
    const pre = el('pre', { className: 'out' });
    const mq = (q) => (matchMedia(q).matches ? 'yes' : 'no');
    const upd = () => {
      if (!root.isConnected) return;
      const s = screen, dpr = devicePixelRatio;
      pre.textContent = [`Screen resolution   ${s.width} x ${s.height} CSS px`, `Physical pixels     ${Math.round(s.width * dpr)} x ${Math.round(s.height * dpr)} (approx.)`, `Available area      ${s.availWidth} x ${s.availHeight}`, `Browser viewport    ${innerWidth} x ${innerHeight}`, `Device pixel ratio  ${dpr}`,
        `Colour depth        ${s.colorDepth} bit`, `Pixel depth         ${s.pixelDepth} bit`, `Orientation         ${s.orientation?.type || (innerWidth > innerHeight ? 'landscape' : 'portrait')} (${s.orientation?.angle ?? '?'}°)`,
        `Touch points (max)  ${navigator.maxTouchPoints || 0}`, `Pointer             ${mq('(pointer:fine)') === 'yes' ? 'fine (mouse/trackpad)' : mq('(pointer:coarse)') === 'yes' ? 'coarse (touch)' : 'none'}`, `Hover capable       ${mq('(hover:hover)')}`,
        `Wide gamut (P3)     ${mq('(color-gamut:p3)')}`, `HDR                 ${mq('(dynamic-range:high)')}`, `Dark mode           ${mq('(prefers-color-scheme:dark)')}`, `Reduced motion      ${mq('(prefers-reduced-motion:reduce)')}`].join('\n');
    };
    upd(); addEventListener('resize', upd); screen.orientation?.addEventListener?.('change', upd);
    root.append(pre);
  } },

  { id: 'mouse-click-speed-test', cat: DEV, title: 'Mouse Click Speed Test', desc: 'How many clicks per second can you do? Pick a duration and start clicking.', custom: true, render: (root) => {
    const dur = el('select', {}, ...[5, 10, 30, 60].map((d) => el('option', { value: d }, d + ' s')));
    const area = el('div', { role: 'button', tabIndex: 0, style: 'height:200px;max-width:500px;border:3px dashed #888;display:flex;align-items:center;justify-content:center;user-select:none;cursor:pointer;font:700 22px sans-serif' }, 'Click here to start');
    const res = el('div', { role: 'status', style: BIG }); let n = 0, t0 = 0, timer;
    const finish = () => { clearInterval(timer); timer = null; const s = +dur.value; res.textContent = `${n} clicks = ${(n / s).toFixed(2)} CPS`; area.textContent = 'Click to try again'; n = 0; };
    const hit = () => {
      if (!timer) { n = 0; t0 = performance.now(); res.textContent = ''; timer = setInterval(() => { const left = +dur.value - (performance.now() - t0) / 1000; if (left <= 0) finish(); else area.textContent = `${n} clicks, ${left.toFixed(1)} s left`; }, 50); }
      n++;
    };
    area.onpointerdown = (e) => { if (!e.button) hit(); };
    area.onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); hit(); } };
    area.oncontextmenu = (e) => e.preventDefault();
    root.append(row(lab('Duration', dur)), area, res);
    whenGone(root, () => clearInterval(timer));
  } },
];

export default tools;

// Tools from free-browser-tools.md, batch 20: Color & Palette, Design/Icons/Typography, Video Tools. See TOOLS.md.
// Video tools re-encode in real time: the clip is played in a hidden <video>, each frame is drawn on a canvas and
// canvas.captureStream() + MediaRecorder writes WebM (or MP4 where the browser can). No ffmpeg, no WebCodecs muxer.
// Skipped on purpose: Auto Caption (needs a speech model), Google Fonts / Iconify catalogs (network), Font Identifier,
// MP3 and WOFF2 encoding (no encoder in the platform), handwriting font maker (drawing UI plus font writer).
import { _qr } from './gen.js';
const T = [];
const clamp = (v, a, b) => Math.min(b, Math.max(a, Number.isFinite(+v) ? +v : a));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = (id, label, def) => ({ id, label, type: 'number', def });
const txt = (id, label, def) => ({ id, label, type: 'text', def });
const chk = (id, label, def) => ({ id, label, type: 'checkbox', def });
const sel = (id, label, choices, def) => ({ id, label, type: 'select', choices, def: def ?? choices[0] });
const lines = (s) => String(s).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const hx2 = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
const hexOf = (rgb) => '#' + rgb.map(hx2).join('');

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (['value', 'checked', 'disabled', 'multiple', 'textContent'].includes(k)) e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.flat().filter((x) => x != null));
  return e;
}
function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name }, `Download ${name} (${(blob.size / 1048576).toFixed(2)} MiB)`);
  return a;
}
const baseName = (f) => (f && f.name ? f.name.replace(/\.[^.]+$/, '') : 'output');

// ---------- store-only ZIP writer (for bulk downloads) ----------
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zipStore(entries) { // [{name, data:Uint8Array}]
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const { name, data } of entries) {
    const nb = enc.encode(name), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(lh.buffer), nb, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const csize = central.reduce((s, x) => s + x.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

// ---------- real-time video engine ----------
const MIMES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
function supportedMimes() { return typeof MediaRecorder === 'undefined' ? [] : MIMES.filter((m) => MediaRecorder.isTypeSupported(m)); }
function pickMime(pref) {
  const ok = supportedMimes();
  if (!ok.length) throw new Error('This browser has no MediaRecorder video support');
  if (pref === 'mp4') return ok.find((m) => m.startsWith('video/mp4')) || (() => { throw new Error('This browser cannot record MP4. Choose WebM.'); })();
  return ok.find((m) => m.startsWith('video/webm')) || ok[0];
}
const extOf = (mime) => (mime.startsWith('video/mp4') ? 'mp4' : 'webm');
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
function seek(v, t) {
  return new Promise((res) => {
    if (Math.abs(v.currentTime - t) < 0.001 && v.readyState >= 2) return res();
    const done = () => { v.removeEventListener('seeked', done); clearTimeout(to); res(); };
    const to = setTimeout(done, 5000);
    v.addEventListener('seeked', done); v.currentTime = t;
  });
}
async function loadMedia(file, kind = 'video') {
  const v = document.createElement(kind);
  v.preload = 'auto'; v.playsInline = true; v.src = URL.createObjectURL(file);
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('This browser cannot decode ' + (file.name || 'that file'))); });
  if (kind === 'video' && v.videoWidth) await new Promise((res) => { if (v.readyState >= 2) res(); else v.onloadeddata = res; });
  if (!isFinite(v.duration)) { // MediaRecorder WebM has no duration: seek far to force it
    await new Promise((res) => { v.onseeked = res; v.onended = res; v.currentTime = 1e9; setTimeout(res, 4000); }); const d = v.currentTime; await seek(v, 0); if (isFinite(d) && d > 0) Object.defineProperty(v, 'duration', { value: d });
  }
  return v;
}
function startRec({ w, h: hh, fps = 30, bitrate, mime, audio = true, audioBps = 96000 }) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
  const cx = cv.getContext('2d'); cx.fillStyle = '#000'; cx.fillRect(0, 0, w, hh);
  const stream = cv.captureStream(fps);
  let ac = null, dest = null;
  if (audio) { ac = new AudioContext(); dest = ac.createMediaStreamDestination(); dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t)); }
  const mr = new MediaRecorder(stream, { mimeType: mime, ...(bitrate ? { videoBitsPerSecond: bitrate } : {}), ...(audio ? { audioBitsPerSecond: audioBps } : {}) });
  const chunks = []; mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((r) => { mr.onstop = () => r(new Blob(chunks, { type: mime.split(';')[0] })); });
  mr.start(250); const t0 = performance.now();
  return {
    cv, cx, ac, dest, mime,
    tap(el, gain = 1) { const s = ac.createMediaElementSource(el), g = ac.createGain(); g.gain.value = gain; s.connect(g); g.connect(dest); return g; },
    async finish() { await new Promise((r) => setTimeout(r, 200)); if (mr.state !== 'inactive') mr.stop(); let b = await done; stream.getTracks().forEach((t) => t.stop()); if (ac) ac.close(); if (mime.startsWith('video/webm')) b = await addWebmDuration(b, (performance.now() - t0 - 200) / 1000); return b; },
  };
}
// Chrome writes WebM without a Duration, so players show "Infinity" and cannot seek. Append one to the Info element.
async function addWebmDuration(blob, secs) {
  try {
    const b = new Uint8Array(await blob.arrayBuffer()); let info = null, has = false;
    ebmlWalk(b, 0, Math.min(b.length, 4096), (el) => { if (el.id === 0x1549a966) info = el; });
    if (!info) return blob;
    ebmlWalk(b, info.body, info.end, (el) => { if (el.id === 0x4489) has = true; });
    if (has) return blob;
    const dv = new DataView(new ArrayBuffer(11)); dv.setUint8(0, 0x44); dv.setUint8(1, 0x89); dv.setUint8(2, 0x88); dv.setFloat64(3, secs * 1000); // TimecodeScale default 1 ms
    const bodyLen = info.end - info.body + 11, hdr = new Uint8Array(12); hdr.set([0x15, 0x49, 0xa9, 0x66, 0x01]); for (let i = 0; i < 7; i++) hdr[5 + i] = Math.floor(bodyLen / 2 ** (8 * (6 - i))) & 255;
    return new Blob([b.subarray(0, info.start), hdr, b.subarray(info.body, info.end), new Uint8Array(dv.buffer), b.subarray(info.end)], { type: blob.type });
  } catch { return blob; }
}
// Plays v from start to end, calling draw(t) on every animation frame. Resolves when the end is reached or cancelled.
function pump(v, { start, end, draw, onProgress, signal }) {
  return new Promise(async (res) => {
    await seek(v, start); draw(start);
    try { await v.play(); } catch { throw new Error('The browser blocked playback. Click Process again.'); }
    const tick = () => {
      if (signal.cancelled || v.ended || v.currentTime >= end - 0.03 || v.paused) { v.pause(); res(); return; }
      draw(v.currentTime); onProgress && onProgress(clamp((v.currentTime - start) / Math.max(0.001, end - start), 0, 1));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
// Stored-frame playback for reverse/boomerang (no decoder needed for random access).
async function grabFrames(v, start, end, fps, w, hh, signal, onProgress) {
  const n = Math.max(1, Math.floor((end - start) * fps)), cap = Math.floor(350e6 / (w * hh * 4));
  if (n > cap) throw new Error(`Too many frames (${n}). At ${w}x${hh} the limit is ${cap}. Shorten the clip, lower the frame rate or the width.`);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (signal.cancelled) break;
    await seek(v, Math.min(end - 0.001, start + i / fps));
    out.push(await createImageBitmap(v, { resizeWidth: w, resizeHeight: hh }));
    onProgress && onProgress(i / n);
  }
  return out;
}
function playFrames(rec, frames, fps, signal, onProgress) {
  return new Promise((res) => {
    const t0 = performance.now(); let last = -1;
    const tick = () => {
      const i = Math.floor(((performance.now() - t0) / 1000) * fps);
      if (signal.cancelled || i >= frames.length) return res();
      if (i !== last) { rec.cx.drawImage(frames[i], 0, 0, rec.cv.width, rec.cv.height); last = i; onProgress && onProgress(i / frames.length); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const fit = (sw, sh, w, hh) => { const s = Math.min(w / sw, hh / sh), dw = sw * s, dh = sh * s; return [(w - dw) / 2, (hh - dh) / 2, dw, dh]; };

// SRT / VTT cues -> [{s,e,text}]
function parseCues(src) {
  const out = [], tm = (a) => { const m = a.trim().replace(',', '.').split(':').map(parseFloat); return m.length === 3 ? m[0] * 3600 + m[1] * 60 + m[2] : m[0] * 60 + m[1]; };
  for (const blk of String(src).replace(/\r/g, '').replace(/^﻿/, '').split(/\n{2,}/)) {
    const ls = blk.split('\n'), i = ls.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = ls[i].split('-->');
    const s = tm(a), e = tm(b.trim().split(/\s+/)[0]);
    if (isFinite(s) && isFinite(e)) out.push({ s, e, text: ls.slice(i + 1).join('\n').replace(/<[^>]+>/g, '') });
  }
  return out;
}

// ---------- tool factory for video tools ----------
// spec: { id, title, desc, files:[{id,label,accept,multiple,optional}], fields:[opts], note, job(ctx) -> {blob,name,text} }
function vtool(spec) {
  return {
    id: spec.id, cat: 'Video', title: spec.title, desc: spec.desc, custom: true, dom: true,
    render(el) {
      const inputs = {}, vals = {}, fileLists = {};
      const status = h('p', { role: 'status', class: 'desc' }), err = h('p', { role: 'alert', class: 'err' });
      const prog = h('progress', { max: 1, value: 0, 'aria-label': 'Progress', hidden: true });
      const result = h('div'), preview = h('div');
      const sig = { cancelled: false };
      el.append(h('p', { class: 'desc' }, spec.desc + ' Runs in real time in this tab: a 60 second clip takes about 60 seconds. Keep the tab visible while it works. Nothing is uploaded.'));
      for (const f of spec.files) {
        const inp = h('input', { type: 'file', id: `${spec.id}-${f.id}`, accept: f.accept || 'video/*', multiple: !!f.multiple });
        inputs[f.id] = inp; fileLists[f.id] = [];
        el.append(h('label', { for: inp.id }, f.label), inp);
        if (f.multiple) {
          const list = h('ol', { 'aria-label': f.label + ' order' });
          const draw = () => {
            list.replaceChildren(...fileLists[f.id].map((file, i) => h('li', {}, file.name + ' ',
              h('button', { type: 'button', 'aria-label': `Move ${file.name} up`, onclick: () => { if (i) { [fileLists[f.id][i - 1], fileLists[f.id][i]] = [fileLists[f.id][i], fileLists[f.id][i - 1]]; draw(); } } }, 'Up'), ' ',
              h('button', { type: 'button', 'aria-label': `Move ${file.name} down`, onclick: () => { if (i < fileLists[f.id].length - 1) { [fileLists[f.id][i + 1], fileLists[f.id][i]] = [fileLists[f.id][i], fileLists[f.id][i + 1]]; draw(); } } }, 'Down'), ' ',
              h('button', { type: 'button', 'aria-label': `Remove ${file.name}`, onclick: () => { fileLists[f.id].splice(i, 1); draw(); } }, 'Remove'))));
          };
          inp.addEventListener('change', () => { fileLists[f.id].push(...inp.files); inp.value = ''; draw(); });
          el.append(list);
        } else inp.addEventListener('change', () => { fileLists[f.id] = [...inp.files]; if (f === spec.files[0] && spec.player) showPlayer(); });
      }
      let player = null;
      function showPlayer() {
        preview.replaceChildren();
        const f = fileLists[spec.files[0].id][0]; if (!f) return;
        player = h('video', { controls: true, src: URL.createObjectURL(f), style: 'max-width:100%;max-height:240px', 'aria-label': 'Source video preview' });
        preview.append(player);
      }
      const opts = h('div', { class: 'opts' });
      for (const o of spec.fields || []) {
        const id = `${spec.id}-${o.id}`;
        let c;
        if (o.type === 'select') c = h('select', { id }, ...o.choices.map((x) => h('option', { value: x, ...(x === o.def ? { selected: true } : {}) }, x)));
        else if (o.type === 'checkbox') c = h('input', { id, type: 'checkbox', checked: !!o.def });
        else c = h('input', { id, type: o.type === 'number' ? 'number' : o.type === 'color' ? 'color' : 'text', value: o.def, step: 'any' });
        vals[o.id] = c;
        const kids = [h('label', { for: id }, o.label, ' '), c];
        if (o.time && spec.player) kids.push(h('button', { type: 'button', 'aria-label': `Use player time for ${o.label}`, onclick: () => { if (player) c.value = player.currentTime.toFixed(2); } }, 'Use player time'));
        opts.append(h('div', { class: 'row' }, ...kids));
      }
      const run = h('button', { type: 'button' }, 'Process'), cancel = h('button', { type: 'button', disabled: true }, 'Cancel');
      const hint = h('p', { class: 'desc', 'aria-live': 'polite' });
      if (spec.hint) { const upd = () => { try { hint.textContent = spec.hint(read()); } catch { hint.textContent = ''; } }; opts.addEventListener('input', upd); opts.addEventListener('change', upd); setTimeout(upd); }
      const read = () => Object.fromEntries((spec.fields || []).map((o) => [o.id, o.type === 'checkbox' ? vals[o.id].checked : o.type === 'number' ? +vals[o.id].value : vals[o.id].value]));
      run.addEventListener('click', async () => {
        err.textContent = ''; result.replaceChildren(); sig.cancelled = false;
        const files = Object.fromEntries(spec.files.map((f) => [f.id, fileLists[f.id]]));
        for (const f of spec.files) if (!f.optional && !files[f.id].length) { err.textContent = `Choose: ${f.label}`; return; }
        run.disabled = true; cancel.disabled = false; prog.hidden = false; prog.value = 0; status.textContent = 'Working...';
        try {
          const r = await spec.job({ files, v: read(), signal: sig, progress: (p, m) => { prog.value = p; if (m) status.textContent = m; } });
          if (sig.cancelled) { status.textContent = 'Cancelled.'; return; }
          status.textContent = r.text || 'Done.';
          if (r.blob) {
            const isVid = r.blob.type.startsWith('video/'), url = URL.createObjectURL(r.blob);
            if (isVid) result.append(h('video', { controls: true, src: url, style: 'max-width:100%', 'aria-label': 'Result video' }), h('br'));
            else if (r.blob.type.startsWith('image/')) result.append(h('img', { src: url, class: 'prev', alt: 'Result image' }), h('br'));
            result.append(download(r.blob, r.name));
          }
          if (r.extra) result.append(r.extra);
        } catch (e) { err.textContent = e.message || String(e); status.textContent = ''; }
        finally { run.disabled = false; cancel.disabled = true; prog.hidden = true; }
      });
      cancel.addEventListener('click', () => { sig.cancelled = true; });
      el.append(preview, opts, hint, h('div', { class: 'row' }, run, cancel), prog, status, err, result);
      if (!supportedMimes().length) err.textContent = 'This browser cannot record video (no MediaRecorder). Try Chrome, Edge or Firefox.';
    },
  };
}

// Shared single-clip transcoder used by most video tools.
// o: {file, start, end, rate, w, h, fps, bitrate, mime, audio, draw(cx, v, t, W, H), cleanup}
async function transcode(ctx, o) {
  const v = await loadMedia(o.file);
  try {
    const dur = v.duration, start = clamp(o.start ?? 0, 0, Math.max(0, dur - 0.1)), end = clamp(o.end > 0 ? o.end : dur, start + 0.1, dur);
    const W = even(o.w || v.videoWidth), H = even(o.h || v.videoHeight), mime = pickMime(o.mimePref);
    if (!v.videoWidth) throw new Error('No video track found in that file');
    const rec = startRec({ w: W, h: H, fps: o.fps || 30, bitrate: o.bitrate, mime, audio: o.audio !== false });
    const rate = clamp(o.rate || 1, 0.0625, 16); v.playbackRate = rate;
    if (rec.ac) { await rec.ac.resume(); rec.tap(v, 1); }
    const draw = (t) => (o.draw ? o.draw(rec.cx, v, t, W, H) : rec.cx.drawImage(v, 0, 0, W, H));
    await pump(v, { start, end, draw, signal: ctx.signal, onProgress: (p) => ctx.progress(p, `Recording ${(p * 100) | 0}%`) });
    const blob = await rec.finish();
    return { blob, name: `${baseName(o.file)}-${o.tag || 'out'}.${extOf(mime)}`, W, H, secs: (end - start) / rate, mime };
  } finally { URL.revokeObjectURL(v.src); }
}
const sizeText = (r) => `${r.W}x${r.H}, about ${r.secs.toFixed(1)} s, ${(r.blob.size / 1048576).toFixed(2)} MiB (${r.mime.split(';')[0]}). Re-encoded, so quality is lower than the source.`;

// ---------- video tools built on the engine ----------
const VF = [{ id: 'v', label: 'Video file', accept: 'video/*' }];
const one = (ctx) => ctx.files.v[0];
const fmt = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; };
const tparse = (x) => { const p = String(x).trim().split(':').map(Number); if (p.some((n) => !isFinite(n))) throw new Error('Bad time: ' + x); return p.reduce((a, n) => a * 60 + n, 0); };

T.push(vtool({
  id: 'video-trimmer', title: 'Video Trimmer: Cut a Clip by Start and End Time', desc: 'Cut a video to a start and end point and save only that section.', player: true,
  files: VF, fields: [{ ...txt('start', 'Start (seconds or m:ss)', '0'), time: true }, { ...txt('end', 'End (seconds or m:ss, blank = end)', ''), time: true }],
  async job(ctx) { const r = await transcode(ctx, { file: one(ctx), start: tparse(ctx.v.start || 0), end: ctx.v.end ? tparse(ctx.v.end) : 0, tag: 'trim' }); return { blob: r.blob, name: r.name, text: sizeText(r) }; },
}));

T.push(vtool({
  id: 'video-format-converter', title: 'Video Format Converter: Re-encode to WebM or MP4 in the Browser', desc: 'Re-encode a video to WebM or, where the browser supports it, MP4.',
  files: VF, fields: [sel('format', 'Output container', ['WebM', 'MP4 (browser support varies)'])],
  async job(ctx) { const r = await transcode(ctx, { file: one(ctx), mimePref: ctx.v.format.startsWith('MP4') ? 'mp4' : 'webm', tag: 'converted' }); return { blob: r.blob, name: r.name, text: sizeText(r) + ' MOV output is not possible with browser APIs.' }; },
}));

T.push(vtool({
  id: 'video-compressor', title: 'Video Compressor: Lower Bitrate and Resolution to Shrink a File', desc: 'Reduce video file size with bitrate and resolution controls.',
  files: VF, fields: [sel('height', 'Output height', ['Original', '1080', '720', '480', '360', '240'], '720'), num('kbps', 'Video bitrate (kbit/s)', 1200), chk('audio', 'Keep audio (about 64 kbit/s)', true)],
  hint: (o) => `Estimated size for a 60 second clip: about ${(((o.kbps + (o.audio ? 64 : 0)) * 60) / 8 / 1024).toFixed(1)} MiB. The tool shows the real size when it finishes.`,
  async job(ctx) {
    const f = one(ctx), probe = await loadMedia(f), vw = probe.videoWidth, vh = probe.videoHeight; URL.revokeObjectURL(probe.src);
    const th = ctx.v.height === 'Original' ? vh : Math.min(+ctx.v.height, vh), tw = Math.round((vw * th) / vh);
    const r = await transcode(ctx, { file: f, w: tw, h: th, bitrate: clamp(ctx.v.kbps, 50, 50000) * 1000, audio: ctx.v.audio, tag: 'small' });
    return { blob: r.blob, name: r.name, text: `${sizeText(r)} Source was ${(f.size / 1048576).toFixed(2)} MiB.` };
  },
}));

T.push(vtool({
  id: 'video-resizer', title: 'Video Resizer: Rescale to 720p, 1080p or a Custom Size', desc: 'Rescale a video to a preset or custom resolution.',
  files: VF, fields: [sel('preset', 'Preset', ['Custom', '2160p', '1440p', '1080p', '720p', '480p', '360p'], '720p'), num('width', 'Custom width (px)', 1280), num('height', 'Custom height (px)', 720), chk('keep', 'Keep aspect ratio (fit inside the size)', true)],
  async job(ctx) {
    const f = one(ctx), p = await loadMedia(f), vw = p.videoWidth, vh = p.videoHeight; URL.revokeObjectURL(p.src);
    let tw, th;
    if (ctx.v.preset === 'Custom') { tw = clamp(ctx.v.width, 16, 7680); th = clamp(ctx.v.height, 16, 4320); } else { th = parseInt(ctx.v.preset); tw = Math.round((th * 16) / 9); }
    const r = await transcode(ctx, {
      file: f, w: tw, h: th, tag: `${even(tw)}x${even(th)}`,
      draw: (cx, v, t, W, H) => { cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H); if (ctx.v.keep) { const [x, y, w, hh] = fit(vw, vh, W, H); cx.drawImage(v, x, y, w, hh); } else cx.drawImage(v, 0, 0, W, H); },
    });
    return { blob: r.blob, name: r.name, text: sizeText(r) + (ctx.v.keep ? ' Black bars fill any leftover space.' : ' The picture is stretched to the size.') };
  },
}));

T.push(vtool({
  id: 'video-cropper', title: 'Video Cropper: Crop to 9:16, 1:1, 4:5 or a Custom Ratio', desc: 'Crop a video frame to a new aspect ratio and position.',
  files: VF, fields: [sel('ratio', 'Aspect ratio', ['9:16', '1:1', '4:5', '16:9', '4:3', '3:4', 'Custom'], '9:16'), txt('custom', 'Custom ratio (w:h)', '2:1'), num('px', 'Horizontal position (0 left, 100 right)', 50), num('py', 'Vertical position (0 top, 100 bottom)', 50)],
  async job(ctx) {
    const f = one(ctx), p = await loadMedia(f), vw = p.videoWidth, vh = p.videoHeight; URL.revokeObjectURL(p.src);
    const rs = ctx.v.ratio === 'Custom' ? ctx.v.custom : ctx.v.ratio, [a, b] = rs.split(':').map(Number);
    if (!(a > 0 && b > 0)) throw new Error('Ratio must look like 16:9');
    let cw = vw, ch = (vw * b) / a; if (ch > vh) { ch = vh; cw = (vh * a) / b; }
    const cx0 = (vw - cw) * clamp(ctx.v.px, 0, 100) / 100, cy0 = (vh - ch) * clamp(ctx.v.py, 0, 100) / 100;
    const r = await transcode(ctx, { file: f, w: cw, h: ch, tag: `crop-${a}x${b}`, draw: (c, v, t, W, H) => c.drawImage(v, cx0, cy0, cw, ch, 0, 0, W, H) });
    return { blob: r.blob, name: r.name, text: sizeText(r) + ` Crop box ${Math.round(cw)}x${Math.round(ch)} at ${Math.round(cx0)},${Math.round(cy0)}.` };
  },
}));

T.push(vtool({
  id: 'video-rotator', title: 'Video Rotator and Flipper: Fix a Sideways Phone Video', desc: 'Rotate a video by 90, 180 or 270 degrees, or mirror it.',
  files: VF, fields: [sel('rot', 'Rotate', ['90 clockwise', '180', '90 counter-clockwise', 'None'], '90 clockwise'), chk('fh', 'Flip horizontally (mirror)', false), chk('fv', 'Flip vertically', false)],
  async job(ctx) {
    const f = one(ctx), p = await loadMedia(f), vw = p.videoWidth, vh = p.videoHeight; URL.revokeObjectURL(p.src);
    const deg = { '90 clockwise': 90, '180': 180, '90 counter-clockwise': 270, None: 0 }[ctx.v.rot], swap = deg === 90 || deg === 270;
    const r = await transcode(ctx, {
      file: f, w: swap ? vh : vw, h: swap ? vw : vh, tag: 'rotated',
      draw: (c, v, t, W, H) => { c.save(); c.translate(W / 2, H / 2); c.rotate((deg * Math.PI) / 180); c.scale(ctx.v.fh ? -1 : 1, ctx.v.fv ? -1 : 1); c.drawImage(v, -vw / 2, -vh / 2, vw, vh); c.restore(); },
    });
    return { blob: r.blob, name: r.name, text: sizeText(r) };
  },
}));

T.push(vtool({
  id: 'video-speed-changer', title: 'Video Speed Changer: Slow Motion and Time-Lapse', desc: 'Make a slow-motion or fast version of a video.',
  files: VF, fields: [num('speed', 'Speed factor (0.0625 to 16)', 2), sel('audio', 'Audio', ['Keep (pitch kept)', 'Drop'])],
  async job(ctx) {
    const sp = clamp(ctx.v.speed, 0.0625, 16);
    const r = await transcode(ctx, { file: one(ctx), rate: sp, audio: ctx.v.audio === 'Keep (pitch kept)', tag: `x${sp}` });
    return { blob: r.blob, name: r.name, text: sizeText(r) + ' Browsers limit playback speed to 0.0625x through 16x.' };
  },
}));

T.push(vtool({
  id: 'video-frame-rate-converter', title: 'Video Frame Rate Converter: Drop or Repeat Frames to 24, 30 or 60 fps', desc: 'Change the frame rate of a video by sampling it at a new rate.',
  files: VF, fields: [sel('fps', 'Target frame rate', ['12', '15', '24', '25', '30', '50', '60'], '30')],
  async job(ctx) { const r = await transcode(ctx, { file: one(ctx), fps: +ctx.v.fps, tag: `${ctx.v.fps}fps` }); return { blob: r.blob, name: r.name, text: sizeText(r) + ' Frames are dropped or repeated, not blended. The browser decides the exact timing, so check the result.' }; },
}));

T.push(vtool({
  id: 'video-watermarker', title: 'Video Watermarker: Add a Logo or Text Overlay', desc: 'Overlay text or a logo on every frame of a video.',
  files: [...VF, { id: 'logo', label: 'Logo image (optional, used instead of text)', accept: 'image/*', optional: true }],
  fields: [txt('text', 'Watermark text', 'Sample'), sel('pos', 'Position', ['bottom right', 'bottom left', 'top right', 'top left', 'center']), num('size', 'Size (% of video width)', 20), num('opacity', 'Opacity (%)', 70), num('margin', 'Margin (% of width)', 2)],
  async job(ctx) {
    let img = null; if (ctx.files.logo[0]) img = await createImageBitmap(ctx.files.logo[0]);
    const o = ctx.v, op = clamp(o.opacity, 0, 100) / 100;
    const r = await transcode(ctx, {
      file: one(ctx), tag: 'watermarked',
      draw: (c, v, t, W, H) => {
        c.drawImage(v, 0, 0, W, H); const w = (W * clamp(o.size, 1, 100)) / 100, m = (W * clamp(o.margin, 0, 30)) / 100; c.globalAlpha = op;
        let bw, bh; if (img) { bw = w; bh = (w * img.height) / img.width; } else { c.font = `bold ${w / Math.max(4, o.text.length * 0.6)}px sans-serif`; bw = c.measureText(o.text).width; bh = parseInt(c.font.match(/(\d+(\.\d+)?)px/)[1]) * 1.2; }
        const x = o.pos.includes('left') ? m : o.pos.includes('right') ? W - bw - m : (W - bw) / 2, y = o.pos.includes('top') ? m : o.pos.includes('bottom') ? H - bh - m : (H - bh) / 2;
        if (img) c.drawImage(img, x, y, bw, bh); else { c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = bh / 14; c.textBaseline = 'top'; c.strokeText(o.text, x, y); c.fillText(o.text, x, y); }
        c.globalAlpha = 1;
      },
    });
    return { blob: r.blob, name: r.name, text: sizeText(r) };
  },
}));

T.push(vtool({
  id: 'subtitle-burner', title: 'Subtitle Burner: Hardcode SRT or VTT Captions into a Video', desc: 'Draw subtitle text permanently onto the frames of a video.',
  files: [...VF, { id: 'srt', label: 'Subtitle file (.srt or .vtt)', accept: '.srt,.vtt,text/*' }],
  fields: [num('size', 'Font size (% of video height)', 5), txt('color', 'Text colour', '#ffffff'), chk('box', 'Dark box behind text', true), sel('pos', 'Position', ['bottom', 'middle', 'top']), sel('font', 'Font', ['sans-serif', 'serif', 'monospace'])],
  async job(ctx) {
    const cues = parseCues(await ctx.files.srt[0].text()); if (!cues.length) throw new Error('No cues found in the subtitle file');
    const o = ctx.v;
    const r = await transcode(ctx, {
      file: one(ctx), tag: 'subtitled',
      draw: (c, v, t, W, H) => {
        c.drawImage(v, 0, 0, W, H); const cue = cues.find((q) => t >= q.s && t < q.e); if (!cue) return;
        const fs = (H * clamp(o.size, 1, 20)) / 100; c.font = `600 ${fs}px ${o.font}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
        const wrapped = []; for (const ln of cue.text.split('\n')) { let cur = ''; for (const wd of ln.split(' ')) { const tr = cur ? cur + ' ' + wd : wd; if (c.measureText(tr).width > W * 0.9 && cur) { wrapped.push(cur); cur = wd; } else cur = tr; } wrapped.push(cur); }
        const lh = fs * 1.25, total = wrapped.length * lh, top = o.pos === 'top' ? fs * 0.8 : o.pos === 'middle' ? (H - total) / 2 : H - total - fs * 0.8;
        wrapped.forEach((ln, i) => {
          const y = top + i * lh + fs; if (o.box) { const w = c.measureText(ln).width + fs * 0.6; c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(W / 2 - w / 2, y - fs, w, lh); }
          c.lineWidth = fs / 8; c.strokeStyle = 'rgba(0,0,0,.8)'; if (!o.box) c.strokeText(ln, W / 2, y); c.fillStyle = o.color; c.fillText(ln, W / 2, y);
        });
      },
    });
    return { blob: r.blob, name: r.name, text: `${cues.length} cues drawn. ` + sizeText(r) };
  },
}));

T.push(vtool({
  id: 'video-looper', title: 'Video Looper and Boomerang Maker', desc: 'Repeat a short clip or play it forward and back.',
  files: VF, fields: [sel('mode', 'Mode', ['Repeat', 'Boomerang (forward and back)']), num('times', 'Repeats / cycles', 3), txt('start', 'Start (seconds)', '0'), txt('end', 'End (seconds, blank = end of video, max 10 s long)', ''), num('fps', 'Frame rate for boomerang', 15), num('width', 'Width (px) for boomerang', 480)],
  async job(ctx) {
    const f = one(ctx), o = ctx.v, v = await loadMedia(f);
    try {
      const s = tparse(o.start || 0), e = Math.min(v.duration, o.end ? tparse(o.end) : s + 10), times = clamp(o.times, 1, 20) | 0;
      if (e - s > 10) throw new Error('Use a clip of 10 seconds or less');
      const W = even(o.mode.startsWith('Boom') ? Math.min(o.width, v.videoWidth) : v.videoWidth), H = even((W * v.videoHeight) / v.videoWidth), mime = pickMime('webm');
      const rec = startRec({ w: W, h: H, fps: clamp(o.fps, 5, 30), mime, audio: false });
      if (o.mode === 'Repeat') {
        for (let i = 0; i < times && !ctx.signal.cancelled; i++) await pump(v, { start: s, end: e, draw: () => rec.cx.drawImage(v, 0, 0, W, H), signal: ctx.signal, onProgress: (p) => ctx.progress((i + p) / times, `Loop ${i + 1} of ${times}`) });
      } else {
        const fr = await grabFrames(v, s, e, clamp(o.fps, 5, 30), W, H, ctx.signal, (p) => ctx.progress(p * 0.5, 'Reading frames'));
        const seq = [...fr, ...fr.slice(1, -1).reverse()], all = []; for (let i = 0; i < times; i++) all.push(...seq);
        await playFrames(rec, all, clamp(o.fps, 5, 30), ctx.signal, (p) => ctx.progress(0.5 + p / 2, 'Recording'));
      }
      const blob = await rec.finish(); return { blob, name: `${baseName(f)}-loop.${extOf(mime)}`, text: `${W}x${H}, ${(blob.size / 1048576).toFixed(2)} MiB. Loop clips have no audio.` };
    } finally { URL.revokeObjectURL(v.src); }
  },
}));

T.push(vtool({
  id: 'video-reverser', title: 'Video Reverser: Play a Short Clip Backwards', desc: 'Reverse a short clip and save it. Audio is dropped.',
  files: VF, fields: [txt('start', 'Start (seconds)', '0'), txt('end', 'End (seconds, blank = up to 10 s from start)', ''), num('fps', 'Frame rate', 15), num('width', 'Width (px)', 480)],
  async job(ctx) {
    const f = one(ctx), o = ctx.v, v = await loadMedia(f);
    try {
      const s = tparse(o.start || 0), e = Math.min(v.duration, o.end ? tparse(o.end) : s + 10); if (e - s > 15) throw new Error('Use a clip of 15 seconds or less');
      const fps = clamp(o.fps, 5, 30), W = even(Math.min(o.width, v.videoWidth)), H = even((W * v.videoHeight) / v.videoWidth), mime = pickMime('webm');
      const fr = await grabFrames(v, s, e, fps, W, H, ctx.signal, (p) => ctx.progress(p * 0.5, 'Reading frames'));
      const rec = startRec({ w: W, h: H, fps, mime, audio: false });
      await playFrames(rec, fr.reverse(), fps, ctx.signal, (p) => ctx.progress(0.5 + p / 2, 'Recording'));
      const blob = await rec.finish(); return { blob, name: `${baseName(f)}-reversed.${extOf(mime)}`, text: `${W}x${H}, ${fr.length} frames, ${(blob.size / 1048576).toFixed(2)} MiB. Audio is not reversed and is left out.` };
    } finally { URL.revokeObjectURL(v.src); }
  },
}));

T.push(vtool({
  id: 'video-merger', title: 'Video Merger: Join Clips into One Video', desc: 'Join several clips in order; clips of other sizes are fitted to the first clip size.',
  files: [{ id: 'v', label: 'Video clips (add several, then reorder below)', accept: 'video/*', multiple: true }], fields: [],
  async job(ctx) {
    const fl = ctx.files.v; if (fl.length < 2) throw new Error('Add at least two clips');
    const vids = []; for (const f of fl) vids.push(await loadMedia(f));
    try {
      const W = even(vids[0].videoWidth), H = even(vids[0].videoHeight), mime = pickMime('webm'), rec = startRec({ w: W, h: H, fps: 30, mime, audio: true });
      await rec.ac.resume(); vids.forEach((v) => rec.tap(v, 1));
      for (let i = 0; i < vids.length && !ctx.signal.cancelled; i++) {
        const v = vids[i];
        await pump(v, { start: 0, end: v.duration, signal: ctx.signal, draw: () => { rec.cx.fillStyle = '#000'; rec.cx.fillRect(0, 0, W, H); const [x, y, w, hh] = fit(v.videoWidth, v.videoHeight, W, H); rec.cx.drawImage(v, x, y, w, hh); }, onProgress: (p) => ctx.progress((i + p) / vids.length, `Clip ${i + 1} of ${vids.length}`) });
      }
      const blob = await rec.finish(); return { blob, name: `merged.${extOf(mime)}`, text: `${vids.length} clips, ${W}x${H}, ${(blob.size / 1048576).toFixed(2)} MiB. Re-encoded.` };
    } finally { vids.forEach((v) => URL.revokeObjectURL(v.src)); }
  },
}));

T.push(vtool({
  id: 'video-music-mixer', title: 'Video Background Music Adder: Mix a Track Under a Video', desc: 'Mix an audio file under the original sound of a video.',
  files: [...VF, { id: 'a', label: 'Music or audio file', accept: 'audio/*' }],
  fields: [num('mvol', 'Music volume (%)', 30), num('ovol', 'Original audio volume (%)', 100), num('fade', 'Fade out music over the last (seconds)', 2), chk('loop', 'Loop music if shorter than the video', true)],
  async job(ctx) {
    const f = one(ctx), v = await loadMedia(f), a = await loadMedia(ctx.files.a[0], 'audio'), o = ctx.v;
    try {
      const mime = pickMime('webm'), W = even(v.videoWidth), H = even(v.videoHeight), rec = startRec({ w: W, h: H, fps: 30, mime, audio: true });
      await rec.ac.resume(); rec.tap(v, clamp(o.ovol, 0, 200) / 100); const mg = rec.tap(a, clamp(o.mvol, 0, 200) / 100);
      a.loop = !!o.loop; a.currentTime = 0; const base = clamp(o.mvol, 0, 200) / 100, fade = clamp(o.fade, 0, 30), dur = v.duration;
      await a.play();
      await pump(v, { start: 0, end: dur, signal: ctx.signal, draw: (t) => { rec.cx.drawImage(v, 0, 0, W, H); if (fade > 0) mg.gain.value = base * clamp((dur - t) / fade, 0, 1); }, onProgress: (p) => ctx.progress(p, `Mixing ${(p * 100) | 0}%`) });
      a.pause(); const blob = await rec.finish(); return { blob, name: `${baseName(f)}-music.${extOf(mime)}`, text: `${W}x${H}, ${(blob.size / 1048576).toFixed(2)} MiB. Re-encoded.` };
    } finally { URL.revokeObjectURL(v.src); URL.revokeObjectURL(a.src); }
  },
}));

T.push(vtool({
  id: 'picture-in-picture-composer', title: 'Picture-in-Picture Composer: Put One Video Inside Another', desc: 'Overlay a smaller video in a corner of a main video.',
  files: [{ id: 'v', label: 'Main video', accept: 'video/*' }, { id: 'p', label: 'Inset video (for example a webcam clip)', accept: 'video/*' }],
  fields: [sel('corner', 'Corner', ['bottom right', 'bottom left', 'top right', 'top left']), num('size', 'Inset width (% of main)', 25), num('margin', 'Margin (% of main width)', 2), num('border', 'Border (px)', 3), txt('bcolor', 'Border colour', '#ffffff'), num('pvol', 'Inset sound volume (%)', 0)],
  async job(ctx) {
    const f = one(ctx), v = await loadMedia(f), p = await loadMedia(ctx.files.p[0]), o = ctx.v;
    try {
      const W = even(v.videoWidth), H = even(v.videoHeight), mime = pickMime('webm'), rec = startRec({ w: W, h: H, fps: 30, mime, audio: true });
      await rec.ac.resume(); rec.tap(v, 1); rec.tap(p, clamp(o.pvol, 0, 200) / 100);
      const iw = (W * clamp(o.size, 5, 60)) / 100, ih = (iw * p.videoHeight) / p.videoWidth, m = (W * clamp(o.margin, 0, 20)) / 100, bw = clamp(o.border, 0, 30);
      const x = o.corner.includes('left') ? m : W - iw - m, y = o.corner.includes('top') ? m : H - ih - m;
      await seek(p, 0); p.play();
      await pump(v, { start: 0, end: v.duration, signal: ctx.signal, draw: () => { const c = rec.cx; c.drawImage(v, 0, 0, W, H); if (!p.ended) { if (bw) { c.fillStyle = o.bcolor; c.fillRect(x - bw, y - bw, iw + 2 * bw, ih + 2 * bw); } c.drawImage(p, x, y, iw, ih); } }, onProgress: (q) => ctx.progress(q, `Composing ${(q * 100) | 0}%`) });
      p.pause(); const blob = await rec.finish(); return { blob, name: `${baseName(f)}-pip.${extOf(mime)}`, text: `${W}x${H}, ${(blob.size / 1048576).toFixed(2)} MiB. The inset starts with the main video and disappears when it ends.` };
    } finally { URL.revokeObjectURL(v.src); URL.revokeObjectURL(p.src); }
  },
}));

// ---------- frame grabber, contact sheet, audio extractor ----------
const canvasBlob = (cv, type = 'image/png', q = 0.92) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the image'))), type, q));

T.push(vtool({
  id: 'video-frame-grabber', title: 'Video Frame Grabber: Save Still Frames at Chosen Timestamps', desc: 'Save still frames from a video as PNG or JPG at the times you list.', player: true,
  files: VF, fields: [txt('times', 'Timestamps (comma separated, seconds or m:ss)', '1, 5, 10'), num('every', 'Or one frame every N seconds (0 = off)', 0), sel('type', 'Format', ['PNG', 'JPG'])],
  async job(ctx) {
    const f = one(ctx), v = await loadMedia(f), o = ctx.v;
    try {
      let ts = o.every > 0 ? Array.from({ length: Math.min(200, Math.floor(v.duration / o.every) + 1) }, (_, i) => i * o.every) : o.times.split(',').filter((x) => x.trim()).map(tparse);
      if (!ts.length) throw new Error('Enter at least one timestamp');
      ts = ts.map((t) => clamp(t, 0, Math.max(0, v.duration - 0.05)));
      const cv = document.createElement('canvas'); cv.width = v.videoWidth; cv.height = v.videoHeight; const cx = cv.getContext('2d'), entries = [], box = h('div'), ext = o.type === 'PNG' ? 'png' : 'jpg';
      for (let i = 0; i < ts.length; i++) {
        if (ctx.signal.cancelled) break; await seek(v, ts[i]); cx.drawImage(v, 0, 0);
        const b = await canvasBlob(cv, o.type === 'PNG' ? 'image/png' : 'image/jpeg'), name = `${baseName(f)}-${ts[i].toFixed(2)}s.${ext}`;
        entries.push({ name, data: new Uint8Array(await b.arrayBuffer()) });
        box.append(h('figure', {}, h('img', { src: URL.createObjectURL(b), alt: `Frame at ${fmt(ts[i])}`, style: 'max-width:240px' }), h('figcaption', {}, fmt(ts[i]) + ' ', download(b, name))));
        ctx.progress((i + 1) / ts.length);
      }
      if (entries.length > 1) box.append(download(zipStore(entries), `${baseName(f)}-frames.zip`));
      return { text: `${entries.length} frames at ${v.videoWidth}x${v.videoHeight}.`, extra: box };
    } finally { URL.revokeObjectURL(v.src); }
  },
}));

T.push(vtool({
  id: 'video-contact-sheet', title: 'Video Contact Sheet Maker: A Grid of Frames with Timestamps', desc: 'Sample frames at even intervals and arrange them in one image.',
  files: VF, fields: [num('cols', 'Columns', 4), num('rows', 'Rows', 3), num('width', 'Thumbnail width (px)', 320), chk('stamps', 'Draw timestamps', true)],
  async job(ctx) {
    const f = one(ctx), v = await loadMedia(f), o = ctx.v;
    try {
      const cols = clamp(o.cols, 1, 12) | 0, rows = clamp(o.rows, 1, 12) | 0, tw = clamp(o.width, 60, 1000) | 0, th = Math.round((tw * v.videoHeight) / v.videoWidth), n = cols * rows, gap = 6;
      const cv = document.createElement('canvas'); cv.width = cols * tw + (cols + 1) * gap; cv.height = rows * th + (rows + 1) * gap; const cx = cv.getContext('2d'); cx.fillStyle = '#111'; cx.fillRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < n; i++) {
        if (ctx.signal.cancelled) break; const t = Math.min(v.duration - 0.05, ((i + 0.5) * v.duration) / n); await seek(v, t);
        const x = gap + (i % cols) * (tw + gap), y = gap + Math.floor(i / cols) * (th + gap); cx.drawImage(v, x, y, tw, th);
        if (o.stamps) { const label = fmt(t); cx.font = `${Math.max(11, tw / 20)}px monospace`; const w = cx.measureText(label).width + 8; cx.fillStyle = 'rgba(0,0,0,.7)'; cx.fillRect(x, y + th - 20, w, 20); cx.fillStyle = '#fff'; cx.textBaseline = 'middle'; cx.fillText(label, x + 4, y + th - 10); }
        ctx.progress((i + 1) / n);
      }
      return { blob: await canvasBlob(cv), name: `${baseName(f)}-sheet.png`, text: `${cols}x${rows} frames, image ${cv.width}x${cv.height}.` };
    } finally { URL.revokeObjectURL(v.src); }
  },
}));

function wavFromBuffer(ab, s, e) {
  const ch = ab.numberOfChannels, sr = ab.sampleRate, a = Math.floor(s * sr), b = Math.min(ab.length, Math.floor(e * sr)), n = Math.max(0, b - a);
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2)), w = (o, str) => [...str].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => ab.getChannelData(c));
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) out.setInt16(44 + (i * ch + c) * 2, Math.round(clamp(chans[c][a + i], -1, 1) * 32767), true);
  return new Blob([out.buffer], { type: 'audio/wav' });
}
T.push(vtool({
  id: 'video-audio-extractor', title: 'Video Audio Extractor: Save the Soundtrack as WAV', desc: 'Decode the audio track of a video and save it as a WAV file.',
  files: VF, fields: [txt('start', 'Start (seconds, optional)', '0'), txt('end', 'End (seconds, blank = to the end)', '')],
  async job(ctx) {
    const f = one(ctx); ctx.progress(0.1, 'Decoding audio');
    const ac = new AudioContext(); let ab;
    try { ab = await ac.decodeAudioData(await f.arrayBuffer()); } catch { throw new Error('Could not decode audio from that file. It may have no audio track or use a codec this browser lacks.'); } finally { ac.close(); }
    const s = tparse(ctx.v.start || 0), e = ctx.v.end ? tparse(ctx.v.end) : ab.duration, blob = wavFromBuffer(ab, s, e);
    return { blob, name: `${baseName(f)}.wav`, text: `${ab.numberOfChannels} channel(s), ${ab.sampleRate} Hz, ${(Math.min(e, ab.duration) - s).toFixed(1)} s, 16-bit WAV. MP3 is not offered because browsers have no MP3 encoder; convert the WAV with a desktop tool if you need MP3.` };
  },
}));

// ---------- container parsing: lossless mute and metadata ----------
const u32be = (d, o) => d.getUint32(o);
const fcc = (d, o) => String.fromCharCode(d.getUint8(o), d.getUint8(o + 1), d.getUint8(o + 2), d.getUint8(o + 3));
function mp4Boxes(d, start, end) {
  const out = []; let p = start;
  while (p + 8 <= end) {
    let size = u32be(d, p), hdr = 8; const type = fcc(d, p + 4);
    if (size === 1) { size = Number(d.getBigUint64(p + 8)); hdr = 16; } else if (size === 0) size = end - p;
    if (size < hdr || p + size > end) break;
    out.push({ type, start: p, hdr, size, body: p + hdr, end: p + size }); p += size;
  }
  return out;
}
// Renames the audio trak box to "free" (same size) so every offset stays valid: no re-encoding, no data change.
function mp4MuteBytes(buf) {
  const d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), moov = mp4Boxes(d, 0, buf.length).find((b) => b.type === 'moov');
  if (!moov) throw new Error('No moov box: not an MP4 or MOV file');
  const kids = mp4Boxes(d, moov.body, moov.end);
  if (kids.some((k) => k.type === 'mvex')) throw new Error('fragmented');
  let n = 0;
  for (const trak of kids.filter((k) => k.type === 'trak')) {
    const mdia = mp4Boxes(d, trak.body, trak.end).find((b) => b.type === 'mdia'), hdlr = mdia && mp4Boxes(d, mdia.body, mdia.end).find((b) => b.type === 'hdlr');
    if (hdlr && fcc(d, hdlr.body + 8) === 'soun') { 'free'.split('').forEach((c, i) => { buf[trak.start + 4 + i] = c.charCodeAt(0); }); n++; }
  }
  return n;
}
// EBML
function ebmlId(b, p) { const c = b[p]; let l = 1; while (l <= 4 && !(c & (0x80 >> (l - 1)))) l++; if (l > 4) return null; let id = 0; for (let i = 0; i < l; i++) id = id * 256 + b[p + i]; return { id, len: l }; }
function ebmlSize(b, p) { const c = b[p]; let l = 1; while (l <= 8 && !(c & (0x80 >> (l - 1)))) l++; if (l > 8) return null; let v = c & (0xff >> l), unk = v === (0xff >> l); for (let i = 1; i < l; i++) { v = v * 256 + b[p + i]; if (b[p + i] !== 255) unk = false; } return { size: unk ? -1 : v, len: l }; }
const EB_MASTER = new Set([0x18538067, 0x1549a966, 0x1654ae6b, 0xae, 0xe0, 0xe1]);
function ebmlWalk(b, start, end, cb, depth = 0) {
  let p = start;
  while (p < end) {
    const id = ebmlId(b, p); if (!id) break; const sz = ebmlSize(b, p + id.len); if (!sz) break;
    const body = p + id.len + sz.len, e = sz.size < 0 ? end : Math.min(end, body + sz.size);
    cb({ id: id.id, start: p, body, end: e, depth, idLen: id.len });
    if (EB_MASTER.has(id.id)) ebmlWalk(b, body, e, cb, depth + 1);
    p = e;
  }
}
function webmMuteBytes(buf) {
  let n = 0, cur = null; const ents = [];
  ebmlWalk(buf, 0, buf.length, (el) => { if (el.id === 0xae) { cur = { el, type: 0 }; ents.push(cur); } else if (el.id === 0x83 && cur) cur.type = buf[el.body]; });
  for (const t of ents) if (t.type === 2) { buf[t.el.start] = 0xec; n++; } // TrackEntry becomes a Void element of the same size
  return n;
}
T.push(vtool({
  id: 'video-muter', title: 'Video Muter: Remove the Audio Track Without Re-encoding', desc: 'Remove the sound from an MP4, MOV or WebM file without touching the picture.',
  files: VF, fields: [],
  async job(ctx) {
    const f = one(ctx), buf = new Uint8Array(await f.arrayBuffer()), head = String.fromCharCode(...buf.slice(4, 8));
    let n = 0, how = '';
    try {
      if (head === 'ftyp' || head === 'moov' || head === 'free' || head === 'mdat' || head === 'wide') { n = mp4MuteBytes(buf); how = 'The audio track box was disabled in place. Video data is byte for byte unchanged.'; }
      else if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) { n = webmMuteBytes(buf); how = 'The audio track entry was blanked in place. Video data is byte for byte unchanged.'; }
    } catch (e) { if (e.message !== 'fragmented') throw e; }
    if (n > 0) { const ext = (f.name.match(/\.[^.]+$/) || ['.mp4'])[0]; return { blob: new Blob([buf], { type: f.type || 'video/mp4' }), name: `${baseName(f)}-muted${ext}`, text: `Removed ${n} audio track(s). ${how} (The audio bytes may still sit in the file, unused, so the size does not shrink.)` }; }
    if (head === 'ftyp' || buf[0] === 0x1a) throw new Error('No audio track found, or the file is fragmented. Use Video Format Converter to re-encode instead.');
    const r = await transcode(ctx, { file: f, audio: false, tag: 'muted' });
    return { blob: r.blob, name: r.name, text: 'This format cannot be edited in place, so the video was re-encoded without audio. ' + sizeText(r) };
  },
}));

function mp4Info(buf) {
  const d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), out = [], top = mp4Boxes(d, 0, buf.length), ftyp = top.find((b) => b.type === 'ftyp'), moov = top.find((b) => b.type === 'moov');
  if (!moov) throw new Error('No moov box found');
  out.push(`Container: MP4/MOV, brand ${ftyp ? fcc(d, ftyp.body) : '?'}`);
  const kids = mp4Boxes(d, moov.body, moov.end), mvhd = kids.find((k) => k.type === 'mvhd');
  let totalDur = 0;
  if (mvhd) { const v1 = d.getUint8(mvhd.body) === 1, ts = d.getUint32(mvhd.body + (v1 ? 20 : 12)), du = v1 ? Number(d.getBigUint64(mvhd.body + 24)) : d.getUint32(mvhd.body + 16); totalDur = du / ts; out.push(`Duration: ${totalDur.toFixed(3)} s`); }
  out.push(`Fast start (moov before mdat): ${top.findIndex((b) => b.type === 'moov') < top.findIndex((b) => b.type === 'mdat') ? 'yes' : 'no'}`, `Fragmented: ${kids.some((k) => k.type === 'mvex') ? 'yes' : 'no'}`);
  let idx = 0;
  for (const trak of kids.filter((k) => k.type === 'trak')) {
    idx++; const tk = mp4Boxes(d, trak.body, trak.end), tkhd = tk.find((b) => b.type === 'tkhd'), mdia = tk.find((b) => b.type === 'mdia'); if (!mdia) continue;
    const md = mp4Boxes(d, mdia.body, mdia.end), hdlr = md.find((b) => b.type === 'hdlr'), mdhd = md.find((b) => b.type === 'mdhd'), minf = md.find((b) => b.type === 'minf');
    const kind = hdlr ? fcc(d, hdlr.body + 8) : '?', v1 = d.getUint8(mdhd.body) === 1, ts = d.getUint32(mdhd.body + (v1 ? 20 : 12)), du = v1 ? Number(d.getBigUint64(mdhd.body + 24)) : d.getUint32(mdhd.body + 16), secs = du / ts;
    const st = mp4Boxes(d, mp4Boxes(d, minf.body, minf.end).find((b) => b.type === 'stbl').body, mp4Boxes(d, minf.body, minf.end).find((b) => b.type === 'stbl').end), L = [];
    const stsd = st.find((b) => b.type === 'stsd'), ent = stsd.body + 8, codec = fcc(d, ent + 4);
    L.push(`Track ${idx}: ${kind === 'vide' ? 'video' : kind === 'soun' ? 'audio' : kind}`, `  Codec: ${codec}`);
    if (kind === 'vide') {
      const tw = tkhd ? d.getUint32(tkhd.body + (d.getUint8(tkhd.body) === 1 ? 88 : 76)) / 65536 : 0, th = tkhd ? d.getUint32(tkhd.body + (d.getUint8(tkhd.body) === 1 ? 92 : 80)) / 65536 : 0;
      L.push(`  Size: ${d.getUint16(ent + 32)}x${d.getUint16(ent + 34)} (display ${tw}x${th})`);
      for (const c of mp4Boxes(d, ent + 86, ent + d.getUint32(ent))) if (c.type === 'avcC') L.push(`  AVC profile/level: ${[1, 2, 3].map((i) => d.getUint8(c.body + i).toString(16).padStart(2, '0')).join('')} (avc1.${[1, 2, 3].map((i) => d.getUint8(c.body + i).toString(16).padStart(2, '0')).join('')})`);
    } else if (kind === 'soun') L.push(`  Channels: ${d.getUint16(ent + 24)}, sample rate: ${d.getUint16(ent + 32)} Hz`);
    const stts = st.find((b) => b.type === 'stts'), stsz = st.find((b) => b.type === 'stsz');
    if (stts) { const cnt = d.getUint32(stts.body + 4); let samples = 0; for (let i = 0; i < cnt; i++) samples += d.getUint32(stts.body + 8 + i * 8); if (kind === 'vide' && secs) L.push(`  Frame rate: ${(samples / secs).toFixed(3)} fps (${samples} frames)`); }
    if (stsz) { const fixed = d.getUint32(stsz.body + 4), cnt = d.getUint32(stsz.body + 8); let bytes = fixed * cnt; if (!fixed) for (let i = 0; i < cnt; i++) bytes += d.getUint32(stsz.body + 12 + i * 4); if (secs) L.push(`  Average bitrate: ${Math.round((bytes * 8) / secs / 1000)} kbit/s`); }
    L.push(`  Duration: ${secs.toFixed(3)} s`); out.push(...L);
  }
  return out;
}
function webmInfo(buf) {
  const out = ['Container: WebM / Matroska'], d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); let scale = 1e6, dur = 0, tr = null; const tracks = [];
  const uint = (el) => { let v = 0; for (let i = el.body; i < el.end; i++) v = v * 256 + buf[i]; return v; };
  const str = (el) => String.fromCharCode(...buf.slice(el.body, el.end));
  const flt = (el) => (el.end - el.body === 4 ? d.getFloat32(el.body) : d.getFloat64(el.body));
  ebmlWalk(buf, 0, buf.length, (el) => {
    switch (el.id) {
      case 0x4282: out.push('DocType: ' + str(el)); break;
      case 0x2ad7b1: scale = uint(el); break;
      case 0x4489: dur = flt(el); break;
      case 0xae: tr = {}; tracks.push(tr); break;
      case 0x83: tr.type = uint(el); break; case 0x86: tr.codec = str(el); break; case 0x23e383: tr.dd = uint(el); break;
      case 0xb0: tr.w = uint(el); break; case 0xba: tr.h = uint(el); break; case 0xb5: tr.sr = flt(el); break; case 0x9f: tr.ch = uint(el); break;
    }
  });
  const secs = (dur * scale) / 1e9; if (secs) out.push(`Duration: ${secs.toFixed(3)} s`, `Average bitrate (whole file): ${Math.round((buf.length * 8) / secs / 1000)} kbit/s`); else out.push('Duration: not stored in this file (typical for browser recordings)');
  tracks.forEach((t, i) => { out.push(`Track ${i + 1}: ${t.type === 1 ? 'video' : t.type === 2 ? 'audio' : 'type ' + t.type}`, `  Codec: ${t.codec}`); if (t.w) out.push(`  Size: ${t.w}x${t.h}`); if (t.dd) out.push(`  Frame rate: ${(1e9 / t.dd).toFixed(3)} fps (declared)`); if (t.sr) out.push(`  Channels: ${t.ch || 1}, sample rate: ${t.sr} Hz`); });
  return out;
}
T.push({
  id: 'video-metadata-inspector', cat: 'Video', title: 'Video Metadata Inspector: Codec, Frame Rate, Bitrate and Duration', desc: 'Read container, codecs, resolution, frame rate, bitrate and duration of an MP4, MOV or WebM file without uploading it.',
  inputs: 0, file: { accept: 'video/*,.mkv,.mov,.mp4,.webm,.m4v' },
  run: async (_i, _o, files) => {
    const f = files && files[0]; if (!f) throw new Error('Choose a video file');
    const buf = new Uint8Array(await f.arrayBuffer()), out = [`File: ${f.name}`, `Size: ${(f.size / 1048576).toFixed(2)} MiB`];
    if (String.fromCharCode(...buf.slice(4, 8)).match(/^(ftyp|moov|free|mdat|wide)$/)) out.push(...mp4Info(buf));
    else if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) out.push(...webmInfo(buf));
    else throw new Error('Only MP4, MOV, M4V, WebM and MKV files are read here');
    return out.join('\n');
  },
});

// ---------- subtitle timing ----------
const tcFmt = (s) => { const ms = Math.round(s * 1000), h2 = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000); return `${String(h2).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
function srtRetime(src, fn) {
  const cues = parseCues(src); if (!cues.length) throw new Error('No SRT cues found');
  let n = 0; const out = [];
  for (const c of cues) { const s = fn(c.s), e = fn(c.e); if (e <= 0) continue; out.push(`${++n}\n${tcFmt(Math.max(0, s))} --> ${tcFmt(e)}\n${c.text}\n`); }
  return { text: out.join('\n'), dropped: cues.length - n, count: n };
}
T.push({
  id: 'subtitle-timing-sync', cat: 'Video', title: 'Subtitle Timing Shifter and Drift Fixer for SRT', desc: 'Delay or advance all SRT cues, or stretch them using two reference points to fix drift.',
  labels: ['SRT subtitles'], sample: '1\n00:00:01,000 --> 00:00:03,000\nHello there.\n\n2\n00:10:00,000 --> 00:10:04,000\nStill talking.\n',
  opts: [sel('mode', 'Mode', ['Shift by offset', 'Stretch with two reference points']), num('offset', 'Offset in seconds (negative = earlier)', 1.5), txt('o1', 'Point 1: time now (m:ss.ms)', '0:01'), txt('n1', 'Point 1: time it should be', '0:02.5'), txt('o2', 'Point 2: time now', '10:00'), txt('n2', 'Point 2: time it should be', '10:03')],
  run([src], o) {
    if (o.mode === 'Shift by offset') { return srtRetime(src, (t) => t + +o.offset).text; }
    const a1 = tparse(o.o1), b1 = tparse(o.n1), a2 = tparse(o.o2), b2 = tparse(o.n2); if (a1 === a2) throw new Error('The two "now" times must differ');
    const k = (b2 - b1) / (a2 - a1), c = b1 - k * a1; if (k <= 0) throw new Error('Reference points give a reversed timeline');
    return srtRetime(src, (t) => k * t + c).text;
  },
});

// ---------- interactive video tools: comparator, stop motion, teleprompter ----------
T.push({
  id: 'video-side-by-side-player', cat: 'Video', title: 'Synchronized Video Comparison Player', desc: 'Play two videos next to each other with one set of controls.', custom: true, dom: true,
  render(el) {
    const mk = (label) => { const inp = h('input', { type: 'file', accept: 'video/*', id: 'vs-' + label }); const v = h('video', { playsinline: true, muted: true, style: 'width:100%;background:#000', 'aria-label': `Video ${label}` }); return { inp, v, label }; };
    const A = mk('A'), B = mk('B');
    const play = h('button', { type: 'button' }, 'Play'), seekr = h('input', { type: 'range', min: 0, max: 1000, value: 0, 'aria-label': 'Seek position' });
    const time = h('span', { role: 'status', 'aria-live': 'off' }, '0:00 / 0:00'), rate = h('select', { id: 'vs-rate' }, ...['0.25', '0.5', '1', '1.5', '2'].map((r) => h('option', { value: r, ...(r === '1' ? { selected: true } : {}) }, r + 'x')));
    const off = h('input', { id: 'vs-off', type: 'number', value: 0, step: 0.01 }), audio = h('select', { id: 'vs-aud' }, h('option', { value: 'none' }, 'Muted'), h('option', { value: 'A' }, 'Sound from A'), h('option', { value: 'B' }, 'Sound from B'));
    const dur = () => Math.max(A.v.duration || 0, B.v.duration || 0);
    for (const x of [A, B]) x.inp.addEventListener('change', () => { if (x.inp.files[0]) x.v.src = URL.createObjectURL(x.inp.files[0]); });
    const sync = () => { const o = +off.value || 0; if (!B.v.paused || !A.v.paused) { const want = A.v.currentTime + o; if (Math.abs(B.v.currentTime - want) > 0.12) B.v.currentTime = Math.max(0, want); } };
    const setAudio = () => { A.v.muted = audio.value !== 'A'; B.v.muted = audio.value !== 'B'; };
    play.addEventListener('click', async () => { if (A.v.paused) { setAudio(); A.v.playbackRate = B.v.playbackRate = +rate.value; B.v.currentTime = Math.max(0, A.v.currentTime + (+off.value || 0)); await Promise.allSettled([A.v.play(), B.v.play()]); play.textContent = 'Pause'; } else { A.v.pause(); B.v.pause(); play.textContent = 'Play'; } });
    rate.addEventListener('change', () => { A.v.playbackRate = B.v.playbackRate = +rate.value; }); audio.addEventListener('change', setAudio);
    seekr.addEventListener('input', () => { const t = (seekr.value / 1000) * dur(); A.v.currentTime = t; B.v.currentTime = Math.max(0, t + (+off.value || 0)); });
    A.v.addEventListener('timeupdate', () => { sync(); seekr.value = dur() ? (A.v.currentTime / dur()) * 1000 : 0; time.textContent = `${fmt(A.v.currentTime)} / ${fmt(dur())}`; });
    A.v.addEventListener('ended', () => { B.v.pause(); play.textContent = 'Play'; });
    const step = (d) => h('button', { type: 'button', 'aria-label': `Step ${d > 0 ? 'forward' : 'back'} one frame (1/30 s)`, onclick: () => { A.v.pause(); B.v.pause(); play.textContent = 'Play'; A.v.currentTime += d / 30; B.v.currentTime = A.v.currentTime + (+off.value || 0); } }, d > 0 ? 'Frame +' : 'Frame -');
    el.append(h('p', { class: 'desc' }, 'Load two videos. They play, pause and seek together. Use the offset if B starts later or earlier than A. Nothing is uploaded.'),
      h('div', { class: 'row' }, h('label', { for: 'vs-A' }, 'Video A'), A.inp, h('label', { for: 'vs-B' }, 'Video B'), B.inp),
      h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' }, A.v, B.v),
      h('div', { class: 'row' }, play, step(-1), step(1), h('label', { for: 'vs-rate' }, 'Speed'), rate, h('label', { for: 'vs-aud' }, 'Audio'), audio, h('label', { for: 'vs-off' }, 'B offset (seconds)'), off),
      h('div', { class: 'row' }, h('label', {}, 'Position ', seekr), time));
  },
});

T.push({
  id: 'stop-motion-maker', cat: 'Video', title: 'Stop Motion Maker: Webcam Frames with Onion Skin', desc: 'Capture webcam frames one by one and compile them into a video.', custom: true, dom: true,
  render(el) {
    const vid = h('video', { autoplay: true, playsinline: true, muted: true, style: 'display:none' }), cv = h('canvas', { class: 'prev', width: 640, height: 480, role: 'img', 'aria-label': 'Camera preview with a faint copy of the previous frame' });
    const status = h('p', { role: 'status', class: 'desc' }), err = h('p', { role: 'alert', class: 'err' }), out = h('div');
    const fps = h('input', { id: 'sm-fps', type: 'number', value: 8, min: 1, max: 30 }), onion = h('input', { id: 'sm-onion', type: 'range', min: 0, max: 80, value: 40 });
    const frames = []; let stream = null, raf = 0;
    const loop = () => { const c = cv.getContext('2d'); if (vid.videoWidth) { if (cv.width !== vid.videoWidth) { cv.width = vid.videoWidth; cv.height = vid.videoHeight; } c.globalAlpha = 1; c.drawImage(vid, 0, 0); if (frames.length) { c.globalAlpha = +onion.value / 100; c.drawImage(frames[frames.length - 1], 0, 0); c.globalAlpha = 1; } } raf = requestAnimationFrame(loop); };
    const upd = () => { status.textContent = `${frames.length} frame${frames.length === 1 ? '' : 's'} captured, about ${(frames.length / Math.max(1, +fps.value)).toFixed(1)} s at ${fps.value} fps.`; };
    const start = h('button', { type: 'button' }, 'Start camera'), shot = h('button', { type: 'button' }, 'Capture frame'), undo = h('button', { type: 'button' }, 'Delete last frame'), make = h('button', { type: 'button' }, 'Make video');
    start.addEventListener('click', async () => { err.textContent = ''; try { stream = await navigator.mediaDevices.getUserMedia({ video: true }); vid.srcObject = stream; await vid.play(); cancelAnimationFrame(raf); loop(); start.disabled = true; } catch (e) { err.textContent = 'Camera not available: ' + e.message; } });
    shot.addEventListener('click', async () => { if (!vid.videoWidth) { err.textContent = 'Start the camera first'; return; } err.textContent = ''; frames.push(await createImageBitmap(vid)); upd(); });
    undo.addEventListener('click', () => { frames.pop(); upd(); });
    make.addEventListener('click', async () => {
      if (frames.length < 2) { err.textContent = 'Capture at least two frames'; return; } err.textContent = ''; out.replaceChildren(); make.disabled = true;
      try {
        const f = clamp(fps.value, 1, 30), mime = pickMime('webm'), rec = startRec({ w: even(frames[0].width), h: even(frames[0].height), fps: Math.max(f, 10), mime, audio: false }); const sig = { cancelled: false };
        await playFrames(rec, frames, f, sig); await new Promise((r) => setTimeout(r, 1000 / f)); const blob = await rec.finish();
        out.append(h('video', { controls: true, src: URL.createObjectURL(blob), style: 'max-width:100%', 'aria-label': 'Stop motion result' }), h('br'), download(blob, `stop-motion.${extOf(mime)}`));
      } catch (e) { err.textContent = e.message; } finally { make.disabled = false; }
    });
    el.append(h('p', { class: 'desc' }, 'Start the camera, place your subject, capture a frame, move it a little, repeat. A faint copy of the previous frame (onion skin) helps you line up the next one. The video is made in the browser and never uploaded.'), h('div', { class: 'row' }, start, shot, undo, make), h('div', { class: 'row' }, h('label', { for: 'sm-fps' }, 'Frames per second'), fps, h('label', { for: 'sm-onion' }, 'Onion skin strength'), onion), cv, vid, status, err, out);
    fps.addEventListener('input', upd); upd();
    new MutationObserver(() => { if (!el.isConnected) { cancelAnimationFrame(raf); stream && stream.getTracks().forEach((t) => t.stop()); } }).observe(document.body, { childList: true, subtree: true });
  },
});

T.push({
  id: 'teleprompter-recorder', cat: 'Video', title: 'Teleprompter Recorder: Read a Script While the Webcam Records', desc: 'Scroll a script over the webcam view while recording.', custom: true, dom: true,
  render(el) {
    const script = h('textarea', { id: 'tp-script', rows: 6 }); script.value = 'Paste your script here.\n\nPress Start camera, then Record. The text scrolls while you read. The scrolling text is not part of the recording.';
    const speed = h('input', { id: 'tp-speed', type: 'number', value: 40, min: 5, max: 300 }), size = h('input', { id: 'tp-size', type: 'number', value: 32, min: 14, max: 96 }), mirror = h('input', { id: 'tp-mirror', type: 'checkbox' }), mic = h('input', { id: 'tp-mic', type: 'checkbox', checked: true });
    const vid = h('video', { autoplay: true, playsinline: true, muted: true, style: 'width:100%;background:#000;display:block', 'aria-label': 'Camera preview' });
    const text = h('div', { style: 'position:absolute;left:0;right:0;top:0;padding:0 8%;color:#fff;text-shadow:0 0 4px #000,0 0 8px #000;white-space:pre-wrap;text-align:center;line-height:1.4;will-change:transform', 'aria-hidden': 'true' });
    const stage = h('div', { style: 'position:relative;overflow:hidden;max-width:720px' }, vid, h('div', { style: 'position:absolute;inset:0;overflow:hidden;pointer-events:none' }, text));
    const status = h('p', { role: 'status', class: 'desc' }), err = h('p', { role: 'alert', class: 'err' }), out = h('div');
    let stream = null, mr = null, chunks = [], raf = 0, y = 0, last = 0, scrolling = false;
    const render = () => { text.textContent = script.value; text.style.fontSize = size.value + 'px'; text.style.transform = `translateY(${-y}px) scaleX(${mirror.checked ? -1 : 1})`; };
    const tick = (t) => { if (scrolling) { y += ((t - last) / 1000) * +speed.value; render(); } last = t; raf = requestAnimationFrame(tick); };
    const start = h('button', { type: 'button' }, 'Start camera'), rec = h('button', { type: 'button' }, 'Record'), stop = h('button', { type: 'button', disabled: true }, 'Stop'), pause = h('button', { type: 'button' }, 'Pause scrolling'), reset = h('button', { type: 'button' }, 'Back to top');
    start.addEventListener('click', async () => { err.textContent = ''; try { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: mic.checked }); vid.srcObject = stream; start.disabled = true; } catch (e) { err.textContent = 'Camera not available: ' + e.message; } });
    rec.addEventListener('click', () => {
      if (!stream) { err.textContent = 'Start the camera first'; return; } err.textContent = ''; out.replaceChildren(); chunks = [];
      const mime = pickMime('webm'); mr = new MediaRecorder(stream, { mimeType: mime }); mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => { const b = new Blob(chunks, { type: mime.split(';')[0] }); out.append(h('video', { controls: true, src: URL.createObjectURL(b), style: 'max-width:100%', 'aria-label': 'Recording' }), h('br'), download(b, `teleprompter.${extOf(mime)}`)); status.textContent = 'Recording saved below.'; scrolling = false; };
      mr.start(500); scrolling = true; rec.disabled = true; stop.disabled = false; status.textContent = 'Recording...';
    });
    stop.addEventListener('click', () => { mr && mr.state !== 'inactive' && mr.stop(); rec.disabled = false; stop.disabled = true; });
    pause.addEventListener('click', () => { scrolling = !scrolling; pause.textContent = scrolling ? 'Pause scrolling' : 'Resume scrolling'; });
    reset.addEventListener('click', () => { y = 0; render(); });
    scrolling = false; render(); raf = requestAnimationFrame(tick);
    for (const c of [script, size, mirror]) c.addEventListener('input', render);
    el.append(h('p', { class: 'desc' }, 'Paste a script, start the camera, press Record and the text scrolls over the camera view. The recording contains only the camera and microphone, not the scrolling text. Nothing is uploaded.'), h('label', { for: 'tp-script' }, 'Script'), script,
      h('div', { class: 'row' }, h('label', { for: 'tp-speed' }, 'Scroll speed (px per second)'), speed, h('label', { for: 'tp-size' }, 'Text size (px)'), size, h('label', { for: 'tp-mirror' }, 'Mirror text'), mirror, h('label', { for: 'tp-mic' }, 'Record microphone'), mic),
      h('div', { class: 'row' }, start, rec, stop, pause, reset), stage, status, err, out);
    new MutationObserver(() => { if (!el.isConnected) { cancelAnimationFrame(raf); stream && stream.getTracks().forEach((t) => t.stop()); } }).observe(document.body, { childList: true, subtree: true });
  },
});

// ---------- colour math ----------
const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb = (l) => 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * Math.max(0, l) ** (1 / 2.4) - 0.055);
function parseColor(s) {
  s = String(s).trim().toLowerCase(); let m;
  if ((m = s.match(/^#?([0-9a-f]{3,8})$/)) && [3, 4, 6, 8].includes(m[1].length)) { let x = m[1]; if (x.length <= 4) x = [...x].map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); }
  if ((m = s.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/))) return [+m[1], +m[2], +m[3]].map((v) => clamp(v, 0, 255));
  if ((m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[ ,]+([\d.]+)%[ ,]+([\d.]+)%/))) return hsl2rgb(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^oklch\(\s*([\d.]+)(%?)[ ,]+([\d.]+)[ ,]+([\d.]+)/))) return oklab2rgb(...lch2lab(+m[1] / (m[2] ? 100 : 1), +m[3], +m[4]));
  throw new Error(`Cannot read colour "${s}". Use #rrggbb, rgb(), hsl() or oklch().`);
}
function hsl2rgb(hh, s, l) { hh = ((hh % 360) + 360) % 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100; const a = s * Math.min(l, 1 - l), f = (n) => { const k = (n + hh / 30) % 12; return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255; }; return [f(0), f(8), f(4)]; }
function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const M = Math.max(r, g, b), mn = Math.min(r, g, b), d = M - mn, l = (M + mn) / 2, s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); let hh = 0; if (d) hh = M === r ? ((g - b) / d) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4; return [(hh * 60 + 360) % 360, s * 100, l * 100]; }
function rgb2oklab(rgb) {
  const [r, g, b] = rgb.map(toLin), l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function oklabLin(L, a, b) { const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3; return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]; }
const oklab2rgb = (L, a, b) => oklabLin(L, a, b).map((v) => clamp(toSrgb(v), 0, 255));
const lab2lch = (L, a, b) => [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
const lch2lab = (L, c, hh) => [L, c * Math.cos((hh * Math.PI) / 180), c * Math.sin((hh * Math.PI) / 180)];
const inGamut = (lin) => lin.every((v) => v >= -0.0005 && v <= 1.0005);
// highest chroma <= c that fits sRGB at this lightness and hue
function fitChroma(L, c, hh) { if (inGamut(oklabLin(...lch2lab(L, c, hh)))) return c; let lo = 0, hi = c; for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(oklabLin(...lch2lab(L, mid, hh)))) lo = mid; else hi = mid; } return lo; }
const okRgb = (L, c, hh) => oklab2rgb(...lch2lab(L, fitChroma(clamp(L, 0, 1), c, hh), hh));
const lumOf = (rgb) => { const [r, g, b] = rgb.map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rgb2xyz = (rgb) => { const [r, g, b] = rgb.map(toLin); return [0.4124564 * r + 0.3575761 * g + 0.1804375 * b, 0.2126729 * r + 0.7151522 * g + 0.072175 * b, 0.0193339 * r + 0.119192 * g + 0.9503041 * b]; };
const xyz2rgb = (X, Y, Z) => [3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z, -0.969266 * X + 1.8760108 * Y + 0.041556 * Z, 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z].map((v) => clamp(toSrgb(v), 0, 255));
function rgb2lab(rgb) { const w = [0.95047, 1, 1.08883], f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116), [fx, fy, fz] = rgb2xyz(rgb).map((v, i) => f(v / w[i])); return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]; }
function lab2rgb(L, a, b) { const w = [0.95047, 1, 1.08883], fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200, inv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27)); return xyz2rgb(inv(fx) * w[0], inv(fy) * w[1], inv(fz) * w[2]); }
const dE = (a, b) => { const x = rgb2oklab(a), y = rgb2oklab(b); return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
const CVD = { protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]], deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]], tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]] };
const simCvd = (rgb, k) => { const l = rgb.map(toLin); return CVD[k].map((r) => clamp(toSrgb(r[0] * l[0] + r[1] * l[1] + r[2] * l[2]), 0, 255)); };
const swatchHtml = (cols, extra = '') => `<!doctype html><meta charset="utf-8"><style>body{margin:8px;font:13px system-ui,sans-serif}.s{display:inline-block;width:110px;margin:4px;border:1px solid #8886;border-radius:6px;overflow:hidden;vertical-align:top}.s i{display:block;height:64px}.s b{display:block;padding:4px 6px;font:12px monospace}</style>${cols.map((c) => `<div class="s"><i style="background:${c.hex}"></i><b>${esc(c.label || c.hex)}</b></div>`).join('')}${extra}`;
const colorsIn = (s) => lines(s).map((l) => { const m = l.match(/^(.*?)[\s:,=]+(#[0-9a-f]{3,8}|(?:rgb|hsl|oklch)a?\([^)]*\))$/i) || l.match(/^()(\S.*)$/); const name = (m[1] || '').trim(); return { name, rgb: parseColor(m[2]), src: m[2] }; });

// ---------- colour tools ----------
T.push({
  id: 'color-picker', cat: 'Color', title: 'Color Picker with HEX, RGB, HSL and OKLCH Values', desc: 'Pick a colour or type one and copy it in HEX, RGB, HSL and OKLCH.', custom: true, dom: true,
  render(el) {
    const pick = h('input', { type: 'color', id: 'cp-pick', value: '#3b82f6', 'aria-label': 'Colour picker' }), text = h('input', { type: 'text', id: 'cp-text', value: '#3b82f6' }), out = h('div'), err = h('p', { role: 'alert', class: 'err' }), sw = h('div', { style: 'height:64px;border:1px solid #8886;border-radius:6px', role: 'img', 'aria-label': 'Selected colour' });
    const show = (rgb) => {
      const hex = hexOf(rgb), [hh, s, l] = rgb2hsl(...rgb), [L, a, b] = rgb2oklab(rgb), [, C, H] = lab2lch(L, a, b);
      const rows = [['HEX', hex], ['RGB', `rgb(${rgb.map(Math.round).join(' ')})`], ['HSL', `hsl(${Math.round(hh)} ${Math.round(s)}% ${Math.round(l)}%)`], ['OKLCH', `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${C < 0.002 ? 0 : H.toFixed(1)})`]];
      sw.style.background = hex; sw.setAttribute('aria-label', `Selected colour ${hex}`);
      out.replaceChildren(...rows.map(([k, v]) => h('div', { class: 'row' }, h('code', {}, `${k.padEnd(6)} ${v}`), h('button', { type: 'button', 'aria-label': `Copy ${k} value`, onclick: () => navigator.clipboard && navigator.clipboard.writeText(v) }, 'Copy'))));
    };
    pick.addEventListener('input', () => { text.value = pick.value; err.textContent = ''; show(parseColor(pick.value)); });
    text.addEventListener('input', () => { try { const c = parseColor(text.value); pick.value = hexOf(c.map(Math.round)); err.textContent = ''; show(c); } catch (e) { err.textContent = e.message; } });
    el.append(h('div', { class: 'row' }, h('label', { for: 'cp-pick' }, 'Pick'), pick, h('label', { for: 'cp-text' }, 'Or type a colour (HEX, rgb(), hsl(), oklch())'), text), err, sw, out); show(parseColor('#3b82f6'));
  },
});

T.push({
  id: 'palette-shuffler', cat: 'Color', title: 'Palette Shuffler with Locked Colors', desc: 'Shuffle a palette and lock the colours you want to keep.', custom: true, dom: true,
  render(el) {
    const mode = h('select', { id: 'ps-mode' }, ...['Any colours', 'Analogous', 'Complementary', 'Triadic', 'Pastel', 'Dark'].map((x) => h('option', {}, x))), count = h('input', { id: 'ps-n', type: 'number', value: 5, min: 2, max: 10 });
    let cols = [], locks = []; const box = h('div', { class: 'row' }), list = h('pre', { class: 'out' });
    const rnd = (a, b) => a + Math.random() * (b - a);
    function gen(i, base) {
      const m = mode.value; let hh = rnd(0, 360), L = rnd(0.45, 0.85), C = rnd(0.05, 0.18);
      if (m === 'Analogous') hh = base + rnd(-35, 35); else if (m === 'Complementary') hh = base + (i % 2 ? 180 : 0) + rnd(-15, 15); else if (m === 'Triadic') hh = base + (i % 3) * 120 + rnd(-10, 10); else if (m === 'Pastel') { L = rnd(0.82, 0.95); C = rnd(0.03, 0.08); } else if (m === 'Dark') { L = rnd(0.2, 0.45); C = rnd(0.04, 0.14); }
      return hexOf(okRgb(L, C, ((hh % 360) + 360) % 360).map(Math.round));
    }
    function draw() {
      box.replaceChildren(...cols.map((c, i) => { const rgb = parseColor(c), dark = lumOf(rgb) < 0.179; return h('div', { style: `background:${c};color:${dark ? '#fff' : '#000'};padding:10px;min-width:96px;border-radius:6px;text-align:center` }, h('div', { style: 'font:13px monospace' }, c), h('label', { style: 'color:inherit;display:flex;gap:4px;justify-content:center;align-items:center' }, h('input', { type: 'checkbox', checked: locks[i], 'aria-label': `Lock colour ${i + 1} (${c})`, onchange: (e) => { locks[i] = e.target.checked; } }), 'Lock')); }));
      list.textContent = cols.join('\n');
    }
    function shuffle() { const n = clamp(count.value, 2, 10) | 0, base = Math.random() * 360; while (cols.length < n) { cols.push('#000000'); locks.push(false); } cols.length = n; locks.length = n; cols = cols.map((c, i) => (locks[i] ? c : gen(i, base))); draw(); }
    const btn = h('button', { type: 'button' }, 'Shuffle unlocked colours');
    btn.addEventListener('click', shuffle);
    el.append(h('div', { class: 'row' }, h('label', { for: 'ps-mode' }, 'Style'), mode, h('label', { for: 'ps-n' }, 'Colours'), count, btn), box, h('p', { class: 'desc' }, 'Locked colours stay when you shuffle. The list below can be copied.'), list); shuffle();
  },
});

T.push({
  id: 'color-harmony-wheel', cat: 'Color', title: 'Color Harmony Wheel: Complementary, Triadic and Analogous', desc: 'See colour schemes on a wheel and move the base hue.', custom: true, dom: true,
  render(el) {
    const SCH = { Complementary: [0, 180], 'Split complementary': [0, 150, 210], Analogous: [-30, 0, 30], Triadic: [0, 120, 240], Tetradic: [0, 90, 180, 270], Monochromatic: [0] };
    const hue = h('input', { id: 'hw-hue', type: 'range', min: 0, max: 359, value: 210 }), hueN = h('input', { id: 'hw-hn', type: 'number', min: 0, max: 359, value: 210 }), sat = h('input', { id: 'hw-c', type: 'number', min: 0, max: 0.35, step: 0.01, value: 0.15 }), lig = h('input', { id: 'hw-l', type: 'number', min: 0.1, max: 0.95, step: 0.05, value: 0.65 }), sch = h('select', { id: 'hw-s' }, ...Object.keys(SCH).map((k) => h('option', {}, k)));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '-110 -110 220 220'); svg.setAttribute('width', 260); svg.setAttribute('role', 'img'); svg.style.touchAction = 'none';
    const list = h('div'), status = h('p', { role: 'status', class: 'desc' });
    const S = (tag, a) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
    function draw() {
      const base = +hue.value, off = SCH[sch.value], C = +sat.value, L = +lig.value; svg.replaceChildren();
      for (let a = 0; a < 360; a += 4) { const r0 = a * Math.PI / 180, r1 = (a + 4.5) * Math.PI / 180; svg.append(S('path', { d: `M${70 * Math.cos(r0)} ${-70 * Math.sin(r0)}L${100 * Math.cos(r0)} ${-100 * Math.sin(r0)}L${100 * Math.cos(r1)} ${-100 * Math.sin(r1)}L${70 * Math.cos(r1)} ${-70 * Math.sin(r1)}Z`, fill: hexOf(okRgb(L, Math.max(C, 0.1), a).map(Math.round)) })); }
      const cols = off.map((o) => ((base + o) % 360 + 360) % 360), hexes = cols.map((x) => hexOf(okRgb(L, C, x).map(Math.round)));
      cols.forEach((x, i) => { const r = x * Math.PI / 180; svg.append(S('line', { x1: 0, y1: 0, x2: 62 * Math.cos(r), y2: -62 * Math.sin(r), stroke: '#8888', 'stroke-width': 1 }), S('circle', { cx: 62 * Math.cos(r), cy: -62 * Math.sin(r), r: i ? 9 : 12, fill: hexes[i], stroke: '#fff', 'stroke-width': 2 })); });
      svg.setAttribute('aria-label', `Colour wheel, ${sch.value} scheme from hue ${base} degrees: ${hexes.join(', ')}`);
      list.replaceChildren(...hexes.map((x, i) => h('div', { class: 'row' }, h('span', { style: `display:inline-block;width:28px;height:28px;background:${x};border:1px solid #8886`, 'aria-hidden': 'true' }), h('code', {}, `${x}  hue ${Math.round(cols[i])}`))));
      status.textContent = `${hexes.length} colours: ${hexes.join(' ')}`;
    }
    const setHue = (e) => { const r = svg.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2); hue.value = hueN.value = Math.round(((Math.atan2(-y, x) * 180 / Math.PI) + 360) % 360) % 360; draw(); };
    let drag = false; svg.addEventListener('pointerdown', (e) => { drag = true; svg.setPointerCapture(e.pointerId); setHue(e); }); svg.addEventListener('pointermove', (e) => drag && setHue(e)); svg.addEventListener('pointerup', () => { drag = false; });
    hue.addEventListener('input', () => { hueN.value = hue.value; draw(); }); hueN.addEventListener('input', () => { hue.value = clamp(hueN.value, 0, 359); draw(); }); for (const c of [sat, lig, sch]) c.addEventListener('input', draw);
    el.append(h('p', { class: 'desc' }, 'Drag on the wheel, or use the hue slider or number field (the keyboard alternative). Colours use OKLCH, so equal lightness and chroma look evenly bright.'), h('div', { class: 'row' }, h('label', { for: 'hw-s' }, 'Scheme'), sch, h('label', { for: 'hw-hue' }, 'Base hue'), hue, h('label', { for: 'hw-hn' }, 'Hue degrees'), hueN, h('label', { for: 'hw-c' }, 'Chroma'), sat, h('label', { for: 'hw-l' }, 'Lightness'), lig), svg, list, status); draw();
  },
});

T.push({
  id: 'mesh-gradient-image', cat: 'Color', title: 'Mesh Gradient Image Maker: PNG and SVG Backgrounds', desc: 'Place coloured points on a canvas and export a soft blended PNG or SVG.', dom: true,
  labels: ['Points: x% y% colour [radius%], one per line'], sample: '15% 20% #ff6b6b 60\n85% 15% #feca57 55\n70% 85% #48dbfb 65\n20% 80% #5f27cd 60',
  opts: [num('w', 'Width (px)', 1200), num('h', 'Height (px)', 630), txt('bg', 'Background colour', '#1e1b4b'), sel('out', 'Preview and download', ['PNG', 'SVG'])],
  run([src], o) {
    const W = clamp(o.w, 16, 4096) | 0, H = clamp(o.h, 16, 4096) | 0, bg = parseColor(o.bg), pts = lines(src).map((l) => { const m = l.match(/^([\d.]+)%?\s+([\d.]+)%?\s+(\S+(?:\([^)]*\))?)(?:\s+([\d.]+)%?)?$/); if (!m) throw new Error(`Bad line "${l}". Use: x% y% colour radius%`); return { x: clamp(+m[1], 0, 100) / 100 * W, y: clamp(+m[2], 0, 100) / 100 * H, rgb: parseColor(m[3]), r: clamp(m[4] || 60, 5, 200) / 100 * Math.max(W, H) }; });
    if (!pts.length) throw new Error('Add at least one point');
    const hexs = (c) => hexOf(c.map(Math.round)), rg = (c, a) => `rgba(${c.map(Math.round).join(',')},${a})`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${pts.map((p, i) => `<radialGradient id="g${i}" gradientUnits="userSpaceOnUse" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r.toFixed(1)}"><stop offset="0" stop-color="${hexs(p.rgb)}"/><stop offset="1" stop-color="${hexs(p.rgb)}" stop-opacity="0"/></radialGradient>`).join('')}</defs><rect width="${W}" height="${H}" fill="${hexs(bg)}"/>${pts.map((_, i) => `<rect width="${W}" height="${H}" fill="url(#g${i})"/>`).join('')}</svg>`;
    if (o.out === 'SVG') return { text: svg, blob: new Blob([svg], { type: 'image/svg+xml' }), filename: 'mesh-gradient.svg' };
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d'); cx.fillStyle = hexs(bg); cx.fillRect(0, 0, W, H);
    for (const p of pts) { const g = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r); g.addColorStop(0, rg(p.rgb, 1)); g.addColorStop(1, rg(p.rgb, 0)); cx.fillStyle = g; cx.fillRect(0, 0, W, H); }
    return new Promise((res) => cv.toBlob((b) => res({ blob: b, filename: 'mesh-gradient.png', text: `${W}x${H} PNG, ${pts.length} points. Switch the output to SVG for a vector file.` }), 'image/png'));
  },
});

T.push({
  id: 'multi-color-blender', cat: 'Color', title: 'Multi-Color Blender: Mix by Weight in sRGB, Linear, Lab and OKLCH', desc: 'Blend two or more colours by weight and compare four colour spaces.',
  labels: ['Colours with weights, one per line: colour weight'], sample: '#ff0000 1\n#0000ff 1\n#ffff00 2',
  run([src]) {
    const items = lines(src).map((l) => { const m = l.match(/^(.*?)(?:\s+([\d.]+))?$/); return { rgb: parseColor(m[1]), w: m[2] === undefined ? 1 : +m[2] }; }); if (items.length < 2) throw new Error('Enter at least two colours'); const tot = items.reduce((s, i) => s + i.w, 0); if (!(tot > 0)) throw new Error('Weights must add up to more than 0');
    const avg = (f) => items.reduce((s, i) => { const v = f(i.rgb); return s.map((x, k) => x + (v[k] * i.w) / tot); }, [0, 0, 0]);
    const hv = (f) => { let x = 0, y = 0, c = 0; for (const i of items) { const [, C, H] = f(i.rgb); x += Math.cos((H * Math.PI) / 180) * C * i.w; y += Math.sin((H * Math.PI) / 180) * C * i.w; c += C * i.w; } return [Math.atan2(y, x) * 180 / Math.PI, c / tot]; };
    const res = [], put = (n, rgb) => res.push({ label: n, hex: hexOf(rgb.map(Math.round)) });
    put('sRGB (gamma encoded values)', avg((c) => c));
    put('Linear RGB (light)', avg((c) => c.map(toLin)).map(toSrgb));
    put('CIE Lab (D65)', lab2rgb(...avg(rgb2lab)));
    put('OKLab', oklab2rgb(...avg(rgb2oklab)));
    const [L, , ] = avg(rgb2oklab), [hh, C] = hv((c) => lab2lch(...rgb2oklab(c))); put('OKLCH (hue by chroma-weighted mean)', okRgb(L, C, ((hh % 360) + 360) % 360));
    return { text: res.map((r) => `${r.hex}  ${r.label}`).join('\n') + '\n\nSame inputs, different maths: results differ because each space averages a different quantity. Linear RGB mixes light; Lab and OKLab mix perceived lightness. Out-of-range colours are clipped to sRGB.', html: swatchHtml(res.map((r) => ({ hex: r.hex, label: r.hex + ' ' + r.label.split(' ')[0] }))) };
  },
});

// Moves lightness (OKLCH, hue and chroma kept as far as sRGB allows) until the contrast target is reached.
function fixAgainst(rgb, bg, target) {
  if (ratio(rgb, bg) >= target) return { rgb, moved: 0 };
  const [L0, a, b] = rgb2oklab(rgb), [, C0, H] = lab2lch(L0, a, b); let best = null;
  for (const dir of [-1, 1]) {
    let lo = 0, hi = 1; const at = (t) => okRgb(clamp(L0 + dir * t * (dir < 0 ? L0 : 1 - L0), 0, 1), C0, H);
    if (ratio(at(1), bg) < target) continue;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (ratio(at(mid), bg) >= target) hi = mid; else lo = mid; }
    let t = hi, out = at(t).map(Math.round); for (let k = 0; k < 40 && ratio(out, bg) < target; k++) { t = Math.min(1, t + 0.003); out = at(t).map(Math.round); } // rounding to 8 bits can lose a hair of contrast
    const d = Math.abs(rgb2oklab(out)[0] - L0); if (ratio(out, bg) >= target && (!best || d < best.moved)) best = { rgb: out, moved: d };
  }
  return best;
}
T.push({
  id: 'accessible-palette-fixer', cat: 'Color', title: 'Accessible Palette Fixer: Nudge Colors to Meet WCAG Contrast', desc: 'Adjust lightness of palette colours until they reach a contrast target on a background.',
  labels: ['Palette (one colour per line, optional name first)'], sample: 'brand #4f8cff\naccent #ffb703\nsuccess #2fbf71\nmuted #9aa0a6',
  opts: [txt('bg', 'Background colour', '#ffffff'), sel('target', 'Target', ['4.5 (AA text)', '3 (AA large text, UI)', '7 (AAA text)'])],
  run([src], o) {
    const bg = parseColor(o.bg), t = parseFloat(o.target), rows = colorsIn(src).map((c) => { const f = fixAgainst(c.rgb, bg, t); return { c, f }; });
    return { text: rows.map(({ c, f }) => f ? `${(c.name || '').padEnd(10)} ${hexOf(c.rgb.map(Math.round))} (${ratio(c.rgb, bg).toFixed(2)}) -> ${hexOf(f.rgb.map(Math.round))} (${ratio(f.rgb, bg).toFixed(2)})  lightness moved ${(f.moved * 100).toFixed(1)} points` : `${(c.name || '').padEnd(10)} ${hexOf(c.rgb.map(Math.round))} cannot reach ${t}:1 on this background`).join('\n') + '\n\nContrast is the WCAG 2 relative luminance ratio. Hue and chroma are kept as far as sRGB allows, so the colour can look less saturated. Review the result by eye.',
      html: swatchHtml(rows.flatMap(({ c, f }) => [{ hex: hexOf(c.rgb.map(Math.round)), label: 'was ' + hexOf(c.rgb.map(Math.round)) }, ...(f ? [{ hex: hexOf(f.rgb.map(Math.round)), label: 'now ' + hexOf(f.rgb.map(Math.round)) }] : [])]).map((x) => ({ ...x })), '').replace('<style>', `<style>body{background:${o.bg}}`) };
  },
});

T.push({
  id: 'duotone-generator', cat: 'Color', title: 'Duotone Image Generator: Map a Photo to Two Colors', desc: 'Map the tones of a photo between a shadow colour and a highlight colour.', dom: true, inputs: 0, file: { accept: 'image/*' },
  opts: [txt('shadow', 'Shadow colour', '#1b1464'), txt('light', 'Highlight colour', '#ffd166'), num('contrast', 'Contrast (50 to 200, 100 = none)', 100), sel('fmt', 'Format', ['PNG', 'JPG'])],
  run: async (_i, o, files) => {
    const f = files && files[0]; if (!f) throw new Error('Choose an image'); const a = parseColor(o.shadow), b = parseColor(o.light), k = clamp(o.contrast, 50, 200) / 100;
    const bmp = await createImageBitmap(f), cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; const cx = cv.getContext('2d'); cx.drawImage(bmp, 0, 0);
    const im = cx.getImageData(0, 0, cv.width, cv.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) { let y = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; y = clamp((y - 0.5) * k + 0.5, 0, 1); for (let c = 0; c < 3; c++) d[i + c] = a[c] + (b[c] - a[c]) * y; }
    cx.putImageData(im, 0, 0); const png = o.fmt === 'PNG';
    return new Promise((res) => cv.toBlob((bl) => res({ blob: bl, filename: `duotone.${png ? 'png' : 'jpg'}`, text: `${cv.width}x${cv.height}. Luminance (Rec. 709 weights on gamma values) is mapped linearly from ${hexOf(a)} to ${hexOf(b)}.` }), png ? 'image/png' : 'image/jpeg', 0.92));
  },
});

// ---------- palette exporter ----------
function aseBytes(items) {
  const enc = (s) => { const u = new Uint8Array((s.length + 1) * 2); for (let i = 0; i < s.length; i++) { u[i * 2] = s.charCodeAt(i) >> 8; u[i * 2 + 1] = s.charCodeAt(i) & 255; } return u; };
  const parts = [], head = new DataView(new ArrayBuffer(12)); [...'ASEF'].forEach((c, i) => head.setUint8(i, c.charCodeAt(0))); head.setUint16(4, 1); head.setUint16(6, 0); head.setUint32(8, items.length); parts.push(new Uint8Array(head.buffer));
  for (const it of items) {
    const nm = enc(it.name), len = 2 + nm.length + 4 + 12 + 2;
    const b = new DataView(new ArrayBuffer(2 + 4 + len)); let p = 0; b.setUint16(p, 1); p += 2; b.setUint32(p, len); p += 4; b.setUint16(p, it.name.length + 1); p += 2; new Uint8Array(b.buffer).set(nm, p); p += nm.length;
    [...'RGB '].forEach((c, i) => b.setUint8(p + i, c.charCodeAt(0))); p += 4; it.rgb.forEach((v) => { b.setFloat32(p, Math.round(v) / 255); p += 4; }); b.setUint16(p, 2); parts.push(new Uint8Array(b.buffer));
  }
  return new Blob(parts, { type: 'application/octet-stream' });
}
T.push({
  id: 'palette-exporter', cat: 'Color', title: 'Palette Exporter: Adobe ASE, GIMP GPL, CSS Variables and Tailwind', desc: 'Turn a list of colours into a swatch file or code.', dom: false,
  labels: ['Palette, one per line (name colour, or just colour)'], sample: 'Ink #1b1b2f\nBrand #4f8cff\nAccent #ffb703\nPaper #f8f9fb',
  opts: [sel('fmt', 'Format', ['CSS variables', 'Tailwind config', 'GIMP palette (.gpl)', 'Adobe Swatch Exchange (.ase)', 'JSON']), txt('name', 'Palette name', 'My palette')],
  run([src], o) {
    const items = colorsIn(src).map((c, i) => ({ name: c.name || `Color ${i + 1}`, rgb: c.rgb.map(Math.round), hex: hexOf(c.rgb.map(Math.round)) })); if (!items.length) throw new Error('Enter at least one colour');
    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'color';
    switch (o.fmt) {
      case 'CSS variables': return `:root {\n${items.map((i) => `  --${slug(i.name)}: ${i.hex};`).join('\n')}\n}`;
      case 'Tailwind config': return `// tailwind.config.js\nexport default {\n  theme: {\n    extend: {\n      colors: {\n${items.map((i) => `        '${slug(i.name)}': '${i.hex}',`).join('\n')}\n      },\n    },\n  },\n};`;
      case 'JSON': return JSON.stringify(Object.fromEntries(items.map((i) => [i.name, i.hex])), null, 2);
      case 'GIMP palette (.gpl)': { const t = `GIMP Palette\nName: ${o.name}\nColumns: 0\n#\n${items.map((i) => `${String(i.rgb[0]).padStart(3)} ${String(i.rgb[1]).padStart(3)} ${String(i.rgb[2]).padStart(3)}\t${i.name}`).join('\n')}\n`; return { text: t, blob: new Blob([t], { type: 'text/plain' }), filename: slug(o.name) + '.gpl' }; }
      default: return { text: `${items.length} colours written as RGB entries (float 0 to 1). Download the .ase file and import it in an Adobe app. Not opened in Adobe software by the author of this tool; the byte layout follows the published ASE structure.`, blob: aseBytes(items), filename: slug(o.name) + '.ase' };
    }
  },
});

// ---------- colour temperature ----------
// Krystek (1985) rational approximation of the Planckian locus in CIE 1960 (u,v), valid about 1000 to 15000 K.
function kelvinToRgb(K) {
  K = clamp(K, 1000, 15000);
  const u = (0.860117757 + 1.54118254e-4 * K + 1.28641212e-7 * K * K) / (1 + 8.4242023e-4 * K + 7.08145163e-7 * K * K), v = (0.317398726 + 4.22806245e-5 * K + 4.20481691e-8 * K * K) / (1 - 2.89741816e-5 * K + 1.61456053e-7 * K * K);
  const d = 2 * u - 8 * v + 4, x = (3 * u) / d, y = (2 * v) / d, X = x / y, Z = (1 - x - y) / y;
  const lin = [3.2404542 * X - 1.5371385 - 0.4985314 * Z, -0.969266 * X + 1.8760108 + 0.041556 * Z, 0.0556434 * X - 0.2040259 + 1.0572252 * Z].map((c) => Math.max(0, c)), mx = Math.max(...lin);
  return { rgb: lin.map((c) => clamp(toSrgb(c / mx), 0, 255)), x, y };
}
T.push({
  id: 'color-temperature-visualizer', cat: 'Color', title: 'Color Temperature Visualizer: Kelvin to RGB', desc: 'See the colour of light for a Kelvin value from 1000 to 15000 K.', custom: true, dom: true,
  render(el) {
    const rng = h('input', { type: 'range', id: 'kt-r', min: 1000, max: 15000, step: 100, value: 6500 }), n = h('input', { type: 'number', id: 'kt-n', min: 1000, max: 15000, step: 50, value: 6500 }), sw = h('div', { style: 'height:90px;border:1px solid #8886;border-radius:6px', role: 'img' }), out = h('p', { role: 'status' }), tbl = h('table');
    const upd = (K) => { const { rgb, x, y } = kelvinToRgb(K), hex = hexOf(rgb.map(Math.round)); sw.style.background = hex; sw.setAttribute('aria-label', `Light colour at ${K} K: ${hex}`); out.textContent = `${K} K: ${hex}  rgb(${rgb.map(Math.round).join(', ')})  chromaticity x ${x.toFixed(4)}, y ${y.toFixed(4)}`; };
    rng.addEventListener('input', () => { n.value = rng.value; upd(+rng.value); }); n.addEventListener('input', () => { const k = clamp(n.value, 1000, 15000); rng.value = k; upd(k); });
    tbl.append(h('tr', {}, h('th', {}, 'Kelvin'), h('th', {}, 'HEX'), h('th', {}, 'Sample')), ...[1500, 2700, 3000, 4000, 5000, 6500, 8000, 10000, 12000].map((k) => { const hx = hexOf(kelvinToRgb(k).rgb.map(Math.round)); return h('tr', {}, h('td', {}, k + ' K'), h('td', {}, hx), h('td', { style: `background:${hx};min-width:60px` })); }));
    el.append(h('p', { class: 'desc' }, 'Approximate colour of a black body radiator, scaled so the brightest channel is 255. Real lamps and screens differ, so use it as a guide.'), h('div', { class: 'row' }, h('label', { for: 'kt-r' }, 'Kelvin'), rng, h('label', { for: 'kt-n' }, 'Value'), n), sw, out, tbl); upd(6500);
  },
});

// ---------- paint mixer (Kubelka-Munk per channel) ----------
const ks = (R) => { R = clamp(R, 0.04, 0.995); return ((1 - R) ** 2) / (2 * R); };
const unks = (k) => 1 + k - Math.sqrt(k * k + 2 * k);
function paintMix(items) { const tot = items.reduce((s, i) => s + i.w, 0); return [0, 1, 2].map((c) => unks(items.reduce((s, i) => s + (ks(i.rgb[c] / 255) * i.w) / tot, 0)) * 255); }
T.push({
  id: 'paint-color-mixer', cat: 'Color', title: 'Paint Color Mixer: Pigment-Style Subtractive Mixing', desc: 'Mix paint colours so that blue and yellow make green.',
  labels: ['Paints with parts, one per line: colour parts'], sample: '#0047ab 1\n#fedc00 1',
  run([src]) {
    const items = lines(src).map((l) => { const m = l.match(/^(.*?)(?:\s+([\d.]+))?$/); return { rgb: parseColor(m[1]), w: m[2] === undefined ? 1 : +m[2] }; }); if (items.length < 2) throw new Error('Enter at least two paints'); if (items.some((i) => !(i.w >= 0)) || !items.some((i) => i.w > 0)) throw new Error('Parts must be positive numbers');
    const tot = items.reduce((s, i) => s + i.w, 0), mix = paintMix(items), scr = [0, 1, 2].map((c) => items.reduce((s, i) => s + (i.rgb[c] * i.w) / tot, 0));
    const a = hexOf(mix.map(Math.round)), b = hexOf(scr.map(Math.round));
    return { text: `Pigment-style mix: ${a}\nScreen average (for comparison): ${b}\n\nModel: Kubelka-Munk absorption over scattering per red, green and blue channel, equal tinting strength for every paint. Real paints depend on measured pigment spectra, opacity and medium, so treat this as an illustration, not a recipe.`, html: swatchHtml([{ hex: a, label: a + ' pigment mix' }, { hex: b, label: b + ' screen average' }, ...items.map((i) => ({ hex: hexOf(i.rgb.map(Math.round)), label: `${hexOf(i.rgb.map(Math.round))} x${i.w}` }))]) };
  },
});

T.push({
  id: 'color-hue-quiz', cat: 'Color', title: 'Color Hue Quiz: Find the Odd Swatch', desc: 'Spot the swatch that differs slightly; differences shrink each round.', custom: true, dom: true,
  render(el) {
    const grid = h('div', { role: 'group', 'aria-label': 'Colour swatches', style: 'display:grid;grid-template-columns:repeat(3,72px);gap:6px;margin:10px 0' }), status = h('p', { role: 'status' }), start = h('button', { type: 'button' }, 'Start new game');
    let round = 0, d = 0.1, miss = 0, odd = 0, best = 1;
    const ROUNDS = 12;
    function next() {
      if (round >= ROUNDS || miss >= 3) { grid.replaceChildren(); status.textContent = `Game over. Score ${round - miss} of ${round} rounds correct. Smallest difference you found: ${(best * 100).toFixed(1)} (OKLab lightness points).`; return; }
      const hh = Math.random() * 360, L = 0.6 + Math.random() * 0.2, C = 0.06 + Math.random() * 0.1, sign = Math.random() < 0.5 ? -1 : 1; odd = Math.floor(Math.random() * 9);
      const base = hexOf(okRgb(L, C, hh).map(Math.round)), diff = hexOf(okRgb(L + sign * d, C, hh).map(Math.round));
      grid.replaceChildren(...Array.from({ length: 9 }, (_, i) => h('button', { type: 'button', style: `width:72px;height:72px;border:1px solid #8886;border-radius:6px;background:${i === odd ? diff : base}`, 'aria-label': `Swatch ${i + 1} of 9`, onclick: () => { round++; if (i === odd) { best = Math.min(best, d); d *= 0.82; } else miss++; status.textContent = `Round ${round} of ${ROUNDS}. Misses ${miss} of 3.`; next(); } })));
      status.textContent = `Round ${round + 1} of ${ROUNDS}. One swatch has a slightly different lightness. Pick it. Misses ${miss} of 3.`;
    }
    start.addEventListener('click', () => { round = 0; d = 0.1; miss = 0; best = 1; next(); });
    el.append(h('p', { class: 'desc' }, 'This game tests your own colour vision on your own screen. It cannot be played without seeing colour differences. A few misses are normal; screens and lighting change the result.'), start, grid, status);
  },
});

// ---------- data viz palettes ----------
function pickCategorical(n) {
  const cand = []; for (const L of [0.55, 0.65, 0.75]) for (let hh = 0; hh < 360; hh += 10) cand.push(okRgb(L, 0.14, hh).map(Math.round));
  const views = [null, 'protanopia', 'deuteranopia', 'tritanopia'], sim = (c, v) => (v ? simCvd(c, v) : c);
  const minD = (a, b) => Math.min(...views.map((v) => dE(sim(a, v), sim(b, v)))); const chosen = [cand[cand.findIndex((c) => Math.abs(rgb2oklab(c)[0] - 0.65) < 0.01)] || cand[0]];
  while (chosen.length < n) { let best = null, bs = -1; for (const c of cand) { const s = Math.min(...chosen.map((x) => minD(c, x))); if (s > bs) { bs = s; best = c; } } chosen.push(best); }
  return chosen;
}
T.push({
  id: 'dataviz-palette-builder', cat: 'Color', title: 'Data Viz Palette Builder: Color-Blind-Safe Chart Colors', desc: 'Build categorical, sequential or diverging chart palettes and check them under colour vision deficiency.',
  inputs: 0, sample: '',
  opts: [sel('type', 'Palette type', ['Categorical', 'Sequential', 'Diverging']), num('n', 'Number of colours', 6), num('hue', 'Hue for sequential or first diverging colour (0 to 359)', 250), num('hue2', 'Second hue for diverging', 30)],
  run(_i, o) {
    const n = clamp(o.n, 2, 12) | 0; let cols;
    if (o.type === 'Categorical') cols = pickCategorical(n);
    else if (o.type === 'Sequential') cols = Array.from({ length: n }, (_, i) => { const t = n === 1 ? 0 : i / (n - 1); return okRgb(0.95 - 0.65 * t, 0.03 + 0.13 * Math.sin(Math.PI * (0.15 + 0.7 * t)), o.hue).map(Math.round); });
    else cols = Array.from({ length: n }, (_, i) => { const t = n === 1 ? 0.5 : i / (n - 1), s = Math.abs(t - 0.5) * 2; return okRgb(0.96 - 0.5 * s, 0.17 * s, t < 0.5 ? o.hue : o.hue2).map(Math.round); });
    const hexes = cols.map(hexOf), views = [['normal', null], ['protanopia', 'protanopia'], ['deuteranopia', 'deuteranopia'], ['tritanopia', 'tritanopia']];
    const rep = views.map(([name, v]) => { let mn = 1e9, pair = ''; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = dE(v ? simCvd(cols[i], v) : cols[i], v ? simCvd(cols[j], v) : cols[j]); if (d < mn) { mn = d; pair = `${hexes[i]} / ${hexes[j]}`; } } return `${name.padEnd(13)} closest pair ${pair}  difference ${mn.toFixed(1)}${mn < 8 ? '  review: hard to tell apart' : ''}`; });
    const adj = o.type === 'Categorical' ? '' : '\nFor ordered palettes only the order and lightness steps matter; the check shows the smallest step between neighbours and any pair.';
    return { text: `${hexes.join(', ')}\n\nJavaScript: ${JSON.stringify(hexes)}\nCSS: ${hexes.map((c, i) => `--chart-${i + 1}: ${c};`).join(' ')}\n\nDistance check (OKLab difference x100, Machado 2009 simulation at full severity):\n${rep.join('\n')}${adj}\n\nThe 8-point review threshold is a rule of thumb, not a standard. Colours are picked greedily, so also label or pattern your chart.`, html: swatchHtml(hexes.map((c) => ({ hex: c }))) };
  },
});

// ---------- 3D colour space plot ----------
T.push({
  id: 'color-space-plotter', cat: 'Color', title: 'Color Space Plotter: See a Palette in 3D RGB, HSL or OKLab', desc: 'Plot palette colours in 3D and rotate the view.', custom: true, dom: true,
  render(el) {
    const ta = h('textarea', { id: 'cs-in', rows: 4 }); ta.value = '#ff6b6b\n#feca57\n#48dbfb\n#1dd1a1\n#5f27cd\n#222f3e'; const sp = h('select', { id: 'cs-sp' }, ...['RGB cube', 'HSL cylinder', 'OKLab'].map((x) => h('option', {}, x)));
    const yaw = h('input', { id: 'cs-yaw', type: 'range', min: -180, max: 180, value: 35 }), pit = h('input', { id: 'cs-pit', type: 'range', min: -90, max: 90, value: 20 }), cv = h('canvas', { width: 420, height: 420, class: 'prev', role: 'img' }), tab = h('pre', { class: 'out' }), err = h('p', { role: 'alert', class: 'err' });
    function coords(rgb) { if (sp.value === 'RGB cube') return rgb.map((v) => v / 255 - 0.5); if (sp.value === 'HSL cylinder') { const [hh, s, l] = rgb2hsl(...rgb), r = s / 100 / 2; return [r * Math.cos(hh * Math.PI / 180), l / 100 - 0.5, r * Math.sin(hh * Math.PI / 180)]; } const [L, a, b] = rgb2oklab(rgb); return [a * 2, L - 0.5, b * 2]; }
    function draw() {
      let cols; try { cols = colorsIn(ta.value); err.textContent = ''; } catch (e) { err.textContent = e.message; return; }
      const c = cv.getContext('2d'), Y = +yaw.value * Math.PI / 180, P = +pit.value * Math.PI / 180; c.clearRect(0, 0, 420, 420);
      const pr = ([x, y, z]) => { const x1 = x * Math.cos(Y) - z * Math.sin(Y), z1 = x * Math.sin(Y) + z * Math.cos(Y), y1 = y * Math.cos(P) - z1 * Math.sin(P), z2 = y * Math.sin(P) + z1 * Math.cos(P); return [210 + x1 * 300, 210 - y1 * 300, z2]; };
      c.strokeStyle = '#8888'; for (const [a, b] of [[[-.5, -.5, -.5], [.5, -.5, -.5]], [[-.5, -.5, -.5], [-.5, .5, -.5]], [[-.5, -.5, -.5], [-.5, -.5, .5]]]) { const p = pr(a), q = pr(b); c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); c.stroke(); }
      const pts = cols.map((k) => ({ k, p: pr(coords(k.rgb)) })).sort((a, b) => a.p[2] - b.p[2]);
      for (const { k, p } of pts) { c.beginPath(); c.arc(p[0], p[1], 10, 0, 7); c.fillStyle = hexOf(k.rgb.map(Math.round)); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke(); }
      cv.setAttribute('aria-label', `3D plot of ${cols.length} colours in ${sp.value}, yaw ${yaw.value} degrees, pitch ${pit.value} degrees. Coordinates are listed below.`);
      tab.textContent = cols.map((k) => { const [a, b, d] = sp.value === 'RGB cube' ? k.rgb.map(Math.round) : sp.value === 'HSL cylinder' ? rgb2hsl(...k.rgb).map((v) => v.toFixed(1)) : rgb2oklab(k.rgb).map((v) => v.toFixed(3)); return `${hexOf(k.rgb.map(Math.round))}  ${sp.value === 'RGB cube' ? 'R G B' : sp.value === 'HSL cylinder' ? 'H S L' : 'L a b'}: ${a} ${b} ${d}`; }).join('\n');
    }
    for (const x of [ta, sp, yaw, pit]) x.addEventListener('input', draw);
    const nudge = (id, d, lbl) => h('button', { type: 'button', 'aria-label': lbl, onclick: () => { const e = id === 'y' ? yaw : pit; e.value = clamp(+e.value + d, +e.min, +e.max); draw(); } }, lbl);
    el.append(h('p', { class: 'desc' }, 'Rotate with the sliders or buttons. Gaps and clusters in the plot show uneven colour steps. The table lists the numbers behind each point.'), h('label', { for: 'cs-in' }, 'Colours (one per line)'), ta, h('div', { class: 'row' }, h('label', { for: 'cs-sp' }, 'Space'), sp, h('label', { for: 'cs-yaw' }, 'Rotate'), yaw, h('label', { for: 'cs-pit' }, 'Tilt'), pit, nudge('y', -15, 'Left'), nudge('y', 15, 'Right'), nudge('p', -15, 'Down'), nudge('p', 15, 'Up')), err, cv, tab); draw();
  },
});

T.push({
  id: 'random-color-generator', cat: 'Color', title: 'Random Color Generator with Hue, Saturation and Lightness Limits', desc: 'Generate random colours inside ranges you set.', inputs: 0, sample: '',
  opts: [num('n', 'How many', 12), num('h1', 'Hue min (0-360)', 0), num('h2', 'Hue max (0-360)', 360), num('s1', 'Saturation min %', 60), num('s2', 'Saturation max %', 90), num('l1', 'Lightness min %', 40), num('l2', 'Lightness max %', 60)],
  run(_i, o) {
    const n = clamp(o.n, 1, 500) | 0, r = (a, b) => { const lo = Math.min(a, b), hi = Math.max(a, b); return lo + Math.random() * (hi - lo); }, cols = Array.from({ length: n }, () => { const rgb = hsl2rgb(r(o.h1, o.h2), r(clamp(o.s1, 0, 100), clamp(o.s2, 0, 100)), r(clamp(o.l1, 0, 100), clamp(o.l2, 0, 100))).map(Math.round); return hexOf(rgb); });
    return { text: cols.join('\n'), html: swatchHtml(cols.map((c) => ({ hex: c }))) };
  },
});

T.push({
  id: 'skin-tone-palette-builder', cat: 'Color', title: 'Skin Tone Palette Builder for Illustration', desc: 'Build a range of skin tones with shadow and highlight variants.',
  labels: ['Base tones (optional, one colour per line; leave blank to generate a range)'], sample: '',
  opts: [num('n', 'Tones to generate when blank', 6), num('shadow', 'Shadow strength (0-100)', 50), num('light', 'Highlight strength (0-100)', 50)],
  run([src], o) {
    const sh = clamp(o.shadow, 0, 100) / 100, hl = clamp(o.light, 0, 100) / 100;
    let bases = lines(src).map(parseColor); if (!bases.length) { const n = clamp(o.n, 2, 12) | 0; bases = Array.from({ length: n }, (_, i) => okRgb(0.9 - (0.58 * i) / (n - 1), 0.04 + 0.05 * Math.sin((Math.PI * i) / (n - 1)) + 0.02, 55 - 10 * (i / (n - 1)))); }
    const rows = bases.map((b) => { const [L, a, bb] = rgb2oklab(b), [, C, H] = lab2lch(L, a, bb); return { base: b, shadow: okRgb(L - 0.12 * sh - 0.02, C * (1 + 0.25 * sh), H - 8 * sh), light: okRgb(L + (0.07 * hl) * (1 - L) / 0.3, C * (1 - 0.3 * hl), H + 6 * hl) }; });
    const hx = (c) => hexOf(c.map(Math.round));
    return { text: rows.map((r) => `shadow ${hx(r.shadow)}   base ${hx(r.base)}   highlight ${hx(r.light)}`).join('\n') + '\n\nShadows get slightly redder and more saturated, highlights lighter and softer. These are generated by a simple OKLCH rule, not measured skin data. Check the tones on real artwork and with the people they represent.', html: swatchHtml(rows.flatMap((r) => [{ hex: hx(r.shadow), label: 'shadow ' + hx(r.shadow) }, { hex: hx(r.base), label: 'base ' + hx(r.base) }, { hex: hx(r.light), label: 'light ' + hx(r.light) }])) };
  },
});

T.push({
  id: 'brand-color-mockup-previewer', cat: 'Color', title: 'Brand Color Mockup Previewer: Palette on a Web Page, App and Poster', desc: 'Assign colours to roles and see them on sample layouts.',
  labels: ['Roles, one per line: role colour (primary, accent, background, surface, text)'], sample: 'primary #4f46e5\naccent #f59e0b\nbackground #f8fafc\nsurface #ffffff\ntext #0f172a',
  run([src]) {
    const R = {}; for (const c of colorsIn(src)) R[c.name.toLowerCase()] = c.rgb.map(Math.round);
    for (const k of ['primary', 'accent', 'background', 'text']) if (!R[k]) throw new Error(`Missing role: ${k}`); R.surface = R.surface || R.background;
    const hx = (k) => hexOf(R[k]), on = (rgb) => (ratio(rgb, [255, 255, 255]) >= ratio(rgb, [0, 0, 0]) ? '#fff' : '#000');
    const pairs = [['text', 'background'], ['text', 'surface'], ['primary', 'background'], ['accent', 'background']].map(([a, b]) => [a, b, ratio(R[a], R[b])]);
    const html = `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;font:15px system-ui,sans-serif;background:${hx('background')};color:${hx('text')}}.nav{display:flex;justify-content:space-between;padding:14px 20px;background:${hx('surface')}}.nav b{color:${hx('primary')}}.hero{padding:34px 20px}.hero h1{margin:0 0 8px;font-size:30px}.btn{display:inline-block;padding:10px 18px;border-radius:8px;background:${hx('primary')};color:${on(R.primary)};font-weight:600;margin-right:8px}.btn2{display:inline-block;padding:10px 18px;border-radius:8px;border:2px solid ${hx('accent')};color:${hx('text')}}.row{display:flex;gap:14px;flex-wrap:wrap;padding:0 20px 20px}.card{flex:1;min-width:200px;background:${hx('surface')};border-radius:12px;padding:16px;border-top:4px solid ${hx('accent')}}.app{width:200px;border-radius:22px;background:${hx('surface')};padding:14px;border:1px solid #8884}.bar{height:8px;border-radius:4px;background:${hx('primary')};margin:8px 0}.chip{display:inline-block;background:${hx('accent')};color:${on(R.accent)};padding:3px 10px;border-radius:99px;font-size:12px}.poster{width:200px;height:260px;background:${hx('primary')};color:${on(R.primary)};padding:18px;display:flex;flex-direction:column;justify-content:flex-end;border-radius:6px}.poster i{display:block;height:6px;width:50px;background:${hx('accent')};margin-bottom:10px}</style>
<div class="nav"><b>Brand</b><span>Products &nbsp; Pricing &nbsp; About</span></div><div class="hero"><h1>Headline in your text colour</h1><p>Body copy on the page background. A second sentence shows reading comfort.</p><span class="btn">Primary action</span><span class="btn2">Secondary</span></div>
<div class="row"><div class="card"><h2>Card title</h2><p>Surface colour with an accent edge.</p><span class="chip">New</span></div><div class="app"><b>App screen</b><div class="bar" style="width:70%"></div><div class="bar" style="width:40%;background:${hx('accent')}"></div><p style="margin:6px 0 0">Progress</p></div><div class="poster"><i></i><b style="font-size:22px">Poster headline</b><span>Date and place</span></div></div>`;
    return { text: `Contrast of role pairs (WCAG 2 ratio):\n${pairs.map(([a, b, r]) => `${a} on ${b}: ${r.toFixed(2)}:1  ${r >= 4.5 ? 'ok for text' : r >= 3 ? 'review: large text or UI only' : 'review: low contrast'}`).join('\n')}\n\nThe mockups are fixed examples. They show how roles combine, not a design recommendation.`, html };
  },
});

T.push({
  id: 'webcam-color-sampler', cat: 'Color', title: 'Webcam Color Sampler: Read an Object Color Through the Camera', desc: 'Sample the colour under a crosshair in the live camera view.', custom: true, dom: true,
  render(el) {
    const vid = h('video', { autoplay: true, playsinline: true, muted: true, style: 'display:none' }), cv = h('canvas', { width: 480, height: 360, class: 'prev', role: 'img', 'aria-label': 'Live camera view with a crosshair' }), out = h('p', { role: 'status' }), err = h('p', { role: 'alert', class: 'err' });
    const px = h('input', { id: 'wc-x', type: 'range', min: 0, max: 100, value: 50 }), py = h('input', { id: 'wc-y', type: 'range', min: 0, max: 100, value: 50 }), rad = h('input', { id: 'wc-r', type: 'number', min: 1, max: 30, value: 6 }), hist = h('div', { class: 'row' }); let raf = 0, stream = null, cur = null;
    const loop = () => { if (vid.videoWidth) { cv.width = vid.videoWidth; cv.height = vid.videoHeight; const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(vid, 0, 0); const x = Math.round(px.value / 100 * (cv.width - 1)), y = Math.round(py.value / 100 * (cv.height - 1)), r = clamp(rad.value, 1, 30) | 0, x0 = clamp(x - r, 0, cv.width - 1), y0 = clamp(y - r, 0, cv.height - 1), w = Math.min(2 * r + 1, cv.width - x0), hh = Math.min(2 * r + 1, cv.height - y0), d = c.getImageData(x0, y0, w, hh).data; const s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; } cur = s.map((v) => Math.round(v / (d.length / 4))); c.strokeStyle = '#fff'; c.lineWidth = 3; c.strokeRect(x0, y0, w, hh); c.strokeStyle = '#000'; c.lineWidth = 1; c.strokeRect(x0, y0, w, hh); out.textContent = `Under the box: ${hexOf(cur)}  rgb(${cur.join(', ')})`; } raf = requestAnimationFrame(loop); };
    const start = h('button', { type: 'button' }, 'Start camera'), save = h('button', { type: 'button' }, 'Save this colour');
    start.addEventListener('click', async () => { err.textContent = ''; try { stream = await navigator.mediaDevices.getUserMedia({ video: true }); vid.srcObject = stream; await vid.play(); start.disabled = true; loop(); } catch (e) { err.textContent = 'Camera not available: ' + e.message; } });
    save.addEventListener('click', () => { if (cur) hist.append(h('button', { type: 'button', style: `background:${hexOf(cur)};color:${lumOf(cur) > 0.179 ? '#000' : '#fff'}`, 'aria-label': `Copy ${hexOf(cur)}`, onclick: (e) => navigator.clipboard && navigator.clipboard.writeText(e.target.textContent) }, hexOf(cur))); });
    el.append(h('p', { class: 'desc' }, 'Point the camera at an object, move the box with the sliders and read the average colour. Camera white balance and lighting change the result, so use a neutral light and treat the value as an estimate. Nothing is recorded or uploaded.'), h('div', { class: 'row' }, start, save), cv, vid, h('div', { class: 'row' }, h('label', { for: 'wc-x' }, 'Box left to right'), px, h('label', { for: 'wc-y' }, 'Box top to bottom'), py, h('label', { for: 'wc-r' }, 'Box half-size (px)'), rad), out, err, hist);
    new MutationObserver(() => { if (!el.isConnected) { cancelAnimationFrame(raf); stream && stream.getTracks().forEach((t) => t.stop()); } }).observe(document.body, { childList: true, subtree: true });
  },
});

// ---------- fonts: sfnt / WOFF helpers ----------
const tagOf = (d, o) => String.fromCharCode(d.getUint8(o), d.getUint8(o + 1), d.getUint8(o + 2), d.getUint8(o + 3));
async function inflate(u8) { const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate')); return new Uint8Array(await new Response(s).arrayBuffer()); }
async function deflate(u8) { const s = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate')); return new Uint8Array(await new Response(s).arrayBuffer()); }
// Returns {flavor, tables:{tag:Uint8Array}} for TTF, OTF and WOFF. WOFF2 needs Brotli, which the platform does not offer.
async function readFont(buf) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf), d = new DataView(u.buffer, u.byteOffset, u.byteLength), sig = tagOf(d, 0), tables = {};
  if (sig === 'wOF2') throw new Error('WOFF2 files use Brotli compression, which browsers cannot decode in script. Use a TTF, OTF or WOFF file.');
  if (sig === 'ttcf') throw new Error('Font collections (.ttc) are not supported. Extract a single font first.');
  if (sig === 'wOFF') {
    const n = d.getUint16(12), flavor = d.getUint32(4);
    for (let i = 0; i < n; i++) { const o = 44 + i * 20, off = d.getUint32(o + 4), cl = d.getUint32(o + 8), ol = d.getUint32(o + 12), raw = u.subarray(off, off + cl); tables[tagOf(d, o)] = cl < ol ? await inflate(raw) : raw.slice(); if (tables[tagOf(d, o)].length !== ol) throw new Error('Corrupt WOFF table ' + tagOf(d, o)); }
    return { flavor, tables, kind: 'WOFF' };
  }
  const flavor = d.getUint32(0); if (![0x00010000, 0x4f54544f, 0x74727565].includes(flavor)) throw new Error('Not a TrueType, OpenType or WOFF font');
  const n = d.getUint16(4);
  for (let i = 0; i < n; i++) { const o = 12 + i * 16, off = d.getUint32(o + 8), len = d.getUint32(o + 12); if (off + len > u.length) throw new Error('Font is truncated'); tables[tagOf(d, o)] = u.slice(off, off + len); }
  return { flavor, tables, kind: flavor === 0x4f54544f ? 'OpenType (CFF)' : 'TrueType' };
}
const sfntChecksum = (u) => { let s = 0; const d = new DataView(u.buffer, u.byteOffset, u.byteLength); for (let i = 0; i < u.length; i += 4) { let v = 0; for (let k = 0; k < 4; k++) v = v * 256 + (i + k < u.length ? u[i + k] : 0); s = (s + v) >>> 0; } void d; return s; };
function buildSfnt(flavor, tables) {
  const tags = Object.keys(tables).sort(), n = tags.length; let off = 12 + 16 * n; const pad = (x) => (x + 3) & ~3, parts = [], head = new DataView(new ArrayBuffer(12 + 16 * n));
  head.setUint32(0, flavor); head.setUint16(4, n); let p2 = 1, ex = 0; while (p2 * 2 <= n) { p2 *= 2; ex++; } head.setUint16(6, p2 * 16); head.setUint16(8, ex); head.setUint16(10, n * 16 - p2 * 16);
  tags.forEach((t, i) => { const u = tables[t], o = 12 + i * 16; [...t].forEach((c, k) => head.setUint8(o + k, c.charCodeAt(0))); head.setUint32(o + 4, sfntChecksum(u)); head.setUint32(o + 8, off); head.setUint32(o + 12, u.length); parts.push(u, new Uint8Array(pad(u.length) - u.length)); off += pad(u.length); });
  return new Blob([new Uint8Array(head.buffer), ...parts], { type: 'font/sfnt' });
}
async function buildWoff(flavor, tables) {
  const tags = Object.keys(tables).sort(), n = tags.length, pad = (x) => (x + 3) & ~3; const comp = [];
  for (const t of tags) { const raw = tables[t], z = await deflate(raw); comp.push(z.length < raw.length ? z : raw); }
  let off = 44 + 20 * n; const dir = new DataView(new ArrayBuffer(44 + 20 * n)), parts = []; let sfntSize = 12 + 16 * n;
  tags.forEach((t, i) => { const o = 44 + i * 20; [...t].forEach((c, k) => dir.setUint8(o + k, c.charCodeAt(0))); dir.setUint32(o + 4, off); dir.setUint32(o + 8, comp[i].length); dir.setUint32(o + 12, tables[t].length); dir.setUint32(o + 16, sfntChecksum(tables[t])); parts.push(comp[i], new Uint8Array(pad(comp[i].length) - comp[i].length)); off += pad(comp[i].length); sfntSize += pad(tables[t].length); });
  [...'wOFF'].forEach((c, k) => dir.setUint8(k, c.charCodeAt(0))); dir.setUint32(4, flavor); dir.setUint32(8, off); dir.setUint16(12, n); dir.setUint32(16, sfntSize);
  return new Blob([new Uint8Array(dir.buffer), ...parts], { type: 'font/woff' });
}
function fontInfo(font) {
  const T2 = font.tables, dv = (t) => (T2[t] ? new DataView(T2[t].buffer, T2[t].byteOffset, T2[t].byteLength) : null), out = { names: {}, kind: font.kind };
  const nm = dv('name');
  if (nm) { const cnt = nm.getUint16(2), so = nm.getUint16(4); for (let i = 0; i < cnt; i++) { const o = 6 + i * 12, pl = nm.getUint16(o), id = nm.getUint16(o + 6), len = nm.getUint16(o + 8), off = so + nm.getUint16(o + 10); if (off + len > nm.byteLength || (out.names[id] && pl !== 3)) continue; let s = ''; if (pl === 3 || pl === 0) for (let k = 0; k < len; k += 2) s += String.fromCharCode(nm.getUint16(off + k)); else for (let k = 0; k < len; k++) s += String.fromCharCode(nm.getUint8(off + k)); if (pl === 3 || !out.names[id]) out.names[id] = s; } }
  const head = dv('head'); if (head) out.upm = head.getUint16(18);
  const hhea = dv('hhea'); if (hhea) out.hhea = { ascender: hhea.getInt16(4), descender: hhea.getInt16(6), lineGap: hhea.getInt16(8) };
  const os2 = dv('OS/2'); if (os2) { out.os2 = { version: os2.getUint16(0), weight: os2.getUint16(4), width: os2.getUint16(6), typoAscender: os2.getInt16(68), typoDescender: os2.getInt16(70), typoLineGap: os2.getInt16(72), winAscent: os2.getUint16(74), winDescent: os2.getUint16(76) }; if (os2.getUint16(0) >= 2 && os2.byteLength >= 90) { out.os2.xHeight = os2.getInt16(86); out.os2.capHeight = os2.getInt16(88); } }
  const maxp = dv('maxp'); if (maxp) out.glyphs = maxp.getUint16(4);
  const post = dv('post'); if (post) { out.italicAngle = post.getInt32(4) / 65536; out.fixedPitch = post.getUint32(12) !== 0; }
  const cm = dv('cmap'); out.codepoints = [];
  if (cm) {
    const n = cm.getUint16(2); let pick = null;
    for (let i = 0; i < n; i++) { const pl = cm.getUint16(4 + i * 8), en = cm.getUint16(6 + i * 8), off = cm.getUint32(8 + i * 8), fm = cm.getUint16(off), score = pl === 3 && en === 10 ? 3 : pl === 3 && en === 1 ? 2 : pl === 0 ? 1 : 0; if ((fm === 4 || fm === 12) && score > 0 && (!pick || score > pick.score)) pick = { off, fm, score }; }
    if (pick) {
      const o = pick.off, cps = [];
      if (pick.fm === 12) { const g = cm.getUint32(o + 12); for (let i = 0; i < g; i++) { const s = cm.getUint32(o + 16 + i * 12), e = cm.getUint32(o + 20 + i * 12); for (let c = s; c <= e && cps.length < 60000; c++) cps.push(c); } }
      else { const sc = cm.getUint16(o + 6) / 2, ends = o + 14, starts = ends + sc * 2 + 2, deltas = starts + sc * 2, ro = deltas + sc * 2; for (let i = 0; i < sc; i++) { const e = cm.getUint16(ends + i * 2), s = cm.getUint16(starts + i * 2), rof = cm.getUint16(ro + i * 2); for (let c = s; c <= e && c < 0xffff; c++) { if (rof) { const gi = cm.getUint16(ro + i * 2 + rof + (c - s) * 2); if (!gi) continue; } cps.push(c); } } }
      out.codepoints = cps;
    }
  }
  out.features = {};
  for (const t of ['GSUB', 'GPOS']) { const d = dv(t); if (!d) continue; const fl = d.getUint16(6), cnt = d.getUint16(fl), s = new Set(); for (let i = 0; i < cnt; i++) s.add(tagOf(d, fl + 2 + i * 6)); out.features[t] = [...s].sort(); }
  const fv = dv('fvar'); out.axes = [];
  if (fv) { const ao = fv.getUint16(4), ac = fv.getUint16(8), as = fv.getUint16(10); for (let i = 0; i < ac; i++) { const o = ao + i * as; out.axes.push({ tag: tagOf(fv, o), min: fv.getInt32(o + 4) / 65536, def: fv.getInt32(o + 8) / 65536, max: fv.getInt32(o + 12) / 65536 }); } }
  out.tableList = Object.keys(T2).sort();
  return out;
}
const fontReport = (i) => {
  const n = i.names, L = [];
  L.push(`Family: ${n[16] || n[1] || '?'}`, `Style: ${n[17] || n[2] || '?'}`, `Full name: ${n[4] || '?'}`, `PostScript name: ${n[6] || '?'}`, `Version: ${n[5] || '?'}`, `Format: ${i.kind}`, `Glyphs: ${i.glyphs ?? '?'}`, `Characters mapped: ${i.codepoints.length}`);
  if (n[0]) L.push(`Copyright: ${n[0]}`); if (n[13]) L.push(`License: ${n[13]}`); if (n[14]) L.push(`License URL: ${n[14]}`);
  L.push('', 'Metrics (font units)', `Units per em: ${i.upm}`);
  if (i.hhea) L.push(`hhea ascender / descender / line gap: ${i.hhea.ascender} / ${i.hhea.descender} / ${i.hhea.lineGap}`);
  if (i.os2) { const o = i.os2; L.push(`OS/2 typo ascender / descender / line gap: ${o.typoAscender} / ${o.typoDescender} / ${o.typoLineGap}`, `OS/2 win ascent / descent: ${o.winAscent} / ${o.winDescent}`, `Weight class: ${o.weight}, width class: ${o.width}`); if (o.xHeight !== undefined) L.push(`x-height: ${o.xHeight}, cap height: ${o.capHeight}`); }
  if (i.italicAngle !== undefined) L.push(`Italic angle: ${i.italicAngle}`, `Monospaced flag: ${i.fixedPitch ? 'yes' : 'no'}`);
  if (i.axes.length) L.push('', 'Variation axes', ...i.axes.map((a) => `${a.tag}: ${a.min} to ${a.max}, default ${a.def}`));
  for (const k of Object.keys(i.features)) L.push('', `${k} features (${i.features[k].length})`, i.features[k].join(' ') || '(none)');
  L.push('', 'Tables', i.tableList.join(' '));
  return L.join('\n');
};
T.push({
  id: 'font-file-inspector', cat: 'Fonts', title: 'Font File Inspector: Names, Metrics, Features and Characters', desc: 'Read a TTF, OTF or WOFF file: names, metrics, OpenType features, variation axes and the characters it covers.', custom: true, dom: true,
  render(el) {
    const file = h('input', { type: 'file', id: 'fi-file', accept: '.ttf,.otf,.woff,font/*' }), out = h('pre', { class: 'out' }), err = h('p', { role: 'alert', class: 'err' }), grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:3px;max-height:320px;overflow:auto', tabindex: '0', role: 'group', 'aria-label': 'Characters in the font' }), feat = h('div', { class: 'opts' }), sample = h('p', { style: 'font-size:32px;margin:8px 0', 'aria-label': 'Sample text in the uploaded font' }, 'Office affinity 1234 fi fl'), info = h('p', { role: 'status', class: 'desc' });
    file.addEventListener('change', async () => {
      err.textContent = ''; out.textContent = ''; grid.replaceChildren(); feat.replaceChildren(); const f = file.files[0]; if (!f) return;
      try {
        const buf = await f.arrayBuffer(), font = await readFont(buf), i = fontInfo(font); out.textContent = fontReport(i);
        const ff = new FontFace('InspectedFont', buf); await ff.load(); document.fonts.add(ff); sample.style.fontFamily = "'InspectedFont'";
        const shown = i.codepoints.filter((c) => c > 32 && !(c >= 0x7f && c < 0xa0)).slice(0, 600); info.textContent = `${shown.length} of ${i.codepoints.length} characters shown. Click a character to copy it.`;
        grid.replaceChildren(...shown.map((c) => h('button', { type: 'button', style: "font-size:22px;font-family:'InspectedFont';min-height:44px", 'aria-label': `Copy U+${c.toString(16).toUpperCase().padStart(4, '0')}`, onclick: () => navigator.clipboard && navigator.clipboard.writeText(String.fromCodePoint(c)) }, String.fromCodePoint(c))));
        const tags = [...new Set([...(i.features.GSUB || []), ...(i.features.GPOS || [])])].filter((t) => !/^(ccmp|locl|mark|mkmk|rlig|calt)$/.test(t)).slice(0, 40), on = new Set(); feat.replaceChildren(...tags.map((t) => h('label', {}, h('input', { type: 'checkbox', onchange: (e) => { e.target.checked ? on.add(t) : on.delete(t); sample.style.fontFeatureSettings = [...on].map((x) => `"${x}" 1`).join(',') || 'normal'; } }), t)));
      } catch (e) { err.textContent = e.message; }
    });
    el.append(h('p', { class: 'desc' }, 'Choose a font file. It is read in your browser and never uploaded. Tick a feature to see its effect on the sample line.'), h('label', { for: 'fi-file' }, 'Font file (.ttf, .otf, .woff)'), file, err, sample, feat, info, grid, out);
  },
});

T.push({
  id: 'font-format-converter', cat: 'Fonts', title: 'Font Format Converter: TTF or OTF to WOFF with @font-face CSS', desc: 'Pack a TTF or OTF font as WOFF for the web, or unpack WOFF back to TTF or OTF.', inputs: 0, file: { accept: '.ttf,.otf,.woff,font/*' },
  opts: [sel('to', 'Convert to', ['WOFF (compressed for the web)', 'TTF or OTF (unpacked)'])],
  run: async (_i, o, files) => {
    const f = files && files[0]; if (!f) throw new Error('Choose a font file'); const font = await readFont(await f.arrayBuffer()), i = fontInfo(font), base = f.name.replace(/\.[^.]+$/, ''), toWoff = o.to.startsWith('WOFF');
    const blob = toWoff ? await buildWoff(font.flavor, font.tables) : buildSfnt(font.flavor, font.tables), ext = toWoff ? 'woff' : font.flavor === 0x4f54544f ? 'otf' : 'ttf', fam = i.names[16] || i.names[1] || base, w = i.os2 ? i.os2.weight : 400;
    const css = toWoff ? `@font-face {\n  font-family: "${fam}";\n  src: url("${base}.woff") format("woff");\n  font-weight: ${w};\n  font-style: ${i.italicAngle ? 'italic' : 'normal'};\n  font-display: swap;\n}` : '';
    return { blob, filename: `${base}.${ext}`, text: `${f.name} (${f.size} bytes) -> ${base}.${ext} (${blob.size} bytes). Every table is copied unchanged.\n${css ? '\n' + css + '\n' : ''}\nWOFF2 is not offered: it needs Brotli compression, which browsers do not expose to scripts and this site does not ship an encoder. WOFF works in every current browser. Check the font license before converting or self-hosting.` };
  },
});

T.push({
  id: 'variable-font-playground', cat: 'Fonts', title: 'Variable Font Playground: Move Axes and Copy font-variation-settings', desc: 'Load a variable font file, move its axes and copy the CSS.', custom: true, dom: true,
  render(el) {
    const file = h('input', { type: 'file', id: 'vf-file', accept: '.ttf,.otf,.woff,font/*' }), txtIn = h('input', { type: 'text', id: 'vf-text', value: 'Variable fonts, Hamburgefonstiv 0123' }), size = h('input', { type: 'number', id: 'vf-size', value: 48, min: 8, max: 200 }), prev = h('p', { style: 'margin:10px 0;line-height:1.2', 'aria-label': 'Preview text' }), axes = h('div'), css = h('pre', { class: 'out' }), err = h('p', { role: 'alert', class: 'err' });
    let cur = {}; const upd = () => { prev.textContent = txtIn.value; prev.style.fontSize = size.value + 'px'; const s = Object.entries(cur).map(([k, v]) => `"${k}" ${v}`).join(', '); prev.style.fontVariationSettings = s || 'normal'; css.textContent = `font-family: "MyVariableFont";\nfont-variation-settings: ${s || 'normal'};`; };
    file.addEventListener('change', async () => {
      err.textContent = ''; axes.replaceChildren(); cur = {}; const f = file.files[0]; if (!f) return;
      try {
        const buf = await f.arrayBuffer(), i = fontInfo(await readFont(buf)); if (!i.axes.length) throw new Error('This font has no variation axes (no fvar table). It is a static font.');
        const ff = new FontFace('PlayFont', buf); await ff.load(); document.fonts.add(ff); prev.style.fontFamily = "'PlayFont'";
        for (const a of i.axes) { cur[a.tag] = a.def; const r = h('input', { type: 'range', id: 'vf-r-' + a.tag, min: a.min, max: a.max, step: (a.max - a.min) > 20 ? 1 : 0.01, value: a.def }), nI = h('input', { type: 'number', id: 'vf-n-' + a.tag, min: a.min, max: a.max, step: 'any', value: a.def }); r.addEventListener('input', () => { nI.value = r.value; cur[a.tag] = +r.value; upd(); }); nI.addEventListener('input', () => { r.value = nI.value; cur[a.tag] = clamp(nI.value, a.min, a.max); upd(); }); axes.append(h('div', { class: 'row' }, h('label', { for: r.id }, `${a.tag} (${a.min} to ${a.max})`), r, h('label', { for: nI.id }, a.tag + ' value'), nI)); }
        upd();
      } catch (e) { err.textContent = e.message; }
    });
    txtIn.addEventListener('input', upd); size.addEventListener('input', upd);
    el.append(h('p', { class: 'desc' }, 'Load a variable font (TTF, OTF or WOFF) from your computer. This tool reads the axes from the file, so it does not need any font catalog or network request.'), h('label', { for: 'vf-file' }, 'Variable font file'), file, err, h('div', { class: 'row' }, h('label', { for: 'vf-text' }, 'Text'), txtIn, h('label', { for: 'vf-size' }, 'Size (px)'), size), axes, prev, css); upd();
  },
});

T.push({
  id: 'font-previewer', cat: 'Fonts', title: 'Font Previewer: Your Text in Many Fonts at Once', desc: 'Type text and see it in installed or uploaded fonts side by side.', custom: true, dom: true,
  render(el) {
    const txtIn = h('input', { type: 'text', id: 'fp-text', value: 'Sphinx of black quartz, judge my vow' }), size = h('input', { type: 'number', id: 'fp-size', value: 32, min: 8, max: 160 }), list = h('div'), status = h('p', { role: 'status', class: 'desc' }), up = h('input', { type: 'file', id: 'fp-up', accept: '.ttf,.otf,.woff,.woff2,font/*', multiple: true });
    const fams = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'system-ui']);
    const COMMON = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana', 'Trebuchet MS', 'Courier New', 'Tahoma', 'Palatino', 'Garamond', 'Comic Sans MS', 'Impact', 'Segoe UI', 'Calibri', 'Cambria', 'Consolas', 'Menlo', 'Monaco', 'Lucida Console', 'DejaVu Sans', 'DejaVu Serif', 'Liberation Sans', 'Ubuntu', 'Roboto', 'Noto Sans', 'Lato', 'Open Sans'];
    const cx = document.createElement('canvas').getContext('2d'), w = (f) => { cx.font = `72px ${f}, monospace`; const a = cx.measureText('mmmmmmmmmmlli').width; cx.font = `72px ${f}, serif`; return [a, cx.measureText('mmmmmmmmmmlli').width]; }; // installed if width differs from the fallback
    const present = (n) => { cx.font = '72px monospace'; const m = cx.measureText('mmmmmmmmmmlli').width; cx.font = `72px "${n}", monospace`; const a = cx.measureText('mmmmmmmmmmlli').width; cx.font = '72px serif'; const s = cx.measureText('mmmmmmmmmmlli').width; cx.font = `72px "${n}", serif`; const b = cx.measureText('mmmmmmmmmmlli').width; return a !== m || b !== s; }; void w;
    COMMON.filter(present).forEach((f) => fams.add(f));
    const draw = () => list.replaceChildren(...[...fams].map((f) => h('div', { style: 'border-top:1px solid #8883;padding:4px 0' }, h('div', { class: 'desc', style: 'margin:0;font-size:12px' }, f), h('div', { style: `font-family:${/^(serif|sans-serif|monospace|cursive|system-ui)$/.test(f) ? f : `"${f}"`};font-size:${size.value}px;line-height:1.2`, lang: 'en' }, txtIn.value))));
    const local = h('button', { type: 'button' }, 'Load all installed fonts (Chromium browsers ask permission)');
    local.addEventListener('click', async () => { if (!window.queryLocalFonts) { status.textContent = 'This browser does not offer installed font listing. Use the upload field or the built-in list.'; return; } try { const l = await window.queryLocalFonts(); l.forEach((x) => fams.add(x.family)); status.textContent = `${fams.size} font families listed.`; draw(); } catch (e) { status.textContent = 'Permission was not given: ' + e.message; } });
    up.addEventListener('change', async () => { for (const f of up.files) { try { const ff = new FontFace(baseName(f), await f.arrayBuffer()); await ff.load(); document.fonts.add(ff); fams.add(baseName(f)); } catch { status.textContent = `Could not load ${f.name}`; } } draw(); });
    txtIn.addEventListener('input', draw); size.addEventListener('input', draw);
    el.append(h('p', { class: 'desc' }, 'The list starts with generic families and the common fonts found on this device. Fonts are only shown if your device has them. Nothing is uploaded.'), h('div', { class: 'row' }, h('label', { for: 'fp-text' }, 'Text'), txtIn, h('label', { for: 'fp-size' }, 'Size (px)'), size), h('div', { class: 'row' }, h('label', { for: 'fp-up' }, 'Add font files'), up, local), status, list); draw(); status.textContent = `${fams.size} font families listed.`;
  },
});

// ---------- design tools ----------
// Recolour SVG text without a DOM: attributes and inline style declarations for fill and stroke.
function recolorSvg(svg, o) {
  let n = 0; const keep = (v) => /^(none|transparent|inherit|url\(.*\))$/i.test(v.trim()) || (!o.current && /^currentcolor$/i.test(v.trim()));
  const rep = (kind, val) => { const c = kind === 'fill' ? o.fill : o.stroke; if (!c || keep(val)) return val; n++; return c; };
  let out = svg.replace(/\b(fill|stroke)\s*=\s*(["'])(.*?)\2/g, (m, k, q, v) => `${k}=${q}${rep(k, v)}${q}`).replace(/\b(fill|stroke)\s*:\s*([^;"'}]+)/g, (m, k, v) => `${k}:${rep(k, v)}`);
  if (o.root) out = out.replace(/<svg\b([^>]*)>/i, (m, a) => { let add = ''; if (o.fill && !/\sfill\s*=/.test(a)) { add += ` fill="${o.fill}"`; n++; } if (o.stroke && !/\sstroke\s*=/.test(a)) { add += ` stroke="${o.stroke}"`; n++; } return `<svg${a}${add}>`; });
  return { svg: out, n };
}
T.push({
  id: 'svg-icon-recolorer', cat: 'SVG', title: 'SVG Icon Recolorer: Change Fill and Stroke Colors in Bulk', desc: 'Recolour many SVG icons at once and download them as a ZIP.', inputs: 0, file: { accept: '.svg,image/svg+xml', multiple: true },
  opts: [txt('fill', 'New fill colour (blank = leave)', ''), txt('stroke', 'New stroke colour (blank = leave)', '#2563eb'), chk('root', 'Also set the colour on the root svg element where it has none', false), chk('current', 'Also replace currentColor', true)],
  run: async (_i, o, files) => {
    if (!files || !files.length) throw new Error('Choose one or more SVG files'); if (!o.fill && !o.stroke) throw new Error('Enter a fill or stroke colour');
    for (const k of ['fill', 'stroke']) if (o[k] && !/^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl)a?\([^)]*\))$/i.test(o[k].trim())) throw new Error(`Bad ${k} colour`);
    const ents = [], rep = [];
    for (const f of files) { const t = await f.text(); if (!/<svg\b/i.test(t)) { rep.push(`${f.name}: skipped, not an SVG`); continue; } const r = recolorSvg(t, { fill: o.fill.trim(), stroke: o.stroke.trim(), root: o.root, current: o.current }); ents.push({ name: f.name, data: new TextEncoder().encode(r.svg) }); rep.push(`${f.name}: ${r.n} colour value(s) changed`); }
    if (!ents.length) throw new Error('No SVG files found');
    return { text: rep.join('\n') + '\n\nOnly fill and stroke attributes and inline style values are changed. Colours set in <style> blocks, gradients (url(#...)) and none are left alone.', blob: ents.length === 1 ? new Blob([ents[0].data], { type: 'image/svg+xml' }) : zipStore(ents), filename: ents.length === 1 ? ents[0].name : 'recolored-icons.zip' };
  },
});

const rng32 = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
T.push({
  id: 'noise-texture-generator', cat: 'Images', title: 'Noise Texture Generator: Tileable Grain PNG', desc: 'Make a transparent grain or noise tile to overlay on gradients and flat colours.', dom: true, inputs: 0, sample: '',
  opts: [num('size', 'Tile size (px)', 256), sel('type', 'Type', ['Grain (grey)', 'Colour noise', 'Speckle (sparse)']), num('density', 'Density (%)', 60), num('opacity', 'Opacity (%)', 25), txt('tint', 'Tint (grain only)', '#ffffff'), num('seed', 'Seed', 1)],
  run: (_i, o) => {
    const S = clamp(o.size, 16, 2048) | 0, cv = document.createElement('canvas'); cv.width = cv.height = S; const cx = cv.getContext('2d'), im = cx.createImageData(S, S), r = rng32(o.seed | 0), dens = clamp(o.density, 0, 100) / 100, op = clamp(o.opacity, 0, 100) / 100 * 255, tint = parseColor(o.tint || '#ffffff');
    for (let i = 0; i < S * S; i++) { const d = im.data, k = i * 4; if (r() > dens) { d[k + 3] = 0; continue; } if (o.type === 'Colour noise') { d[k] = r() * 255; d[k + 1] = r() * 255; d[k + 2] = r() * 255; d[k + 3] = op; } else if (o.type === 'Speckle (sparse)') { const v = r() < 0.5 ? 0 : 255; d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = op * (0.4 + 0.6 * r()); } else { const v = r(); d[k] = tint[0] * v; d[k + 1] = tint[1] * v; d[k + 2] = tint[2] * v; d[k + 3] = op * (0.3 + 0.7 * r()); } }
    cx.putImageData(im, 0, 0);
    return new Promise((res) => cv.toBlob((b) => res({ blob: b, filename: `noise-${S}.png`, text: `${S}x${S} transparent PNG. Every pixel is independent, so the tile repeats without visible seams. Use it as a CSS background over a colour or gradient: background-image: url(noise-${S}.png);` }), 'image/png'));
  },
});

// ---------- logo maker ----------
const SHAPES = {
  circle: (c, r) => `<circle cx="${c}" cy="${c}" r="${r}"/>`, square: (c, r) => `<rect x="${c - r}" y="${c - r}" width="${2 * r}" height="${2 * r}"/>`, 'rounded square': (c, r) => `<rect x="${c - r}" y="${c - r}" width="${2 * r}" height="${2 * r}" rx="${r * 0.3}"/>`,
  diamond: (c, r) => `<polygon points="${c},${c - r} ${c + r},${c} ${c},${c + r} ${c - r},${c}"/>`, triangle: (c, r) => `<polygon points="${c},${c - r} ${c + r},${c + r * 0.8} ${c - r},${c + r * 0.8}"/>`,
  hexagon: (c, r) => `<polygon points="${[0, 1, 2, 3, 4, 5].map((i) => `${(c + r * Math.cos(Math.PI / 6 + (i * Math.PI) / 3)).toFixed(1)},${(c + r * Math.sin(Math.PI / 6 + (i * Math.PI) / 3)).toFixed(1)}`).join(' ')}"/>`,
  star: (c, r) => `<polygon points="${Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; return `${(c + rr * Math.cos(a)).toFixed(1)},${(c + rr * Math.sin(a)).toFixed(1)}`; }).join(' ')}"/>`,
  ring: (c, r) => `<circle cx="${c}" cy="${c}" r="${r * 0.85}" fill="none" stroke-width="${r * 0.3}" stroke="currentColor"/>`,
};
T.push({
  id: 'simple-logo-maker', cat: 'Images', title: 'Simple Logo Maker: Shape, Initials and Name to SVG and PNG', desc: 'Combine a geometric shape and your brand name into a simple logo.', dom: true,
  labels: ['Brand name'], sample: 'Northwind',
  opts: [sel('shape', 'Icon shape', Object.keys(SHAPES)), txt('mark', 'Letters inside the icon (blank = first letter)', ''), sel('layout', 'Layout', ['Icon left of name', 'Icon above name', 'Icon only', 'Name only']), sel('font', 'Font', ['sans-serif', 'serif', 'monospace', 'Georgia, serif', 'Impact, sans-serif', 'Trebuchet MS, sans-serif']), txt('c1', 'Icon colour', '#2563eb'), txt('c2', 'Text colour', '#0f172a'), txt('bg', 'Background (blank = transparent)', ''), num('png', 'PNG scale', 2)],
  run: async ([name], o) => {
    name = name.trim(); if (!name && o.layout !== 'Icon only') throw new Error('Enter a brand name'); const mark = (o.mark || name[0] || '').trim().slice(0, 3), c1 = parseColor(o.c1), c2 = parseColor(o.c2), H1 = hexOf(c1.map(Math.round)), H2 = hexOf(c2.map(Math.round)), onC = ratio(c1, [255, 255, 255]) >= ratio(c1, [0, 0, 0]) ? '#fff' : '#000', R = 50, fs = 44;
    const icon = `<g fill="${H1}" color="${H1}">${SHAPES[o.shape](R + 10, R)}</g>${mark && o.shape !== 'ring' ? `<text x="${R + 10}" y="${R + 10 + 18}" text-anchor="middle" font-family="${esc(o.font)}" font-weight="700" font-size="${mark.length > 1 ? 40 : 54}" fill="${onC}">${esc(mark)}</text>` : ''}`;
    const tw = Math.ceil(name.length * fs * 0.56); let W, Hh, body; const tx = (x, y, anchor) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${esc(o.font)}" font-weight="700" font-size="${fs}" fill="${H2}">${esc(name)}</text>`;
    if (o.layout === 'Icon only') { W = 120; Hh = 120; body = icon; } else if (o.layout === 'Name only') { W = tw + 40; Hh = 90; body = tx(20, 60, 'start'); } else if (o.layout === 'Icon above name') { W = Math.max(140, tw + 40); Hh = 200; body = `<g transform="translate(${(W - 120) / 2},10)">${icon}</g>${tx(W / 2, 175, 'middle')}`; } else { W = 130 + tw + 20; Hh = 120; body = icon + tx(135, 82, 'start'); }
    const bgc = o.bg.trim() ? `<rect width="${W}" height="${Hh}" fill="${hexOf(parseColor(o.bg).map(Math.round))}"/>` : '', svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}">${bgc}${body}</svg>`;
    const sc = clamp(o.png, 1, 8), cv = document.createElement('canvas'); cv.width = W * sc; cv.height = Hh * sc;
    const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Could not draw the SVG')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const png = await new Promise((res) => cv.toBlob(res, 'image/png'));
    return { text: svg, blob: png, filename: 'logo.png', };
  },
});

// ---------- social banner ----------
const BANNERS = { 'LinkedIn profile banner 1584x396': [1584, 396], 'YouTube channel art 2560x1440': [2560, 1440], 'X header 1500x500': [1500, 500], 'Open Graph share image 1200x630': [1200, 630], 'X large card 1200x600': [1200, 600], 'Custom size': [0, 0] };
T.push({
  id: 'social-banner-maker', cat: 'Images', title: 'Social Media Banner Maker with Safe-Area Guides', desc: 'Make a header image at a chosen size with text, a colour or photo background and a safe-area guide.', dom: true, inputs: 1,
  labels: ['Banner text (line breaks allowed)'], sample: 'Your name\nWhat you do', file: { accept: 'image/*', optional: true },
  opts: [sel('preset', 'Size preset (sizes are commonly quoted, check the platform)', Object.keys(BANNERS)), num('w', 'Custom width', 1500), num('h', 'Custom height', 500), txt('c1', 'Background colour (or gradient start)', '#1e3a8a'), txt('c2', 'Gradient end (blank = solid)', '#7c3aed'), txt('fg', 'Text colour', '#ffffff'), num('size', 'Text size (% of height)', 16), sel('align', 'Text position', ['centre', 'left', 'right']), num('safe', 'Safe area inset (% of each side)', 10), chk('guide', 'Draw the safe-area guide (turn off for the final file)', true)],
  run: async ([text], o, files) => {
    let [W, H] = BANNERS[o.preset]; if (!W) { W = clamp(o.w, 64, 6000) | 0; H = clamp(o.h, 64, 6000) | 0; } const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    const a = hexOf(parseColor(o.c1).map(Math.round)), b = o.c2.trim() ? hexOf(parseColor(o.c2).map(Math.round)) : null, g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, a); g.addColorStop(1, b || a); c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (files && files[0]) { const im = await createImageBitmap(files[0]), s = Math.max(W / im.width, H / im.height); c.drawImage(im, (W - im.width * s) / 2, (H - im.height * s) / 2, im.width * s, im.height * s); }
    const ins = clamp(o.safe, 0, 40) / 100, sx = W * ins, sy = H * ins, fs = (H * clamp(o.size, 3, 60)) / 100, ls = text.split('\n'); c.font = `700 ${fs}px sans-serif`; c.fillStyle = o.fg; c.textBaseline = 'middle'; c.textAlign = o.align === 'centre' ? 'center' : o.align; const x = o.align === 'centre' ? W / 2 : o.align === 'left' ? sx : W - sx;
    ls.forEach((l, i) => { c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = fs / 8; c.fillText(l, x, H / 2 + (i - (ls.length - 1) / 2) * fs * 1.2, W - 2 * sx); });
    c.shadowBlur = 0; if (o.guide) { c.setLineDash([12, 8]); c.lineWidth = Math.max(2, W / 600); c.strokeStyle = '#ffffff'; c.strokeRect(sx, sy, W - 2 * sx, H - 2 * sy); c.strokeStyle = '#000'; c.lineDashOffset = 10; c.strokeRect(sx, sy, W - 2 * sx, H - 2 * sy); }
    return new Promise((res) => cv.toBlob((bl) => res({ blob: bl, filename: `banner-${W}x${H}.png`, text: `${W}x${H} PNG. The dashed rectangle marks the safe area (${Math.round(ins * 100)}% in from each edge). Platforms crop headers differently on phones and desktops, so keep key text inside it. Preset sizes are widely quoted values that were not checked against each platform today.` }), 'image/png'));
  },
});

// ---------- styled QR ----------
T.push({
  id: 'styled-qr-code-designer', cat: 'Generators', title: 'Styled QR Code Designer: Dot Styles, Colors and Center Logo', desc: 'Make a QR code with rounded or dotted modules, your colours and an optional logo in the middle.', dom: true,
  labels: ['Text or URL'], sample: 'https://example.com/', file: { accept: 'image/*', optional: true },
  opts: [sel('dots', 'Module style', ['square', 'rounded', 'dots']), sel('eyes', 'Corner squares', ['square', 'rounded']), txt('fg', 'Dark colour', '#111827'), txt('bg', 'Light colour', '#ffffff'), sel('ecc', 'Error correction (H is used with a logo)', ['L', 'M', 'Q', 'H'], 'M'), num('logo', 'Logo size (% of width, max 25)', 20), num('px', 'PNG size (px)', 600)],
  run: async ([text], o, files) => {
    if (!text.trim()) throw new Error('Enter text or a URL'); const logo = files && files[0], q = _qr.qrMatrix(text.trim(), logo ? 'H' : o.ecc), m = q.matrix, n = m.length, quiet = 4, T2 = n + quiet * 2, fg = hexOf(parseColor(o.fg).map(Math.round)), bg = hexOf(parseColor(o.bg).map(Math.round));
    if (ratio(parseColor(o.fg), parseColor(o.bg)) < 3) throw new Error('Dark and light colours are too close. QR scanners need strong contrast (at least 3:1, more is safer). Dark on light also scans best.');
    const L = logo ? clamp(o.logo, 5, 25) / 100 * n : 0, c0 = (n - L) / 2, inLogo = (x, y) => logo && x >= c0 - 1 && x < c0 + L + 1 && y >= c0 - 1 && y < c0 + L + 1;
    const inEye = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7); let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!m[y][x] || inEye(x, y) || inLogo(x, y)) continue; const X = x + quiet, Y = y + quiet;
      if (o.dots === 'dots') d += `M${X + 0.5} ${Y + 0.1}a0.4 0.4 0 1 0 0.001 0z`; else if (o.dots === 'rounded') d += `M${X + 0.3} ${Y}h0.4a0.3 0.3 0 0 1 0.3 0.3v0.4a0.3 0.3 0 0 1 -0.3 0.3h-0.4a0.3 0.3 0 0 1 -0.3 -0.3v-0.4a0.3 0.3 0 0 1 0.3 -0.3z`; else d += `M${X} ${Y}h1v1h-1z`;
    }
    const eye = ([ex, ey]) => { const X = ex + quiet, Y = ey + quiet, r = o.eyes === 'rounded' ? 1.8 : 0; return `<rect x="${X + 0.5}" y="${Y + 0.5}" width="6" height="6" rx="${r}" fill="none" stroke="${fg}" stroke-width="1"/><rect x="${X + 2}" y="${Y + 2}" width="3" height="3" rx="${r / 2}" fill="${fg}"/>`; };
    let img = ''; if (logo) { const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(logo); }); img = `<rect x="${c0 + quiet - 0.6}" y="${c0 + quiet - 0.6}" width="${L + 1.2}" height="${L + 1.2}" fill="${bg}"/><image href="${b64}" x="${c0 + quiet}" y="${c0 + quiet}" width="${L}" height="${L}" preserveAspectRatio="xMidYMid meet"/>`; }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T2} ${T2}" width="${T2 * 10}" height="${T2 * 10}"><rect width="${T2}" height="${T2}" fill="${bg}"/><path d="${d}" fill="${fg}"/>${[[0, 0], [n - 7, 0], [0, n - 7]].map(eye).join('')}${img}</svg>`;
    const P = clamp(o.px, 100, 2000) | 0, cv = document.createElement('canvas'); cv.width = cv.height = P; const image = new Image(); await new Promise((res, rej) => { image.onload = res; image.onerror = () => rej(new Error('Could not draw the QR code')); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }); cv.getContext('2d').drawImage(image, 0, 0, P, P);
    const png = await new Promise((res) => cv.toBlob(res, 'image/png'));
    return { text: svg, blob: png, filename: 'qr.png' };
  },
});

T.push({
  id: 'column-grid-planner', cat: 'CSS', title: 'Column Grid Planner: Columns, Gutters and Margins with CSS', desc: 'Work out column widths and positions for a design grid and copy the CSS.', inputs: 0, sample: '',
  opts: [num('width', 'Canvas width (px)', 1440), num('cols', 'Columns', 12), num('gutter', 'Gutter (px)', 24), num('margin', 'Side margin (px)', 80)],
  run(_i, o) {
    const W = o.width, n = o.cols | 0, g = o.gutter, m = o.margin; if (!(W > 0 && n >= 1 && g >= 0 && m >= 0)) throw new Error('Enter positive numbers'); const col = (W - 2 * m - g * (n - 1)) / n; if (col <= 0) throw new Error('Columns would have no width. Reduce the gutter or margin.');
    const xs = Array.from({ length: n }, (_, i) => m + i * (col + g)), r = (v) => +v.toFixed(3);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 200" width="${W}" height="200">${xs.map((x) => `<rect x="${r(x)}" y="0" width="${r(col)}" height="200" fill="#ef4444" fill-opacity=".18"/>`).join('')}</svg>`;
    return { text: `Canvas ${W}px, ${n} columns, gutter ${g}px, margin ${m}px\nColumn width: ${r(col)}px\nContent width: ${W - 2 * m}px\n\nColumn left edges (px):\n${xs.map((x, i) => `${String(i + 1).padStart(2)}: ${r(x)}`).join('\n')}\n\nCSS grid:\n.grid {\n  display: grid;\n  grid-template-columns: repeat(${n}, 1fr);\n  column-gap: ${g}px;\n  max-width: ${W}px;\n  padding-inline: ${m}px;\n  margin-inline: auto;\n}\n\nSpan example: a 4 column block is ${r(4 * col + 3 * g)}px wide.\n\nSVG overlay:\n${svg}`, html: `<!doctype html><meta charset="utf-8"><body style="margin:0">${svg.replace(/width="\d+" height="200"/, 'style="width:100%;height:auto"')}` };
  },
});

// ---------- composition guides ----------
function guideSpiral(c, x, y, w, h, flip) {
  const P = (1 + Math.sqrt(5)) / 2; let rect = { x: 0, y: 0, w: P, h: 1 }; c.beginPath();
  for (let k = 0; k < 11; k++) {
    const d = k % 4, s = d === 0 || d === 2 ? rect.h : rect.w; let cx0, cy0;
    if (d === 0) { cx0 = rect.x + s; cy0 = rect.y + s; rect = { x: rect.x + s, y: rect.y, w: rect.w - s, h: rect.h }; }
    else if (d === 1) { cx0 = rect.x; cy0 = rect.y + s; rect = { x: rect.x, y: rect.y + s, w: rect.w, h: rect.h - s }; }
    else if (d === 2) { cx0 = rect.x + rect.w - s; cy0 = rect.y; rect = { x: rect.x, y: rect.y, w: rect.w - s, h: rect.h }; }
    else { cx0 = rect.x + s; cy0 = rect.y + rect.h - s; rect = { x: rect.x, y: rect.y, w: rect.w, h: rect.h - s }; }
    const a0 = Math.PI + (k * Math.PI) / 2, steps = 24;
    for (let i = 0; i <= steps; i++) { const a = a0 + (i / steps) * (Math.PI / 2), px = cx0 + s * Math.cos(a), py = cy0 + s * Math.sin(a); const [X, Y] = flip(px / P, py); (k === 0 && i === 0 ? c.moveTo : c.lineTo).call(c, x + X * w, y + Y * h); }
  }
  c.stroke();
}
T.push({
  id: 'composition-guides-overlay', cat: 'Images', title: 'Composition Guides Overlay: Rule of Thirds and Golden Spiral on a Photo', desc: 'Draw thirds, phi grid, diagonals and a golden spiral over an image and save the result.', dom: true, inputs: 0, sample: '', file: { accept: 'image/*' },
  opts: [chk('thirds', 'Rule of thirds', true), chk('phi', 'Golden ratio grid (38.2% and 61.8%)', false), chk('spiral', 'Golden spiral', true), chk('diag', 'Diagonals', false), chk('center', 'Centre cross', false), chk('fx', 'Flip spiral left to right', false), chk('fy', 'Flip spiral top to bottom', false), txt('color', 'Line colour', '#ffffff'), num('width', 'Line width (px)', 3)],
  run: async (_i, o, files) => {
    const f = files && files[0]; if (!f) throw new Error('Choose an image'); const im = await createImageBitmap(f), W = im.width, H = im.height, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'); c.drawImage(im, 0, 0);
    const lw = clamp(o.width, 1, 20) * Math.max(1, Math.max(W, H) / 1500), line = (x1, y1, x2, y2) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }; c.lineWidth = lw; c.strokeStyle = o.color; c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = lw * 2;
    const g = (fr) => { line(W * fr, 0, W * fr, H); line(W * (1 - fr), 0, W * (1 - fr), H); line(0, H * fr, W, H * fr); line(0, H * (1 - fr), W, H * (1 - fr)); };
    if (o.thirds) g(1 / 3); if (o.phi) g(1 - 1 / ((1 + Math.sqrt(5)) / 2)); if (o.diag) { line(0, 0, W, H); line(W, 0, 0, H); } if (o.center) { line(W / 2, 0, W / 2, H); line(0, H / 2, W, H / 2); }
    if (o.spiral) { const P = (1 + Math.sqrt(5)) / 2, land = W >= H; let rw, rh; if (land) { rh = H; rw = H * P; if (rw > W) { rw = W; rh = W / P; } } else { rw = W; rh = W * P; if (rh > H) { rh = H; rw = H / P; } } const x0 = (W - rw) / 2, y0 = (H - rh) / 2;
      // canonical rectangle is landscape; for portrait images swap axes
      const flip = (u, v) => { let a = u, b = v; if (o.fx) a = 1 - a; if (o.fy) b = 1 - b; return land ? [a, b] : [b, a]; }; guideSpiral(c, x0, y0, rw, rh, land ? flip : (u, v) => { const [p, q] = (() => { let a = u, b = v; if (o.fx) a = 1 - a; if (o.fy) b = 1 - b; return [a, b]; })(); return [q, p]; }); }
    return new Promise((res) => cv.toBlob((b) => res({ blob: b, filename: 'composition-guides.png', text: `${W}x${H} PNG with guides drawn on a copy. Guides are aids, not rules: the golden spiral is an approximation built from quarter circles.` }), 'image/png'));
  },
});

// ---------- business card PDF (hand-written PDF, standard Helvetica fonts, WinAnsi text) ----------
function cardPdf(o) {
  const mm = 72 / 25.4, SZ = { 'EU 85 x 55 mm': [85, 55], 'US 3.5 x 2 in (88.9 x 50.8 mm)': [88.9, 50.8], 'Square 55 x 55 mm': [55, 55] }[o.size], [CW, CH] = SZ, bl = clamp(o.bleed, 0, 10), slug = 8, S = bl + slug, PW = (CW + 2 * S) * mm, PH = (CH + 2 * S) * mm;
  const col = (c) => parseColor(c).map((v) => (v / 255).toFixed(3)).join(' '), bg = parseColor(o.bg), tx = parseColor(o.text), ac = parseColor(o.accent), onAc = ratio(ac, [255, 255, 255]) >= ratio(ac, [0, 0, 0]) ? '1 1 1' : '0 0 0';
  const X = (x) => ((S + x) * mm).toFixed(2), Y = (y) => ((S + CH - y) * mm).toFixed(2); // card-relative, y down, mm
  const L1 = (s) => String(s).replace(/[^\x20-\x7e\xa0-\xff]/g, '?').replace(/([\\()])/g, '\\$1');
  let c = `${col(o.bg)} rg ${X(-bl)} ${Y(CH + bl)} ${((CW + 2 * bl) * mm).toFixed(2)} ${((CH + 2 * bl) * mm).toFixed(2)} re f\n`;
  const text = (s, x, y, size, bold, rgb) => { if (s) c += `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb} rg ${X(x)} ${Y(y)} Td (${L1(s)}) Tj ET\n`; }, T1 = col(o.text), contact = [o.email, o.phone, o.web, o.address].filter(Boolean);
  let x0 = 8;
  if (o.layout === 'Accent bar left') { c += `${col(o.accent)} rg ${X(-bl)} ${Y(CH + bl)} ${((6 + bl) * mm).toFixed(2)} ${((CH + 2 * bl) * mm).toFixed(2)} re f\n`; x0 = 12; }
  text(o.name, x0, 14, 16, true, T1); text(o.title, x0, 19.5, 9, false, T1); text(o.company, x0, 24.5, 9, true, col(o.accent) === T1 ? T1 : col(o.accent));
  if (o.layout === 'Bottom band') { c += `${col(o.accent)} rg ${X(-bl)} ${Y(CH + bl)} ${((CW + 2 * bl) * mm).toFixed(2)} ${((16 + bl) * mm).toFixed(2)} re f\n`; contact.forEach((s, i) => text(s, x0, CH - 11.5 + i * 3.6 - (contact.length - 1) * 1.8 + 3.6, 7.5, false, onAc)); }
  else { c += `${col(o.accent)} rg ${X(x0)} ${Y(27)} ${(18 * mm).toFixed(2)} ${(0.7 * mm).toFixed(2)} re f\n`; contact.forEach((s, i) => text(s, x0, CH - 7 - (contact.length - 1 - i) * 3.8, 8, false, T1)); }
  c += '0 0 0 RG 0.25 w\n'; for (const [cx, cy] of [[0, 0], [CW, 0], [0, CH], [CW, CH]]) { const sx = cx === 0 ? -1 : 1, sy = cy === 0 ? 1 : -1; c += `${X(cx + sx * (bl + 1))} ${Y(cy)} m ${X(cx + sx * (bl + 4))} ${Y(cy)} l S\n${X(cx)} ${Y(cy - sy * (bl + 1))} m ${X(cx)} ${Y(cy - sy * (bl + 4))} l S\n`; }
  const box = (a, b, w, hh) => `[${(a * mm).toFixed(2)} ${(b * mm).toFixed(2)} ${((a + w) * mm).toFixed(2)} ${((b + hh) * mm).toFixed(2)}]`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW.toFixed(2)} ${PH.toFixed(2)}] /TrimBox ${box(S, S, CW, CH)} /BleedBox ${box(slug, slug, CW + 2 * bl, CH + 2 * bl)} /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`,
    `<< /Length ${c.length} >>\nstream\n${c}endstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  let pdf = '%PDF-1.4\n'; const offs = []; objs.forEach((b, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${b}\nendobj\n`; });
  const xr = pdf.length; pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((x) => String(x).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF\n`;
  void bg; void tx;
  return new Blob([Uint8Array.from(pdf, (ch) => ch.charCodeAt(0) & 255)], { type: 'application/pdf' });
}
T.push({
  id: 'business-card-pdf-designer', cat: 'Documents', title: 'Business Card Designer: Print-Ready PDF with Bleed and Crop Marks', desc: 'Lay out a business card and download a PDF with trim and bleed boxes and crop marks.', inputs: 0, sample: '',
  opts: [txt('name', 'Name', 'Alex Morgan'), txt('title', 'Job title', 'Product Designer'), txt('company', 'Company', 'Northwind Studio'), txt('email', 'Email', 'alex@example.com'), txt('phone', 'Phone', '+1 555 010 2030'), txt('web', 'Website', 'example.com'), txt('address', 'Address (one line)', ''), sel('size', 'Card size', ['EU 85 x 55 mm', 'US 3.5 x 2 in (88.9 x 50.8 mm)', 'Square 55 x 55 mm']), sel('layout', 'Layout', ['Left aligned', 'Accent bar left', 'Bottom band']), num('bleed', 'Bleed (mm)', 3), txt('bg', 'Background', '#ffffff'), txt('text', 'Text colour', '#111827'), txt('accent', 'Accent colour', '#2563eb')],
  run: (_i, o) => {
    if (!o.name.trim()) throw new Error('Enter a name'); const w = ratio(parseColor(o.text), parseColor(o.bg)); const blob = cardPdf(o);
    return { blob, filename: 'business-card.pdf', text: `PDF with TrimBox (finished card) and BleedBox set, background extended into the ${clamp(o.bleed, 0, 10)} mm bleed, and crop marks in the margin.\nText on background contrast: ${w.toFixed(2)}:1${w < 4.5 ? ' (review: low for small print)' : ''}.\nFonts are the standard Helvetica and Helvetica-Bold (Latin text only; other characters print as ?). Colours are RGB: ask your print shop whether they need CMYK, and keep important text at least 3 mm inside the trim edge. Check a proof before a large order.` };
  },
});

T.push({
  id: 'emoji-sticker-composer', cat: 'Images', title: 'Emoji Sticker Composer: Combine Two Emoji into a Transparent PNG', desc: 'Place two emoji together as one sticker image.', dom: true, inputs: 0, sample: '',
  opts: [txt('a', 'First emoji', '🐱'), txt('b', 'Second emoji', '🚀'), sel('layout', 'Layout', ['Side by side', 'Overlap', 'Big and small']), num('size', 'Image size (px)', 512), chk('border', 'White sticker border', true)],
  run: (_i, o) => {
    const a = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(o.a)][0]?.segment, b = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(o.b)][0]?.segment; if (!a || !b) throw new Error('Enter two emoji');
    const S = clamp(o.size, 64, 2048) | 0, cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d'); c.textAlign = 'center'; c.textBaseline = 'middle';
    const draw = (e, x, y, sz, rot = 0) => { c.save(); c.translate(x, y); c.rotate(rot); c.font = `${sz}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; if (o.border) { c.shadowColor = '#fff'; c.shadowBlur = sz / 14; for (let i = 0; i < 6; i++) c.fillText(e, 0, 0); c.shadowBlur = 0; } c.fillText(e, 0, 0); c.restore(); };
    if (o.layout === 'Side by side') { draw(a, S * 0.27, S / 2, S * 0.4); draw(b, S * 0.73, S / 2, S * 0.4); } else if (o.layout === 'Overlap') { draw(a, S * 0.4, S * 0.52, S * 0.55, -0.12); draw(b, S * 0.62, S * 0.5, S * 0.4, 0.15); } else { draw(a, S * 0.45, S * 0.45, S * 0.62); draw(b, S * 0.76, S * 0.76, S * 0.3, 0.2); }
    return new Promise((res) => cv.toBlob((bl) => res({ blob: bl, filename: 'emoji-sticker.png', text: 'Both emoji are drawn with your device emoji font, so the look differs by system. This places two emoji together; it does not blend them into a new picture the way Google Emoji Kitchen does, because those images are Google artwork and not available offline.' }), 'image/png'));
  },
});

export const _n20 = { readFont, buildWoff, buildSfnt, fontInfo, fontReport, recolorSvg, cardPdf,  kelvinToRgb, rgb2oklab, oklab2rgb, rgb2lab, ratio, fixAgainst, paintMix, aseBytes, lab2rgb, parseColor, zipStore,  mp4MuteBytes, webmMuteBytes, mp4Info, webmInfo, parseCues };
export default T;

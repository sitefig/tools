// Privacy tools. Everything runs locally; no network requests.
//
// SKIPPED (needs a server / API / account / external network, cannot be done client-side):
//   - WebRTC STUN leak test (needs a STUN server)
//   - DNS leak test (needs controlled DNS servers)
//   - Breach lookups such as Have I Been Pwned (needs an API)
//   - IP geolocation / "what is my IP" (needs a server)
// Notes: tools with `render` or `file` are not exercised by the Node smoke test; the generated legal texts are
// templates and not legal advice.

const tools = [];
const IMG = 'Privacy – Images', SEC = 'Privacy – Secrets', BRO = 'Privacy – Browser', LEG = 'Privacy – Legal';

// ---------- shared helpers ----------
const enc = new TextEncoder();
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rnd = (n) => { const lim = 2 ** 32 - (2 ** 32 % n), a = new Uint32Array(1); do crypto.getRandomValues(a); while (a[0] >= lim); return a[0] % n; };
const pick = (s) => s[rnd(s.length)];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(s); };
const b64u = (u8) => b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256hex = async (s) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof s === 'string' ? enc.encode(s) : s)));
const lines = (s) => s.split(/\r?\n/);
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
const fmtBytes = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB');
const dlBlobEl = (blob, name) => el('a', { href: URL.createObjectURL(blob), download: name, className: 'btn' }, 'Download ' + name);
const entropyOf = (s) => { const m = {}; for (const c of s) m[c] = (m[c] || 0) + 1; return -Object.values(m).reduce((a, n) => a + (n / s.length) * Math.log2(n / s.length), 0); };
const trimNum = (n, d = 4) => String(+n.toFixed(d));

// generic span finder: rules = [name, regex, validator?(matchString, match) => bool]; group 1 is redacted if present
function findSpans(text, rules) {
  const all = [];
  rules.forEach(([type, re, ok], ri) => {
    const r = new RegExp(re.source, re.flags.replace(/[gd]/g, '') + 'gd');
    for (const m of text.matchAll(r)) {
      const g = m[1] !== undefined && m.indices[1] ? m.indices[1] : m.indices[0];
      const val = text.slice(g[0], g[1]);
      if (!val || (ok && !ok(val, m))) continue;
      all.push({ type, start: g[0], end: g[1], val, ri });
    }
  });
  all.sort((a, b) => a.start - b.start || a.ri - b.ri || b.end - a.end);
  const out = []; let last = 0;
  for (const s of all) if (s.start >= last) { out.push(s); last = s.end; }
  return out;
}
const hash32 = (s) => { let h = 5381; for (const c of s) h = ((h * 33) ^ c.codePointAt(0)) >>> 0; return h.toString(16).padStart(8, '0').slice(0, 6); };
function applySpans(text, spans, style = 'label', keep = 0) {
  let out = '', p = 0;
  for (const s of spans) {
    const tag = s.type.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    const tail = keep > 0 && s.val.length > keep * 2 ? s.val.slice(-keep) : '';
    out += text.slice(p, s.start) + (style === 'mask' ? '*'.repeat(Math.max(4, s.val.length - tail.length)) + tail : style === 'pseudonym' ? `[${tag}:${hash32(s.val)}]` : `[${tag}${tail ? ':...' + tail : ''}]`);
    p = s.end;
  }
  return out + text.slice(p);
}
const luhn = (d) => { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; };
const ibanOk = (v) => {
  const s = v.replace(/\s/g, '').toUpperCase(); if (s.length < 15 || s.length > 34) return false;
  let r = 0; for (const c of s.slice(4) + s.slice(0, 4)) for (const d of String(/\d/.test(c) ? c : c.charCodeAt(0) - 55)) r = (r * 10 + +d) % 97;
  return r === 1;
};

// ---------- EXIF / image metadata ----------
const TAGS = {
  ifd0: { 0x010e: 'ImageDescription', 0x010f: 'Make', 0x0110: 'Model', 0x0112: 'Orientation', 0x011a: 'XResolution', 0x011b: 'YResolution', 0x0131: 'Software', 0x0132: 'DateTime', 0x013b: 'Artist', 0x8298: 'Copyright', 0x8769: 'ExifIFD', 0x8825: 'GPSIFD' },
  exif: { 0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8827: 'ISO', 0x9000: 'ExifVersion', 0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized', 0x9010: 'OffsetTime', 0x9201: 'ShutterSpeedValue', 0x9204: 'ExposureBias', 0x9207: 'MeteringMode', 0x9209: 'Flash', 0x920a: 'FocalLength', 0x927c: 'MakerNote', 0x9286: 'UserComment', 0xa001: 'ColorSpace', 0xa002: 'PixelXDimension', 0xa003: 'PixelYDimension', 0xa405: 'FocalLengthIn35mm', 0xa406: 'SceneCaptureType', 0xa420: 'ImageUniqueID', 0xa430: 'CameraOwnerName', 0xa431: 'BodySerialNumber', 0xa433: 'LensMake', 0xa434: 'LensModel', 0xa435: 'LensSerialNumber' },
  gps: { 1: 'GPSLatitudeRef', 2: 'GPSLatitude', 3: 'GPSLongitudeRef', 4: 'GPSLongitude', 5: 'GPSAltitudeRef', 6: 'GPSAltitude', 7: 'GPSTimeStamp', 12: 'GPSSpeedRef', 13: 'GPSSpeed', 16: 'GPSImgDirectionRef', 17: 'GPSImgDirection', 29: 'GPSDateStamp' },
};
const TSIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
const ORIENT = ['', 'Normal', 'Mirror horizontal', 'Rotate 180', 'Mirror vertical', 'Mirror h + rotate 270', 'Rotate 90 CW', 'Mirror h + rotate 90', 'Rotate 270 CW'];

function parseTiff(dv, base) {
  if (base + 8 > dv.byteLength) return null;
  const le = dv.getUint16(base) === 0x4949;
  if (!le && dv.getUint16(base) !== 0x4d4d) return null;
  const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
  if (u16(base + 2) !== 42) return null;
  const readIFD = (off, names) => {
    const res = {};
    if (base + off + 2 > dv.byteLength) return res;
    const n = Math.min(u16(base + off), 500);
    for (let i = 0; i < n; i++) {
      const e = base + off + 2 + i * 12;
      if (e + 12 > dv.byteLength) break;
      const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4), sz = (TSIZE[type] || 0) * cnt;
      if (!sz) continue;
      const vo = sz <= 4 ? e + 8 : base + u32(e + 8);
      if (vo + sz > dv.byteLength) continue;
      let v;
      if (type === 2) { let s = ''; for (let k = 0; k < cnt; k++) { const c = dv.getUint8(vo + k); if (c === 0) break; s += String.fromCharCode(c); } v = s.trim(); }
      else if (type === 7 && cnt > 16) v = `[${cnt} bytes]`;
      else {
        const arr = [];
        for (let k = 0; k < Math.min(cnt, 64); k++) {
          if (type === 1 || type === 7) arr.push(dv.getUint8(vo + k));
          else if (type === 3) arr.push(u16(vo + k * 2));
          else if (type === 4) arr.push(u32(vo + k * 4));
          else if (type === 9) arr.push(dv.getInt32(vo + k * 4, le));
          else if (type === 5) arr.push([u32(vo + k * 8), u32(vo + k * 8 + 4)]);
          else if (type === 10) arr.push([dv.getInt32(vo + k * 8, le), dv.getInt32(vo + k * 8 + 4, le)]);
        }
        v = arr.length === 1 ? arr[0] : arr;
      }
      res[names[tag] || '0x' + tag.toString(16)] = v;
    }
    return res;
  };
  const ifd0 = readIFD(u32(base + 4), TAGS.ifd0);
  const exif = ifd0.ExifIFD != null ? readIFD(ifd0.ExifIFD, TAGS.exif) : {};
  const gps = ifd0.GPSIFD != null ? readIFD(ifd0.GPSIFD, TAGS.gps) : {};
  delete ifd0.ExifIFD; delete ifd0.GPSIFD;
  return { ifd0, exif, gps };
}
const rat = (r) => (Array.isArray(r) && r.length === 2 && r[1] ? r[0] / r[1] : r);
const dms = (a) => (Array.isArray(a) && a.length === 3 && Array.isArray(a[0]) ? rat(a[0]) + rat(a[1]) / 60 + rat(a[2]) / 3600 : null);
function fmtExif(k, v) {
  if (k === 'ExposureTime' && Array.isArray(v)) return v[0] && v[1] ? (v[0] / v[1] >= 1 ? trimNum(v[0] / v[1]) : `1/${Math.round(v[1] / v[0])}`) + ' s' : String(v);
  if (k === 'Orientation') return `${v} (${ORIENT[v] || '?'})`;
  if (k === 'FNumber' && Array.isArray(v)) return 'f/' + trimNum(rat(v), 2);
  if (k === 'FocalLength' && Array.isArray(v)) return trimNum(rat(v), 2) + ' mm';
  if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number' && /Resolution|Bias|Altitude|Speed|Direction/.test(k)) return trimNum(rat(v), 3);
  if (Array.isArray(v) && v.length && Array.isArray(v[0])) return v.map((r) => trimNum(rat(r), 4)).join(', ');
  if (k === 'ExifVersion' && Array.isArray(v)) return String.fromCharCode(...v);
  return Array.isArray(v) ? v.join(', ') : String(v);
}
const fourcc = (u8, o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

// returns { format, info:[lines], tiff }
function readMeta(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf), info = []; let tiff = null, format = 'unknown';
  if (u8[0] === 0xff && u8[1] === 0xd8) {
    format = 'JPEG'; let o = 2;
    while (o + 4 <= u8.length && u8[o] === 0xff) {
      const m = u8[o + 1];
      if (m === 0xff) { o++; continue; }
      if (m === 0xda || m === 0xd9) { info.push('SOS: image data starts at ' + o); break; }
      const len = dv.getUint16(o + 2), body = o + 4;
      if (m >= 0xe0 && m <= 0xef) {
        const id = String.fromCharCode(...u8.subarray(body, Math.min(body + 30, o + 2 + len))).split('\0')[0];
        info.push(`APP${m - 0xe0}  ${id}  (${len - 2} bytes)`);
        if (m === 0xe1 && id === 'Exif') tiff = parseTiff(dv, body + 6);
      } else if (m === 0xfe) info.push(`COM  comment: ${new TextDecoder().decode(u8.subarray(body, o + 2 + len)).slice(0, 200)}`);
      else if (SOF.has(m)) info.push(`SOF  ${dv.getUint16(body + 3)} x ${dv.getUint16(body + 1)} px, ${u8[body]} bit`);
      o += 2 + len;
    }
  } else if (u8[0] === 0x89 && fourcc(u8, 1) === 'PNG ') {
    format = 'PNG'; let o = 8;
    while (o + 12 <= u8.length) {
      const len = dv.getUint32(o), t = fourcc(u8, o + 4), b = o + 8;
      if (b + len > u8.length) break;
      const txt = (a, z) => new TextDecoder('latin1').decode(u8.subarray(a, z));
      if (t === 'IHDR') info.push(`IHDR  ${dv.getUint32(b)} x ${dv.getUint32(b + 4)} px, depth ${u8[b + 8]}, colour type ${u8[b + 9]}, ${u8[b + 12] ? 'interlaced' : 'not interlaced'}`);
      else if (t === 'tEXt') { const z = u8.indexOf(0, b); info.push(`tEXt  ${txt(b, z)} = ${txt(z + 1, b + len).slice(0, 200)}`); }
      else if (t === 'iTXt') { const z = u8.indexOf(0, b); info.push(`iTXt  ${txt(b, z)} (${len} bytes)${txt(b, z) === 'XML:com.adobe.xmp' ? '  <- XMP' : ''}`); }
      else if (t === 'zTXt') info.push(`zTXt  ${txt(b, u8.indexOf(0, b))} (compressed)`);
      else if (t === 'tIME') info.push(`tIME  ${dv.getUint16(b)}-${u8[b + 2]}-${u8[b + 3]} ${u8[b + 4]}:${u8[b + 5]}:${u8[b + 6]}`);
      else if (t === 'pHYs') info.push(`pHYs  ${dv.getUint32(b)} x ${dv.getUint32(b + 4)} per ${u8[b + 8] ? 'metre' : 'unit'}`);
      else if (t === 'eXIf') { info.push(`eXIf  ${len} bytes`); tiff = parseTiff(dv, b); }
      else if (t === 'iCCP') info.push(`iCCP  profile "${txt(b, u8.indexOf(0, b))}"`);
      else if (!['IDAT', 'IEND'].includes(t)) info.push(`${t}  ${len} bytes`);
      o += 12 + len;
    }
  } else if (fourcc(u8, 0) === 'RIFF' && fourcc(u8, 8) === 'WEBP') {
    format = 'WebP'; let o = 12;
    while (o + 8 <= u8.length) {
      const t = fourcc(u8, o), len = dv.getUint32(o + 4, true), b = o + 8;
      if (t === 'VP8X') info.push(`VP8X  ${1 + (u8[b + 4] | u8[b + 5] << 8 | u8[b + 6] << 16)} x ${1 + (u8[b + 7] | u8[b + 8] << 8 | u8[b + 9] << 16)} px, flags: ${['ICC', 'alpha', 'EXIF', 'XMP', 'animation'].filter((_, i) => u8[b] & [0x20, 0x10, 0x08, 0x04, 0x02][i]).join(', ') || 'none'}`);
      else if (t === 'EXIF') { info.push(`EXIF  ${len} bytes`); tiff = parseTiff(dv, b + (fourcc(u8, b) === 'Exif' ? 6 : 0)); }
      else info.push(`${t}  ${len} bytes`);
      o = b + len + (len & 1);
    }
  } else throw new Error('Not a JPEG, PNG or WebP file');
  return { format, info, tiff };
}
function describeMeta(name, size, buf) {
  const { format, info, tiff } = readMeta(buf), out = [`== ${name} (${format}, ${fmtBytes(size)}) ==`, '', 'Structure:', ...info.map((l) => '  ' + l)], risks = [];
  if (tiff) {
    for (const [title, key] of [['EXIF - main (IFD0)', 'ifd0'], ['EXIF - camera/exposure', 'exif'], ['EXIF - GPS', 'gps']]) {
      const e = Object.entries(tiff[key]); if (!e.length) continue;
      out.push('', title + ':', ...e.map(([k, v]) => `  ${k.padEnd(22)} ${fmtExif(k, v)}`.slice(0, 200)));
    }
    const g = tiff.gps, lat = dms(g.GPSLatitude), lon = dms(g.GPSLongitude);
    if (lat != null && lon != null) {
      const la = (g.GPSLatitudeRef === 'S' ? -1 : 1) * lat, lo = (g.GPSLongitudeRef === 'W' ? -1 : 1) * lon;
      out.push('', `Location: ${la.toFixed(6)}, ${lo.toFixed(6)}  (paste into any map to see where this was taken)`);
      risks.push('GPS coordinates reveal where the photo was taken');
    }
    const all = { ...tiff.ifd0, ...tiff.exif };
    if (all.BodySerialNumber || all.LensSerialNumber) risks.push('Camera/lens serial number identifies the device');
    if (all.CameraOwnerName || all.Artist) risks.push('Owner/artist name present');
    if (all.DateTimeOriginal || all.DateTime) risks.push('Capture timestamp present');
    if (all.Software) risks.push('Software/editing tool revealed: ' + all.Software);
    if (all.Make || all.Model) risks.push(`Device model: ${[all.Make, all.Model].filter(Boolean).join(' ')}`);
    if (all.ImageUniqueID) risks.push('Unique image ID present');
  }
  if (info.some((l) => /xmp/i.test(l) || /ns\.adobe\.com\/xap/.test(l))) risks.push('XMP metadata block present (may hold author, edit history)');
  if (info.some((l) => /Photoshop/.test(l))) risks.push('Photoshop/IPTC block present (captions, creator, location names)');
  if (!tiff && !risks.length) out.push('', 'No EXIF block found.');
  out.push('', risks.length ? 'Privacy risks:\n' + risks.map((r) => '  - ' + r).join('\n') : 'No obvious privacy risks found.');
  return { text: out.join('\n'), risks, tiff, format };
}

tools.push({
  id: 'exif-viewer', cat: IMG, title: 'EXIF / Image Metadata Viewer', desc: 'Parse JPEG EXIF (camera, dates, GPS) and PNG/WebP chunks with a hand-written parser. File never leaves your browser.',
  file: { accept: 'image/jpeg,image/png,image/webp,image/*', multiple: true },
  run: async (_i, _o, files) => ({ text: (await Promise.all(files.map(async (f) => { try { return describeMeta(f.name, f.size, await f.arrayBuffer()).text; } catch (e) { return `== ${f.name} ==\n${e.message}`; } }))).join('\n\n') }),
});

tools.push({
  id: 'exif-remover', cat: IMG, title: 'EXIF / Metadata Remover', desc: 'Re-encodes images through a canvas so EXIF, GPS, XMP and text chunks are dropped. Keeps JPEG/PNG/WebP format. Multiple files supported.',
  file: { accept: 'image/*', multiple: true }, dom: true,
  opts: [{ id: 'quality', label: 'JPEG/WebP quality (0.1-1)', type: 'number', def: 0.92 }],
  run: async (_i, o, files) => {
    const blobs = [], rep = [];
    for (const f of files) {
      const type = ['image/jpeg', 'image/png', 'image/webp'].includes(f.type) ? f.type : 'image/png';
      let had = 'unknown';
      try { const m = describeMeta(f.name, f.size, await f.arrayBuffer()); had = m.risks.length ? 'metadata found (' + m.risks.length + ' risks)' : m.tiff ? 'EXIF found' : 'no EXIF'; } catch { /* not a supported format for inspection */ }
      const bmp = await createImageBitmap(f);
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      const blob = await new Promise((r) => c.toBlob(r, type, Math.min(1, Math.max(0.1, o.quality || 0.92))));
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type];
      blobs.push(new File([blob], f.name.replace(/\.[^.]+$/, '') + '-clean.' + ext, { type }));
      rep.push(`${f.name}: ${had}; ${fmtBytes(f.size)} -> ${fmtBytes(blob.size)}`);
    }
    return { text: rep.join('\n') + '\n\nCanvas re-encoding drops all metadata (EXIF, GPS, XMP, ICC, text chunks). Orientation is baked into the pixels.', blob: blobs };
  },
});

tools.push({
  id: 'image-redaction', cat: IMG, title: 'Image Redaction (blur / black boxes)', desc: 'Load an image, drag boxes over sensitive areas, fill them black or pixelate, export. Metadata is stripped on export.',
  custom: true, dom: true,
  render(root) {
    let bmp = null, boxes = [], drag = null;
    const file = el('input', { type: 'file', accept: 'image/*' });
    const mode = el('select', {}, el('option', { value: 'black' }, 'Black box (safest)'), el('option', { value: 'pixel' }, 'Pixelate'));
    const bs = el('input', { type: 'number', value: 14, min: 4, max: 200, style: 'width:5em' });
    const canvas = el('canvas', { style: 'max-width:100%;cursor:crosshair;touch-action:none;display:none;border:1px solid #888' });
    const ctx = canvas.getContext('2d');
    const status = el('p', { className: 'desc', role: 'status' }, 'Choose an image, then drag on it or use the box fields below to mark areas.');
    const num = (label, v) => { const i = el('input', { type: 'number', value: v, min: 0, step: 1, style: 'width:6em' }); return [i, el('label', {}, label + ' ', i)]; };
    const [nx, lx] = num('X (px)', 0), [ny, ly] = num('Y (px)', 0), [nw, lw] = num('Width (px)', 100), [nh, lh] = num('Height (px)', 50);
    const addBox = () => {
      if (!bmp) { status.textContent = 'Choose an image first.'; return; }
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(+nx.value || 0))), y = Math.max(0, Math.min(canvas.height - 1, Math.floor(+ny.value || 0)));
      const w = Math.min(canvas.width - x, Math.max(1, Math.floor(+nw.value || 0))), h = Math.min(canvas.height - y, Math.max(1, Math.floor(+nh.value || 0)));
      boxes.push({ x, y, w, h, mode: mode.value, bs: Math.max(4, +bs.value || 14) }); paint();
    };
    function paint(extra) {
      if (!bmp) return;
      ctx.drawImage(bmp, 0, 0);
      for (const b of boxes) {
        if (b.mode === 'black') { ctx.fillStyle = '#000'; ctx.fillRect(b.x, b.y, b.w, b.h); }
        else {
          const tw = Math.max(1, Math.ceil(b.w / b.bs)), th = Math.max(1, Math.ceil(b.h / b.bs)), t = document.createElement('canvas');
          t.width = tw; t.height = th;
          t.getContext('2d').drawImage(bmp, b.x, b.y, b.w, b.h, 0, 0, tw, th);
          ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, tw, th, b.x, b.y, b.w, b.h); ctx.imageSmoothingEnabled = true;
        }
      }
      if (extra) { ctx.strokeStyle = '#f0f'; ctx.lineWidth = Math.max(2, canvas.width / 400); ctx.strokeRect(extra.x, extra.y, extra.w, extra.h); }
      if (!extra) status.textContent = `${boxes.length} redaction(s). Image ${canvas.width} x ${canvas.height}.` + boxes.map((b, i) => ` Box ${i + 1}: x ${Math.round(b.x)}, y ${Math.round(b.y)}, ${Math.round(b.w)} x ${Math.round(b.h)}.`).join('');
    }
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height]; };
    const rect = (a, b) => ({ x: Math.max(0, Math.min(a[0], b[0])), y: Math.max(0, Math.min(a[1], b[1])), w: Math.min(canvas.width, Math.abs(a[0] - b[0])), h: Math.min(canvas.height, Math.abs(a[1] - b[1])) });
    canvas.addEventListener('pointerdown', (e) => { drag = { a: pos(e) }; try { canvas.setPointerCapture(e.pointerId); } catch {} });
    canvas.addEventListener('pointermove', (e) => { if (drag) paint(rect(drag.a, pos(e))); });
    canvas.addEventListener('pointerup', (e) => {
      if (!drag) return;
      const r = rect(drag.a, pos(e)); drag = null;
      if (r.w > 3 && r.h > 3) boxes.push({ ...r, mode: mode.value, bs: Math.max(4, +bs.value || 14) });
      paint();
    });
    file.addEventListener('change', async () => {
      if (!file.files[0]) return;
      bmp = await createImageBitmap(file.files[0]); boxes = [];
      canvas.width = bmp.width; canvas.height = bmp.height; canvas.style.display = ''; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `Image to redact, ${bmp.width} x ${bmp.height} px. Redaction boxes are listed in the status line.`); paint();
    });
    const exp = (type, ext) => () => { if (!bmp) return; paint(); canvas.toBlob((b) => { const a = dlBlobEl(b, 'redacted.' + ext); a.click(); }, type, 0.92); };
    root.append(
      el('label', {}, 'Image'), file,
      el('div', { className: 'opts' }, el('label', {}, 'Fill ', mode), el('label', {}, 'Pixel block size ', bs)),
      el('div', { className: 'row', role: 'group', 'aria-label': 'Add a redaction box by position and size (keyboard alternative to dragging)' }, lx, ly, lw, lh, el('button', { onclick: addBox }, 'Add box')),
      el('div', { className: 'row' },
        el('button', { onclick: () => { boxes.pop(); paint(); } }, 'Undo'),
        el('button', { onclick: () => { boxes = []; paint(); } }, 'Clear'),
        el('button', { onclick: exp('image/png', 'png') }, 'Export PNG'),
        el('button', { onclick: exp('image/jpeg', 'jpg') }, 'Export JPEG')),
      status, canvas,
      el('p', { className: 'desc' }, 'Tip: pixelation with small blocks can sometimes be reversed; use black boxes for passwords, faces or ID numbers. Exported files contain no EXIF/GPS data.'));
  },
});

// ---------- password / passphrase / strength ----------
const CLS = { lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digits: '0123456789', symbols: '!@#$%^&*()-_=+[]{};:,.<>?/~' };
tools.push({
  id: 'password-generator', cat: SEC, title: 'Password Generator', desc: 'Cryptographically random passwords (crypto.getRandomValues, no modulo bias). Guarantees each selected class appears.',
  inputs: 0, sample: '',
  opts: [{ id: 'length', label: 'Length', type: 'number', def: 20 }, { id: 'count', label: 'How many', type: 'number', def: 5 },
    { id: 'lower', label: 'a-z', type: 'checkbox', def: true }, { id: 'upper', label: 'A-Z', type: 'checkbox', def: true }, { id: 'digits', label: '0-9', type: 'checkbox', def: true }, { id: 'symbols', label: 'Symbols', type: 'checkbox', def: true },
    { id: 'ambiguous', label: 'Exclude look-alikes (O0Il1|)', type: 'checkbox', def: false }],
  run: (_i, o) => {
    const sets = ['lower', 'upper', 'digits', 'symbols'].filter((k) => o[k]).map((k) => (o.ambiguous ? CLS[k].replace(/[O0Il1|]/g, '') : CLS[k]));
    if (!sets.length) throw new Error('Select at least one character class');
    const len = Math.floor(o.length); if (!(len >= sets.length && len <= 512)) throw new Error(`Length must be ${sets.length}-512`);
    const all = sets.join(''), res = [];
    for (let n = 0; n < Math.min(Math.max(1, o.count | 0), 200); n++) { const c = sets.map(pick); while (c.length < len) c.push(pick(all)); res.push(shuffle(c).join('')); }
    return res.join('\n') + `\n\n# ~${(len * Math.log2(all.length)).toFixed(0)} bits of entropy each (${all.length} symbols)`;
  },
});

const ONS = 'b d f g h j k l m n p r s t v z ch sh th br dr fl gr kr pr st tr pl'.split(' '), VOW = ['a', 'e', 'i', 'o', 'u', 'ai', 'ou', 'ee'], COD = ['', 'n', 'r', 'l', 's', 't', 'm', 'k'];
tools.push({
  id: 'passphrase-generator', cat: SEC, title: 'Passphrase Generator', desc: 'Pronounceable syllable-based passphrases from crypto.getRandomValues. Entropy is computed exactly from the syllable space.',
  inputs: 0, sample: '',
  opts: [{ id: 'words', label: 'Words', type: 'number', def: 5 }, { id: 'count', label: 'How many', type: 'number', def: 5 }, { id: 'sep', label: 'Separator', type: 'text', def: '-' },
    { id: 'cap', label: 'Capitalise', type: 'checkbox', def: false }, { id: 'num', label: 'Append a digit', type: 'checkbox', def: false }],
  run: (_i, o) => {
    const w = Math.floor(o.words); if (!(w >= 2 && w <= 20)) throw new Error('Words must be 2-20');
    const syl = () => pick(ONS) + pick(VOW) + pick(COD);
    const word = () => { const s = syl() + syl() + syl(); return o.cap ? s[0].toUpperCase() + s.slice(1) : s; };
    const perWord = Math.log2(ONS.length ** 3 * VOW.length ** 3 * COD.length ** 3);
    const res = Array.from({ length: Math.min(Math.max(1, o.count | 0), 100) }, () => Array.from({ length: w }, word).join(o.sep ?? '-') + (o.num ? (o.sep ?? '-') + rnd(10) : ''));
    return res.join('\n') + `\n\n# ${perWord.toFixed(1)} bits per word, ${(perWord * w + (o.num ? 3.3 : 0)).toFixed(0)} bits total (words are 3-syllable pseudo-words, so they are easy to say but not dictionary words)`;
  },
});

const COMMON = `password 123456 12345678 123456789 1234567890 1234567 12345 1234 qwerty qwertyuiop qwerty123 abc123 abcd1234 monkey letmein trustno1 dragon baseball 111111 000000 iloveyou master sunshine ashley bailey passw0rd shadow 123123 654321 superman qazwsx michael football welcome jesus ninja mustang password1 password123 admin admin123 login princess starwars hello freedom whatever 1q2w3e4r zaq12wsx batman charlie donald access flower hottie loveme cheese computer secret summer winter spring love jordan tigger hunter ranger buster soccer harley thomas robert matrix pepper changeme default root toor test guest user pass p@ssw0rd letmein1 welcome1 monkey1 dragon1 azerty google facebook samsung killer pokemon naruto liverpool chelsea arsenal barcelona cookie banana orange yankees lakers hockey maggie amanda jennifer jessica daniel andrew joshua hannah nicole family internet service server office company mypassword welcome123 asdfghjkl zxcvbnm 1qaz2wsx qwer1234 iloveyou1 football1 sunshine1 princess1 letmein123 master123 hello123 pass123 secret123 passpass administrator qwe123 zxcvbn 7777777 888888 666666 121212 112233 123321 696969 159753 987654321 q1w2e3r4 0987654321 abc12345 test123 testing temp temp123 demo oracle mysql postgres ubuntu windows linux apple summer2020 summer2021 summer2022 summer2023 summer2024 winter2023 spring2024 welcome2024 password2024 password2023 troubador`.split(/\s+/);
const WALKS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', 'azertyuiop', 'qsdfghjklm', 'wxcvbn', '1qaz2wsx3edc', 'qazwsxedc'];
const DELEET = { '@': 'a', 4: 'a', 3: 'e', 1: 'i', '!': 'i', 0: 'o', $: 's', 5: 's', 7: 't', '+': 't', 8: 'b', 9: 'g' };
const dur = (s) => {
  if (s < 1) return 'instantly'; const u = [['year', 31557600], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
  if (s > 31557600 * 1e9) return 'longer than the age of the universe'; if (s > 31557600 * 1e6) return (s / 31557600 / 1e6).toFixed(0) + ' million years';
  for (const [n, v] of u) if (s >= v) { const x = Math.floor(s / v); return x.toLocaleString('en') + ' ' + n + (x === 1 ? '' : 's'); }
};
// ponytail: greedy non-optimal segmentation (zxcvbn-lite); upgrade to full DP matching if accuracy matters
function analyzePassword(pw) {
  const lower = pw.toLowerCase(), de = [...lower].map((c) => DELEET[c] || c).join(''), n = pw.length, cov = new Array(n).fill(0), seg = [], found = [];
  const mark = (i, j, bits, label) => { if (cov.slice(i, j).every((x) => x)) return; for (let k = i; k < j; k++) cov[k] = 1; seg.push(bits); found.push(`${label}: "${pw.slice(i, j)}"`); };
  for (const w of COMMON) {
    if (w.length < 4 && lower !== w) continue;
    for (const [src, tag] of [[lower, 'common password'], [de, 'common password (with l33t substitutions)']]) { const i = src.indexOf(w); if (i >= 0) { mark(i, i + w.length, Math.log2(COMMON.length) + (src === de && src !== lower ? 2 : 0) + (lower === w ? 0 : 2), tag); break; } }
  }
  for (const row of WALKS) for (const r of [row, [...row].reverse().join('')]) for (let i = 0; i + 4 <= r.length; i++) for (let l = Math.min(r.length - i, n); l >= 4; l--) { const sub = r.slice(i, i + l), at = lower.indexOf(sub); if (at >= 0) { mark(at, at + l, 6 + Math.log2(l), 'keyboard walk'); break; } }
  for (let i = 0; i + 4 <= n;) {
    let j = i + 1; const d = lower.charCodeAt(i + 1) - lower.charCodeAt(i);
    if (Math.abs(d) === 1) { while (j + 1 < n && lower.charCodeAt(j + 1) - lower.charCodeAt(j) === d) j++; if (j - i + 1 >= 4) { mark(i, j + 1, 5 + Math.log2(j - i + 1), 'sequence'); i = j + 1; continue; } }
    i++;
  }
  for (const m of pw.matchAll(/(.)\1{2,}/g)) mark(m.index, m.index + m[0].length, 4 + Math.log2(m[0].length), 'repeated character');
  const rep = pw.match(/^(.{2,}?)\1+$/); if (rep) mark(0, n, 8 + Math.log2(n / rep[1].length), 'repeated chunk');
  for (const m of pw.matchAll(/(?:19|20)\d\d/g)) mark(m.index, m.index + 4, 7, 'year');
  const pool = (/[a-z]/.test(pw) ? 26 : 0) + (/[A-Z]/.test(pw) ? 26 : 0) + (/\d/.test(pw) ? 10 : 0) + (/[ -/:-@[-`{-~]/.test(pw) ? 33 : 0) + (/[^\x00-\x7f]/.test(pw) ? 100 : 0);
  const naive = n * Math.log2(pool || 1);
  const bits = seg.reduce((a, b) => a + b, 0) + cov.filter((x) => !x).length * Math.log2(pool || 1);
  return { n, pool, naive, bits: Math.min(bits, naive), found, classes: ['lower', 'upper', 'digit', 'symbol'].filter((_, i) => [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/][i].test(pw)) };
}
tools.push({
  id: 'password-strength', cat: SEC, title: 'Password Strength Checker', desc: 'Entropy, patterns (common passwords, l33t, keyboard walks, sequences, repeats), and crack-time estimates. Runs only in this page.',
  placeholder: ['Type or paste a password (it is not sent anywhere)'], labels: ['Password'], sample: 'Tr0ub4dor&3',
  run: ([pw]) => {
    pw = pw.replace(/\r?\n$/, ''); if (!pw) throw new Error('Enter a password');
    const a = analyzePassword(pw), b = a.bits, verdict = b < 28 ? 'Very weak' : b < 36 ? 'Weak' : b < 60 ? 'Fair' : b < 80 ? 'Strong' : 'Very strong';
    const rates = [['Online, rate-limited (10 guesses/s)', 10], ['Online, unthrottled (10k/s)', 1e4], ['Offline, slow hash like bcrypt/argon2 (100k/s)', 1e5], ['Offline, fast hash like MD5/SHA-1 on GPUs (100 billion/s)', 1e11], ['Large cracking cluster (10 trillion/s)', 1e13]];
    const tips = [];
    if (a.n < 12) tips.push('Use at least 12 characters; length beats complexity.');
    if (a.found.length) tips.push('Avoid predictable words, sequences and keyboard patterns, even with substitutions like a->@.');
    if (b < 60) tips.push('Prefer a random passphrase of 5+ words or a generated password from a password manager.');
    tips.push('Use a unique password per site and enable 2FA.');
    return [`Verdict: ${verdict}`, `Length: ${a.n}   Character classes: ${a.classes.join(', ')} (pool ~${a.pool})`, `Naive entropy: ${a.naive.toFixed(1)} bits`, `Estimated entropy after pattern analysis: ${b.toFixed(1)} bits`, '',
      'Patterns found:', ...(a.found.length ? a.found.map((f) => '  - ' + f) : ['  none']), '',
      'Estimated time to crack (average case, half the keyspace):', ...rates.map(([n, r]) => `  ${n.padEnd(58)} ${dur(2 ** (b - 1) / r)}`), '', 'Advice:', ...tips.map((t) => '  - ' + t),
      '', 'Note: estimates are heuristic. The password never leaves this page.'].join('\n');
  },
});

// ---------- secrets / PII ----------
const PLACEHOLDER = /^(?:changeme|change_me|your[_-].*|<.*>|x{3,}|\*+|todo|example.*|\$\{.*\}|\$\(.*\)|replace.*|null|none|undefined|true|false|\.\.\.)$/i;
const SECRET_RULES = [
  ['AWS Access Key ID', /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA)[A-Z0-9]{16}\b/],
  ['AWS Secret Access Key', /aws_?secret_?(?:access_?)?key["']?\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/i],
  ['GCP API Key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['GCP Service Account JSON', /"type"\s*:\s*"service_account"/],
  ['Google OAuth Client Secret', /\bGOCSPX-[A-Za-z0-9_-]{28}\b/],
  ['GitHub Token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['GitHub Fine-grained PAT', /\bgithub_pat_[A-Za-z0-9_]{50,}\b/],
  ['Slack Token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['Slack Webhook', /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/],
  ['Stripe Key', /\b[spr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/],
  ['Stripe Webhook Secret', /\bwhsec_[A-Za-z0-9]{20,}\b/],
  ['SendGrid Key', /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/],
  ['npm Token', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['LLM API Key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/],
  ['Private Key', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----|$)/],
  ['Credentials in URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:([^\s:@/]+)@[^\s/]+/i],
  ['Bearer Token', /\bBearer\s+([A-Za-z0-9._~+/=-]{20,})/],
  ['Generic Secret Assignment', /\b[\w.-]*(?:secret|passw(?:or)?d|pwd|token|api[_-]?key|apikey|auth|private[_-]?key)[\w.-]*["']?\s*[:=]\s*["']?([^\s"',;]{8,})/i, (v) => !PLACEHOLDER.test(v) && !/^[[{(<]/.test(v)],
];
const HIGH_ENTROPY = ['High-entropy token', /[A-Za-z0-9+/_-]{24,}/, (v) => /\d/.test(v) && /[A-Za-z]/.test(v) && !/^[a-z]+$/i.test(v) && !/^[\w-]+(?:-[\w-]+){3,}$/.test(v) && entropyOf(v) >= (/^[0-9a-f]+$/i.test(v) ? 3.0 : 4.0)];
const findSecrets = (t, ent = true) => findSpans(t, ent ? [...SECRET_RULES, HIGH_ENTROPY] : SECRET_RULES);
const lc = (t, i) => { const pre = t.slice(0, i); return [pre.split('\n').length, i - pre.lastIndexOf('\n')]; };
const SAMPLE_SECRETS = [
  '# deploy.sh', 'export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE', 'aws_secret_access_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"',
  'GITHUB_TOKEN=ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8', 'SLACK=xoxb-' + '123456789012-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx',
  'stripe: sk_' + 'live_' + '4eC39HqLyjWDarjtT1zdp7dc', 'maps key: AIza' + 'SyA-1234567890abcdefghijklmnopqrstu',
  'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  'DATABASE_URL=postgres://admin:s3cr3tP4ss@db.internal:5432/app', 'password = "hunter2hunter2"', 'session=9f8e7d6c5b4a39281706f5e4d3c2b1a0',
  '-----BEGIN RSA PRIVATE KEY-----', 'EXAMPLE-KEY-BODY-NOT-A-REAL-KEY', '-----END RSA PRIVATE KEY-----'].join('\n');
tools.push({
  id: 'secret-detector-redactor', cat: SEC, title: 'Secret Detector & Redactor', desc: 'Find AWS/GCP/GitHub/Slack/Stripe keys, JWTs, private keys, credentials in URLs and high-entropy tokens. Report plus redacted output.',
  labels: ['Text, code or logs'], sample: SAMPLE_SECRETS,
  opts: [{ id: 'entropy', label: 'Also flag generic high-entropy tokens', type: 'checkbox', def: true }, { id: 'style', label: 'Redaction style', type: 'select', choices: ['label', 'mask', 'pseudonym'], def: 'label' }, { id: 'keep', label: 'Keep last N chars', type: 'number', def: 0 }, { id: 'show', label: 'Output', type: 'select', choices: ['report + redacted', 'report only', 'redacted only'], def: 'report + redacted' }],
  run: ([t], o) => {
    const sp = findSecrets(t, o.entropy), red = applySpans(t, sp, o.style, o.keep | 0);
    const by = {}; sp.forEach((s) => { by[s.type] = (by[s.type] || 0) + 1; });
    const rep = [`Found ${sp.length} potential secret(s)`, ...Object.entries(by).map(([k, v]) => `  ${v} x ${k}`), '', ...sp.map((s) => { const [l, c] = lc(t, s.start); const v = s.val.replace(/\s+/g, ' '); return `line ${l}:${c}  ${s.type}  ${v.slice(0, 4)}${'*'.repeat(Math.min(8, Math.max(0, v.length - 4)))} (${s.val.length} chars)`; })].join('\n');
    return o.show === 'redacted only' ? red : o.show === 'report only' ? rep : rep + '\n\n---------- redacted ----------\n' + red;
  },
});

const PII_RULES = [
  ['Email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ['URL token', /[?&](?:token|access_token|id_token|refresh_token|api_?key|apikey|key|secret|sig|signature|password|pwd|auth|session|sid|code)=([^\s"'<>&#]+)/i],
  ['Credit card', /\b\d(?:[ -]?\d){12,18}\b/, (v) => { const d = v.replace(/\D/g, ''); return d.length >= 13 && d.length <= 19 && luhn(d); }],
  ['IBAN', /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/, ibanOk],
  ['SSN', /\b\d{3}-\d{2}-\d{4}\b/, (v) => !/^(000|666|9)/.test(v) && v.slice(4, 6) !== '00'],
  ['Belgian national number', /\b\d{2}\.\d{2}\.\d{2}-\d{3}\.\d{2}\b/],
  ['IPv4', /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/],
  ['MAC address', /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/],
  ['IPv6', /(?<![\w:])(?:[A-Fa-f0-9]{0,4}:){2,7}[A-Fa-f0-9]{0,4}(?![\w:])/, (v) => v.length > 2 && (v.includes('::') || v.split(':').length === 8)],
  ['Phone', /(?<![\w.-])\+?\(?\d[\d\s().-]{6,}\d(?![\w-])/, (v) => { const d = v.replace(/\D/g, ''); return d.length >= 8 && d.length <= 15 && (/^\+/.test(v) || /[\s().-]/.test(v) || d.length >= 10) && !/^\d{4}-\d\d-\d\d/.test(v); }],
];
const PII_SAMPLE = 'Contact jane.doe@example.com or +32 475 12 34 56 (office: (555) 123-4567).\nServer 192.168.10.25 and 2001:db8:85a3::8a2e:370:7334 saw card 4111 1111 1111 1111.\nIBAN BE68 5390 0754 7034, SSN 078-05-1120, NN 85.07.30-033.28.\nCallback: https://app.example.com/cb?token=abc123def456&user=42\nMAC 00:1A:2B:3C:4D:5E logged in at 12:30:45.';
tools.push({
  id: 'pii-redactor', cat: SEC, title: 'PII Redactor', desc: 'Redact emails, phones, IPv4/IPv6, MAC, credit cards (Luhn), IBAN (mod-97), SSN / Belgian NN, and tokens in URLs.',
  labels: ['Text'], sample: PII_SAMPLE,
  opts: [{ id: 'style', label: 'Style', type: 'select', choices: ['label', 'mask', 'pseudonym'], def: 'label' }, { id: 'keep', label: 'Keep last N chars', type: 'number', def: 0 }, { id: 'skip', label: 'Skip types (comma separated, e.g. IPv4,Phone)', type: 'text', def: '' }, { id: 'summary', label: 'Prepend summary', type: 'checkbox', def: true }],
  run: ([t], o) => {
    const skip = new Set(o.skip.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
    const sp = findSpans(t, PII_RULES.filter((r) => !skip.has(r[0].toLowerCase()))), by = {};
    sp.forEach((s) => { by[s.type] = (by[s.type] || 0) + 1; });
    const out = applySpans(t, sp, o.style, o.keep | 0);
    return o.summary ? `# ${sp.length} item(s) redacted: ${Object.entries(by).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}\n${out}` : out;
  },
});

const LOGNORM = [[/\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:[.,]\d+)?(?:Z|[+-]\d\d:?\d\d)?/g, '<TS>'], [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<UUID>'], [/\b0x[0-9a-f]+\b|\b[0-9a-f]{12,}\b/gi, '<HEX>'], [/\b\d+(?:\.\d+)?\b/g, '<N>']];
const LOGSAMPLE = [
  '2024-05-01T10:00:01Z INFO user=alice@example.com logged in from 203.0.113.7 session=3f2b8c1a-1111-4222-8333-944455556666',
  '2024-05-01T10:00:05Z INFO user=bob@example.com logged in from 198.51.100.23 session=7a7a7a7a-1111-4222-8333-944455556666',
  '2024-05-01T10:01:10Z ERROR payment failed for card 4111 1111 1111 1111 order=1001 (timeout after 3000ms)',
  '2024-05-01T10:01:42Z ERROR payment failed for card 5500 0000 0000 0004 order=1002 (timeout after 3010ms)',
  '2024-05-01T10:02:00Z WARN slow query 1520ms GET /api/users?token=abcd1234efgh5678 by 10.0.0.5',
  '2024-05-01T10:02:30Z ERROR payment failed for card 4012 8888 8888 1881 order=1003 (timeout after 2995ms)',
  '2024-05-01T10:03:00Z DEBUG heartbeat ok', '2024-05-01T10:04:00Z DEBUG heartbeat ok',
].join('\n');
tools.push({
  id: 'log-privacy-workbench', cat: SEC, title: 'Log Privacy Workbench', desc: 'Redact PII and secrets from logs, then group similar lines (timestamps, ids and numbers normalised) with counts and levels.',
  labels: ['Log lines'], sample: LOGSAMPLE,
  opts: [{ id: 'style', label: 'Redaction style', type: 'select', choices: ['label', 'mask', 'pseudonym'], def: 'label' }, { id: 'view', label: 'View', type: 'select', choices: ['both', 'grouped', 'redacted'], def: 'both' }, { id: 'secrets', label: 'Include secret detection', type: 'checkbox', def: true }],
  run: ([t], o) => {
    const rules = [...(o.secrets ? SECRET_RULES : []), ...PII_RULES], red = lines(t).map((l) => applySpans(l, findSpans(l, rules), o.style));
    const groups = new Map();
    red.forEach((l, i) => {
      if (!l.trim()) return;
      let tpl = l; for (const [re, rep] of LOGNORM) tpl = tpl.replace(re, rep);
      const lvl = (l.match(/\b(TRACE|DEBUG|INFO|NOTICE|WARN(?:ING)?|ERROR|ERR|CRIT(?:ICAL)?|FATAL)\b/i) || [, '-'])[1].toUpperCase();
      const g = groups.get(tpl) || { n: 0, first: i + 1, lvl, ex: l }; g.n++; groups.set(tpl, g);
    });
    const grouped = [`${groups.size} distinct pattern(s) across ${red.filter((l) => l.trim()).length} line(s)`, '', ...[...groups].sort((a, b) => b[1].n - a[1].n).map(([tpl, g]) => `${String(g.n).padStart(5)} x [${g.lvl}] first at line ${g.first}\n        ${tpl.slice(0, 220)}`)].join('\n');
    return o.view === 'redacted' ? red.join('\n') : o.view === 'grouped' ? grouped : grouped + '\n\n---------- redacted log ----------\n' + red.join('\n');
  },
});

const TRACK_PARAMS = /^(?:utm_[a-z_]+|fbclid|gclid|gclsrc|dclid|gbraid|wbraid|msclkid|mc_eid|mc_cid|_hsenc|_hsmi|hsa_[a-z]+|__hs[a-z]+|igshid|igsh|yclid|ysclid|twclid|ttclid|li_fat_id|vero_id|vero_conv|mkt_tok|_ga|_gl|s_cid|oly_enc_id|oly_anon_id|pk_[a-z]+|mtm_[a-z]+|matomo_[a-z]+|cmpid|spm|scid|ref_src|ref_url|ncid|sr_share|trk|trkid|trkcampaign|rb_clickid|epik|irclickid|ito|s_kwcid|ef_id|_openstat|fb_action_ids|fb_action_types|fb_source|fb_ref|share_id|cvid|elqtrack|elqTrackId|mibextid|wickedid|pf_rd_[a-z]+|pd_rd_[a-z]+|ascsubtag|aff_[a-z]+|affiliate_id)$/i;
tools.push({
  id: 'url-tracker-stripper', cat: SEC, title: 'URL Tracker Stripper', desc: 'Remove utm_*, fbclid, gclid, msclkid, mc_eid and 60+ other tracking parameters from a list of URLs (or URLs inside text).',
  labels: ['URLs or text'], sample: 'https://example.com/post?id=7&utm_source=newsletter&utm_medium=email&utm_campaign=may\nhttps://shop.example.org/item/3?color=red&fbclid=IwAR0abc&gclid=Cj0KCQ&ref=home#reviews\nLink: https://news.example.net/a?mc_eid=ab12&mc_cid=cd34&_hsenc=p2ANq here.\nplain text stays',
  opts: [{ id: 'extra', label: 'Extra params to strip (comma separated)', type: 'text', def: '' }, { id: 'keep', label: 'Params to keep (comma separated)', type: 'text', def: '' }, { id: 'report', label: 'Append summary', type: 'checkbox', def: true }],
  run: ([t], o) => {
    const extra = new Set(o.extra.toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)), keep = new Set(o.keep.toLowerCase().split(',').map((s) => s.trim()).filter(Boolean));
    let removed = 0, urls = 0; const names = {};
    const out = t.replace(/https?:\/\/[^\s<>"')\]]+/gi, (u) => {
      let url; try { url = new URL(u); } catch { return u; }
      urls++;
      for (const k of [...url.searchParams.keys()]) { const kl = k.toLowerCase(); if (!keep.has(kl) && (TRACK_PARAMS.test(k) || extra.has(kl))) { url.searchParams.delete(k); removed++; names[kl] = (names[kl] || 0) + 1; } }
      return url.toString();
    });
    return o.report ? `${out}\n\n# ${urls} URL(s), ${removed} tracking parameter(s) removed${removed ? ': ' + Object.entries(names).map(([k, v]) => `${k} x${v}`).join(', ') : ''}` : out;
  },
});

// ---------- AES ----------
async function aesKey(pw, salt, it) {
  const km = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: it, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const ITER = 600000;
tools.push({
  id: 'aes-encrypt', cat: SEC, title: 'AES-GCM Encrypt', desc: 'Encrypt text with a password: PBKDF2-SHA256 (600k iterations) + AES-256-GCM via WebCrypto. Output is base64: version | iterations | salt | iv | ciphertext.',
  labels: ['Plaintext'], sample: 'Meet at the old bridge at 21:00. Bring the documents.',
  opts: [{ id: 'password', label: 'Password', type: 'password', def: 'correct horse battery staple' }],
  run: async ([t], o) => {
    if (!o.password) throw new Error('Enter a password in the options');
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), hd = new Uint8Array(5);
    hd[0] = 1; new DataView(hd.buffer).setUint32(1, ITER);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: hd }, await aesKey(o.password, salt, ITER), enc.encode(t)));
    const all = new Uint8Array(33 + ct.length); all.set(hd); all.set(salt, 5); all.set(iv, 21); all.set(ct, 33);
    return b64(all);
  },
});
tools.push({
  id: 'aes-decrypt', cat: SEC, title: 'AES-GCM Decrypt', desc: 'Decrypt output from the AES-GCM Encrypt tool with the same password. Authentication failure means wrong password or tampered data.',
  labels: ['Base64 ciphertext'], sample: 'AQAJJ8DGO1UTXnjmjY/vx2YvSeuDclYYQnl1fS6Jn/QL0dWtQrYk6i4XaeFhId7ABMfib05KyriRAFX8m2fmk1H7/MR8zmvfM2vFhMTL0glUXP8BAPhfcMfMR8GTjra+yxVacxKc',
  opts: [{ id: 'password', label: 'Password', type: 'password', def: 'correct horse battery staple' }],
  run: async ([t], o) => {
    let all; try { all = Uint8Array.from(atob(t.replace(/\s+/g, '')), (c) => c.charCodeAt(0)); } catch { throw new Error('Input is not valid base64'); }
    if (all.length < 50 || all[0] !== 1) throw new Error('Unrecognised format (expected output of AES-GCM Encrypt)');
    const it = new DataView(all.buffer).getUint32(1); if (it < 1000 || it > 5e6) throw new Error('Unreasonable iteration count');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.subarray(21, 33), additionalData: all.subarray(0, 5) }, await aesKey(o.password, all.subarray(5, 21), it), all.subarray(33))); }
    catch { throw new Error('Decryption failed: wrong password or corrupted data'); }
  },
});

// ---------- TOTP ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32dec(s) {
  s = s.toUpperCase().replace(/[\s=-]/g, ''); if (!s || /[^A-Z2-7]/.test(s)) throw new Error('Invalid base32 secret (use A-Z and 2-7)');
  let bits = 0, v = 0; const out = [];
  for (const c of s) { v = ((v << 5) | B32.indexOf(c)) & 0xffff; bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}
async function totp(secretB32, t = Date.now(), digits = 6, period = 30, algo = 'SHA-1') {
  const key = await crypto.subtle.importKey('raw', b32dec(secretB32), { name: 'HMAC', hash: algo }, false, ['sign']);
  const ctr = Math.floor(t / 1000 / period), buf = new DataView(new ArrayBuffer(8));
  buf.setUint32(0, Math.floor(ctr / 2 ** 32)); buf.setUint32(4, ctr >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf.buffer)), o = h[h.length - 1] & 15;
  const bin = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}
tools.push({
  id: 'totp-generator', cat: SEC, title: 'TOTP Generator (RFC 6238)', desc: 'Generate time-based one-time codes from a base32 secret or otpauth:// URI, with a live countdown. Computed locally with WebCrypto.',
  custom: true, dom: true, _totp: totp,
  render(root) {
    const sec = el('input', { type: 'text', placeholder: 'Base32 secret or otpauth:// URI', value: 'JBSWY3DPEHPK3PXP', style: 'width:100%', spellcheck: false, autocomplete: 'off' });
    const dg = el('select', {}, ...[6, 7, 8].map((n) => el('option', { value: n }, n)));
    const pr = el('input', { type: 'number', value: 30, min: 1, style: 'width:5em' });
    const al = el('select', {}, ...['SHA-1', 'SHA-256', 'SHA-512'].map((n) => el('option', { value: n }, n)));
    const code = el('div', { style: 'font:700 2.6rem ui-monospace,monospace;letter-spacing:.1em;margin:.5em 0' }, '------');
    const bar = el('div', { style: 'height:6px;background:#8884;border-radius:3px;overflow:hidden;max-width:24rem' }, el('div', { style: 'height:100%;background:#4a8;width:100%' }));
    const msg = el('p', { className: 'desc' });
    const next = el('div', { style: 'font:1rem ui-monospace,monospace;opacity:.7' });
    async function tick() {
      let s = sec.value.trim();
      try {
        if (/^otpauth:\/\//i.test(s)) {
          const u = new URL(s), q = u.searchParams; s = q.get('secret') || '';
          if (q.get('digits')) dg.value = q.get('digits');
          if (q.get('period')) pr.value = q.get('period');
          if (q.get('algorithm')) al.value = 'SHA-' + q.get('algorithm').replace(/\D/g, '');
          sec.value = s;
        }
        const p = Math.max(1, +pr.value || 30), now = Date.now(), c = await totp(s, now, +dg.value, p, al.value), n = await totp(s, now + p * 1000, +dg.value, p, al.value), left = p - ((now / 1000) % p);
        code.textContent = c.length === 6 ? c.slice(0, 3) + ' ' + c.slice(3) : c; next.textContent = 'next: ' + n;
        bar.firstChild.style.width = (left / p * 100) + '%'; bar.firstChild.style.background = left < 5 ? '#c44' : '#4a8';
        msg.textContent = `Expires in ${Math.ceil(left)} s. Secret stays in this page.`;
      } catch (e) { code.textContent = '------'; msg.textContent = e.message; }
    }
    const iv = setInterval(() => { if (!root.isConnected) clearInterval(iv); else tick(); }, 250);
    const rndBtn = el('button', { onclick: () => { sec.value = Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => B32[b & 31]).join(''); tick(); } }, 'Generate random secret');
    root.append(el('label', {}, 'Secret'), sec, el('div', { className: 'opts' }, el('label', {}, 'Digits ', dg), el('label', {}, 'Period (s) ', pr), el('label', {}, 'Algorithm ', al)), el('div', { className: 'row' }, rndBtn), code, bar, msg, next);
    tick();
  },
});

tools.push({
  id: 'random-secret-generator', cat: SEC, title: 'Random Secret / Token Generator', desc: 'Hex, base64, base64url, UUID v4, alphanumeric or numeric tokens from crypto.getRandomValues.',
  inputs: 0, sample: '',
  opts: [{ id: 'format', label: 'Format', type: 'select', choices: ['hex', 'base64', 'base64url', 'uuid', 'alphanumeric', 'numeric'], def: 'hex' }, { id: 'length', label: 'Length (bytes for hex/base64, characters for alphanumeric/numeric)', type: 'number', def: 32 }, { id: 'count', label: 'How many', type: 'number', def: 5 }, { id: 'info', label: 'Show entropy', type: 'checkbox', def: true }],
  run: (_i, o) => {
    const len = Math.floor(o.length), n = Math.min(Math.max(1, o.count | 0), 500); if (!(len >= 1 && len <= 4096)) throw new Error('Length must be 1-4096');
    const AN = CLS.lower + CLS.upper + CLS.digits; let bits = 0;
    const one = () => {
      switch (o.format) {
        case 'uuid': { const u = crypto.getRandomValues(new Uint8Array(16)); u[6] = (u[6] & 15) | 64; u[8] = (u[8] & 63) | 128; bits = 122; const h = hex(u); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; }
        case 'base64': bits = len * 8; return b64(crypto.getRandomValues(new Uint8Array(len)));
        case 'base64url': bits = len * 8; return b64u(crypto.getRandomValues(new Uint8Array(len)));
        case 'alphanumeric': bits = len * Math.log2(62); return Array.from({ length: len }, () => pick(AN)).join('');
        case 'numeric': bits = len * Math.log2(10); return Array.from({ length: len }, () => pick(CLS.digits)).join('');
        default: bits = len * 8; return hex(crypto.getRandomValues(new Uint8Array(len)));
      }
    };
    const r = Array.from({ length: n }, one);
    return r.join('\n') + (o.info ? `\n\n# ${bits.toFixed(0)} bits of entropy each` : '');
  },
});

// ---------- .env ----------
function parseEnv(text) {
  return lines(text).map((raw, i) => {
    const t = raw.trim(), line = i + 1;
    if (!t) return { kind: 'blank', raw, line };
    if (t[0] === '#') return { kind: 'comment', raw, line };
    const m = raw.match(/^\s*(export\s+)?([^=\s]+)(\s*)=(\s*)(.*)$/);
    if (!m) return { kind: 'invalid', raw, line };
    let v = m[5].trim(), quote = '', comment = false;
    if (v[0] === '"' || v[0] === "'") {
      const q = v[0], end = v.lastIndexOf(q);
      if (end > 0) { quote = q; comment = /\S/.test(v.slice(end + 1)); v = v.slice(1, end); if (q === '"') v = v.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\'); }
      else quote = '?';
    } else { const c = v.search(/\s#/); if (c >= 0) { comment = true; v = v.slice(0, c).trim(); } }
    return { kind: 'kv', raw, line, key: m[2], value: v, quote, comment, exported: !!m[1], spaced: !!(m[3] || m[4]) };
  });
}
const SECRET_KEY = /(SECRET|PASSW|PWD|TOKEN|API_?KEY|PRIVATE|CREDENTIAL|AUTH|SALT|ACCESS_?KEY|SIGNING|ENCRYPTION|DSN|CONN(ECTION)?_?STR)/i;
const WEAK = /^(password|passw0rd|123456\d*|admin|secret|test|root|changeme|letmein|qwerty|default|pass|1234|postgres|mysql)\d{0,3}$/i;
const ENV_A = '# app config\nNODE_ENV=development\nDEBUG=true\nPORT=3000\nDATABASE_URL=postgres://admin:s3cr3t@localhost:5432/app\nAPI_KEY=sk_' + 'live_' + '4eC39HqLyjWDarjtT1zdp7dc\nJWT_SECRET=changeme\nADMIN_PASSWORD=admin\nSTRIPE_WEBHOOK_SECRET=\nWELCOME_MSG=Hello world # greeting\nPORT=8080\napp name = My App\nGITHUB_TOKEN=ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8\nSESSION_SECRET=8f14e45fceea167a5a36dedd4bea2543\nSMTP_HOST=mail.example.com\nthis line is broken';
const ENV_B = '# app config\nNODE_ENV=production\nPORT=8080\nDATABASE_URL=postgres://app:Zq9!xT2@db.prod:5432/app\nAPI_KEY=sk_' + 'live_' + '4eC39HqLyjWDarjtT1zdp7dc\nREDIS_URL=redis://cache:6379\nSMTP_HOST=mail.example.com';
tools.push({
  id: 'env-linter', cat: SEC, title: '.env Linter', desc: 'Find plain-text secrets, duplicates, missing quotes, weak/default values, invalid lines and risky settings in a .env file. Nothing is uploaded.',
  labels: ['.env contents'], sample: ENV_A,
  run: ([t]) => {
    const rows = parseEnv(t), out = [], seen = new Map(), add = (sev, line, msg) => out.push({ sev, line, msg });
    for (const r of rows) {
      if (r.kind === 'invalid') { add('error', r.line, 'Not a KEY=VALUE line'); continue; }
      if (r.kind !== 'kv') continue;
      const { key, value: v } = r;
      if (seen.has(key)) add('error', r.line, `Duplicate key ${key} (first on line ${seen.get(key)}; last one wins in most loaders)`); else seen.set(key, r.line);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) add('error', r.line, `Invalid variable name "${key}" (use letters, digits, underscore)`);
      else if (key !== key.toUpperCase()) add('info', r.line, `${key}: convention is UPPER_SNAKE_CASE`);
      if (r.spaced) add('warn', r.line, `${key}: spaces around "=" break many parsers (docker, systemd, shell)`);
      if (r.quote === '?') add('error', r.line, `${key}: unterminated quote`);
      if (!r.quote && /[\s#$`'"\;&|<>()*?!{}]/.test(v)) add('warn', r.line, `${key}: value contains spaces or special characters; wrap it in quotes`);
      if (r.comment && !r.quote) add('info', r.line, `${key}: inline comment is stripped by some loaders but kept as value by others`);
      const secretKey = SECRET_KEY.test(key), hit = findSecrets(v, true)[0];
      if (secretKey && v === '') add('info', r.line, `${key}: secret-looking key is empty`);
      if (secretKey && v && !PLACEHOLDER.test(v)) add('error', r.line, `${key}: plain-text secret in file. Do not commit it; use a secret manager or CI secrets and keep only .env.example in git`);
      else if (hit && !PLACEHOLDER.test(v)) add('error', r.line, `${key}: value matches the ${hit.type} pattern`);
      if (v && WEAK.test(v)) add('error', r.line, `${key}: weak or default value "${v}"`);
      if (/:\/\/[^/\s:@]+:[^/\s@]+@/.test(v)) add('warn', r.line, `${key}: credentials embedded in URL`);
      if (/^(DEBUG|APP_DEBUG|FLASK_DEBUG)$/i.test(key) && /^(true|1|on|yes)$/i.test(v)) add('warn', r.line, `${key}: debug mode on; make sure this is not production`);
      if (/^(NODE_ENV|APP_ENV|ENVIRONMENT)$/i.test(key) && /^(dev|development)$/i.test(v)) add('info', r.line, `${key}=${v}: development settings`);
      if (/(HOST|URL|URI|ENDPOINT)/i.test(key) && /^https?:\/\/(localhost|127\.|0\.0\.0\.0)/.test(v)) add('info', r.line, `${key}: points at localhost`);
      if (/^(HOST|BIND|LISTEN)/i.test(key) && v === '0.0.0.0') add('info', r.line, `${key}: binds all interfaces`);
      if (/[ \t]+$/.test(r.raw)) add('info', r.line, 'Trailing whitespace');
    }
    const rank = { error: 0, warn: 1, info: 2 }, n = (s) => out.filter((x) => x.sev === s).length;
    return `${rows.filter((r) => r.kind === 'kv').length} variables, ${n('error')} error(s), ${n('warn')} warning(s), ${n('info')} note(s)\n\n` + (out.length ? out.sort((a, b) => rank[a.sev] - rank[b.sev] || a.line - b.line).map((x) => `${x.sev.toUpperCase().padEnd(5)} line ${String(x.line).padEnd(3)} ${x.msg}`).join('\n') : 'No issues found.') + '\n\nAlso check: is .env in .gitignore? Run `git log -p -S<key>` to make sure a secret was never committed.';
  },
});

const envQuote = (v) => (v === '' || !/[\s#"'$`\\]/.test(v) ? v : '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"');
tools.push({
  id: 'env-toolkit', cat: SEC, title: '.env Toolkit', desc: 'Diff two .env files (values masked), convert .env <-> JSON, or generate a safe .env.example.',
  inputs: 2, labels: ['.env (A) / JSON / source', '.env (B), diff mode only'], sample: ENV_A.split('\n').slice(0, 12).join('\n'), sample2: ENV_B,
  opts: [{ id: 'mode', label: 'Mode', type: 'select', choices: ['diff A vs B', '.env to JSON', 'JSON to .env', 'generate .env.example'], def: 'diff A vs B' }, { id: 'values', label: 'Show values in diff', type: 'checkbox', def: false }, { id: 'keepSafe', label: '.env.example: keep non-secret values', type: 'checkbox', def: true }],
  run: ([a, b], o) => {
    const kv = (t) => new Map(parseEnv(t).filter((r) => r.kind === 'kv').map((r) => [r.key, r.value]));
    if (o.mode === '.env to JSON') return JSON.stringify(Object.fromEntries(kv(a)), null, 2);
    if (o.mode === 'JSON to .env') {
      let j; try { j = JSON.parse(a); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
      const out = [], walk = (x, p) => { if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) walk(v, p ? p + '_' + k : k); else out.push(`${p.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}=${envQuote(x == null ? '' : String(x))}`); };
      if (!j || typeof j !== 'object') throw new Error('JSON must be an object'); walk(j, ''); return out.join('\n');
    }
    if (o.mode === 'generate .env.example') {
      return parseEnv(a).map((r) => {
        if (r.kind !== 'kv') return r.kind === 'invalid' ? null : r.raw;
        const secret = SECRET_KEY.test(r.key) || findSecrets(r.value, true).length || /:\/\/[^/\s:@]+:[^/\s@]+@/.test(r.value);
        return `${r.key}=${secret ? (/URL|URI|DSN/i.test(r.key) ? '' : `your_${r.key.toLowerCase()}_here`) : o.keepSafe ? envQuote(r.value) : ''}`;
      }).filter((x) => x != null).join('\n');
    }
    const A = kv(a), B = kv(b), only = (X, Y) => [...X.keys()].filter((k) => !Y.has(k)), same = [...A.keys()].filter((k) => B.has(k) && A.get(k) === B.get(k)), diff = [...A.keys()].filter((k) => B.has(k) && A.get(k) !== B.get(k));
    const sh = (v) => (o.values ? JSON.stringify(v) : `<${v.length} chars>`);
    return [`A: ${A.size} keys   B: ${B.size} keys   identical: ${same.length}   different: ${diff.length}`, '', `Only in A (${only(A, B).length}):`, ...only(A, B).map((k) => '  - ' + k), '', `Only in B (${only(B, A).length}):`, ...only(B, A).map((k) => '  + ' + k), '', `Different values (${diff.length}):`, ...diff.map((k) => `  ~ ${k}: ${sh(A.get(k))} -> ${sh(B.get(k))}`)].join('\n');
  },
});

// ---------- browser fingerprint / info ----------
const kvTable = (rows, cols = ['Attribute', 'Value']) => el('table', { style: 'border-collapse:collapse;width:100%;font-size:.9rem' },
  el('tr', {}, ...cols.map((c) => el('th', { style: 'text-align:left;padding:4px 8px;border-bottom:1px solid #8886' }, c))),
  ...rows.map((r) => el('tr', {}, ...r.map((c, i) => el('td', { style: 'padding:3px 8px;border-bottom:1px solid #8883;vertical-align:top;word-break:break-all' + (i === 0 ? ';white-space:nowrap' : '') }, String(c))))));
const FONTS = ['Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia', 'Impact', 'Lucida Console', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Helvetica', 'Helvetica Neue', 'Menlo', 'Monaco', 'Optima', 'Palatino', 'Gill Sans', 'Futura', 'Avenir', 'San Francisco', 'Ubuntu', 'DejaVu Sans', 'Liberation Sans', 'Noto Sans', 'Cantarell', 'Roboto', 'Droid Sans', 'Open Sans', 'Fira Code', 'Source Code Pro', 'Microsoft YaHei', 'MS Gothic', 'Meiryo', 'Apple Color Emoji', 'Segoe UI Emoji'];
async function collectFingerprint() {
  const n = navigator, s = screen, f = {}, bits = {};
  const set = (k, v, b) => { f[k] = v; if (b) bits[k] = b; };
  const off = -new Date().getTimezoneOffset() / 60;
  set('User agent', n.userAgent, 10); set('Platform', n.platform || '-', 2); set('Languages', (n.languages || [n.language]).join(', '), 5);
  set('Timezone', `${Intl.DateTimeFormat().resolvedOptions().timeZone} (UTC${off >= 0 ? '+' : ''}${off})`, 3);
  set('Screen', `${s.width}x${s.height} @${devicePixelRatio}x, avail ${s.availWidth}x${s.availHeight}, ${s.colorDepth}-bit`, 5);
  set('Window / viewport', `${innerWidth}x${innerHeight}`, 3);
  set('CPU cores', n.hardwareConcurrency ?? 'n/a', 2); set('Device memory (GB, capped)', n.deviceMemory ?? 'n/a', 1.5);
  set('Touch points', n.maxTouchPoints ?? 0, 1.5); set('Cookies enabled', n.cookieEnabled, 0.2);
  set('Do Not Track', n.doNotTrack ?? 'unset', 0.5); set('Global Privacy Control', n.globalPrivacyControl ?? 'unset', 0.3);
  set('Plugins (legacy list)', n.plugins ? n.plugins.length : 'n/a', 1); set('PDF viewer', n.pdfViewerEnabled ?? 'n/a', 0.3);
  set('Prefers dark / reduced motion', `${matchMedia('(prefers-color-scheme: dark)').matches} / ${matchMedia('(prefers-reduced-motion: reduce)').matches}`, 1);
  // canvas (drawn twice to detect randomisation / "farbling")
  const draw = () => {
    const c = document.createElement('canvas'); c.width = 280; c.height = 60; const x = c.getContext('2d');
    x.textBaseline = 'alphabetic'; x.fillStyle = '#f60'; x.fillRect(100, 1, 62, 20); x.fillStyle = '#069'; x.font = '15px Arial'; x.fillText('Cwm fjordbank glyphs vext quiz, \u{1F603}', 2, 15);
    x.fillStyle = 'rgba(102,204,0,.7)'; x.font = '18pt Times New Roman'; x.fillText('Cwm fjordbank glyphs', 4, 45);
    x.beginPath(); x.arc(220, 30, 20, 0, Math.PI * 2); x.stroke(); return c.toDataURL();
  };
  try { const a = await sha256hex(draw()), b = await sha256hex(draw()); set('Canvas hash', a.slice(0, 16) + (a !== b ? '  (changes on every read: canvas randomisation detected)' : ''), a !== b ? 0.5 : 8); } catch (e) { set('Canvas hash', 'blocked: ' + e.message); }
  try {
    const gl = document.createElement('canvas').getContext('webgl') || document.createElement('canvas').getContext('experimental-webgl');
    if (!gl) throw new Error('WebGL unavailable');
    const dbg = gl.getExtension('WEBGL_debug_renderer_info'), P = ['MAX_TEXTURE_SIZE', 'MAX_VERTEX_ATTRIBS', 'MAX_VARYING_VECTORS', 'MAX_RENDERBUFFER_SIZE', 'MAX_VIEWPORT_DIMS', 'ALIASED_LINE_WIDTH_RANGE'].map((k) => String(gl.getParameter(gl[k])));
    set('WebGL vendor / renderer', dbg ? `${gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)} / ${gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)}` : `${gl.getParameter(gl.VENDOR)} / ${gl.getParameter(gl.RENDERER)} (masked)`, 7);
    set('WebGL parameters hash', (await sha256hex(P.join('|') + gl.getSupportedExtensions().join(','))).slice(0, 16), 4);
  } catch (e) { set('WebGL', 'unavailable: ' + e.message); }
  try {
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!AC) throw new Error('no OfflineAudioContext');
    const ctx = new AC(1, 5000, 44100), osc = ctx.createOscillator(), comp = ctx.createDynamicsCompressor();
    osc.type = 'triangle'; osc.frequency.value = 10000; [['threshold', -50], ['knee', 40], ['ratio', 12], ['attack', 0], ['release', 0.25]].forEach(([k, v]) => { comp[k].value = v; });
    osc.connect(comp); comp.connect(ctx.destination); osc.start(0);
    const buf = await ctx.startRendering(), d = buf.getChannelData(0); let sum = 0; for (let i = 4500; i < 5000; i++) sum += Math.abs(d[i]);
    set('Audio hash', (await sha256hex(sum.toString())).slice(0, 16) + '  (sum ' + sum.toFixed(6) + ')', 5);
  } catch (e) { set('Audio hash', 'blocked: ' + e.message); }
  try {
    const ctx = document.createElement('canvas').getContext('2d'), T = 'mmmmmmmmmmlli wWQ@#', bases = ['monospace', 'sans-serif', 'serif'];
    const w = (font) => { ctx.font = `72px ${font}`; return ctx.measureText(T).width; };
    const bw = bases.map((b) => w(b)), found = FONTS.filter((ft) => bases.some((b, i) => w(`"${ft}",${b}`) !== bw[i]));
    set('Fonts detected (of ' + FONTS.length + ' probed)', found.length + ': ' + found.join(', '), Math.min(8, 1 + found.length / 5));
  } catch (e) { set('Fonts', 'blocked: ' + e.message); }
  set('Combined fingerprint', (await sha256hex(JSON.stringify(f))).slice(0, 32), 0);
  return { f, bits };
}
tools.push({
  id: 'browser-fingerprint', cat: BRO, title: 'Browser Fingerprint Test', desc: 'See what a tracker can read without cookies: UA, screen, canvas/WebGL/audio hashes, fonts, hardware. Computed locally, nothing is sent.',
  custom: true, dom: true,
  render(root) {
    const out = el('div'), note = el('p', { className: 'desc' }, 'Collecting...');
    const go = async () => {
      out.replaceChildren(); note.textContent = 'Collecting...';
      const { f, bits } = await collectFingerprint(), total = Object.values(bits).reduce((a, b) => a + b, 0);
      out.append(kvTable(Object.entries(f).map(([k, v]) => [k, v, bits[k] ? '~' + bits[k].toFixed(1) : '']), ['Attribute', 'Value', 'Entropy bits']));
      const rar = total > 30 ? 'likely unique among billions of browsers' : total > 20 ? 'likely unique among a few million browsers' : total > 12 ? 'shared with roughly thousands of others' : 'hard to single out';
      note.textContent = `Rough uniqueness: ~${total.toFixed(0)} bits if every attribute were independent (1 in ${Math.round(2 ** Math.min(total, 40)).toLocaleString('en')}), so this browser is ${rar}. Real attributes correlate, so treat this as an upper bound. Per-attribute bits are rough values from public fingerprinting studies (AmIUnique, EFF Panopticlick), not measurements. Nothing was sent anywhere.`;
    };
    root.append(el('div', { className: 'row' }, el('button', { onclick: go }, 'Re-run'), el('button', { onclick: () => navigator.clipboard?.writeText(out.innerText) }, 'Copy table')), note, out,
      el('p', { className: 'desc' }, 'To reduce fingerprinting: use Firefox with resistFingerprinting or Tor/Brave (they randomise or normalise canvas/audio), avoid exotic fonts and extensions, and keep the window size default.'));
    go();
  },
});

tools.push({
  id: 'webrtc-leak-test', cat: BRO, title: 'WebRTC Local IP Leak Test', desc: 'Check which local network addresses your browser exposes to any page through WebRTC. No STUN server is contacted, so nothing leaves your device.',
  custom: true, dom: true,
  render(root) {
    const out = el('div'), note = el('p', { className: 'desc' }, 'Gathering candidates...');
    const go = () => {
      out.replaceChildren(); note.textContent = 'Gathering candidates...';
      if (!('RTCPeerConnection' in window)) { note.textContent = 'WebRTC is not available in this browser, so it cannot leak addresses.'; return; }
      const found = [], pc = new RTCPeerConnection({ iceServers: [] });
      const done = () => {
        pc.close();
        const ips = found.filter((c) => c.type === 'host'), mdns = ips.filter((c) => c.addr.endsWith('.local')), raw = ips.filter((c) => !c.addr.endsWith('.local'));
        out.replaceChildren(kvTable(found.length ? found.map((c) => [c.type, c.addr, c.proto]) : [['none', 'no candidates gathered', '']], ['Type', 'Address', 'Protocol']));
        note.textContent = raw.length ? `Exposed: ${raw.length} real local address(es). Any page can read these without a permission prompt. Browsers with mDNS obfuscation (Chrome, Edge, Firefox, Safari) normally hide them; check privacy settings or an extension that limits WebRTC.` : mdns.length ? 'Protected: only randomised .local (mDNS) names were exposed, which do not reveal your real local IP.' : 'No local addresses were exposed.';
      };
      pc.createDataChannel('t');
      pc.onicecandidate = (e) => {
        if (!e.candidate) return done();
        const m = e.candidate.candidate.split(' ');
        found.push({ addr: m[4], proto: m[2], type: m[7] });
      };
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => { note.textContent = 'Could not start the test.'; });
      setTimeout(() => { if (pc.signalingState !== 'closed') done(); }, 4000);
    };
    root.append(el('div', { className: 'row' }, el('button', { onclick: go }, 'Re-run')), note, out,
      el('p', { className: 'desc' }, 'This test uses no STUN server, so it only sees local (host) addresses. Your public IP as seen by websites needs a network request and is not tested here.'));
    go();
  },
});

tools.push({
  id: 'browser-info', cat: BRO, title: 'Browser Capabilities & Privacy Info', desc: 'Features, client hints, storage quota, permission states, privacy signals (DNT / GPC) and connection info read from your own browser.',
  custom: true, dom: true,
  render(root) {
    const sec = (title, rows) => root.append(el('h2', {}, title), kvTable(rows));
    const w = window, n = navigator;
    const feats = { ServiceWorker: 'serviceWorker' in n, WebAssembly: typeof WebAssembly === 'object', WebGL: !!document.createElement('canvas').getContext('webgl'), WebGL2: !!document.createElement('canvas').getContext('webgl2'), WebGPU: 'gpu' in n, WebRTC: 'RTCPeerConnection' in w, WebSocket: 'WebSocket' in w, IndexedDB: 'indexedDB' in w, 'Web Crypto subtle': !!w.crypto?.subtle, Notifications: 'Notification' in w, Geolocation: 'geolocation' in n, 'Async Clipboard': !!n.clipboard, MediaDevices: !!n.mediaDevices, 'Web Bluetooth': 'bluetooth' in n, WebUSB: 'usb' in n, 'Web Serial': 'serial' in n, 'Web Share': 'share' in n, SharedArrayBuffer: typeof SharedArrayBuffer === 'function', OffscreenCanvas: 'OffscreenCanvas' in w, CompressionStream: 'CompressionStream' in w, structuredClone: 'structuredClone' in w, 'Intl.Segmenter': !!Intl.Segmenter, 'CSS :has()': CSS.supports('selector(:has(a))'), 'CSS container queries': CSS.supports('container-type: inline-size'), 'Cross-origin isolated': !!w.crossOriginIsolated, 'Secure context': w.isSecureContext };
    sec('Feature support', Object.entries(feats).map(([k, v]) => [k, v ? 'yes' : 'no']));
    sec('Privacy signals', [['Do Not Track', n.doNotTrack ?? 'unset'], ['Global Privacy Control', n.globalPrivacyControl ?? 'unset / unsupported'], ['Cookies enabled', n.cookieEnabled], ['Online', n.onLine], ['Languages', (n.languages || []).join(', ')], ['Time zone', Intl.DateTimeFormat().resolvedOptions().timeZone], ['Prefers dark / reduced motion', `${matchMedia('(prefers-color-scheme: dark)').matches} / ${matchMedia('(prefers-reduced-motion: reduce)').matches}`]]);
    const c = n.connection; sec('Network (Network Information API)', c ? [['Effective type', c.effectiveType], ['Downlink (Mbps)', c.downlink], ['RTT (ms)', c.rtt], ['Save-Data', c.saveData]] : [['Network Information API', 'not exposed by this browser']]);
    const hint = el('div'), stor = el('div'), perm = el('div');
    root.append(el('h2', {}, 'Client hints (navigator.userAgentData)'), hint, el('h2', {}, 'Storage'), stor, el('h2', {}, 'Permissions'), perm);
    (async () => {
      const u = n.userAgentData;
      if (u) { let hi = {}; try { hi = await u.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion', 'uaFullVersion', 'fullVersionList', 'wow64']); } catch { /* ignore */ } hint.append(kvTable([['Brands', u.brands.map((b) => `${b.brand} ${b.version}`).join(', ')], ['Mobile', u.mobile], ['Platform', u.platform], ...Object.entries(hi).filter(([k]) => !['brands', 'mobile', 'platform'].includes(k)).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v])])); }
      else hint.append(el('p', { className: 'desc' }, 'Not supported (Firefox/Safari). User-Agent Client Hints are Chromium only.'));
      try { const e = await n.storage.estimate(); stor.append(kvTable([['Quota', fmtBytes(e.quota || 0)], ['Used', fmtBytes(e.usage || 0)], ['Persistent', await n.storage.persisted()], ['localStorage', (() => { try { return localStorage.length + ' keys'; } catch { return 'blocked'; } })()], ['Note', 'a tiny quota can reveal private browsing']])); } catch { stor.append(el('p', { className: 'desc' }, 'Storage API unavailable.')); }
      const names = ['geolocation', 'notifications', 'camera', 'microphone', 'clipboard-read', 'clipboard-write', 'persistent-storage', 'midi', 'push', 'screen-wake-lock', 'accelerometer', 'gyroscope', 'magnetometer', 'background-sync', 'storage-access'], rows = [];
      for (const name of names) { try { rows.push([name, (await n.permissions.query({ name })).state]); } catch { rows.push([name, 'not queryable']); } }
      perm.append(kvTable(rows));
    })();
  },
});

// ---------- user agent parser ----------
function parseUA(ua) {
  const m = (re) => (ua.match(re) || [])[1];
  let browser = '?', ver = '';
  const B = [['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/], ['Opera', /(?:OPR|Opera)\/([\d.]+)/], ['Samsung Internet', /SamsungBrowser\/([\d.]+)/], ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/], ['Vivaldi', /Vivaldi\/([\d.]+)/], ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/], ['Safari', /Version\/([\d.]+).*Safari/]];
  if (/Trident|MSIE/.test(ua)) { browser = 'Internet Explorer'; ver = m(/(?:MSIE |rv:)([\d.]+)/) || ''; }
  else for (const [n, re] of B) { const v = m(re); if (v) { browser = n; ver = v; break; } }
  const bot = ua.match(/(Googlebot|bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|facebookexternalhit|Twitterbot|LinkedInBot|Applebot|AhrefsBot|SemrushBot|GPTBot|ClaudeBot|CCBot|PerplexityBot|curl|wget|python-requests|Go-http-client|HeadlessChrome|PhantomJS|bot|crawler|spider)/i);
  let os = '?', osv = '';
  const O = [['Windows', /Windows NT ([\d.]+)/], ['iOS', /(?:iPhone|iPad|iPod).*OS ([\d_]+)/], ['Android', /Android ([\d.]+)/], ['macOS', /Mac OS X ([\d_.]+)/], ['Chrome OS', /CrOS \S+ ([\d.]+)/], ['Linux', /Linux/]];
  for (const [n, re] of O) { const r = ua.match(re); if (r) { os = n; osv = (r[1] || '').replace(/_/g, '.'); break; } }
  if (os === 'Windows') osv = { '10.0': '10 / 11', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP' }[osv] || osv;
  if (os === 'macOS' && /^10\.15\.7$/.test(osv)) osv += ' (frozen value; real version is hidden)';
  if (browser === '?' && bot) browser = bot[1];
  const engine = /Gecko\/\d/.test(ua) && !/like Gecko/.test(ua) ? 'Gecko' : /Trident/.test(ua) ? 'Trident' : /AppleWebKit/.test(ua) ? (/Chrome|CriOS|Edg|OPR/.test(ua) && !/iPhone|iPad/.test(ua) ? 'Blink' : 'WebKit') : '?';
  const dev = /iPad|Tablet|Android(?!.*Mobile)/.test(ua) ? 'Tablet' : /Mobi|iPhone|Android/.test(ua) ? 'Mobile' : /bot|crawler|spider/i.test(ua) ? 'Bot' : 'Desktop';
  const model = m(/Android[^;]*; ([^;)]+?)(?: Build|\))/) || (/iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : '');
  const arch = /arm64|aarch64|ARM64/.test(ua) ? 'arm64' : /x86_64|x64|Win64|WOW64|amd64/i.test(ua) ? 'x86_64' : /i[3-6]86|x86/.test(ua) ? 'x86' : '';
  const notes = [];
  if (/Chrome\/\d+\.0\.0\.0/.test(ua)) notes.push('UA reduction: Chrome froze minor version to 0.0.0');
  if (/Windows NT 10\.0/.test(ua)) notes.push('Windows 10 and 11 both report "Windows NT 10.0"');
  if (bot) notes.push('Looks like a bot/automation: ' + bot[1]);
  return [`Browser : ${browser} ${ver}`, `Engine  : ${engine}`, `OS      : ${os} ${osv}`.trimEnd(), `Device  : ${dev}${model ? ' (' + model + ')' : ''}`, arch && `CPU     : ${arch}`, ...notes.map((x) => 'Note    : ' + x)].filter(Boolean).join('\n');
}
tools.push({
  id: 'user-agent-parser', cat: BRO, title: 'User-Agent Parser', desc: 'Break a User-Agent string (one per line) into browser, engine, OS, device, CPU, bot flag, with notes on UA reduction.',
  labels: ['User-Agent string(s)'], sample: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.67\nMozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36\nMozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1\nMozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0\nMozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  run: ([t]) => { const l = lines(t).map((s) => s.trim()).filter(Boolean); if (!l.length) throw new Error('Enter a User-Agent'); return l.map((u) => `${u}\n${parseUA(u)}`).join('\n\n'); },
});

// ---------- trackers ----------
const TRK = {};
const trk = (cat, ...pairs) => { for (let i = 0; i < pairs.length; i += 2) TRK[pairs[i]] = [pairs[i + 1], cat]; };
trk('Analytics', 'google-analytics.com', 'Google Analytics', 'analytics.google.com', 'Google Analytics', 'stats.g.doubleclick.net', 'Google Analytics', 'hotjar.com', 'Hotjar', 'clarity.ms', 'Microsoft Clarity', 'mixpanel.com', 'Mixpanel', 'mxpnl.com', 'Mixpanel', 'amplitude.com', 'Amplitude', 'segment.com', 'Segment', 'segment.io', 'Segment', 'heap.io', 'Heap', 'heapanalytics.com', 'Heap', 'plausible.io', 'Plausible (privacy-friendly)', 'matomo.cloud', 'Matomo', 'posthog.com', 'PostHog', 'fullstory.com', 'FullStory', 'mouseflow.com', 'Mouseflow', 'crazyegg.com', 'Crazy Egg', 'luckyorange.com', 'Lucky Orange', 'omtrdc.net', 'Adobe Analytics', 'demdex.net', 'Adobe Audience Manager', '2o7.net', 'Adobe Analytics', 'quantserve.com', 'Quantcast', 'scorecardresearch.com', 'comScore', 'chartbeat.com', 'Chartbeat', 'newrelic.com', 'New Relic', 'nr-data.net', 'New Relic', 'mc.yandex.ru', 'Yandex Metrica', 'statcounter.com', 'StatCounter', 'cloudflareinsights.com', 'Cloudflare Web Analytics', 'simpleanalytics.com', 'Simple Analytics (privacy-friendly)', 'usefathom.com', 'Fathom (privacy-friendly)');
trk('Tag manager', 'googletagmanager.com', 'Google Tag Manager', 'tealiumiq.com', 'Tealium', 'tiqcdn.com', 'Tealium', 'ensighten.com', 'Ensighten', 'adobedtm.com', 'Adobe Launch');
trk('Advertising', 'doubleclick.net', 'Google DoubleClick', 'googlesyndication.com', 'Google AdSense', 'googleadservices.com', 'Google Ads', 'adservice.google.com', 'Google Ads', 'googletagservices.com', 'Google Publisher Tag', 'adnxs.com', 'Xandr / AppNexus', 'criteo.com', 'Criteo', 'criteo.net', 'Criteo', 'taboola.com', 'Taboola', 'outbrain.com', 'Outbrain', 'adsrvr.org', 'The Trade Desk', 'rubiconproject.com', 'Magnite', 'pubmatic.com', 'PubMatic', 'openx.net', 'OpenX', 'amazon-adsystem.com', 'Amazon Ads', 'bat.bing.com', 'Microsoft Ads UET', 'ads-twitter.com', 'X/Twitter Ads', 'analytics.tiktok.com', 'TikTok Pixel', 'snap.licdn.com', 'LinkedIn Insight', 'px.ads.linkedin.com', 'LinkedIn Insight', 'sc-static.net', 'Snap Pixel', 'ct.pinterest.com', 'Pinterest Tag', 'rlcdn.com', 'LiveRamp', 'bluekai.com', 'Oracle BlueKai', 'smartadserver.com', 'Smart AdServer', 'casalemedia.com', 'Index Exchange', 'mathtag.com', 'MediaMath', 'bidswitch.net', 'BidSwitch', 'adform.net', 'Adform', 'teads.tv', 'Teads', 'hs-scripts.com', 'HubSpot', 'hs-analytics.net', 'HubSpot', 'hsforms.com', 'HubSpot', 'marketo.net', 'Marketo', 'mktoresp.com', 'Marketo', 'pardot.com', 'Pardot', 'klaviyo.com', 'Klaviyo');
trk('Social', 'facebook.net', 'Meta (Facebook SDK/Pixel)', 'facebook.com', 'Meta (Facebook)', 'instagram.com', 'Instagram', 'twitter.com', 'X/Twitter', 'linkedin.com', 'LinkedIn', 'youtube.com', 'YouTube embed', 'youtube-nocookie.com', 'YouTube (no-cookie)', 'ytimg.com', 'YouTube', 'vimeo.com', 'Vimeo', 'addthis.com', 'AddThis', 'sharethis.com', 'ShareThis', 'disqus.com', 'Disqus', 'redditstatic.com', 'Reddit', 'tiktok.com', 'TikTok', 'pinimg.com', 'Pinterest');
trk('Session replay / A-B testing', 'optimizely.com', 'Optimizely', 'vwo.com', 'VWO', 'visualwebsiteoptimizer.com', 'VWO', 'abtasty.com', 'AB Tasty', 'logrocket.com', 'LogRocket', 'smartlook.com', 'Smartlook', 'inspectlet.com', 'Inspectlet');
trk('Error monitoring', 'sentry.io', 'Sentry', 'sentry-cdn.com', 'Sentry', 'bugsnag.com', 'Bugsnag', 'rollbar.com', 'Rollbar', 'datadoghq.com', 'Datadog RUM', 'datadoghq-browser-agent.com', 'Datadog RUM');
trk('Chat / support', 'intercom.io', 'Intercom', 'intercomcdn.com', 'Intercom', 'drift.com', 'Drift', 'zendesk.com', 'Zendesk', 'zdassets.com', 'Zendesk', 'crisp.chat', 'Crisp', 'tawk.to', 'Tawk.to', 'livechatinc.com', 'LiveChat', 'freshchat.com', 'Freshchat');
trk('Consent management', 'cookiebot.com', 'Cookiebot', 'onetrust.com', 'OneTrust', 'cookielaw.org', 'OneTrust', 'trustarc.com', 'TrustArc', 'usercentrics.eu', 'Usercentrics', 'didomi.io', 'Didomi', 'iubenda.com', 'iubenda');
trk('Fonts', 'fonts.googleapis.com', 'Google Fonts (visitor IP sent to Google; self-host to avoid GDPR risk)', 'fonts.gstatic.com', 'Google Fonts', 'use.typekit.net', 'Adobe Fonts', 'fast.fonts.net', 'Fonts.com', 'use.fontawesome.com', 'Font Awesome kit');
trk('CDN / third-party libs', 'cdnjs.cloudflare.com', 'cdnjs', 'cdn.jsdelivr.net', 'jsDelivr', 'unpkg.com', 'unpkg', 'ajax.googleapis.com', 'Google Hosted Libraries', 'code.jquery.com', 'jQuery CDN', 'stackpath.bootstrapcdn.com', 'BootstrapCDN', 'maxcdn.bootstrapcdn.com', 'BootstrapCDN', 'cloudfront.net', 'Amazon CloudFront', 'akamaihd.net', 'Akamai', 'fastly.net', 'Fastly', 'azureedge.net', 'Azure CDN', 'maps.googleapis.com', 'Google Maps', 'recaptcha.net', 'reCAPTCHA', 'gstatic.com', 'Google static', 'hcaptcha.com', 'hCaptcha');
const TRK_SIGS = [[/\bgtag\s*\(/, 'Google gtag.js call', 'Analytics'], [/\bfbq\s*\(/, 'Meta Pixel (fbq)', 'Advertising'], [/_gaq\.push|\bga\s*\(\s*['"]create/, 'Google Analytics (legacy)', 'Analytics'], [/dataLayer\s*(?:=|\.push)/, 'Google Tag Manager dataLayer', 'Tag manager'], [/\bhj\s*\(|_hjSettings/, 'Hotjar', 'Analytics'], [/\bttq\.(?:load|track|page)/, 'TikTok Pixel', 'Advertising'], [/\btwq\s*\(/, 'X/Twitter pixel', 'Advertising'], [/\bsnaptr\s*\(/, 'Snap Pixel', 'Advertising'], [/_linkedin_partner_id/, 'LinkedIn Insight Tag', 'Advertising'], [/\bclarity\s*\(/, 'Microsoft Clarity', 'Analytics'], [/\b_paq\.push/, 'Matomo', 'Analytics'], [/mixpanel\.(?:init|track)/, 'Mixpanel', 'Analytics'], [/amplitude\.(?:getInstance|init)/, 'Amplitude', 'Analytics'], [/\bIntercom\s*\(/, 'Intercom', 'Chat / support'], [/\bpintrk\s*\(/, 'Pinterest Tag', 'Advertising'], [/adsbygoogle/, 'Google AdSense', 'Advertising'], [/\bposthog\.init/, 'PostHog', 'Analytics']];
function trackerFor(host) {
  host = host.toLowerCase().replace(/\.$/, '');
  for (let h = host; h.includes('.'); h = h.slice(h.indexOf('.') + 1)) if (TRK[h]) return TRK[h];
  return null;
}
const baseDomain = (h) => { const p = h.split('.'); return p.length > 2 && /^(co|com|org|net|gov|ac)$/.test(p[p.length - 2]) && p[p.length - 1].length === 2 ? p.slice(-3).join('.') : p.slice(-2).join('.'); };
const TRK_HTML = `<!doctype html><html lang="en"><head>
<link rel="canonical" href="https://www.example.com/">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-XXXX');</script>
<script>!function(f,b,e,v){fbq('init','123');fbq('track','PageView')}();</script>
<script src="https://connect.facebook.net/en_US/fbevents.js"></script>
<script src="https://static.hotjar.com/c/hotjar-1.js"></script>
<script src="https://cdn.jsdelivr.net/npm/vue@3"></script>
<script src="https://www.example.com/app.js"></script>
<script src="https://cdn.somevendor.example/lib.js"></script>
</head><body><iframe src="https://www.youtube.com/embed/abc"></iframe><img src="https://px.ads.linkedin.com/collect?pid=1" width=1 height=1></body></html>`;
function extractHosts(html) {
  const hosts = new Map();
  for (const m of html.matchAll(/(?:https?:)?\/\/((?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?(?=[/?#"'\s)>\\]|$)/gi)) { const h = m[1].toLowerCase(); if (!/^(www\.w3\.org|schema\.org|ogp\.me|purl\.org|www\.sitemaps\.org|xmlns\.com)$/.test(h)) hosts.set(h, (hosts.get(h) || 0) + 1); }
  return hosts;
}
tools.push({
  id: 'tracker-detector', cat: BRO, title: 'Tracker Detector (HTML source)', desc: 'Paste page source: find third-party trackers, analytics, ad pixels, social widgets, fonts and CDNs by domain list and inline code signatures.',
  labels: ['HTML source'], sample: TRK_HTML,
  opts: [{ id: 'first', label: 'First-party domain (optional; auto-detected from canonical / og:url)', type: 'text', def: '' }],
  run: ([t], o) => {
    const hosts = extractHosts(t);
    let fp = o.first.trim().toLowerCase();
    if (!fp) { const c = t.match(/rel=["']canonical["'][^>]*href=["']https?:\/\/([^/"']+)/i) || t.match(/href=["']https?:\/\/([^/"']+)[^>]*rel=["']canonical/i) || t.match(/og:url["'][^>]*content=["']https?:\/\/([^/"']+)/i); fp = c ? c[1].toLowerCase() : ''; }
    const fb = fp && baseDomain(fp), byCat = {}, other = [];
    for (const [h, n] of hosts) {
      if (fb && baseDomain(h) === fb) continue;
      const k = trackerFor(h); if (k) (byCat[k[1]] ||= []).push(`${h} x${n}  ${k[0]}`); else other.push(`${h} x${n}`);
    }
    const sigs = TRK_SIGS.filter(([re]) => re.test(t));
    const out = [`First party: ${fp || 'unknown (pass one in the option to filter it out)'}`, `${hosts.size} distinct external host(s); ${Object.values(byCat).flat().length} known tracker/service domain(s)`, ''];
    const order = ['Advertising', 'Analytics', 'Session replay / A-B testing', 'Social', 'Tag manager', 'Chat / support', 'Error monitoring', 'Consent management', 'Fonts', 'CDN / third-party libs'];
    for (const c of order) if (byCat[c]) out.push(`${c.toUpperCase()}`, ...byCat[c].map((x) => '  ' + x), '');
    if (sigs.length) out.push('INLINE CODE SIGNATURES', ...sigs.map(([, n, c]) => `  ${n} (${c})`), '');
    if (other.length) out.push('OTHER EXTERNAL HOSTS (unknown, review manually)', ...other.map((x) => '  ' + x), '');
    const adv = (byCat.Advertising || []).length + (byCat.Analytics || []).length + sigs.length;
    out.push(adv ? 'Privacy note: advertising/analytics trackers generally need prior consent under the ePrivacy Directive / GDPR. Google Fonts and CDNs transmit visitor IPs to third parties; consider self-hosting.' : 'No ad/analytics trackers detected in this source (scripts injected at runtime are not visible in static HTML).');
    return out.join('\n');
  },
});

// ---------- cookies ----------
function parseSetCookie(line) {
  const parts = line.replace(/^\s*set-cookie:\s*/i, '').split(';').map((s) => s.trim()), i = parts[0].indexOf('=');
  if (i < 0) return null;
  const c = { name: parts[0].slice(0, i), value: parts[0].slice(i + 1), attrs: {} };
  for (const p of parts.slice(1)) { const j = p.indexOf('='); c.attrs[(j < 0 ? p : p.slice(0, j)).toLowerCase()] = j < 0 ? true : p.slice(j + 1); }
  return c;
}
function cookieIssues(c, https = true) {
  const a = c.attrs, out = [], n = c.name, ss = typeof a.samesite === 'string' ? a.samesite.toLowerCase() : null;
  if (!a.secure && https) out.push(['high', 'Missing Secure: cookie can be sent over plain HTTP']);
  const sessionish = /sess|sid|auth|token|jwt|login|remember|user/i.test(n), csrfish = /csrf|xsrf/i.test(n);
  if (!a.httponly) out.push([sessionish && !csrfish ? 'high' : 'low', sessionish && !csrfish ? 'Missing HttpOnly on a session/auth-looking cookie: readable by any XSS' : 'Missing HttpOnly (fine only if JavaScript must read this cookie)']);
  if (!ss) out.push(['medium', 'No SameSite attribute: browsers default to Lax, but older ones allow cross-site sending. Set SameSite=Lax or Strict']);
  else if (!['lax', 'strict', 'none'].includes(ss)) out.push(['medium', `Invalid SameSite value "${a.samesite}"`]);
  if (ss === 'none' && !a.secure) out.push(['high', 'SameSite=None requires Secure; browsers reject this cookie']);
  if (ss === 'none') out.push(['info', 'SameSite=None: sent on cross-site requests (CSRF exposure, third-party tracking use). Consider Partitioned (CHIPS)']);
  if (/^__host-/i.test(n)) { if (!a.secure) out.push(['high', '__Host- prefix requires Secure']); if (a.domain) out.push(['high', '__Host- prefix forbids the Domain attribute']); if (a.path !== '/') out.push(['high', '__Host- prefix requires Path=/']); }
  else if (/^__secure-/i.test(n)) { if (!a.secure) out.push(['high', '__Secure- prefix requires Secure']); }
  else if (sessionish && !csrfish) out.push(['low', 'Consider the __Host- prefix for session cookies (locks to origin, Secure, Path=/)']);
  if (a.domain && !/^__host-/i.test(n)) out.push(['low', `Domain=${a.domain} makes the cookie available to all subdomains`]);
  const age = a['max-age'] != null ? +a['max-age'] : a.expires ? (Date.parse(a.expires) - Date.now()) / 1000 : null;
  if (age != null && age > 400 * 86400) out.push(['low', 'Lifetime over 400 days: Chrome caps it at 400 days']);
  if (age == null) out.push(['info', 'Session cookie (no Expires/Max-Age)']);
  if (c.name.length + c.value.length > 4096) out.push(['medium', 'Cookie exceeds 4096 bytes and will be dropped']);
  if (/^(_ga|_gid|_gat|_fbp|_fbc|_gcl_|__utm|_hj|_clck|_uet|ajs_|mp_|amplitude_|_pk_|_scid|_ttp|IDE|test_cookie|fr)/.test(n)) out.push(['info', 'Known analytics/advertising cookie: needs prior consent in the EU (ePrivacy / GDPR)']);
  return out;
}
const SC_SAMPLE = 'Set-Cookie: sessionid=abc123def456; Path=/; Max-Age=86400\nSet-Cookie: __Host-auth=Zm9vYmFy; Secure; HttpOnly; Path=/; SameSite=Strict\nSet-Cookie: prefs=dark; Domain=example.com; Path=/; Secure; SameSite=None\nSet-Cookie: __Secure-id=1; HttpOnly; SameSite=Lax\nSet-Cookie: _ga=GA1.2.1234567.1700000000; Path=/; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Secure; SameSite=Lax\nSet-Cookie: csrftoken=xyz; Secure; SameSite=Lax; Path=/';
tools.push({
  id: 'cookie-flag-analyzer', cat: BRO, title: 'Cookie Flag Analyzer', desc: 'Paste Set-Cookie headers: checks Secure, HttpOnly, SameSite, __Host-/__Secure- prefix rules, lifetime, scope and known tracking cookies.',
  labels: ['Set-Cookie header lines'], sample: SC_SAMPLE,
  opts: [{ id: 'https', label: 'Site is served over HTTPS', type: 'checkbox', def: true }],
  run: ([t], o) => {
    const cs = lines(t).filter((l) => l.trim()).map(parseSetCookie).filter(Boolean); if (!cs.length) throw new Error('No Set-Cookie lines found (expected name=value; attributes)');
    const rank = { high: 0, medium: 1, low: 2, info: 3 }; let hi = 0;
    const body = cs.map((c) => {
      const iss = cookieIssues(c, o.https).sort((a, b) => rank[a[0]] - rank[b[0]]); hi += iss.filter((i) => i[0] === 'high').length;
      const v = c.value.length > 8 ? c.value.slice(0, 4) + '...' : c.value;
      return `${c.name}=${v}\n  flags: ${['Secure', 'HttpOnly', 'Partitioned'].filter((f) => c.attrs[f.toLowerCase()]).join(' ') || 'none'}  SameSite=${c.attrs.samesite || '(unset)'}  Path=${c.attrs.path || '(default)'}${c.attrs.domain ? '  Domain=' + c.attrs.domain : ''}\n` + (iss.length ? iss.map(([s, m]) => `  [${s.toUpperCase()}] ${m}`).join('\n') : '  OK');
    });
    return `${cs.length} cookie(s), ${hi} high-severity issue(s)\n\n` + body.join('\n\n');
  },
});

// ---------- HAR ----------
const harE = (url, status, mime, rh = [], size = 1000, time = 100, extra = {}) => ({ startedDateTime: '2024-05-01T10:00:00Z', time, request: { method: 'GET', url, headers: [], cookies: extra.reqCookies || [] }, response: { status, headers: rh.map(([name, value]) => ({ name, value })), cookies: [], content: { size, mimeType: mime }, bodySize: size }, timings: {} });
const HAR_SAMPLE = JSON.stringify({ log: { version: '1.2', entries: [
  harE('https://www.example.com/', 200, 'text/html', [['Content-Type', 'text/html'], ['Set-Cookie', 'sid=abc123; Path=/'], ['Set-Cookie', '__Host-csrf=1; Secure; HttpOnly; Path=/; SameSite=Strict'], ['Server', 'nginx/1.18.0']], 30000, 220),
  harE('https://www.example.com/app.js', 200, 'text/html', [['Content-Type', 'text/html']], 2400000, 1800),
  harE('https://www.example.com/logo.png', 200, 'image/png', [['Content-Type', 'image/png']], 15000, 80),
  harE('https://www.google-analytics.com/g/collect?v=2', 204, 'text/plain', [['Set-Cookie', '_ga_X=1; Domain=.google-analytics.com; SameSite=None; Secure']], 0, 90, { reqCookies: [{ name: '_ga', value: '1' }] }),
  harE('https://connect.facebook.net/en_US/fbevents.js', 200, 'application/javascript', [['Content-Type', 'application/javascript']], 90000, 300),
  harE('https://fonts.googleapis.com/css2?family=Inter', 200, 'text/css', [['Content-Type', 'text/css']], 2000, 120),
  harE('http://cdn.legacy.example.net/banner.jpg', 200, 'image/jpeg', [['Content-Type', 'image/jpeg']], 500000, 1400),
  harE('https://api.partner.example.org/data.json', 200, 'application/json', [['Content-Type', 'text/plain'], ['Access-Control-Allow-Origin', '*'], ['Access-Control-Allow-Credentials', 'true']], 800, 3500),
] } }, null, 1);
const hv = (hs, n) => (hs.find((h) => h.name.toLowerCase() === n) || {}).value;
tools.push({
  id: 'har-analyzer', cat: BRO, title: 'HAR Privacy Analyzer', desc: 'Paste HAR JSON: third-party domains, trackers, cookies and Set-Cookie flags, mixed content, large/slow requests, header mismatches. Stays in your browser; HAR files contain secrets so never upload them elsewhere.',
  labels: ['HAR JSON'], sample: HAR_SAMPLE,
  opts: [{ id: 'page', label: 'First-party host (blank = first request)', type: 'text', def: '' }, { id: 'large', label: 'Large request threshold (KB)', type: 'number', def: 500 }, { id: 'slow', label: 'Slow request threshold (ms)', type: 'number', def: 1000 }],
  run: ([t], o) => {
    let j; try { j = JSON.parse(t); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
    const es = j?.log?.entries; if (!Array.isArray(es) || !es.length) throw new Error('No log.entries in HAR');
    const U = es.map((e) => { let u; try { u = new URL(e.request.url); } catch { u = null; } return { e, u }; }).filter((x) => x.u);
    if (!U.length) throw new Error('No valid request URLs in HAR');
    const pageHost = (o.page.trim() || U[0].u.hostname).toLowerCase(), pb = baseDomain(pageHost), https = U[0].u.protocol === 'https:';
    const out = [`${U.length} requests to ${new Set(U.map((x) => x.u.hostname)).size} hosts; first party: ${pageHost}${https ? ' (HTTPS)' : ' (HTTP!)'}`], doms = new Map(), cookies = [], mixed = [], bigs = [], slows = [], mism = [];
    for (const { e, u } of U) {
      const tp = baseDomain(u.hostname) !== pb, size = Math.max(e.response.content?.size || 0, e.response.bodySize || 0), hs = e.response.headers || [], mime = (e.response.content?.mimeType || hv(hs, 'content-type') || '').split(';')[0].trim().toLowerCase(), url = u.origin + u.pathname;
      if (tp) { const d = doms.get(u.hostname) || { n: 0, size: 0, cookiesSent: 0, setc: 0 }; d.n++; d.size += size; d.cookiesSent += (e.request.cookies || []).length; doms.set(u.hostname, d); }
      for (const h of hs) if (h.name.toLowerCase() === 'set-cookie') { const c = parseSetCookie(h.value); if (c) { const iss = cookieIssues(c, u.protocol === 'https:').filter((i) => ['high', 'medium'].includes(i[0])); cookies.push({ host: u.hostname, tp, c, iss }); if (tp) doms.get(u.hostname).setc++; } }
      if (https && u.protocol === 'http:') mixed.push(`${e.request.method} ${e.request.url.slice(0, 120)}`);
      if (size > (o.large || 500) * 1024) bigs.push(`${fmtBytes(size)}  ${url.slice(0, 110)}`);
      if (e.time > (o.slow || 1000)) slows.push(`${Math.round(e.time)} ms  ${url.slice(0, 110)}`);
      const ext = (u.pathname.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase(), exp = { js: 'javascript', css: 'text/css', json: 'json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg', woff2: 'font', html: 'text/html' }[ext];
      if (exp && mime && !mime.includes(exp) && e.response.status < 300) mism.push(`${url.slice(0, 80)}: .${ext} served as ${mime}`);
      if (/javascript|html/.test(mime) && !hv(hs, 'x-content-type-options') && !tp && e.response.status < 300) mism.push(`${url.slice(0, 80)}: missing X-Content-Type-Options: nosniff`);
      if (hv(hs, 'access-control-allow-origin') === '*' && /true/i.test(hv(hs, 'access-control-allow-credentials') || '')) mism.push(`${url.slice(0, 80)}: ACAO:* with Allow-Credentials:true (invalid / dangerous CORS)`);
      const srv = hv(hs, 'server') || '', xp = hv(hs, 'x-powered-by'); if (/\d+\.\d+/.test(srv) || xp) mism.push(`${u.hostname}: version disclosure (${[srv, xp].filter(Boolean).join(', ')})`);
      if (!tp && mime === 'text/html' && e === U[0].e) { for (const [h, m] of [['strict-transport-security', 'HSTS'], ['content-security-policy', 'Content-Security-Policy'], ['referrer-policy', 'Referrer-Policy'], ['x-frame-options', 'X-Frame-Options (or CSP frame-ancestors)']]) if (!hv(hs, h)) mism.push(`main document: missing ${m}`); }
    }
    out.push('', `THIRD-PARTY DOMAINS (${doms.size})`);
    for (const [h, d] of [...doms].sort((a, b) => b[1].n - a[1].n)) { const k = trackerFor(h); out.push(`  ${h}  ${d.n} req, ${fmtBytes(d.size)}${d.cookiesSent ? `, ${d.cookiesSent} cookie(s) sent` : ''}${d.setc ? `, sets ${d.setc} cookie(s)` : ''}${k ? `   <- ${k[1]}: ${k[0]}` : ''}`); }
    const trackers = [...doms.keys()].filter(trackerFor).filter((h) => !['CDN / third-party libs', 'Fonts'].includes(trackerFor(h)[1]));
    out.push('', `KNOWN TRACKERS (${trackers.length})`, ...(trackers.length ? trackers.map((h) => `  ${h}  ${trackerFor(h)[0]}`) : ['  none']));
    out.push('', `COOKIES SET (${cookies.length})`, ...(cookies.length ? cookies.map(({ host, tp, c, iss }) => `  ${tp ? '[3P] ' : ''}${c.name} @ ${host}  ${['Secure', 'HttpOnly'].filter((f) => c.attrs[f.toLowerCase()]).join('+') || 'no flags'}  SameSite=${c.attrs.samesite || '-'}${iss.length ? '\n      ! ' + iss.map((i) => i[1]).join('\n      ! ') : ''}`) : ['  none']));
    out.push('', `MIXED CONTENT (${mixed.length})`, ...(mixed.length ? mixed.map((x) => '  ' + x) : ['  none']));
    out.push('', `LARGE (> ${o.large} KB) (${bigs.length})`, ...(bigs.length ? bigs.map((x) => '  ' + x) : ['  none']));
    out.push('', `SLOW (> ${o.slow} ms) (${slows.length})`, ...(slows.length ? slows.map((x) => '  ' + x) : ['  none']));
    out.push('', `HEADER ISSUES / MISMATCHES (${mism.length})`, ...(mism.length ? [...new Set(mism)].map((x) => '  ' + x) : ['  none']));
    return out.join('\n');
  },
});

// ---------- CSP ----------
const CSP_FETCH = ['default-src', 'script-src', 'script-src-elem', 'script-src-attr', 'style-src', 'style-src-elem', 'style-src-attr', 'img-src', 'font-src', 'connect-src', 'media-src', 'object-src', 'frame-src', 'child-src', 'worker-src', 'manifest-src', 'prefetch-src'];
const CSP_ALL = new Set([...CSP_FETCH, 'base-uri', 'form-action', 'frame-ancestors', 'sandbox', 'report-uri', 'report-to', 'upgrade-insecure-requests', 'block-all-mixed-content', 'require-trusted-types-for', 'trusted-types', 'plugin-types', 'navigate-to']);
tools.push({
  id: 'csp-builder', cat: BRO, title: 'CSP Builder', desc: 'Build a Content-Security-Policy header from a preset plus extra sources. Outputs header, meta tag, nginx and Apache lines.',
  inputs: 0, sample: '',
  opts: [{ id: 'preset', label: 'Preset', type: 'select', choices: ['strict (nonce + strict-dynamic)', 'balanced (self only)', 'lockdown (default-src none)'], def: 'balanced (self only)' },
    ...['script-src', 'style-src', 'img-src', 'font-src', 'connect-src', 'frame-src', 'media-src'].map((d) => ({ id: d, label: `Extra ${d} sources`, type: 'text', def: d === 'img-src' ? 'data:' : '' })),
    { id: 'frame-ancestors', label: 'frame-ancestors', type: 'text', def: "'none'" }, { id: 'report', label: 'report-uri (optional URL)', type: 'text', def: '' },
    { id: 'upgrade', label: 'upgrade-insecure-requests', type: 'checkbox', def: true }, { id: 'ro', label: 'Report-Only mode (test first)', type: 'checkbox', def: false }],
  run: (_i, o) => {
    const p = o.preset.split(' ')[0], d = {};
    const ex = (k) => (o[k] || '').split(/[\s,]+/).filter(Boolean);
    if (p === 'strict') Object.assign(d, { 'default-src': ["'self'"], 'script-src': ["'nonce-REPLACE_PER_REQUEST'", "'strict-dynamic'", "'unsafe-inline'", 'https:'], 'object-src': ["'none'"], 'base-uri': ["'none'"], 'style-src': ["'self'"], 'img-src': ["'self'"] });
    else if (p === 'lockdown') Object.assign(d, { 'default-src': ["'none'"], 'script-src': ["'self'"], 'style-src': ["'self'"], 'img-src': ["'self'"], 'font-src': ["'self'"], 'connect-src': ["'self'"], 'base-uri': ["'none'"], 'form-action': ["'self'"] });
    else Object.assign(d, { 'default-src': ["'self'"], 'object-src': ["'none'"], 'base-uri': ["'self'"], 'form-action': ["'self'"] });
    for (const k of ['script-src', 'style-src', 'img-src', 'font-src', 'connect-src', 'frame-src', 'media-src']) { const e = ex(k); if (e.length) d[k] = [...new Set([...(d[k] || ["'self'"]), ...e])]; }
    const fa = ex('frame-ancestors'); if (fa.length) d['frame-ancestors'] = fa;
    const parts = Object.entries(d).map(([k, v]) => `${k} ${v.join(' ')}`); if (o.upgrade) parts.push('upgrade-insecure-requests'); if (o.report.trim()) parts.push('report-uri ' + o.report.trim());
    const pol = parts.join('; '), hn = o.ro ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
    const meta = parts.filter((x) => !/^(frame-ancestors|report-uri|sandbox)/.test(x)).join('; ');
    return [`${hn}: ${pol}`, '', '# <meta> equivalent (frame-ancestors, report-uri and sandbox are ignored in meta; Report-Only is not supported)', `<meta http-equiv="Content-Security-Policy" content="${esc(meta)}">`, '', '# nginx', `add_header ${hn} "${pol.replace(/"/g, '\\"')}" always;`, '', '# Apache', `Header always set ${hn} "${pol.replace(/"/g, '\\"')}"`, '',
      p === 'strict' ? 'Strict mode: generate a fresh random nonce per response and add nonce="..." to every <script>. Browsers that support nonces ignore the unsafe-inline and https: fallbacks.' : 'Tip: deploy as Report-Only first and watch violation reports before enforcing. Inline scripts/styles will be blocked unless you add nonces or hashes.'].join('\n');
  },
});

const JSONP_HOSTS = /(^|\.)(googleapis\.com|gstatic\.com|google\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|ajax\.aspnetcdn\.com|cloudfront\.net|amazonaws\.com|githubusercontent\.com|herokuapp\.com|firebaseapp\.com|appspot\.com)$/i;
tools.push({
  id: 'csp-analyzer', cat: BRO, title: 'CSP Analyzer', desc: 'Paste a Content-Security-Policy: flags unsafe-inline/eval, wildcards, data:/http: sources, JSONP-able CDN hosts, missing object-src/base-uri/frame-ancestors, typos, and gives a grade.',
  labels: ['CSP header or meta tag'], sample: "Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://www.google-analytics.com data:; style-src 'self' 'unsafe-inline'; img-src * data:; frame-src http://player.example.com; script-src-elem 'self'; scrpt-src 'none'; report-uri /csp",
  run: ([t]) => {
    let s = t.trim(); const meta = s.match(/content=["']([^"']+)["']/i); if (meta) s = meta[1]; s = s.replace(/^content-security-policy(-report-only)?\s*:\s*/i, '');
    const ro = /report-only/i.test(t.split(/[:\n]/)[0]), dirs = {}, dup = [];
    for (const part of s.split(';')) { const w = part.trim().split(/\s+/).filter(Boolean); if (!w.length) continue; const k = w[0].toLowerCase(); if (dirs[k]) dup.push(k); else dirs[k] = w.slice(1); }
    if (!Object.keys(dirs).length) throw new Error('No directives found');
    const F = []; const add = (sev, msg, fix) => F.push({ sev, msg, fix });
    const eff = (k) => dirs[k] || dirs['default-src'], sc = eff('script-src'), low = (a) => (a || []).map((x) => x.toLowerCase());
    for (const k of Object.keys(dirs)) if (!CSP_ALL.has(k)) add('medium', `Unknown directive "${k}" is ignored (typo?)`, 'Fix the directive name');
    for (const k of new Set(dup)) add('low', `Directive ${k} appears more than once; only the first is used`, 'Remove duplicates');
    if (!sc) add('high', 'No script-src and no default-src: scripts are not restricted', "Add default-src 'self' or a script-src");
    else {
      const l = low(sc), hasNonce = l.some((x) => /^'(nonce|sha(256|384|512))-/.test(x)), dyn = l.includes("'strict-dynamic'");
      if (l.includes("'unsafe-inline'")) { if (hasNonce || dyn) add('info', "'unsafe-inline' is ignored by modern browsers because a nonce/hash/strict-dynamic is present (fine as a legacy fallback)"); else add('high', "script-src allows 'unsafe-inline': any injected inline script runs, defeating CSP's XSS protection", 'Use nonces or hashes'); }
      if (l.includes("'unsafe-eval'")) add('medium', "script-src allows 'unsafe-eval' (eval, new Function)", 'Remove eval usage');
      if (l.includes('*')) add('high', 'script-src allows any host via *', 'List explicit hosts');
      for (const x of l) {
        if (/^(https?:|data:|blob:|filesystem:)$/.test(x) && !(dyn && x === 'https:')) add(x === 'http:' || x === 'data:' ? 'high' : 'medium', `script-src allows the whole "${x}" scheme`, 'Allow specific hosts instead');
        else if (/^(https?:\/\/)?\*\./.test(x)) add('medium', `Wildcard subdomain source ${x} is broad`, 'Pin exact hosts');
        else if (!x.startsWith("'") && !x.endsWith(':') && JSONP_HOSTS.test(x.replace(/^https?:\/\//, '').replace(/[:/].*$/, '')) && !dyn) add('medium', `${x} hosts JSONP/Angular/user-uploaded scripts commonly used to bypass CSP`, 'Use nonces with strict-dynamic instead of host allowlists');
        else if (/^http:\/\//.test(x)) add('medium', `Insecure http:// source ${x}`, 'Use https');
      }
      if (l.some((x) => /^'nonce-(replace|change|todo|test|static)/.test(x) || /^'nonce-.{1,15}'$/.test(x))) add('medium', 'Nonce looks static or too short (needs 128+ random bits, fresh per response)', 'Generate with a CSPRNG per request');
    }
    if (!dirs['object-src'] && !(dirs['default-src'] || []).includes("'none'")) add('medium', 'object-src not restricted (plugins / legacy object injection)', "Add object-src 'none'");
    if (!dirs['base-uri']) add('medium', 'No base-uri: injected <base> can redirect relative script URLs', "Add base-uri 'self' (or 'none')");
    if (!dirs['frame-ancestors']) add('low', 'No frame-ancestors: clickjacking protection relies on X-Frame-Options', "Add frame-ancestors 'self' or 'none'");
    if (!dirs['form-action']) add('low', 'No form-action: forms may post to any origin', "Add form-action 'self'");
    const st = eff('style-src'); if (st && low(st).includes("'unsafe-inline'")) add('low', "style-src allows 'unsafe-inline' (CSS injection / data exfiltration)", 'Prefer nonces or hashes for styles');
    for (const k of ['img-src', 'connect-src', 'frame-src', 'font-src', 'media-src']) { const v = low(dirs[k]); if (v.includes('*')) add('low', `${k} allows any host (*)`, 'Restrict to needed hosts'); if (v.some((x) => x === 'http:' || /^http:\/\//.test(x))) add('medium', `${k} allows insecure http: sources`, 'Use https'); }
    if (!('upgrade-insecure-requests' in dirs) && !('block-all-mixed-content' in dirs)) add('low', 'No upgrade-insecure-requests', 'Add it to auto-upgrade http subresources');
    if (!dirs['report-uri'] && !dirs['report-to']) add('info', 'No reporting endpoint configured', 'Add report-to / report-uri to learn about violations');
    if (ro) add('info', 'Report-Only: this policy does not block anything yet');
    const pts = { high: 30, medium: 12, low: 4, info: 0 }, score = Math.max(0, 100 - F.reduce((a, f) => a + pts[f.sev], 0)), grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
    const rank = { high: 0, medium: 1, low: 2, info: 3 };
    return `Grade ${grade} (${score}/100), ${Object.keys(dirs).length} directive(s)\n\n` + (F.length ? F.sort((a, b) => rank[a.sev] - rank[b.sev]).map((f) => `[${f.sev.toUpperCase()}] ${f.msg}${f.fix ? '\n        fix: ' + f.fix : ''}`).join('\n') : 'No issues found.') + '\n\nDirectives parsed:\n' + Object.entries(dirs).map(([k, v]) => `  ${k}: ${v.join(' ') || '(empty)'}`).join('\n');
  },
});

// ---------- invisible characters / homoglyphs ----------
const INVIS = [
  [/[\u200b\u200c\u200d\u2060\ufeff\u180e]/, 'zero-width'], [/[\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]/, 'bidi control (Trojan Source risk)'],
  [/[\u00ad\u034f\u115f\u1160\u17b4\u17b5\u3164\uffa0]/, 'invisible filler / soft hyphen'], [/[\u2000-\u200a\u202f\u205f\u3000\u00a0\u1680]/, 'unusual space'], [/[\u{e0000}-\u{e007f}]/u, 'tag character (hidden text)'],
  [/[\ufe00-\ufe0f]/, 'variation selector'], [/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/, 'control character'], [/[\u2028\u2029]/, 'line/paragraph separator'],
];
const CONFUSABLE = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', һ: 'h', ԛ: 'q', ԝ: 'w', А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', І: 'I', Ј: 'J', Ѕ: 'S', ο: 'o', ν: 'v', α: 'a', ρ: 'p', Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X', 'ａ': 'a', 'ｅ': 'e', 'ⅰ': 'i', 'ǀ': 'l', 'ǃ': '!', '‐': '-', '‑': '-', '–': '-', '—': '-', '“': '"', '”': '"', '‘': "'", '’': "'" };
const cp = (c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
tools.push({
  id: 'zero-width-detector', cat: BRO, title: 'Invisible Character & Homoglyph Detector', desc: 'Find and strip zero-width, bidi-control and other invisible characters, plus Cyrillic/Greek look-alikes mixed into Latin words. Useful against text watermarking and spoofing.',
  labels: ['Text'], sample: 'Hello\u200b World\u200c! Pay\u202etxt.exe now. Pаypal – рassword\u00a0reset\u2060 \ufeffdone.\ntag:\u{e0041}\u{e0042}',
  opts: [{ id: 'mode', label: 'Output', type: 'select', choices: ['report', 'cleaned text', 'cleaned + homoglyphs to Latin'], def: 'report' }, { id: 'keepSpaces', label: 'Keep unusual spaces (convert to normal space instead of keeping)', type: 'checkbox', def: false }],
  run: ([t], o) => {
    const found = []; let li = 1, col = 0;
    for (const ch of t) {
      if (ch === '\n') { li++; col = 0; continue; } col++;
      const k = INVIS.find(([re]) => re.test(ch)); if (k) found.push({ ch, kind: k[1], li, col });
    }
    const mixed = [...t.matchAll(/[\p{L}\p{N}]+/gu)].filter((m) => { const w = m[0], sc = new Set(); for (const c of w) { if (/\p{Script=Latin}/u.test(c)) sc.add('Latin'); else if (/\p{Script=Cyrillic}/u.test(c)) sc.add('Cyrillic'); else if (/\p{Script=Greek}/u.test(c)) sc.add('Greek'); } return sc.size > 1; });
    const homo = [...t].filter((c) => CONFUSABLE[c] && !/[‐-‟]/.test(c));
    if (o.mode !== 'report') {
      let r = [...t].filter((c) => { const k = INVIS.find(([re]) => re.test(c)); return !k || (c === '\n' || c === '\t' || c === '\r') || (k[1] === 'unusual space' ? true : false); }).map((c) => (/[\u2000-\u200a\u202f\u205f\u3000\u00a0\u1680]/.test(c) && !o.keepSpaces ? ' ' : c)).join('');
      if (o.mode.includes('homoglyphs')) r = [...r].map((c) => (/[‐-‟]/.test(c) ? c : CONFUSABLE[c] || c)).join('');
      return r;
    }
    const by = {}; found.forEach((f) => { by[f.kind] = (by[f.kind] || 0) + 1; });
    return [`Invisible/control characters: ${found.length}${Object.keys(by).length ? ' (' + Object.entries(by).map(([k, v]) => `${v} ${k}`).join(', ') + ')' : ''}`, ...found.slice(0, 200).map((f) => `  line ${f.li}, col ${f.col}: ${cp(f.ch)}  ${f.kind}`), '',
      `Mixed-script words (likely spoofing): ${mixed.length}`, ...mixed.map((m) => `  "${m[0]}" -> looks like "${[...m[0]].map((c) => CONFUSABLE[c] || c).join('')}"  [${[...m[0]].filter((c) => CONFUSABLE[c]).map(cp).join(' ')}]`), '',
      `Look-alike characters from other scripts: ${homo.length}${homo.length ? ' (' + [...new Set(homo)].map((c) => `${c} ${cp(c)}`).join(', ') + ')' : ''}`, '',
      found.some((f) => f.kind.startsWith('bidi')) ? 'WARNING: bidi controls can reorder displayed text to hide its real content (e.g. file extensions, source code).' : '', 'Use the "cleaned text" output to strip them. En/em dashes and curly quotes are only flagged as look-alikes in the cleaned+homoglyph mode.'].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
  },
});

// ---------- legal generators ----------
const DISC = '> DISCLAIMER: This is a generic template generated locally for information only. It is not legal advice and may not meet the requirements that apply to your business. Have a qualified lawyer review it before publishing.\n\n';
const today = () => new Date().toISOString().slice(0, 10);
const co = (o) => o.company || '[Company]';
tools.push({
  id: 'privacy-policy-generator', cat: LEG, title: 'Privacy Policy Generator (GDPR / CCPA)', desc: 'Fill in the options to get a privacy policy draft covering GDPR and/or CCPA/CPRA. Template only, not legal advice.',
  inputs: 0, sample: '',
  opts: [{ id: 'company', label: 'Company / controller name', type: 'text', def: 'Example Ltd' }, { id: 'website', label: 'Website', type: 'text', def: 'https://www.example.com' }, { id: 'address', label: 'Postal address', type: 'text', def: '1 Example Street, 1000 Brussels, Belgium' }, { id: 'email', label: 'Privacy contact email', type: 'text', def: 'privacy@example.com' }, { id: 'dpo', label: 'DPO name/email (optional)', type: 'text', def: '' },
    { id: 'regime', label: 'Regime', type: 'select', choices: ['GDPR (EU/UK)', 'CCPA/CPRA (California)', 'Both'], def: 'Both' }, { id: 'authority', label: 'Supervisory authority (GDPR)', type: 'text', def: 'Belgian Data Protection Authority (www.dataprotectionauthority.be)' },
    { id: 'account', label: 'User accounts', type: 'checkbox', def: true }, { id: 'payments', label: 'Payments', type: 'checkbox', def: false }, { id: 'contact', label: 'Contact form', type: 'checkbox', def: true }, { id: 'newsletter', label: 'Newsletter', type: 'checkbox', def: false },
    { id: 'analytics', label: 'Analytics', type: 'checkbox', def: true }, { id: 'ads', label: 'Advertising / marketing cookies', type: 'checkbox', def: false }, { id: 'transfers', label: 'Transfers outside EEA', type: 'checkbox', def: false }, { id: 'sells', label: 'Sells or shares personal data (CCPA)', type: 'checkbox', def: false },
    { id: 'processors', label: 'Processors / third parties (comma separated)', type: 'text', def: 'hosting provider, email delivery provider' }, { id: 'retention', label: 'Retention', type: 'text', def: 'account data until the account is deleted, then up to 30 days in backups; contact messages 12 months; invoices 7 years as required by law' }],
  run: (_i, o) => {
    const g = o.regime !== 'CCPA/CPRA (California)', c = o.regime !== 'GDPR (EU/UK)', X = co(o);
    const data = [['Identification and contact data (name, email)', o.account || o.contact || o.newsletter], ['Account credentials and profile data', o.account], ['Payment and billing data (processed by our payment provider)', o.payments], ['Messages you send us', o.contact], ['Usage data, IP address, device and browser information', true], ['Cookie and analytics identifiers', o.analytics || o.ads]].filter((x) => x[1]).map((x) => '- ' + x[0]);
    const purposes = [['Provide and secure the website and services', 'Contract / legitimate interests (Art. 6(1)(b),(f))', true], ['Create and manage your account', 'Contract (Art. 6(1)(b))', o.account], ['Process payments and meet accounting duties', 'Contract and legal obligation (Art. 6(1)(b),(c))', o.payments], ['Respond to your enquiries', 'Legitimate interests / pre-contract steps (Art. 6(1)(f),(b))', o.contact], ['Send newsletters', 'Consent (Art. 6(1)(a)); you can unsubscribe at any time', o.newsletter], ['Measure and improve the website', 'Consent (Art. 6(1)(a)) where cookies require it', o.analytics], ['Personalised advertising and marketing', 'Consent (Art. 6(1)(a))', o.ads]].filter((x) => x[2]);
    const procs = o.processors.split(',').map((s) => s.trim()).filter(Boolean);
    let s = DISC + `# Privacy Policy\n\nLast updated: ${today()}\n\n## 1. Who we are\n${X} ("we", "us"), ${o.address}, operates ${o.website}. ${g ? 'We are the data controller under the GDPR. ' : ''}Contact: ${o.email}.${o.dpo ? ' Data Protection Officer: ' + o.dpo + '.' : ''}\n\n## 2. Personal data we collect\n${data.join('\n')}\n\nWe collect data directly from you, automatically from your device, ${o.payments ? 'and from our payment provider. ' : ''}We do not knowingly collect data from children under 16.\n\n`;
    s += `## 3. Why we use it${g ? ' and legal bases' : ''}\n${purposes.map((p) => `- ${p[0]}${g ? ' - ' + p[1] : ''}`).join('\n')}\n\n## 4. Who we share it with\nWe share data only with service providers acting on our instructions${procs.length ? ' (' + procs.join(', ') + ')' : ''}, and where required by law. ${o.sells ? 'We also share certain data with advertising partners, which may count as "selling" or "sharing" under California law.' : 'We do not sell your personal data.'}\n\n`;
    s += `## 5. International transfers\n${o.transfers ? 'Some providers process data outside the EEA/UK. Where this happens we rely on adequacy decisions or Standard Contractual Clauses with supplementary measures.' : 'We aim to keep your data within the EEA/UK.'}\n\n## 6. How long we keep it\n${o.retention}.\n\n## 7. Security\nWe use TLS in transit, access controls and encryption where appropriate. No system is perfectly secure; we will notify you and the authorities of breaches as required by law.\n\n`;
    if (g) s += `## 8. Your rights (GDPR)\nYou can: access your data (Art. 15), correct it (Art. 16), have it erased (Art. 17), restrict (Art. 18) or object to processing (Art. 21), receive it in a portable format (Art. 20), and withdraw consent at any time (Art. 7(3)) without affecting earlier processing. Email ${o.email}; we answer within one month. You may complain to your supervisory authority: ${o.authority}.\n\n`;
    if (c) s += `## ${g ? '9' : '8'}. Your California privacy rights (CCPA/CPRA)\nCalifornia residents may request to know what personal information we collected, used, disclosed or sold in the last 12 months; to delete or correct it; to opt out of sale/sharing${o.sells ? ' (use the "Do Not Sell or Share My Personal Information" link)' : ''}; and to limit use of sensitive personal information. We will not discriminate against you for exercising these rights. We honour Global Privacy Control signals as opt-out requests. You can use an authorised agent. Categories collected: identifiers, internet activity${o.payments ? ', commercial information' : ''}. We verify requests by matching them to the account email.\n\n`;
    s += `## Cookies\n${o.analytics || o.ads ? 'We use cookies and similar technologies for ' + [o.analytics && 'analytics', o.ads && 'advertising'].filter(Boolean).join(' and ') + ' only with your consent where required. See our Cookie Policy.' : 'We only use strictly necessary cookies.'}\n\n## Changes\nWe will post changes on this page and update the date above.\n`;
    return s;
  },
});

tools.push({
  id: 'cookie-policy-generator', cat: LEG, title: 'Cookie Policy Generator', desc: 'Cookie policy draft with a categorised table of cookies (necessary, preferences, analytics, marketing). Template only, not legal advice.',
  inputs: 0, sample: '',
  opts: [{ id: 'company', label: 'Company', type: 'text', def: 'Example Ltd' }, { id: 'website', label: 'Website', type: 'text', def: 'https://www.example.com' }, { id: 'email', label: 'Contact email', type: 'text', def: 'privacy@example.com' },
    { id: 'prefs', label: 'Preference cookies', type: 'checkbox', def: true }, { id: 'analytics', label: 'Analytics cookies', type: 'checkbox', def: true }, { id: 'tool', label: 'Analytics tool', type: 'text', def: 'Google Analytics 4 (_ga, _ga_*): 13 months' }, { id: 'marketing', label: 'Marketing cookies', type: 'checkbox', def: false }, { id: 'mtool', label: 'Marketing tool', type: 'text', def: 'Meta Pixel (_fbp): 3 months' }, { id: 'session', label: 'Session cookie name', type: 'text', def: 'sessionid' }],
  run: (_i, o) => {
    const rows = [['Strictly necessary', `${o.session}, consent choice (localStorage "cookie-consent-v1")`, 'Login session, security, remembering your cookie choice', 'Session / 12 months', 'No consent needed']];
    if (o.prefs) rows.push(['Preferences', 'theme, language', 'Remember your settings', '12 months', 'Consent']);
    if (o.analytics) rows.push(['Analytics', o.tool.split(':')[0], 'Understand how visitors use the site', o.tool.split(':')[1]?.trim() || 'up to 24 months', 'Consent']);
    if (o.marketing) rows.push(['Marketing', o.mtool.split(':')[0], 'Measure and personalise advertising', o.mtool.split(':')[1]?.trim() || 'up to 13 months', 'Consent']);
    return DISC + `# Cookie Policy\n\nLast updated: ${today()}\n\n## What are cookies?\nCookies are small text files stored on your device. Similar technologies (localStorage, pixels) are covered by this policy too.\n\n## Who is responsible?\n${co(o)} operates ${o.website}. Questions: ${o.email}.\n\n## Cookies we use\n| Category | Cookies / tools | Purpose | Duration | Legal basis |\n|---|---|---|---|---|\n${rows.map((r) => '| ' + r.join(' | ') + ' |').join('\n')}\n\n## Your choices\nWhen you first visit, we ask for your consent for non-essential cookies. Change or withdraw it at any time via the "Cookie settings" link in the footer. Rejecting is as easy as accepting. You can also block or delete cookies in your browser settings, and send a Global Privacy Control signal, which we treat as a rejection.\n\n## Third parties\n${o.analytics || o.marketing ? 'Third-party providers named above may receive your IP address and device data. See their privacy policies.' : 'We do not use third-party cookies.'}\n\n## Changes\nWe update this policy when our cookies change.\n`;
  },
});

tools.push({
  id: 'terms-generator', cat: LEG, title: 'Terms of Service Generator', desc: 'Website / SaaS terms and conditions draft with optional accounts, payments, user content and liability clauses. Template only, not legal advice.',
  inputs: 0, sample: '',
  opts: [{ id: 'company', label: 'Company', type: 'text', def: 'Example Ltd' }, { id: 'website', label: 'Website / service', type: 'text', def: 'https://www.example.com' }, { id: 'email', label: 'Contact email', type: 'text', def: 'legal@example.com' }, { id: 'law', label: 'Governing law / courts', type: 'text', def: 'Belgium; courts of Brussels' }, { id: 'age', label: 'Minimum age', type: 'number', def: 16 },
    { id: 'account', label: 'Accounts', type: 'checkbox', def: true }, { id: 'payments', label: 'Paid plans / subscriptions', type: 'checkbox', def: false }, { id: 'refund', label: 'Refund period (days, 0 = none)', type: 'number', def: 14 }, { id: 'ugc', label: 'User-generated content', type: 'checkbox', def: false }, { id: 'liability', label: 'Limit liability', type: 'checkbox', def: true }],
  run: (_i, o) => {
    let n = 0; const H = (t) => `## ${++n}. ${t}\n`;
    let s = DISC + `# Terms of Service\n\nLast updated: ${today()}\n\n` + H('Agreement') + `These terms govern your use of ${o.website} (the "Service") provided by ${co(o)}. By using the Service you agree to them. You must be at least ${o.age} years old.\n\n`;
    if (o.account) s += H('Accounts') + 'You are responsible for your credentials and all activity under your account. Provide accurate information and tell us promptly about unauthorised use. We may suspend accounts that breach these terms.\n\n';
    s += H('Acceptable use') + 'Do not misuse the Service: no unlawful activity, malware, scraping that harms performance, attempts to break security, or infringing others\' rights.\n\n';
    if (o.payments) s += H('Fees and payment') + `Paid plans are billed in advance and renew automatically until cancelled. Prices may change with notice. ${o.refund > 0 ? `Consumers in the EU may withdraw within ${o.refund} days of purchase unless the digital service has already been fully performed with their consent.` : 'Fees are non-refundable except where the law requires otherwise.'}\n\n`;
    if (o.ugc) s += H('Your content') + 'You keep ownership of content you submit. You grant us a worldwide, non-exclusive licence to host and display it to operate the Service. You are responsible for it and warrant that you have the necessary rights. We may remove unlawful or infringing content.\n\n';
    s += H('Intellectual property') + `The Service, its software and branding belong to ${co(o)} or its licensors. We grant you a limited, revocable, non-transferable licence to use it as intended.\n\n` + H('Privacy') + 'Our Privacy Policy explains how we process personal data.\n\n' + H('Availability and changes') + 'We try to keep the Service available but do not guarantee uninterrupted access. We may change or discontinue features, giving reasonable notice for material changes.\n\n';
    s += H('Disclaimer and liability') + (o.liability ? 'The Service is provided "as is". To the extent permitted by law, we are not liable for indirect or consequential loss, and our total liability is limited to the fees you paid in the previous 12 months. Nothing limits liability for intent, gross negligence, death or personal injury, or anything that cannot be limited by law (including mandatory consumer rights).\n\n' : 'Nothing in these terms limits liability that cannot be limited by law.\n\n');
    s += H('Termination') + 'You may stop using the Service at any time. We may terminate for material breach. Provisions that should survive termination (IP, liability, governing law) do.\n\n' + H('Governing law') + `${o.law}. Consumers keep any mandatory rights of their country of residence.\n\n` + H('Contact') + `${o.email}\n`;
    return s;
  },
});

tools.push({
  id: 'cookie-banner-generator', cat: LEG, title: 'Cookie Consent Banner Generator', desc: 'Self-contained HTML/CSS/JS banner (accept, reject, choose categories). Choice is saved in localStorage. It does NOT block scripts by itself: you must gate them on consent.',
  inputs: 0, sample: '',
  opts: [{ id: 'title', label: 'Title', type: 'text', def: 'We value your privacy' }, { id: 'msg', label: 'Message', type: 'text', def: 'We use cookies to run this site and, with your consent, to measure usage. You can accept all, reject all, or choose.' }, { id: 'policy', label: 'Policy URL', type: 'text', def: '/cookie-policy' },
    { id: 'analytics', label: 'Analytics category', type: 'checkbox', def: true }, { id: 'marketing', label: 'Marketing category', type: 'checkbox', def: false }, { id: 'pos', label: 'Position', type: 'select', choices: ['bottom', 'top'], def: 'bottom' }, { id: 'theme', label: 'Theme', type: 'select', choices: ['light', 'dark'], def: 'light' }],
  run: (_i, o) => {
    const dark = o.theme === 'dark', cats = [o.analytics && ['analytics', 'Analytics'], o.marketing && ['marketing', 'Marketing']].filter(Boolean);
    const html = `<!-- Cookie consent banner. Generated locally. IMPORTANT: this snippet only records the visitor's choice (localStorage key "cookie-consent-v1").
     It does NOT block any scripts or cookies. Load analytics/marketing scripts only after getConsent().analytics / .marketing is true (see bottom). -->
<style>
#cc-banner{position:fixed;${o.pos}:0;left:0;right:0;z-index:99999;background:${dark ? '#1b1b1f' : '#fff'};color:${dark ? '#eee' : '#222'};border-${o.pos === 'top' ? 'bottom' : 'top'}:1px solid #8888;padding:16px;font:14px/1.5 system-ui,sans-serif;box-shadow:0 0 12px #0003}
#cc-banner[hidden]{display:none}#cc-banner h2{margin:0 0 4px;font-size:16px}#cc-banner a{color:inherit}
#cc-banner .cc-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}#cc-banner label{margin-right:12px}
#cc-banner button{padding:8px 14px;border-radius:6px;border:1px solid #888;background:transparent;color:inherit;font:inherit;cursor:pointer}
#cc-banner button.cc-primary{background:#0b7a4b;border-color:#0b7a4b;color:#fff}
</style>
<div id="cc-banner" role="dialog" aria-modal="false" aria-labelledby="cc-title" hidden>
  <h2 id="cc-title">${esc(o.title)}</h2>
  <p>${esc(o.msg)} <a href="${esc(o.policy)}">Cookie policy</a></p>
  <div class="cc-row"><label><input type="checkbox" checked disabled> Necessary</label>${cats.map(([k, n]) => `<label><input type="checkbox" data-cc="${k}"> ${n}</label>`).join('')}</div>
  <div class="cc-row">
    <button type="button" class="cc-primary" id="cc-accept">Accept all</button>
    <button type="button" id="cc-reject">Reject all</button>
    ${cats.length ? '<button type="button" id="cc-save">Save my choices</button>' : ''}
  </div>
</div>
<script>
(function () {
  var KEY = 'cookie-consent-v1', CATS = ${JSON.stringify(cats.map((c) => c[0]))}, b = document.getElementById('cc-banner');
  function read() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function save(c) {
    c.necessary = true; c.time = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
    b.hidden = true;
    document.dispatchEvent(new CustomEvent('consentchange', { detail: c }));
  }
  function all(v) { var c = {}; CATS.forEach(function (k) { c[k] = v; }); return c; }
  window.getConsent = read;                      // returns {necessary, analytics?, marketing?, time} or null
  window.openConsent = function () { b.hidden = false; };   // e.g. <a href="#" onclick="openConsent();return false">Cookie settings</a>
  document.getElementById('cc-accept').onclick = function () { save(all(true)); };
  document.getElementById('cc-reject').onclick = function () { save(all(false)); };
  var s = document.getElementById('cc-save');
  if (s) s.onclick = function () { var c = all(false); CATS.forEach(function (k) { c[k] = b.querySelector('[data-cc=' + k + ']').checked; }); save(c); };
  if (navigator.globalPrivacyControl && !read()) save(all(false));   // treat Global Privacy Control as "reject"
  if (!read()) b.hidden = false;
})();
</script>
<!-- Example: load analytics only after consent
<script>
function startAnalytics() { /* inject your analytics <script> here */ }
var c = getConsent(); if (c && c.analytics) startAnalytics();
document.addEventListener('consentchange', function (e) { if (e.detail.analytics) startAnalytics(); });
</script> -->`;
    return { text: html, html: html.replace('hidden>', '>').replace('<script>', '<!--').replace(/<\/script>\n<!-- Example[\s\S]*$/, '-->') };
  },
});

tools.push({
  id: 'data-deletion-request-letter', cat: LEG, title: 'GDPR Erasure / Access Request Letter', desc: 'Generate an Art. 17 erasure and/or Art. 15 access request letter to a company. Template only, not legal advice.',
  inputs: 0, sample: '',
  opts: [{ id: 'type', label: 'Request', type: 'select', choices: ['Erasure (Art. 17)', 'Access (Art. 15)', 'Access then erasure (Art. 15 + 17)'], def: 'Erasure (Art. 17)' }, { id: 'name', label: 'Your full name', type: 'text', def: '[Your name]' }, { id: 'address', label: 'Your address', type: 'text', def: '[Your address]' }, { id: 'ids', label: 'Identifiers (account email, customer no.)', type: 'text', def: '[account email / customer number]' },
    { id: 'ctrl', label: 'Company / controller', type: 'text', def: '[Company name]' }, { id: 'to', label: 'Their privacy contact / DPO', type: 'text', def: '[privacy@company.example]' },
    { id: 'ground', label: 'Erasure ground (Art. 17(1))', type: 'select', choices: ['(a) data no longer necessary', '(b) I withdraw my consent', '(c) I object to the processing (Art. 21)', '(d) unlawfully processed', '(f) collected from a child'], def: '(b) I withdraw my consent' },
    { id: 'third', label: 'Also ask them to notify recipients (Art. 17(2), 19)', type: 'checkbox', def: true }],
  run: (_i, o) => {
    const er = o.type.includes('17'), ac = o.type.includes('15');
    const d = new Date(), due = new Date(d.getTime() + 30 * 864e5).toISOString().slice(0, 10);
    let s = `${o.name}\n${o.address}\n\n${o.ctrl}\nAttn: Data Protection Officer / Privacy Team\n${o.to}\n\n${today()}\n\nSubject: ${ac && er ? 'Request for access (Art. 15) and erasure (Art. 17) of my personal data' : ac ? 'Data subject access request under Art. 15 GDPR' : 'Request for erasure of my personal data under Art. 17 GDPR'}\nReference: ${o.ids}\n\nDear Sir or Madam,\n\nI am writing as a data subject under Regulation (EU) 2016/679 (GDPR). I am identifiable through the details above and will provide further proof of identity if you need it, limited to what is necessary.\n\n`;
    if (ac) s += `${er ? '1. ' : ''}Request for access (Article 15)\nPlease confirm whether you process my personal data and, if so, provide:\n- a copy of all my personal data you hold (Art. 15(3)), in a commonly used electronic format;\n- the purposes of processing and the categories of data;\n- the recipients or categories of recipients, including processors and recipients in third countries, and the safeguards used for transfers;\n- the retention period or the criteria used to determine it;\n- the source of the data, if not collected from me;\n- the existence of automated decision-making or profiling, including its logic and consequences;\n- information on my rights to rectification, erasure, restriction and objection, and to lodge a complaint.\n\n`;
    if (er) s += `${ac ? '2. ' : ''}Request for erasure (Article 17)\nI request that you erase all personal data concerning me without undue delay. Ground: Art. 17(1)${o.ground}.${ac ? ' Please carry out the erasure after you have provided the access copy above, and confirm in writing which data (if any) you must retain and on what legal basis.' : ''}\n${o.third ? 'Under Articles 17(2) and 19, please also inform every processor and other recipient to whom my data was disclosed, and any controller to whom you made it public, of this request, and tell me who they are.\n' : ''}Please also delete data held in backups when they are next restored or rotated, and stop sending me marketing communications.\n\n`;
    s += `Under Article 12(3) you must respond within one month of receipt (extendable by two months only for complex requests, with notice). Please reply by ${due}. If you refuse, tell me the reasons and my right to complain to the supervisory authority and seek a judicial remedy. If I do not hear from you I may complain to the competent data protection authority.\n\nYours faithfully,\n\n${o.name}\n\n--\nNote (remove before sending): send by email or registered post and keep proof of dispatch. This template is not legal advice.\n`;
    return s;
  },
});

// ---------- GDPR checklist ----------
const GDPR = [
  ['Lawfulness and transparency', ['Documented a lawful basis (Art. 6) for each processing purpose', 'Consent is freely given, specific, informed, unambiguous and as easy to withdraw as to give (Art. 7)', 'Privacy notice states identity, purposes, bases, recipients, transfers, retention and rights (Art. 13/14)', 'Special-category data processed only with an Art. 9 condition']],
  ['Records and accountability', ['Record of processing activities maintained (Art. 30)', 'Data protection policies and staff training in place', 'DPO appointed where required (Art. 37)', 'DPIA performed for high-risk processing (Art. 35)', 'Data protection by design and default considered for new features (Art. 25)']],
  ['Data subject rights', ['Process to handle access requests within one month (Art. 15)', 'Erasure, rectification, restriction and portability workflows (Art. 16-20)', 'Right to object and opt-out of direct marketing honoured (Art. 21)', 'Identity verification proportionate and documented', 'Requests logged with dates and outcomes']],
  ['Processors and third parties', ['Data processing agreements signed with all processors (Art. 28)', 'Sub-processors known and approved', 'Joint-controller arrangements documented where relevant (Art. 26)', 'Vendors assessed for security and GDPR compliance']],
  ['International transfers', ['Transfers outside EEA mapped', 'Adequacy decision, SCCs or BCRs in place (Art. 44-49)', 'Transfer impact assessment done where needed']],
  ['Security and breaches', ['Encryption in transit and at rest where appropriate (Art. 32)', 'Access control, least privilege and logging', 'Regular backups and restore tests', 'Breach response plan; authority notified within 72 hours (Art. 33), individuals when high risk (Art. 34)', 'Breach register maintained']],
  ['Data minimisation and retention', ['Only data necessary for each purpose is collected (Art. 5(1)(c))', 'Retention periods defined and enforced (deletion jobs)', 'Test and analytics data pseudonymised or anonymised', 'Forms do not require unnecessary fields']],
  ['Website, cookies and marketing', ['Cookie banner obtains consent before non-essential cookies/scripts load (ePrivacy Art. 5(3))', 'Reject is as prominent as Accept; no pre-ticked boxes', 'Cookie policy lists each cookie, purpose and duration', 'Third-party embeds and fonts reviewed (self-host where possible)', 'Newsletter uses double opt-in and has unsubscribe link', 'Global Privacy Control / Do Not Track policy decided']],
];
tools.push({
  id: 'gdpr-checklist', cat: LEG, title: 'GDPR Compliance Checklist', desc: 'Interactive GDPR self-assessment checklist. Progress is saved in your browser (localStorage) only.',
  custom: true, dom: true,
  render(root) {
    const KEY = 'ft-gdpr-checklist-v1'; let state = {};
    try { state = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { state = {}; }
    const total = GDPR.reduce((a, s) => a + s[1].length, 0), prog = el('p', { style: 'font-weight:600' }), bars = el('div', { style: 'height:8px;background:#8884;border-radius:4px;overflow:hidden;max-width:30rem;margin-bottom:1em' }, el('div', { style: 'height:100%;background:#4a8;width:0' }));
    const upd = () => { const n = Object.values(state).filter(Boolean).length; prog.textContent = `${n} / ${total} done (${Math.round(n / total * 100)}%)`; bars.firstChild.style.width = n / total * 100 + '%'; };
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ } upd(); };
    root.append(prog, bars);
    GDPR.forEach(([title, items], si) => {
      root.append(el('h2', {}, title));
      items.forEach((txt, ii) => {
        const k = si + '.' + ii;
        root.append(el('label', { style: 'display:flex;gap:8px;align-items:flex-start;margin:4px 0' }, el('input', { type: 'checkbox', checked: !!state[k], onchange: (e) => { state[k] = e.target.checked; save(); } }), el('span', {}, txt)));
      });
    });
    root.append(el('div', { className: 'row' }, el('button', { onclick: () => { state = {}; root.querySelectorAll('input').forEach((i) => { i.checked = false; }); save(); } }, 'Reset')), el('p', { className: 'desc' }, 'This checklist is a starting point, not legal advice.'));
    upd();
  },
});

export default tools;

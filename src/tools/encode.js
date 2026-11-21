// Encoding, Hashing & JWT, Date & Time, Network & HTTP, Regex tools. Zero dependencies, client-side only.
// Skipped (need server/network or too heavy): DNS lookup, IP geolocation, SSL/TLS checks, bcrypt,
// user-agent-generator. Combined tools: html-entities, hex-text, binary-text, unicode-escape, base32,
// punycode, morse, rot (direction select); checksum (CRC32 + Adler-32 together); query-string (parse + build).
const T = [];
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => {
  s = s.replace(/0x|[\s:,-]/gi, '');
  if (!/^[0-9a-f]*$/i.test(s) || s.length % 2) throw new Error('Invalid hex (need an even number of hex digits)');
  return Uint8Array.from(s.match(/../g) || [], (h) => parseInt(h, 16));
};
const cat = (...a) => { const r = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { r.set(x, o); o += x.length; } return r; };
const b64e = (u, url, pad = true) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  s = btoa(s);
  if (url) s = s.replace(/\+/g, '-').replace(/\//g, '_');
  return pad && !url ? s : s.replace(/=+$/, '');
};
const b64d = (s) => {
  s = s.replace(/^data:[^,]*,/, '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (/[^A-Za-z0-9+/]/.test(s) || s.length % 4 === 1) throw new Error('Invalid Base64 input');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const utf8 = (u) => { try { return dec.decode(u); } catch { throw new Error('Decoded bytes are not valid UTF-8 text'); } };
const lines = (s) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const pad2 = (n) => String(n).padStart(2, '0');
// Reference-list tool: rows are strings, input filters (all words must match).
const refTool = (o) => T.push({
  inputs: 1, labels: ['Search / filter (leave empty for all)'], sample: '', ...o,
  run: ([q]) => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = (typeof o.rows === 'function' ? o.rows() : o.rows).filter((r) => w.every((x) => r.toLowerCase().includes(x)));
    return rows.length ? rows.join('\n') : 'No matches.';
  },
});

// ---------------------------------------------------------------- Encoding
T.push({
  id: 'base64-encode', cat: 'Encoding', title: 'Base64 Encode', desc: 'Encode text (UTF-8 safe) to Base64 or URL-safe Base64.',
  labels: ['Text'], sample: 'Hello, wörld! ✓',
  opts: [{ id: 'url', label: 'URL-safe (-_ , no padding)', type: 'checkbox', def: false }, { id: 'wrap', label: 'Wrap at 76 chars', type: 'checkbox', def: false }],
  run: ([s], o) => { const r = b64e(enc.encode(s), o.url); return o.wrap ? r.replace(/(.{76})/g, '$1\n').trim() : r; },
});
T.push({
  id: 'base64-decode', cat: 'Encoding', title: 'Base64 Decode', desc: 'Decode Base64 / URL-safe Base64 to UTF-8 text.',
  labels: ['Base64'], sample: 'SGVsbG8sIHfDtnJsZCEg4pyT',
  run: ([s]) => utf8(b64d(s)),
});
T.push({
  id: 'base64-image-viewer', cat: 'Encoding', title: 'Base64 Image Viewer', desc: 'Preview and download an image from a data URI or raw Base64.',
  labels: ['Data URI or Base64'], dom: true,
  sample: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=',
  run: ([s]) => {
    const m = s.trim().match(/^data:([^;,]+)?(;[^,]*)?,/i);
    const u = b64d(s.trim());
    const sig = hex(u.subarray(0, 12));
    let type = m?.[1];
    if (!type || !type.startsWith('image/')) {
      type = sig.startsWith('89504e47') ? 'image/png' : sig.startsWith('ffd8ff') ? 'image/jpeg' : sig.startsWith('47494638') ? 'image/gif'
        : sig.startsWith('52494646') && sig.slice(16, 24) === '57454250' ? 'image/webp' : sig.startsWith('424d') ? 'image/bmp'
          : sig.startsWith('00000100') ? 'image/x-icon' : /^\s*<(\?xml|svg)/i.test(new TextDecoder().decode(u.subarray(0, 64))) ? 'image/svg+xml' : '';
    }
    if (!type) throw new Error('Could not detect an image type in this data');
    return { blob: new Blob([u], { type }), filename: 'image.' + (type.split('/')[1].replace('svg+xml', 'svg').replace('jpeg', 'jpg').replace('x-icon', 'ico')) };
  },
});
T.push({
  id: 'url-encode', cat: 'Encoding', title: 'URL Encode', desc: 'Percent-encode text for URLs.',
  labels: ['Text'], sample: 'name=Zoë & co/path?x=1 2',
  opts: [{ id: 'mode', label: 'Mode', type: 'select', choices: ['component (encodeURIComponent)', 'full URL (encodeURI)', 'form (space as +)'], def: 'component (encodeURIComponent)' }],
  run: ([s], o) => o.mode.startsWith('full') ? encodeURI(s) : o.mode.startsWith('form') ? encodeURIComponent(s).replace(/%20/g, '+') : encodeURIComponent(s),
});
T.push({
  id: 'url-decode', cat: 'Encoding', title: 'URL Decode', desc: 'Decode percent-encoded text.',
  labels: ['Encoded text'], sample: 'name%3DZo%C3%AB%20%26%20co%2Fpath%3Fx%3D1%202',
  opts: [{ id: 'plus', label: 'Treat + as space', type: 'checkbox', def: false }],
  run: ([s], o) => { try { return decodeURIComponent(o.plus ? s.replace(/\+/g, ' ') : s); } catch { throw new Error('Malformed percent-encoding'); } },
});

const ENT = Object.fromEntries('nbsp:160 iexcl:161 cent:162 pound:163 curren:164 yen:165 sect:167 uml:168 copy:169 laquo:171 not:172 shy:173 reg:174 deg:176 plusmn:177 micro:181 para:182 middot:183 raquo:187 frac14:188 frac12:189 frac34:190 iquest:191 Agrave:192 Aacute:193 Acirc:194 Atilde:195 Auml:196 Aring:197 AElig:198 Ccedil:199 Egrave:200 Eacute:201 Ecirc:202 Euml:203 Igrave:204 Iacute:205 Icirc:206 Iuml:207 Ntilde:209 Ograve:210 Oacute:211 Ocirc:212 Otilde:213 Ouml:214 times:215 Oslash:216 Ugrave:217 Uacute:218 Ucirc:219 Uuml:220 szlig:223 agrave:224 aacute:225 acirc:226 atilde:227 auml:228 aring:229 aelig:230 ccedil:231 egrave:232 eacute:233 ecirc:234 euml:235 igrave:236 iacute:237 icirc:238 iuml:239 ntilde:241 ograve:242 oacute:243 ocirc:244 otilde:245 ouml:246 divide:247 oslash:248 ugrave:249 uacute:250 ucirc:251 uuml:252 yuml:255 ndash:8211 mdash:8212 lsquo:8216 rsquo:8217 ldquo:8220 rdquo:8221 bull:8226 hellip:8230 euro:8364 trade:8482 larr:8592 uarr:8593 rarr:8594 darr:8595 hearts:9829 infin:8734 ne:8800 le:8804 ge:8805'.split(' ').map((p) => p.split(':')).map(([k, v]) => [k, +v]));
const ENT_REV = Object.fromEntries(Object.entries(ENT).map(([k, v]) => [v, k]));
T.push({
  id: 'html-entities', cat: 'Encoding', title: 'HTML Entities Encode / Decode', desc: 'Escape or unescape HTML entities (named, decimal and hex).',
  labels: ['Text'], sample: '<a href="x">Café & “quotes” © 2024 😀</a>',
  opts: [{ id: 'dir', label: 'Direction', type: 'select', choices: ['encode', 'decode'], def: 'encode' }, { id: 'all', label: 'Encode all non-ASCII', type: 'checkbox', def: false }],
  run: ([s], o) => o.dir === 'decode'
    ? s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
      if (e[0] === '#') { const c = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1); return c > 0x10ffff || c === 0 ? '�' : String.fromCodePoint(c); }
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e] ?? (ENT[e] ? String.fromCodePoint(ENT[e]) : m);
    })
    : s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
      .replace(o.all ? /[^\x00-\x7f]/gu : /(?!)/g, (c) => { const cp = c.codePointAt(0); return ENT_REV[cp] ? `&${ENT_REV[cp]};` : `&#${cp};`; }),
});

T.push({
  id: 'hex-text', cat: 'Encoding', title: 'Hex ⇄ Text', desc: 'Convert text to hexadecimal bytes (UTF-8) and back.',
  labels: ['Input'], sample: 'Hello, wörld!',
  opts: [{ id: 'dir', label: 'Direction', type: 'select', choices: ['text to hex', 'hex to text'], def: 'text to hex' }, { id: 'sep', label: 'Separator', type: 'text', def: ' ' }, { id: 'upper', label: 'Uppercase', type: 'checkbox', def: false }],
  run: ([s], o) => {
    if (o.dir === 'hex to text') return utf8(unhex(s));
    const h = [...enc.encode(s)].map((b) => b.toString(16).padStart(2, '0')).join(o.sep);
    return o.upper ? h.toUpperCase() : h;
  },
});
T.push({
  id: 'binary-text', cat: 'Encoding', title: 'Binary ⇄ Text', desc: 'Convert text to 8-bit binary (UTF-8) and back.',
  labels: ['Input'], sample: 'Hello, wörld!',
  opts: [{ id: 'dir', label: 'Direction', type: 'select', choices: ['text to binary', 'binary to text'], def: 'text to binary' }],
  run: ([s], o) => {
    if (o.dir === 'text to binary') return [...enc.encode(s)].map((b) => b.toString(2).padStart(8, '0')).join(' ');
    const b = s.replace(/[^01]/g, '');
    if (!b || b.length % 8) throw new Error('Binary length must be a multiple of 8 bits');
    return utf8(Uint8Array.from(b.match(/.{8}/g), (x) => parseInt(x, 2)));
  },
});

const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', _: '..--.-', '"': '.-..-.', $: '...-..-', '@': '.--.-.' };
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
T.push({
  id: 'morse-translator', cat: 'Encoding', title: 'Morse Code Translator', desc: 'Translate text to Morse code and back (letters separated by space, words by " / ").',
  labels: ['Input'], sample: 'SOS HELP ME',
  opts: [{ id: 'dir', label: 'Direction', type: 'select', choices: ['text to morse', 'morse to text'], def: 'text to morse' }],
  run: ([s], o) => o.dir === 'text to morse'
    ? s.toUpperCase().split(/\s+/).filter(Boolean).map((w) => [...w].map((c) => MORSE[c] ?? '?').join(' ')).join(' / ')
    : s.trim().split(/\s*(?:\/|\s{3,}|\|)\s*/).map((w) => w.split(/\s+/).map((c) => MORSE_REV[c.replace(/[·•]/g, '.').replace(/[–—_]/g, '-')] ?? '?').join('')).join(' '),
});

const DG = '0123456789abcdefghijklmnopqrstuvwxyz';
function parseBig(s, b) {
  s = s.trim().toLowerCase().replace(/[\s_,]/g, '');
  let neg = false;
  if (s[0] === '-') { neg = true; s = s.slice(1); } else if (s[0] === '+') s = s.slice(1);
  if ((b === 16 && s.startsWith('0x')) || (b === 2 && s.startsWith('0b')) || (b === 8 && s.startsWith('0o'))) s = s.slice(2);
  if (!s) throw new Error('Empty number');
  let v = 0n;
  for (const ch of s) {
    const d = DG.indexOf(ch);
    if (d < 0 || d >= b) throw new Error(`Invalid digit "${ch}" for base ${b}`);
    v = v * BigInt(b) + BigInt(d);
  }
  return neg ? -v : v;
}
T.push({
  id: 'number-base-converter', cat: 'Encoding', title: 'Number Base Converter', desc: 'Convert arbitrarily large integers between bases 2-36, with two\'s complement.',
  labels: ['Number(s), one per line'], sample: '255\n-42\n123456789012345678901234567890',
  opts: [{ id: 'from', label: 'From base (2-36)', type: 'number', def: 10 }, { id: 'to', label: 'To base (2-36)', type: 'number', def: 16 },
    { id: 'bits', label: "Two's complement width", type: 'select', choices: ['none', '8', '16', '32', '64'], def: 'none' }],
  run: ([s], o) => {
    const f = Math.trunc(o.from), t = Math.trunc(o.to);
    if (!(f >= 2 && f <= 36 && t >= 2 && t <= 36)) throw new Error('Bases must be between 2 and 36');
    return lines(s).map((l) => {
      const v = parseBig(l, f);
      const out = [`Input (base ${f}): ${l}`, `Base ${t}: ${v.toString(t)}`, `Binary: ${v.toString(2)}`, `Octal: ${v.toString(8)}`, `Decimal: ${v}`, `Hex: ${v.toString(16)}`];
      if (o.bits !== 'none') {
        const n = BigInt(o.bits), half = 1n << (n - 1n), full = 1n << n;
        if (v >= -half && v < half) {
          const u = v < 0n ? full + v : v;
          out.push(`${o.bits}-bit two's complement: ${u.toString(2).padStart(+o.bits, '0')} (0x${u.toString(16).padStart(+o.bits / 4, '0')})`);
        } else if (v >= half && v < full) out.push(`As signed ${o.bits}-bit: ${v - full}`);
        else out.push(`Out of range for ${o.bits}-bit`);
      }
      return out.join('\n');
    }).join('\n\n');
  },
});

T.push({
  id: 'unicode-escape', cat: 'Encoding', title: 'Unicode Escape / Unescape', desc: 'Convert text to \\uXXXX / \\u{X} escapes and back (also \\xNN, U+XXXX).',
  labels: ['Input'], sample: 'Héllo 世界 😀',
  opts: [{ id: 'dir', label: 'Direction', type: 'select', choices: ['escape', 'unescape'], def: 'escape' }, { id: 'style', label: 'Style', type: 'select', choices: ['\\uXXXX', '\\u{X}', 'U+XXXX'], def: '\\uXXXX' }, { id: 'all', label: 'Escape ASCII too', type: 'checkbox', def: false }],
  run: ([s], o) => {
    if (o.dir === 'unescape') {
      return s.replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|\\x([0-9a-f]{2})|\\U([0-9a-f]{8})|U\+([0-9a-f]{4,6})/gi, (m, a, b, c, d, e) => {
        const cp = parseInt(a || b || c || d || e, 16);
        return b ? String.fromCharCode(cp) : cp > 0x10ffff ? m : String.fromCodePoint(cp);
      });
    }
    return [...s].map((ch) => {
      const cp = ch.codePointAt(0);
      if (cp < 128 && !o.all) return ch;
      if (o.style === '\\u{X}') return `\\u{${cp.toString(16)}}`;
      if (o.style === 'U+XXXX') return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
      return [...ch].length && cp > 0xffff ? [...Array(2)].map((_, i) => '\\u' + ch.charCodeAt(i).toString(16).padStart(4, '0')).join('') : '\\u' + cp.toString(16).padStart(4, '0');
    }).join('');
  },
});

// RFC 3492 Punycode
const PB = 36, TMIN = 1, TMAX = 26;
const adapt = (d, n, first) => { d = first ? Math.floor(d / 700) : d >> 1; d += Math.floor(d / n); let k = 0; while (d > (((PB - TMIN) * TMAX) >> 1)) { d = Math.floor(d / (PB - TMIN)); k += PB; } return k + Math.floor(((PB - TMIN + 1) * d) / (d + 38)); };
const pdigit = (d) => String.fromCharCode(d + 22 + 75 * (d < 26));
function puniEnc(str) {
  const cps = [...str].map((c) => c.codePointAt(0));
  let out = cps.filter((c) => c < 128).map((c) => String.fromCharCode(c)).join('');
  const b = out.length; let h = b, n = 128, delta = 0, bias = 72;
  if (b) out += '-';
  while (h < cps.length) {
    const m = Math.min(...cps.filter((c) => c >= n));
    delta += (m - n) * (h + 1); n = m;
    for (const c of cps) {
      if (c < n) delta++;
      if (c === n) {
        let q = delta;
        for (let k = PB; ; k += PB) {
          const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
          if (q < t) break;
          out += pdigit(t + ((q - t) % (PB - t))); q = Math.floor((q - t) / (PB - t));
        }
        out += pdigit(q); bias = adapt(delta, h + 1, h === b); delta = 0; h++;
      }
    }
    delta++; n++;
  }
  return out;
}
function puniDec(s) {
  const i0 = s.lastIndexOf('-');
  const out = i0 > 0 ? [...s.slice(0, i0)].map((c) => c.codePointAt(0)) : [];
  let n = 128, i = 0, bias = 72;
  for (let p = i0 > 0 ? i0 + 1 : 0; p < s.length;) {
    const oldi = i;
    for (let w = 1, k = PB; ; k += PB) {
      const c = s.charCodeAt(p++);
      const d = c >= 48 && c <= 57 ? c - 22 : c >= 65 && c <= 90 ? c - 65 : c >= 97 && c <= 122 ? c - 97 : -1;
      if (d < 0) throw new Error('Invalid punycode');
      i += d * w;
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
      if (d < t) break;
      w *= PB - t;
    }
    bias = adapt(i - oldi, out.length + 1, oldi === 0);
    n += Math.floor(i / (out.length + 1)); i %= out.length + 1;
    if (n > 0x10ffff) throw new Error('Invalid punycode');
    out.splice(i++, 0, n);
  }
  return String.fromCodePoint(...out);
}
T.push({
  id: 'punycode', cat: 'Encoding', title: 'Punycode / IDN Converter', desc: 'Convert internationalized domain names to xn-- Punycode and back.',
  labels: ['Domain(s), one per line'], sample: 'münchen.de\nbücher.example\n日本語.jp',
  opts: [{ id: 'dir', label: 'Direction', type: 'select', choices: ['to punycode', 'to unicode'], def: 'to punycode' }],
  run: ([s], o) => lines(s).map((l) => l.split('.').map((lab) => o.dir === 'to unicode'
    ? (lab.toLowerCase().startsWith('xn--') ? puniDec(lab.slice(4)) : lab)
    : (/[^\x00-\x7f]/.test(lab) ? 'xn--' + puniEnc(lab.normalize('NFC').toLowerCase()) : lab)).join('.')).join('\n'),
});

T.push({
  id: 'utf8-bytes-viewer', cat: 'Encoding', title: 'UTF-8 Bytes Viewer', desc: 'Show code points with their UTF-8 and UTF-16 byte sequences.',
  labels: ['Text'], sample: 'A é € 😀',
  run: ([s]) => {
    const cps = [...s];
    const rows = cps.slice(0, 500).map((ch) => {
      const cp = ch.codePointAt(0);
      const u16 = [...Array(ch.length)].map((_, i) => ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')).join(' ');
      return `${JSON.stringify(ch).padEnd(8)} U+${cp.toString(16).toUpperCase().padStart(4, '0').padEnd(7)} UTF-8: ${hex(enc.encode(ch)).toUpperCase().replace(/../g, '$& ').trim().padEnd(12)} UTF-16: ${u16}`;
    });
    return rows.join('\n') + (cps.length > 500 ? `\n... ${cps.length - 500} more` : '') + `\n\nTotal: ${cps.length} code points, ${enc.encode(s).length} UTF-8 bytes`;
  },
});

T.push({
  id: 'rot13-caesar', cat: 'Encoding', title: 'ROT13 / Caesar Cipher', desc: 'Shift letters by N (ROT13 by default) or apply ROT47.',
  labels: ['Text'], sample: 'Hello, World!',
  opts: [{ id: 'shift', label: 'Shift (negative to decode)', type: 'number', def: 13 }, { id: 'rot47', label: 'ROT47 instead', type: 'checkbox', def: false }],
  run: ([s], o) => {
    if (o.rot47) return s.replace(/[!-~]/g, (c) => String.fromCharCode(33 + ((c.charCodeAt(0) - 33 + 47) % 94)));
    const k = ((Math.trunc(o.shift) % 26) + 26) % 26;
    return s.replace(/[a-z]/gi, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(b + ((c.charCodeAt(0) - b + k) % 26)); });
  },
});

T.push({
  id: 'base32', cat: 'Encoding', title: 'Base32 Encode / Decode', desc: 'RFC 4648 Base32 (or extended-hex alphabet) for UTF-8 text.',
  labels: ['Input'], sample: 'Hello, Base32!',
  opts: [{ id: 'dir', label: 'Direction', type: 'select', choices: ['encode', 'decode'], def: 'encode' }, { id: 'hexa', label: 'Extended hex alphabet', type: 'checkbox', def: false }, { id: 'pad', label: 'Padding (=)', type: 'checkbox', def: true }],
  run: ([s], o) => {
    const A = o.hexa ? '0123456789ABCDEFGHIJKLMNOPQRSTUV' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    if (o.dir === 'encode') {
      let bits = 0, v = 0, r = '';
      for (const b of enc.encode(s)) { v = (v << 8) | b; bits += 8; while (bits >= 5) { r += A[(v >>> (bits - 5)) & 31]; bits -= 5; } v &= (1 << bits) - 1; }
      if (bits) r += A[(v << (5 - bits)) & 31];
      return o.pad ? r + '='.repeat((8 - (r.length % 8)) % 8) : r;
    }
    const clean = s.replace(/[\s=]/g, '').toUpperCase(), out = [];
    let bits = 0, v = 0;
    for (const ch of clean) {
      const d = A.indexOf(ch);
      if (d < 0) throw new Error(`Invalid Base32 character "${ch}"`);
      v = (v << 5) | d; bits += 5;
      if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; v &= (1 << bits) - 1; }
    }
    return utf8(Uint8Array.from(out));
  },
});

const CTRL = 'NUL SOH STX ETX EOT ENQ ACK BEL BS HT LF VT FF CR SO SI DLE DC1 DC2 DC3 DC4 NAK SYN ETB CAN EM SUB ESC FS GS RS US'.split(' ');
refTool({
  id: 'ascii-table', cat: 'Encoding', title: 'ASCII Table', desc: 'ASCII reference: decimal, hex, octal, binary, character. Filter by anything.',
  rows: () => ['Dec  Hex  Oct  Binary    Char', ...Array.from({ length: 128 }, (_, i) => {
    const c = i < 32 ? CTRL[i] : i === 32 ? 'SPACE' : i === 127 ? 'DEL' : String.fromCharCode(i);
    return `${String(i).padEnd(4)} ${i.toString(16).toUpperCase().padStart(2, '0').padEnd(4)} ${i.toString(8).padStart(3, '0')}  ${i.toString(2).padStart(8, '0')} ${c}`;
  })],
});

const GC = { Lu: 'Uppercase Letter', Ll: 'Lowercase Letter', Lt: 'Titlecase Letter', Lm: 'Modifier Letter', Lo: 'Other Letter', Mn: 'Nonspacing Mark', Mc: 'Spacing Mark', Me: 'Enclosing Mark', Nd: 'Decimal Number', Nl: 'Letter Number', No: 'Other Number', Pc: 'Connector Punctuation', Pd: 'Dash Punctuation', Ps: 'Open Punctuation', Pe: 'Close Punctuation', Pi: 'Initial Punctuation', Pf: 'Final Punctuation', Po: 'Other Punctuation', Sm: 'Math Symbol', Sc: 'Currency Symbol', Sk: 'Modifier Symbol', So: 'Other Symbol', Zs: 'Space Separator', Zl: 'Line Separator', Zp: 'Paragraph Separator', Cc: 'Control', Cf: 'Format', Co: 'Private Use', Cs: 'Surrogate', Cn: 'Unassigned' };
const SCRIPTS = ['Latin', 'Greek', 'Cyrillic', 'Armenian', 'Hebrew', 'Arabic', 'Devanagari', 'Bengali', 'Thai', 'Georgian', 'Hangul', 'Hiragana', 'Katakana', 'Han', 'Common', 'Inherited'];
T.push({
  id: 'char-info', cat: 'Encoding', title: 'Unicode Character Inspector', desc: 'Code point, category, script, encodings and escapes for each character.',
  labels: ['Text (first 100 characters)'], sample: 'aÉ€世😀',
  run: ([s]) => [...s].slice(0, 100).map((ch) => {
    const cp = ch.codePointAt(0), H = cp.toString(16).toUpperCase();
    const cat = Object.keys(GC).find((c) => new RegExp(`^\\p{${c}}$`, 'u').test(ch)) || 'Cn';
    const sc = SCRIPTS.find((x) => new RegExp(`^\\p{Script=${x}}$`, 'u').test(ch)) || 'other';
    return [`Character: ${/\p{C}|\p{Z}/u.test(ch) ? '(non-printing)' : ch}`, `Code point: U+${H.padStart(4, '0')} (decimal ${cp})`, `Category: ${cat} (${GC[cat]})`, `Script: ${sc}`,
      `UTF-8: ${hex(enc.encode(ch)).toUpperCase().replace(/../g, '$& ').trim()}`, `UTF-16: ${[...Array(ch.length)].map((_, i) => ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')).join(' ')}`,
      `HTML: &#${cp}; / &#x${H};`, `JS: \\u{${H}}`, `CSS: \\${H} `, `Emoji: ${/\p{Extended_Pictographic}/u.test(ch) ? 'yes' : 'no'}`].join('\n');
  }).join('\n\n') || 'Enter some text.',
});

const pipe = async (u, s) => new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(s)).arrayBuffer());
const FMT = { id: 'format', label: 'Format', type: 'select', choices: ['gzip', 'deflate', 'deflate-raw'], def: 'gzip' };
T.push({
  id: 'gzip-compress', cat: 'Encoding', title: 'Gzip Compress (Base64)', desc: 'Compress text with gzip/deflate and output Base64.',
  labels: ['Text'], sample: 'Hello Hello Hello Hello Hello Hello Hello Hello!', opts: [FMT],
  run: async ([s], o) => { const u = enc.encode(s), c = await pipe(u, new CompressionStream(o.format)); return b64e(c); },
});
T.push({
  id: 'gzip-decompress', cat: 'Encoding', title: 'Gzip Decompress (Base64)', desc: 'Decode Base64 and decompress gzip/deflate data to text.',
  labels: ['Base64 of compressed data'], sample: 'H4sIAAAAAAAAA/NIzcnJV/AgllQEAMIpBoowAAAA', opts: [FMT],
  run: async ([s], o) => { let u; try { u = await pipe(b64d(s), new DecompressionStream(o.format)); } catch (e) { if (/Base64/.test(e.message)) throw e; throw new Error('Not valid ' + o.format + ' data (check the format option)'); } return utf8(u); },
});

T.push({
  id: 'string-length-bytes', cat: 'Encoding', title: 'String Length & Byte Size', desc: 'Characters, code points, graphemes, words, lines and byte sizes in UTF-8/16/32.',
  labels: ['Text'], sample: 'Héllo 👨‍👩‍👧 wörld\nsecond line',
  run: ([s]) => {
    const g = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter().segment(s)].length : [...s].length, cp = [...s].length;
    return [`Characters (UTF-16 units): ${s.length}`, `Code points: ${cp}`, `Graphemes (user-perceived): ${g}`, `UTF-8 bytes: ${enc.encode(s).length}`, `UTF-16 bytes: ${s.length * 2}`, `UTF-32 bytes: ${cp * 4}`,
      `Words: ${(s.match(/\S+/g) || []).length}`, `Lines: ${s ? s.split(/\r?\n/).length : 0}`].join('\n');
  },
});

// ---------------------------------------------------------------- Hashing & JWT
function md5(bytes) {
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const n = bytes.length, len = Math.floor((n + 8) / 64) * 64 + 64;
  const buf = new Uint8Array(len); buf.set(bytes); buf[n] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(len - 8, (n * 8) % 2 ** 32, true); dv.setUint32(len - 4, Math.floor(n / 2 ** 29), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < len; off += 64) {
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + dv.getUint32(off + g * 4, true)) >>> 0;
      A = D; D = C; C = B;
      const s = S[(i >> 4) * 4 + (i & 3)];
      B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16), o = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((v, i) => o.setUint32(i * 4, v, true));
  return out;
}
const ALGS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
const digest = async (alg, u) => (alg === 'MD5' ? md5(u) : new Uint8Array(await crypto.subtle.digest(alg, u)));
async function hmac(alg, key, msg) {
  const bs = /384|512/.test(alg) ? 128 : 64;
  if (key.length > bs) key = await digest(alg, key);
  const k = new Uint8Array(bs); k.set(key);
  const inner = await digest(alg, cat(k.map((b) => b ^ 0x36), msg));
  return digest(alg, cat(k.map((b) => b ^ 0x5c), inner));
}
T.push({
  id: 'hash-generator', cat: 'Hashing & JWT', title: 'Hash Generator', desc: 'MD5, SHA-1, SHA-256, SHA-384 and SHA-512 of your text, all at once.',
  labels: ['Text'], sample: 'abc',
  opts: [{ id: 'upper', label: 'Uppercase hex', type: 'checkbox', def: false }],
  run: async ([s], o) => {
    const u = enc.encode(s);
    const r = await Promise.all(ALGS.map(async (a) => `${a.padEnd(8)} ${hex(await digest(a, u))}`));
    return o.upper ? r.join('\n').replace(/ ([0-9a-f]+)/g, (m) => m.toUpperCase()) : r.join('\n');
  },
});
T.push({
  id: 'file-hash', cat: 'Hashing & JWT', title: 'File Hash', desc: 'MD5, SHA-1, SHA-256, SHA-384, SHA-512 of a file, computed locally.',
  inputs: 0, dom: true, file: { accept: '*/*' },
  run: async (_, o, [f]) => {
    const u = new Uint8Array(await f.arrayBuffer());
    const r = await Promise.all(ALGS.map(async (a) => `${a.padEnd(8)} ${hex(await digest(a, u))}`));
    return `${f.name} (${f.size} bytes)\n${r.join('\n')}`;
  },
});
T.push({
  id: 'hash-compare', cat: 'Hashing & JWT', title: 'Hash Compare', desc: 'Compare two hashes (case/whitespace-insensitive) and guess the algorithm from length.',
  inputs: 2, labels: ['Hash A', 'Hash B'], sample: 'BA7816BF 8F01CFEA 414140DE 5DAE2223 B00361A3 96177A9C B410FF61 F20015AD', sample2: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  run: ([a, b]) => {
    const n = (x) => x.replace(/^(0x|sha\d*[:=]\s*)/i, '').replace(/[\s:-]/g, '').toLowerCase();
    const [x, y] = [n(a), n(b)];
    if (!x || !y) throw new Error('Enter both hashes');
    let d = x.length ^ y.length;
    for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
    const guess = { 32: 'MD5', 40: 'SHA-1', 64: 'SHA-256', 96: 'SHA-384', 128: 'SHA-512' }[x.length] || 'unknown';
    return `${d === 0 ? 'MATCH: the hashes are identical.' : 'DIFFERENT: the hashes do not match.'}\nLength A: ${x.length} hex chars, B: ${y.length}\nLikely algorithm (A): ${guess}` + (d && x.length === y.length ? `\nDiffering positions: ${[...x].map((c, i) => (c === y[i] ? -1 : i)).filter((i) => i >= 0).length}` : '');
  },
});
T.push({
  id: 'hmac-generator', cat: 'Hashing & JWT', title: 'HMAC Generator', desc: 'HMAC with MD5, SHA-1, SHA-256, SHA-384 or SHA-512; hex and Base64 output.',
  inputs: 2, labels: ['Message', 'Secret key'], sample: 'The quick brown fox jumps over the lazy dog', sample2: 'key',
  opts: [{ id: 'alg', label: 'Algorithm', type: 'select', choices: ALGS, def: 'SHA-256' }],
  run: async ([m, k], o) => { const h = await hmac(o.alg, enc.encode(k), enc.encode(m)); return `Hex: ${hex(h)}\nBase64: ${b64e(h)}`; },
});

const jsonPart = (p, what) => { try { return JSON.parse(utf8(b64d(p))); } catch { throw new Error(`Invalid JWT ${what} (not Base64URL JSON)`); } };
const jwtParts = (t) => {
  const p = t.trim().replace(/^bearer\s+/i, '').split('.');
  if (p.length !== 3) throw new Error('A JWT has 3 dot-separated parts (header.payload.signature)');
  return p;
};
const rel = (d) => {
  const s = (d - Date.now()) / 1000, a = Math.abs(s);
  const [u, n] = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]].find(([, n]) => a >= n) || ['second', 1];
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(s / n), u);
};
const claimTimes = (pl) => ['exp', 'iat', 'nbf'].filter((k) => typeof pl?.[k] === 'number').map((k) => {
  const d = new Date(pl[k] * 1000);
  return `${k}: ${d.toISOString()} (${rel(d)})${k === 'exp' ? (d < Date.now() ? '  -> EXPIRED' : '  -> not expired') : ''}`;
});
T.push({
  id: 'jwt-decode', cat: 'Hashing & JWT', title: 'JWT Decoder', desc: 'Decode a JWT header and payload with human-readable exp/iat/nbf. Does not verify the signature.',
  labels: ['JWT'], sample: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  run: ([t]) => {
    const [h, p, sig] = jwtParts(t), pl = jsonPart(p, 'payload');
    const times = claimTimes(pl);
    return `WARNING: decoded only, the signature is NOT verified. Do not trust these claims without verification.\n\nHEADER\n${JSON.stringify(jsonPart(h, 'header'), null, 2)}\n\nPAYLOAD\n${JSON.stringify(pl, null, 2)}\n\n${times.length ? 'TIMESTAMPS\n' + times.join('\n') + '\n\n' : ''}SIGNATURE (base64url)\n${sig || '(empty: unsigned token)'}`;
  },
});
const HS = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' };
T.push({
  id: 'jwt-encode', cat: 'Hashing & JWT', title: 'JWT Encoder / Signer', desc: 'Create and sign a JWT with HS256, HS384 or HS512.',
  inputs: 2, labels: ['Payload (JSON)', 'Secret'], sample: '{"sub":"1234567890","name":"John Doe","iat":1516239022}', sample2: 'your-256-bit-secret',
  opts: [{ id: 'alg', label: 'Algorithm', type: 'select', choices: Object.keys(HS), def: 'HS256' }],
  run: async ([p, k], o) => {
    let pl; try { pl = JSON.parse(p); } catch { throw new Error('Payload is not valid JSON'); }
    const part = (x) => b64e(enc.encode(JSON.stringify(x)), true);
    const data = `${part({ alg: o.alg, typ: 'JWT' })}.${part(pl)}`;
    return `${data}.${b64e(await hmac(HS[o.alg], enc.encode(k), enc.encode(data)), true)}`;
  },
});
T.push({
  id: 'jwt-verify-hs', cat: 'Hashing & JWT', title: 'JWT Verifier (HS256/384/512)', desc: 'Verify a JWT signature with a shared secret and check exp/nbf.',
  inputs: 2, labels: ['JWT', 'Secret'], sample: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c', sample2: 'your-256-bit-secret',
  run: async ([t, k]) => {
    const [h, p, sig] = jwtParts(t), hd = jsonPart(h, 'header'), pl = jsonPart(p, 'payload');
    const hash = HS[hd.alg];
    if (!hash) throw new Error(`Algorithm "${hd.alg}" is not supported here (only HS256, HS384, HS512; "none" is never accepted)`);
    const want = b64e(await hmac(hash, enc.encode(k), enc.encode(`${h}.${p}`)), true), a = want, b = sig.replace(/=+$/, '');
    let d = a.length ^ b.length;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
    const now = Date.now() / 1000, notes = [];
    if (typeof pl.exp === 'number' && pl.exp < now) notes.push('exp: token is EXPIRED');
    if (typeof pl.nbf === 'number' && pl.nbf > now) notes.push('nbf: token is not valid yet');
    return `${d === 0 ? `VALID signature (${hd.alg})` : `INVALID signature: secret or token is wrong (${hd.alg})`}\n${notes.join('\n') || (d === 0 ? 'No time-claim problems found.' : '')}\n\n${claimTimes(pl).join('\n')}`.trim();
  },
});

// CRC-32 / Adler-32
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (u) => { let c = 0xffffffff; for (const b of u) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const adler32 = (u) => { let a = 1, b = 0; for (const x of u) { a = (a + x) % 65521; b = (b + a) % 65521; } return ((b << 16) | a) >>> 0; };
T.push({
  id: 'checksum-crc32-adler32', cat: 'Hashing & JWT', title: 'CRC32 & Adler-32 Checksum', desc: 'CRC-32 (IEEE) and Adler-32 checksums of your text (UTF-8).',
  labels: ['Text'], sample: '123456789',
  run: ([s]) => { const u = enc.encode(s), c = crc32(u), a = adler32(u); return `CRC-32:   ${c.toString(16).padStart(8, '0')}  (${c})\nAdler-32: ${a.toString(16).padStart(8, '0')}  (${a})`; },
});

// X.509 viewer (hand-written DER parser)
const OID = {
  '2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.5': 'serialNumber', '2.5.4.9': 'street', '1.2.840.113549.1.9.1': 'emailAddress', '0.9.2342.19200300.100.1.25': 'DC',
  '1.2.840.113549.1.1.1': 'RSA', '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption', '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption', '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption', '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption', '1.2.840.113549.1.1.10': 'RSASSA-PSS',
  '1.2.840.10045.2.1': 'EC', '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256', '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384', '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512', '1.3.101.112': 'Ed25519', '1.3.101.113': 'Ed448',
  '1.2.840.10045.3.1.7': 'prime256v1 (P-256)', '1.3.132.0.34': 'secp384r1 (P-384)', '1.3.132.0.35': 'secp521r1 (P-521)',
  '1.3.6.1.5.5.7.3.1': 'serverAuth', '1.3.6.1.5.5.7.3.2': 'clientAuth', '1.3.6.1.5.5.7.3.3': 'codeSigning', '1.3.6.1.5.5.7.3.4': 'emailProtection', '1.3.6.1.5.5.7.3.8': 'timeStamping', '1.3.6.1.5.5.7.3.9': 'OCSPSigning',
};
const KU = ['digitalSignature', 'nonRepudiation', 'keyEncipherment', 'dataEncipherment', 'keyAgreement', 'keyCertSign', 'cRLSign', 'encipherOnly', 'decipherOnly'];
function parseCert(b) {
  const tlv = (p) => {
    let l = b[p + 1], q = p + 2;
    if (l & 0x80) { const n = l & 0x7f; l = 0; for (let i = 0; i < n; i++) l = l * 256 + b[q++]; }
    if (q + l > b.length) throw new Error('Truncated or invalid DER data');
    return { tag: b[p], s: q, e: q + l };
  };
  const kids = (n) => { const r = []; for (let p = n.s; p < n.e;) { const k = tlv(p); r.push(k); p = k.e; } return r; };
  const raw = (n) => b.subarray(n.s, n.e);
  const oid = (n) => {
    const v = raw(n), r = [Math.floor(v[0] / 40), v[0] % 40]; let x = 0;
    for (const c of v.subarray(1)) { x = x * 128 + (c & 127); if (!(c & 128)) { r.push(x); x = 0; } }
    return r.join('.');
  };
  const on = (n) => { const o = oid(n); return OID[o] || o; };
  const str = (n) => (n.tag === 0x1e ? [...raw(n)].reduce((s, c, i, a) => (i % 2 ? s : s + String.fromCharCode((c << 8) | a[i + 1])), '') : new TextDecoder().decode(raw(n)));
  const name = (n) => kids(n).flatMap((set) => kids(set).map((a) => { const [o, v] = kids(a); return `${on(o)}=${str(v)}`; })).join(', ');
  const time = (n) => {
    const m = str(n).match(/^(\d{2}|\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/);
    if (!m) throw new Error('Unsupported time format');
    const y = m[1].length === 2 ? +m[1] + (+m[1] >= 50 ? 1900 : 2000) : +m[1];
    return new Date(Date.UTC(y, m[2] - 1, m[3], m[4], m[5], m[6] || 0));
  };
  const colon = (u) => hex(u).replace(/../g, '$&:').slice(0, -1).toUpperCase();
  const bitlen = (u) => { let i = 0; while (u[i] === 0) i++; return u.length === i ? 0 : (u.length - i - 1) * 8 + (32 - Math.clz32(u[i])); };
  const cert = tlv(0);
  if (cert.tag !== 0x30) throw new Error('Not a DER certificate (expected SEQUENCE)');
  const tbs = kids(cert)[0];
  let f = kids(tbs), i = 0, version = 1;
  if (f[0].tag === 0xa0) { version = raw(kids(f[0])[0])[0] + 1; i = 1; }
  const [serial, sigAlg, issuer, validity, subject, spki] = f.slice(i, i + 6);
  const r = { version, serial: colon(raw(serial)), sigAlg: on(kids(sigAlg)[0]), issuer: name(issuer), subject: name(subject), ext: [] };
  [r.notBefore, r.notAfter] = kids(validity).map(time);
  const [ka, kbits] = kids(spki), [kalg, kparam] = kids(ka);
  r.keyAlg = on(kalg);
  const key = raw(kbits).subarray(1);
  if (r.keyAlg === 'RSA') { const [n, e] = kids(tlv(kbits.s + 1)); r.key = `RSA ${bitlen(raw(n))} bit, exponent ${parseInt(hex(raw(e)), 16)}`; }
  else if (r.keyAlg === 'EC') r.key = `EC ${kparam ? on(kparam) : '?'}, public point ${key.length} bytes`;
  else r.key = `${r.keyAlg}, ${key.length} bytes`;
  const ex = f.slice(i + 6).find((x) => x.tag === 0xa3);
  for (const e of ex ? kids(kids(ex)[0]) : []) {
    const p = kids(e), id = oid(p[0]), crit = p[1].tag === 0x01 && raw(p[1])[0] === 0xff, v = p[p.length - 1], body = tlv(v.s);
    let t;
    if (id === '2.5.29.17') {
      t = kids(body).map((g) => { const v = raw(g); return g.tag === 0x82 ? 'DNS:' + new TextDecoder().decode(v) : g.tag === 0x81 ? 'email:' + new TextDecoder().decode(v) : g.tag === 0x86 ? 'URI:' + new TextDecoder().decode(v)
        : g.tag === 0x87 ? 'IP:' + (v.length === 4 ? [...v].join('.') : [...Array(8)].map((_, k) => ((v[2 * k] << 8) | v[2 * k + 1]).toString(16)).join(':')) : `other(0x${g.tag.toString(16)})`; }).join(', ');
      r.ext.push(['Subject Alt Names', t, crit]);
    } else if (id === '2.5.29.19') { const k = kids(body); r.ext.push(['Basic Constraints', `CA=${k[0]?.tag === 1 && raw(k[0])[0] === 0xff ? 'TRUE' : 'FALSE'}` + (k.find((x) => x.tag === 2) ? `, pathLen=${raw(k.find((x) => x.tag === 2))[0]}` : ''), crit]); }
    else if (id === '2.5.29.15') { const u = raw(body), bits = (u[1] << 8) | (u[2] || 0); r.ext.push(['Key Usage', KU.filter((_, k) => bits & (0x8000 >> k)).join(', '), crit]); }
    else if (id === '2.5.29.37') r.ext.push(['Extended Key Usage', kids(body).map(on).join(', '), crit]);
    else if (id === '2.5.29.14') r.ext.push(['Subject Key ID', colon(raw(body)), crit]);
    else if (id === '2.5.29.35') { const k = kids(body).find((x) => x.tag === 0x80); r.ext.push(['Authority Key ID', k ? colon(raw(k)) : '(none)', crit]); }
    else r.ext.push([OID[id] || id, `${raw(v).length} bytes`, crit]);
  }
  return r;
}
T.push({
  id: 'x509-viewer', cat: 'Hashing & JWT', title: 'X.509 Certificate Viewer', desc: 'Paste a PEM certificate: subject, issuer, validity, SANs, key info and fingerprints.',
  labels: ['PEM certificate'], placeholder: ['-----BEGIN CERTIFICATE-----\n...'],
  sample: `-----BEGIN CERTIFICATE-----
MIICMjCCAdegAwIBAgIUIYL8cKIGEYW5P2qxLaDDTBF/uQIwCgYIKoZIzj0EAwIw
OTELMAkGA1UEBhMCQkUxFDASBgNVBAoMC0V4YW1wbGUgT3JnMRQwEgYDVQQDDAtl
eGFtcGxlLmNvbTAeFw0yNjEwMjIxODAwMThaFw0zNjEwMTkxODAwMThaMDkxCzAJ
BgNVBAYTAkJFMRQwEgYDVQQKDAtFeGFtcGxlIE9yZzEUMBIGA1UEAwwLZXhhbXBs
ZS5jb20wWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATFym4/IJduEA/W3Sb0X7Ns
J6kypyfg0maPfgiccdZmKO6Mk5zi++ZJELFt8tMgSr6e+70oMlMr5Ej+Gvo47atu
o4G8MIG5MB0GA1UdDgQWBBRD4booirOuBb5cJ/PuBTPHwA1jPjAfBgNVHSMEGDAW
gBRD4booirOuBb5cJ/PuBTPHwA1jPjAPBgNVHRMBAf8EBTADAQH/MDoGA1UdEQQz
MDGCC2V4YW1wbGUuY29tgg0qLmV4YW1wbGUuY29thwTAAAIBgQ1hQGV4YW1wbGUu
Y29tMAsGA1UdDwQEAwIFoDAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIw
CgYIKoZIzj0EAwIDSQAwRgIhAJzUsBOGqDprFbaCZee4SlgyNVNXMiAZYFIGQv6K
0Ik7AiEAwAckzy6c2a0eTnjmsZlySyNfeXVPHnTMb9FOdLyS9Xo=
-----END CERTIFICATE-----`,
  run: async ([s]) => {
    const blocks = [...s.matchAll(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g)].map((m) => m[1]);
    if (!blocks.length && s.trim()) blocks.push(s);
    if (!blocks.length) throw new Error('Paste a PEM certificate');
    const outs = [];
    for (const bl of blocks) {
      const der = b64d(bl);
      let c; try { c = parseCert(der); } catch (e) { throw new Error('Could not parse certificate: ' + e.message); }
      const now = Date.now(), days = Math.round((c.notAfter - now) / 864e5);
      const status = now < c.notBefore ? 'NOT YET VALID' : now > c.notAfter ? `EXPIRED ${-days} days ago` : `valid, expires in ${days} days`;
      const fp = async (a) => hex(await digest(a, der)).toUpperCase().replace(/../g, '$&:').slice(0, -1);
      outs.push([`Subject: ${c.subject}`, `Issuer: ${c.issuer}${c.subject === c.issuer ? '  (self-signed)' : ''}`, `Version: ${c.version}`, `Serial: ${c.serial}`, `Signature algorithm: ${c.sigAlg}`,
        `Not before: ${c.notBefore.toISOString()}`, `Not after: ${c.notAfter.toISOString()}  (${status})`, `Public key: ${c.key}`,
        ...c.ext.map(([n, v, cr]) => `${n}${cr ? ' (critical)' : ''}: ${v}`), `SHA-256 fingerprint: ${await fp('SHA-256')}`, `SHA-1 fingerprint: ${await fp('SHA-1')}`].join('\n'));
    }
    return outs.join('\n\n----------------\n\n');
  },
});

// ---------------------------------------------------------------- Date & Time
const MONN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOWN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const tzOk = (tz) => { if (!tz) return undefined; try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { throw new Error(`Unknown time zone "${tz}" (use an IANA name like Europe/Brussels)`); } return tz; };
// Calendar fields of an instant in a zone (undefined = local).
function P(d, tz) {
  const o = {};
  for (const { type, value } of new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d)) o[type] = +value;
  o.dow = new Date(Date.UTC(o.year, o.month - 1, o.day)).getUTCDay();
  o.off = Math.round((Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - Math.floor(d / 1000) * 1000) / 60000);
  return o;
}
const offStr = (m, colon = true) => `${m < 0 ? '-' : '+'}${pad2(Math.floor(Math.abs(m) / 60))}${colon ? ':' : ''}${pad2(Math.abs(m) % 60)}`;
const ymd = (p) => `${String(p.year).padStart(4, '0')}-${pad2(p.month)}-${pad2(p.day)}`;
const hms = (p) => `${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
function toDate(s, unit = 'auto') {
  s = s.trim();
  let d;
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = +s;
    d = new Date(unit.startsWith('sec') ? n * 1000 : unit.startsWith('mil') ? n : Math.abs(n) < 1e11 ? n * 1000 : Math.abs(n) < 1e14 ? n : Math.abs(n) < 1e17 ? n / 1000 : n / 1e6);
  } else d = new Date(s);
  if (isNaN(d)) throw new Error(`Cannot parse "${s}" as a date or timestamp`);
  return d;
}
const UNIT = { id: 'unit', label: 'Numeric unit', type: 'select', choices: ['auto', 'seconds', 'milliseconds'], def: 'auto' };
const TZ = (def) => ({ id: 'tz', label: 'Time zone (IANA, empty = local)', type: 'text', def });
T.push({
  id: 'timestamp-converter', cat: 'Date & Time', title: 'Unix Timestamp Converter', desc: 'Unix seconds/ms to ISO, UTC, local and relative time, and date strings to timestamps.',
  labels: ['Timestamp(s) or date(s), one per line'], sample: '1700000000\n1700000000123\n2024-02-29T12:00:00Z', opts: [UNIT, TZ('UTC')],
  run: ([s], o) => {
    const tz = tzOk(o.tz.trim());
    return lines(s).map((l) => {
      const d = toDate(l, o.unit), p = P(d, tz);
      return [`Input: ${l}`, `Unix seconds: ${Math.floor(d / 1000)}`, `Unix milliseconds: ${d.getTime()}`, `ISO 8601: ${d.toISOString()}`, `UTC: ${d.toUTCString()}`,
        `${tz || 'Local'}: ${ymd(p)} ${hms(p)} (UTC${offStr(p.off)})`, `Relative: ${rel(d)}`].join('\n');
    }).join('\n\n');
  },
});
T.push({
  id: 'timezone-converter', cat: 'Date & Time', title: 'Time Zone Converter', desc: 'Convert a date/time from one IANA zone to several others, DST-aware.',
  labels: ['Date and time (YYYY-MM-DD HH:MM, empty = now)'], sample: '2024-03-15 09:30',
  opts: [{ id: 'from', label: 'From zone', type: 'text', def: 'America/New_York' }, { id: 'to', label: 'To zones (comma-separated)', type: 'text', def: 'UTC, Europe/Brussels, Asia/Tokyo, America/Los_Angeles, Australia/Sydney' }],
  run: ([s], o) => {
    const from = tzOk(o.from.trim()) || Intl.DateTimeFormat().resolvedOptions().timeZone;
    let d;
    s = s.trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!s) d = new Date();
    else if (m) {
      const t0 = Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
      const t1 = t0 - P(new Date(t0), from).off * 60000;
      d = new Date(t0 - P(new Date(t1), from).off * 60000);
    } else d = toDate(s);
    const zones = o.to.split(',').map((z) => z.trim()).filter(Boolean);
    return [from, ...zones].map((z, i) => {
      tzOk(z);
      const p = P(d, z), ab = new Intl.DateTimeFormat('en-US', { timeZone: z, timeZoneName: 'short' }).formatToParts(d).find((x) => x.type === 'timeZoneName').value;
      return `${i ? '' : '(source) '}${z.padEnd(i ? 22 : 13 + 9)} ${ymd(p)} ${hms(p)}  UTC${offStr(p.off)}  ${DOWN[p.dow].slice(0, 3)}  ${ab}`;
    }).join('\n') + `\n\nInstant (UTC): ${d.toISOString()}`;
  },
});

// Cron
const MONS = MONN.map((m) => m.slice(0, 3).toLowerCase()), DOWS = DOWN.map((m) => m.slice(0, 3).toLowerCase());
const ALIAS = { '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *' };
function cronField(raw, lo, hi, names, base, label) {
  raw = raw.toLowerCase().replace(/[a-z]+/g, (n) => { const i = names ? names.indexOf(n.slice(0, 3)) : -1; if (i < 0) throw new Error(`Unknown name "${n}" in ${label}`); return i + base; });
  const set = new Set();
  for (const part of raw.split(',')) {
    const [rng, st] = part.split('/'), step = st === undefined ? 1 : Number(st);
    if (!Number.isInteger(step) || step < 1 || !rng) throw new Error(`Invalid ${label} field "${raw}"`);
    let a, b;
    if (rng === '*' || rng === '?') [a, b] = [lo, hi];
    else if (/^\d+-\d+$/.test(rng)) [a, b] = rng.split('-').map(Number);
    else if (/^\d+$/.test(rng)) { a = +rng; b = st === undefined ? a : hi; }
    else throw new Error(`Invalid ${label} field "${raw}"`);
    if (a < lo || b > hi || a > b) throw new Error(`${label} value out of range ${lo}-${hi}: "${part}"`);
    for (let v = a; v <= b; v += step) set.add(label === 'day-of-week' ? v % 7 : v);
  }
  return { raw, set, star: /^[*?]$/.test(raw) };
}
function parseCron(expr) {
  expr = ALIAS[expr.trim().toLowerCase()] || expr.trim();
  const p = expr.split(/\s+/);
  if (p.length !== 5) throw new Error('A cron expression needs 5 fields: minute hour day-of-month month day-of-week');
  return { expr, min: cronField(p[0], 0, 59, null, 0, 'minute'), hour: cronField(p[1], 0, 23, null, 0, 'hour'), dom: cronField(p[2], 1, 31, null, 0, 'day-of-month'), mon: cronField(p[3], 1, 12, MONS, 1, 'month'), dow: cronField(p[4], 0, 7, DOWS, 0, 'day-of-week') };
}
const list = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a.at(-1) : a[0]);
const fieldText = (raw, unit, nm = String) => list(raw.split(',').map((p) => {
  const [r, s] = p.split('/');
  if (/^[*?]$/.test(r)) return s ? `every ${s} ${unit}s` : `every ${unit}`;
  const [a, b] = r.split('-');
  if (b !== undefined) return `${s ? `every ${s} ${unit}s from ` : ''}${nm(a)} through ${nm(b)}`;
  return s ? `every ${s} ${unit}s starting at ${nm(a)}` : nm(a);
}));
function explainCron(c) {
  const plain = (f) => f.raw.split(',').every((x) => /^\d+$/.test(x));
  let t;
  if (c.min.raw === '*' && c.hour.raw === '*') t = 'Every minute';
  else if (plain(c.min) && plain(c.hour) && c.min.set.size * c.hour.set.size <= 8)
    t = 'At ' + list([...c.hour.set].flatMap((h) => [...c.min.set].map((m) => `${pad2(h)}:${pad2(m)}`)));
  else {
    const mt = c.min.raw === '*' ? 'every minute' : fieldText(c.min.raw, 'minute'), ht = fieldText(c.hour.raw, 'hour');
    t = (/^every/.test(mt) ? mt : 'at minute ' + mt) + (c.hour.raw === '*' ? '' : ', ' + (/^every/.test(ht) ? ht : 'during hour ' + ht));
    t = t[0].toUpperCase() + t.slice(1);
  }
  const dm = c.dom.star ? '' : 'on day-of-month ' + fieldText(c.dom.raw, 'day'), dw = c.dow.star ? '' : 'on ' + fieldText(c.dow.raw.replace(/7/g, '0'), 'day', (x) => DOWN[x % 7]);
  const mo = c.mon.star ? '' : 'in ' + fieldText(c.mon.raw, 'month', (x) => MONN[x - 1]);
  return [t, dm && dw ? `${dm} or ${dw} (either matches)` : dm || dw, mo].filter(Boolean).join(', ');
}
function nextRuns(c, utc, n = 10) {
  const mk = utc ? (...a) => new Date(Date.UTC(...a)) : (...a) => new Date(...a);
  const now = new Date(), start = new Date(Math.floor(now / 60000) * 60000 + 60000);
  const [y0, m0, d0] = utc ? [start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()] : [start.getFullYear(), start.getMonth(), start.getDate()];
  const hs = [...c.hour.set].sort((a, b) => a - b), ms = [...c.min.set].sort((a, b) => a - b), out = [];
  for (let i = 0; i < 366 * 8 && out.length < n; i++) {
    const day = mk(y0, m0, d0 + i), [y, mo, d, w] = utc ? [day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), day.getUTCDay()] : [day.getFullYear(), day.getMonth(), day.getDate(), day.getDay()];
    if (!c.mon.set.has(mo + 1)) continue;
    const a = c.dom.set.has(d), b = c.dow.set.has(w);
    if (!(c.dom.star && c.dow.star ? true : c.dom.star ? b : c.dow.star ? a : a || b)) continue;
    for (const h of hs) for (const m of ms) { const t = mk(y, mo, d, h, m); if (t >= start && out.length < n) out.push(t); }
  }
  return out;
}
const fmtRun = (d, utc) => { const p = P(d, utc ? 'UTC' : undefined); return `${ymd(p)} ${pad2(p.hour)}:${pad2(p.minute)} ${DOWN[p.dow].slice(0, 3)}`; };
T.push({
  id: 'cron-explainer', cat: 'Date & Time', title: 'Cron Expression Explainer', desc: 'Explain a 5-field cron expression in English and list the next 10 run times.',
  labels: ['Cron expression (5 fields or @daily etc.)'], sample: '*/15 9-17 * * mon-fri',
  opts: [{ id: 'zone', label: 'Show run times in', type: 'select', choices: ['UTC', 'local'], def: 'UTC' }],
  run: ([s], o) => {
    const c = parseCron(s), utc = o.zone === 'UTC', runs = nextRuns(c, utc);
    return `Expression: ${c.expr}\nMeaning: ${explainCron(c)}\n\nFields: minute=${c.min.raw}  hour=${c.hour.raw}  day-of-month=${c.dom.raw}  month=${c.mon.raw}  day-of-week=${c.dow.raw}\n\nNext ${runs.length} runs (${utc ? 'UTC' : 'local time'}):\n${runs.map((d, i) => `${String(i + 1).padStart(2)}. ${fmtRun(d, utc)}`).join('\n') || 'No run found in the next 8 years.'}`;
  },
});
const rangeN = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
T.push({
  id: 'cron-generator', cat: 'Date & Time', title: 'Cron Expression Generator', desc: 'Build a cron expression from dropdowns and see what it means.',
  inputs: 0, sample: '',
  opts: [
    { id: 'freq', label: 'Run', type: 'select', choices: ['every minute', 'every N minutes', 'every N hours', 'daily', 'monthly', 'yearly'], def: 'daily' },
    { id: 'n', label: 'N', type: 'select', choices: ['2', '3', '5', '10', '15', '20', '30', '4', '6', '8', '12'], def: '15' },
    { id: 'minute', label: 'At minute', type: 'select', choices: rangeN(0, 59), def: '0' },
    { id: 'hour', label: 'At hour', type: 'select', choices: rangeN(0, 23), def: '9' },
    { id: 'wd', label: 'Weekdays', type: 'select', choices: ['every day', 'Monday-Friday', 'Saturday-Sunday', ...DOWN], def: 'every day' },
    { id: 'dom', label: 'Day of month', type: 'select', choices: rangeN(1, 31), def: '1' },
    { id: 'month', label: 'Month (yearly)', type: 'select', choices: MONN, def: 'January' },
  ],
  run: (_, o) => {
    const wd = o.wd === 'every day' ? '*' : o.wd === 'Monday-Friday' ? '1-5' : o.wd === 'Saturday-Sunday' ? '6,0' : String(DOWN.indexOf(o.wd));
    const e = { 'every minute': '* * * * *', 'every N minutes': `*/${o.n} * * * ${wd}`, 'every N hours': `${o.minute} */${o.n} * * ${wd}`, daily: `${o.minute} ${o.hour} * * ${wd}`, monthly: `${o.minute} ${o.hour} ${o.dom} * *`, yearly: `${o.minute} ${o.hour} ${o.dom} ${MONN.indexOf(o.month) + 1} *` }[o.freq];
    const c = parseCron(e);
    return `${e}\n\nMeaning: ${explainCron(c)}\n\nNext 3 runs (UTC):\n${nextRuns(c, true, 3).map((d) => fmtRun(d, true)).join('\n')}`;
  },
});

const isoWeek = (p) => { const d = new Date(Date.UTC(p.year, p.month - 1, p.day)), dn = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - dn); const y = d.getUTCFullYear(); return [y, Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7), dn]; };
T.push({
  id: 'date-formats', cat: 'Date & Time', title: 'Date Format Converter', desc: 'Show one date in many formats: ISO 8601, RFC 2822, SQL, US/EU, week dates, Julian day and more.',
  labels: ['Date or timestamp (empty = now)'], sample: '2024-03-15T09:30:45Z', opts: [UNIT, TZ('UTC')],
  run: ([s], o) => {
    const tz = tzOk(o.tz.trim()), d = s.trim() ? toDate(s, o.unit) : new Date(), p = P(d, tz), [wy, ww, wd] = isoWeek(p);
    const doy = Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(p.year, 0, 1)) / 864e5) + 1, h12 = p.hour % 12 || 12, ap = p.hour < 12 ? 'AM' : 'PM';
    const L = (loc, opt) => new Intl.DateTimeFormat(loc, { timeZone: tz, ...opt }).format(d);
    const rows = [
      ['ISO 8601 (UTC)', d.toISOString()], ['ISO 8601 (zone offset)', `${ymd(p)}T${hms(p)}${offStr(p.off)}`], ['ISO basic', d.toISOString().replace(/[-:]|\.\d+/g, '')],
      ['RFC 2822', `${DOWN[p.dow].slice(0, 3)}, ${pad2(p.day)} ${MONN[p.month - 1].slice(0, 3)} ${p.year} ${hms(p)} ${offStr(p.off, false)}`], ['HTTP / RFC 7231', d.toUTCString()],
      ['Cookie Expires', `${DOWN[d.getUTCDay()].slice(0, 3)}, ${pad2(d.getUTCDate())}-${MONN[d.getUTCMonth()].slice(0, 3)}-${d.getUTCFullYear()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())} GMT`],
      ['SQL datetime', `${ymd(p)} ${hms(p)}`], ['Date only', ymd(p)], ['Time only', hms(p)],
      ['US', `${pad2(p.month)}/${pad2(p.day)}/${p.year} ${pad2(h12)}:${pad2(p.minute)} ${ap}`], ['European', `${pad2(p.day)}/${pad2(p.month)}/${p.year} ${pad2(p.hour)}:${pad2(p.minute)}`], ['German', `${pad2(p.day)}.${pad2(p.month)}.${p.year}`],
      ['Long (en-US)', L('en-US', { dateStyle: 'full', timeStyle: 'long' })], ['Long (en-GB)', L('en-GB', { dateStyle: 'full', timeStyle: 'long' })], ['Long (fr-FR)', L('fr-FR', { dateStyle: 'full', timeStyle: 'short' })], ['Long (ja-JP)', L('ja-JP', { dateStyle: 'full', timeStyle: 'short' })],
      ['ISO week date', `${wy}-W${pad2(ww)}-${wd}`], ['Ordinal date', `${p.year}-${String(doy).padStart(3, '0')}`], ['Day of year / quarter', `${doy} / Q${Math.ceil(p.month / 3)}`],
      ['Unix seconds', Math.floor(d / 1000)], ['Unix milliseconds', d.getTime()], ['Julian day', (d / 864e5 + 2440587.5).toFixed(5)], ['Excel serial (1900)', (d / 864e5 + 25569).toFixed(5)], ['Relative', rel(d)],
    ];
    return `Zone: ${tz || 'local'} (UTC${offStr(p.off)})\n\n` + rows.map(([k, v]) => `${k.padEnd(24)} ${v}`).join('\n');
  },
});
T.push({
  id: 'epoch-batch', cat: 'Date & Time', title: 'Batch Epoch Converter', desc: 'Convert many timestamps to ISO dates (or dates to timestamps), one per line.',
  labels: ['Timestamps or dates, one per line'], sample: '1700000000\n1700086400000\n2024-01-01T00:00:00Z\n2030-06-15', opts: [UNIT, { id: 'ms', label: 'Dates to milliseconds', type: 'checkbox', def: false }],
  run: ([s], o) => lines(s).map((l) => {
    try { const d = toDate(l, o.unit); return `${l}  ->  ${/^-?\d+(\.\d+)?$/.test(l) ? d.toISOString() : o.ms ? d.getTime() : Math.floor(d / 1000)}`; } catch (e) { return `${l}  ->  ERROR: ${e.message}`; }
  }).join('\n'),
});

// ---------------------------------------------------------------- Network & HTTP
refTool({
  id: 'http-status-reference', cat: 'Network & HTTP', title: 'HTTP Status Codes', desc: 'Searchable reference of HTTP status codes and what they mean.',
  rows: `100 Continue - Client should continue sending the request body.
101 Switching Protocols - Server is switching protocols (e.g. WebSocket upgrade).
102 Processing - WebDAV: request accepted but not yet complete.
103 Early Hints - Preload hints sent before the final response.
200 OK - Request succeeded.
201 Created - Resource was created (usually returned by POST/PUT).
202 Accepted - Accepted for processing, not completed yet.
203 Non-Authoritative Information - Response modified by a transforming proxy.
204 No Content - Success with no response body.
205 Reset Content - Client should reset the document view.
206 Partial Content - Range request fulfilled.
207 Multi-Status - WebDAV: multiple status codes in one response.
208 Already Reported - WebDAV: members already listed earlier.
226 IM Used - Delta encoding applied to the response.
300 Multiple Choices - Several representations are available.
301 Moved Permanently - Resource has a new permanent URL; cached by clients and search engines.
302 Found - Temporary redirect (method may change to GET).
303 See Other - Redirect to another URL using GET.
304 Not Modified - Cached version is still valid (conditional request).
307 Temporary Redirect - Temporary redirect keeping the request method.
308 Permanent Redirect - Permanent redirect keeping the request method.
400 Bad Request - Malformed syntax or invalid request.
401 Unauthorized - Authentication required or failed.
402 Payment Required - Reserved; sometimes used for paywalls/quota.
403 Forbidden - Authenticated but not allowed.
404 Not Found - Resource does not exist (or is hidden).
405 Method Not Allowed - Method not supported for this resource; see Allow header.
406 Not Acceptable - Cannot produce a response matching Accept headers.
407 Proxy Authentication Required - Authenticate with the proxy first.
408 Request Timeout - Server timed out waiting for the request.
409 Conflict - Conflicts with current resource state (e.g. edit conflict).
410 Gone - Permanently removed, no forwarding address.
411 Length Required - Content-Length header is required.
412 Precondition Failed - If-Match / If-Unmodified-Since condition failed.
413 Content Too Large - Request body exceeds server limits (Payload Too Large).
414 URI Too Long - Request URL is too long.
415 Unsupported Media Type - Content-Type not supported.
416 Range Not Satisfiable - Requested range is outside the resource.
417 Expectation Failed - Expect header could not be met.
418 I'm a teapot - April Fools' joke (RFC 2324); sometimes used to reject bots.
421 Misdirected Request - Request sent to a server that cannot answer it.
422 Unprocessable Content - Syntax is valid but semantically wrong (validation errors).
423 Locked - WebDAV: resource is locked.
424 Failed Dependency - WebDAV: a previous request failed.
425 Too Early - Server unwilling to risk replayed request.
426 Upgrade Required - Switch to another protocol (see Upgrade header).
428 Precondition Required - Conditional request is required.
429 Too Many Requests - Rate limited; see Retry-After.
431 Request Header Fields Too Large - Headers too big.
451 Unavailable For Legal Reasons - Blocked for legal reasons.
500 Internal Server Error - Generic server failure.
501 Not Implemented - Server does not support the functionality.
502 Bad Gateway - Invalid response from an upstream server.
503 Service Unavailable - Overloaded or down for maintenance; may send Retry-After.
504 Gateway Timeout - Upstream server did not respond in time.
505 HTTP Version Not Supported - HTTP version not supported.
506 Variant Also Negotiates - Content negotiation misconfiguration.
507 Insufficient Storage - WebDAV: server cannot store the representation.
508 Loop Detected - WebDAV: infinite loop detected.
510 Not Extended - Further extensions required.
511 Network Authentication Required - Captive portal login needed.`.split('\n'),
});
refTool({
  id: 'http-methods-headers', cat: 'Network & HTTP', title: 'HTTP Methods & Headers', desc: 'Reference for HTTP methods (safe/idempotent) and common request/response headers.',
  rows: `METHOD GET - Retrieve a resource. Safe, idempotent, cacheable. No body.
METHOD HEAD - Like GET but headers only. Safe, idempotent.
METHOD POST - Submit data / create / trigger processing. Not safe, not idempotent.
METHOD PUT - Replace a resource entirely. Idempotent.
METHOD PATCH - Partially modify a resource. Not necessarily idempotent.
METHOD DELETE - Remove a resource. Idempotent.
METHOD OPTIONS - Describe communication options; used by CORS preflight. Safe.
METHOD TRACE - Echo the request for diagnostics. Safe; usually disabled.
METHOD CONNECT - Open a tunnel (e.g. HTTPS through a proxy).
HEADER Accept (request) - Media types the client can handle, e.g. application/json.
HEADER Accept-Encoding (request) - Compression the client supports: gzip, br, zstd.
HEADER Accept-Language (request) - Preferred languages, e.g. en-US,en;q=0.9.
HEADER Authorization (request) - Credentials, e.g. Bearer <token> or Basic <base64>.
HEADER Cache-Control (both) - Caching directives: no-store, no-cache, max-age=3600, public, private, immutable.
HEADER Connection (both) - keep-alive or close.
HEADER Content-Disposition (response) - inline or attachment; filename="x.pdf".
HEADER Content-Encoding (response) - Compression applied to the body: gzip, br.
HEADER Content-Length (both) - Body size in bytes.
HEADER Content-Security-Policy (response) - Restricts allowed content sources (XSS mitigation).
HEADER Content-Type (both) - Media type of the body, e.g. application/json; charset=utf-8.
HEADER Cookie (request) - Cookies previously set by the server.
HEADER Cross-Origin-Opener-Policy (response) - Isolates browsing context group.
HEADER ETag (response) - Opaque version identifier for validation.
HEADER Expires (response) - Date after which the response is stale.
HEADER Host (request) - Target host and port; required in HTTP/1.1.
HEADER If-Modified-Since (request) - Conditional GET by date.
HEADER If-None-Match (request) - Conditional GET by ETag; answered with 304.
HEADER Last-Modified (response) - When the resource last changed.
HEADER Location (response) - Redirect target or new resource URL.
HEADER Origin (request) - Origin that initiated a cross-site request (CORS).
HEADER Access-Control-Allow-Origin (response) - CORS: origin(s) allowed to read the response.
HEADER Access-Control-Allow-Methods (response) - CORS: allowed methods in preflight.
HEADER Access-Control-Allow-Headers (response) - CORS: allowed request headers.
HEADER Access-Control-Allow-Credentials (response) - CORS: allow cookies/credentials.
HEADER Permissions-Policy (response) - Enable/disable browser features.
HEADER Range (request) - Request part of a resource, e.g. bytes=0-1023.
HEADER Referer (request) - URL of the previous page (sic).
HEADER Referrer-Policy (response) - Controls how much Referer is sent.
HEADER Retry-After (response) - Seconds or date to wait before retrying (429/503).
HEADER Server (response) - Server software identification.
HEADER Set-Cookie (response) - Set a cookie: HttpOnly; Secure; SameSite=Lax; Max-Age.
HEADER Strict-Transport-Security (response) - HSTS: force HTTPS, e.g. max-age=31536000; includeSubDomains.
HEADER Transfer-Encoding (response) - e.g. chunked.
HEADER User-Agent (request) - Client software identification.
HEADER Vary (response) - Request headers that affect the cached response.
HEADER WWW-Authenticate (response) - Authentication scheme required (with 401).
HEADER X-Content-Type-Options (response) - nosniff: disable MIME sniffing.
HEADER X-Forwarded-For (request) - Original client IP through proxies.
HEADER X-Frame-Options (response) - DENY or SAMEORIGIN: clickjacking protection.`.split('\n'),
});
refTool({
  id: 'mime-type-lookup', cat: 'Network & HTTP', title: 'MIME Type Lookup', desc: 'Find the MIME type for a file extension, or the extension for a MIME type.',
  rows: `.html .htm | text/html | HTML document
.css | text/css | Stylesheet
.js .mjs | text/javascript | JavaScript
.json | application/json | JSON
.xml | application/xml | XML
.txt | text/plain | Plain text
.csv | text/csv | Comma-separated values
.md | text/markdown | Markdown
.ics | text/calendar | iCalendar
.rtf | application/rtf | Rich text
.pdf | application/pdf | PDF document
.zip | application/zip | ZIP archive
.gz | application/gzip | Gzip archive
.tar | application/x-tar | Tar archive
.7z | application/x-7z-compressed | 7-Zip archive
.rar | application/vnd.rar | RAR archive
.bz2 | application/x-bzip2 | Bzip2 archive
.wasm | application/wasm | WebAssembly
.bin | application/octet-stream | Arbitrary binary data
.exe | application/vnd.microsoft.portable-executable | Windows executable
.jar | application/java-archive | Java archive
.sh | application/x-sh | Shell script
.php | application/x-httpd-php | PHP script
.yaml .yml | application/yaml | YAML
.toml | application/toml | TOML
.graphql | application/graphql | GraphQL
.sql | application/sql | SQL
.webmanifest | application/manifest+json | Web app manifest
.rss | application/rss+xml | RSS feed
.atom | application/atom+xml | Atom feed
.png | image/png | PNG image
.jpg .jpeg | image/jpeg | JPEG image
.gif | image/gif | GIF image
.webp | image/webp | WebP image
.avif | image/avif | AVIF image
.svg | image/svg+xml | SVG vector image
.ico | image/vnd.microsoft.icon | Icon
.bmp | image/bmp | Bitmap
.tif .tiff | image/tiff | TIFF image
.heic | image/heic | HEIC image
.mp3 | audio/mpeg | MP3 audio
.wav | audio/wav | WAV audio
.ogg .oga | audio/ogg | Ogg audio
.opus | audio/opus | Opus audio
.flac | audio/flac | FLAC audio
.aac | audio/aac | AAC audio
.m4a | audio/mp4 | MPEG-4 audio
.mid .midi | audio/midi | MIDI
.mp4 | video/mp4 | MP4 video
.webm | video/webm | WebM video
.ogv | video/ogg | Ogg video
.mov | video/quicktime | QuickTime video
.avi | video/x-msvideo | AVI video
.mkv | video/x-matroska | Matroska video
.mpeg | video/mpeg | MPEG video
.woff | font/woff | Web font
.woff2 | font/woff2 | Web font 2
.ttf | font/ttf | TrueType font
.otf | font/otf | OpenType font
.eot | application/vnd.ms-fontobject | Embedded OpenType font
.doc | application/msword | Word (legacy)
.docx | application/vnd.openxmlformats-officedocument.wordprocessingml.document | Word document
.xls | application/vnd.ms-excel | Excel (legacy)
.xlsx | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | Excel workbook
.ppt | application/vnd.ms-powerpoint | PowerPoint (legacy)
.pptx | application/vnd.openxmlformats-officedocument.presentationml.presentation | PowerPoint
.odt | application/vnd.oasis.opendocument.text | OpenDocument text
.ods | application/vnd.oasis.opendocument.spreadsheet | OpenDocument spreadsheet
.odp | application/vnd.oasis.opendocument.presentation | OpenDocument presentation
.epub | application/epub+zip | E-book
.apk | application/vnd.android.package-archive | Android package
.pem .crt .cer | application/x-x509-ca-cert | Certificate
.pem | application/x-pem-file | PEM file
.form | application/x-www-form-urlencoded | HTML form (urlencoded)
(multipart) | multipart/form-data | HTML form with files
(sse) | text/event-stream | Server-sent events
(ndjson) | application/x-ndjson | Newline-delimited JSON
(jsonld) .jsonld | application/ld+json | JSON-LD`.split('\n'),
});
refTool({
  id: 'port-reference', cat: 'Network & HTTP', title: 'Common Ports Reference', desc: 'Well-known TCP/UDP port numbers and their services.',
  rows: `20 TCP FTP data
21 TCP FTP control
22 TCP SSH / SFTP / SCP
23 TCP Telnet
25 TCP SMTP (mail relay)
53 TCP/UDP DNS
67 UDP DHCP server
68 UDP DHCP client
69 UDP TFTP
80 TCP HTTP
88 TCP/UDP Kerberos
110 TCP POP3
119 TCP NNTP
123 UDP NTP
135 TCP Microsoft RPC
137 UDP NetBIOS name service
139 TCP NetBIOS session
143 TCP IMAP
161 UDP SNMP
162 UDP SNMP traps
389 TCP/UDP LDAP
443 TCP/UDP HTTPS (HTTP/3 uses QUIC over UDP)
445 TCP SMB
465 TCP SMTPS (implicit TLS)
500 UDP IKE / IPsec
514 UDP Syslog
515 TCP LPD printing
587 TCP SMTP submission (STARTTLS)
631 TCP/UDP IPP / CUPS
636 TCP LDAPS
873 TCP rsync
993 TCP IMAPS
995 TCP POP3S
1080 TCP SOCKS proxy
1194 UDP OpenVPN
1433 TCP Microsoft SQL Server
1521 TCP Oracle Database
1723 TCP PPTP VPN
1883 TCP MQTT
2049 TCP/UDP NFS
2181 TCP Apache ZooKeeper
2375 TCP Docker daemon (unencrypted)
2376 TCP Docker daemon (TLS)
3000 TCP Common dev servers (Node, Rails, Grafana)
3128 TCP Squid proxy
3306 TCP MySQL / MariaDB
3389 TCP/UDP RDP
4222 TCP NATS
4369 TCP Erlang port mapper
5000 TCP Flask dev server / Docker registry
5060 TCP/UDP SIP
5432 TCP PostgreSQL
5671 TCP AMQPS
5672 TCP AMQP (RabbitMQ)
5900 TCP VNC
5984 TCP CouchDB
6379 TCP Redis
6443 TCP Kubernetes API server
8000 TCP Common HTTP alternate / dev
8080 TCP HTTP alternate / proxies
8443 TCP HTTPS alternate
8883 TCP MQTT over TLS
9000 TCP PHP-FPM / SonarQube / MinIO
9042 TCP Cassandra
9090 TCP Prometheus
9092 TCP Apache Kafka
9200 TCP Elasticsearch HTTP
9300 TCP Elasticsearch transport
10250 TCP Kubelet API
11211 TCP/UDP Memcached
15672 TCP RabbitMQ management
27017 TCP MongoDB
51820 UDP WireGuard`.split('\n'),
});

// IP helpers (BigInt-based, v4 and v6)
const p4 = (s) => { const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/); return !m || m.slice(1).some((x) => +x > 255) ? null : m.slice(1).reduce((a, x) => a * 256n + BigInt(x), 0n); };
const f4 = (n) => [24n, 16n, 8n, 0n].map((s) => (n >> s) & 255n).join('.');
function p6(s) {
  s = s.split('%')[0];
  const t = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (t) { const v = p4(t[1]); if (v == null) return null; s = s.slice(0, -t[1].length) + (v >> 16n).toString(16) + ':' + (v & 0xffffn).toString(16); }
  const d = s.split('::');
  if (d.length > 2) return null;
  const g = (x) => (x === '' ? [] : x.split(':'));
  let a = g(d[0]);
  if (d.length === 1) { if (a.length !== 8) return null; }
  else { const b = g(d[1]); if (a.length + b.length > 7) return null; a = [...a, ...Array(8 - a.length - b.length).fill('0'), ...b]; }
  let n = 0n;
  for (const x of a) { if (!/^[0-9a-f]{1,4}$/i.test(x)) return null; n = (n << 16n) | BigInt('0x' + x); }
  return n;
}
function f6(n, compress = true) {
  const g = Array.from({ length: 8 }, (_, i) => Number((n >> BigInt(112 - 16 * i)) & 0xffffn)), h = (x) => x.toString(16);
  if (!compress) return g.map((x) => h(x).padStart(4, '0')).join(':');
  let best = -1, bl = 0;
  for (let i = 0; i < 8;) { if (g[i] === 0) { let j = i; while (j < 8 && g[j] === 0) j++; if (j - i > bl) { bl = j - i; best = i; } i = j; } else i++; }
  return bl < 2 ? g.map(h).join(':') : g.slice(0, best).map(h).join(':') + '::' + g.slice(best + bl).map(h).join(':');
}
const pIP = (s) => { s = s.trim(); const n = s.includes(':') ? p6(s) : p4(s); return n == null ? null : { v: s.includes(':') ? 6 : 4, n }; };
const fIP = (v, n) => (v === 4 ? f4(n) : f6(n));
function parseNet(s) {
  const m = s.trim().match(/^(\S+?)(?:\/(\d+)|\s+(\d+\.\d+\.\d+\.\d+))?$/);
  const ip = m && pIP(m[1]);
  if (!ip) throw new Error(`Invalid IP address "${s.trim()}"`);
  const bits = ip.v === 4 ? 32 : 128;
  let len = bits;
  if (m[2] !== undefined) len = +m[2];
  else if (m[3]) {
    const mk = p4(m[3]); if (mk == null) throw new Error(`Invalid netmask "${m[3]}"`);
    const inv = ~mk & 0xffffffffn;
    if (inv & (inv + 1n)) throw new Error('Netmask is not contiguous');
    len = 32 - (inv + 1n).toString(2).length + 1;
  }
  if (len > bits) throw new Error(`Prefix length /${len} is too long for IPv${ip.v}`);
  const hb = BigInt(bits - len), ones = (1n << BigInt(bits)) - 1n, mask = ones ^ ((1n << hb) - 1n), net = ip.n & mask;
  return { ...ip, bits, len, hb, mask, net, last: net | ((1n << hb) - 1n) };
}
const inNet = (n, v, base, len) => { const bits = v === 4 ? 32n : 128n, sh = bits - BigInt(len); return n >> sh === base >> sh; };
const KIND4 = [['0.0.0.0', 8, '"This" network'], ['10.0.0.0', 8, 'Private (RFC 1918)'], ['100.64.0.0', 10, 'Shared address space (CGNAT)'], ['127.0.0.0', 8, 'Loopback'], ['169.254.0.0', 16, 'Link-local'], ['172.16.0.0', 12, 'Private (RFC 1918)'], ['192.0.2.0', 24, 'Documentation (TEST-NET-1)'], ['192.168.0.0', 16, 'Private (RFC 1918)'], ['198.18.0.0', 15, 'Benchmarking'], ['224.0.0.0', 4, 'Multicast'], ['240.0.0.0', 4, 'Reserved']];
const KIND6 = [['::1', 128, 'Loopback'], ['::', 128, 'Unspecified'], ['::ffff:0:0', 96, 'IPv4-mapped'], ['fe80::', 10, 'Link-local'], ['fc00::', 7, 'Unique local (private)'], ['ff00::', 8, 'Multicast'], ['2001:db8::', 32, 'Documentation'], ['2000::', 3, 'Global unicast']];
const kindOf = (v, n) => (v === 4 ? KIND4 : KIND6).find(([b, l]) => inNet(n, v, v === 4 ? p4(b) : p6(b), l))?.[2] || (v === 4 ? 'Public' : 'Other / reserved');

T.push({
  id: 'ip-subnet-calculator', cat: 'Network & HTTP', title: 'IP Subnet Calculator', desc: 'IPv4 CIDR/netmask details (range, broadcast, wildcard, hosts) and IPv6 prefix ranges.',
  labels: ['IP/CIDR, or "IP netmask", one per line'], sample: '192.168.10.77/26\n10.0.0.1 255.255.0.0\n2001:db8:abcd::1/48',
  run: ([s]) => lines(s).map((l) => {
    const x = parseNet(l), tot = 1n << x.hb;
    if (x.v === 4) {
      const first = x.len >= 31 ? x.net : x.net + 1n, last = x.len >= 31 ? x.last : x.last - 1n, first8 = Number(x.net >> 24n);
      return [`Input: ${l}`, `Address: ${f4(x.n)}`, `CIDR: ${f4(x.net)}/${x.len}`, `Netmask: ${f4(x.mask)}`, `Wildcard: ${f4(x.mask ^ 0xffffffffn)}`, `Netmask (binary): ${x.mask.toString(2).padStart(32, '0').replace(/(.{8})(?=.)/g, '$1.')}`,
        `Network: ${f4(x.net)}`, `Broadcast: ${x.len >= 31 ? 'n/a' : f4(x.last)}`, `Host range: ${f4(first)} - ${f4(last)}`, `Total addresses: ${tot}`, `Usable hosts: ${x.len === 32 ? 1 : x.len === 31 ? 2 : tot - 2n}`,
        `Class: ${first8 < 128 ? 'A' : first8 < 192 ? 'B' : first8 < 224 ? 'C' : first8 < 240 ? 'D (multicast)' : 'E (reserved)'}`, `Type: ${kindOf(4, x.n)}`, `Integer: ${x.n}   Hex: 0x${x.n.toString(16).padStart(8, '0')}`].join('\n');
    }
    return [`Input: ${l}`, `Address: ${f6(x.n)}`, `Expanded: ${f6(x.n, false)}`, `Prefix: ${f6(x.net)}/${x.len}`, `First address: ${f6(x.net)}`, `Last address: ${f6(x.last)}`,
      `Total addresses: ${tot}  (2^${x.hb})`, `/64 subnets inside: ${x.len <= 64 ? 1n << BigInt(64 - x.len) : 'n/a (smaller than /64)'}`, `Type: ${kindOf(6, x.n)}`].join('\n');
  }).join('\n\n'),
});
T.push({
  id: 'cidr-contains', cat: 'Network & HTTP', title: 'CIDR Contains IP Check', desc: 'Check which CIDR ranges contain each IP address (IPv4 and IPv6).',
  inputs: 2, labels: ['CIDR ranges, one per line', 'IP addresses, one per line'], sample: '10.0.0.0/8\n192.168.0.0/16\n2001:db8::/32', sample2: '10.20.30.40\n172.16.0.1\n192.168.1.1\n2001:db8::beef\n::1',
  run: ([c, i]) => {
    const nets = lines(c).map(parseNet);
    return lines(i).map((l) => {
      const ip = pIP(l);
      if (!ip) return `${l}  ->  invalid IP`;
      const hit = nets.filter((n) => n.v === ip.v && ip.n >> n.hb === n.net >> n.hb).map((n) => `${fIP(n.v, n.net)}/${n.len}`);
      return `${l}  ->  ${hit.length ? 'IN ' + hit.join(', ') : 'not in any range'}`;
    }).join('\n');
  },
});
T.push({
  id: 'ip-validator-converter', cat: 'Network & HTTP', title: 'IP Validator & Converter', desc: 'Validate IPv4/IPv6 and convert between dotted, integer, hex and binary forms.',
  labels: ['IP address or integer, one per line'], sample: '192.168.1.1\n3232235777\n0xC0A80101\n2001:db8::1',
  run: ([s]) => lines(s).map((l) => {
    let ip = pIP(l);
    if (!ip && /^(0x[0-9a-f]+|\d+)$/i.test(l) && BigInt(l) < 1n << 32n) ip = { v: 4, n: BigInt(l) };
    if (!ip) return `${l}\n  INVALID: not an IPv4 / IPv6 address or 32-bit integer`;
    if (ip.v === 4) {
      const o = f4(ip.n).split('.').map(Number);
      return [`${l}  (valid IPv4)`, `  Dotted: ${f4(ip.n)}`, `  Integer: ${ip.n}`, `  Hex: 0x${ip.n.toString(16).padStart(8, '0')}`, `  Binary: ${o.map((x) => x.toString(2).padStart(8, '0')).join('.')}`, `  Octal: ${o.map((x) => '0' + x.toString(8)).join('.')}`, `  IPv4-mapped IPv6: ${f6(0xffff00000000n + ip.n)}`, `  Type: ${kindOf(4, ip.n)}`].join('\n');
    }
    return [`${l}  (valid IPv6)`, `  Compressed: ${f6(ip.n)}`, `  Expanded: ${f6(ip.n, false)}`, `  Integer: ${ip.n}`, `  Hex: 0x${ip.n.toString(16).padStart(32, '0')}`, `  Type: ${kindOf(6, ip.n)}`].join('\n');
  }).join('\n\n'),
});

const qsPairs = (s) => { const q = s.includes('?') ? s.slice(s.indexOf('?') + 1).split('#')[0] : s.split('#')[0]; return [...new URLSearchParams(q.trim())]; };
T.push({
  id: 'url-parser', cat: 'Network & HTTP', title: 'URL Parser', desc: 'Split a URL into protocol, host, port, path, query parameters and fragment.',
  labels: ['URL'], sample: 'https://user:pw@www.example.com:8443/a/b%20c/index.html?q=hello+world&tag=a&tag=b#section-2',
  run: ([s]) => {
    s = s.trim();
    let u; try { u = new URL(s); } catch { try { u = new URL('https://' + s); } catch { throw new Error('Invalid URL'); } }
    const rows = [['href', u.href], ['protocol', u.protocol], ['username', u.username], ['password', u.password], ['host', u.host], ['hostname', u.hostname], ['port', u.port || '(default)'], ['origin', u.origin], ['pathname', u.pathname], ['search', u.search], ['hash', u.hash]];
    const segs = u.pathname.split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
    return rows.map(([k, v]) => `${k.padEnd(9)} ${v}`).join('\n') + `\n\nPath segments (${segs.length}): ${segs.map((x) => JSON.stringify(x)).join(' / ') || '(none)'}\n\nQuery parameters (${[...u.searchParams].length}):\n` + ([...u.searchParams].map(([k, v], i) => `${String(i + 1).padStart(2)}. ${k} = ${v}`).join('\n') || '(none)');
  },
});
T.push({
  id: 'query-string', cat: 'Network & HTTP', title: 'Query String Parser / Builder', desc: 'Parse a query string or URL into key/value pairs and JSON, or build one from key=value lines or JSON.',
  labels: ['Query string / URL, or key=value lines / JSON'], sample: 'https://example.com/search?q=hello+world&tag=a&tag=b&page=2',
  opts: [{ id: 'mode', label: 'Mode', type: 'select', choices: ['parse', 'build'], def: 'parse' }, { id: 'space', label: 'Build: space as', type: 'select', choices: ['%20', '+'], def: '%20' }],
  run: ([s], o) => {
    if (o.mode === 'parse') {
      const pairs = qsPairs(s), obj = {};
      for (const [k, v] of pairs) obj[k] = k in obj ? [].concat(obj[k], v) : v;
      return `${pairs.map(([k, v], i) => `${String(i + 1).padStart(2)}. ${k} = ${v}`).join('\n') || '(no parameters)'}\n\nJSON:\n${JSON.stringify(obj, null, 2)}`;
    }
    let pairs;
    if (s.trim().startsWith('{')) {
      let j; try { j = JSON.parse(s); } catch { throw new Error('Invalid JSON'); }
      pairs = Object.entries(j).flatMap(([k, v]) => [].concat(v).map((x) => [k, typeof x === 'object' ? JSON.stringify(x) : String(x)]));
    } else pairs = lines(s).map((l) => { const i = l.indexOf('='); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; });
    const e = (x) => (o.space === '+' ? encodeURIComponent(x).replace(/%20/g, '+') : encodeURIComponent(x));
    return pairs.map(([k, v]) => `${e(k)}=${e(v)}`).join('&');
  },
});

// ---------------------------------------------------------------- Regex
T.push({
  id: 'regex-tester', cat: 'Regex', title: 'Regex Tester', desc: 'Test a JavaScript regex: matches with indexes, capture groups, named groups and replace preview.',
  inputs: 2, labels: ['Test text', 'Replacement (optional, supports $1 and $<name>)'],
  sample: 'Released 2024-03-15, patched 2024-04-02 and archived 1999-12-31.', sample2: '$<day>/$<month>/$<year>',
  opts: [{ id: 'pattern', label: 'Pattern', type: 'text', def: '(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})' }, { id: 'flags', label: 'Flags (dgimsuy)', type: 'text', def: 'g' }],
  run: ([text, repl], o) => {
    if (!o.pattern) throw new Error('Enter a pattern');
    const flags = [...new Set(o.flags.replace(/[^dgimsuvy]/g, ''))].join('');
    let re; try { re = new RegExp(o.pattern, flags); } catch (e) { throw new Error('Invalid regex: ' + e.message); }
    // ponytail: runs synchronously, a catastrophic-backtracking pattern can freeze the tab; move to a Worker if that matters.
    const ms = (re.global ? [...text.matchAll(re)] : [re.exec(text)].filter(Boolean)).slice(0, 1000);
    const out = [`${ms.length} match${ms.length === 1 ? '' : 'es'}${re.global ? '' : ' (no g flag: first match only)'}`];
    ms.forEach((m, i) => {
      out.push(`\n#${i + 1}  index ${m.index}-${m.index + m[0].length}  ${JSON.stringify(m[0])}`);
      for (let g = 1; g < m.length; g++) out.push(`    group ${g}: ${m[g] === undefined ? '(not matched)' : JSON.stringify(m[g])}`);
      for (const [k, v] of Object.entries(m.groups || {})) out.push(`    <${k}>: ${v === undefined ? '(not matched)' : JSON.stringify(v)}`);
    });
    if (repl) out.push(`\nREPLACE RESULT\n${text.replace(re, repl)}`);
    return out.join('\n');
  },
});
refTool({
  id: 'regex-cheatsheet', cat: 'Regex', title: 'Regex Cheat Sheet', desc: 'JavaScript regular expression syntax quick reference.',
  rows: `.            Any character except newline (with s flag: any character)
\\d \\D        Digit / non-digit
\\w \\W        Word character [A-Za-z0-9_] / non-word
\\s \\S        Whitespace / non-whitespace
\\b \\B        Word boundary / non-boundary
^ $          Start / end of input (of each line with m flag)
[abc]        Any of a, b, c
[^abc]       None of a, b, c
[a-z]        Character range
a|b          Alternation: a or b
(abc)        Capture group
(?:abc)      Non-capturing group
(?<name>abc) Named capture group; reference with \\k<name> or $<name>
\\1           Backreference to group 1
a* a+ a?     0 or more / 1 or more / 0 or 1 (greedy)
a*? a+? a??  Lazy (non-greedy) versions
a{3} a{3,} a{3,5}   Exactly 3 / at least 3 / between 3 and 5
(?=abc)      Positive lookahead
(?!abc)      Negative lookahead
(?<=abc)     Positive lookbehind
(?<!abc)     Negative lookbehind
\\n \\r \\t     Newline / carriage return / tab
\\xHH \\uHHHH   Character by hex code / UTF-16 unit
\\u{1F600}    Code point (needs u flag)
\\p{L}        Unicode property: letter (needs u flag); also \\p{Lu}, \\p{Script=Greek}, \\p{Emoji}
\\P{L}        Negated Unicode property
FLAG g       Global: find all matches
FLAG i       Ignore case
FLAG m       Multiline: ^ and $ match at line breaks
FLAG s       dotAll: . matches newlines
FLAG u       Unicode mode (code points, \\p{...})
FLAG y       Sticky: match only at lastIndex
FLAG d       Indices: report start/end of groups
FLAG v       Unicode sets mode (set operations in classes)
REPLACE $1   Insert capture group 1
REPLACE $<n> Insert named group n
REPLACE $&   Insert the whole match
REPLACE $\`   Text before the match
REPLACE $'   Text after the match
REPLACE $$   A literal $
EXAMPLE      Email (simple): [\\w.+-]+@[\\w-]+(\\.[\\w-]+)+
EXAMPLE      ISO date: (\\d{4})-(\\d{2})-(\\d{2})
EXAMPLE      IPv4: \\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b
EXAMPLE      Hex color: #(?:[0-9a-fA-F]{3}){1,2}\\b
EXAMPLE      URL: https?:\\/\\/[^\\s/$.?#].[^\\s]*
EXAMPLE      Trim whitespace: ^\\s+|\\s+$
EXAMPLE      Duplicate words: \\b(\\w+)\\s+\\1\\b`.split('\n'),
});

export default T;

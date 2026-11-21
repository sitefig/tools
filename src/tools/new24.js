// Second-pass tools for rows first skipped in free-browser-tools.md (peerreview/new-list/pass2-B.md). See TOOLS.md.
// Built here: typing tutor, geometry construction board, grid-robot / boolean-circuit logic puzzles, document scanner,
// whiteboard, auto caption generator (reuses the Whisper engine in src/gap5lib/whisper.js), glyph-grid font maker.
// Every tool is a custom render tool. Pure logic is exposed on the array as T.lib for the Node checks in the scratch folder.
const T = [];
const L = (T.lib = {});
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k.includes('-') || !(k in e) || k === 'list') e.setAttribute(k, v === true ? '' : v);
    else e[k] = v;
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
  return e;
};
let uid = 0;
const fid = (p) => `${p}-${++uid}`;
// labelled control: returns [wrapper, control]
const lab = (text, ctl, extra = {}) => { ctl.id ||= fid('c24'); return [h('div', { style: { display: 'grid', gap: '.15rem', ...extra } }, h('label', { htmlFor: ctl.id, style: { margin: 0 } }, text), ctl), ctl]; };
const btn = (text, fn, props = {}) => h('button', { type: 'button', onclick: fn, ...props }, text);
const say = (el, msg, bad) => { el.setAttribute('role', bad ? 'alert' : 'status'); el.textContent = msg; };
const dl = (name, data, type) => { const a = h('a', { href: URL.createObjectURL(new Blob([data], { type })), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mulberry = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const CARD = { border: '1px solid var(--border)', borderRadius: 'var(--radius-s)', padding: '.5rem .75rem' };

// ====================================================================== 1515 typing tutor
const WORDS = 'a add ad all ask dad fall flask glad had has hall hash hash jaw lad sad salad shall slash alas lass dash gas gash half halls haha flag flags fad fads add lag lags jag jags skid kid kids lid lids did dill fill fills hill hills hid his kiss silk sill still jig dig fig flip slip skip ship shop hop top stop pot pots spot spots lot lots slot slots hole hold fold sold gold old oils soil foil goal coal call calls fall wall tall tell sell sells shell spell well wells yell ill all ale sale tale pale male hale gale kale the then they them this that with what when where which there these those their other water would could should about after again before because people little world year work time good very just from have make like long look more most only over such take than that them then well were will your you out use our one two ten tree three green queen quite quiet quote write wrote water ware were wire wise wish with year yet yes yeah type tire tore tower power poet pity pure pyre prey pray play plot port part past pest pet pot put quit quiz zone zero zebra zoom zinc cave civic code come cone cube cove move name need never next nice none note nine mix max box vex vim van vase vast cab can cap cat nab nap net new nut ban bat bun bus buy but by cube move name over very vest vent book room roof tool cool pool noon moon soon boom doom zoom room from move more home hope hole'.split(' ');
const WORDSET = [...new Set(WORDS)];
const ROWS = [
  { id: 'home-left', name: 'Home row, left hand', keys: 'asdf', hint: 'Left fingers rest on A S D F.' },
  { id: 'home-right', name: 'Home row, right hand', keys: 'jkl;', hint: 'Right fingers rest on J K L ;.' },
  { id: 'home', name: 'Home row, both hands', keys: 'asdfjkl;' },
  { id: 'home-gh', name: 'Home row with G and H', keys: 'asdfjkl;gh', add: 'gh' },
  { id: 'top-left', name: 'Top row, left (Q W E R T)', keys: 'asdfjkl;ghqwert', add: 'qwert' },
  { id: 'top-right', name: 'Top row, right (Y U I O P)', keys: 'asdfjkl;ghqwertyuiop', add: 'yuiop' },
  { id: 'bottom', name: 'Bottom row (Z X C V B N M , . /)', keys: 'asdfjkl;ghqwertyuiopzxcvbnm,./', add: 'zxcvbnm,./' },
  { id: 'numbers', name: 'Number row (1 to 0)', keys: '1234567890', add: '1234567890', digits: true },
  { id: 'capitals', name: 'Capital letters (Shift)', keys: 'abcdefghijklmnopqrstuvwxyz', caps: true },
  { id: 'punct', name: 'Punctuation', keys: 'abcdefghijklmnopqrstuvwxyz', punct: true },
  { id: 'mixed', name: 'Mixed sentences', keys: 'abcdefghijklmnopqrstuvwxyz', sentences: true },
];
const SENT = ['The quick brown fox jumps over the lazy dog.', 'Pack my box with five dozen liquor jugs.', 'We write, we read, and we learn every day.', 'How vexingly quick daft zebras jump!', 'Practice slowly; speed comes after accuracy.', 'Sphinx of black quartz, judge my vow.', 'Is it 9 or 10 o\'clock? It is 10:15 now.'];
// text for one drill; rnd() in [0,1)
function drill(lesson, rnd, weak) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  if (weak) { // weak keys: short chunks around each weak key
    const ks = weak.length ? weak : ['a'], out = [];
    for (let i = 0; i < 12; i++) { const k = pick(ks); const w = WORDSET.filter((x) => x.includes(k.toLowerCase())); out.push(k.length === 1 && /[a-z]/i.test(k) && w.length ? (k !== k.toLowerCase() ? pick(w).replace(k.toLowerCase(), k) : pick(w)) : k + k + (pick(ks) || k)); }
    return out.join(' ');
  }
  if (lesson.sentences) return [pick(SENT), pick(SENT), pick(SENT)].join(' ');
  if (lesson.digits) { const out = []; for (let i = 0; i < 10; i++) { let w = ''; const n = 2 + Math.floor(rnd() * 4); for (let j = 0; j < n; j++) w += pick(lesson.keys.split('')); out.push(w); } return out.join(' '); }
  const ok = new Set(lesson.keys.split(''));
  let pool = WORDSET.filter((w) => w.length >= 2 && [...w].every((c) => ok.has(c)));
  const newKeys = (lesson.add || '').split('');
  if (newKeys.length) { const withNew = pool.filter((w) => newKeys.some((k) => w.includes(k))); if (withNew.length >= 4) pool = [...withNew, ...withNew, ...pool]; }
  const out = [];
  for (let i = 0; i < 10; i++) {
    if (pool.length >= 8 && !(lesson.keys.length <= 8 && rnd() < 0.5)) out.push(pick(pool));
    else { // pseudo-word from the allowed keys, favouring the new keys
      const src = newKeys.length && rnd() < 0.6 ? newKeys : [...ok]; const n = 3 + Math.floor(rnd() * 3); let w = ''; for (let j = 0; j < n; j++) w += pick(j % 2 && newKeys.length ? [...ok] : src); out.push(w);
    }
  }
  let s = out.join(' ');
  if (lesson.caps) s = s.replace(/(^|\. )?\b([a-z])/g, (m, p, c) => (rnd() < 0.5 || p ? (p || '') + c.toUpperCase() : m));
  if (lesson.punct) s = out.map((w, i) => (i % 3 === 2 ? pick([w + ',', w + '.', w + ';', "'" + w + "'", w + '?', w + '!', w + '-' + pick(out)]) : w)).join(' ');
  return s;
}
// score a finished or running attempt. keys: [{exp, ok}] one entry per keystroke; ms elapsed.
function scoreRun(keys, ms) {
  const good = keys.filter((k) => k.ok).length, mins = Math.max(ms, 1) / 60000, wrong = {};
  for (const k of keys) if (!k.ok) wrong[k.exp] = (wrong[k.exp] || 0) + 1;
  return { wpm: Math.round((good / 5 / mins) * 10) / 10, acc: keys.length ? Math.round((1000 * good) / keys.length) / 10 : 100, errors: keys.length - good, wrong };
}
Object.assign(L, { drill, scoreRun, ROWS, mulberry });

T.push({
  id: 'typing-tutor-key-rows', cat: 'Text Fun', title: 'Typing Tutor: Learn Touch Typing Row by Row',
  desc: 'Eleven keyboard lessons from the home row to capitals and punctuation, with words per minute, accuracy and your most mistyped keys after each drill. Keyboard only, nothing stored or sent.',
  custom: true, dom: true,
  render(root) {
    let lesson = 0, round = 0, target = '', pos = 0, keys = [], t0 = 0, last = 0, weakMode = false, running = false;
    const results = [], wrongAll = {};
    const [selW, sel] = lab('Lesson', h('select', {}, ...ROWS.map((r, i) => h('option', { value: i }, `${i + 1}. ${r.name}`)), h('option', { value: 'weak' }, 'Practice my weak keys')));
    const box = h('p', { style: { font: '1.4rem/1.9 var(--font-mono)', ...CARD, margin: '.5rem 0', wordBreak: 'break-word' } }), live = h('p', { role: 'status', style: { minHeight: '1.5em' } });
    const input = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': 'Typing area. Focus here and type the text shown above. Wrong keys are counted and do not advance.', style: { maxWidth: '30rem' } });
    const hint = h('p', { className: 'desc' }), stat = h('p', { 'aria-hidden': 'true', style: { fontVariantNumeric: 'tabular-nums' } }), resBox = h('div'), weakBox = h('div');
    const next = btn('Next drill', () => start(true)), again = btn('Same text again', () => start(false)), nxtL = btn('Next lesson', () => { if (lesson < ROWS.length - 1) { lesson++; sel.value = lesson; weakMode = false; round = 0; start(true); } });
    const draw = () => {
      box.replaceChildren(...[...target].map((c, i) => h('span', { style: i < pos ? { color: 'var(--ok)' } : i === pos ? { textDecoration: 'underline', background: 'var(--accent-soft)' } : {} }, c === ' ' ? ' ' : c)));
      const ms = running ? Date.now() - t0 : 0, s = scoreRun(keys, ms);
      stat.textContent = running ? `${s.wpm} WPM, ${s.acc}% accuracy, ${s.errors} wrong keys` : '';
    };
    const weakList = () => Object.entries(wrongAll).sort((a, b) => b[1] - a[1]).slice(0, 8).map((e) => e[0]);
    let booted = false;
    function start(newText) {
      const l = ROWS[lesson]; if (newText) { round++; target = drill(l, mulberry(lesson * 1000 + round * 7 + 1), weakMode && weakList().length ? weakList() : null); }
      pos = 0; keys = []; running = false; t0 = 0; hint.textContent = weakMode ? (weakList().length ? 'Drill built from the keys you mistyped most in this session.' : 'No mistakes recorded yet, so this is a normal drill for the lesson you last chose.') : (l.hint || (l.add ? `New keys: ${[...l.add].join(' ').toUpperCase()}. Keep your fingers on the home row and reach, then return.` : 'Look at the text, not at your hands. Accuracy first, speed later.')); input.value = ''; draw(); say(live, ''); if (booted) input.focus(); // no focus grab on page load
    }
    function finish() {
      running = false; const ms = last - t0, s = scoreRun(keys, ms); for (const [k, n] of Object.entries(s.wrong)) wrongAll[k] = (wrongAll[k] || 0) + n;
      results.push({ name: weakMode ? 'Weak keys' : ROWS[lesson].name, ...s });
      say(live, `Finished. ${s.wpm} words per minute, ${s.acc}% accuracy, ${s.errors} wrong keys. ${s.acc >= 95 ? 'Good accuracy: try the next lesson.' : 'Aim for 95% accuracy before moving on.'}`);
      resBox.replaceChildren(h('table', {}, h('caption', {}, 'Results this session'), h('thead', {}, h('tr', {}, ...['Lesson', 'WPM', 'Accuracy %', 'Wrong keys'].map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, ...results.map((r) => h('tr', {}, h('td', {}, r.name), h('td', {}, String(r.wpm)), h('td', {}, String(r.acc)), h('td', {}, String(r.errors)))))));
      const wl = Object.entries(wrongAll).sort((a, b) => b[1] - a[1]).slice(0, 8);
      weakBox.replaceChildren(wl.length ? h('p', {}, 'Most mistyped keys this session: ' + wl.map(([k, n]) => `${k === ' ' ? 'space' : k} (${n})`).join(', ')) : h('p', {}, 'No mistakes so far.'));
      draw();
    }
    input.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Tab' || e.key === 'Escape' || e.key.length > 1) { if (e.key === 'Enter' || e.key === 'Backspace') e.preventDefault(); return; }
      e.preventDefault(); if (pos >= target.length || !target.length) return;
      if (!running) { running = true; t0 = Date.now(); }
      const exp = target[pos], ok = e.key === exp; keys.push({ exp, ok }); last = Date.now(); if (ok) pos++;
      draw(); if (!ok) say(live, `Wrong key. Expected ${exp === ' ' ? 'space' : exp}.`, false); else if (live.textContent) say(live, '');
      if (pos >= target.length) finish();
    });
    sel.addEventListener('change', () => { weakMode = sel.value === 'weak'; if (!weakMode) lesson = +sel.value; round = 0; start(true); });
    const timer = setInterval(() => { if (running) draw(); }, 500);
    root.append(h('p', { className: 'desc' }, 'Type the highlighted text with a physical keyboard. A wrong key is counted but does not advance, so accuracy is the number of correct keystrokes out of all keystrokes. Speed is correct characters divided by five, per minute (the standard word). The result stays on this page only. Mobile on-screen keyboards do not report keys reliably: use a hardware keyboard.'), selW, hint, box, h('div', { className: 'row' }, h('label', { htmlFor: (input.id = fid('tt')), style: { margin: 0 } }, 'Typing area'), input, again, next, nxtL), stat, live, resBox, weakBox);
    start(true); booted = true;
    return () => clearInterval(timer);
  },
});

// ====================================================================== 1525 geometry construction board
const GEPS = 1e-9;
const NAME_RE = /^[A-Za-z][A-Za-z0-9_']*$/;
const num = (s) => { const v = Number(s); if (!Number.isFinite(v) || String(s).trim() === '') throw new Error(`"${s}" is not a number`); return v; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]), unit = (a) => { const l = len(a); return [a[0] / l, a[1] / l]; };
const fmt = (v) => String(Math.round(v * 1e4) / 1e4);
const GUSAGE = {
  point: 'point NAME x y', midpoint: 'midpoint NAME A B', segment: 'segment NAME A B', line: 'line NAME A B',
  circle: 'circle NAME CENTER THROUGH_POINT_or_RADIUS', compass: 'compass NAME CENTER A B (radius = distance A to B)',
  perp: 'perp NAME POINT LINE', parallel: 'parallel NAME POINT LINE', bisector: 'bisector NAME A B (perpendicular bisector)',
  anglebisector: 'anglebisector NAME A VERTEX C', intersect: 'intersect NAME OBJ1 OBJ2 [1|2]', pointon: 'pointon NAME LINE_or_CIRCLE t',
  dist: 'dist NAME A B', angle: 'angle NAME A VERTEX C',
};
function lineIsect(o1, o2, n) {
  const [x1, y1] = o1.a, [x2, y2] = o1.b, [x3, y3] = o2.a, [x4, y4] = o2.b, d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (Math.abs(d) < GEPS * (1 + Math.hypot(x2 - x1, y2 - y1) * Math.hypot(x4 - x3, y4 - y3))) return null;
  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d, u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d, e = 1e-9;
  if ((o1.seg && (t < -e || t > 1 + e)) || (o2.seg && (u < -e || u > 1 + e)) || n > 1) return null;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}
function intersect(o1, o2, n) {
  if (o1.type === 'circle' && o2.type !== 'circle') [o1, o2] = [o2, o1];
  if (o1.type === 'line' && o2.type === 'line') return lineIsect(o1, o2, n);
  if (o1.type === 'line') { // line or segment with circle; order by position along a->b
    const d = sub(o1.b, o1.a), f = sub(o1.a, o2.c), A = d[0] * d[0] + d[1] * d[1], B = 2 * (f[0] * d[0] + f[1] * d[1]), C = f[0] * f[0] + f[1] * f[1] - o2.r * o2.r;
    let disc = B * B - 4 * A * C; if (disc < -1e-9 * (B * B + 1)) return null; if (disc < 1e-12 * (B * B + 1)) disc = 0;
    const s = Math.sqrt(disc); let ts = disc === 0 ? [-B / (2 * A)] : [(-B - s) / (2 * A), (-B + s) / (2 * A)];
    if (o1.seg) ts = ts.filter((t) => t >= -1e-9 && t <= 1 + 1e-9);
    const t = ts[n - 1]; return t === undefined ? null : [o1.a[0] + t * d[0], o1.a[1] + t * d[1]];
  }
  const dv = sub(o2.c, o1.c), d = len(dv); if (d < GEPS) return null;
  if (d > o1.r + o2.r + 1e-9 * (1 + d) || d < Math.abs(o1.r - o2.r) - 1e-9 * (1 + d)) return null;
  const a = (o1.r * o1.r - o2.r * o2.r + d * d) / (2 * d), hh = o1.r * o1.r - a * a, hgt = hh <= 1e-12 * (1 + o1.r * o1.r) ? 0 : Math.sqrt(hh), u = [dv[0] / d, dv[1] / d], P = add(o1.c, mul(u, a)), pr = [-u[1], u[0]];
  const pts = hgt === 0 ? [P] : [add(P, mul(pr, hgt)), add(P, mul(pr, -hgt))]; return pts[n - 1] || null;
}
// evaluate a construction script. Returns { objs: Map, order: [name], errors: [string] }
function evalScript(src) {
  const objs = new Map(), order = [], errors = [];
  src.split('\n').forEach((raw, ln) => {
    const line = raw.replace(/#.*/, '').trim(); if (!line) return;
    const tk = line.split(/\s+/), cmd = tk[0].toLowerCase(), name = tk[1];
    const fail = (m) => errors.push(`Line ${ln + 1} (${line}): ${m}`);
    try {
      if (!GUSAGE[cmd]) return fail(`unknown command "${tk[0]}". Commands: ${Object.keys(GUSAGE).join(', ')}`);
      if (!name || !NAME_RE.test(name)) return fail('give the object a name (letters, digits, _ or \'; starting with a letter). Usage: ' + GUSAGE[cmd]);
      if (objs.has(name)) return fail(`the name ${name} is already used`);
      const get = (n, ...types) => { const o = objs.get(n); if (!o) throw new Error(`no object named ${n}`); if (!types.includes(o.type)) throw new Error(`${n} is a ${o.type}, expected ${types.join(' or ')}`); if (o.undef) throw new Error(`${n} is undefined (${o.undef})`); return o; };
      const arity = { point: 3, midpoint: 3, segment: 3, line: 3, circle: 3, compass: 4, perp: 3, parallel: 3, bisector: 3, anglebisector: 4, intersect: 3, pointon: 3, dist: 3, angle: 4 }[cmd];
      if (cmd === 'intersect' ? tk.length < 4 || tk.length > 5 : tk.length !== arity + 1) return fail('usage: ' + GUSAGE[cmd]);
      let o;
      const P = (n) => get(n, 'point').p;
      switch (cmd) {
        case 'point': o = { type: 'point', p: [num(tk[2]), num(tk[3])], free: true }; break;
        case 'midpoint': o = { type: 'point', p: mul(add(P(tk[2]), P(tk[3])), 0.5), dep: `midpoint of ${tk[2]} and ${tk[3]}` }; break;
        case 'segment': case 'line': { const a = P(tk[2]), b = P(tk[3]); if (len(sub(a, b)) < GEPS) throw new Error('the two points coincide'); o = { type: 'line', seg: cmd === 'segment', a, b, from: [tk[2], tk[3]] }; break; }
        case 'circle': {
          const c = P(tk[2]), isN = Number.isFinite(Number(tk[3])) && !objs.has(tk[3]); const r = isN ? num(tk[3]) : len(sub(P(tk[3]), c)); if (!(r > 0)) throw new Error('the radius must be above zero');
          o = { type: 'circle', c, r, from: [tk[2], tk[3]] }; break;
        }
        case 'compass': { const r = len(sub(P(tk[3]), P(tk[4]))); if (!(r > 0)) throw new Error('the radius must be above zero'); o = { type: 'circle', c: P(tk[2]), r, from: [tk[2]], note: `radius equals the distance ${tk[3]}${tk[4]}` }; break; }
        case 'perp': case 'parallel': { const p = P(tk[2]), l = get(tk[3], 'line'), d = unit(sub(l.b, l.a)), dir = cmd === 'perp' ? [-d[1], d[0]] : d; o = { type: 'line', seg: false, a: p, b: add(p, dir), rel: `${cmd === 'perp' ? 'perpendicular' : 'parallel'} to ${tk[3]} through ${tk[2]}` }; break; }
        case 'bisector': { const a = P(tk[2]), b = P(tk[3]); if (len(sub(a, b)) < GEPS) throw new Error('the two points coincide'); const m = mul(add(a, b), 0.5), d = unit(sub(b, a)); o = { type: 'line', seg: false, a: m, b: add(m, [-d[1], d[0]]), rel: `perpendicular bisector of ${tk[2]}${tk[3]}` }; break; }
        case 'anglebisector': { const a = P(tk[2]), v = P(tk[3]), c = P(tk[4]), u1 = unit(sub(a, v)), u2 = unit(sub(c, v)); let d = add(u1, u2); if (len(d) < 1e-9) d = [-u1[1], u1[0]]; o = { type: 'line', seg: false, a: v, b: add(v, d), rel: `bisector of angle ${tk[2]}${tk[3]}${tk[4]}` }; break; }
        case 'intersect': {
          const n = tk[4] ? Math.round(num(tk[4])) : 1; if (n !== 1 && n !== 2) throw new Error('the last number must be 1 or 2');
          const p = intersect(get(tk[2], 'line', 'circle'), get(tk[3], 'line', 'circle'), n); if (!p) throw new Error(`${tk[2]} and ${tk[3]} have no ${n === 2 ? 'second ' : ''}intersection`);
          o = { type: 'point', p, dep: `intersection ${n} of ${tk[2]} and ${tk[3]}` }; break;
        }
        case 'pointon': { const s = get(tk[2], 'line', 'circle'), t = num(tk[3]); o = { type: 'point', p: s.type === 'circle' ? [s.c[0] + s.r * Math.cos((t * Math.PI) / 180), s.c[1] + s.r * Math.sin((t * Math.PI) / 180)] : add(s.a, mul(sub(s.b, s.a), t)), dep: s.type === 'circle' ? `point on ${tk[2]} at ${t} degrees` : `point on ${tk[2]} at parameter ${t}` }; break; }
        case 'dist': o = { type: 'measure', v: len(sub(P(tk[2]), P(tk[3]))), what: `distance ${tk[2]}${tk[3]}` }; break;
        case 'angle': { const a = sub(P(tk[2]), P(tk[3])), c = sub(P(tk[4]), P(tk[3])); if (len(a) < GEPS || len(c) < GEPS) throw new Error('an arm has length zero'); o = { type: 'measure', v: (Math.acos(Math.max(-1, Math.min(1, (a[0] * c[0] + a[1] * c[1]) / (len(a) * len(c))))) * 180) / Math.PI, what: `angle ${tk[2]}${tk[3]}${tk[4]}`, unit: ' degrees' }; break; }
      }
      o.name = name; o.ln = ln; objs.set(name, o); order.push(name);
    } catch (e) { fail(e.message); }
  });
  return { objs, order, errors };
}
function describe(ev) {
  const out = [], pts = [], lines = [];
  for (const n of ev.order) {
    const o = ev.objs.get(n);
    if (o.type === 'point') { pts.push(o); out.push(`Point ${n} at (${fmt(o.p[0])}, ${fmt(o.p[1])})${o.dep ? ', ' + o.dep : ', free'}.`); }
    else if (o.type === 'line') { lines.push(o); const d = sub(o.b, o.a); out.push(`${o.seg ? 'Segment' : 'Line'} ${n}${o.from ? ` through ${o.from[0]} and ${o.from[1]}` : `, ${o.rel}`}${o.seg ? `, length ${fmt(len(d))}` : ''}.`); }
    else if (o.type === 'circle') out.push(`Circle ${n} centred at (${fmt(o.c[0])}, ${fmt(o.c[1])}) with radius ${fmt(o.r)}${o.from && o.from[1] ? (Number.isFinite(Number(o.from[1])) ? '' : `, through ${o.from[1]}`) : ''}${o.note ? ', ' + o.note : ''}.`);
    else out.push(`Measure ${n}: ${o.what} = ${fmt(o.v)}${o.unit || ''}.`);
  }
  const facts = [];
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const d1 = unit(sub(lines[i].b, lines[i].a)), d2 = unit(sub(lines[j].b, lines[j].a)), cr = Math.abs(d1[0] * d2[1] - d1[1] * d2[0]), dt = Math.abs(d1[0] * d2[0] + d1[1] * d2[1]);
    if (dt < 1e-9) facts.push(`${lines[i].name} is perpendicular to ${lines[j].name}.`); else if (cr < 1e-9) facts.push(`${lines[i].name} is parallel to ${lines[j].name}${lineDist(lines[i], lines[j].a) < 1e-9 ? ' (same line)' : ''}.`);
  }
  for (const l of lines) { const on = pts.filter((p) => lineDist(l, p.p) < 1e-7 * (1 + len(sub(l.b, l.a)))).map((p) => p.name); if (on.length >= 3) facts.push(`Points ${on.join(', ')} lie on ${l.name}.`); }
  return { items: out, facts };
}
function lineDist(l, p) { const d = unit(sub(l.b, l.a)), v = sub(p, l.a); return Math.abs(v[0] * d[1] - v[1] * d[0]); }
// SVG for the evaluated construction. view = { x0, y0, s } maps math (x,y) to px ((x-x0)*s, H-(y-y0)*s)
const GW = 640, GH = 480;
function fitView(ev) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; const ext = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (const o of ev.objs.values()) { if (o.type === 'point') ext(...o.p); else if (o.type === 'circle') { ext(o.c[0] - o.r, o.c[1] - o.r); ext(o.c[0] + o.r, o.c[1] + o.r); } else if (o.type === 'line' && o.seg) { ext(...o.a); ext(...o.b); } }
  if (!Number.isFinite(x0)) { x0 = -5; x1 = 5; y0 = -4; y1 = 4; }
  const w = Math.max(x1 - x0, 1e-6), hh = Math.max(y1 - y0, 1e-6), s = Math.min((GW * 0.8) / w, (GH * 0.8) / hh), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { x0: cx - GW / 2 / s, y0: cy - GH / 2 / s, s };
}
const toPx = (v, p) => [(p[0] - v.x0) * v.s, GH - (p[1] - v.y0) * v.s];
const fromPx = (v, px, py) => [px / v.s + v.x0, (GH - py) / v.s + v.y0];
function svgOf(ev, v, sel) {
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GW} ${GH}" width="${GW}" height="${GH}" font-family="sans-serif" font-size="14">`, `<rect width="${GW}" height="${GH}" fill="#ffffff"/>`];
  // axes at x=0 / y=0 when visible
  const o0 = toPx(v, [0, 0]); if (o0[0] > 0 && o0[0] < GW) parts.push(`<line x1="${o0[0].toFixed(1)}" y1="0" x2="${o0[0].toFixed(1)}" y2="${GH}" stroke="#d0d4da" stroke-width="1"/>`); if (o0[1] > 0 && o0[1] < GH) parts.push(`<line x1="0" y1="${o0[1].toFixed(1)}" x2="${GW}" y2="${o0[1].toFixed(1)}" stroke="#d0d4da" stroke-width="1"/>`);
  for (const o of ev.objs.values()) if (o.type === 'circle') { const c = toPx(v, o.c); parts.push(`<circle cx="${c[0].toFixed(2)}" cy="${c[1].toFixed(2)}" r="${(o.r * v.s).toFixed(2)}" fill="none" stroke="#2b6cb0" stroke-width="1.5"><title>${esc(o.name)}</title></circle>`); }
  for (const o of ev.objs.values()) if (o.type === 'line') {
    let a = toPx(v, o.a), b = toPx(v, o.b);
    if (!o.seg) { const d = unit(sub(b, a)); const L = 4000; const m = a; a = [m[0] - d[0] * L, m[1] - d[1] * L]; b = [m[0] + d[0] * L, m[1] + d[1] * L]; }
    parts.push(`<line x1="${a[0].toFixed(2)}" y1="${a[1].toFixed(2)}" x2="${b[0].toFixed(2)}" y2="${b[1].toFixed(2)}" stroke="${o.seg ? '#1a202c' : '#2f855a'}" stroke-width="1.5"><title>${esc(o.name)}</title></line>`);
  }
  for (const o of ev.objs.values()) if (o.type === 'point') {
    const p = toPx(v, o.p), isSel = o.name === sel; parts.push(`<circle cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="${isSel ? 6 : 4}" fill="${o.free ? '#c53030' : '#1a202c'}" stroke="${isSel ? '#000' : '#fff'}" stroke-width="1.5"/><text x="${(p[0] + 7).toFixed(1)}" y="${(p[1] - 7).toFixed(1)}" fill="#1a202c">${esc(o.name)}</text>`);
  }
  parts.push('</svg>'); return parts.join('');
}
const GEX = {
  'Equilateral triangle': 'point A 0 0\npoint B 4 0\ncircle c1 A B\ncircle c2 B A\nintersect C c1 c2 1\nsegment s1 A B\nsegment s2 B C\nsegment s3 C A\ndist AB A B\ndist BC B C\ndist CA C A\nangle angleA B A C',
  'Perpendicular bisector': 'point A -3 -1\npoint B 3 2\ncircle c1 A B\ncircle c2 B A\nintersect P c1 c2 1\nintersect Q c1 c2 2\nline m P Q\nsegment s A B\nbisector m2 A B\nintersect M m s\nmidpoint N A B\ndist AM A M\ndist MB M B',
  'Circumcircle of a triangle': 'point A 0 0\npoint B 6 1\npoint C 2 5\nbisector p A B\nbisector q B C\nintersect O p q\ncircle k O A\nsegment a B C\nsegment b C A\nsegment c A B\ndist OA O A\ndist OB O B\ndist OC O C',
  'Tangent from a point': 'point O 0 0\npoint P 5 0\ncircle k O 2\nmidpoint M O P\ncircle w M O\nintersect T k w 1\nintersect U k w 2\nline t1 P T\nline t2 P U\nsegment r O T\nangle rightAngle O T P',
};
Object.assign(L, { evalScript, describe, intersect, GEX });

T.push({
  id: 'geometry-construction-board', cat: 'Math & Science', title: 'Geometry Construction Board: Points, Lines, Circles and Dependent Constructions',
  desc: 'Build compass-and-straightedge style constructions from typed commands, forms or the pointer. Dependent points follow when you move a free point. Exports SVG and a text description.',
  custom: true, dom: true,
  render(root) {
    let script = GEX['Equilateral triangle'], hist = [], redo = [], sel = '', ev, view, drag = null;
    const live = h('p', { role: 'status' }), errBox = h('div', { role: 'alert' });
    const board = h('div', { tabIndex: 0, role: 'img', style: { border: '1px solid var(--border-strong)', maxWidth: GW + 'px', touchAction: 'none', background: '#fff', cursor: 'crosshair', lineHeight: 0 } });
    const [scrW, ta] = lab('Construction script (one command per line, # starts a comment). This is the source of truth: edit it, then press Apply.', h('textarea', { rows: 12, spellcheck: false, value: script }));
    const [cmdW, cmd] = lab('Add one command and press Enter', h('input', { type: 'text', placeholder: 'e.g. intersect P c1 c2 1', autocomplete: 'off' }));
    const desc = h('pre', { className: 'out', tabIndex: 0, 'aria-label': 'Text description of the construction' });
    const [exW, exSel] = lab('Example', h('select', {}, h('option', { value: '' }, 'Choose an example...'), ...Object.keys(GEX).map((k) => h('option', {}, k))));
    const [addW, addSel] = lab('Construction to add', h('select', {}, ...Object.keys(GUSAGE).map((k) => h('option', { value: k }, k + ': ' + GUSAGE[k].replace(/^\w+ NAME ?/, '') ))));
    const argBox = h('div', { className: 'row' });
    const [movW, movSel] = lab('Free point to move', h('select', {})), [mx, mxIn] = lab('X', h('input', { type: 'number', step: 'any', style: { width: '7rem' } })), [my, myIn] = lab('Y', h('input', { type: 'number', step: 'any', style: { width: '7rem' } })), [stW, stepIn] = lab('Nudge step', h('input', { type: 'number', step: 'any', min: 0, value: 0.5, style: { width: '6rem' } }));
    const clickAdd = h('input', { type: 'checkbox', checked: true, id: fid('ga') });

    const push = () => { hist.push(script); if (hist.length > 100) hist.shift(); redo = []; };
    function setScript(s, record = true) { if (record && s !== script) push(); script = s; ta.value = s; update(); }
    function update(keepView) {
      ev = evalScript(script); if (!keepView || !view) view = fitView(ev);
      const svg = new DOMParser().parseFromString(svgOf(ev, view, sel), 'image/svg+xml').documentElement; svg.style.cssText = 'width:100%;height:auto;display:block'; board.replaceChildren(document.importNode(svg, true));
      const d = describe(ev); desc.textContent = [...d.items, ...(d.facts.length ? ['', 'Relations found:', ...d.facts] : [])].join('\n') || 'Nothing constructed yet.';
      const free = [...ev.objs.values()].filter((o) => o.free).map((o) => o.name); if (!free.includes(sel)) sel = free[0] || '';
      movSel.replaceChildren(...free.map((n) => h('option', { value: n, selected: n === sel }, n)));
      const o = ev.objs.get(sel); if (o) { mxIn.value = fmt(o.p[0]); myIn.value = fmt(o.p[1]); }
      board.setAttribute('aria-label', `Construction board with ${[...ev.objs.values()].filter((x) => x.type === 'point').length} points, ${[...ev.objs.values()].filter((x) => x.type === 'line').length} lines or segments and ${[...ev.objs.values()].filter((x) => x.type === 'circle').length} circles. Full list below the board. Focus here and use arrow keys to move the selected point ${sel || '(none)'}, bracket keys to change it.`);
      errBox.replaceChildren(...ev.errors.map((e) => h('p', { className: 'err' }, e)));
      buildArgs();
    }
    // forms: choose a construction, fill slots, add
    function buildArgs() {
      const kind = addSel.value, names = (f) => [...ev.objs.values()].filter(f).map((o) => o.name), dis = ev.errors.length > 0 && false;
      const nextName = (pre) => { let i = 1; while (ev.objs.has(pre + i)) i++; return pre + i; };
      const PT = names((o) => o.type === 'point'), LN = names((o) => o.type === 'line'), OB = names((o) => o.type !== 'point' && o.type !== 'measure');
      const sl = { point: ['pt', 'n', 'n'], midpoint: ['pt', 'P', 'P'], segment: ['ln', 'P', 'P'], line: ['ln', 'P', 'P'], circle: ['c', 'P', 'PN'], compass: ['c', 'P', 'P', 'P'], perp: ['m', 'P', 'L'], parallel: ['m', 'P', 'L'], bisector: ['m', 'P', 'P'], anglebisector: ['m', 'P', 'P', 'P'], intersect: ['pt', 'O', 'O', 'I'], pointon: ['pt', 'O', 'n'], dist: ['d', 'P', 'P'], angle: ['ang', 'P', 'P', 'P'] }[kind];
      const lbl = { point: ['Name', 'X', 'Y'], midpoint: ['Name', 'From point', 'To point'], segment: ['Name', 'From point', 'To point'], line: ['Name', 'Through point', 'and point'], circle: ['Name', 'Centre', 'Through point, or a radius'], compass: ['Name', 'Centre', 'Radius from point', 'to point'], perp: ['Name', 'Through point', 'Perpendicular to'], parallel: ['Name', 'Through point', 'Parallel to'], bisector: ['Name', 'Point A', 'Point B'], anglebisector: ['Name', 'Point A', 'Vertex', 'Point C'], intersect: ['Name', 'First object', 'Second object', 'Which (1 or 2)'], pointon: ['Name', 'Line or circle', 'Parameter (line: 0 = first point, 1 = second; circle: degrees)'], dist: ['Name', 'From point', 'To point'], angle: ['Name', 'Point A', 'Vertex', 'Point C'] }[kind];
      const prefix = { point: 'P', midpoint: 'M', segment: 's', line: 'l', circle: 'c', compass: 'c', perp: 'm', parallel: 'm', bisector: 'm', anglebisector: 'm', intersect: 'X', pointon: 'Q', dist: 'd', angle: 'a' }[kind];
      const ctl = [];
      const mk = (code, i) => {
        const opts = (arr) => h('select', {}, ...arr.map((n) => h('option', { value: n }, n)));
        if (i === 0) return h('input', { type: 'text', value: kind === 'point' ? String.fromCharCode(65 + (PT.length % 26)) + (PT.length >= 26 ? Math.floor(PT.length / 26) : '') : nextName(prefix), style: { width: '7rem' } });
        if (code === 'n') return h('input', { type: 'number', step: 'any', value: 0, style: { width: '7rem' } });
        if (code === 'P') return opts(PT); if (code === 'L') return opts(LN); if (code === 'O') return opts(OB);
        if (code === 'I') return h('select', {}, h('option', { value: '1' }, '1'), h('option', { value: '2' }, '2'));
        return h('input', { type: 'text', value: PT[1] || '', list: undefined, style: { width: '8rem' } }); // PN: point name or radius
      };
      const wrapped = sl.map((code, i) => { const c = mk(code, i); ctl.push(c); const w = h('div', { style: { display: 'grid', gap: '.15rem' } }, h('label', { htmlFor: (c.id = fid('gf')), style: { margin: 0 } }, lbl[i]), c); return w; });
      const go = btn('Add to script', () => { const vals = ctl.map((c) => c.value.trim()); if (vals.some((v) => !v)) { say(live, 'Fill every field first.', true); return; } const line = `${kind} ${vals.join(' ')}`; setScript(script.replace(/\s*$/, '') + '\n' + line + '\n'); say(live, `Added: ${line}`); });
      argBox.replaceChildren(...wrapped, go);
    }
    addSel.addEventListener('change', buildArgs);
    ta.addEventListener('input', () => {}); const applyB = btn('Apply script', () => { setScript(ta.value); say(live, ev.errors.length ? `${ev.errors.length} line(s) need attention (see below).` : 'Script applied.', ev.errors.length > 0); });
    cmd.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = cmd.value.trim(); if (!v) return; setScript(script.replace(/\s*$/, '') + '\n' + v + '\n'); const bad = ev.errors.find((x) => x.includes(`(${v})`)); say(live, bad || `Added: ${v}`, !!bad); if (!bad) cmd.value = ''; } });
    exSel.addEventListener('change', () => { if (exSel.value) { setScript(GEX[exSel.value]); say(live, `Loaded example: ${exSel.value}.`); } });
    const undo = btn('Undo', () => { if (!hist.length) return say(live, 'Nothing to undo.'); redo.push(script); script = hist.pop(); ta.value = script; update(); say(live, 'Undone.'); });
    const redoB = btn('Redo', () => { if (!redo.length) return say(live, 'Nothing to redo.'); hist.push(script); script = redo.pop(); ta.value = script; update(); say(live, 'Redone.'); });
    const delLast = btn('Delete last command', () => { const ls = script.replace(/\s*$/, '').split('\n'); if (!ls.join('').trim()) return; ls.pop(); setScript(ls.join('\n') + '\n'); say(live, 'Last command removed.'); });
    const clr = btn('Clear all', () => { setScript(''); say(live, 'Board cleared (Undo restores it).'); });
    // moving free points
    function movePoint(name, x, y, record = true) { const re = new RegExp(`^(\\s*point\\s+${name.replace(/[^\w]/g, '\\$&')}\\s+).*$`, 'm'); if (!re.test(script)) return; const s = script.replace(re, (m, a) => `${a}${fmt(x)} ${fmt(y)}`); if (record) { push(); } script = s; ta.value = s; update(true); }
    movSel.addEventListener('change', () => { sel = movSel.value; update(true); });
    const applyXY = btn('Move point', () => { if (!sel) return say(live, 'There is no free point.', true); const x = Number(mxIn.value), y = Number(myIn.value); if (!Number.isFinite(x) || !Number.isFinite(y)) return say(live, 'Enter X and Y as numbers.', true); movePoint(sel, x, y); say(live, `Moved ${sel} to (${fmt(x)}, ${fmt(y)}).`); });
    const nudge = (dx, dy, nm) => btn(nm, () => { const o = ev.objs.get(sel); if (!o) return say(live, 'There is no free point.', true); const s = Number(stepIn.value) || 0.5; movePoint(sel, o.p[0] + dx * s, o.p[1] + dy * s); say(live, `${sel} is now at (${fmt(ev.objs.get(sel).p[0])}, ${fmt(ev.objs.get(sel).p[1])}).`); });
    // pointer
    const rel = (e) => { const r = board.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * GW, ((e.clientY - r.top) / r.height) * GH]; };
    board.addEventListener('pointerdown', (e) => {
      if (!ev) return; const [px, py] = rel(e); let best = null, bd = 16;
      for (const o of ev.objs.values()) if (o.free) { const p = toPx(view, o.p), d = Math.hypot(p[0] - px, p[1] - py); if (d < bd) { bd = d; best = o.name; } }
      if (best) { sel = best; push(); drag = best; board.setPointerCapture(e.pointerId); movSel.value = best; update(true); }
      else if (clickAdd.checked) { const p = fromPx(view, px, py), st = 10 ** Math.floor(Math.log10(GW / view.s / 100)); let n = 0; while (ev.objs.has(String.fromCharCode(65 + (n % 26)) + (n >= 26 ? Math.floor(n / 26) : ''))) n++; const nm = String.fromCharCode(65 + (n % 26)) + (n >= 26 ? Math.floor(n / 26) : ''); const x = Math.round(p[0] / st) * st, y = Math.round(p[1] / st) * st; setScript(script.replace(/\s*$/, '') + `\npoint ${nm} ${fmt(x)} ${fmt(y)}\n`); say(live, `Added point ${nm} at (${fmt(x)}, ${fmt(y)}).`); }
    });
    board.addEventListener('pointermove', (e) => { if (!drag) return; const [px, py] = rel(e), p = fromPx(view, px, py), st = 10 ** Math.floor(Math.log10(GW / view.s / 100)); movePoint(drag, Math.round(p[0] / st) * st, Math.round(p[1] / st) * st, false); });
    const endDrag = () => { if (drag) { say(live, `Moved ${drag}.`); drag = null; view = fitView(ev); update(); } };
    board.addEventListener('pointerup', endDrag); board.addEventListener('pointercancel', endDrag);
    board.addEventListener('keydown', (e) => {
      const free = [...ev.objs.values()].filter((o) => o.free).map((o) => o.name), s = (Number(stepIn.value) || 0.5) * (e.shiftKey ? 10 : 1), m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
      if (m && sel) { e.preventDefault(); const o = ev.objs.get(sel); movePoint(sel, o.p[0] + m[0] * s, o.p[1] + m[1] * s); say(live, `${sel} at (${fmt(ev.objs.get(sel).p[0])}, ${fmt(ev.objs.get(sel).p[1])})`); }
      else if ((e.key === '[' || e.key === ']') && free.length) { e.preventDefault(); sel = free[(free.indexOf(sel) + (e.key === ']' ? 1 : free.length - 1)) % free.length]; update(true); say(live, `Selected point ${sel}`); board.focus(); }
    });
    const svgNow = () => svgOf(ev, view, '').replace('<svg ', `<svg role="img" aria-label="${esc('Geometry construction: ' + describe(ev).items.join(' '))}" `);
    const dlSvg = btn('Download SVG', () => { if (!ev.objs.size) return say(live, 'Nothing to export.', true); dl('construction.svg', svgNow(), 'image/svg+xml'); say(live, 'SVG downloaded (it carries a text description in aria-label).'); });
    const dlTxt = btn('Download description (.txt)', () => dl('construction.txt', desc.textContent + '\n\nScript:\n' + script, 'text/plain'));
    const cpy = btn('Copy script', async () => { try { await navigator.clipboard.writeText(script); say(live, 'Script copied.'); } catch { say(live, 'Copy was blocked: select the script text and copy it by hand.', true); } });
    const fitB = btn('Fit view', () => { view = fitView(ev); update(); });
    root.append(
      h('p', { className: 'desc' }, 'Everything works from the keyboard. Type commands (or use the form), edit the script, or use the pointer: click empty space to add a point (switch off below), drag a red free point. Black points are computed from others and follow when you move a red one. The view fits all objects. Intersections are numbered: for two circles, 1 is the point on the left of the line from the first centre to the second; for a line and a circle, 1 comes first along the line direction.'),
      exW, board, h('div', { className: 'row' }, h('label', { htmlFor: clickAdd.id, style: { margin: 0 } }, 'Clicking empty space adds a point'), clickAdd, fitB), live, errBox,
      h('h3', {}, 'Add a construction with a form'), h('div', { className: 'row' }, addW), argBox,
      h('h3', {}, 'Move a free point by numbers or nudge'), h('div', { className: 'row' }, movW, mx, my, applyXY, stW, nudge(-1, 0, 'Left'), nudge(1, 0, 'Right'), nudge(0, 1, 'Up'), nudge(0, -1, 'Down')),
      h('h3', {}, 'Commands'), cmdW, scrW, h('div', { className: 'row' }, applyB, undo, redoB, delLast, clr, cpy),
      h('h3', {}, 'Description'), desc, h('div', { className: 'row' }, dlSvg, dlTxt),
      h('p', { className: 'desc' }, 'Limits: lines, segments and circles only (no conics, loci, transformations or angle arcs). Numbers are floating point, shown to 4 decimals. A construction that stops existing (for example circles that no longer meet) reports an error on that line and everything depending on it. Measures are not drawn.'));
    update();
  },
});

// ====================================================================== 1539 coding logic puzzles (grid robot + boolean circuits)
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]], DNAME = ['east', 'south', 'west', 'north'], DCH = '>v<^';
function parseMap(text) {
  const rows = String(text).replace(/\r/g, '').split('\n').map((r) => r.replace(/\s+$/, '')).filter((r) => r.length);
  if (!rows.length) throw new Error('The map is empty.'); const w = Math.max(...rows.map((r) => r.length));
  if (rows.length > 20 || w > 20) throw new Error('Maps can be at most 20 by 20.');
  const m = { rows: rows.length, cols: w, wall: [], stars: [], start: null, goal: null };
  rows.forEach((r, y) => { m.wall.push([]); for (let x = 0; x < w; x++) { const ch = r[x] || '#'; m.wall[y].push(ch === '#');
    if (ch === 'S' || DCH.includes(ch)) { if (m.start) throw new Error('Only one start (S or an arrow) is allowed.'); m.start = { r: y, c: x, d: ch === 'S' ? 0 : DCH.indexOf(ch) }; }
    else if (ch === 'G') { if (m.goal) throw new Error('Only one goal (G) is allowed.'); m.goal = { r: y, c: x }; } else if (ch === '*') m.stars.push({ r: y, c: x }); else if (ch !== '#' && ch !== '.') throw new Error(`Unknown map character "${ch}" in row ${y + 1}. Use # . S G * and the arrows > v < ^.`); } });
  if (!m.start) throw new Error('The map needs a start: S (facing east) or an arrow > v < ^.'); if (!m.goal) throw new Error('The map needs a goal: G.'); if (m.stars.length > 8) throw new Error('At most 8 stars.');
  return m;
}
// breadth-first search over (row, col, direction, stars mask). Returns shortest command string like "FFRF" or null.
function solveMap(m) {
  const full = (1 << m.stars.length) - 1, sidx = (r, c) => m.stars.findIndex((s) => s.r === r && s.c === c), key = (r, c, d, k) => ((r * 32 + c) * 4 + d) * 256 + k;
  const k0 = sidx(m.start.r, m.start.c) >= 0 ? 1 << sidx(m.start.r, m.start.c) : 0, seen = new Map([[key(m.start.r, m.start.c, m.start.d, k0), null]]); let q = [[m.start.r, m.start.c, m.start.d, k0]];
  const hit = (r, c, d, k) => r === m.goal.r && c === m.goal.c && k === full;
  if (hit(...q[0])) return '';
  while (q.length) { const nq = [];
    for (const [r, c, d, k] of q) { const from = key(r, c, d, k);
      for (const mv of 'FLR') { let nr = r, nc = c, nd = d, nk = k;
        if (mv === 'F') { nr += DIRS[d][0]; nc += DIRS[d][1]; if (nr < 0 || nc < 0 || nr >= m.rows || nc >= m.cols || m.wall[nr][nc]) continue; const s = sidx(nr, nc); if (s >= 0) nk |= 1 << s; } else nd = (d + (mv === 'R' ? 1 : 3)) % 4;
        const nkey = key(nr, nc, nd, nk); if (seen.has(nkey)) continue; seen.set(nkey, [from, mv]);
        if (hit(nr, nc, nd, nk)) { let s = '', cur = nkey; while (seen.get(cur)) { const [p, ch] = seen.get(cur); s = ch + s; cur = p; } return s; }
        nq.push([nr, nc, nd, nk]); } }
    q = nq; }
  return null;
}
// program: F L R and repeat N { ... }. Returns { cost, ast }
function parseProg(text) {
  const tk = String(text).toLowerCase().match(/[a-z]+|\d+|[{}]|\S/g) || []; let i = 0, cost = 0; const alias = { f: 'F', forward: 'F', l: 'L', left: 'L', r: 'R', right: 'R' };
  function block(end) { const out = [];
    while (i < tk.length) { const t = tk[i];
      if (t === '}') { if (!end) throw new Error('Unexpected } with no matching {.'); i++; return out; }
      if (alias[t]) { out.push(alias[t]); cost++; i++; }
      else if (t === 'repeat') { const n = Number(tk[i + 1]); if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error('repeat needs a whole number from 1 to 99, for example: repeat 3 { F }.'); if (tk[i + 2] !== '{') throw new Error('repeat N must be followed by { ... }.'); i += 3; cost++; out.push({ n, body: block(true) }); }
      else throw new Error(`Unknown word "${t}". Use F, L, R and repeat N { ... }.`); }
    if (end) throw new Error('A { is never closed with }.'); return out; }
  return { ast: block(false), cost };
}
function flatten(ast, out = []) { for (const x of ast) typeof x === 'string' ? out.push(x) : (() => { for (let k = 0; k < x.n; k++) { flatten(x.body, out); if (out.length > 5000) throw new Error('The program runs for more than 5000 steps.'); } })(); return out; }
function simulate(m, progText) {
  const { ast, cost } = parseProg(progText), cmds = flatten(ast); let { r, c, d } = m.start; const got = new Set(); const sidx = (rr, cc) => m.stars.findIndex((s) => s.r === rr && s.c === cc); if (sidx(r, c) >= 0) got.add(sidx(r, c));
  const trace = [{ r, c, d, cmd: 'start', stars: got.size }]; let err = null;
  for (const mv of cmds) { if (mv === 'F') { const nr = r + DIRS[d][0], nc = c + DIRS[d][1]; if (nr < 0 || nc < 0 || nr >= m.rows || nc >= m.cols || m.wall[nr][nc]) { err = `The robot bumped into a ${nr < 0 || nc < 0 || nr >= m.rows || nc >= m.cols ? 'edge' : 'wall'} at row ${r + 1}, column ${c + 1}, facing ${DNAME[d]}.`; trace.push({ r, c, d, cmd: 'F (blocked)', stars: got.size }); break; } r = nr; c = nc; if (sidx(r, c) >= 0) got.add(sidx(r, c)); } else d = (d + (mv === 'R' ? 1 : 3)) % 4; trace.push({ r, c, d, cmd: mv, stars: got.size }); }
  const atGoal = r === m.goal.r && c === m.goal.c, allStars = got.size === m.stars.length;
  return { ok: !err && atGoal && allStars, err, trace, cost, steps: cmds.length, atGoal, stars: got.size, msg: err || (atGoal ? (allStars ? 'Goal reached.' : `At the goal, but only ${got.size} of ${m.stars.length} stars collected.`) : `The program ended at row ${r + 1}, column ${c + 1}, not on the goal.`) };
}
const compress = (s) => { // run-length repeat for the hint
  const out = []; for (let i = 0; i < s.length;) { let j = i; while (s[j] === s[i]) j++; const n = j - i; out.push(n >= 3 ? `repeat ${n} { ${s[i]} }` : s.slice(i, j).split('').join(' ')); i = j; } return out.join(' ');
};
const ROBOT_LEVELS = [
  { title: 'Straight line', limit: 2, map: 'S....G' },
  { title: 'Around the wall', limit: 8, map: 'S...\n###.\nG...' },
  { title: 'Collect the stars', limit: 12, map: 'S.*.\n.#.#\n*.G.' },
  { title: 'Down the side', limit: 5, map: 'S...\n#...\n##..\n###G' },
  { title: 'Spiral', limit: 18, map: 'S....\n####.\nG.#..\n#.#.#\n#...#' },
  { title: 'Long way round', limit: 16, map: 'S.#...\n#.#.#.\n#.#.#.\n#...#G' },
];
// ---------------------------------------------------------------- boolean expressions
function parseBool(src) {
  const tk = String(src).match(/[A-Za-z_][A-Za-z_0-9]*|[01]|[()!&|^]|\S/g) || []; let i = 0; const vars = new Set();
  const ops = { and: 'and', '&': 'and', or: 'or', '|': 'or', xor: 'xor', '^': 'xor', nand: 'nand', nor: 'nor', xnor: 'xnor', not: 'not', '!': 'not' };
  const op = (t) => ops[(t || '').toLowerCase()];
  function bin(next, names) { let l = next(); while (names.includes(op(tk[i]))) { const o = op(tk[i++]), r = next(); l = { o, l, r }; } return l; }
  const or = () => bin(xor, ['or', 'nor']), xor = () => bin(and, ['xor', 'xnor']), and = () => bin(not, ['and', 'nand']);
  function not() { if (op(tk[i]) === 'not') { i++; return { o: 'not', l: not() }; } return atom(); }
  function atom() { const t = tk[i++]; if (t === undefined) throw new Error('The formula ends too early.'); if (t === '(') { const e = or(); if (tk[i++] !== ')') throw new Error('A ( is not closed.'); return e; } if (t === '0' || t === '1') return { c: +t }; if (/^[A-Za-z_]/.test(t) && !op(t)) { vars.add(t); return { v: t }; } throw new Error(`Unexpected "${t}" in the formula.`); }
  const ast = or(); if (i < tk.length) throw new Error(`Unexpected "${tk[i]}" after the formula.`); return { ast, vars: [...vars].sort() };
}
const evalB = (n, env) => { if (n.c !== undefined) return n.c; if (n.v) return env[n.v] ? 1 : 0; const a = evalB(n.l, env); if (n.o === 'not') return a ? 0 : 1; const b = evalB(n.r, env);
  return { and: a & b, or: a | b, xor: a ^ b, nand: (a & b) ^ 1, nor: (a | b) ^ 1, xnor: (a ^ b) ^ 1 }[n.o]; };
function truth(src, target = 1, exact = null) { // all assignments
  const { ast, vars } = parseBool(src); if (vars.length > 8) throw new Error('At most 8 different variables.'); const rows = [];
  for (let m = 0; m < 1 << vars.length; m++) { const env = {}; vars.forEach((v, i) => { env[v] = (m >> (vars.length - 1 - i)) & 1; }); const out = evalB(ast, env); const on = vars.filter((v) => env[v]).length; rows.push({ env, out, on, good: out === target && (exact == null || on === exact) }); }
  return { vars, rows, solutions: rows.filter((r) => r.good), ones: rows.filter((r) => r.out === 1).length };
}
const BOOL_LEVELS = [
  { title: 'Both on', f: 'A AND B', target: 1, exact: null },
  { title: 'Exactly one', f: 'A XOR B', target: 1, exact: null },
  { title: 'Only one switch', f: 'NOT (A AND B) AND (A OR C)', target: 1, exact: 1 },
  { title: 'Parity', f: '(A XOR B) XOR C', target: 0, exact: 2 },
  { title: 'Gate chain', f: '(A NAND B) NOR (C AND NOT D)', target: 1, exact: null },
  { title: 'Is it possible?', f: '(A AND B) AND (NOT A OR NOT B)', target: 1, exact: null, trap: true },
];
Object.assign(L, { parseMap, solveMap, parseProg, simulate, compress, ROBOT_LEVELS, BOOL_LEVELS, truth, parseBool });

T.push({
  id: 'grid-robot-and-circuit-puzzles', cat: 'Text Fun', title: 'Logic Puzzles: Program a Grid Robot or Switch a Boolean Circuit',
  desc: 'Two keyboard-playable logic puzzle sets: write a short program (F, L, R, repeat) that walks a robot to the goal, or flip switches so a gate formula gives the target output. Includes solvability checks.',
  custom: true, dom: true,
  render(root) {
    const kind = h('select', {}, h('option', { value: 'robot' }, 'Grid robot program'), h('option', { value: 'bool' }, 'Boolean circuit switches'));
    const [kW] = lab('Puzzle type', kind); const robotBox = h('div'), boolBox = h('div');
    // ---------------- robot
    let rl = 0, map = parseMap(ROBOT_LEVELS[0].map), cur = null, step = 0, custom = false;
    const rsel = h('select', {}, ...ROBOT_LEVELS.map((l, i) => h('option', { value: i }, `${i + 1}. ${l.title}`)), h('option', { value: 'c' }, 'My own map (below)')), [rsW] = lab('Level', rsel);
    const prog = h('textarea', { rows: 5, spellcheck: false, placeholder: 'repeat 5 { F }' }), [pW] = lab('Your program. Commands: F forward, L turn left, R turn right, repeat N { ... }', prog);
    const grid = h('pre', { role: 'img', tabIndex: 0, style: { font: '1.5rem/1.2 var(--font-mono)', ...CARD, letterSpacing: '.2em', display: 'inline-block' } }), rst = h('p', { role: 'status' }), info = h('p', {}), traceInfo = h('p', { role: 'status' });
    const cmap = h('textarea', { rows: 6, spellcheck: false, value: '#####\n#S.G#\n#.#.#\n#...#\n#####' }), [cmW] = lab('Own map: # wall, . floor, S start facing east (or > v < ^ for another direction), G goal, * star (up to 8)', cmap);
    const lvl = () => (custom ? { title: 'My own map', limit: null } : ROBOT_LEVELS[rl]);
    function drawGrid(t) {
      const rows = map.wall.map((row, y) => row.map((wl, x) => { if (t && t.r === y && t.c === x) return DCH[t.d]; if (map.goal.r === y && map.goal.c === x) return 'G'; if (map.stars.some((s) => s.r === y && s.c === x)) return '*'; return wl ? '#' : '.'; }).join(' '));
      grid.textContent = rows.join('\n'); const pos = t || map.start;
      grid.setAttribute('aria-label', `Map, ${map.rows} rows by ${map.cols} columns. Robot at row ${pos.r + 1}, column ${pos.c + 1} facing ${DNAME[pos.d]}. Goal at row ${map.goal.r + 1}, column ${map.goal.c + 1}. ${map.stars.length ? 'Stars at ' + map.stars.map((s) => `row ${s.r + 1} column ${s.c + 1}`).join('; ') + '. ' : ''}Walls: ${map.wall.map((row, y) => row.map((w, x) => (w ? `r${y + 1}c${x + 1}` : null)).filter(Boolean).join(' ')).filter(Boolean).join(' ') || 'none'}.`);
    }
    function setLevel() { const l = lvl(); info.textContent = custom ? 'Your own map. Use "Check solvability" below.' : `Level ${rl + 1}: ${l.title}. Use at most ${l.limit} instructions (F, L, R and repeat each count as one). Legend: # wall, . floor, G goal, * star (collect all), arrows show the robot.`; cur = null; step = 0; traceInfo.textContent = ''; say(rst, ''); drawGrid(null); }
    function loadMap(txt) { map = parseMap(txt); }
    rsel.addEventListener('change', () => { try { if (rsel.value === 'c') { custom = true; loadMap(cmap.value); } else { custom = false; rl = +rsel.value; loadMap(ROBOT_LEVELS[rl].map); } setLevel(); } catch (e) { say(rst, e.message, true); } });
    const showStep = (n) => { if (!cur) return; step = Math.max(0, Math.min(cur.trace.length - 1, n)); const t = cur.trace[step]; drawGrid(t); traceInfo.textContent = `Step ${step} of ${cur.trace.length - 1}: ${t.cmd}. Robot at row ${t.r + 1}, column ${t.c + 1} facing ${DNAME[t.d]}. Stars ${t.stars} of ${map.stars.length}.`; };
    const run = btn('Run program', () => {
      try {
        const res = simulate(map, prog.value); cur = res; const l = lvl(); const over = l.limit != null && res.cost > l.limit; showStep(res.trace.length - 1);
        const best = solveMap(map); say(rst, `${res.msg} ${res.cost} instruction${res.cost === 1 ? '' : 's'}, ${res.steps} moves${best != null ? ` (shortest possible without loops: ${best.length} moves)` : ''}.${res.ok ? (over ? ` That is over the limit of ${l.limit} instructions: shorten it with repeat.` : ' Level solved.') : ''}`, !res.ok);
      } catch (e) { say(rst, e.message, true); }
    });
    const stepB = btn('Step forward', () => (cur ? showStep(step + 1) : say(rst, 'Run the program first.', true))), backB = btn('Step back', () => (cur ? showStep(step - 1) : say(rst, 'Run the program first.', true))), startB = btn('Back to start', () => { cur = null; drawGrid(null); traceInfo.textContent = ''; });
    const hint = btn('Show a shortest solution', () => { const s = solveMap(map); say(rst, s == null ? 'This map cannot be solved.' : `A shortest path is ${s.length} moves: ${compress(s)}`, s == null); });
    const chk = btn('Check solvability of my map', () => { try { loadMap(cmap.value); const s = solveMap(map); custom = true; rsel.value = 'c'; setLevel(); say(rst, s == null ? 'Not solvable: no sequence of F, L and R reaches the goal' + (map.stars.length ? ' with all stars' : '') + ' without hitting a wall.' : `Solvable. Shortest solution: ${s.length} moves: ${compress(s) || '(already at the goal)'}.`, s == null); } catch (e) { say(rst, e.message, true); } });
    robotBox.append(rsW, info, grid, pW, h('div', { className: 'row' }, run, stepB, backB, startB, hint), rst, traceInfo, h('details', {}, h('summary', {}, 'Make or test your own map'), cmW, h('div', { className: 'row' }, chk)));
    // ---------------- boolean
    let bl = 0, tt = null;
    const bsel = h('select', {}, ...BOOL_LEVELS.map((l, i) => h('option', { value: i }, `${i + 1}. ${l.title}`)), h('option', { value: 'c' }, 'My own formula (below)')), [bsW] = lab('Level', bsel);
    const sw = h('div', { className: 'row', role: 'group', 'aria-label': 'Switches' }), goal = h('p'), form = h('p', { style: { font: '1.1rem var(--font-mono)' } }), out = h('p', { role: 'status', 'aria-live': 'polite' }), res = h('p', { role: 'status' }), gates = h('pre', { className: 'out', 'aria-label': 'Gate values' });
    const boxes = {}; let cf = { f: 'A AND B', target: 1, exact: null };
    const [fW, fIn] = lab('Formula: AND OR NOT XOR NAND NOR XNOR, ( ), 0 1, or & | ! ^. Names are letters.', h('input', { type: 'text', value: '(A OR B) AND NOT (A AND C)' })), [tW, tSel] = lab('Target output', h('select', {}, h('option', { value: '1' }, '1 (on)'), h('option', { value: '0' }, '0 (off)'))), [eW, eIn] = lab('Exactly this many switches on (empty = any)', h('input', { type: 'number', min: 0, max: 8, style: { width: '6rem' } }));
    const level = () => (bsel.value === 'c' ? cf : BOOL_LEVELS[bl]);
    function nodeStr(n) { if (n.c !== undefined) return String(n.c); if (n.v) return n.v; return n.o === 'not' ? `NOT ${nodeStr(n.l)}` : `(${nodeStr(n.l)} ${n.o.toUpperCase()} ${nodeStr(n.r)})`; }
    function setB() {
      const l = level(); let P; try { P = parseBool(l.f); } catch (e) { say(res, e.message, true); return; } if (P.vars.length > 8) { say(res, 'At most 8 different variables.', true); return; }
      goal.textContent = `Goal: make the output ${l.target}${l.exact != null ? ` with exactly ${l.exact} switch${l.exact === 1 ? '' : 'es'} on` : ''}.`; form.textContent = l.f;
      sw.replaceChildren(...P.vars.map((v) => { const c = h('input', { type: 'checkbox', id: fid('sw') }); boxes[v] = c; c.addEventListener('change', evalNow); return h('label', { htmlFor: c.id, style: { display: 'flex', gap: '.4rem', alignItems: 'center', margin: 0 } }, c, `Switch ${v}`); }));
      tt = P; say(res, ''); evalNow();
    }
    function evalNow() { const l = level(); if (!tt) return; const env = {}; tt.vars.forEach((v) => { env[v] = boxes[v]?.checked ? 1 : 0; }); const o = evalB(tt.ast, env), on = tt.vars.filter((v) => env[v]).length, ok = o === l.target && (l.exact == null || on === l.exact);
      out.textContent = `Output is ${o}. ${on} switch${on === 1 ? '' : 'es'} on. ${ok ? 'This meets the goal.' : 'Not yet.'}`; const lines = []; (function walk(n) { if (n.c !== undefined || n.v) return; walk(n.l); if (n.r) walk(n.r); lines.push(`${nodeStr(n)} = ${evalB(n, env)}`); })(tt.ast); gates.textContent = lines.join('\n') || '(no gates)'; }
    bsel.addEventListener('change', () => { if (bsel.value !== 'c') bl = +bsel.value; setB(); });
    const check = btn('Check my switches', () => { const l = level(), env = {}; tt.vars.forEach((v) => { env[v] = boxes[v].checked ? 1 : 0; }); const o = evalB(tt.ast, env), on = tt.vars.filter((v) => env[v]).length; const ok = o === l.target && (l.exact == null || on === l.exact); say(res, ok ? 'Solved.' : `Not solved: output ${o}${l.exact != null && on !== l.exact ? `, ${on} on instead of ${l.exact}` : ''}.`, !ok); });
    const imp = btn('This cannot be solved', () => { try { const l = level(), r = truth(l.f, l.target, l.exact); say(res, r.solutions.length ? `It can be solved: for example ${tt.vars.map((v) => `${v}=${r.solutions[0].env[v]}`).join(' ')} (${r.solutions.length} of ${r.rows.length} switch settings work).` : `Correct: none of the ${r.rows.length} switch settings works.`, r.solutions.length > 0); } catch (e) { say(res, e.message, true); } });
    const all = btn('Show every switch setting', () => { try { const l = level(), r = truth(l.f, l.target, l.exact), tbl = h('table', {}, h('caption', {}, `${r.solutions.length} of ${r.rows.length} settings meet the goal`), h('thead', {}, h('tr', {}, ...r.vars.map((v) => h('th', { scope: 'col' }, v)), h('th', { scope: 'col' }, 'Output'), h('th', { scope: 'col' }, 'Meets goal'))), h('tbody', {}, ...r.rows.map((x) => h('tr', {}, ...r.vars.map((v) => h('td', {}, String(x.env[v]))), h('td', {}, String(x.out)), h('td', {}, x.good ? 'yes' : 'no'))))); tableBox.replaceChildren(tbl); say(res, `Truth table below. ${r.ones} of ${r.rows.length} settings give output 1${r.ones === r.rows.length ? ' (always 1)' : r.ones === 0 ? ' (never 1: a contradiction)' : ''}.`); } catch (e) { say(res, e.message, true); } });
    const tableBox = h('div'); const useC = btn('Use my formula', () => { try { parseBool(fIn.value); cf = { f: fIn.value, target: +tSel.value, exact: eIn.value === '' ? null : Math.round(+eIn.value) }; bsel.value = 'c'; setB(); say(res, 'Custom level loaded.'); } catch (e) { say(res, e.message, true); } });
    boolBox.append(bsW, goal, h('p', { className: 'desc' }, 'Formula:'), form, sw, out, gates, h('div', { className: 'row' }, check, imp, all), res, tableBox, h('details', {}, h('summary', {}, 'Make or test your own formula'), fW, tW, eW, h('div', { className: 'row' }, useC)));
    kind.addEventListener('change', () => { robotBox.hidden = kind.value !== 'robot'; boolBox.hidden = kind.value !== 'bool'; });
    boolBox.hidden = true;
    root.append(h('p', { className: 'desc' }, 'Pick a puzzle type. Both are text and checkbox based, so the whole thing works with the keyboard and a screen reader. The solvability checks are exact: the robot check is a breadth-first search over every position, direction and star set; the circuit check tries every switch setting. Block-based drag and drop is not offered: the program is typed.'), kW, robotBox, boolBox);
    setLevel(); setB();
  },
});

// ====================================================================== 1549 document scanner
// homography / warpPerspective: copied from new18.js (perspective-corrector), which does not export them.
function homography(from, to) {
  const A = [], bb = []; for (let i = 0; i < 4; i++) { const [x, y] = from[i], [u, v] = to[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); bb.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); bb.push(v); }
  for (let c = 0; c < 8; c++) { let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (Math.abs(A[p][c]) < 1e-12) throw new Error('The four corners must form a real four-sided shape (no three in a line).'); [A[c], A[p]] = [A[p], A[c]]; [bb[c], bb[p]] = [bb[p], bb[c]]; for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; bb[r] -= f * bb[c]; } }
  return bb.map((v, i) => v / A[i][i]);
}
function warpPerspective(src, sw, sh, quad, dw, dh) { // quad: TL,TR,BR,BL in source pixel coordinates
  const H = homography([[0, 0], [dw, 0], [dw, dh], [0, dh]], quad), out = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const X = x + 0.5, Y = y + 0.5, den = H[6] * X + H[7] * Y + 1, u = (H[0] * X + H[1] * Y + H[2]) / den - 0.5, v = (H[3] * X + H[4] * Y + H[5]) / den - 0.5, o = (y * dw + x) * 4;
    if (u < -1 || v < -1 || u > sw || v > sh) continue; const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    for (let k = 0; k < 4; k++) { const g = (xx, yy) => src[(Math.min(sh - 1, Math.max(0, yy)) * sw + Math.min(sw - 1, Math.max(0, xx))) * 4 + k]; out[o + k] = g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy; }
  }
  return out;
}
// ---- corner detection (heuristic): paper = the biggest light (or dark) blob after thresholding a downscaled, blurred copy
const luma = (d, n) => { const g = new Float32Array(n); for (let i = 0; i < n; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; return g; };
function boxBlur(g, w, hh, r) { // integral-image box blur, edge-clamped window
  const I = new Float64Array((w + 1) * (hh + 1)); for (let y = 0; y < hh; y++) { let s = 0; for (let x = 0; x < w; x++) { s += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + s; } }
  const o = new Float32Array(w * hh); for (let y = 0; y < hh; y++) { const y0 = Math.max(0, y - r), y1 = Math.min(hh, y + r + 1); for (let x = 0; x < w; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1); o[y * w + x] = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0)); } }
  return o;
}
function otsu(g) { const hist = new Float64Array(256); for (const v of g) hist[Math.max(0, Math.min(255, Math.round(v)))]++; const tot = g.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i]; let wb = 0, sb = 0, best = 0, bt = 128; for (let t = 0; t < 256; t++) { wb += hist[t]; if (!wb) continue; const wf = tot - wb; if (!wf) break; sb += t * hist[t]; const mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) ** 2; if (v > best) { best = v; bt = t; } } return bt; }
function morph(mask, w, hh, r, grow) { // box erosion (grow=false) or dilation (grow=true) using separable running counts
  const tmp = new Uint8Array(w * hh), out = new Uint8Array(w * hh), win = 2 * r + 1;
  for (let y = 0; y < hh; y++) { let c = 0; for (let x = -r; x <= r; x++) if (x >= 0 && x < w) c += mask[y * w + x]; for (let x = 0; x < w; x++) { tmp[y * w + x] = grow ? (c > 0 ? 1 : 0) : (c === win ? 1 : 0); const a = x + r + 1, b = x - r; if (a < w) c += mask[y * w + a]; if (b >= 0) c -= mask[y * w + b]; } }
  for (let x = 0; x < w; x++) { let c = 0; for (let y = -r; y <= r; y++) if (y >= 0 && y < hh) c += tmp[y * w + x]; for (let y = 0; y < hh; y++) { out[y * w + x] = grow ? (c > 0 ? 1 : 0) : (c === win ? 1 : 0); const a = y + r + 1, b = y - r; if (a < hh) c += tmp[a * w + x]; if (b >= 0) c -= tmp[b * w + x]; } }
  return out;
}
function biggestBlob(mask, w, hh) { const lab = new Int32Array(w * hh), stack = new Int32Array(w * hh); let best = { n: 0, id: 0 }, id = 0;
  for (let s = 0; s < mask.length; s++) { if (!mask[s] || lab[s]) continue; id++; let n = 0, sp = 0; stack[sp++] = s; lab[s] = id; while (sp) { const p = stack[--sp], x = p % w, y = (p / w) | 0; n++; if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[sp++] = p - 1; } if (x < w - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[sp++] = p + 1; } if (y > 0 && mask[p - w] && !lab[p - w]) { lab[p - w] = id; stack[sp++] = p - w; } if (y < hh - 1 && mask[p + w] && !lab[p + w]) { lab[p + w] = id; stack[sp++] = p + w; } } if (n > best.n) best = { n, id }; }
  return { lab, ...best }; }
// data: RGBA bytes. Returns { quad: [[x,y]x4] in source px (TL,TR,BR,BL), score 0..1, note }
function detectQuad(data, W, H) {
  const k = Math.max(1, Math.max(W, H) / 320), w = Math.max(8, Math.round(W / k)), hh = Math.max(8, Math.round(H / k)), g = new Float32Array(w * hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const x0 = Math.floor(x * k), x1 = Math.max(x0 + 1, Math.min(W, Math.floor((x + 1) * k))), y0 = Math.floor(y * k), y1 = Math.max(y0 + 1, Math.min(H, Math.floor((y + 1) * k))); let s = 0, c = 0; for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const o = (yy * W + xx) * 4; s += 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]; c++; } g[y * w + x] = s / c; }
  const b = boxBlur(boxBlur(g, w, hh, 2), w, hh, 2), t = otsu(b); let best = null;
  for (const light of [true, false]) {
    let m = new Uint8Array(w * hh); for (let i = 0; i < m.length; i++) m[i] = (light ? b[i] > t : b[i] <= t) ? 1 : 0;
    const r = Math.max(1, Math.round(w / 100)); m = morph(morph(m, w, hh, r, false), w, hh, r, true); m = morph(morph(m, w, hh, r, true), w, hh, r, false); // open then close
    const { lab, n, id } = biggestBlob(m, w, hh); if (!n) continue;
    let a = [0, 0], bb = [0, 0], c = [0, 0], d = [0, 0], mn = Infinity, mx = -Infinity, dn = Infinity, dx = -Infinity, ex = -Infinity, en = Infinity; // TL min(x+y), BR max(x+y), TR max(x-y), BL min(x-y)
    for (let i = 0; i < lab.length; i++) if (lab[i] === id) { const x = i % w, y = (i / w) | 0, s = x + y, df = x - y; if (s < mn) { mn = s; a = [x, y]; } if (s > mx) { mx = s; c = [x, y]; } if (df > dx) { dx = df; bb = [x, y]; } if (df < dn) { dn = df; d = [x, y]; } }
    const q = [a, bb, c, d], area = Math.abs(q.reduce((s, p, i) => { const o = q[(i + 1) % 4]; return s + p[0] * o[1] - o[0] * p[1]; }, 0)) / 2; if (area < 1) continue;
    const frac = n / (w * hh), fill = Math.min(1, n / area), score = fill * (frac > 0.1 && frac < 0.97 ? 1 : 0.4) * (frac < 0.03 ? 0.2 : 1);
    if (!best || score > best.score) best = { q, score, light, frac };
  }
  if (!best) return { quad: [[0, 0], [W, 0], [W, H], [0, H]], score: 0, note: 'No page-like area found: the whole picture is used. Set the corners by hand.' };
  const pad = [[0, 0], [1, 0], [1, 1], [0, 1]]; // corners of a pixel block: use outer edge of the extreme pixel
  const quad = best.q.map((p, i) => [Math.min(W, Math.max(0, (p[0] + pad[i][0]) * k)), Math.min(H, Math.max(0, (p[1] + pad[i][1]) * k))]);
  return { quad, score: Math.round(best.score * 100) / 100, note: `Found a ${best.light ? 'lighter' : 'darker'} page-like area covering ${Math.round(best.frac * 100)}% of the picture (confidence ${Math.round(best.score * 100)}%). Check the corners.` };
}
// ---- clean-up. mode: 'color' | 'gray' | 'bw'. Returns RGBA bytes (new array).
function cleanUp(data, w, hh, mode, o = {}) {
  const n = w * hh, gl = luma(data, n), r = Math.max(4, Math.round(Math.max(w, hh) * (o.window ?? 0.04))), bg = boxBlur(boxBlur(gl, w, hh, r), w, hh, r), out = new Uint8ClampedArray(n * 4), boost = o.contrast ?? 30, sens = (o.sens ?? 30) / 100;
  for (let i = 0; i < n; i++) {
    const bl = Math.max(bg[i], 1), f = 255 / bl; let rr = data[i * 4] * f, gg = data[i * 4 + 1] * f, bbv = data[i * 4 + 2] * f; // divide out the slowly varying light
    if (mode === 'bw') { const v = gl[i] < bg[i] * (1 - sens) ? 0 : 255; rr = gg = bbv = v; }
    else { const gray = mode === 'gray'; if (gray) rr = gg = bbv = 0.299 * rr + 0.587 * gg + 0.114 * bbv; const kk = 1 + boost / 50, cv = (v) => Math.max(0, Math.min(255, (v / 255 - 0.5) * kk * 255 + 127.5 + (kk - 1) * 40)); rr = cv(rr); gg = cv(gg); bbv = cv(bbv); }
    out[i * 4] = rr; out[i * 4 + 1] = gg; out[i * 4 + 2] = bbv; out[i * 4 + 3] = 255;
  }
  return out;
}
// ---- minimal PDF writer: pages = [{w, h (px), kind:'jpeg'|'gray', bytes}] ; dpi sets the page size (or fit to a paper)
async function deflate(u8) { const cs = new CompressionStream('deflate'), wr = cs.writable.getWriter(); wr.write(u8); wr.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); }
function buildPdf(pages, paper, dpi) {
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0; const put = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  put('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'); const obj = (i, f) => { offs[i] = len; put(`${i} 0 obj\n`); f(); put('\nendobj\n'); };
  const np = pages.length, kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>')); obj(2, () => put(`<< /Type /Pages /Kids [${kids}] /Count ${np} >>`));
  pages.forEach((p, i) => {
    const pg = 3 + i * 3, ct = pg + 1, im = pg + 2; let pw = (p.w * 72) / dpi, ph = (p.h * 72) / dpi, dw = pw, dh = ph, ox = 0, oy = 0;
    if (paper !== 'scan') { const [A, B] = paper === 'letter' ? [612, 792] : [595.28, 841.89]; const [W2, H2] = p.w > p.h ? [B, A] : [A, B], s = Math.min(W2 / p.w, H2 / p.h); pw = W2; ph = H2; dw = p.w * s; dh = p.h * s; ox = (W2 - dw) / 2; oy = (H2 - dh) / 2; }
    const f = (v) => v.toFixed(3), stream = `q ${f(dw)} 0 0 ${f(dh)} ${f(ox)} ${f(oy)} cm /Im0 Do Q`;
    obj(pg, () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pw)} ${f(ph)}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`));
    obj(ct, () => put(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`));
    obj(im, () => { put(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /${p.kind === 'jpeg' ? 'DeviceRGB' : 'DeviceGray'} /BitsPerComponent 8 /Filter /${p.kind === 'jpeg' ? 'DCTDecode' : 'FlateDecode'} /Length ${p.bytes.length} >>\nstream\n`); put(p.bytes); put('\nendstream'); });
  });
  const total = 2 + np * 3, xr = len; put(`xref\n0 ${total + 1}\n0000000000 65535 f \n`); for (let i = 1; i <= total; i++) put(String(offs[i]).padStart(10, '0') + ' 00000 n \n'); put(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF\n`);
  const out = new Uint8Array(len); let o = 0; for (const b of parts) { out.set(b, o); o += b.length; } return out;
}
Object.assign(L, { detectQuad, cleanUp, warpPerspective, buildPdf, deflate, homography });

T.push({
  id: 'document-scanner-clean-pdf', cat: 'Images', title: 'Document Scanner: Straighten, Clean Up and Save Photos of Pages as PDF',
  desc: 'Load photos of paper pages, find the page corners automatically or type them in, straighten the perspective, flatten shadows to black and white or grey, and save a multi-page PDF. All local.',
  custom: true, dom: true,
  render(root) {
    const NM = ['top left', 'top right', 'bottom right', 'bottom left'], DEF = [[5, 5], [95, 5], [95, 95], [5, 95]]; let bmp = null, srcData = null, name = 'scan', q = DEF.map((p) => p.slice()), drag = -1, selC = 0, pages = [], last = null, urls = [];
    const file = h('input', { type: 'file', accept: 'image/*', multiple: false }), [fW] = lab('Photo of a page (a camera photo from your phone works too: choose "Take photo" in the file dialog)', file);
    const cv = h('canvas', { width: 640, height: 420, role: 'img', tabIndex: 0, style: { maxWidth: '100%', touchAction: 'none', border: '1px solid var(--border-strong)', cursor: 'crosshair' } }), status = h('p', { role: 'status' }), res = h('div'), pageList = h('div'), grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(11rem,1fr))', gap: '.5rem' } });
    const ins = []; NM.forEach((nm, i) => { for (const [a, ax] of [[0, 'x'], [1, 'y']]) { const inp = h('input', { type: 'number', min: 0, max: 100, step: 0.1, value: DEF[i][a], style: { width: '6rem' } }); inp.addEventListener('input', () => { q[i][a] = Math.max(0, Math.min(100, +inp.value || 0)); draw(); }); ins.push([i, a, inp]); grid.append(lab(`Corner ${i + 1} ${nm}, ${ax === 'x' ? 'across' : 'down'} (% of picture)`, inp)[0]); } });
    const sync = () => { for (const [i, a, inp] of ins) inp.value = String(Math.round(q[i][a] * 10) / 10); };
    const [mW, mode] = lab('Clean-up', h('select', {}, h('option', { value: 'color' }, 'Colour, shadows flattened'), h('option', { value: 'gray' }, 'Grey, shadows flattened'), h('option', { value: 'bw' }, 'Black and white (adaptive threshold)'))), [cW, con] = lab('Contrast boost (0 to 100)', h('input', { type: 'number', min: 0, max: 100, value: 30, style: { width: '6rem' } })), [sW, sens] = lab('Black and white sensitivity (% darker than the surroundings; lower keeps faint text, higher removes more noise)', h('input', { type: 'number', min: 2, max: 60, value: 30, style: { width: '6rem' } })), [wW, wid] = lab('Output width (px, 0 = automatic)', h('input', { type: 'number', min: 0, max: 4000, value: 0, style: { width: '7rem' } })), [shW, shape] = lab('Page shape (a photo taken at an angle cannot tell the true proportions: pick the paper size if you know it)', h('select', {}, ...[['photo', 'As measured in the photo'], ['1.4142', 'A4 portrait'], ['0.70711', 'A4 landscape'], ['1.2941', 'US Letter portrait'], ['0.77273', 'US Letter landscape'], ['1', 'Square']].map(([v, t]) => h('option', { value: v }, t))));
    const [pW, paper] = lab('PDF page', h('select', {}, h('option', { value: 'scan' }, 'Same shape as each scan (150 dpi)'), h('option', { value: 'a4' }, 'A4, scan fitted'), h('option', { value: 'letter' }, 'US Letter, scan fitted')));
    const draw = () => {
      const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); if (!bmp) { x.fillStyle = '#8884'; x.fillRect(0, 0, cv.width, cv.height); cv.setAttribute('aria-label', 'No photo chosen yet'); return; } x.drawImage(bmp, 0, 0, cv.width, cv.height);
      const P = q.map((p) => [(p[0] / 100) * cv.width, (p[1] / 100) * cv.height]); x.lineJoin = 'round'; for (const [w, c] of [[5, '#000'], [2, '#fff']]) { x.lineWidth = w; x.strokeStyle = c; x.beginPath(); P.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); x.stroke(); }
      P.forEach((p, i) => { x.fillStyle = i === selC ? '#ffd60a' : '#fff'; x.strokeStyle = '#000'; x.lineWidth = 2; x.beginPath(); x.arc(p[0], p[1], 11, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#000'; x.font = 'bold 13px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(i + 1), p[0], p[1] + 1); });
      cv.setAttribute('aria-label', `Photo ${name} with page corners at ${q.map((p, i) => `${i + 1} ${NM[i]}: ${Math.round(p[0])}% across, ${Math.round(p[1])}% down`).join('; ')}. Selected corner ${selC + 1}. Keys: [ and ] choose a corner, arrow keys move it, shift for bigger steps.`);
    };
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100]; };
    cv.addEventListener('pointerdown', (e) => { if (!bmp) return; const p = pos(e), r = cv.getBoundingClientRect(); let b = 0, bd = 1e9; q.forEach((c, i) => { const d = Math.hypot(((c[0] - p[0]) / 100) * r.width, ((c[1] - p[1]) / 100) * r.height); if (d < bd) { bd = d; b = i; } }); if (bd < 40) { drag = b; selC = b; cv.setPointerCapture(e.pointerId); draw(); } });
    cv.addEventListener('pointermove', (e) => { if (drag < 0) return; const p = pos(e); q[drag] = [Math.max(0, Math.min(100, p[0])), Math.max(0, Math.min(100, p[1]))]; sync(); draw(); });
    cv.addEventListener('pointerup', () => { drag = -1; });
    cv.addEventListener('keydown', (e) => { const s = e.shiftKey ? 5 : 0.5, m = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key]; if (e.key === '[' || e.key === ']') { e.preventDefault(); selC = (selC + (e.key === ']' ? 1 : 3)) % 4; draw(); say(status, `Corner ${selC + 1}, ${NM[selC]}`); } else if (m) { e.preventDefault(); q[selC] = [Math.max(0, Math.min(100, q[selC][0] + m[0])), Math.max(0, Math.min(100, q[selC][1] + m[1]))]; sync(); draw(); } });
    const auto = btn('Find the page corners automatically', () => { if (!srcData) return say(status, 'Choose a photo first.', true); const r = detectQuad(srcData.data, srcData.width, srcData.height); q = r.quad.map((p) => [(p[0] / srcData.width) * 100, (p[1] / srcData.height) * 100]); sync(); draw(); say(status, r.note, r.score < 0.5); });
    const reset = btn('Reset corners', () => { q = DEF.map((p) => p.slice()); sync(); draw(); });
    file.addEventListener('change', async () => { const f = file.files[0]; if (!f) return; try { bmp = await createImageBitmap(f); name = f.name.replace(/\.[^.]+$/, ''); const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); srcData = c.getContext('2d').getImageData(0, 0, c.width, c.height); const kk = Math.min(1, 800 / bmp.width); cv.width = Math.round(bmp.width * kk); cv.height = Math.round(bmp.height * kk); q = DEF.map((p) => p.slice()); sync(); draw(); res.replaceChildren(); say(status, `${f.name}: ${bmp.width} x ${bmp.height} px. Press "Find the page corners automatically", then check them.`); } catch (e) { bmp = null; srcData = null; draw(); say(status, 'This file could not be read as a picture.', true); } });
    const scan = btn('Straighten and clean up', async () => {
      if (!srcData) return say(status, 'Choose a photo first.', true);
      try {
        const sw = srcData.width, sh = srcData.height, Q = q.map((p) => [(p[0] / 100) * sw, (p[1] / 100) * sh]), d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
        let W = Math.round(+wid.value) || Math.round(Math.max(d(Q[0], Q[1]), d(Q[3], Q[2]))), Hh = shape.value === 'photo' ? Math.round(Math.max(d(Q[0], Q[3]), d(Q[1], Q[2])) * (W / Math.max(d(Q[0], Q[1]), d(Q[3], Q[2])))) : Math.round(W * +shape.value); if (!(W >= 16 && Hh >= 16)) throw new Error('The output would be too small. Move the corners apart.'); if (W * Hh > 16e6) throw new Error('The output would be over 16 megapixels. Set a smaller output width.');
        const warped = warpPerspective(srcData.data, sw, sh, Q, W, Hh), clean = cleanUp(warped, W, Hh, mode.value, { contrast: +con.value, sens: +sens.value }); const c = document.createElement('canvas'); c.width = W; c.height = Hh; c.getContext('2d').putImageData(new ImageData(clean, W, Hh), 0, 0);
        c.style.maxWidth = '100%'; c.setAttribute('role', 'img'); c.setAttribute('aria-label', `Scanned page, ${W} by ${Hh} pixels, ${mode.selectedOptions[0].textContent}`); last = { c, W, Hh, clean, mode: mode.value };
        const png = await new Promise((r) => c.toBlob(r, 'image/png')); urls.forEach(URL.revokeObjectURL); urls = [URL.createObjectURL(png)];
        res.replaceChildren(c, h('div', { className: 'row' }, h('a', { href: urls[0], download: `${name}-scan.png`, className: 'btn' }, 'Download PNG'), btn('Add this page to the PDF', addPage))); say(status, `Done: ${W} x ${Hh} px. Add it to the PDF, or change the settings and run again.`);
      } catch (e) { say(status, e.message, true); }
    });
    async function addPage() {
      if (!last) return; let kind = 'gray', bytes;
      if (last.mode === 'color') { kind = 'jpeg'; bytes = new Uint8Array(await (await new Promise((r) => last.c.toBlob(r, 'image/jpeg', 0.85))).arrayBuffer()); }
      else { const g = new Uint8Array(last.W * last.Hh); for (let i = 0; i < g.length; i++) g[i] = last.clean[i * 4]; bytes = await deflate(g); }
      pages.push({ w: last.W, h: last.Hh, kind, bytes, label: `${name} (${last.W} x ${last.Hh}, ${last.mode})` }); listPages(); say(status, `Page ${pages.length} added.`);
    }
    function listPages() {
      pageList.replaceChildren(h('h3', {}, `PDF pages: ${pages.length}`), pages.length ? h('ol', {}, ...pages.map((p, i) => h('li', {}, p.label + ' ', btn('Up', () => { if (i) { [pages[i - 1], pages[i]] = [pages[i], pages[i - 1]]; listPages(); } }, { 'aria-label': `Move page ${i + 1} up` }), btn('Down', () => { if (i < pages.length - 1) { [pages[i + 1], pages[i]] = [pages[i], pages[i + 1]]; listPages(); } }, { 'aria-label': `Move page ${i + 1} down` }), btn('Remove', () => { pages.splice(i, 1); listPages(); }, { 'aria-label': `Remove page ${i + 1}` })))) : h('p', { className: 'desc' }, 'No pages yet.'), btn('Download PDF', () => { if (!pages.length) return say(status, 'Add at least one page first.', true); dl('scan.pdf', buildPdf(pages, paper.value, 150), 'application/pdf'); say(status, `PDF with ${pages.length} page${pages.length === 1 ? '' : 's'} downloaded.`); }));
    }
    root.append(h('p', { className: 'desc' }, 'Choose a photo, let the tool guess the page corners (or type them), straighten, clean up, and collect pages into one PDF. Corner finding is a simple heuristic: it looks for the biggest light or dark blob and takes its four extreme points, so it works best on a page on a plain contrasting surface. Always check the corners; keyboard users can type them in the number boxes or use [ ] and the arrow keys on the picture.'), fW, cv, h('div', { className: 'row' }, auto, reset), status, grid, h('div', { className: 'row' }, mW, cW, sW, wW, shW), h('div', { className: 'row' }, scan), res, h('div', { className: 'row' }, pW), pageList);
    listPages(); draw();
    return () => urls.forEach(URL.revokeObjectURL);
  },
});

// ====================================================================== 1550 whiteboard
const WB_COL = { Black: '#111111', Red: '#c0392b', Blue: '#1f5fbf', Green: '#1e7e34', Orange: '#d9730d' };
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const rectN = (o) => [Math.min(o.a[0], o.b[0]), Math.min(o.a[1], o.b[1]), Math.max(o.a[0], o.b[0]), Math.max(o.a[1], o.b[1])];
function wbDist(o, p) {
  if (o.type === 'pen') { let d = Infinity; if (o.pts.length === 1) return Math.hypot(p[0] - o.pts[0][0], p[1] - o.pts[0][1]); for (let i = 1; i < o.pts.length; i++) d = Math.min(d, segDist(p, o.pts[i - 1], o.pts[i])); return d; }
  if (o.type === 'line') return segDist(p, o.a, o.b);
  if (o.type === 'rect') { const [x0, y0, x1, y1] = rectN(o); return Math.min(segDist(p, [x0, y0], [x1, y0]), segDist(p, [x1, y0], [x1, y1]), segDist(p, [x1, y1], [x0, y1]), segDist(p, [x0, y1], [x0, y0])); }
  if (o.type === 'ellipse') { const [x0, y0, x1, y1] = rectN(o), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.max(1e-6, (x1 - x0) / 2), ry = Math.max(1e-6, (y1 - y0) / 2), k = Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry); return Math.abs(k - 1) * Math.min(rx, ry); }
  const w = o.text.length * o.size * 0.6; return p[0] >= o.p[0] && p[0] <= o.p[0] + w && p[1] >= o.p[1] - o.size && p[1] <= o.p[1] ? 0 : Infinity;
}
const wbBox = (o) => { if (o.type === 'pen') { const xs = o.pts.map((q) => q[0]), ys = o.pts.map((q) => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; } if (o.type === 'text') return [o.p[0], o.p[1] - o.size, o.p[0] + o.text.length * o.size * 0.6, o.p[1]]; return rectN(o); };
const r1 = (v) => Math.round(v * 10) / 10;
function wbSvg(objs, box, bg) { // box: [x0,y0,x1,y1] in world units
  const [x0, y0, x1, y1] = box, W = x1 - x0, H = y1 - y0, p = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r1(x0)} ${r1(y0)} ${r1(W)} ${r1(H)}" width="${Math.round(W)}" height="${Math.round(H)}">`];
  if (bg) p.push(`<rect x="${r1(x0)}" y="${r1(y0)}" width="${r1(W)}" height="${r1(H)}" fill="#ffffff"/>`);
  for (const o of objs) {
    const st = `stroke="${o.color}" stroke-width="${o.w}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
    if (o.type === 'pen') p.push(o.pts.length === 1 ? `<circle cx="${r1(o.pts[0][0])}" cy="${r1(o.pts[0][1])}" r="${o.w / 2}" fill="${o.color}"/>` : `<path d="M${o.pts.map((q) => r1(q[0]) + ' ' + r1(q[1])).join(' L')}" ${st}/>`);
    else if (o.type === 'line') p.push(`<line x1="${r1(o.a[0])}" y1="${r1(o.a[1])}" x2="${r1(o.b[0])}" y2="${r1(o.b[1])}" ${st}/>`);
    else if (o.type === 'rect') { const [a, b, c, d] = rectN(o); p.push(`<rect x="${r1(a)}" y="${r1(b)}" width="${r1(c - a)}" height="${r1(d - b)}" ${st}/>`); }
    else if (o.type === 'ellipse') { const [a, b, c, d] = rectN(o); p.push(`<ellipse cx="${r1((a + c) / 2)}" cy="${r1((b + d) / 2)}" rx="${r1((c - a) / 2)}" ry="${r1((d - b) / 2)}" ${st}/>`); }
    else p.push(`<text x="${r1(o.p[0])}" y="${r1(o.p[1])}" font-family="sans-serif" font-size="${o.size}" fill="${o.color}">${esc(o.text)}</text>`);
  }
  p.push('</svg>'); return p.join('\n');
}
const wbName = (o, i) => `${i + 1}: ${o.type === 'pen' ? `freehand stroke of ${o.pts.length} points near (${Math.round(o.pts[0][0])}, ${Math.round(o.pts[0][1])})` : o.type === 'text' ? `text "${o.text.slice(0, 30)}" at (${Math.round(o.p[0])}, ${Math.round(o.p[1])})` : `${o.type} from (${Math.round(o.a[0])}, ${Math.round(o.a[1])}) to (${Math.round(o.b[0])}, ${Math.round(o.b[1])})`}`;
Object.assign(L, { wbSvg, wbDist, wbBox });

T.push({
  id: 'whiteboard-pan-zoom-canvas', cat: 'Images', title: 'Whiteboard: Pan, Zoom and Draw with Mouse, Touch or Keyboard',
  desc: 'A sketch canvas you can pan and zoom without limits. Pen, line, rectangle, ellipse, text and eraser, undo and redo, with full keyboard drawing. Exports SVG or PNG; nothing leaves the page.',
  custom: true, dom: true,
  render(root) {
    const CW = 960, CH = 560; let objs = [], hist = [], redo = [], view = { x: 0, y: 0, z: 1 }, cur = null, cursor = [CW / 2, CH / 2], kdown = false, anchor = null, panning = null;
    const cv = h('canvas', { width: CW, height: CH, tabIndex: 0, role: 'img', style: { maxWidth: '100%', background: '#fff', border: '1px solid var(--border-strong)', touchAction: 'none', cursor: 'crosshair' } }), live = h('p', { role: 'status' }), list = h('ol', { style: { margin: 0, paddingInlineStart: '1.5rem' } });
    const [tW, tool] = lab('Tool', h('select', {}, ...[['pen', 'Pen'], ['line', 'Line'], ['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['text', 'Text'], ['erase', 'Eraser (removes the object you touch)'], ['pan', 'Pan the view']].map(([v, t]) => h('option', { value: v }, t)))), [cW, col] = lab('Colour', h('select', {}, ...Object.keys(WB_COL).map((k) => h('option', { value: WB_COL[k] }, k)))), [wW, wid] = lab('Line width', h('select', {}, h('option', { value: 2 }, 'Thin'), h('option', { value: 4, selected: true }, 'Medium'), h('option', { value: 8 }, 'Thick'))), [xW, txt] = lab('Text to place', h('input', { type: 'text', value: 'Note', style: { width: '12rem' } })), [fsW, fs] = lab('Text size', h('input', { type: 'number', min: 8, max: 200, value: 24, style: { width: '5rem' } }));
    const s2w = (sx, sy) => [sx / view.z + view.x, sy / view.z + view.y], w2s = (p) => [(p[0] - view.x) * view.z, (p[1] - view.y) * view.z];
    const snapshot = () => JSON.stringify(objs);
    function commit(o) { hist.push(snapshot()); if (hist.length > 200) hist.shift(); redo = []; if (o) objs.push(o); describe(); draw(); }
    function drawObj(x, o, z) {
      x.strokeStyle = x.fillStyle = o.color || '#111'; x.lineWidth = Math.max(1, o.w * z); x.lineCap = x.lineJoin = 'round'; const P = (q) => w2s(q);
      if (o.type === 'pen') { x.beginPath(); o.pts.forEach((q, i) => { const s = P(q); i ? x.lineTo(s[0], s[1]) : x.moveTo(s[0], s[1]); }); if (o.pts.length === 1) { const s = P(o.pts[0]); x.arc(s[0], s[1], x.lineWidth / 2, 0, 7); x.fill(); } else x.stroke(); }
      else if (o.type === 'line') { const a = P(o.a), b = P(o.b); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); }
      else if (o.type === 'rect') { const [a, b, c, d] = rectN(o), s = P([a, b]); x.strokeRect(s[0], s[1], (c - a) * z, (d - b) * z); }
      else if (o.type === 'ellipse') { const [a, b, c, d] = rectN(o), s = P([(a + c) / 2, (b + d) / 2]); x.beginPath(); x.ellipse(s[0], s[1], Math.max(0.1, ((c - a) / 2) * z), Math.max(0.1, ((d - b) / 2) * z), 0, 0, 7); x.stroke(); }
      else { const s = P(o.p); x.font = `${o.size * z}px sans-serif`; x.textBaseline = 'alphabetic'; x.fillText(o.text, s[0], s[1]); }
    }
    function draw() {
      const x = cv.getContext('2d'); x.clearRect(0, 0, CW, CH);
      // faint grid so panning and zoom are visible
      const g = 50 * 2 ** Math.round(-Math.log2(view.z)); x.strokeStyle = '#e4e6ea'; x.lineWidth = 1; x.beginPath(); for (let wx = Math.floor(view.x / g) * g; wx < view.x + CW / view.z; wx += g) { const s = (wx - view.x) * view.z; x.moveTo(s, 0); x.lineTo(s, CH); } for (let wy = Math.floor(view.y / g) * g; wy < view.y + CH / view.z; wy += g) { const s = (wy - view.y) * view.z; x.moveTo(0, s); x.lineTo(CW, s); } x.stroke();
      for (const o of objs) drawObj(x, o, view.z); if (cur) drawObj(x, cur, view.z);
      if (document.activeElement === cv) { const c = w2s(cursor); x.strokeStyle = '#d6336c'; x.lineWidth = 2; x.beginPath(); x.moveTo(c[0] - 10, c[1]); x.lineTo(c[0] + 10, c[1]); x.moveTo(c[0], c[1] - 10); x.lineTo(c[0], c[1] + 10); x.stroke(); }
      cv.setAttribute('aria-label', `Whiteboard with ${objs.length} object${objs.length === 1 ? '' : 's'} (listed below the board). View top-left at (${Math.round(view.x)}, ${Math.round(view.y)}), zoom ${Math.round(view.z * 100)}%. Tool: ${tool.selectedOptions[0].textContent}. ${kdown ? 'Pen is down.' : ''} Keyboard: arrows move the cursor, space draws or places, alt plus arrows pan, plus and minus zoom.`);
    }
    function describe() { list.replaceChildren(...objs.map((o, i) => h('li', {}, wbName(o, i) + ' ', btn('Delete', () => { commit(); objs.splice(i, 1); describe(); draw(); say(live, `Deleted object ${i + 1}.`); }, { 'aria-label': `Delete object ${i + 1}` })))); if (!objs.length) list.replaceChildren(h('li', { style: { listStyle: 'none' } }, 'Empty.')); }
    const mk = (a, b) => { const t = tool.value; return t === 'pen' ? { type: 'pen', pts: [a], color: col.value, w: +wid.value } : { type: t, a, b: b || a, color: col.value, w: +wid.value }; };
    function place(p) { const t = txt.value; if (!t.trim()) return say(live, 'Type the text to place first.', true); commit({ type: 'text', p: p.slice(), text: t, size: Math.max(8, +fs.value || 24), color: col.value }); say(live, `Text placed at (${Math.round(p[0])}, ${Math.round(p[1])}).`); }
    function eraseAt(p) { let bi = -1, bd = 1e9; objs.forEach((o, i) => { const d = wbDist(o, p) - (o.w || 0) / 2; if (d < bd) { bd = d; bi = i; } }); if (bi >= 0 && bd <= 10 / view.z) { commit(); objs.splice(bi, 1); describe(); draw(); say(live, `Erased object ${bi + 1}.`); } else say(live, 'Nothing there to erase.'); }
    const evPos = (e) => { const r = cv.getBoundingClientRect(); return s2w(((e.clientX - r.left) / r.width) * CW, ((e.clientY - r.top) / r.height) * CH); };
    cv.addEventListener('pointerdown', (e) => {
      cv.focus({ preventScroll: true }); const p = evPos(e); cursor = p;
      if (e.button === 1 || tool.value === 'pan') { panning = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; cv.setPointerCapture(e.pointerId); return; }
      if (tool.value === 'text') return place(p); if (tool.value === 'erase') return eraseAt(p);
      cur = mk(p, p); anchor = p; cv.setPointerCapture(e.pointerId); draw();
    });
    cv.addEventListener('pointermove', (e) => {
      if (panning) { const r = cv.getBoundingClientRect(), k = CW / r.width; view.x = panning.vx - ((e.clientX - panning.sx) * k) / view.z; view.y = panning.vy - ((e.clientY - panning.sy) * k) / view.z; draw(); return; }
      if (!cur || kdown) return; const p = evPos(e); if (cur.type === 'pen') { const l = cur.pts[cur.pts.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) * view.z >= 1.5) cur.pts.push(p); } else cur.b = p; draw();
    });
    const up = () => { panning = null; if (cur && !kdown) { const o = cur; cur = null; anchor = null; commit(o); say(live, `Added ${o.type}.`); } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); if (e.ctrlKey || e.metaKey) zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, evPos(e)); else { view.x += e.deltaX / view.z; view.y += e.deltaY / view.z; draw(); } }, { passive: false });
    function zoomAt(f, p) { const nz = Math.max(0.05, Math.min(20, view.z * f)); const s = w2s(p); view.z = nz; view.x = p[0] - s[0] / nz; view.y = p[1] - s[1] / nz; draw(); }
    const centre = () => s2w(CW / 2, CH / 2), pan = (dx, dy) => { view.x += (dx * 100) / view.z; view.y += (dy * 100) / view.z; draw(); say(live, `View top-left at (${Math.round(view.x)}, ${Math.round(view.y)}).`); };
    const zoom = (f) => { zoomAt(f, centre()); say(live, `Zoom ${Math.round(view.z * 100)}%.`); };
    function undo() { if (!hist.length) return say(live, 'Nothing to undo.'); redo.push(snapshot()); objs = JSON.parse(hist.pop()); describe(); draw(); say(live, 'Undone.'); }
    function redoF() { if (!redo.length) return say(live, 'Nothing to redo.'); hist.push(snapshot()); objs = JSON.parse(redo.pop()); describe(); draw(); say(live, 'Redone.'); }
    cv.addEventListener('focus', draw); cv.addEventListener('blur', draw);
    cv.addEventListener('keydown', (e) => {
      const k = e.key;
      if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.preventDefault(); return e.shiftKey ? redoF() : undo(); } if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'Y')) { e.preventDefault(); return redoF(); }
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (d && e.altKey) { e.preventDefault(); return pan(d[0], d[1]); }
      if (d) { e.preventDefault(); const st = (e.shiftKey ? 50 : 10) / view.z; cursor = [cursor[0] + d[0] * st, cursor[1] + d[1] * st]; if (cur && tool.value === 'pen' && kdown) cur.pts.push(cursor.slice()); else if (cur && anchor) cur.b = cursor.slice(); const s = w2s(cursor); if (s[0] < 0 || s[1] < 0 || s[0] > CW || s[1] > CH) { view.x += (Math.min(0, s[0]) + Math.max(0, s[0] - CW)) / view.z; view.y += (Math.min(0, s[1]) + Math.max(0, s[1] - CH)) / view.z; } draw(); return; }
      if (k === '+' || k === '=') { e.preventDefault(); return zoom(1.25); } if (k === '-') { e.preventDefault(); return zoom(0.8); } if (k === '0') { e.preventDefault(); view = { x: 0, y: 0, z: 1 }; draw(); return say(live, 'View reset.'); }
      if (k === 'Escape') { cur = null; kdown = false; anchor = null; draw(); return say(live, 'Cancelled.'); }
      if (k === ' ' || k === 'Enter') {
        e.preventDefault(); const t = tool.value;
        if (t === 'pan') return say(live, 'The Pan tool moves the view with the pointer. Use Alt plus the arrow keys to pan from the keyboard.');
        if (t === 'text') return place(cursor.slice()); if (t === 'erase') return eraseAt(cursor.slice());
        if (t === 'pen') { if (!kdown) { kdown = true; cur = mk(cursor.slice()); say(live, 'Pen down. Move with the arrow keys, press space to lift.'); } else { kdown = false; const o = cur; cur = null; commit(o); say(live, 'Stroke added.'); } }
        else if (!cur) { cur = mk(cursor.slice(), cursor.slice()); anchor = cursor.slice(); kdown = true; say(live, `${t} started. Move with the arrow keys, press space to finish.`); } else { const o = cur; o.b = cursor.slice(); cur = null; anchor = null; kdown = false; commit(o); say(live, `${t} added.`); }
        draw();
      }
    });
    // numbers-only insert
    const nf = (v) => h('input', { type: 'number', step: 'any', value: v, style: { width: '6rem' } }), ax = nf(100), ay = nf(100), bx = nf(300), by = nf(200); const [sh] = lab('Shape', h('select', {}, h('option', { value: 'line' }, 'Line'), h('option', { value: 'rect' }, 'Rectangle'), h('option', { value: 'ellipse' }, 'Ellipse'))); const shSel = sh.querySelector('select');
    const addShape = btn('Add shape', () => { const v = [ax, ay, bx, by].map((i) => Number(i.value)); if (v.some((n) => !Number.isFinite(n))) return say(live, 'Enter four numbers.', true); commit({ type: shSel.value, a: [v[0], v[1]], b: [v[2], v[3]], color: col.value, w: +wid.value }); say(live, `${shSel.value} added.`); });
    const addTxt = btn('Add the text at the first point', () => place([Number(ax.value) || 0, Number(ay.value) || 0]));
    const bounds = () => { if (!objs.length) return null; const bs = objs.map(wbBox); const m = 20; return [Math.min(...bs.map((b) => b[0])) - m, Math.min(...bs.map((b) => b[1])) - m, Math.max(...bs.map((b) => b[2])) + m, Math.max(...bs.map((b) => b[3])) + m]; };
    const [exW, exSel] = lab('Export area', h('select', {}, h('option', { value: 'all' }, 'Whole drawing'), h('option', { value: 'view' }, 'Visible area'))), transp = h('input', { type: 'checkbox', id: fid('tr') });
    const box = () => (exSel.value === 'view' ? [view.x, view.y, view.x + CW / view.z, view.y + CH / view.z] : bounds());
    const svgB = btn('Download SVG', () => { const b = box(); if (!b) return say(live, 'The board is empty.', true); dl('whiteboard.svg', wbSvg(objs, b, !transp.checked), 'image/svg+xml'); say(live, 'SVG downloaded.'); });
    const pngB = btn('Download PNG', () => { const b = box(); if (!b) return say(live, 'The board is empty.', true); const w = b[2] - b[0], hh = b[3] - b[1], sc = Math.min(2, 4096 / Math.max(w, hh)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(hh * sc)); const x = c.getContext('2d'); if (!transp.checked) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); } const saveV = view; view = { x: b[0], y: b[1], z: sc }; for (const o of objs) drawObj(x, o, sc); view = saveV; c.toBlob((bl) => { const a = h('a', { href: URL.createObjectURL(bl), download: 'whiteboard.png' }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); say(live, `PNG downloaded (${c.width} x ${c.height} px).`); }, 'image/png'); });
    const jsonB = btn('Save as JSON', () => { dl('whiteboard.json', JSON.stringify({ format: 'free-tools-whiteboard', objects: objs }), 'application/json'); say(live, 'JSON saved. Open it later with "Open JSON".'); });
    const jin = h('input', { type: 'file', accept: 'application/json,.json' }), [jW] = lab('Open JSON saved from this tool', jin);
    jin.addEventListener('change', async () => { try { const j = JSON.parse(await jin.files[0].text()); if (j.format !== 'free-tools-whiteboard' || !Array.isArray(j.objects)) throw new Error('This is not a whiteboard file.'); const okT = ['pen', 'line', 'rect', 'ellipse', 'text']; for (const o of j.objects) { if (!okT.includes(o.type) || typeof o.color !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(o.color)) throw new Error('The file has an object this tool does not understand.'); } commit(); objs = j.objects; describe(); draw(); say(live, `${objs.length} objects loaded.`); } catch (e) { say(live, e.message, true); } });
    const btns = [['Undo', undo], ['Redo', redoF], ['Clear all', () => { if (!objs.length) return; commit(); objs = []; describe(); draw(); say(live, 'Cleared. Undo brings it back.'); }], ['Zoom in', () => zoom(1.25)], ['Zoom out', () => zoom(0.8)], ['Pan left', () => pan(-1, 0)], ['Pan right', () => pan(1, 0)], ['Pan up', () => pan(0, -1)], ['Pan down', () => pan(0, 1)], ['Reset view', () => { view = { x: 0, y: 0, z: 1 }; draw(); say(live, 'View reset.'); }]].map(([t, f]) => btn(t, f));
    for (const s of [tool, col, wid]) s.addEventListener('change', draw);
    root.append(h('p', { className: 'desc' }, 'Draw with a mouse, touch or pen. Keyboard: Tab to the board, then arrow keys move the pink cursor (Shift for big steps), Space starts and ends a stroke or shape (or places text, or erases), Escape cancels, Alt plus arrows pan, plus and minus zoom, 0 resets the view, Ctrl+Z and Ctrl+Y undo and redo. With a pointer: Ctrl and the wheel zooms, the wheel pans, the Pan tool or the middle button drags the view. The coordinate boxes below add exact shapes. The board is not saved when you leave: export SVG, PNG or JSON.'), h('div', { className: 'row' }, tW, cW, wW), h('div', { className: 'row' }, xW, fsW), cv, live, h('div', { className: 'row' }, ...btns),
      h('h3', {}, 'Add by coordinates (board units)'), h('div', { className: 'row' }, sh, lab('First point x', ax)[0], lab('First point y', ay)[0], lab('Second point x', bx)[0], lab('Second point y', by)[0], addShape, addTxt),
      h('h3', {}, 'Export and save'), h('div', { className: 'row' }, exW, h('label', { htmlFor: transp.id, style: { margin: 0 } }, 'Transparent background'), transp, svgB, pngB, jsonB), jW, h('h3', {}, 'Objects on the board'), list);
    describe(); draw();
  },
});

// ====================================================================== 1335 auto caption generator (Whisper tiny.en via src/gap5lib/whisper.js)
const SR = 16000;
// speech/silence by 20 ms frame energy. Returns [{s, e}] in seconds.
function vadSegments(pcm, sr = SR) {
  const fl = Math.round(sr * 0.02), n = Math.floor(pcm.length / fl); if (n < 2) return [];
  const db = new Float32Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let j = i * fl; j < (i + 1) * fl; j++) s += pcm[j] * pcm[j]; db[i] = 10 * Math.log10(s / fl + 1e-10); }
  const sorted = Float32Array.from(db).sort(), act = sorted.filter((v) => v > -80), floor = (act.length ? act : sorted)[Math.floor((act.length || n) * 0.1)], peak = sorted[Math.floor(n * 0.97)], thr = Math.max(floor + 10, peak - 30);
  if (peak < -60) return []; // digital silence
  const segs = []; let st = -1; for (let i = 0; i <= n; i++) { const on = i < n && db[i] > thr; if (on && st < 0) st = i; else if (!on && st >= 0) { segs.push({ s: (st * fl) / sr, e: (i * fl) / sr }); st = -1; } }
  const merged = []; for (const g of segs) { const l = merged[merged.length - 1]; if (l && g.s - l.e < 0.3) l.e = g.e; else merged.push({ ...g }); }
  return merged.filter((g) => g.e - g.s >= 0.12);
}
// windows of at most maxLen seconds that start at speech and end in a pause when possible
function planWindows(speech, total, maxLen) {
  const out = []; if (!speech.length) return out; let i = 0;
  while (i < speech.length) {
    const start = Math.max(0, speech[i].s - 0.15), limit = start + maxLen; let end;
    const rest = speech.slice(i); if (rest[rest.length - 1].e <= limit - 0.2) { end = Math.min(total, rest[rest.length - 1].e + 0.25); out.push({ a: start, b: end }); break; }
    let cut = null; // pick the longest pause (ties: the later one) between 40% and 100% of the window, so sentences stay whole
    for (let k = i; k < speech.length - 1; k++) { const gs = speech[k].e, ge = speech[k + 1].s, mid = (gs + ge) / 2; if (mid > limit) break; if (mid >= start + maxLen * 0.4 && (!cut || ge - gs >= cut.gap)) cut = { mid, next: k + 1, gap: ge - gs }; }
    if (cut) { out.push({ a: start, b: cut.mid }); i = cut.next; }
    else { out.push({ a: start, b: limit }); let k = i; while (k < speech.length && speech[k].e <= limit) k++; if (k < speech.length && speech[k].s < limit) { speech = speech.slice(); speech[k] = { s: limit, e: speech[k].e }; } i = k; }
  }
  return out;
}
const wrap2 = (t, maxc) => { const w = t.split(' '); if (t.length <= maxc || w.length < 2) return t; let best = 1, bd = 1e9; for (let k = 1; k < w.length; k++) { const a = w.slice(0, k).join(' ').length, b = w.slice(k).join(' ').length; const d = Math.max(a, b) + (a > maxc || b > maxc ? 1000 : 0); if (d < bd) { bd = d; best = k; } } return w.slice(0, best).join(' ') + '\n' + w.slice(best).join(' '); };
// text -> chunks that become cues
function chunkText(text, maxc) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean), chunks = []; let cur = [];
  const len = () => cur.join(' ').length;
  for (let i = 0; i < words.length; i++) { cur.push(words[i]); const w = words[i], end = /[.?!]["')\]]*$/.test(w), comma = /[,;:]["')\]]*$/.test(w), nxt = words[i + 1];
    if (!nxt) break; if (end && len() >= 12) { chunks.push(cur.join(' ')); cur = []; } else if (comma && len() >= 24) { chunks.push(cur.join(' ')); cur = []; } else if (len() + 1 + nxt.length > maxc * 2) { chunks.push(cur.join(' ')); cur = []; } }
  if (cur.length) chunks.push(cur.join(' ')); return chunks;
}
// spread the chunks of one window over its voiced time. speech: segments in absolute seconds (clipped to window).
function placeCues(chunks, a, b, speech, maxc) {
  let segs = speech.map((g) => ({ s: Math.max(a, g.s), e: Math.min(b, g.e) })).filter((g) => g.e - g.s > 0.05); if (!segs.length) segs = [{ s: a, e: b }];
  const cum = [0]; for (const g of segs) cum.push(cum[cum.length - 1] + (g.e - g.s)); const V = cum[cum.length - 1];
  const real = (v, atEnd) => { for (let k = 0; k < segs.length; k++) { if (v < cum[k + 1] - 1e-9 || (atEnd && v <= cum[k + 1] + 1e-9) || k === segs.length - 1) return segs[k].s + Math.max(0, Math.min(v - cum[k], segs[k].e - segs[k].s)); } return segs[segs.length - 1].e; };
  const weights = chunks.map((c) => c.length + 1), tot = weights.reduce((x, y) => x + y, 0); let acc = 0; const bounds = [0];
  for (let i = 0; i < chunks.length - 1; i++) { acc += weights[i]; let v = (acc / tot) * V; for (const c of cum) if (Math.abs(c - v) < 0.6 && c > bounds[bounds.length - 1] + 0.3) v = c; bounds.push(v); } bounds.push(V);
  return chunks.map((c, i) => ({ start: real(bounds[i], false), end: real(bounds[i + 1], true), text: wrap2(c, maxc) }));
}
const ts = (t, sep) => { const ms = Math.max(0, Math.round(t * 1000)), p = (n, k) => String(n).padStart(k, '0'); return `${p(Math.floor(ms / 3600000), 2)}:${p(Math.floor(ms / 60000) % 60, 2)}:${p(Math.floor(ms / 1000) % 60, 2)}${sep}${p(ms % 1000, 3)}`; };
const toSrt = (cues) => cues.map((c, i) => `${i + 1}\n${ts(c.start, ',')} --> ${ts(c.end, ',')}\n${c.text}\n`).join('\n');
const toVtt = (cues) => 'WEBVTT\n\n' + cues.map((c) => `${ts(c.start, '.')} --> ${ts(c.end, '.')}\n${c.text}\n`).join('\n');
function parseCues(text) { // SRT or VTT, lenient
  const t = String(text).replace(/\r/g, '').replace(/^﻿/, ''), out = [], re = /(?:^|\n)(?:[^\n]*\n)?\s*((?:\d+:)?\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[,.]\d{1,3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|$)/g;
  const sec = (s) => { const p = s.replace(',', '.').split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
  let m; while ((m = re.exec(t))) out.push({ start: sec(m[1]), end: sec(m[2]), text: m[3].trim() }); return out;
}
// whole pipeline. W = whisper module. Returns { cues, windows, speech }
async function captionPcm(W, M, vocab, pcm, o = {}) {
  const total = pcm.length / SR, speech = vadSegments(pcm), wins = planWindows(speech, total, o.win || 20), cues = [];
  for (let i = 0; i < wins.length; i++) {
    if (o.stop?.()) break; const { a, b } = wins[i]; o.onStatus?.(`Window ${i + 1} of ${wins.length} (${a.toFixed(1)} s to ${b.toFixed(1)} s)`, i, wins.length);
    const text = await W.transcribe(M, vocab, pcm.subarray(Math.floor(a * SR), Math.min(pcm.length, Math.ceil(b * SR))), (m) => m && o.onStatus?.(`Window ${i + 1} of ${wins.length}: ${m.replace(/^window \d+ of \d+: /, '')}`, i, wins.length), o.stop);
    if (!text || !/[A-Za-z0-9]/.test(text)) continue; cues.push(...placeCues(chunkText(text, o.maxc || 42), a, b, speech, o.maxc || 42)); o.onCues?.(cues);
  }
  for (let i = 0; i < cues.length; i++) { if (i && cues[i].start < cues[i - 1].end) cues[i - 1].end = Math.max(cues[i - 1].start + 0.1, cues[i].start); if (cues[i].end - cues[i].start < 0.3) cues[i].end = cues[i].start + 0.3; }
  return { cues, wins, speech };
}
async function toPcm16k(blob) { // any audio/video file the browser can decode -> mono Float32Array at 16 kHz
  const AC = window.AudioContext || window.webkitAudioContext, ctx = new AC(); let buf;
  try { buf = await ctx.decodeAudioData(await blob.arrayBuffer()); } finally { ctx.close?.(); }
  const n = Math.max(1, Math.ceil(buf.duration * SR)), off = new OfflineAudioContext(1, n, SR), src = off.createBufferSource();
  src.buffer = buf; src.connect(off.destination); src.start(); const r = await off.startRendering(); return r.getChannelData(0).slice();
}
Object.assign(L, { vadSegments, planWindows, chunkText, placeCues, toSrt, toVtt, parseCues, captionPcm });

T.push({
  id: 'auto-caption-generator-whisper', cat: 'AI & LLM', title: 'Auto Caption Generator: SRT and VTT from Speech (Whisper in Your Browser)',
  desc: 'Turn the speech in an audio or video file into timed SRT or WebVTT captions with the Whisper tiny English model running in your browser. Edit the text, then download. English only, slow, private.',
  custom: true, dom: true,
  render(root) {
    let stopFlag = false, busy = false, cues = [];
    const file = h('input', { type: 'file', accept: 'audio/*,video/*' }), [fW] = lab('Audio or video file (mp3, wav, m4a, ogg, mp4, webm...). The browser must be able to decode it.', file);
    const [wW, win] = lab('Window length', h('select', {}, h('option', { value: 12 }, '12 s: better timing, slower'), h('option', { value: 20, selected: true }, '20 s: balanced'), h('option', { value: 30 }, '30 s: fastest, coarser timing'))), [mW, maxc] = lab('Characters per caption line', h('select', {}, h('option', { value: 32 }, '32'), h('option', { value: 42, selected: true }, '42')));
    const go = btn('Make captions', run), stop = btn('Stop', () => { stopFlag = true; }, { disabled: true }), status = h('p', { role: 'status' }), out = h('textarea', { rows: 14, spellcheck: false, 'aria-label': 'Captions in SRT format. You can edit them here.', style: { width: '100%' } });
    const fmtSel = h('select', {}, h('option', { value: 'srt' }, 'SRT'), h('option', { value: 'vtt' }, 'WebVTT')), [fmW] = lab('Download format', fmtSel);
    async function run() {
      const f = file.files[0]; if (!f) return say(status, 'Choose an audio or video file first.', true); if (busy) return; busy = true; stopFlag = false; go.disabled = true; stop.disabled = false; go.setAttribute('aria-busy', 'true'); out.value = '';
      try {
        const W = await import('../gap5lib/whisper.js'); say(status, 'Loading the model (43 MB, downloaded once)...');
        const { M, vocab } = await W.getModel((p) => say(status, `Downloading the model: ${Math.round(p * 100)}%`));
        say(status, 'Decoding the file...'); const pcm = await toPcm16k(f), mins = pcm.length / SR / 60;
        if (mins > 30) throw new Error(`The file is ${mins.toFixed(0)} minutes long. Tiny models in a browser tab are slow: split it into pieces of about 10 minutes.`);
        const t0 = Date.now(), r = await captionPcm(W, M, vocab, pcm, { win: +win.value, maxc: +maxc.value, stop: () => stopFlag, onStatus: (m) => say(status, m), onCues: (c) => { out.value = toSrt(c); } });
        cues = r.cues; out.value = toSrt(cues); const secs = (Date.now() - t0) / 1000;
        say(status, cues.length ? `Done${stopFlag ? ' (stopped early)' : ''}: ${cues.length} captions from ${r.wins.length} speech window${r.wins.length === 1 ? '' : 's'}, ${(pcm.length / SR).toFixed(0)} s of audio in ${secs.toFixed(0)} s. Proofread before publishing.` : r.speech.length ? 'No text was recognised.' : 'No speech was found in this file (it may be silent or very quiet).', !cues.length);
      } catch (e) { say(status, String(e?.message || e), true); } finally { busy = false; go.disabled = false; stop.disabled = true; go.removeAttribute('aria-busy'); }
    }
    const download = btn('Download captions', () => { const c = parseCues(out.value); if (!c.length) return say(status, 'The text box has no captions in SRT or WebVTT form (a number line, a "00:00:01,000 --> 00:00:03,000" line, then the text).', true); const base = (file.files[0]?.name || 'captions').replace(/\.[^.]+$/, ''); dl(`${base}.${fmtSel.value}`, fmtSel.value === 'vtt' ? toVtt(c) : toSrt(c), fmtSel.value === 'vtt' ? 'text/vtt' : 'application/x-subrip'); say(status, `${c.length} captions downloaded as ${fmtSel.value.toUpperCase()}.`); });
    const check = btn('Check the captions', () => { const c = parseCues(out.value); if (!c.length) return say(status, 'No captions found in the text box.', true); const bad = []; c.forEach((x, i) => { if (x.end <= x.start) bad.push(`caption ${i + 1} ends before it starts`); if (i && x.start < c[i - 1].end - 0.001) bad.push(`caption ${i + 1} overlaps caption ${i}`); if (x.end - x.start > 8) bad.push(`caption ${i + 1} lasts ${(x.end - x.start).toFixed(1)} s`); if (x.text.split('\n').some((l) => l.length > 42)) bad.push(`caption ${i + 1} has a line over 42 characters`); }); say(status, bad.length ? `${c.length} captions. Review: ${bad.slice(0, 6).join('; ')}${bad.length > 6 ? '...' : ''}.` : `${c.length} captions, no timing or length problems found.`, bad.length > 0); });
    root.append(h('p', { className: 'desc' }, 'Model: OpenAI Whisper tiny.en (39M parameters, English only, int8). The first run downloads 43 MB from this site; after that nothing leaves your device. It is slow: about 20 seconds of processing for each speech window of 30 seconds on a typical laptop, and silent stretches are skipped. Whisper tiny makes mistakes with names, accents, noise and music, and can invent text on silence, so always proofread. Timing is estimated, not word-aligned: speech and pauses are found from the sound level, the text of each window is split at punctuation, and captions are placed along the voiced time of the window. Expect captions to be off by a fraction of a second, and more with long pauses inside a window.'), fW, h('div', { className: 'row' }, wW, mW), h('div', { className: 'row' }, go, stop), status, out, h('div', { className: 'row' }, fmW, download, check));
  },
});

// ====================================================================== 1395 handwriting font maker (glyph grid + TrueType writer)
const FG = { cols: 10, rows: 14, above: 10, cell: 60, upm: 1000 };
const DEFAULT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?\'-:;';
// bitmap (Uint8Array cols*rows, row 0 = top) -> rectangles [x0,y0,x1,y1] in font units; runs per row merged vertically when identical
function bitmapRects(bm, o = FG) {
  const rects = [], open = new Map();
  for (let r = 0; r <= o.rows; r++) {
    const runs = []; if (r < o.rows) for (let c = 0; c < o.cols;) { if (!bm[r * o.cols + c]) { c++; continue; } let e = c; while (e < o.cols && bm[r * o.cols + e]) e++; runs.push([c, e]); c = e; }
    const next = new Map();
    for (const [c, e] of runs) { const k = c + ':' + e, o0 = open.get(k); if (o0) { o0.r1 = r + 1; next.set(k, o0); } else next.set(k, { c, e, r0: r, r1: r + 1 }); }
    for (const [k, v] of open) if (!next.has(k)) rects.push(v); open.clear(); for (const [k, v] of next) open.set(k, v);
  }
  return rects.map((q) => [q.c * o.cell, (o.above - q.r1) * o.cell, q.e * o.cell, (o.above - q.r0) * o.cell]);
}
function buildTtf(glyphs, opt = {}) { // glyphs: Map<char, Uint8Array bitmap>; returns Uint8Array
  const o = FG, fam = (opt.family || 'My Handwriting').replace(/[^\x20-\x7e]/g, '').slice(0, 60) || 'My Handwriting', mono = !!opt.mono;
  const chars = [...glyphs.keys()].filter((c) => c !== ' '); chars.push(' '); const codes = [...new Set(chars.map((c) => c.codePointAt(0)))].sort((a, b) => a - b);
  if (codes.some((c) => c > 0xffff)) throw new Error('Only characters in the Basic Multilingual Plane (up to U+FFFF) are supported.'); if (codes.length > 2000) throw new Error('Too many glyphs.');
  const list = [{ code: null, rects: [[60, 0, 540, 60], [60, 60, 120, 600], [480, 60, 540, 600], [120, 540, 480, 600]], adv: 600 }]; // .notdef: a box outline
  for (const code of codes) { const ch = String.fromCodePoint(code), bm = glyphs.get(ch); const rects = bm ? bitmapRects(bm, o) : []; let maxX = 0; for (const r of rects) maxX = Math.max(maxX, r[2]); list.push({ code, rects, adv: mono ? o.cols * o.cell + o.cell : ch === ' ' ? 4 * o.cell : Math.max(3 * o.cell, maxX + o.cell) }); }
  const N = list.length, parts = [], u16 = (v) => [(v >> 8) & 255, v & 255], i16 = (v) => u16(v & 0xffff), u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  // glyf + loca
  const glyf = [], loca = [0]; let maxPts = 0, maxCont = 0, gx0 = 1e9, gy0 = 1e9, gx1 = -1e9, gy1 = -1e9, sumAdv = 0; const lsb = [];
  for (const g of list) {
    sumAdv += g.adv; let bytes = [];
    if (g.rects.length) {
      const pts = []; const ends = []; for (const [x0, y0, x1, y1] of g.rects) { pts.push([x0, y0], [x0, y1], [x1, y1], [x1, y0]); ends.push(pts.length - 1); } // clockwise (y up) = outer contour
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), bx0 = Math.min(...xs), by0 = Math.min(...ys), bx1 = Math.max(...xs), by1 = Math.max(...ys); maxPts = Math.max(maxPts, pts.length); maxCont = Math.max(maxCont, ends.length); gx0 = Math.min(gx0, bx0); gy0 = Math.min(gy0, by0); gx1 = Math.max(gx1, bx1); gy1 = Math.max(gy1, by1); lsb.push(bx0);
      bytes.push(...i16(ends.length), ...i16(bx0), ...i16(by0), ...i16(bx1), ...i16(by1)); for (const e of ends) bytes.push(...u16(e)); bytes.push(0, 0); for (let i = 0; i < pts.length; i++) bytes.push(1);
      let px = 0, py = 0; for (const p of pts) { bytes.push(...i16(p[0] - px)); px = p[0]; } for (const p of pts) { bytes.push(...i16(p[1] - py)); py = p[1]; }
      while (bytes.length % 4) bytes.push(0);
    } else lsb.push(0);
    glyf.push(...bytes); loca.push(glyf.length);
  }
  if (gx0 > 1e8) { gx0 = gy0 = gx1 = gy1 = 0; }
  const T = {}; // tables
  T.glyf = Uint8Array.from(glyf); T.loca = Uint8Array.from(loca.flatMap(u32));
  const now = Math.floor(Date.now() / 1000) + 2082844800, date = [0, 0, 0, 0, ...u32(now)];
  T.head = Uint8Array.from([...u32(0x00010000), ...u32(0x00010000), ...u32(0), ...u32(0x5f0f3cf5), ...u16(3), ...u16(o.upm), ...date, ...date, ...i16(gx0), ...i16(gy0), ...i16(gx1), ...i16(gy1), ...u16(0), ...u16(8), ...i16(2), ...i16(1), ...i16(0)]);
  const asc = 760, desc = -300, inked = list.map((g, i) => ({ g, l: lsb[i] })).filter((x) => x.g.rects.length), minLsb = inked.length ? Math.min(...inked.map((x) => x.l)) : 0, minRsb = inked.length ? Math.min(...inked.map((x) => x.g.adv - Math.max(...x.g.rects.map((r) => r[2])))) : 0;
  T.hhea = Uint8Array.from([...u32(0x00010000), ...i16(asc), ...i16(desc), ...i16(0), ...u16(Math.max(...list.map((g) => g.adv))), ...i16(minLsb), ...i16(minRsb), ...i16(gx1), ...i16(1), ...i16(0), ...i16(0), ...i16(0), ...i16(0), ...i16(0), ...i16(0), ...i16(0), ...u16(N)]);
  T.maxp = Uint8Array.from([...u32(0x00010000), ...u16(N), ...u16(maxPts), ...u16(maxCont), ...u16(0), ...u16(0), ...u16(2), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u16(0)]);
  T.hmtx = Uint8Array.from(list.flatMap((g, i) => [...u16(g.adv), ...i16(lsb[i])]));
  // cmap format 4
  const segs = []; codes.forEach((c, i) => { const gid = i + 1, l = segs[segs.length - 1]; if (l && c === l.end + 1 && gid - c === l.delta) l.end = c; else segs.push({ start: c, end: c, delta: gid - c }); }); segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const sc = segs.length, es = 2 ** Math.floor(Math.log2(sc)), sub = [...u16(4), ...u16(16 + sc * 8), ...u16(0), ...u16(sc * 2), ...u16(es * 2), ...u16(Math.log2(es)), ...u16(sc * 2 - es * 2), ...segs.flatMap((s) => u16(s.end)), ...u16(0), ...segs.flatMap((s) => u16(s.start)), ...segs.flatMap((s) => u16(s.delta & 0xffff)), ...segs.flatMap(() => u16(0))];
  T.cmap = Uint8Array.from([...u16(0), ...u16(1), ...u16(3), ...u16(1), ...u32(12), ...sub]);
  // name (Windows, UTF-16BE)
  const ps = fam.replace(/[^A-Za-z0-9]/g, '') || 'MyHandwriting', names = [[1, fam], [2, 'Regular'], [3, `${ps}-Regular;1.0`], [4, `${fam} Regular`], [5, 'Version 1.0'], [6, `${ps}-Regular`]], enc = (s) => [...s].flatMap((ch) => u16(ch.charCodeAt(0)));
  let off = 0; const recs = [], str = []; for (const [id, s] of names) { const b = enc(s); recs.push(...u16(3), ...u16(1), ...u16(0x409), ...u16(id), ...u16(b.length), ...u16(off)); str.push(...b); off += b.length; }
  T.name = Uint8Array.from([...u16(0), ...u16(names.length), ...u16(6 + names.length * 12), ...recs, ...str]);
  T.post = Uint8Array.from([...u32(0x00030000), ...u32(0), ...i16(-100), ...i16(50), ...u32(1), ...u32(0), ...u32(0), ...u32(0), ...u32(0)]);
  const first = codes[0], lastc = codes[codes.length - 1];
  T['OS/2'] = Uint8Array.from([...u16(4), ...i16(Math.round(sumAdv / N)), ...u16(400), ...u16(5), ...u16(0), ...i16(650), ...i16(600), ...i16(0), ...i16(75), ...i16(650), ...i16(600), ...i16(0), ...i16(350), ...i16(120), ...i16(300), ...i16(0), ...new Array(10).fill(0), ...u32(1), ...u32(0), ...u32(0), ...u32(0), 78, 79, 78, 69, ...u16(0xc0), ...u16(Math.min(first, 0xffff)), ...u16(Math.min(lastc, 0xffff)), ...i16(asc), ...i16(desc), ...i16(0), ...u16(asc), ...u16(-desc), ...u32(1), ...u32(0), ...i16(300), ...i16(480), ...u16(0), ...u16(32), ...u16(1)]);
  // assemble sfnt
  const tags = Object.keys(T).sort(), nt = tags.length, es2 = 2 ** Math.floor(Math.log2(nt)), cs = (b) => { let s = 0; for (let i = 0; i < b.length; i += 4) s = (s + (((b[i] || 0) << 24) | ((b[i + 1] || 0) << 16) | ((b[i + 2] || 0) << 8) | (b[i + 3] || 0))) >>> 0; return s; };
  let pos = 12 + nt * 16; const dir = [], body = []; let headOff = 0;
  for (const t of tags) { const b = T[t], pad = (4 - (b.length % 4)) % 4; if (t === 'head') headOff = pos; dir.push(...[...t].map((ch) => ch.charCodeAt(0)), ...u32(cs(b)), ...u32(pos), ...u32(b.length)); body.push(...b, ...new Array(pad).fill(0)); pos += b.length + pad; }
  const out = Uint8Array.from([...u32(0x00010000), ...u16(nt), ...u16(es2 * 16), ...u16(Math.log2(es2)), ...u16(nt * 16 - es2 * 16), ...dir, ...body]);
  const adj = (0xb1b0afba - cs(out)) >>> 0; out.set(u32(adj), headOff + 8); return out;
}
Object.assign(L, { bitmapRects, buildTtf, FG });

T.push({
  id: 'handwriting-font-maker-ttf', cat: 'Fonts', title: 'Handwriting Font Maker: Draw Glyphs on a Grid and Save a TrueType Font',
  desc: 'Draw each character on a pixel grid with the mouse, touch or the keyboard (arrow keys and Space), preview your text in the new font, and download an installable TTF file. Blocky, pixel-style outlines.',
  custom: true, dom: true,
  render(root) {
    const { cols, rows, above } = FG; const glyphs = new Map(); let ch = 'A', paint = null, pos = [0, 0], prevFam = null, token = 0;
    const live = h('p', { role: 'status' }), cellBtns = [];
    const [chW, chIn] = lab('Character to draw (one character; type any, or choose below)', h('input', { type: 'text', value: 'A', maxLength: 2, style: { width: '4rem', fontSize: '1.2rem' } })); const [lsW, lsSel] = lab('Common characters', h('select', {}, ...[...DEFAULT_CHARS].map((c) => h('option', { value: c }, c))));
    const [fnW, fam] = lab('Font family name', h('input', { type: 'text', value: 'My Handwriting', style: { width: '14rem' } })), [spW, spc] = lab('Letter spacing', h('select', {}, h('option', { value: 'prop' }, 'Proportional (width follows the drawing)'), h('option', { value: 'mono' }, 'Fixed width for every character'))), [pvW, pv] = lab('Preview text', h('input', { type: 'text', value: 'Hello, Handwriting 123!', style: { width: '100%' } }));
    const prev = h('p', { style: { fontSize: '2.4rem', ...CARD, margin: '.5rem 0', minHeight: '3.5rem', wordBreak: 'break-word' }, 'aria-live': 'off' }), progress = h('p', {});
    const table = h('table', { role: 'grid', 'aria-label': 'Glyph drawing grid. Arrow keys move, Space or Enter toggles the cell.', style: { borderCollapse: 'collapse', touchAction: 'none' } });
    const bm = () => { if (!glyphs.has(ch)) glyphs.set(ch, new Uint8Array(cols * rows)); return glyphs.get(ch); };
    for (let r = 0; r < rows; r++) { const tr = h('tr', { role: 'row' }); for (let c = 0; c < cols; c++) { const b = h('button', { type: 'button', 'aria-pressed': 'false', 'aria-label': `Row ${r + 1}, column ${c + 1}`, tabIndex: r === 0 && c === 0 ? 0 : -1, style: { width: '1.9rem', height: '1.9rem', minHeight: '1.9rem', padding: 0, borderRadius: 0, border: '1px solid var(--border)', borderBottom: r === above - 1 ? '3px solid var(--danger)' : '1px solid var(--border)', background: r >= above ? 'var(--surface)' : 'var(--bg)' } }); b.dataset.r = r; b.dataset.c = c; cellBtns.push(b); tr.append(h('td', { role: 'gridcell', style: { padding: 0, border: 0 } }, b)); } table.append(tr); }
    const paintCell = (r, c, v) => { const m = bm(); if (!!m[r * cols + c] === v) return; m[r * cols + c] = v ? 1 : 0; showCell(r, c); };
    const showCell = (r, c) => { const b = cellBtns[r * cols + c], on = !!bm()[r * cols + c]; b.setAttribute('aria-pressed', on); b.style.background = on ? 'var(--fg)' : r >= above ? 'var(--surface)' : 'var(--bg)'; };
    const refresh = () => { cellBtns.forEach((b) => showCell(+b.dataset.r, +b.dataset.c)); stats(); };
    const stats = () => { const done = [...glyphs.entries()].filter(([, m]) => m.some(Boolean)).length; progress.textContent = `Drawing "${ch}". Characters drawn so far: ${done}${done ? ' (' + [...glyphs.entries()].filter(([, m]) => m.some(Boolean)).map(([c]) => c).join(' ') + ')' : ''}.`; };
    function focusCell(r, c) { r = Math.max(0, Math.min(rows - 1, r)); c = Math.max(0, Math.min(cols - 1, c)); cellBtns.forEach((b) => (b.tabIndex = -1)); const b = cellBtns[r * cols + c]; b.tabIndex = 0; b.focus(); pos = [r, c]; }
    table.addEventListener('keydown', (e) => { const b = e.target.closest('button'); if (!b) return; const r = +b.dataset.r, c = +b.dataset.c, m = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key]; if (m) { e.preventDefault(); focusCell(r + m[0], c + m[1]); if (e.shiftKey) paintCell(r + m[0], c + m[1], true), changed(); } else if (e.key === 'Home') { e.preventDefault(); focusCell(r, 0); } else if (e.key === 'End') { e.preventDefault(); focusCell(r, cols - 1); } else if (e.key === 'PageUp') { e.preventDefault(); focusCell(0, c); } else if (e.key === 'PageDown') { e.preventDefault(); focusCell(rows - 1, c); } });
    table.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || e.detail !== 0) return; /* keyboard Space/Enter only: pointer clicks were handled on pointerdown */ const r = +b.dataset.r, c = +b.dataset.c; paintCell(r, c, !bm()[r * cols + c]); pos = [r, c]; changed(); });
    table.addEventListener('pointerdown', (e) => { const b = e.target.closest('button'); if (!b) return; e.preventDefault(); b.focus(); const r = +b.dataset.r, c = +b.dataset.c; paint = !bm()[r * cols + c]; paintCell(r, c, paint); table.setPointerCapture(e.pointerId); });
    table.addEventListener('pointermove', (e) => { if (paint === null) return; const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('button'); if (el && cellBtns.includes(el)) paintCell(+el.dataset.r, +el.dataset.c, paint); });
    const endP = () => { if (paint !== null) { paint = null; changed(); } }; table.addEventListener('pointerup', endP); table.addEventListener('pointercancel', endP);
    let timer = 0; function changed() { stats(); clearTimeout(timer); timer = setTimeout(preview, 300); }
    function setChar(c) { const g = [...c][0]; if (!g) return; if (g.codePointAt(0) > 0xffff) return say(live, 'Only characters up to U+FFFF are supported.', true); ch = g; chIn.value = g; if ([...DEFAULT_CHARS].includes(g)) lsSel.value = g; refresh(); say(live, `Now drawing "${g}".`); }
    chIn.addEventListener('input', () => { if (chIn.value) setChar(chIn.value); }); lsSel.addEventListener('change', () => setChar(lsSel.value));
    const tool = (t, fn) => btn(t, () => { fn(bm()); refresh(); changed(); say(live, `${t}: done.`); });
    const shift = (dx, dy) => (m) => { const c = m.slice(); m.fill(0); for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) if (c[r * cols + k]) { const nr = r + dy, nk = k + dx; if (nr >= 0 && nr < rows && nk >= 0 && nk < cols) m[nr * cols + nk] = 1; } };
    const [cpW, cpIn] = lab('Copy the drawing of this character', h('input', { type: 'text', maxLength: 2, style: { width: '4rem' } })), cpB = btn('Copy it here', () => { const s = [...cpIn.value][0], src = glyphs.get(s); if (!src || !src.some(Boolean)) return say(live, `"${s || ''}" has no drawing yet.`, true); glyphs.set(ch, src.slice()); refresh(); changed(); say(live, `Copied "${s}" into "${ch}".`); });
    const [trW, trSel] = lab('Rough-in from a system font (a starting point to edit; check that font\'s licence)', h('select', {}, ...['sans-serif', 'serif', 'monospace', 'cursive'].map((f) => h('option', {}, f)))), trB = btn('Fill from font', () => {
      const c = document.createElement('canvas'); c.width = cols * 8; c.height = rows * 8; const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#000'; x.font = `${6 * 8 * 1.0}px ${trSel.value}`; x.textBaseline = 'alphabetic'; x.textAlign = 'left'; const mt = x.measureText(ch); x.fillText(ch, Math.max(0, (c.width - mt.width) / 2), above * 8);
      const d = x.getImageData(0, 0, c.width, c.height).data, m = bm(); m.fill(0); for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) { let s = 0; for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) s += 255 - d[((r * 8 + yy) * c.width + k * 8 + xx) * 4]; if (s / 64 > 255 * 0.35) m[r * cols + k] = 1; } refresh(); changed(); say(live, `Filled "${ch}" from ${trSel.value}. Edit it cell by cell.`);
    });
    // font build + preview
    let fontUrl = null, lastBytes = null;
    function build() { const withInk = new Map([...glyphs].filter(([, m]) => m.some(Boolean))); if (!withInk.size) throw new Error('Draw at least one character first.'); return buildTtf(withInk, { family: fam.value, mono: spc.value === 'mono' }); }
    async function preview() {
      const my = ++token; try { const bytes = build(); lastBytes = bytes; const name = 'hwfm' + my, ff = new FontFace(name, bytes.buffer.slice(0)); await ff.load(); if (my !== token) return; document.fonts.add(ff); if (prevFam) for (const f of document.fonts) if (f.family === prevFam) document.fonts.delete(f); prevFam = name; prev.style.fontFamily = `"${name}", monospace`; prev.textContent = pv.value || ' '; prev.setAttribute('aria-label', `Preview of "${pv.value}" in your font. Characters you have not drawn use a fallback font.`); } catch (e) { if (my === token) { prev.textContent = e.message; prev.style.fontFamily = ''; } }
    }
    pv.addEventListener('input', preview); fam.addEventListener('input', changed); spc.addEventListener('change', preview);
    const download = btn('Download TTF', () => { try { const bytes = build(); const nm = (fam.value.replace(/[^A-Za-z0-9]+/g, '-') || 'font') + '.ttf'; dl(nm, bytes, 'font/ttf'); say(live, `${nm} downloaded (${bytes.length} bytes, ${[...glyphs.values()].filter((m) => m.some(Boolean)).length} drawn characters). Open it to install: double-click on Windows and macOS, or copy to ~/.fonts on Linux.`); } catch (e) { say(live, e.message, true); } });
    const clrAll = btn('Clear this character', () => { bm().fill(0); refresh(); changed(); say(live, `"${ch}" cleared.`); });
    root.append(h('p', { className: 'desc' }, `A ${cols} by ${rows} grid per character. The red line is the baseline: rows below it are for descenders (g, j, p, q, y). Pointer: click or drag to paint (the first cell decides whether you paint or erase). Keyboard: Tab into the grid, arrow keys move (Home, End, PageUp, PageDown jump), Space or Enter toggles a cell, Shift plus an arrow paints while moving. The font is made of square pixels merged into rectangles, so it looks blocky, not like smooth pen strokes: it is a pixel font in the shape of your handwriting. Names and accents are fine as long as they are in the Basic Multilingual Plane.`),
      h('div', { className: 'row' }, chW, lsW), progress, table, live, h('div', { className: 'row' }, clrAll, tool('Invert', (m) => { for (let i = 0; i < m.length; i++) m[i] ^= 1; }), tool('Flip left-right', (m) => { const c = m.slice(); for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) m[r * cols + k] = c[r * cols + cols - 1 - k]; }), tool('Move left', shift(-1, 0)), tool('Move right', shift(1, 0)), tool('Move up', shift(0, -1)), tool('Move down', shift(0, 1))),
      h('div', { className: 'row' }, cpW, cpB, trW, trB), h('h3', {}, 'Font'), h('div', { className: 'row' }, fnW, spW), pvW, prev, h('div', { className: 'row' }, download));
    refresh();
  },
});

export default T;

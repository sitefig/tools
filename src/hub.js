// Hub search: filters the static, crawlable lists in place. Honours ?q=.
const input = document.getElementById('hub-q');
const live = document.getElementById('hub-count');
const items = [...document.querySelectorAll('[data-s]')];
const sections = [...document.querySelectorAll('.cat-section')];
const jump = [...document.querySelectorAll('[data-jump]')];
const msg = JSON.parse(document.getElementById('hub-msg').textContent);

function filter() {
  const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
  let n = 0;
  for (const li of items) {
    const hit = words.every((w) => li.dataset.s.includes(w));
    li.hidden = !hit; if (hit) n++;
  }
  for (const s of sections) s.hidden = !s.querySelector('[data-s]:not([hidden])');
  for (const j of jump) j.parentElement.hidden = document.getElementById(j.dataset.jump)?.hidden === true;
  live.textContent = words.length ? (n ? msg.results.replace('{n}', n) : msg.none) : '';
}
let timer;
input.addEventListener('input', () => {
  filter();
  clearTimeout(timer);
  timer = setTimeout(() => { const q = input.value.trim(); try { history.replaceState(null, '', location.pathname + (q ? '?q=' + encodeURIComponent(q) : '') + location.hash); } catch { /* ignore */ } }, 400);
});
input.form?.addEventListener('submit', (e) => e.preventDefault());
const q = new URLSearchParams(location.search).get('q');
if (q) { input.value = q; filter(); }

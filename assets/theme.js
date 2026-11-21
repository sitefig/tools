/* Blocking, tiny: set data-theme before first paint (no flash), then wire the toggle. */
(function () {
  var d = document.documentElement, k = 'ft-theme', m = window.matchMedia && matchMedia('(prefers-color-scheme: dark)');
  function stored() { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function apply(v) { d.setAttribute('data-theme', v); }
  var s = stored();
  apply(s === 'light' || s === 'dark' ? s : m && m.matches ? 'dark' : 'light');
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.querySelector('[data-theme-toggle]');
    if (!b) return;
    b.hidden = false;
    var sync = function () { b.setAttribute('aria-pressed', d.getAttribute('data-theme') === 'dark' ? 'true' : 'false'); };
    sync();
    b.addEventListener('click', function () {
      var v = d.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      apply(v); sync();
      try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: theme applies for this page only */ }
    });
    if (m && m.addEventListener) m.addEventListener('change', function (e) { if (!stored()) { apply(e.matches ? 'dark' : 'light'); sync(); } });
  });
})();

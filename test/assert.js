// Mini-testframework voor Chrome headless. Schrijft regels naar <pre id="out">.
(function () {
  var out = document.getElementById('out');
  var passed = 0, failed = 0;
  function log(line) { out.textContent += line + '\n'; }
  function fail(msg) { throw new Error(msg || 'assertion failed'); }
  window.ok = function (cond, msg) { if (!cond) fail(msg); };
  window.eq = function (a, b, msg) { if (a !== b) fail((msg ? msg + ': ' : '') + 'verwacht ' + JSON.stringify(b) + ', kreeg ' + JSON.stringify(a)); };
  window.near = function (a, b, tol, msg) {
    if (typeof a !== 'number' || !isFinite(a) || Math.abs(a - b) > tol) fail((msg ? msg + ': ' : '') + 'verwacht ' + b + ' (±' + tol + '), kreeg ' + a);
  };
  window.test = function (naam, fn) {
    try { fn(); passed++; log('PASS ' + naam); }
    catch (e) { failed++; log('FAIL ' + naam + ': ' + (e && e.message ? e.message : e)); }
  };
  window.done = function () { log('DONE ' + passed + ' ' + failed); };
  window.onerror = function (msg, src, line) { log('FAIL (window.onerror): ' + msg + ' (' + (src || '').split('/').pop() + ':' + line + ')'); log('DONE ' + passed + ' ' + (failed + 1)); };
})();

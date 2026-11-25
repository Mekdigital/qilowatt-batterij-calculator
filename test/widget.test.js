// Tests voor src/widget.js (en voor dist/calculator.js via test/dist.html).
var root = document.getElementById('qw-calc-root');
function txt(id) { return document.getElementById(id).textContent; }
function zet(id, v) {
  var el = document.getElementById(id);
  if (el.type === 'checkbox') { el.checked = v; } else { el.value = v; }
  el.dispatchEvent(new Event(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', { bubbles: true }));
}
test('mount rendert standaardresultaat', function () {
  eq(document.getElementById('qw-capaciteit').value, '7', 'slider start op het advies');
  ok(window.QWCalc && window.QWCalc._instanties.length === 1, 'één instantie gemount');
  ok(root.querySelector('#qw-resultaat'), 'resultaat aanwezig');
  ok(txt('qw-r-zon').indexOf('€ 261') >= 0, 'zonlaag € 261: ' + txt('qw-r-zon'));
  ok(txt('qw-r-verlies').indexOf('€ 564') >= 0 || txt('qw-r-verlies').indexOf('€ 563') >= 0, 'verlies: ' + txt('qw-r-verlies'));
  ok(txt('qw-r-tvt').indexOf('langer dan 15 jaar') >= 0, 'tvt tekst: ' + txt('qw-r-tvt'));
  ok(txt('qw-r-ev').indexOf('30%') >= 0 && txt('qw-r-ev').indexOf('67%') >= 0, 'eigen verbruik: ' + txt('qw-r-ev'));
  ok(!document.getElementById('qw-r-dynhaak').hidden && txt('qw-r-dynhaak').length > 0, 'dynamische haak zichtbaar bij vast');
  ok(document.getElementById('qw-r-inkoop').hidden, 'inkoop verborgen bij vast');
});
test('wissel naar dynamisch', function () {
  zet('qw-capaciteit', 10); zet('qw-contract', 'dynamisch');
  ok(!document.getElementById('qw-r-inkoop').hidden, 'inkoop zichtbaar');
  ok(txt('qw-r-totaal').indexOf('€ 379') >= 0, 'totaal 379: ' + txt('qw-r-totaal'));
  ok(txt('qw-r-tvt').indexOf('14,0') >= 0, 'tvt 14,0: ' + txt('qw-r-tvt'));
  ok(document.getElementById('qw-a-btwTeruggave').checked, 'btw aan bij dynamisch');
  ok(document.getElementById('qw-r-dynhaak').hidden, 'haak weg bij dynamisch');
});
test('slider en advies', function () {
  zet('qw-contract', 'vast'); zet('qw-capaciteit', 20);
  ok(txt('qw-capaciteit-label').indexOf('20') >= 0, 'label 20');
  ok(!document.getElementById('qw-r-afvlak').hidden, 'afvlaktekst zichtbaar bij 20 kWh vast');
  document.getElementById('qw-advies').click();
  eq(document.getElementById('qw-capaciteit').value, '7');
});
test('aanname aanpassen rekent live door', function () {
  zet('qw-capaciteit', 10); zet('qw-a-terugleverkosten', '0.12');
  ok(txt('qw-r-zon').indexOf('€ 351') >= 0, 'zonlaag 351: ' + txt('qw-r-zon'));
  zet('qw-a-terugleverkosten', '0.05');
});
test('rommel in een veld geeft geen NaN', function () {
  zet('qw-verbruik', 'abc');
  ok(root.textContent.indexOf('NaN') < 0 && root.textContent.indexOf('Infinity') < 0, 'geen NaN');
  zet('qw-verbruik', '3000');
});
test('CTA link', function () {
  var href = document.getElementById('qw-cta').getAttribute('href');
  ok(href.indexOf('/funnel-particulier?') === 0, 'funnel: ' + href);
  ok(href.indexOf('product=Energieopslag') > 0 && href.indexOf('herkomst=calculator') > 0 && href.indexOf('Capaciteit=10') > 0, 'params: ' + href);
});
done();

// Tests voor src/model.js. Draaien met: python3 run_tests.py
test('profielen tellen op tot 1', function () {
  ['opwek', 'basis', 'warmtepomp', 'auto', 'airco'].forEach(function (k) {
    var p = QWModel.PROFIELEN[k];
    eq(p.length, 12, k + ' heeft 12 maanden');
    near(p.reduce(function (a, b) { return a + b; }, 0), 1, 1e-9, k + ' som 1');
  });
  eq(QWModel.DAGEN.reduce(function (a, b) { return a + b; }, 0), 365, 'dagen 365');
});
test('standaardwaarden uit het ontwerp', function () {
  var a = QWModel.STANDAARD_AANNAMES, i = QWModel.STANDAARD_INVOER;
  eq(a.stroomprijs, 0.27); eq(a.vergoeding, 0.09); eq(a.terugleverkosten, 0.05);
  eq(a.middagprijsDyn, 0.05); eq(a.piekprijsDyn, 0.15); eq(a.directAandeel, 0.30);
  eq(a.rendement, 0.90); eq(a.degradatie, 0.02); eq(a.horizon, 15);
  eq(a.prijsverschil, 0.12); eq(a.handelsdagen, 250); eq(a.prijsstijging, 0);
  eq(i.verbruik, 3000); eq(i.panelen, 10); eq(i.opbrengstPerPaneel, 350);
  eq(i.capaciteit, 10); eq(i.contract, 'vast'); eq(i.warmtepomp, 'geen');
  eq(i.kmPerJaar, 15000); eq(i.thuisladenAandeel, 0.8); eq(i.kwhPerKm, 0.19);
});
test('verbruikTotalen standaard', function () {
  var t = QWModel.verbruikTotalen(QWModel.STANDAARD_INVOER);
  eq(t.basis, 3000); eq(t.warmtepomp, 0); eq(t.auto, 0); eq(t.airco, 0);
  eq(t.totaal, 3000); eq(t.opwek, 3500);
});
test('verbruikTotalen met extra\'s', function () {
  var i = Object.assign({}, QWModel.STANDAARD_INVOER, { auto: true, warmtepomp: 'volledig', aircoUnits: 2 });
  var t = QWModel.verbruikTotalen(i);
  near(t.auto, 2280, 0.01); eq(t.warmtepomp, 3400); eq(t.airco, 500); near(t.totaal, 9180, 0.01);
});
test('jaaropwek overschrijft panelen, 0 panelen is geen zon', function () {
  var i = Object.assign({}, QWModel.STANDAARD_INVOER, { jaaropwek: 4000 });
  eq(QWModel.verbruikTotalen(i).opwek, 4000);
  eq(QWModel.verbruikTotalen(Object.assign({}, i, { zon: false })).opwek, 0);
  eq(QWModel.verbruikTotalen(Object.assign({}, QWModel.STANDAARD_INVOER, { panelen: 0 })).opwek, 0);
});
test('normaliseerInvoer vangt rommel', function () {
  var i = QWModel.normaliseerInvoer({ verbruik: 'abc', panelen: -3, capaciteit: 100, contract: 'x', warmtepomp: 'y', aircoUnits: NaN });
  eq(i.verbruik, 3000); eq(i.panelen, 10); eq(i.capaciteit, 30); eq(i.contract, 'vast'); eq(i.warmtepomp, 'geen'); eq(i.aircoUnits, 0);
  eq(QWModel.normaliseerInvoer({ capaciteit: 0 }).capaciteit, 5);
  eq(QWModel.normaliseerInvoer({ capaciteit: 12.6 }).capaciteit, 13);
  eq(QWModel.normaliseerInvoer({}).opbrengstPerPaneel, 350);
});
var A = QWModel.STANDAARD_AANNAMES, I = QWModel.STANDAARD_INVOER;
function jaar(over, aOver) { return QWModel.berekenJaar(Object.assign({}, I, over || {}), Object.assign({}, A, aOver || {}), 0); }
test('voorbeeldhuishouden vast 10 kWh', function () {
  var r = jaar();
  near(r.zon, 261.3, 1); eq(r.inkoop, 0); eq(r.verkoop, 0); near(r.totaal, 261.3, 1);
  near(r.verliesZonderBatterij, 563.5, 1);
  near(r.eigenVerbruikZonder, 0.300, 0.005); near(r.eigenVerbruikMet, 0.668, 0.005);
  near(r.terugleverZonder, 2450, 1); near(r.terugleverMet, 1163, 1);
  eq(r.maanden.length, 12);
});
test('zonlaag vlakt af boven de avondvraag', function () {
  near(jaar({ capaciteit: 5 }).zon, 250.8, 1);
  near(jaar({ capaciteit: 20 }).zon, 261.3, 1);
});
test('dynamisch 10 kWh: drie lagen', function () {
  var r = jaar({ contract: 'dynamisch' });
  near(r.zon, 248.4, 1); near(r.inkoop, 65.1, 1); near(r.verkoop, 65.6, 1); near(r.totaal, 379.1, 1);
  near(r.terugleverMet, 1050, 1);
});
test('seizoenen: inkoop nul in juni, verkoop nul in januari', function () {
  var m = jaar({ contract: 'dynamisch' }).maanden;
  near(m[5].inkoop, 0, 0.01); near(m[0].verkoop, 0, 0.01);
  ok(m[0].inkoop > 5, 'januari inkoop > 5'); ok(m[5].verkoop > 5, 'juni verkoop > 5');
});
test('geen zon: vast nul, dynamisch alleen inkoop', function () {
  var v = jaar({ zon: false });
  eq(v.totaal, 0); eq(v.verliesZonderBatterij, 0); eq(v.eigenVerbruikZonder, 0); eq(v.eigenVerbruikMet, 0);
  var d = jaar({ zon: false, contract: 'dynamisch' });
  near(d.inkoop, 241.6, 1); eq(d.verkoop, 0); eq(d.zon, 0);
});
test('warmtepomp en auto dynamisch 15 kWh', function () {
  var r = jaar({ warmtepomp: 'volledig', auto: true, contract: 'dynamisch', capaciteit: 15 });
  near(r.zon, 472.9, 1); near(r.inkoop, 197.1, 1); near(r.verkoop, 0, 0.5); near(r.eigenVerbruikMet, 1.0, 0.005);
});
test('netto negatieve teruglevering verhoogt de zonlaag', function () {
  var r = jaar({}, { terugleverkosten: 0.12 });
  near(r.zon, 351.4, 1); near(r.verliesZonderBatterij, 735.0, 1);
});
test('degradatie: jaar 2 heeft 98 procent capaciteit', function () {
  var i = Object.assign({}, I, { capaciteit: 5 });
  var j0 = QWModel.berekenJaar(i, A, 0), j1 = QWModel.berekenJaar(i, A, 1);
  ok(j1.zon < j0.zon, 'jaar 2 lager'); ok(j1.zon > j0.zon * 0.97, 'maar niet veel lager');
});
test('investering interpoleert en begrenst', function () {
  eq(QWModel.investering(10), 6171); near(QWModel.investering(12.5), 6775.5, 0.1);
  near(QWModel.investering(7), 4863.6, 0.1); eq(QWModel.investering(2), 3992); eq(QWModel.investering(40), 11373);
});
test('adviesCapaciteit', function () {
  eq(QWModel.adviesCapaciteit(I), 7);
  eq(QWModel.adviesCapaciteit(Object.assign({}, I, { contract: 'dynamisch' })), 9);
  eq(QWModel.adviesCapaciteit(Object.assign({}, I, { zon: false })), 9);
  eq(QWModel.adviesCapaciteit(Object.assign({}, I, { warmtepomp: 'volledig', auto: true, contract: 'dynamisch' })), 25);
  eq(QWModel.adviesCapaciteit(Object.assign({}, I, { verbruik: 500, panelen: 2 })), 5);
});
test('bereken vast 10 kWh: geen terugverdientijd binnen 15 jaar', function () {
  var b = QWModel.bereken(I, A);
  eq(b.investering, 6171); eq(b.nettoInvestering, 6171); eq(b.btwTeruggave, false);
  eq(b.jaren.length, 15); near(b.totaalHorizon, 3919, 2); eq(b.terugverdientijd, null);
  near(b.jaar1.zon, 261.3, 1); eq(b.advies, 7);
});
test('bereken dynamisch 10 kWh: btw terug en 14 jaar', function () {
  var b = QWModel.bereken(Object.assign({}, I, { contract: 'dynamisch' }), A);
  eq(b.btwTeruggave, true); near(b.nettoInvestering, 5100, 1); near(b.totaalHorizon, 5433, 2); near(b.terugverdientijd, 14.03, 0.05);
});
test('bereken warmtepomp en auto dynamisch 15 kWh: 9,4 jaar', function () {
  var b = QWModel.bereken(Object.assign({}, I, { warmtepomp: 'volledig', auto: true, contract: 'dynamisch', capaciteit: 15 }), A);
  near(b.terugverdientijd, 9.43, 0.05); near(b.totaalHorizon, 9481, 3);
});
test('prijsstijging en eigen investering', function () {
  near(QWModel.bereken(I, Object.assign({}, A, { prijsstijging: 0.02 })).totaalHorizon, 4519, 2);
  var b = QWModel.bereken(I, Object.assign({}, A, { investering: 3000, btwTeruggave: true }));
  eq(b.investering, 3000); near(b.nettoInvestering, 2479.3, 0.1); ok(b.terugverdientijd > 9 && b.terugverdientijd < 11, 'rond 10 jaar');
});
test('bereken normaliseert rommelinvoer zelf', function () {
  var b = QWModel.bereken({ capaciteit: 999, verbruik: 'x' }, {});
  eq(b.invoer.capaciteit, 30); eq(b.invoer.verbruik, 3000); ok(isFinite(b.totaalHorizon), 'eindig');
});
done();

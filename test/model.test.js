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
done();

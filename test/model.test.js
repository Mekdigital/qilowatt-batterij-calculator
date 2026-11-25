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
done();

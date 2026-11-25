/*
 * Qilowatt batterij-verdienstencalculator: rekenkern.
 * Pure functies, geen DOM. Beschikbaar als window.QWModel.
 * Ontwerp: vault Qilowatt/Website/2026-11-25-batterij-verdiensten-calculator-design.md
 * Bronnen van de aannames: vault Qilowatt/Tools/Benchmark aannames batterijcalculator.md
 */
(function () {
  'use strict';

  // Maandprofielen (procent, januari t/m december). Worden genormaliseerd tot fracties met som 1.
  function profiel(p) {
    var som = 0, i;
    for (i = 0; i < p.length; i++) som += p[i];
    return p.map(function (x) { return x / som; });
  }
  var PROFIELEN = {
    opwek:      profiel([3, 5, 9, 12, 13, 13, 13, 12, 9, 6, 3, 2]),
    basis:      profiel([10, 9, 9, 8, 7, 7, 7, 7, 8, 9, 9, 10]),
    warmtepomp: profiel([18, 15, 12, 8, 4, 2, 1, 1, 3, 8, 13, 15]),
    auto:       profiel([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
    airco:      profiel([0, 0, 0, 0, 0, 25, 35, 30, 10, 0, 0, 0])
  };
  var DAGEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // Indicatieve investering inclusief btw en installatie, uit de Qilowatt-prijslijst van 24-11-2026.
  var INVESTERING = [[5, 3992], [10, 6171], [15, 7380], [20, 8469], [25, 10000], [30, 11373]];

  var STANDAARD_INVOER = {
    verbruik: 3000,            // kWh per jaar, huishouden zonder extra's
    zon: true,
    panelen: 10,
    opbrengstPerPaneel: 350,   // kWh per paneel per jaar
    jaaropwek: null,           // kWh per jaar; overschrijft panelen x opbrengst als > 0
    auto: false,
    kmPerJaar: 15000,
    thuisladenAandeel: 0.8,
    kwhPerKm: 0.19,
    warmtepomp: 'geen',        // 'geen' | 'hybride' | 'volledig'
    warmtepompKwh: { hybride: 1900, volledig: 3400 },
    aircoUnits: 0,
    aircoKwhPerUnit: 250,
    contract: 'vast',          // 'vast' | 'dynamisch'
    capaciteit: 10             // kWh, 5 t/m 30
  };

  var STANDAARD_AANNAMES = {
    stroomprijs: 0.27,         // euro per kWh all-in
    vergoeding: 0.09,          // terugleververgoeding 2027, vast contract
    terugleverkosten: 0.05,    // per teruggeleverde kWh, vast contract
    middagprijsDyn: 0.05,      // terugleverprijs op zonnige middaguren, dynamisch
    piekprijsDyn: 0.15,        // verkoopprijs in de avondpiek, dynamisch
    directAandeel: 0.30,       // deel van de zonnestroom dat direct wordt gebruikt
    rendement: 0.90,           // round-trip
    degradatie: 0.02,          // capaciteitsverlies per jaar
    horizon: 15,               // jaren
    prijsverschil: 0.12,       // dal versus piek bij dynamisch, all-in
    handelsdagen: 250,         // dagen per jaar met voldoende prijsverschil
    prijsstijging: 0,          // per jaar
    btwTeruggave: null,        // null: afleiden uit contract (aan bij dynamisch)
    investering: null          // null: uit de tabel
  };

  // ---- Invoer -------------------------------------------------------------

  function getal(x, standaard, minimum) {
    var n = Number(x);
    if (x === null || x === undefined || x === '' || !isFinite(n)) return standaard;
    if (n < (minimum === undefined ? 0 : minimum)) return standaard;
    return n;
  }
  function keuze(x, opties, standaard) {
    return opties.indexOf(x) >= 0 ? x : standaard;
  }

  // Maakt van ruwe (formulier)invoer een volledig en geldig invoerobject.
  function normaliseerInvoer(ruw) {
    ruw = ruw || {};
    var S = STANDAARD_INVOER;
    var cap = getal(ruw.capaciteit, S.capaciteit);
    cap = Math.round(Math.max(5, Math.min(30, cap)));
    var jaaropwek = getal(ruw.jaaropwek, 0);
    return {
      verbruik: getal(ruw.verbruik, S.verbruik),
      zon: ruw.zon === undefined ? S.zon : !!ruw.zon,
      panelen: getal(ruw.panelen, S.panelen),
      opbrengstPerPaneel: getal(ruw.opbrengstPerPaneel, S.opbrengstPerPaneel),
      jaaropwek: jaaropwek > 0 ? jaaropwek : null,
      auto: ruw.auto === undefined ? S.auto : !!ruw.auto,
      kmPerJaar: getal(ruw.kmPerJaar, S.kmPerJaar),
      thuisladenAandeel: Math.min(1, getal(ruw.thuisladenAandeel, S.thuisladenAandeel)),
      kwhPerKm: getal(ruw.kwhPerKm, S.kwhPerKm),
      warmtepomp: keuze(ruw.warmtepomp, ['geen', 'hybride', 'volledig'], S.warmtepomp),
      warmtepompKwh: {
        hybride: getal(ruw.warmtepompKwh && ruw.warmtepompKwh.hybride, S.warmtepompKwh.hybride),
        volledig: getal(ruw.warmtepompKwh && ruw.warmtepompKwh.volledig, S.warmtepompKwh.volledig)
      },
      aircoUnits: getal(ruw.aircoUnits, S.aircoUnits),
      aircoKwhPerUnit: getal(ruw.aircoKwhPerUnit, S.aircoKwhPerUnit),
      contract: keuze(ruw.contract, ['vast', 'dynamisch'], S.contract),
      capaciteit: cap
    };
  }

  // Jaartotalen in kWh per onderdeel.
  function verbruikTotalen(invoer) {
    var opwek = 0;
    if (invoer.zon && invoer.panelen > 0) {
      opwek = invoer.jaaropwek > 0 ? invoer.jaaropwek : invoer.panelen * invoer.opbrengstPerPaneel;
    }
    var warmtepomp = invoer.warmtepomp === 'geen' ? 0 : invoer.warmtepompKwh[invoer.warmtepomp];
    var auto = invoer.auto ? invoer.kmPerJaar * invoer.kwhPerKm * invoer.thuisladenAandeel : 0;
    var airco = invoer.aircoUnits * invoer.aircoKwhPerUnit;
    return {
      basis: invoer.verbruik,
      warmtepomp: warmtepomp,
      auto: auto,
      airco: airco,
      totaal: invoer.verbruik + warmtepomp + auto + airco,
      opwek: opwek
    };
  }

  window.QWModel = {
    PROFIELEN: PROFIELEN,
    DAGEN: DAGEN,
    INVESTERING: INVESTERING,
    STANDAARD_INVOER: STANDAARD_INVOER,
    STANDAARD_AANNAMES: STANDAARD_AANNAMES,
    normaliseerInvoer: normaliseerInvoer,
    verbruikTotalen: verbruikTotalen
  };
})();

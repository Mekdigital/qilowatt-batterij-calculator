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
    // Een ingevulde jaaropwek telt altijd; anders panelen x opbrengst (0 panelen is geen zon).
    var opwek = 0;
    if (invoer.zon) {
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

  // ---- Maandmodel ---------------------------------------------------------

  // Rekent één jaar door. jaarIndex 0 is jaar 1; de capaciteit krimpt met de degradatie.
  // Volgorde per gemiddelde dag: zonlaag, dan inkoop (dynamisch), dan verkoop (dynamisch).
  function berekenJaar(invoer, a, jaarIndex) {
    var t = verbruikTotalen(invoer);
    var dyn = invoer.contract === 'dynamisch';
    var cap = invoer.capaciteit * Math.pow(1 - a.degradatie, jaarIndex || 0);
    var nettoVast = a.vergoeding - a.terugleverkosten;
    var teruglever = dyn ? a.middagprijsDyn : nettoVast;
    var f = a.handelsdagen / 365;
    var velden = ['zon', 'inkoop', 'verkoop', 'totaal', 'direct', 'geladenZon', 'geladenNet', 'verkocht', 'terugleverZonder', 'terugleverMet'];
    var R = {}, maanden = [], m, k;
    for (k = 0; k < velden.length; k++) R[velden[k]] = 0;

    for (m = 0; m < 12; m++) {
      var d = DAGEN[m];
      var zonDag = t.opwek * PROFIELEN.opwek[m] / d;
      var verbruikDag = (t.basis * PROFIELEN.basis[m] + t.warmtepomp * PROFIELEN.warmtepomp[m]
        + t.auto * PROFIELEN.auto[m] + t.airco * PROFIELEN.airco[m]) / d;

      var direct = Math.min(zonDag * a.directAandeel, verbruikDag);
      var overschot = Math.max(0, zonDag - direct);
      var rest = Math.max(0, verbruikDag - direct);

      // Laag 1: zonnestroom opslaan voor de avond en nacht.
      var geladenZon = Math.min(overschot, rest / a.rendement, cap);
      var geleverdZon = geladenZon * a.rendement;
      var zon = geleverdZon * a.stroomprijs - geladenZon * teruglever;

      // Laag 2a: goedkoop inkopen op daluren voor de resterende vraag.
      var ruimte = Math.max(0, cap - geladenZon);
      var restvraag = Math.max(0, rest - geleverdZon);
      var geladenNet = dyn ? Math.min(ruimte, restvraag / a.rendement) : 0;
      var inkoop = geladenNet * a.rendement * a.prijsverschil * f;

      // Laag 2b: resterend zonoverschot opslaan en in de avondpiek verkopen.
      var ruimte2 = Math.max(0, ruimte - geladenNet);
      var over = Math.max(0, overschot - geladenZon);
      var verkocht = dyn ? Math.min(ruimte2, over) : 0;
      var verkoop = verkocht * (a.rendement * a.piekprijsDyn - a.middagprijsDyn) * f;

      var md = {
        zon: zon * d, inkoop: inkoop * d, verkoop: verkoop * d, totaal: (zon + inkoop + verkoop) * d,
        direct: direct * d, geladenZon: geladenZon * d, geladenNet: geladenNet * d, verkocht: verkocht * d,
        terugleverZonder: overschot * d,
        terugleverMet: (over - verkocht + verkocht * a.rendement) * d
      };
      maanden.push(md);
      for (k = 0; k < velden.length; k++) R[velden[k]] += md[velden[k]];
    }

    R.maanden = maanden;
    // Wat een bezoeker zonder batterij op een vast contract vanaf 2027 verliest.
    R.verliesZonderBatterij = R.terugleverZonder * (a.stroomprijs - nettoVast);
    R.eigenVerbruikZonder = t.opwek > 0 ? R.direct / t.opwek : 0;
    R.eigenVerbruikMet = t.opwek > 0 ? (R.direct + R.geladenZon) / t.opwek : 0;
    R.opwek = t.opwek;
    R.verbruik = t.totaal;
    return R;
  }

  // ---- Meerjaren, investering en advies -----------------------------------

  // Indicatieve investering voor een capaciteit, lineair tussen de tabelpunten, begrensd aan de randen.
  function investering(capaciteit) {
    var T = INVESTERING, i;
    if (!(capaciteit > T[0][0])) return T[0][1];
    if (capaciteit >= T[T.length - 1][0]) return T[T.length - 1][1];
    for (i = 1; i < T.length; i++) {
      if (capaciteit <= T[i][0]) {
        var c1 = T[i - 1][0], p1 = T[i - 1][1], c2 = T[i][0], p2 = T[i][1];
        return p1 + (p2 - p1) * (capaciteit - c1) / (c2 - c1);
      }
    }
    return T[T.length - 1][1];
  }

  // Startwaarde voor de slider, volgens de formules uit Qilowatt/Tools/Formules.md.
  function adviesCapaciteit(invoer) {
    var t = verbruikTotalen(invoer);
    var z = t.opwek > 0 ? Math.round(t.opwek * 0.7 / 365) : 0;
    var d = Math.round(t.totaal * 0.7 / 240);
    var v = (invoer.contract === 'dynamisch' || t.opwek <= 0) ? Math.max(z, d) : z;
    return Math.max(5, Math.min(30, v));
  }

  function vulAannames(ruw) {
    ruw = ruw || {};
    var a = {}, k;
    for (k in STANDAARD_AANNAMES) {
      if (!STANDAARD_AANNAMES.hasOwnProperty(k)) continue;
      if (k === 'btwTeruggave') { a[k] = typeof ruw[k] === 'boolean' ? ruw[k] : null; continue; }
      if (k === 'investering') { var inv = Number(ruw[k]); a[k] = isFinite(inv) && inv > 0 ? inv : null; continue; }
      var n = Number(ruw[k]);
      a[k] = (ruw[k] === null || ruw[k] === undefined || ruw[k] === '' || !isFinite(n) || n < 0) ? STANDAARD_AANNAMES[k] : n;
    }
    a.horizon = Math.min(50, Math.max(1, Math.round(a.horizon)));
    a.rendement = Math.min(1, Math.max(0.5, a.rendement));
    if (a.degradatie > 1) a.degradatie = 1;
    if (a.directAandeel > 1) a.directAandeel = 1;
    if (a.handelsdagen > 365) a.handelsdagen = 365;
    return a;
  }

  // Volledig resultaat: jaar 1 in detail, opbrengst per jaar over de horizon, investering en terugverdientijd.
  function bereken(ruwInvoer, ruwAannames) {
    var invoer = normaliseerInvoer(ruwInvoer);
    var a = vulAannames(ruwAannames);
    var inv = a.investering !== null ? a.investering : investering(invoer.capaciteit);
    var btw = a.btwTeruggave !== null ? a.btwTeruggave : invoer.contract === 'dynamisch';
    var netto = btw ? inv / 1.21 : inv;
    var jaren = [], cum = 0, tvt = null, j, jaar1 = null;
    for (j = 0; j < a.horizon; j++) {
      var r = berekenJaar(invoer, a, j);
      if (j === 0) jaar1 = r;
      var opbrengst = r.totaal * Math.pow(1 + a.prijsstijging, j);
      jaren.push(opbrengst);
      if (tvt === null && opbrengst > 0 && cum + opbrengst >= netto) tvt = j + (netto - cum) / opbrengst;
      cum += opbrengst;
    }
    return {
      invoer: invoer,
      aannames: a,
      jaar1: jaar1,
      jaren: jaren,
      totaalHorizon: cum,
      investering: inv,
      nettoInvestering: netto,
      btwTeruggave: btw,
      terugverdientijd: tvt,
      advies: adviesCapaciteit(invoer)
    };
  }

  window.QWModel = {
    PROFIELEN: PROFIELEN,
    DAGEN: DAGEN,
    INVESTERING: INVESTERING,
    STANDAARD_INVOER: STANDAARD_INVOER,
    STANDAARD_AANNAMES: STANDAARD_AANNAMES,
    normaliseerInvoer: normaliseerInvoer,
    verbruikTotalen: verbruikTotalen,
    berekenJaar: berekenJaar,
    investering: investering,
    adviesCapaciteit: adviesCapaciteit,
    vulAannames: vulAannames,
    bereken: bereken
  };
})();

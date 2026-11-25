/* Qilowatt batterij-verdienstencalculator, bundel 2026-11-25. Bron: github.com/Mekdigital/qilowatt-batterij-calculator */
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
    if (a.horizon < 1) a.horizon = 1;
    a.horizon = Math.round(a.horizon);
    if (a.rendement > 1) a.rendement = 1;
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

/*
 * Qilowatt batterij-verdienstencalculator: widget.
 * Zelf-mountend in #qw-calc-root. Gebruikt window.QWModel (src/model.js).
 * Teksten en bronnen staan bovenin; de cijfers staan in model.js.
 */
(function () {
  'use strict';
  var M = window.QWModel;

  var LINKS = {
    saldering: '/blog/salderingsregeling-stopt-2027-thuisbatterij-essentieel',
    btw: '/blog/btw-teruggave-op-thuisbatterijen',
    dynamisch: '/blog/een-dynamisch-energiecontract-met-een-thuisbatterij'
  };

  var T = {
    kop: 'Wat levert een thuisbatterij jou op vanaf 2027?',
    intro: 'Vul je eigen situatie in. Alle aannames kun je onderaan aanpassen.',
    rijZon: 'Zonnestroom zelf gebruiken in plaats van terugleveren',
    rijInkoop: 'Goedkoop inkopen op daluren (dynamisch contract)',
    rijVerkoop: 'Zonnestroom verkopen in de avondpiek (dynamisch contract)',
    rijTotaal: 'Totaal per jaar',
    afvlak: 'Een grotere batterij levert met alleen zonnestroom weinig extra op. Met een dynamisch contract, warmtepomp of laadpaal wel.',
    geenZon: 'Zonder zonnepanelen en met een vast contract levert een batterij niets op. Met een dynamisch contract koop je elke dag goedkoop in.',
    disclaimer: 'Indicatie op basis van gemiddelden en de aannames hierboven, geen garantie. Pas de aannames aan naar jouw contract.',
    aggregator: 'Handel op de onbalansmarkt via je energieleverancier kan extra opleveren. Dat rekenen we hier bewust niet mee.',
    cta: 'Vraag gratis advies aan'
  };

  // Aannames in de volgorde van het paneel. pct: in de UI als procent.
  var AANNAMES = [
    { k: 'stroomprijs', l: 'Stroomprijs, all-in (€ per kWh)', stap: 0.01, bron: 'Milieu Centraal januari 2026, laadbudget.nl, CBS september 2026 (0,26)' },
    { k: 'vergoeding', l: 'Terugleververgoeding 2027, vast contract (€ per kWh)', stap: 0.01, bron: 'Essent, Eneco, Vattenfall, november 2026' },
    { k: 'terugleverkosten', l: 'Terugleverkosten, vast contract (€ per kWh)', stap: 0.01, bron: 'Essent, Eneco, Vattenfall, november 2026; netto 4 cent' },
    { k: 'middagprijsDyn', l: 'Terugleverprijs op zonnige middaguren, dynamisch (€ per kWh)', stap: 0.01, bron: 'Gemiddelde marktprijs op laaduren juli 2025 tot juni 2026 (energievergelijk.nl)' },
    { k: 'piekprijsDyn', l: 'Verkoopprijs in de avondpiek, dynamisch (€ per kWh)', stap: 0.01, bron: 'Kale beursprijs avondpiek 2026, circa 15 tot 18 cent' },
    { k: 'directAandeel', l: 'Zonnestroom die je direct gebruikt, zonder batterij (%)', stap: 1, pct: true, bron: 'Milieu Centraal, CE Delft: circa 30 procent' },
    { k: 'rendement', l: 'Rendement laden en ontladen (%)', stap: 1, pct: true, bron: 'Fabrikantopgave vaste systemen, circa 90 procent' },
    { k: 'degradatie', l: 'Capaciteitsverlies per jaar (%)', stap: 0.5, pct: true, bron: 'eerlijkoverthuisbatterijen.nl, thuisbatterijcheck.com: 2 procent' },
    { k: 'horizon', l: 'Levensduur (jaar)', stap: 1, bron: 'Marktstandaard 15 jaar' },
    { k: 'prijsverschil', l: 'Prijsverschil dal en piek, dynamisch (€ per kWh)', stap: 0.01, bron: 'thuisbatterijreus.nl 10 tot 15 cent, laadbudget 16, thuisbatterijcheck 7,5' },
    { k: 'handelsdagen', l: 'Dagen per jaar met voldoende prijsverschil', stap: 5, bron: 'Qilowatt-blog november 2026 (250), thuisbatterijreus 300' },
    { k: 'prijsstijging', l: 'Stijging stroomprijs per jaar (%)', stap: 0.5, pct: true, bron: 'Bewust conservatief op 0' },
    { k: 'investering', l: 'Investering inclusief btw en installatie (€)', stap: 100, leeg: true, bron: 'Leeg: indicatie uit de Qilowatt-prijslijst van november 2026 voor de gekozen capaciteit' }
  ];

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function duizend(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function euro(n) { return '€ ' + duizend(n); }
  function kwh(n) { return duizend(n) + ' kWh'; }
  function pct(f) { return Math.round(f * 100) + '%'; }
  function jarenTekst(tvt, horizon) {
    if (tvt === null || tvt === undefined) return 'langer dan ' + horizon + ' jaar';
    return tvt.toFixed(1).replace('.', ',') + ' jaar';
  }

  function aannameVeld(a) {
    var std = M.STANDAARD_AANNAMES[a.k];
    var waarde = a.leeg ? '' : (a.pct ? Math.round(std * 1000) / 10 : std);
    return '<label for="qw-a-' + a.k + '">' + esc(a.l) + '</label>'
      + '<input type="number" id="qw-a-' + a.k + '" step="' + a.stap + '" min="0" value="' + waarde + '"' + (a.leeg ? ' placeholder="automatisch"' : '') + '>'
      + '<small>' + esc(a.bron) + '</small>';
  }

  function template(S) {
    var velden = '';
    for (var i = 0; i < AANNAMES.length; i++) velden += aannameVeld(AANNAMES[i]);
    return ''
      + '<div class="qw-calc">'
      + '<h2>' + esc(T.kop) + '</h2>'
      + '<div class="qw-grid">'
      + '<div class="qw-paneel">'
      + '<h3>Jouw situatie</h3>'
      + '<p class="qw-hint">' + esc(T.intro) + '</p>'
      + '<label for="qw-verbruik">Jaarverbruik huishouden (kWh), zonder warmtepomp, auto of airco</label>'
      + '<input type="number" id="qw-verbruik" min="0" step="100" value="' + S.verbruik + '">'
      + '<p class="qw-hint">1 persoon 1.600, 2 personen 2.300, 3 personen 3.000, 4 personen 3.700, 5 of meer 4.400.</p>'
      + '<label class="qw-check"><input type="checkbox" id="qw-zon"' + (S.zon ? ' checked' : '') + '> Ik heb zonnepanelen</label>'
      + '<div class="qw-sub" id="qw-zon-sub">'
      + '<div class="qw-rij2"><div><label for="qw-panelen">Aantal panelen</label><input type="number" id="qw-panelen" min="0" step="1" value="' + S.panelen + '"></div>'
      + '<div><label for="qw-opbrengst">Opbrengst per paneel (kWh per jaar)</label><input type="number" id="qw-opbrengst" min="0" step="10" value="' + S.opbrengstPerPaneel + '"></div></div>'
      + '<label for="qw-jaaropwek">Of: mijn jaaropwek volgens de app (kWh)</label>'
      + '<input type="number" id="qw-jaaropwek" min="0" step="100" placeholder="leeg laten als je het niet weet">'
      + '</div>'
      + '<label class="qw-check"><input type="checkbox" id="qw-auto"' + (S.auto ? ' checked' : '') + '> Ik laad een elektrische auto thuis</label>'
      + '<div class="qw-sub" id="qw-auto-sub"><label for="qw-km">Kilometers per jaar</label><input type="number" id="qw-km" min="0" step="1000" value="' + S.kmPerJaar + '">'
      + '<p class="qw-hint">We rekenen met 0,19 kWh per km en 80 procent thuisladen.</p></div>'
      + '<label for="qw-warmtepomp">Warmtepomp</label>'
      + '<select id="qw-warmtepomp"><option value="geen">Geen</option><option value="hybride">Hybride (circa 1.900 kWh per jaar)</option><option value="volledig">Volledig elektrisch (circa 3.400 kWh per jaar)</option></select>'
      + '<label for="qw-airco">Airco, aantal binnenunits (circa 250 kWh per unit per jaar)</label>'
      + '<input type="number" id="qw-airco" min="0" step="1" value="' + S.aircoUnits + '">'
      + '<label for="qw-contract">Energiecontract</label>'
      + '<select id="qw-contract"><option value="vast">Vast of variabel tarief</option><option value="dynamisch">Dynamisch (uurprijzen)</option></select>'
      + '<label for="qw-capaciteit">Batterijcapaciteit: <span id="qw-capaciteit-label"></span></label>'
      + '<input type="range" id="qw-capaciteit" min="5" max="30" step="1" value="' + S.capaciteit + '">'
      + '<button type="button" class="qw-licht" id="qw-advies"></button>'
      + '<p class="qw-hint" id="qw-r-afvlak" hidden>' + esc(T.afvlak) + '</p>'
      + '<details id="qw-aannames"><summary>Aannames aanpassen</summary>'
      + velden
      + '<label class="qw-check"><input type="checkbox" id="qw-a-btwTeruggave"> Ik vraag de btw terug (21 procent)</label>'
      + '<small>Kan als je met een dynamisch contract automatisch in- en verkoopt. <a href="' + LINKS.btw + '">Lees de voorwaarden</a>.</small>'
      + '</details>'
      + '</div>'
      + '<div class="qw-paneel" id="qw-resultaat">'
      + '<div class="qw-verlies" id="qw-r-verlies"></div>'
      + '<h3 id="qw-r-kop"></h3>'
      + '<p class="qw-noot" id="qw-r-geenzon" hidden>' + esc(T.geenZon) + '</p>'
      + '<ul class="qw-rijen">'
      + '<li><span>' + esc(T.rijZon) + '</span><span id="qw-r-zon"></span></li>'
      + '<li id="qw-r-inkoop-rij"><span>' + esc(T.rijInkoop) + ' <a href="' + LINKS.dynamisch + '">meer</a></span><span id="qw-r-inkoop"></span></li>'
      + '<li id="qw-r-verkoop-rij"><span>' + esc(T.rijVerkoop) + '</span><span id="qw-r-verkoop"></span></li>'
      + '<li class="qw-totaal"><span>' + esc(T.rijTotaal) + '</span><span id="qw-r-totaal"></span></li>'
      + '</ul>'
      + '<div class="qw-haak" id="qw-r-dynhaak"></div>'
      + '<p class="qw-kern" id="qw-r-ev"></p>'
      + '<p class="qw-kern" id="qw-r-teruglever"></p>'
      + '<p class="qw-kern" id="qw-r-tvt"></p>'
      + '<p class="qw-kern" id="qw-r-horizon"></p>'
      + '<p class="qw-noot">' + esc(T.disclaimer) + '</p>'
      + '<p class="qw-noot">' + esc(T.aggregator) + '</p>'
      + '<a class="qw-cta" id="qw-cta" href="#">' + esc(T.cta) + '</a>'
      + '</div>'
      + '</div>'
      + '</div>';
  }

  function mount(root, opties) {
    opties = opties || {};
    var funnel = opties.funnelUrl || root.getAttribute('data-funnel') || '/funnel-particulier';
    var S = M.STANDAARD_INVOER;
    root.innerHTML = template(S);
    if (window.QWCalc.CSS && !document.getElementById('qw-calc-css')) {
      var st = document.createElement('style');
      st.id = 'qw-calc-css';
      st.textContent = window.QWCalc.CSS;
      document.head.appendChild(st);
    }

    function el(id) { return root.querySelector('#' + id); }
    var btwAangeraakt = false;
    var laatste = null;

    function leesInvoer() {
      return {
        verbruik: el('qw-verbruik').value,
        zon: el('qw-zon').checked,
        panelen: el('qw-panelen').value,
        opbrengstPerPaneel: el('qw-opbrengst').value,
        jaaropwek: el('qw-jaaropwek').value,
        auto: el('qw-auto').checked,
        kmPerJaar: el('qw-km').value,
        warmtepomp: el('qw-warmtepomp').value,
        aircoUnits: el('qw-airco').value,
        contract: el('qw-contract').value,
        capaciteit: el('qw-capaciteit').value
      };
    }
    function leesAannames() {
      var a = {}, i, d, v;
      for (i = 0; i < AANNAMES.length; i++) {
        d = AANNAMES[i];
        v = el('qw-a-' + d.k).value;
        if (v === '') { a[d.k] = null; continue; }
        v = Number(v);
        a[d.k] = d.pct ? v / 100 : v;
      }
      a.btwTeruggave = el('qw-a-btwTeruggave').checked;
      return a;
    }
    function lees() { return { invoer: leesInvoer(), aannames: leesAannames() }; }

    function toonSub() {
      el('qw-zon-sub').hidden = !el('qw-zon').checked;
      el('qw-auto-sub').hidden = !el('qw-auto').checked;
    }

    function render(b) {
      var r = b.jaar1, inv = b.invoer, dyn = inv.contract === 'dynamisch';
      el('qw-capaciteit-label').textContent = inv.capaciteit + ' kWh';
      el('qw-advies').textContent = 'Gebruik het advies: ' + b.advies + ' kWh';

      var verlies = el('qw-r-verlies');
      verlies.hidden = !(r.opwek > 0);
      verlies.innerHTML = 'Zonder batterij raak je vanaf 2027 circa <strong>' + euro(r.verliesZonderBatterij) + ' per jaar</strong> kwijt aan teruglevering die niets meer oplevert. <a href="' + LINKS.saldering + '">Waarom?</a>';

      el('qw-r-kop').textContent = 'Met een batterij van ' + inv.capaciteit + ' kWh:';
      el('qw-r-geenzon').hidden = !(r.opwek <= 0 && !dyn);
      el('qw-r-zon').textContent = euro(r.zon);
      el('qw-r-inkoop').textContent = euro(r.inkoop);
      el('qw-r-verkoop').textContent = euro(r.verkoop);
      el('qw-r-inkoop').hidden = el('qw-r-inkoop-rij').hidden = !dyn;
      el('qw-r-verkoop').hidden = el('qw-r-verkoop-rij').hidden = !dyn;
      el('qw-r-totaal').textContent = euro(r.totaal) + ' per jaar';

      var haak = el('qw-r-dynhaak');
      if (!dyn) {
        var bd = M.bereken(Object.assign({}, inv, { contract: 'dynamisch' }), Object.assign({}, b.aannames, { btwTeruggave: null }));
        var extra = bd.jaar1.totaal - r.totaal;
        haak.hidden = !(extra > 0.5);
        haak.innerHTML = 'Met een dynamisch contract: <strong>+ ' + euro(extra) + ' per jaar</strong>, en je kunt de btw terugvragen. <a href="' + LINKS.dynamisch + '">Hoe werkt dat?</a>';
      } else {
        haak.hidden = true;
        haak.innerHTML = '';
      }

      var ev = el('qw-r-ev');
      ev.hidden = !(r.opwek > 0);
      ev.innerHTML = 'Eigen verbruik van je zonnestroom: van <b>' + pct(r.eigenVerbruikZonder) + '</b> naar <b>' + pct(r.eigenVerbruikMet) + '</b>.';
      var tl = el('qw-r-teruglever');
      tl.hidden = !(r.opwek > 0);
      tl.innerHTML = 'Teruglevering: van <b>' + kwh(r.terugleverZonder) + '</b> naar <b>' + kwh(r.terugleverMet) + '</b> per jaar.';

      var invTekst = 'Indicatieve investering ' + euro(b.investering);
      if (b.btwTeruggave) invTekst += ', netto ' + euro(b.nettoInvestering) + ' na btw-teruggave';
      el('qw-r-tvt').innerHTML = 'Terugverdientijd: <b>' + jarenTekst(b.terugverdientijd, b.aannames.horizon) + '</b>. ' + invTekst + '.';
      el('qw-r-horizon').innerHTML = 'Over ' + b.aannames.horizon + ' jaar levert de batterij circa <b>' + euro(b.totaalHorizon) + '</b> op.';

      // Afvlaktekst: bij vast contract stijgt de zonlaag bij 5 kWh extra minder dan 2 procent.
      var afvlak = false;
      if (!dyn && r.opwek > 0 && inv.capaciteit < 30) {
        var groter = M.berekenJaar(Object.assign({}, inv, { capaciteit: Math.min(30, inv.capaciteit + 5) }), b.aannames, 0);
        afvlak = groter.zon < r.zon * 1.02;
      } else if (!dyn && r.opwek > 0) {
        afvlak = true;
      }
      el('qw-r-afvlak').hidden = !afvlak;

      el('qw-cta').setAttribute('href', funnel + '?product=Energieopslag&herkomst=calculator&Jaarverbruik=' + Math.round(r.verbruik) + '&Capaciteit=' + inv.capaciteit);
    }

    function herbereken() {
      toonSub();
      var l = lees();
      laatste = M.bereken(l.invoer, l.aannames);
      render(laatste);
      return laatste;
    }

    // Gebeurtenissen
    var ids = ['qw-verbruik', 'qw-zon', 'qw-panelen', 'qw-opbrengst', 'qw-jaaropwek', 'qw-auto', 'qw-km', 'qw-warmtepomp', 'qw-airco', 'qw-contract', 'qw-capaciteit', 'qw-a-btwTeruggave'];
    for (var i = 0; i < AANNAMES.length; i++) ids.push('qw-a-' + AANNAMES[i].k);
    ids.forEach(function (id) {
      var e = el(id);
      e.addEventListener('input', herbereken);
      e.addEventListener('change', herbereken);
    });
    el('qw-a-btwTeruggave').addEventListener('change', function () { btwAangeraakt = true; });
    el('qw-contract').addEventListener('change', function () {
      if (!btwAangeraakt) el('qw-a-btwTeruggave').checked = el('qw-contract').value === 'dynamisch';
      herbereken();
    });
    el('qw-advies').addEventListener('click', function () {
      el('qw-capaciteit').value = laatste ? laatste.advies : M.adviesCapaciteit(M.normaliseerInvoer(leesInvoer()));
      herbereken();
    });

    // Startstand: slider op het advies, btw volgt het contract.
    el('qw-a-btwTeruggave').checked = S.contract === 'dynamisch';
    el('qw-capaciteit').value = M.adviesCapaciteit(M.normaliseerInvoer(leesInvoer()));
    herbereken();

    var instantie = {
      root: root,
      lees: lees,
      resultaat: function () { return laatste; },
      zet: function (veld, waarde) {
        var e = el(veld.indexOf('qw-') === 0 ? veld : 'qw-' + veld);
        if (!e) return null;
        if (e.type === 'checkbox') e.checked = !!waarde; else e.value = waarde;
        return herbereken();
      }
    };
    window.QWCalc._instanties.push(instantie);
    return instantie;
  }

  window.QWCalc = {
    CSS: "/* Qilowatt batterij-verdienstencalculator. Minimale, leesbare opmaak; huisstijl volgt later. */\n.qw-calc{--qw-oranje:#FF6933;--qw-beige:#F4F3EA;--qw-zwart:#000;--qw-grijs:#666;--qw-lijn:#ddd;font-family:'Satoshi',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#222;max-width:960px;margin:0 auto;padding:16px;background:var(--qw-beige);border-radius:12px;box-sizing:border-box;}\n.qw-calc *{box-sizing:border-box;}\n.qw-calc h2{font-size:24px;line-height:1.25;margin:0 0 16px;color:var(--qw-zwart);}\n.qw-calc h3{font-size:17px;margin:0 0 10px;color:var(--qw-zwart);}\n.qw-calc .qw-grid{display:grid;grid-template-columns:1fr;gap:16px;}\n@media (min-width:760px){.qw-calc .qw-grid{grid-template-columns:1fr 1fr;align-items:start;}}\n.qw-calc .qw-paneel{background:#fff;border-radius:10px;padding:18px;}\n.qw-calc label{display:block;font-size:14px;font-weight:600;margin:12px 0 4px;}\n.qw-calc label.qw-check{display:flex;align-items:center;gap:8px;font-weight:600;}\n.qw-calc input[type=number],.qw-calc input[type=text],.qw-calc select{width:100%;padding:9px 11px;font-size:15px;font-family:inherit;border:1px solid #bbb;border-radius:6px;background:#fff;color:#000;}\n.qw-calc input[type=number]:focus,.qw-calc select:focus{outline:2px solid var(--qw-oranje);outline-offset:-1px;}\n.qw-calc input[type=range]{width:100%;margin:6px 0;accent-color:var(--qw-oranje);}\n.qw-calc .qw-hint{font-size:12px;color:var(--qw-grijs);margin:2px 0 0;line-height:1.4;}\n.qw-calc .qw-sub{margin-left:14px;padding-left:12px;border-left:2px solid var(--qw-lijn);}\n.qw-calc .qw-rij2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}\n.qw-calc button{font-family:inherit;font-size:14px;font-weight:700;border:none;border-radius:24px;padding:9px 18px;cursor:pointer;background:#111;color:#fff;}\n.qw-calc button.qw-licht{background:#eee;color:#111;font-weight:600;padding:6px 12px;font-size:13px;}\n.qw-calc details{margin-top:16px;border-top:1px solid var(--qw-lijn);padding-top:10px;}\n.qw-calc summary{cursor:pointer;font-weight:700;font-size:15px;}\n.qw-calc details small{display:block;font-size:11.5px;color:#888;line-height:1.4;margin-top:2px;}\n.qw-calc .qw-verlies{background:#FDEEE4;border-radius:8px;padding:12px 14px;font-size:15px;line-height:1.5;margin-bottom:14px;}\n.qw-calc .qw-verlies strong{color:#000;}\n.qw-calc .qw-rijen{list-style:none;margin:0 0 12px;padding:0;}\n.qw-calc .qw-rijen li{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--qw-lijn);font-size:15px;}\n.qw-calc .qw-rijen li.qw-totaal{font-weight:700;font-size:17px;border-bottom:none;border-top:2px solid #000;margin-top:4px;color:#000;}\n.qw-calc .qw-rijen li span:last-child{white-space:nowrap;}\n.qw-calc .qw-rijen li a{font-weight:400;font-size:12px;color:var(--qw-grijs);margin-left:6px;}\n.qw-calc .qw-kern{font-size:14px;line-height:1.7;margin:0 0 10px;}\n.qw-calc .qw-kern b{color:#000;}\n.qw-calc .qw-haak{background:#EAF3DE;color:#3B6D11;border-radius:8px;padding:10px 12px;font-size:14px;margin:10px 0;}\n.qw-calc .qw-noot{font-size:12.5px;color:var(--qw-grijs);line-height:1.5;margin:8px 0;}\n.qw-calc .qw-cta{display:inline-block;background:var(--qw-oranje);color:#fff;text-decoration:none;font-weight:700;border-radius:24px;padding:12px 24px;margin-top:10px;}\n.qw-calc [hidden]{display:none!important;}\n",
    mount: mount,
    _instanties: []
  };

  var rootEl = document.getElementById('qw-calc-root');
  if (rootEl) mount(rootEl, {});
})();

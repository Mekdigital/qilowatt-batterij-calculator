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
    { k: 'stroomprijs', l: 'Stroomprijs, all-in (€ per kWh)', stap: 0.01, bron: 'Variabel tarief november 2026 (vergelijkingssites 0,26 tot 0,32); Milieu Centraal januari 2026 0,27' },
    { k: 'vergoeding', l: 'Terugleververgoeding 2027, vast contract (€ per kWh)', stap: 0.01, bron: 'Essent, Eneco, Vattenfall, november 2026' },
    { k: 'terugleverkosten', l: 'Terugleverkosten, vast contract (€ per kWh)', stap: 0.01, bron: 'Essent, Eneco, Vattenfall, november 2026; netto 4 cent' },
    { k: 'middagprijsDyn', l: 'Terugleverprijs op zonnige middaguren, dynamisch (€ per kWh)', stap: 0.01, bron: 'Gemiddelde marktprijs op laaduren juli 2025 tot juni 2026 (energievergelijk.nl)' },
    { k: 'piekprijsDyn', l: 'Verkoopprijs in de avondpiek, dynamisch (€ per kWh)', stap: 0.01, bron: 'Kale beursprijs avondpiek 2026, circa 15 tot 18 cent' },
    { k: 'directAandeel', l: 'Zonnestroom die je direct gebruikt, zonder batterij (%)', stap: 1, pct: true, bron: 'Milieu Centraal, CE Delft: circa 30 procent' },
    { k: 'rendement', l: 'Rendement laden en ontladen (%)', stap: 1, pct: true, bron: 'Fabrikantopgave vaste systemen, circa 90 procent' },
    { k: 'degradatie', l: 'Capaciteitsverlies per jaar (%)', stap: 0.5, pct: true, bron: 'eerlijkoverthuisbatterijen.nl, thuisbatterijcheck.com: 2 procent' },
    { k: 'horizon', l: 'Levensduur (jaar, maximaal 50)', stap: 1, max: 50, bron: 'Marktstandaard 15 jaar' },
    { k: 'prijsverschil', l: 'Prijsverschil dal en piek, dynamisch (€ per kWh)', stap: 0.01, bron: 'thuisbatterijreus.nl 10 tot 15 cent, laadbudget 16, thuisbatterijcheck 7,5' },
    { k: 'handelsdagen', l: 'Dagen per jaar met voldoende prijsverschil', stap: 5, bron: 'Qilowatt-blog november 2026 (250), thuisbatterijreus 300' },
    { k: 'prijsstijging', l: 'Stijging stroomprijs per jaar (%)', stap: 0.5, pct: true, bron: 'laadbudget.nl rekent ook met 2 procent per jaar' },
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
      + '<input type="number" id="qw-a-' + a.k + '" step="' + a.stap + '" min="0"' + (a.max ? ' max="' + a.max + '"' : '') + ' value="' + waarde + '"' + (a.leeg ? ' placeholder="automatisch"' : '') + '>'
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
    CSS: '',
    mount: mount,
    _instanties: []
  };

  var rootEl = document.getElementById('qw-calc-root');
  if (rootEl) mount(rootEl, {});
})();

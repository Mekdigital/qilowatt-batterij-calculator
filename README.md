# Qilowatt batterij-verdienstencalculator

Embedbare rekentool voor qilowatt.nl: wat levert een thuisbatterij per jaar op nu salderen op 1 januari 2027 stopt. De bezoeker vult verbruik, zonnepanelen, laadpaal, warmtepomp, airco en contracttype in en ziet de opbrengst per jaar in lagen, het eigen verbruik voor en na, de terugverdientijd en een link naar de funnel. Alles rekent in de browser, geen backend.

Ontwerp en onderbouwing staan in de vault:
- `Qilowatt/Website/2026-11-25-batterij-verdiensten-calculator-design.md` (ontwerp en rekenmodel)
- `Qilowatt/Website/2026-11-25-batterij-verdiensten-calculator-plan.md` (bouwplan)
- `Qilowatt/Tools/Benchmark aannames batterijcalculator.md` (bronnen van alle standaardwaarden)

## Mappen

| Bestand | Doel |
|---|---|
| `src/model.js` | Rekenkern zonder DOM: `QWModel.bereken(invoer, aannames)`. Alle standaardwaarden en profielen staan bovenin. |
| `src/widget.js` | Formulier en resultaat, zelf-mountend in `#qw-calc-root`. Teksten en bronvermeldingen staan bovenin. |
| `src/styles.css` | Opmaak. Wordt bij de build in de bundel gezet. |
| `dist/calculator.js` | Gebundeld bestand dat jsDelivr serveert. Gegenereerd, wel committen. |
| `embed-webflow.html` | De regels voor het Webflow Embed-element. |
| `dev/index.html` | Lokale testpagina (via een http-server openen, bijvoorbeeld `python3 -m http.server 8124`). |
| `test/` | Browser-tests. `run.html` model, `widget.html` widget, `dist.html` bundel. |
| `run_tests.py` | Draait de tests in Chrome headless. |
| `build.py` | Maakt `dist/calculator.js` en de zelfstandige vault-kopie `Qilowatt/Tools/batterij-verdiensten-calculator.html`. |

## Tests draaien

Er is geen Node nodig. Google Chrome moet geïnstalleerd zijn.

```bash
python3 run_tests.py test/run.html test/widget.html test/dist.html
```

Exitcode 0 betekent alles groen. De verwachte bedragen in de tests komen uit de referentieberekening van 25-11-2026 (voorbeeldhuishouden 3.000 kWh, 10 panelen van 350 kWh).

## Een aanname wijzigen

1. Pas de waarde aan in `STANDAARD_AANNAMES` in `src/model.js` (of een verbruikswaarde in `STANDAARD_INVOER`).
2. Pas de bronvermelding aan in `AANNAMES` in `src/widget.js`, zodat de tekst onder het veld blijft kloppen.
3. Werk de testverwachtingen in `test/model.test.js` en `test/widget.test.js` bij (de bedragen veranderen mee) en draai de tests.
4. Build en publiceer een nieuwe versie (hieronder).

## Nieuwe versie publiceren

```bash
python3 build.py
python3 run_tests.py test/run.html test/widget.html test/dist.html
git add -A && git commit -m "feat: ..."
git tag 2026-MM-DD && git push && git push --tags
```

Zet daarna in elk Webflow Embed-element de `@tag` in de script-URL op de nieuwe tag. jsDelivr cachet per tag, dus een oude tag blijft altijd dezelfde code serveren. Een tweede versie op dezelfde dag krijgt een volgnummer, bijvoorbeeld `2026-11-25.1`.

Plaats per pagina één embed. Twee calculators op dezelfde pagina worden niet ondersteund.

Controleer de nieuwe URL:

```bash
curl -sI "https://cdn.jsdelivr.net/gh/Mekdigital/qilowatt-batterij-calculator@2026-MM-DD/dist/calculator.js" | head -3
```

## Plaatsen in Webflow

Voeg een Embed-element toe en plak de inhoud van `embed-webflow.html`. Het attribuut `data-funnel` op de container bepaalt waar de knop heen gaat (standaard `/funnel-particulier`). De knop geeft `product=Energieopslag`, `herkomst=calculator`, `Jaarverbruik` en `Capaciteit` mee als URL-parameters voor het prefill-script van de funnel.

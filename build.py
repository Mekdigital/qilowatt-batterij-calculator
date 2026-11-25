#!/usr/bin/env python3
"""Bundelt model, widget en CSS tot dist/calculator.js en maakt de zelfstandige vault-kopie.

Gebruik: python3 build.py
"""
import datetime, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
VAULT_HTML = ("/Users/petermekking/Library/Mobile Documents/iCloud~md~obsidian/Documents/My vault/"
              "Qilowatt/Tools/batterij-verdiensten-calculator.html")

def lees(p):
    with open(os.path.join(HERE, p), encoding="utf-8") as f:
        return f.read()

def schrijf(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(s)

def main():
    model, widget, css = lees("src/model.js"), lees("src/widget.js"), lees("src/styles.css")
    versie = datetime.date.today().isoformat()
    assert widget.count("    CSS: '',") == 1, "verwacht precies één regel \"    CSS: '',\" in src/widget.js"
    widget_bundel = widget.replace("    CSS: '',", "    CSS: " + json.dumps(css, ensure_ascii=False) + ",", 1)
    kop = "/* Qilowatt batterij-verdienstencalculator, bundel %s. Bron: github.com/Mekdigital/qilowatt-batterij-calculator */\n" % versie
    schrijf(os.path.join(HERE, "dist/calculator.js"), kop + model + "\n" + widget_bundel)
    schrijf(os.path.join(HERE, "dist/VERSION"), versie + "\n")

    # Zelfstandige HTML voor de vault: dubbelklikken werkt zonder server.
    html = ("<!DOCTYPE html>\n<html lang=\"nl\">\n<head>\n<meta charset=\"UTF-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
            "<title>Batterij-verdienstencalculator (vault-kopie %s)</title>\n"
            "<link href=\"https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap\" rel=\"stylesheet\">\n"
            "</head>\n<body style=\"margin:0;padding:24px;background:#fff\">\n"
            "<p style=\"font:12px sans-serif;color:#888\">Kopie uit de repo qilowatt-batterij-calculator, bundel %s. "
            "Wijzig niets hier; pas de bron aan en draai build.py.</p>\n"
            "<div id=\"qw-calc-root\"></div>\n<script>\n%s\n</script>\n</body>\n</html>\n"
            % (versie, versie, (kop + model + "\n" + widget_bundel).replace("</script", "<\\/script")))
    schrijf(VAULT_HTML, html)
    print("dist/calculator.js: %d bytes, versie %s" % (len(kop + model + widget_bundel), versie))
    print("vault-kopie:", VAULT_HTML)

if __name__ == "__main__":
    main()

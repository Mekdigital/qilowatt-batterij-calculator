#!/usr/bin/env python3
"""Draait de browser-tests in Chrome headless en print de uitkomst.

Gebruik: python3 run_tests.py [test/run.html ...]   (standaard: test/run.html)
Exitcode 1 bij een FAIL-regel of als DONE ontbreekt.
"""
import html, os, re, subprocess, sys

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
HERE = os.path.dirname(os.path.abspath(__file__))

def run(path):
    url = "file://" + os.path.abspath(os.path.join(HERE, path))
    try:
        dom = subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--dump-dom", url],
            capture_output=True, text=True, timeout=30).stdout
    except subprocess.TimeoutExpired:
        print(f"== {path}\nFAIL timeout"); return False
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.S)
    body = html.unescape(m.group(1)) if m else ""
    lines = [l for l in body.splitlines() if l.strip()]
    print(f"== {path}")
    for l in lines: print(l)
    fails = [l for l in lines if l.startswith("FAIL")]
    done = [l for l in lines if l.startswith("DONE")]
    if not done: print("FAIL geen DONE-regel gevonden")
    return not fails and bool(done)

if __name__ == "__main__":
    paths = sys.argv[1:] or ["test/run.html"]
    results = [run(p) for p in paths]
    sys.exit(0 if all(results) else 1)

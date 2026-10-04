#!/usr/bin/env python3
"""Builds Pulp Drop from src/ into a single self-contained page.

Run:  python build.py

Outputs
  docs/                    the installable web app GitHub Pages serves (commit this folder)
  dist/pulp-drop.html      the page as published to the Claude artifact (Claude adds the <html>/<head> wrapper)
  dist/local-preview.html  the same page wrapped in a minimal document, for opening straight from disk

Standard library only, so it runs anywhere Python 3.8+ is installed.
"""
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'src'
PWA = ROOT / 'pwa'
DIST = ROOT / 'dist'
DOCS = ROOT / 'docs'


def read(path):
    return path.read_text(encoding='utf-8')


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def build_page():
    page = read(SRC / 'index.html')
    parts = {
        '/*__CSS__*/': read(SRC / 'style.css').strip(),
        '/*__ENGINE__*/': read(SRC / 'engine.js').strip(),
        '/*__ART__*/': read(SRC / 'art.js').strip(),
        '/*__GAME__*/': read(SRC / 'game.js').strip(),
    }
    for marker, content in parts.items():
        if marker not in page:
            raise SystemExit(f'src/index.html is missing the {marker} marker')
        page = page.replace(marker, content)
    return page


def local_preview(page):
    # Mirrors the small wrapper Claude puts around artifact pages.
    return ('<!doctype html><html><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
            '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);'
            'padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}'
            'img{max-width:100%}[hidden]{display:none!important}</style>'
            '</head><body>' + page + '</body></html>')


def web_app(page):
    split = page.index('<canvas id="wood"')
    head, body = page[:split].strip(), page[split:].strip()
    return (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="theme-color" content="#4a2c15">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<link rel="manifest" href="manifest.webmanifest">\n'
        '<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">\n'
        '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n'
        '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
        'img{max-width:100%}</style>\n'
        + head + '\n</head>\n<body>\n' + body + '\n'
        "<script>\nif ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {\n"
        "  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });\n"
        '}\n</script>\n</body>\n</html>\n'
    )


def main():
    page = build_page()
    write(DIST / 'pulp-drop.html', page)
    write(DIST / 'local-preview.html', local_preview(page))

    write(DOCS / 'index.html', web_app(page))
    for name in ('manifest.webmanifest', 'sw.js'):
        write(DOCS / name, read(PWA / name))
    icons = DOCS / 'icons'
    if icons.exists():
        shutil.rmtree(icons)
    shutil.copytree(PWA / 'icons', icons)
    write(DOCS / '.nojekyll', '')

    files = sorted(p.relative_to(DOCS).as_posix() for p in DOCS.rglob('*') if p.is_file())
    print(f'dist/pulp-drop.html  {len(page):,} bytes')
    print(f'docs/ ({len(files)} files): ' + ', '.join(files))


if __name__ == '__main__':
    main()

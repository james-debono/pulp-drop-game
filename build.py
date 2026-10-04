#!/usr/bin/env python3
"""Builds Pulp Drop from src/ and pwa/ into docs/, the installable web app GitHub Pages serves.

Run:  python build.py

docs/index.html is src/index.html with the CSS and scripts from src/ inlined, so the whole game
is one self-contained page. Commit docs/ after building.

Standard library only, so it runs anywhere Python 3.8+ is installed.
"""
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'src'
PWA = ROOT / 'pwa'
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


def main():
    page = build_page()
    write(DOCS / 'index.html', page)
    for name in ('manifest.webmanifest', 'sw.js'):
        write(DOCS / name, read(PWA / name))
    icons = DOCS / 'icons'
    if icons.exists():
        shutil.rmtree(icons)
    shutil.copytree(PWA / 'icons', icons)
    write(DOCS / '.nojekyll', '')

    files = sorted(p.relative_to(DOCS).as_posix() for p in DOCS.rglob('*') if p.is_file())
    print(f'docs/index.html  {len(page.encode("utf-8")):,} bytes')
    print(f'docs/ ({len(files)} files): ' + ', '.join(files))


if __name__ == '__main__':
    main()

# Pulp Drop

A fruit-merge drop game set in a timber kitchen. Drop fruit slices into a glass jug, merge matching pairs up the chain from blueberry to watermelon, and keep the pile under the MAX line.

**Play:** https://james-debono.github.io/pulp-drop-game/

On Android, open the link in Chrome, then tap the three-dot menu, **Install and create shortcut**, **Install**. It gets its own icon, opens full screen and works offline after the first load.

## How to play

- Drag to aim, let go to drop. On a computer, move to aim and click, or use the arrow keys and Space.
- Two of the same fruit merge into the next size up.
- Keep the pile under the MAX line. A fruit sitting above it for 2.5 seconds ends the game.
- Every 500 points earns a power. Spend each one on whichever of the four you need:
  - **Shake**: for 5 seconds, press anywhere and drag to throw the jug around.
  - **Clear**: empty every blueberry or every cherry out of the jug.
  - **Bomb**: pick one fruit to remove.
  - **Grow**: pick one fruit to turn into the next size up.
- Clear, Bomb and Grow freeze the jug while you pick, so take your time. Cancel gives the power back.

## Under the hood

- One self-contained page, no frameworks or libraries.
- Hand-written 2D physics: circles solved with substepped soft contacts (warm-started impulses, a relax pass and restitution), with friction, spin and rolling resistance.
- Every fruit is drawn in code as a cross-section slice, and every sound is synthesized with the Web Audio API.
- Installable web app with a manifest and an offline service worker.

## Develop

Needs Python 3.8+ for the build and Node.js for the physics tests.

```
python build.py            # builds docs/, the site
node test/engine.test.js   # headless physics checks
```

To play the current build, serve the site with `python -m http.server 8000 --directory docs` and open http://localhost:8000. Commit `docs/` after building; GitHub Pages serves it from the `main` branch.

## Layout

```
src/engine.js    physics engine (no DOM)
src/art.js       fruit slices, icons and the timber wall, all drawn in code
src/game.js      rules, input, rendering, sound and saving
src/style.css    layout and the light and dark themes
src/index.html   the page, which the build fills with the CSS and scripts
pwa/             manifest, service worker, icons and the icon renderer
test/            headless physics tests
docs/            built site served by GitHub Pages
```

Fonts: Shrikhand and Figtree from Google Fonts (SIL Open Font License).

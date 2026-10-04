# Pulp Drop: notes for Claude

A fruit-merge drop game (the Suika-style mechanic, with original code, art, sound and name), built as one self-contained HTML page. The owner plays it with their partner on Android phones as an installed web app.

## Where it lives

- Live site: https://james-debono.github.io/pulp-drop/ (GitHub Pages, `main` branch, `/docs` folder). Repo: `james-debono/pulp-drop`, public.
- Claude artifact with the same game, playable inside Claude: https://claude.ai/artifact/PoW311Gbx4Afz7dR8eGup7. After a change, republish `dist/pulp-drop.html` to that URL from a Claude session that has the Artifact tool, so both copies stay in sync.

## Build, test, ship

1. Edit `src/` (and `pwa/` for the manifest or service worker).
2. `python build.py` writes `docs/` and `dist/`. Never edit `docs/` or `dist/` by hand.
3. For physics changes run `node test/engine.test.js`. Expect no NaN, every body inside the jug, stacks that settle (maxSpeed near 0), small overlaps (minSep around -0.3 or better), the lemon pair merging into a kiwi, and two watermelons popping.
4. Commit `src/`, `pwa/` and `docs/` together and push to `main`. Pages redeploys in about a minute. Installed apps get the new page the next time they open online, because the service worker fetches the page network-first.
5. If the icons or manifest change, bump `CACHE` in `pwa/sw.js` so phones drop their cached copies.

### First-time setup (only if the GitHub repo doesn't exist yet)

- `git init -b main`, commit everything, then `gh repo create pulp-drop --public --source . --push`.
- Turn on Pages from `main` and `/docs`: `gh api -X POST repos/james-debono/pulp-drop/pages -f "source[branch]=main" -f "source[path]=/docs"`, or on github.com: Settings > Pages > Deploy from a branch > `main` > `/docs`.

## Architecture

- `src/engine.js` (`PulpEngine`): circles in a box, W=100 by H=125 world units, y pointing down, MAX line at y=0. Soft-step solver: fixed 1/120 s step, 4 substeps, contact hertz 60 (walls twice that), damping ratio 10, warm starting keyed by contact pair, a relax pass, a restitution pass and rolling resistance. Contacts are re-detected every substep with a speculative margin. Mass grows as r^1.5 rather than r^2 so big fruit don't visibly crush small ones. Same-tier circles that touch merge (lowest pair first) and the new fruit grows from the larger radius over 0.12 s. `world.ax` and `world.ay` add the shake force.
- `src/art.js` (`FruitArt`): 11 tiers drawn as cross-section slices: blueberry, cherry, lime, lemon, kiwi, orange, apple, dragon fruit, grapefruit, coconut, watermelon. Sprites rotate with the body; the gloss layer stays fixed. `timber()` paints the wood-plank wall.
- `src/game.js`: fixed-step loop with render interpolation; input (drag to aim, release to drop, keyboard too); the danger rule (a fruit above the MAX line for 2.5 s, after a 1 s grace, ends the game); scoring with triangular numbers (1 to 66 per merge); effects; Web Audio sounds; saving to localStorage under `pulpdrop.v1.*` (per device); and `window.claude.hot` snapshot support for the artifact viewer.
- Shake power-up: one per 500 points (`SHAKE_EVERY`), plus `BONUS_SHAKES` at game start (0 for normal play). Tapping Shake starts 5 s in which pressing anywhere and dragging moves the jug canvas with the finger (spring-followed, applied as a CSS transform). The fruit feel the jug's acceleration in reverse through `world.ax/ay`, clamped. The MAX-line timer pauses during a shake and for 1.5 s after. Phone motion sensors were tried and dropped: Claude artifacts block them, and you can't watch the screen while shaking.
- `src/style.css`: every colour is a token on `:root`, with dark-theme overrides under `prefers-color-scheme` and `[data-theme]`. The canvas reads `--ink`, `--glass*`, `--wood-*` and related tokens at runtime.

## Conventions

- UI copy: short, plain, no em dashes.
- Keep it one self-contained page with no frameworks and no build dependencies beyond Python's standard library. Google Fonts is the only external request.
- Test physics changes headlessly before shipping; the game's feel depends on the solver constants.

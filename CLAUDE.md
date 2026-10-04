# Pulp Drop: notes for Claude

A fruit-merge drop game (the Suika-style mechanic, with original code, art, sound and name), built as one self-contained HTML page. The owner plays it with their partner on Android phones as an installed web app.

## Where it lives

- Live site: https://james-debono.github.io/pulp-drop-game/ (GitHub Pages, `main` branch, `/docs` folder). Repo: `james-debono/pulp-drop-game`, public.
- An older copy lives as a Claude artifact (https://claude.ai/artifact/PoW311Gbx4Afz7dR8eGup7). It is no longer kept in sync, so don't republish it after changes. The site is the only copy that matters.

## Build, test, ship

1. Edit `src/` (and `pwa/` for the manifest or service worker).
2. `python build.py` inlines the CSS and scripts into `src/index.html` and writes `docs/`. Never edit `docs/` by hand.
3. For physics changes run `node test/engine.test.js`. Expect no NaN, every body inside the jug, stacks that settle (maxSpeed near 0), small overlaps (minSep around -0.3 or better), the lemon pair merging into a kiwi, two watermelons popping, a lime grown beside a lemon merging into a kiwi, watermelons refusing to grow, and the jug settling after the grow, bomb and clear test.
   To play the build, serve `docs/` (`python -m http.server 8000 --directory docs`); `.claude/launch.json` starts the same server as `pulp-drop` for the desktop app's preview pane. When that pane is hidden it stops animation frames, so set `window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)` from the console and take one screenshot to restart the loop. To load a test save, write `pulpdrop.v1.game` from another page on the same origin (such as `/manifest.webmanifest`) and then open the game, because the game saves over it when the page unloads.
4. Commit `src/`, `pwa/` and `docs/` together and push to `main`. Pages redeploys in about a minute. Installed apps get the new page the next time they open online, because the service worker fetches the page network-first.
5. If the icons or manifest change, bump `CACHE` in `pwa/sw.js` so phones drop their cached copies.

### First-time setup (only if the GitHub repo doesn't exist yet)

- `git init -b main`, commit everything, then `gh repo create pulp-drop-game --public --source . --push`.
- Turn on Pages from `main` and `/docs`: `gh api -X POST repos/james-debono/pulp-drop-game/pages -f "source[branch]=main" -f "source[path]=/docs"`, or on github.com: Settings > Pages > Deploy from a branch > `main` > `/docs`.

## Architecture

- `src/engine.js` (`PulpEngine`): circles in a box, W=100 by H=125 world units, y pointing down, MAX line at y=0. Soft-step solver: fixed 1/120 s step, 4 substeps, contact hertz 60 (walls twice that), damping ratio 10, warm starting keyed by contact pair, a relax pass, a restitution pass and rolling resistance. Contacts are re-detected every substep with a speculative margin. Mass grows as r^1.5 rather than r^2 so big fruit don't visibly crush small ones. Same-tier circles that touch merge (lowest pair first) and the new fruit grows from the larger radius over 0.12 s. `world.ax` and `world.ay` add the shake force. `removeBodies` and `growBody` (next tier in place, swelling like a merge) serve the powers.
- `src/art.js` (`FruitArt`): 11 tiers drawn as cross-section slices: blueberry, cherry, lime, lemon, kiwi, orange, apple, dragon fruit, grapefruit, coconut, watermelon. Sprites rotate with the body; the gloss layer stays fixed. `timber()` paints the wood-plank wall.
- `src/game.js`: fixed-step loop with render interpolation; input (drag to aim, release to drop, keyboard too); the danger rule (a fruit above the MAX line for 2.5 s, after a 1 s grace, ends the game); scoring with triangular numbers (1 to 66 per merge); effects; Web Audio sounds; and saving to localStorage under `pulpdrop.v1.*` (per device). Saves count spent powers as `powersUsed`; older saves that only had `shakesUsed` still load.
- `src/index.html` is the whole page (head, markup, service worker registration) with markers the build replaces.
- Powers: one per 500 points (`POWER_EVERY`), plus `BONUS_POWERS` at game start (0 for normal play), shown by the Powers meter on the chalkboard. Each can be spent on any of four buttons in the tray along the bottom of the chalkboard. The MAX-line timer pauses for 1.5 s (`SETTLE`) after any power.
  - Shake: 5 s in which pressing anywhere and dragging moves the jug canvas with the finger (spring-followed, applied as a CSS transform). The fruit feel the jug's acceleration in reverse through `world.ax/ay`, clamped. The MAX-line timer pauses during a shake too. Phone motion sensors were tried and dropped: you can't watch the screen while shaking.
  - Clear (every blueberry or every cherry), Bomb (one fruit) and Grow (one fruit up a tier; watermelons can't): the tray turns into a prompt and the physics freezes until the player picks or cancels, so nothing is spent until a pick lands. Pressing highlights the nearest fruit within `PICK_SLOP` px, sliding moves the highlight, and letting go uses the power. Clear also has blueberry and cherry buttons with counts. Arrow keys, Enter and Escape work too.
- `src/style.css`: every colour is a token on `:root`, with dark-theme overrides under `prefers-color-scheme` and `[data-theme]`. The canvas reads `--ink`, `--glass*`, `--wood-*` and related tokens at runtime.

## Conventions

- UI copy: short, plain, no em dashes.
- Keep it one self-contained page with no frameworks and no build dependencies beyond Python's standard library. Google Fonts is the only external request.
- Test physics changes headlessly before shipping; the game's feel depends on the solver constants.

// Headless checks for the Pulp Drop physics engine.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src + '\nthis.PulpEngine = PulpEngine;', ctx);
const E = ctx.PulpEngine;
const { W, H, TIERS, CFG } = E;
const STEP = CFG.step;
if (process.env.HZ) CFG.contactHertz = +process.env.HZ;
if (process.env.SUB) CFG.substeps = +process.env.SUB;
if (process.env.MEXP) CFG.massExponent = +process.env.MEXP;

let seed = 12345;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

function stats(world) {
  let minSep = Infinity, maxSpeed = 0, maxSpin = 0, outside = 0, nan = 0;
  const bs = world.bodies;
  for (const b of bs) {
    if (![b.x, b.y, b.vx, b.vy, b.w].every(Number.isFinite)) nan++;
    maxSpeed = Math.max(maxSpeed, Math.hypot(b.vx, b.vy));
    maxSpin = Math.max(maxSpin, Math.abs(b.w));
    minSep = Math.min(minSep, b.x - b.r, W - b.x - b.r, H - b.y - b.r);
    if (b.x < -0.5 || b.x > W + 0.5 || b.y > H + 0.5) outside++;
  }
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], b = bs[j];
    const s = Math.hypot(b.x - a.x, b.y - a.y) - a.r - b.r;
    if (s < minSep) minSep = s;
  }
  return { n: bs.length, minSep: +minSep.toFixed(3), maxSpeed: +maxSpeed.toFixed(3), maxSpin: +maxSpin.toFixed(3), outside, nan };
}

function run(world, seconds, events = []) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) E.step(world, STEP, events);
  return events;
}

const results = {};

// 1. Stacking without merges: random sizes poured in, then settle.
{
  const w = E.createWorld();
  w.noMerge = true;
  const t0 = process.hrtime.bigint();
  let steps = 0;
  for (let k = 0; k < 70; k++) {
    const tier = Math.floor(rand() * 7);
    const r = TIERS[tier].r;
    E.addBody(w, tier, r + rand() * (W - 2 * r), -20);
    for (let i = 0; i < Math.round(0.35 / STEP); i++) { E.step(w, STEP, []); steps++; }
  }
  for (let i = 0; i < Math.round(8 / STEP); i++) { E.step(w, STEP, []); steps++; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const s1 = stats(w);
  // Drift over 2 more seconds at rest
  const before = w.bodies.map((b) => [b.x, b.y]);
  run(w, 2);
  let drift = 0;
  w.bodies.forEach((b, i) => { drift = Math.max(drift, Math.hypot(b.x - before[i][0], b.y - before[i][1])); });
  const top = Math.min(...w.bodies.map((b) => b.y - b.r));
  results.stack = { ...s1, drift2s: +drift.toFixed(4), topY: +top.toFixed(2), msPerStep: +(ms / steps).toFixed(4) };
}

// 2. Heavy watermelon resting on a floor of blueberries.
{
  const w = E.createWorld();
  w.noMerge = true;
  for (let i = 0; i < 15; i++) E.addBody(w, 0, 3.3 + i * 6.6, H - 3.2);
  run(w, 1);
  E.addBody(w, 10, 50, -10);
  run(w, 5);
  results.heavy = stats(w);
}

// 3. Two lemons merge into a kiwi.
{
  const w = E.createWorld();
  E.addBody(w, 3, 50, 60);
  const ev = [];
  run(w, 1, ev);
  E.addBody(w, 3, 50.5, 0);
  run(w, 2, ev);
  const merges = ev.filter((e) => e.type === 'merge').map((e) => TIERS[e.tier].name);
  results.merge = { merges, bodies: w.bodies.map((b) => TIERS[b.tier].name) };
}

// 4. Two watermelons vanish.
{
  const w = E.createWorld();
  E.addBody(w, 10, 27.2, H - 23);
  E.addBody(w, 10, 72.8, H - 23);
  const ev = run(w, 3);
  results.pop = { events: ev.filter((e) => e.type === 'pop').length, left: w.bodies.length };
}

// 5. Random play with merges and the MAX-line rule until overflow.
{
  const w = E.createWorld();
  const weights = [5, 5, 4, 3, 3];
  const pick = () => { let x = rand() * 20; for (let i = 0; i < 5; i++) { x -= weights[i]; if (x < 0) return i; } return 4; };
  let score = 0, drops = 0, maxTier = 0, over = false, t = 0, worstStep = 0, maxBodies = 0, maxLandedSpeed = 0, ejected = 0;
  const ev = [];
  while (!over && drops < 600) {
    const tier = pick();
    const r = TIERS[tier].r;
    E.addBody(w, tier, r + rand() * (W - 2 * r), -20);
    drops++;
    for (let i = 0; i < Math.round(0.6 / STEP) && !over; i++) {
      const t0 = process.hrtime.bigint();
      ev.length = 0;
      E.step(w, STEP, ev);
      worstStep = Math.max(worstStep, Number(process.hrtime.bigint() - t0) / 1e6);
      t += STEP;
      for (const e of ev) {
        if (e.type === 'merge' || e.type === 'pop') score += e.points;
        if (e.type === 'merge') maxTier = Math.max(maxTier, e.tier);
        if (e.type === 'lost') throw new Error('lost body');
      }
      maxBodies = Math.max(maxBodies, w.bodies.length);
      for (const b of w.bodies) { if (b.landed && b.age > 0.3) { maxLandedSpeed = Math.max(maxLandedSpeed, Math.hypot(b.vx, b.vy)); if (b.y < -45) ejected++; } }
      for (const b of w.bodies) {
        if (b.age > 1 && b.y - b.r < 0) b.danger += STEP; else b.danger = 0;
        if (b.danger >= 2.5) over = true;
      }
    }
  }
  results.play = { drops, score, maxTier: TIERS[maxTier].name, seconds: +t.toFixed(1), maxBodies, maxLandedSpeed: +maxLandedSpeed.toFixed(1), ejected, worstStepMs: +worstStep.toFixed(3), final: stats(w) };
}

console.log(JSON.stringify(results, null, 2));

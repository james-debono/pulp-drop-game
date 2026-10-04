// Pulp Drop game layer: input, rules, rendering, sound, the shake power-up and saving.
(() => {
  'use strict';
  const E = PulpEngine;
  const Art = FruitArt;
  const { W, H, TIERS, CFG } = E;
  const STEP = CFG.step;
  const TAU = Math.PI * 2;

  // World view: the jug interior is x 0..W, y 0..H; y < 0 is headroom above the MAX line.
  const VIEW = { x0: -4.2, y0: -25, w: 108.4, h: 157 };
  const HOLD_Y = -15;
  const RIM_Y = -6;
  const WALL = 3.2;
  const BASE = 5.5;
  const CORNER = 7;
  const COOLDOWN = 0.5;
  const GRACE = 1.0;
  const LIMIT = 2.5;
  const POP_TIME = 0.26;
  const DROP_WEIGHTS = [5, 5, 4, 3, 3];

  // Shake power-up
  const BONUS_SHAKES = 0; // free shakes at the start of every game
  const SHAKE_EVERY = 500; // points per shake earned
  const SHAKE_TIME = 5; // seconds a shake lasts
  const SHAKE_SETTLE = 1.5; // MAX-line timer stays paused this long after a shake
  const SHAKE_X = 3200; // strongest sideways push, world units / s^2
  const SHAKE_UP = 1150; // strongest upward push
  const SHAKE_DOWN = 2000;
  const DRAG_X = 42; // how far a drag can pull the jug sideways, CSS px
  const DRAG_Y = 30;
  const SPRING_K = 1600; // the jug follows your finger on a stiff spring
  const SPRING_C = 44;
  const RING_LEN = 2 * Math.PI * 21;

  const KEYS = { save: 'pulpdrop.v1.game', best: 'pulpdrop.v1.best', muted: 'pulpdrop.v1.muted' };

  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const woodCanvas = $('wood');
  const scoreEl = $('score');
  const bestEl = $('best');
  const nextImg = $('next-img');
  const ladderEl = $('ladder');
  const hintEl = $('hint');
  const overEl = $('over');
  const confirmEl = $('confirm');
  const soundBtn = $('sound');
  const shakeBtn = $('shake');
  const shakeCount = $('shake-count');
  const shakeRing = $('shake-ring');
  const bannerEl = $('banner');
  const bannerFill = $('banner-fill');
  const toastEl = $('toast');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(pointer: coarse)');

  const storage = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const vibrate = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not allowed */ } };

  // ---------------------------------------------------------------- sound
  const Sound = (() => {
    let ac = null;
    let out = null;
    let noise = null;
    let muted = storage.get(KEYS.muted) === '1';

    function init() {
      if (ac) {
        if (ac.state === 'suspended') ac.resume().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ac = new AC();
        out = ac.createGain();
        out.gain.value = 0.55;
        out.connect(ac.destination);
        const len = Math.floor(ac.sampleRate * 0.4);
        noise = ac.createBuffer(1, len, ac.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) {
        ac = null;
      }
    }

    function tone(f0, f1, dur, type, vol, delay = 0) {
      if (!ac || muted) return;
      const t = ac.currentTime + delay;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + dur + 0.05);
    }

    function hiss(dur, vol, freq, q, delay = 0) {
      if (!ac || muted || !noise) return;
      const t = ac.currentTime + delay;
      const s = ac.createBufferSource();
      s.buffer = noise;
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f);
      f.connect(g);
      g.connect(out);
      s.start(t, Math.random() * 0.3);
      s.stop(t + dur + 0.02);
    }

    return {
      init,
      isMuted: () => muted,
      setMuted(m) { muted = m; storage.set(KEYS.muted, m ? '1' : '0'); },
      drop(tier) { tone(560 - tier * 45, 320 - tier * 25, 0.09, 'sine', 0.1); },
      land(tier, speed) {
        if (speed < 70) return;
        const v = Math.min(0.2, speed / 1800);
        tone(170 - tier * 8, 95, 0.12, 'sine', v);
        hiss(0.05, v * 0.35, 900, 0.8);
      },
      merge(tier) {
        const f = 1000 * Math.pow(2, -tier * 0.27);
        tone(f, f * 1.7, 0.2, 'sine', 0.28);
        tone(f * 2, f * 2.6, 0.1, 'triangle', 0.05);
        hiss(0.08, 0.05 + tier * 0.012, 2600 - tier * 140, 1.2);
      },
      pop() {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, f * 1.01, 0.38, 'triangle', 0.15, i * 0.07));
        hiss(0.32, 0.12, 1800, 0.7);
      },
      over() {
        [392, 329.63, 261.63, 196].forEach((f, i) => tone(f, f * 0.98, 0.32, 'triangle', 0.13, i * 0.13));
      },
      earn() {
        [659.25, 987.77, 1318.51].forEach((f, i) => tone(f, f, 0.2, 'triangle', 0.12, i * 0.07));
      },
      whoosh() {
        hiss(0.4, 0.16, 650, 0.6);
        tone(200, 90, 0.3, 'sine', 0.1);
      },
      rattle(k) { hiss(0.05, 0.04 + k * 0.1, 1700 + Math.random() * 1500, 2.5); },
    };
  })();

  // ---------------------------------------------------------------- state
  let world = null;
  let score = 0;
  let best = Math.max(0, parseInt(storage.get(KEYS.best) || '0', 10) || 0);
  let bestAtStart = best;
  let held = null;
  let heldAngle = 0;
  let heldPop = 0;
  let next = 0;
  let aimX = W / 2;
  let cooldown = 0;
  let over = false;
  let paused = false;
  let maxTier = 0;
  let drops = 0;
  let danger = 0;
  let shakesUsed = 0;
  let overTimer = null;
  let keyDir = 0;

  const shake = {
    active: false,
    t: 0,
    settle: 0,
    jx: 0, jy: 0, vx: 0, vy: 0, // where the jug is pulled to on screen, CSS px
    tx: 0, ty: 0, // where your finger wants it
    pointer: null,
    sx: 0, sy: 0, // where that drag started
    bx: 0, by: 0,
    lastSign: 0,
    lastRattle: 0,
  };

  let S = 1; // device pixels per world unit
  let unitPx = 3; // CSS pixels per world unit
  let jugTransform = '';
  let sprites = [];
  let glosses = [];
  let colors = {};
  const icons = [];
  const fx = { parts: [], rings: [], texts: [], shake: 0, shakeMag: 0 };

  const pickTier = (limit = 5) => {
    let total = 0;
    for (let i = 0; i < limit; i++) total += DROP_WEIGHTS[i];
    let x = Math.random() * total;
    for (let i = 0; i < limit; i++) {
      x -= DROP_WEIGHTS[i];
      if (x < 0) return i;
    }
    return limit - 1;
  };

  const validTier = (t) => Number.isInteger(t) && t >= 0 && t < 5;
  const clampAim = (x, tier) => {
    const r = TIERS[tier == null ? 0 : tier].r;
    return clamp(x, r, W - r);
  };
  const shakesEarned = () => Math.floor(score / SHAKE_EVERY);
  const shakesTotal = () => BONUS_SHAKES + shakesEarned();
  const shakesLeft = () => Math.max(0, shakesTotal() - shakesUsed);

  function setHeld(tier) {
    held = tier;
    if (tier > maxTier) maxTier = tier;
    heldAngle = Math.random() * TAU;
    heldPop = POP_TIME;
    aimX = clampAim(aimX, tier);
  }

  function resetShake() {
    shake.active = false;
    shake.t = 0;
    shake.settle = 0;
    shake.jx = shake.jy = shake.vx = shake.vy = shake.tx = shake.ty = 0;
    shake.pointer = null;
    bannerEl.hidden = true;
    if (world) { world.ax = 0; world.ay = 0; }
  }

  function newGame() {
    resetShake();
    world = E.createWorld();
    score = 0;
    shakesUsed = 0;
    bestAtStart = best;
    next = pickTier();
    setHeld(pickTier(3));
    aimX = W / 2;
    cooldown = 0;
    over = false;
    paused = false;
    maxTier = Math.max(held, next);
    drops = 0;
    danger = 0;
    fx.parts.length = 0;
    fx.rings.length = 0;
    fx.texts.length = 0;
    fx.shake = 0;
    clearTimeout(overTimer);
    overEl.hidden = true;
    confirmEl.hidden = true;
    updateHint();
    updateHud(true);
    save();
  }

  function snapshot() {
    return {
      v: 1,
      bodies: E.serialize(world),
      score,
      best,
      bestAtStart,
      held,
      next,
      aimX,
      maxTier,
      drops,
      over,
      shakesUsed,
    };
  }

  function restoreFrom(s) {
    if (!s || s.v !== 1 || !Array.isArray(s.bodies)) return false;
    resetShake();
    world = E.createWorld();
    E.restore(world, s.bodies);
    score = Number.isFinite(s.score) ? Math.max(0, s.score) : 0;
    if (Number.isFinite(s.best)) best = Math.max(best, s.best);
    bestAtStart = Number.isFinite(s.bestAtStart) ? s.bestAtStart : best;
    next = validTier(s.next) ? s.next : pickTier();
    aimX = Number.isFinite(s.aimX) ? s.aimX : W / 2;
    maxTier = Number.isInteger(s.maxTier) ? clamp(s.maxTier, 0, TIERS.length - 1) : 4;
    drops = Number.isInteger(s.drops) ? s.drops : world.bodies.length;
    shakesUsed = Number.isInteger(s.shakesUsed) ? clamp(s.shakesUsed, 0, shakesTotal()) : 0;
    over = !!s.over;
    paused = false;
    cooldown = 0;
    danger = 0;
    held = null;
    if (!over) setHeld(validTier(s.held) ? s.held : pickTier());
    overEl.hidden = true;
    confirmEl.hidden = true;
    updateHint();
    updateHud(true);
    if (over) showOver();
    return true;
  }

  function loadSaved() {
    const raw = storage.get(KEYS.save);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!world) return;
    if (score > best) best = score;
    storage.set(KEYS.best, String(best));
    storage.set(KEYS.save, JSON.stringify(snapshot()));
  }
  function saveSoon() {
    if (!saveTimer) saveTimer = setTimeout(save, 600);
  }

  // ---------------------------------------------------------------- rules
  function drop() {
    if (over || paused || held == null || shake.active) return;
    const tier = held;
    const r = TIERS[tier].r;
    E.addBody(world, tier, clamp(aimX, r, W - r), HOLD_Y, { a: heldAngle, w: (Math.random() - 0.5) * 1.5 });
    drops++;
    held = null;
    cooldown = COOLDOWN;
    Sound.drop(tier);
    if (drops === 1) updateHint();
    saveSoon();
  }

  function addScore(points) {
    const before = shakesEarned();
    score += points;
    if (shakesEarned() > before) {
      toast(shakesEarned() === 1 ? 'Shake earned. Tap the jar to use it.' : 'Another shake earned');
      Sound.earn();
      vibrate(20);
      if (!reduceMotion.matches) {
        shakeBtn.classList.remove('pop');
        void shakeBtn.offsetWidth;
        shakeBtn.classList.add('pop');
      }
    }
  }

  function tick() {
    updateShake(STEP);
    const events = [];
    E.step(world, STEP, events);
    for (let i = 0; i < events.length; i++) handle(events[i]);
    const calm = shake.active || shake.settle > 0;
    let d = 0;
    const bodies = world.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (!calm && b.age > GRACE && b.y - b.r < 0) b.danger += STEP;
      else if (b.danger > 0) b.danger = Math.max(0, b.danger - STEP * 2);
      if (b.danger > d) d = b.danger;
    }
    danger = d;
    if (danger >= LIMIT) endGame();
  }

  function handle(e) {
    if (e.type === 'merge') {
      addScore(e.points);
      if (e.tier > maxTier) maxTier = e.tier;
      const b = world.bodies.find((q) => q.id === e.id);
      if (b) b.pop = POP_TIME;
      splash(e.x, e.y, e.from, e.tier);
      popup(e.x, e.y - TIERS[e.tier].r * 0.2, e.points);
      Sound.merge(e.tier);
      if (e.tier >= 8) jolt(0.6 + (e.tier - 8) * 0.5);
      updateHud();
      saveSoon();
    } else if (e.type === 'pop') {
      addScore(e.points);
      splash(e.x, e.y, e.tier, e.tier, true);
      popup(e.x, e.y, e.points);
      Sound.pop();
      jolt(2.2);
      updateHud();
      saveSoon();
    } else if (e.type === 'land') {
      if (!shake.active) Sound.land(e.tier, e.speed);
    }
  }

  function endGame() {
    if (over) return;
    if (shake.active) endShake();
    over = true;
    held = null;
    Sound.over();
    save();
    updateHud();
    clearTimeout(overTimer);
    overTimer = setTimeout(showOver, 800);
  }

  function showOver() {
    $('over-score').textContent = fmt(score);
    const isBest = score > bestAtStart && score > 0;
    $('over-best').hidden = isBest;
    $('over-new').hidden = !isBest;
    $('over-best-value').textContent = fmt(Math.max(best, score));
    const top = Math.max(0, maxTier);
    $('over-fruit').textContent = TIERS[top].name;
    $('over-fruit-img').src = icons[top] || '';
    overEl.hidden = false;
    updateHint();
    $('again').focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- shake power-up
  // While a shake runs, pressing anywhere and dragging moves the jug with your finger.
  // The fruit feel the jug's acceleration in reverse, so quick wiggles throw them around.
  function startShake() {
    if (!world || over || paused || shake.active) return;
    Sound.init();
    if (shakesLeft() <= 0) {
      toast(`Next shake at ${fmt((shakesEarned() + 1) * SHAKE_EVERY)} points`);
      return;
    }
    shakesUsed++;
    shake.active = true;
    shake.t = 0;
    shake.tx = 0;
    shake.ty = 0;
    shake.pointer = null;
    shake.vx += (Math.random() < 0.5 ? -1 : 1) * 150; // a small jolt as the jug comes loose
    dragging = false;
    activePointer = null;
    bannerEl.hidden = false;
    updateBanner();
    updateHud();
    Sound.whoosh();
    vibrate(30);
    saveSoon();
  }

  function endShake() {
    shake.active = false;
    shake.settle = SHAKE_SETTLE;
    shake.tx = 0;
    shake.ty = 0;
    shake.pointer = null;
    bannerEl.hidden = true;
    updateHud();
  }

  function updateShake(dt) {
    if (shake.active && shake.pointer == null) {
      shake.tx = keyDir * 30;
      shake.ty = 0;
    }
    const ax = SPRING_K * (shake.tx - shake.jx) - SPRING_C * shake.vx;
    const ay = SPRING_K * (shake.ty - shake.jy) - SPRING_C * shake.vy;
    shake.vx += ax * dt;
    shake.jx += shake.vx * dt;
    shake.vy += ay * dt;
    shake.jy += shake.vy * dt;
    const moving = Math.abs(shake.jx) > 0.05 || Math.abs(shake.jy) > 0.05 ||
      Math.abs(shake.vx) > 1 || Math.abs(shake.vy) > 1;
    if (moving) {
      world.ax = clamp(-ax / unitPx, -SHAKE_X, SHAKE_X);
      world.ay = clamp(-ay / unitPx, -SHAKE_UP, SHAKE_DOWN);
    } else {
      shake.jx = shake.jy = shake.vx = shake.vy = 0;
      world.ax = 0;
      world.ay = 0;
    }
    if (!shake.active) {
      if (shake.settle > 0) shake.settle = Math.max(0, shake.settle - dt);
      return;
    }
    shake.t += dt;
    const now = performance.now();
    const sign = world.ax > 700 ? 1 : world.ax < -700 ? -1 : 0;
    if (sign && sign !== shake.lastSign && now - shake.lastRattle > 70) {
      shake.lastRattle = now;
      Sound.rattle(Math.min(1, Math.abs(world.ax) / SHAKE_X));
    }
    if (sign) shake.lastSign = sign;
    if (shake.t >= SHAKE_TIME) endShake();
  }

  function updateBanner() {
    bannerFill.style.transform = `scaleX(${Math.max(0, 1 - shake.t / SHAKE_TIME).toFixed(3)})`;
  }

  let toastTimer = null;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    toastEl.classList.remove('show');
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2000);
  }

  // ---------------------------------------------------------------- effects
  function splash(x, y, fromTier, toTier, big) {
    const color = Art.JUICE[fromTier];
    const calm = reduceMotion.matches;
    const n = calm ? 6 : big ? 46 : 10 + toTier * 2;
    const speed = big ? 140 : 40 + toTier * 9;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = speed * (0.35 + Math.random() * 0.75);
      fx.parts.push({
        x: x + Math.cos(a) * TIERS[fromTier].r * 0.5,
        y: y + Math.sin(a) * TIERS[fromTier].r * 0.5,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 25,
        r: 0.45 + Math.random() * (0.55 + toTier * 0.07),
        life: 0,
        max: 0.4 + Math.random() * 0.35,
        color: i % 4 === 0 && !big ? Art.JUICE[toTier] : color,
      });
    }
    fx.rings.push({ x, y, r0: TIERS[fromTier].r, r1: TIERS[toTier].r * (big ? 2.4 : 1.55), life: 0, max: big ? 0.6 : 0.34, color });
  }

  function popup(x, y, points) {
    fx.texts.push({ x, y, text: '+' + points, size: 4.2 + (Math.min(points, 66) / 66) * 4.5, life: 0, max: 0.9 });
  }

  function jolt(mag) {
    if (reduceMotion.matches) return;
    fx.shakeMag = fx.shake > 0 ? Math.max(fx.shakeMag, mag) : mag;
    fx.shake = 0.35;
  }

  function updateFx(dt) {
    const parts = fx.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      p.vy += 300 * dt;
      p.vx *= 1 - 1.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = fx.rings.length - 1; i >= 0; i--) {
      const r = fx.rings[i];
      r.life += dt;
      if (r.life >= r.max) fx.rings.splice(i, 1);
    }
    for (let i = fx.texts.length - 1; i >= 0; i--) {
      const t = fx.texts[i];
      t.life += dt;
      t.y -= 14 * dt;
      if (t.life >= t.max) fx.texts.splice(i, 1);
    }
    if (fx.shake > 0) {
      fx.shake -= dt;
      if (fx.shake <= 0) { fx.shake = 0; fx.shakeMag = 0; }
    }
    if (heldPop > 0) heldPop = Math.max(0, heldPop - dt);
    if (world) {
      const bodies = world.bodies;
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (b.pop > 0) b.pop = Math.max(0, b.pop - dt);
      }
    }
  }

  // ---------------------------------------------------------------- layout, theme and art
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    colors = {
      ink: v('--ink'),
      danger: v('--danger'),
      glass: v('--glass'),
      wall: v('--glass-wall'),
      line: v('--glass-line'),
      shine: v('--glass-shine'),
      floor: v('--floor-shadow'),
      bg: v('--bg'),
      wood: {
        tones: v('--wood-tones').split(/\s+/).filter(Boolean),
        hi: v('--wood-hi'),
        lo: v('--wood-lo'),
        grain: v('--wood-grain'),
        grainHi: v('--wood-grain-hi'),
        seam: v('--wood-seam'),
        seamHi: v('--wood-seam-hi'),
        knot: v('--wood-knot'),
        light: v('--wood-light'),
        vignette: v('--wood-vignette'),
      },
    };
    if (!colors.wood.tones.length) colors.wood.tones = [colors.bg || '#c39158'];
    woodKey = '';
    paintWood();
  }

  let woodKey = '';
  function paintWood() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const key = `${w}x${h}@${dpr}`;
    if (key === woodKey || !colors.wood) return;
    woodKey = key;
    Art.timber(woodCanvas, w, h, dpr, colors.wood);
  }

  let woodTimer = null;
  function onResize() {
    layout();
    clearTimeout(woodTimer);
    woodTimer = setTimeout(paintWood, 150);
  }

  function layout() {
    const rect = stage.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    const scale = Math.min(rect.width / VIEW.w, rect.height / VIEW.h);
    const w = Math.floor(VIEW.w * scale);
    const h = Math.floor(VIEW.h * scale);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const nextS = (w / VIEW.w) * dpr;
    unitPx = w / VIEW.w;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    stage.style.setProperty('--jug-w', w + 'px');
    stage.style.setProperty('--jug-h', h + 'px');
    stage.style.setProperty('--jug-top', Math.max(0, Math.round(rect.height - h)) + 'px');
    stage.style.setProperty('--u', (h / VIEW.h).toFixed(4) + 'px');
    if (!sprites.length || Math.abs(nextS - S) / S > 0.01) {
      S = nextS;
      sprites = TIERS.map((t, i) => Art.sprite(i, t.r * S));
      glosses = TIERS.map((t, i) => Art.gloss(i, t.r * S));
    }
    render(1);
  }

  function buildIcons() {
    TIERS.forEach((t, i) => { icons[i] = Art.icon(i, 96); });
    ladderEl.textContent = '';
    TIERS.forEach((t, i) => {
      const img = document.createElement('img');
      img.src = icons[i];
      img.alt = t.name;
      img.title = t.name;
      img.width = 34;
      img.height = 34;
      img.draggable = false;
      img.style.setProperty('--k', (0.62 + (0.38 * i) / (TIERS.length - 1)).toFixed(3));
      ladderEl.appendChild(img);
    });
  }

  let shownNext = -1;
  let shownScore = -1;
  function updateHud(force) {
    if (force || score !== shownScore) {
      if (shownScore >= 0 && score > shownScore && !reduceMotion.matches) {
        scoreEl.classList.remove('bump');
        void scoreEl.offsetWidth;
        scoreEl.classList.add('bump');
      }
      shownScore = score;
      scoreEl.textContent = fmt(score);
      bestEl.textContent = fmt(Math.max(best, score));
    }
    if (force || next !== shownNext) {
      shownNext = next;
      nextImg.src = icons[next];
      nextImg.alt = TIERS[next].name;
    }
    const imgs = ladderEl.children;
    const reach = Math.max(4, maxTier);
    for (let i = 0; i < imgs.length; i++) {
      imgs[i].classList.toggle('locked', i > reach);
      imgs[i].classList.toggle('top', i === maxTier && i > 4);
    }
    const left = shakesLeft();
    const progress = (score % SHAKE_EVERY) / SHAKE_EVERY;
    shakeRing.style.strokeDashoffset = (RING_LEN * (1 - progress)).toFixed(2);
    shakeCount.hidden = left <= 0;
    shakeCount.textContent = String(left);
    shakeBtn.classList.toggle('ready', left > 0 && !shake.active);
    shakeBtn.classList.toggle('active', shake.active);
    shakeBtn.setAttribute('aria-disabled', left > 0 && !shake.active && !over ? 'false' : 'true');
    shakeBtn.setAttribute('aria-label', shake.active
      ? 'Shaking the jug'
      : left > 0
        ? `Shake the jug, ${left} ${left === 1 ? 'shake' : 'shakes'} left`
        : `Shake the jug. Next shake at ${fmt((shakesEarned() + 1) * SHAKE_EVERY)} points`);
  }

  function updateHint() {
    hintEl.hidden = !(drops === 0 && !over);
    $('hint-aim').textContent = coarse.matches
      ? 'Drag to aim, let go to drop.'
      : 'Move to aim, click to drop. Arrow keys and Space work too.';
  }

  // ---------------------------------------------------------------- rendering
  function render(alpha) {
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    if (!world) return;
    const bx = -VIEW.x0 * S;
    const by = -VIEW.y0 * S;
    const tf = shake.jx || shake.jy ? `translate3d(${shake.jx.toFixed(1)}px, ${shake.jy.toFixed(1)}px, 0)` : '';
    if (tf !== jugTransform) {
      jugTransform = tf;
      canvas.style.transform = tf;
    }
    let ox = 0;
    let oy = 0;
    if (fx.shake > 0) {
      const k = fx.shakeMag * (fx.shake / 0.35);
      ox = clamp((Math.random() - 0.5) * k, -0.9, 0.9);
      oy = clamp((Math.random() - 0.5) * k, -0.9, 0.9);
    }
    const tx = bx + ox * S;
    const ty = by + oy * S;
    c.setTransform(S, 0, 0, S, tx, ty);
    drawJugBack(c);
    drawGuide(c);
    drawBodies(c, alpha, tx, ty);
    c.setTransform(S, 0, 0, S, tx, ty);
    drawFx(c);
    drawJugFront(c);
    drawHeld(c, bx, by);
  }

  function drawJugBack(c) {
    c.save();
    c.translate(W / 2, H + BASE + 0.6);
    c.scale(1, 0.085);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, W / 2 + 12);
    g.addColorStop(0, colors.floor);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, W / 2 + 12, 0, TAU);
    c.fill();
    c.restore();
    c.fillStyle = colors.glass;
    c.fillRect(0, RIM_Y, W, H - RIM_Y);
  }

  function drawGuide(c) {
    if (over || held == null || shake.active) return;
    const r = TIERS[held].r;
    const x = clamp(aimX, r, W - r);
    const y = E.landingY(world, x, r);
    const top = HOLD_Y + r + 1.2;
    c.save();
    c.strokeStyle = colors.ink;
    c.lineWidth = 0.4;
    if (y - r > top) {
      c.globalAlpha = 0.24;
      c.setLineDash([1.2, 1.5]);
      c.beginPath();
      c.moveTo(x, top);
      c.lineTo(x, y - r);
      c.stroke();
      c.setLineDash([]);
    }
    c.globalAlpha = 0.32;
    c.beginPath();
    c.arc(x, y, r - 0.2, 0, TAU);
    c.stroke();
    c.restore();
  }

  function drawSprite(c, tier, x, y, a, k, tx, ty) {
    const spr = sprites[tier];
    const gl = glosses[tier];
    const X = x * S + tx;
    const Y = y * S + ty;
    const cos = Math.cos(a) * k;
    const sin = Math.sin(a) * k;
    c.setTransform(cos, sin, -sin, cos, X, Y);
    c.drawImage(spr.canvas, -spr.half, -spr.half);
    c.setTransform(k, 0, 0, k, X, Y);
    c.drawImage(gl.canvas, -gl.half, -gl.half);
  }

  function drawBodies(c, alpha, tx, ty) {
    const bodies = world.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const x = b.px + (b.x - b.px) * alpha;
      const y = b.py + (b.y - b.py) * alpha;
      const a = b.pa + (b.a - b.pa) * alpha;
      let k = b.r / b.rt;
      if (b.pop > 0) k *= 1 + 0.09 * Math.sin(Math.PI * (1 - b.pop / POP_TIME));
      drawSprite(c, b.tier, x, y, a, k, tx, ty);
    }
    if (danger > 0) {
      const t = performance.now() / 1000;
      c.setTransform(S, 0, 0, S, tx, ty);
      c.strokeStyle = colors.danger;
      c.lineWidth = 0.7;
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (b.danger <= 0) continue;
        c.globalAlpha = 0.45 + 0.45 * Math.abs(Math.sin(t * 7));
        c.beginPath();
        c.arc(b.x, b.y, b.r + 0.7, 0, TAU);
        c.stroke();
      }
      c.globalAlpha = 1;
    }
  }

  function drawFx(c) {
    for (const r of fx.rings) {
      const p = r.life / r.max;
      const e = 1 - (1 - p) * (1 - p);
      c.globalAlpha = (1 - p) * 0.55;
      c.strokeStyle = r.color;
      c.lineWidth = 1.1 * (1 - p) + 0.2;
      c.beginPath();
      c.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, TAU);
      c.stroke();
    }
    for (const p of fx.parts) {
      const q = p.life / p.max;
      c.globalAlpha = 1 - q * q;
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.r * (1 - q * 0.5), 0, TAU);
      c.fill();
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    for (const t of fx.texts) {
      const q = t.life / t.max;
      c.globalAlpha = q < 0.7 ? 1 : 1 - (q - 0.7) / 0.3;
      const size = t.size * (q < 0.12 ? 0.7 + (q / 0.12) * 0.3 : 1);
      c.font = `${size.toFixed(2)}px Shrikhand, "Arial Black", sans-serif`;
      c.strokeStyle = colors.bg;
      c.lineWidth = size * 0.22;
      c.strokeText(t.text, t.x, t.y);
      c.fillStyle = colors.ink;
      c.fillText(t.text, t.x, t.y);
    }
    c.globalAlpha = 1;
  }

  function jugPath(c) {
    c.beginPath();
    c.moveTo(0, RIM_Y);
    c.arc(-WALL / 2, RIM_Y, WALL / 2, 0, Math.PI, true);
    c.lineTo(-WALL, H + BASE - CORNER);
    c.quadraticCurveTo(-WALL, H + BASE, -WALL + CORNER, H + BASE);
    c.lineTo(W + WALL - CORNER, H + BASE);
    c.quadraticCurveTo(W + WALL, H + BASE, W + WALL, H + BASE - CORNER);
    c.lineTo(W + WALL, RIM_Y);
    c.arc(W + WALL / 2, RIM_Y, WALL / 2, 0, Math.PI, true);
    c.lineTo(W, H);
    c.lineTo(0, H);
    c.closePath();
  }

  function drawJugFront(c) {
    const g = c.createLinearGradient(0, RIM_Y, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.25, colors.shine);
    g.addColorStop(0.8, colors.shine);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.globalAlpha = 0.1;
    c.fillStyle = g;
    c.fillRect(3.2, RIM_Y + 4, 3.4, H - RIM_Y - 10);
    c.globalAlpha = 0.06;
    c.fillRect(8, RIM_Y + 10, 1.2, H - RIM_Y - 30);
    c.globalAlpha = 1;

    jugPath(c);
    c.fillStyle = colors.wall;
    c.fill();
    c.lineWidth = 0.42;
    c.lineJoin = 'round';
    c.strokeStyle = colors.line;
    c.stroke();

    c.strokeStyle = colors.shine;
    c.lineCap = 'round';
    c.lineWidth = 0.55;
    c.globalAlpha = 0.85;
    c.beginPath();
    c.moveTo(-WALL * 0.52, RIM_Y + 3);
    c.lineTo(-WALL * 0.52, H - 6);
    c.stroke();
    c.globalAlpha = 0.6;
    c.beginPath();
    c.moveTo(W + WALL * 0.48, RIM_Y + 5);
    c.lineTo(W + WALL * 0.48, RIM_Y + 30);
    c.stroke();
    c.globalAlpha = 0.45;
    c.beginPath();
    c.moveTo(9, H + BASE * 0.45);
    c.lineTo(W - 9, H + BASE * 0.45);
    c.stroke();
    c.globalAlpha = 1;

    // Graduations: 2 L to the MAX line, a tick every 250 ml
    c.strokeStyle = colors.ink;
    c.fillStyle = colors.ink;
    c.lineWidth = 0.35;
    c.lineCap = 'butt';
    c.globalAlpha = 0.5;
    c.font = '700 2.9px Figtree, system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    const labels = { 2: '½ L', 4: '1 L', 6: '1½ L' };
    for (let k = 1; k < 8; k++) {
      const y = H - (k * H) / 8;
      c.beginPath();
      c.moveTo(0.4, y);
      c.lineTo(k % 2 === 0 ? 5.2 : 3, y);
      c.stroke();
      if (labels[k]) c.fillText(labels[k], 6.2, y + 0.15);
    }

    // MAX line, which turns into a countdown while fruit sits above it
    const warn = danger > 0;
    const pulse = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * 9);
    c.strokeStyle = warn ? colors.danger : colors.ink;
    c.fillStyle = c.strokeStyle;
    c.globalAlpha = warn ? 0.55 + 0.45 * pulse : 0.55;
    c.lineWidth = 0.45;
    c.setLineDash([2.2, 1.6]);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(W, 0);
    c.stroke();
    c.setLineDash([]);
    if (warn) {
      c.globalAlpha = 1;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(W * Math.min(1, danger / LIMIT), 0);
      c.stroke();
    }
    c.globalAlpha = warn ? 1 : 0.65;
    c.font = '800 3px Figtree, system-ui, sans-serif';
    c.textAlign = 'right';
    c.textBaseline = 'alphabetic';
    c.fillText('MAX', W - 1, -1.3);
    c.globalAlpha = 1;
  }

  function drawHeld(c, bx, by) {
    if (over || held == null) return;
    const r = TIERS[held].r;
    const x = clamp(aimX, r, W - r);
    let k = 1;
    if (heldPop > 0) {
      const p = 1 - heldPop / POP_TIME;
      k = 0.6 + 0.4 * p + 0.08 * Math.sin(Math.PI * p);
    }
    drawSprite(c, held, x, HOLD_Y, heldAngle, k, bx, by);
    c.setTransform(S, 0, 0, S, bx, by);
  }

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  let acc = 0;

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    if (!paused && world) {
      if (!over) {
        if (keyDir && !shake.active) aimX = clampAim(aimX + keyDir * 80 * dt, held);
        if (held == null && cooldown > 0 && !shake.active) {
          cooldown -= dt;
          if (cooldown <= 0) {
            cooldown = 0;
            setHeld(next);
            next = pickTier();
            updateHud();
          }
        }
        acc += dt;
        let n = 0;
        while (acc >= STEP && n < 10) {
          tick();
          acc -= STEP;
          n++;
          if (over) break;
        }
        if (n >= 10) acc = 0;
        if (shake.active) updateBanner();
      }
      updateFx(dt);
    }
    render(over || paused ? 1 : acc / STEP);
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- input
  let dragging = false;
  let activePointer = null;

  function toWorld(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * VIEW.w + VIEW.x0,
      y: ((e.clientY - rect.top) / rect.height) * VIEW.h + VIEW.y0,
    };
  }

  function aimFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = toWorld(e).x;
    aimX = held == null ? clamp(x, 0, W) : clampAim(x, held);
  }

  const inOverlay = (el) => !!(el && el.closest && el.closest('.overlay'));

  stage.addEventListener('pointerdown', (e) => {
    if (inOverlay(e.target) || e.button > 0) return;
    Sound.init();
    if (over || paused || shake.active) return;
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
    dragging = true;
    activePointer = e.pointerId;
    aimFromEvent(e);
  });
  stage.addEventListener('pointermove', (e) => {
    if (inOverlay(e.target) || over || paused || shake.active) return;
    if (e.pointerType === 'mouse' || (dragging && e.pointerId === activePointer)) aimFromEvent(e);
  });
  const release = (e) => {
    if (!dragging || e.pointerId !== activePointer) return;
    dragging = false;
    activePointer = null;
    if (e.type === 'pointerup') {
      aimFromEvent(e);
      drop();
    }
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  const soft = (v, limit) => limit * Math.tanh(v / limit);
  const isControl = (el) => !!(el && el.closest && el.closest('button, .overlay'));
  document.addEventListener('pointerdown', (e) => {
    if (!shake.active || shake.pointer != null || e.button > 0 || isControl(e.target)) return;
    shake.pointer = e.pointerId;
    shake.sx = e.clientX;
    shake.sy = e.clientY;
    shake.bx = shake.tx;
    shake.by = shake.ty;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (e.pointerId !== shake.pointer) return;
    shake.tx = soft(shake.bx + e.clientX - shake.sx, DRAG_X);
    shake.ty = soft(shake.by + e.clientY - shake.sy, DRAG_Y);
  }, true);
  const shakeRelease = (e) => {
    if (e.pointerId !== shake.pointer) return;
    shake.pointer = null;
    shake.tx = 0;
    shake.ty = 0;
  };
  document.addEventListener('pointerup', shakeRelease, true);
  document.addEventListener('pointercancel', shakeRelease, true);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT' || inOverlay(e.target)) return;
    if (!overEl.hidden || !confirmEl.hidden) return;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keyDir = -1; e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keyDir = 1; e.preventDefault(); }
    else if (k === ' ' || k === 'Enter' || k === 'ArrowDown' || k === 's' || k === 'S') {
      Sound.init();
      if (!e.repeat) drop();
      e.preventDefault();
    } else if ((k === 'x' || k === 'X') && !e.repeat) {
      startShake();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key;
    if ((k === 'ArrowLeft' || k === 'a' || k === 'A') && keyDir < 0) keyDir = 0;
    if ((k === 'ArrowRight' || k === 'd' || k === 'D') && keyDir > 0) keyDir = 0;
  });

  // ---------------------------------------------------------------- buttons
  function syncSoundButton() {
    const m = Sound.isMuted();
    soundBtn.setAttribute('aria-pressed', m ? 'true' : 'false');
    soundBtn.setAttribute('aria-label', m ? 'Turn sound on' : 'Turn sound off');
    soundBtn.title = m ? 'Sound off' : 'Sound on';
    soundBtn.classList.toggle('is-muted', m);
  }
  soundBtn.addEventListener('click', () => {
    Sound.init();
    Sound.setMuted(!Sound.isMuted());
    syncSoundButton();
  });

  shakeBtn.addEventListener('click', startShake);

  $('restart').addEventListener('click', () => {
    if (over || drops === 0) { newGame(); return; }
    paused = true;
    confirmEl.hidden = false;
    $('restart-yes').focus({ preventScroll: true });
  });
  $('keep').addEventListener('click', () => {
    confirmEl.hidden = true;
    paused = false;
    last = performance.now();
  });
  $('restart-yes').addEventListener('click', () => { newGame(); });
  $('again').addEventListener('click', () => { Sound.init(); newGame(); });
  confirmEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('keep').click(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
    last = performance.now();
    acc = 0;
  });
  window.addEventListener('pagehide', save);
  setInterval(() => { if (world && !paused) save(); }, 4000);

  // ---------------------------------------------------------------- boot
  let started = false;
  function start(data) {
    if (started) return;
    started = true;
    readColors();
    buildIcons();
    syncSoundButton();
    const fromHot = data && data.game;
    if (!(fromHot && restoreFrom(data.game)) && !restoreFrom(loadSaved())) newGame();
    const themeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    if (themeQuery.addEventListener) themeQuery.addEventListener('change', readColors);
    new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);
    window.addEventListener('resize', onResize);
    layout();
    if (document.fonts && document.fonts.load) {
      document.fonts.load('20px Shrikhand').catch(() => {});
      document.fonts.ready.then(() => render(1)).catch(() => {});
    }
    last = performance.now();
    requestAnimationFrame(frame);
  }

  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ game: world ? snapshot() : null }));
  if (hot && hot.ready) hot.ready(start);
  else start((hot && hot.data) || {});
})();

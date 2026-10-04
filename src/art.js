// Pulp Drop fruit art: every fruit is a cross-section slice painted procedurally on canvas.
const FruitArt = (() => {
  'use strict';
  const TAU = Math.PI * 2;

  // Juice colour per tier, used for merge splashes.
  const JUICE = ['#5a63cc', '#d21f42', '#9fd146', '#f7d63c', '#80c43c', '#ff9b2f',
    '#efdcab', '#e5348a', '#f4605f', '#efe8d6', '#ff5468'];

  function prng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function disc(c, r, fill, x = 0, y = 0) {
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fillStyle = fill;
    c.fill();
  }

  function ring(c, r, width, color) {
    c.beginPath();
    c.arc(0, 0, r, 0, TAU);
    c.lineWidth = width;
    c.strokeStyle = color;
    c.stroke();
  }

  function radial(c, r, stops) {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
    for (const [o, col] of stops) g.addColorStop(o, col);
    return g;
  }

  function line(c, x0, y0, x1, y1) {
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
  }

  // Teardrop seed whose tip points along `ang`.
  function seed(c, x, y, len, wid, ang, fill, shine) {
    const L = len / 2;
    const w = wid / 2;
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.beginPath();
    c.moveTo(L, 0);
    c.bezierCurveTo(L * 0.35, w * 1.1, -L, w * 1.15, -L, 0);
    c.bezierCurveTo(-L, -w * 1.15, L * 0.35, -w * 1.1, L, 0);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (shine) {
      c.beginPath();
      c.ellipse(-L * 0.3, -w * 0.32, L * 0.3, w * 0.24, 0, 0, TAU);
      c.fillStyle = shine;
      c.fill();
    }
    c.restore();
  }

  function starPath(c, points, outer, inner) {
    c.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 ? inner : outer;
      const a = (i * Math.PI) / points;
      if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
  }

  const px = (R, k, min = 0.6) => Math.max(min, R * k);

  function blueberry(c, R, rnd) {
    disc(c, R, '#191d4d');
    disc(c, R - px(R, 0.045, 1), radial(c, R, [[0, '#4a56b4'], [0.7, '#3a4597'], [1, '#2a3178']]));
    c.fillStyle = 'rgba(205, 214, 255, 0.22)';
    const n = Math.round(16 + R * 0.8);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU;
      const rr = Math.sqrt(rnd()) * R * 0.88;
      disc(c, px(R, 0.02 + rnd() * 0.03, 0.4), c.fillStyle, Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.save();
    c.rotate(rnd() * TAU);
    starPath(c, 5, R * 0.34, R * 0.15);
    c.fillStyle = '#1f2358';
    c.fill();
    c.lineJoin = 'round';
    c.lineWidth = px(R, 0.06);
    c.strokeStyle = '#1f2358';
    c.stroke();
    disc(c, R * 0.11, '#121434');
    c.restore();
  }

  function cherry(c, R, rnd) {
    disc(c, R, '#3a0511');
    disc(c, R - px(R, 0.05, 1), '#700b20');
    disc(c, R * 0.86, radial(c, R * 0.86, [[0, '#f05d76'], [0.45, '#d02444'], [1, '#a5122e']]));
    c.strokeStyle = 'rgba(255, 190, 200, 0.28)';
    c.lineWidth = px(R, 0.025, 0.5);
    c.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + rnd() * 0.2;
      const r1 = R * (0.68 + rnd() * 0.12);
      line(c, Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.42, Math.cos(a) * r1, Math.sin(a) * r1);
    }
    c.save();
    c.rotate(rnd() * TAU);
    c.beginPath();
    c.ellipse(0, 0, R * 0.36, R * 0.29, 0, 0, TAU);
    c.fillStyle = '#f3d9aa';
    c.fill();
    c.lineWidth = px(R, 0.045, 0.8);
    c.strokeStyle = '#b4874f';
    c.stroke();
    c.beginPath();
    c.moveTo(-R * 0.28, 0);
    c.quadraticCurveTo(0, -R * 0.05, R * 0.28, 0);
    c.strokeStyle = 'rgba(180, 135, 79, 0.65)';
    c.lineWidth = px(R, 0.03, 0.5);
    c.stroke();
    c.restore();
  }

  function citrus(c, R, o, rnd) {
    disc(c, R, o.outline);
    disc(c, R - px(R, 0.04, 1), radial(c, R, [[0.75, o.rindLight], [1, o.rind]]));
    c.fillStyle = o.gland;
    const glands = Math.round(R * 2.2);
    for (let i = 0; i < glands; i++) {
      const a = rnd() * TAU;
      const rr = R * (0.885 + rnd() * 0.07);
      c.beginPath();
      c.arc(Math.cos(a) * rr, Math.sin(a) * rr, px(R, 0.014, 0.4), 0, TAU);
      c.fill();
    }
    disc(c, R * 0.86, o.pith);
    const fr = R * 0.79;
    disc(c, fr, radial(c, fr, [[0, o.fleshLight], [0.6, o.flesh], [1, o.fleshDark]]));
    const segs = o.segs;
    const off = rnd() * TAU;
    const span = TAU / segs;
    c.save();
    c.beginPath();
    c.arc(0, 0, fr, 0, TAU);
    c.clip();
    c.fillStyle = o.vesicle;
    const per = Math.round(4 + R * 0.12);
    for (let s = 0; s < segs; s++) {
      for (let k = 0; k < per; k++) {
        const a = off + s * span + span * (0.18 + 0.64 * rnd());
        const rr = fr * (0.24 + rnd() * 0.7);
        c.beginPath();
        c.ellipse(Math.cos(a) * rr, Math.sin(a) * rr, R * 0.075, R * 0.022, a, 0, TAU);
        c.fill();
      }
    }
    c.restore();
    c.strokeStyle = o.membrane;
    c.lineCap = 'round';
    c.lineWidth = px(R, 0.045, 0.7);
    for (let s = 0; s < segs; s++) {
      const a = off + s * span;
      line(c, Math.cos(a) * R * 0.08, Math.sin(a) * R * 0.08, Math.cos(a) * fr * 0.97, Math.sin(a) * fr * 0.97);
    }
    ring(c, fr, px(R, 0.035, 0.6), o.membrane);
    disc(c, R * 0.1, o.pith);
    if (o.seeds) {
      for (let i = 0; i < o.seeds; i++) {
        const a = off + (i * 3 + 1.5) * span;
        seed(c, Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3, R * 0.17, R * 0.085, a + Math.PI, o.seed, 'rgba(255,255,255,0.4)');
      }
    }
  }

  const CITRUS = {
    lime: {
      outline: '#1c561a', rind: '#2e872b', rindLight: '#4ea53a', gland: 'rgba(20, 70, 20, 0.35)',
      pith: '#eef8d7', flesh: '#a4d74d', fleshLight: '#cdeb8f', fleshDark: '#88c33b',
      vesicle: 'rgba(240, 255, 210, 0.38)', membrane: '#f3fbe3', segs: 9,
    },
    lemon: {
      outline: '#b88900', rind: '#f5c518', rindLight: '#ffd94d', gland: 'rgba(185, 135, 0, 0.35)',
      pith: '#fff9e1', flesh: '#fbe36a', fleshLight: '#fff2aa', fleshDark: '#f2cf3d',
      vesicle: 'rgba(255, 255, 235, 0.45)', membrane: '#fffbea', segs: 10, seeds: 2, seed: '#efe0b4',
    },
    orange: {
      outline: '#b25200', rind: '#f47c12', rindLight: '#ff9b30', gland: 'rgba(165, 70, 0, 0.3)',
      pith: '#fff1df', flesh: '#ffa236', fleshLight: '#ffc66c', fleshDark: '#f6871c',
      vesicle: 'rgba(255, 240, 210, 0.36)', membrane: '#ffe9cd', segs: 11,
    },
    grapefruit: {
      outline: '#bd6912', rind: '#f4a640', rindLight: '#ffc46a', gland: 'rgba(175, 90, 20, 0.3)',
      pith: '#fff3e7', flesh: '#ef5b5b', fleshLight: '#ff8f86', fleshDark: '#de454c',
      vesicle: 'rgba(255, 220, 215, 0.36)', membrane: '#ffe1db', segs: 12,
    },
  };

  function kiwi(c, R, rnd) {
    disc(c, R, '#47301a');
    disc(c, R - px(R, 0.04, 1), '#8b6136');
    c.strokeStyle = 'rgba(205, 165, 115, 0.5)';
    c.lineWidth = px(R, 0.012, 0.4);
    const fuzz = Math.round(R * 3);
    for (let i = 0; i < fuzz; i++) {
      const a = rnd() * TAU;
      const r1 = R * (0.955 + rnd() * 0.02);
      line(c, Math.cos(a) * R * 0.915, Math.sin(a) * R * 0.915, Math.cos(a) * r1, Math.sin(a) * r1);
    }
    disc(c, R * 0.9, radial(c, R * 0.9, [[0, '#ecf1c4'], [0.22, '#cbe27e'], [0.5, '#95c940'], [1, '#62a021']]));
    c.strokeStyle = 'rgba(235, 248, 200, 0.32)';
    c.lineWidth = px(R, 0.018, 0.4);
    c.lineCap = 'round';
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * TAU + rnd() * 0.06;
      const r1 = R * (0.62 + rnd() * 0.22);
      line(c, Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2, Math.cos(a) * r1, Math.sin(a) * r1);
    }
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * TAU + (rnd() - 0.5) * 0.08;
      const rr = R * (i % 2 ? 0.43 : 0.36) + rnd() * R * 0.03;
      seed(c, Math.cos(a) * rr, Math.sin(a) * rr, R * 0.11, R * 0.056, a, '#1c150c');
    }
    c.save();
    c.rotate(rnd() * TAU);
    c.beginPath();
    c.ellipse(0, 0, R * 0.22, R * 0.17, 0, 0, TAU);
    c.fillStyle = '#f4f2d4';
    c.fill();
    c.restore();
  }

  function apple(c, R, rnd) {
    disc(c, R, '#8a1020');
    disc(c, R - px(R, 0.035, 1), '#d42538');
    const off = rnd() * TAU;
    c.beginPath();
    c.arc(0, 0, R * 0.965, off, off + 1.3);
    c.lineWidth = px(R, 0.03);
    c.strokeStyle = 'rgba(255, 196, 80, 0.4)';
    c.stroke();
    disc(c, R * 0.93, radial(c, R * 0.93, [[0, '#fffaf0'], [0.65, '#fbf1d6'], [1, '#efdaa9']]));
    for (let i = 0; i < 10; i++) {
      const a = off + (i / 10) * TAU;
      disc(c, px(R, 0.022, 0.5), '#e0c68b', Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6);
    }
    c.save();
    c.rotate(off);
    starPath(c, 5, R * 0.37, R * 0.16);
    c.fillStyle = '#f1dca8';
    c.fill();
    c.lineJoin = 'round';
    c.lineWidth = px(R, 0.035, 0.7);
    c.strokeStyle = '#d6b574';
    c.stroke();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      seed(c, Math.cos(a) * R * 0.23, Math.sin(a) * R * 0.23, R * 0.19, R * 0.1, a + Math.PI, '#5a3216', 'rgba(255,255,255,0.3)');
    }
    c.restore();
  }

  function dragon(c, R, rnd) {
    disc(c, R, '#860e43');
    disc(c, R - px(R, 0.035, 1), radial(c, R, [[0.8, '#f2489a'], [1, '#d01f6c']]));
    const off = rnd() * TAU;
    c.fillStyle = '#8fd04a';
    for (let i = 0; i < 9; i++) {
      const a = off + (i / 9) * TAU;
      c.save();
      c.rotate(a);
      c.beginPath();
      c.moveTo(R * 0.965, 0);
      c.lineTo(R * 0.87, R * 0.07);
      c.lineTo(R * 0.87, -R * 0.07);
      c.closePath();
      c.fill();
      c.restore();
    }
    disc(c, R * 0.86, '#f9b6d1');
    disc(c, R * 0.82, radial(c, R * 0.82, [[0, '#ffffff'], [0.85, '#fbf6f3'], [1, '#f6e3ea']]));
    c.fillStyle = '#1b1416';
    for (let i = 0; i < 130; i++) {
      const rr = R * 0.78 * Math.sqrt(rnd());
      const a = rnd() * TAU;
      c.beginPath();
      c.ellipse(Math.cos(a) * rr, Math.sin(a) * rr, px(R, 0.022, 0.45), px(R, 0.014, 0.35), rnd() * TAU, 0, TAU);
      c.fill();
    }
  }

  function coconut(c, R, rnd) {
    disc(c, R, '#2d1b0d');
    disc(c, R - px(R, 0.035, 1), '#6b4526');
    c.lineCap = 'round';
    c.lineWidth = px(R, 0.013, 0.45);
    const fibers = Math.round(R * 4);
    for (let i = 0; i < fibers; i++) {
      const a = rnd() * TAU;
      const rr = R * (0.875 + rnd() * 0.09);
      const len = R * (0.04 + rnd() * 0.06);
      const t = a + Math.PI / 2 + (rnd() - 0.5) * 0.9;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      c.strokeStyle = rnd() < 0.5 ? 'rgba(165, 115, 62, 0.6)' : 'rgba(38, 22, 9, 0.5)';
      line(c, x - Math.cos(t) * len, y - Math.sin(t) * len, x + Math.cos(t) * len, y + Math.sin(t) * len);
    }
    disc(c, R * 0.86, '#fffdf6');
    disc(c, R * 0.67, 'rgba(190, 160, 110, 0.22)');
    disc(c, R * 0.645, radial(c, R * 0.645, [[0, '#e1d3b7'], [0.7, '#eee4d0'], [1, '#f8f2e5']]));
  }

  function watermelon(c, R, rnd) {
    disc(c, R, '#0b3a18');
    disc(c, R - px(R, 0.03, 1), '#1e7334');
    const off = rnd() * TAU;
    c.lineWidth = R * 0.05;
    c.strokeStyle = 'rgba(8, 50, 20, 0.55)';
    for (let i = 0; i < 12; i++) {
      const a = off + (i / 12) * TAU;
      c.beginPath();
      c.arc(0, 0, R * 0.945, a, a + 0.18 + rnd() * 0.1);
      c.stroke();
    }
    disc(c, R * 0.915, '#84c85d');
    disc(c, R * 0.893, '#eef7d9');
    disc(c, R * 0.85, radial(c, R * 0.85, [[0, '#ff7482'], [0.6, '#f64d60'], [1, '#e23a51']]));
    c.strokeStyle = 'rgba(255, 205, 210, 0.25)';
    c.lineWidth = px(R, 0.012, 0.4);
    c.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const a = rnd() * TAU;
      const rr = R * (0.1 + rnd() * 0.68);
      const l = R * 0.05;
      line(c, Math.cos(a) * rr, Math.sin(a) * rr, Math.cos(a) * (rr + l), Math.sin(a) * (rr + l));
    }
    for (let i = 0; i < 14; i++) {
      const a = off + (i / 14) * TAU;
      seed(c, Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6, R * 0.1, R * 0.056, a + Math.PI, '#23170f', 'rgba(255,255,255,0.35)');
    }
    for (let i = 0; i < 7; i++) {
      const a = off + 0.22 + (i / 7) * TAU;
      seed(c, Math.cos(a) * R * 0.36, Math.sin(a) * R * 0.36, R * 0.09, R * 0.05, a + Math.PI, '#23170f', 'rgba(255,255,255,0.35)');
    }
  }

  const PAINT = [
    blueberry,
    cherry,
    (c, R, r) => citrus(c, R, CITRUS.lime, r),
    (c, R, r) => citrus(c, R, CITRUS.lemon, r),
    kiwi,
    (c, R, r) => citrus(c, R, CITRUS.orange, r),
    apple,
    dragon,
    (c, R, r) => citrus(c, R, CITRUS.grapefruit, r),
    coconut,
    watermelon,
  ];

  function paint(c, tier, R) {
    PAINT[tier](c, R, prng(tier * 7919 + 101));
  }

  // Light stays put while the slice rotates, so the sheen is a separate, unrotated layer.
  function paintGloss(c, tier, R) {
    if (tier === 0) {
      const g = c.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.05, 0, 0, R);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.08)');
      g.addColorStop(0.75, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,25,0.35)');
      disc(c, R, g);
      return;
    }
    const g = c.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.3, 0, 0, R);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.8, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.15)');
    disc(c, R, g);
    c.lineCap = 'round';
    c.beginPath();
    c.arc(0, 0, R * 0.8, Math.PI * 1.1, Math.PI * 1.36);
    c.lineWidth = px(R, 0.07, 1);
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.stroke();
    const a = Math.PI * 1.47;
    disc(c, px(R, 0.035, 0.6), 'rgba(255,255,255,0.45)', Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8);
  }

  function canvasFor(R) {
    const size = Math.ceil(R * 2 + 4);
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const c = cv.getContext('2d');
    c.translate(size / 2, size / 2);
    return { cv, c, size };
  }

  function sprite(tier, R) {
    const { cv, c, size } = canvasFor(R);
    paint(c, tier, R);
    return { canvas: cv, half: size / 2, R };
  }

  function gloss(tier, R) {
    const { cv, c, size } = canvasFor(R);
    paintGloss(c, tier, R);
    return { canvas: cv, half: size / 2, R };
  }

  function icon(tier, sizePx) {
    const cv = document.createElement('canvas');
    cv.width = sizePx;
    cv.height = sizePx;
    const c = cv.getContext('2d');
    const R = sizePx / 2 - 2;
    c.translate(sizePx / 2, sizePx / 2);
    c.save();
    c.rotate(-0.35);
    paint(c, tier, R);
    c.restore();
    paintGloss(c, tier, R);
    return cv.toDataURL('image/png');
  }

  // ---------------------------------------------------------------- timber wall
  // Horizontal boards with staggered end joints, wavy grain, the odd knot and nail holes.
  function board(c, x, y, bw, ph, pal, rnd, u) {
    c.fillStyle = pal.tones[Math.floor(rnd() * pal.tones.length)];
    c.fillRect(x, y, bw, ph);
    const sh = c.createLinearGradient(0, y, 0, y + ph);
    sh.addColorStop(0, pal.hi);
    sh.addColorStop(0.2, 'rgba(0,0,0,0)');
    sh.addColorStop(0.78, 'rgba(0,0,0,0)');
    sh.addColorStop(1, pal.lo);
    c.fillStyle = sh;
    c.fillRect(x, y, bw, ph);

    c.save();
    c.beginPath();
    c.rect(x, y, bw, ph);
    c.clip();
    let kx = 0;
    let ky = 0;
    let kr = 0;
    if (rnd() < 0.4) {
      kx = x + bw * (0.15 + rnd() * 0.7);
      ky = y + ph * (0.3 + rnd() * 0.4);
      kr = (3 + rnd() * 5) * u;
    }
    const lines = Math.round(ph / (2.4 * u));
    const f1 = (0.006 + rnd() * 0.006) / u;
    const f2 = (0.017 + rnd() * 0.02) / u;
    const p1 = rnd() * TAU;
    const p2 = rnd() * TAU;
    const step = 6 * u;
    for (let i = 0; i < lines; i++) {
      const base = y + ((i + 0.3 + rnd() * 0.4) / lines) * ph;
      const a1 = (1 + rnd() * 2.2) * u;
      const a2 = (0.3 + rnd() * 0.8) * u;
      const dyk = base - ky;
      const near = kr ? Math.exp(-(dyk * dyk) / (kr * kr * 16)) : 0;
      c.beginPath();
      for (let xx = x; xx <= x + bw + step; xx += step) {
        let yy = base + Math.sin(xx * f1 + p1 + i * 0.12) * a1 + Math.sin(xx * f2 + p2 + i * 0.5) * a2;
        if (near > 0.01) {
          const dx = (xx - kx) / (kr * 5);
          yy += (dyk < 0 ? -1 : 1) * near * Math.exp(-dx * dx) * kr * 2;
        }
        if (xx === x) c.moveTo(xx, yy);
        else c.lineTo(xx, yy);
      }
      c.strokeStyle = rnd() < 0.3 ? pal.grainHi : pal.grain;
      c.globalAlpha = 0.2 + rnd() * 0.6;
      c.lineWidth = (0.5 + rnd() * 1.3) * u;
      c.stroke();
    }
    if (kr) {
      c.strokeStyle = pal.grain;
      c.lineWidth = u;
      for (let k = 3; k >= 1; k--) {
        c.globalAlpha = 0.4;
        c.beginPath();
        c.ellipse(kx, ky, kr * (1 + k * 0.7), kr * 0.6 * (1 + k * 0.45), 0, 0, TAU);
        c.stroke();
      }
      c.globalAlpha = 0.9;
      c.beginPath();
      c.ellipse(kx, ky, kr, kr * 0.62, 0, 0, TAU);
      c.fillStyle = pal.knot;
      c.fill();
    }
    c.fillStyle = pal.seam;
    c.globalAlpha = 0.75;
    for (const nx of [x + 14 * u, x + bw - 14 * u]) {
      c.beginPath();
      c.arc(nx, y + ph * 0.5, 1.6 * u, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
    c.restore();

    const seam = Math.max(1, Math.round(2 * u));
    c.fillStyle = pal.seam;
    c.fillRect(x, y, Math.max(1, Math.round(1.5 * u)), ph);
    c.fillRect(x, y + ph - seam, bw, seam);
    c.fillStyle = pal.seamHi;
    c.fillRect(x, y, bw, Math.max(1, Math.round(u)));
  }

  function timber(cv, cssW, cssH, dpr, pal) {
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    const rnd = prng(20261004);
    const plank = 62 * dpr;
    let y = -Math.round(rnd() * plank * 0.6);
    while (y < h) {
      const ph = Math.round(plank * (0.85 + rnd() * 0.3));
      let x = -Math.round((80 + rnd() * 320) * dpr);
      while (x < w) {
        const bw = Math.round((260 + rnd() * 460) * dpr);
        board(c, x, y, bw, ph, pal, rnd, dpr);
        x += bw;
      }
      y += ph;
    }
    const R = Math.max(w, h) * 0.75;
    const g = c.createRadialGradient(w / 2, h * 0.5, R * 0.05, w / 2, h * 0.5, R);
    g.addColorStop(0, pal.light);
    g.addColorStop(0.55, 'rgba(0,0,0,0)');
    g.addColorStop(1, pal.vignette);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }

  return { JUICE, sprite, gloss, icon, timber };
})();

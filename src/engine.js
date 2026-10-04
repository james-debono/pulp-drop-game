// Pulp Drop physics: rigid circles in a box, solved with substepped soft contacts
// (warm-started sequential impulses, a relax pass and a restitution pass).
const PulpEngine = (() => {
  'use strict';

  const W = 100; // jug interior width, world units
  const H = 125; // floor at y = H, the MAX line sits at y = 0, y grows downward

  const TIERS = [
    { name: 'Blueberry', r: 3.2 },
    { name: 'Cherry', r: 4.4 },
    { name: 'Lime', r: 5.8 },
    { name: 'Lemon', r: 7.0 },
    { name: 'Kiwi', r: 8.4 },
    { name: 'Orange', r: 10.0 },
    { name: 'Apple', r: 11.6 },
    { name: 'Dragon fruit', r: 13.6 },
    { name: 'Grapefruit', r: 16.0 },
    { name: 'Coconut', r: 19.0 },
    { name: 'Watermelon', r: 23.0 },
  ];
  // Merging two fruits of tier i scores the (i+1)th triangular number: 1, 3, 6 ... 66.
  TIERS.forEach((t, i) => { t.points = ((i + 1) * (i + 2)) / 2; });

  const CFG = {
    step: 1 / 120,
    substeps: 4,
    gravity: 720,
    friction: 0.4,
    wallFriction: 0.3,
    restitution: 0.12,
    restitutionThreshold: 45,
    rolling: 0.04,
    linearDamping: 0.08,
    angularDamping: 0.8,
    contactHertz: 60,
    contactDamping: 10,
    maxPush: 140,
    slop: 0.05,
    speculative: 0.4,
    mergeTolerance: 0.3,
    growTime: 0.12,
    maxSpeed: 1600,
    // Mass grows slower than area so big fruit still shove small ones without crushing them
    massExponent: 1.5,
  };

  const TAU = Math.PI * 2;
  const STATIC = { id: 0, invM: 0, invI: 0, vx: 0, vy: 0, w: 0, x: 0, y: 0, r: 0 };

  function makeSoft(hertz, zeta, h) {
    if (hertz === 0) return { biasRate: 0, massScale: 1, impulseScale: 0 };
    const omega = TAU * hertz;
    const a1 = 2 * zeta + h * omega;
    const a2 = h * omega * a1;
    const a3 = 1 / (1 + a2);
    return { biasRate: omega / a1, massScale: a2 * a3, impulseScale: a3 };
  }

  function createWorld() {
    return {
      bodies: [],
      order: [],
      pool: [],
      count: 0,
      cacheA: new Map(),
      cacheB: new Map(),
      cands: [],
      nextId: 1,
      time: 0,
      ax: 0, // extra acceleration on every body, used to shake the jug
      ay: 0,
      noMerge: false,
      softH: 0,
      soft: null,
      softStatic: null,
    };
  }

  function addBody(world, tier, x, y, opts) {
    const o = opts || {};
    const rt = TIERS[tier].r;
    const r = o.r != null ? Math.min(Math.max(o.r, 0.5), rt) : rt;
    const m = Math.pow(rt, CFG.massExponent) * 0.01;
    const I = 0.5 * m * rt * rt;
    const a = o.a || 0;
    const b = {
      id: world.nextId++,
      tier,
      x, y,
      vx: o.vx || 0,
      vy: o.vy || 0,
      a,
      w: o.w || 0,
      r,
      rt,
      grow: r < rt ? (rt - r) / CFG.growTime : 0,
      invM: 1 / m,
      invI: 1 / I,
      age: o.age || 0,
      landed: !!o.landed,
      danger: o.danger || 0,
      px: x, py: y, pa: a,
      dead: false,
      sp: 0,
    };
    world.bodies.push(b);
    world.order.push(b);
    return b;
  }

  function removeDead(world) {
    world.bodies = world.bodies.filter((b) => !b.dead);
    world.order = world.order.filter((b) => !b.dead);
  }

  function contactAt(world, i) {
    let c = world.pool[i];
    if (!c) {
      c = {
        a: STATIC, b: STATIC, plane: false, nx: 0, ny: 0, d: 0, rA: 0, rB: 0, key: 0,
        normalMass: 0, tangentMass: 0, rollMass: 0, nImp: 0, tImp: 0, rImp: 0,
        maxNImp: 0, relVel: 0, friction: 0, roll: 0, soft: null,
      };
      world.pool[i] = c;
    }
    return c;
  }

  function warm(world, c) {
    const w = world.cacheA.get(c.key);
    if (w) { c.nImp = w[0]; c.tImp = w[1]; c.rImp = w[2]; }
    else { c.nImp = 0; c.tImp = 0; c.rImp = 0; }
    c.maxNImp = 0;
  }

  function addPlane(world, n, b, nx, ny, d, idx) {
    const c = contactAt(world, n);
    c.a = STATIC; c.b = b; c.plane = true;
    c.nx = nx; c.ny = ny; c.d = d;
    c.rA = 0; c.rB = b.r;
    c.key = -(b.id * 4 + idx + 1);
    c.friction = CFG.wallFriction;
    c.roll = CFG.rolling * b.r;
    c.soft = world.softStatic;
    warm(world, c);
    return n + 1;
  }

  function collide(world, h) {
    const list = world.order;
    const len = list.length;
    // Insertion sort by left edge; order barely changes between substeps so this is near linear.
    for (let i = 1; i < len; i++) {
      const b = list[i];
      const key = b.x - b.r;
      let j = i - 1;
      while (j >= 0 && list[j].x - list[j].r > key) { list[j + 1] = list[j]; j--; }
      list[j + 1] = b;
    }
    const spec = CFG.speculative;
    let maxSp = 0;
    for (let i = 0; i < len; i++) {
      const b = list[i];
      b.sp = Math.abs(b.vx) + Math.abs(b.vy);
      if (b.sp > maxSp) maxSp = b.sp;
    }
    const maxMargin = spec + 2 * maxSp * h;
    let n = 0;
    for (let i = 0; i < len; i++) {
      const a = list[i];
      const ma = spec + a.sp * h;
      if (a.x - a.r < ma) n = addPlane(world, n, a, 1, 0, 0, 0);
      if (W - a.x - a.r < ma) n = addPlane(world, n, a, -1, 0, -W, 1);
      if (H - a.y - a.r < ma) n = addPlane(world, n, a, 0, -1, -H, 2);
      const reach = a.x + a.r + maxMargin;
      for (let j = i + 1; j < len; j++) {
        const b = list[j];
        if (b.x - b.r > reach) break;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lim = a.r + b.r + spec + (a.sp + b.sp) * h;
        const d2 = dx * dx + dy * dy;
        if (d2 > lim * lim) continue;
        const flip = a.id > b.id;
        const A = flip ? b : a;
        const B = flip ? a : b;
        const d = Math.sqrt(d2);
        let nx = 0;
        let ny = -1;
        if (d > 1e-9) { nx = (flip ? -dx : dx) / d; ny = (flip ? -dy : dy) / d; }
        const c = contactAt(world, n++);
        c.a = A; c.b = B; c.plane = false;
        c.nx = nx; c.ny = ny; c.d = 0;
        c.rA = A.r; c.rB = B.r;
        c.key = A.id * 1048576 + B.id;
        c.friction = CFG.friction;
        c.roll = CFG.rolling * (2 * A.r * B.r) / (A.r + B.r);
        c.soft = world.soft;
        warm(world, c);
      }
    }
    world.count = n;
  }

  function prepare(world) {
    const pool = world.pool;
    for (let i = 0; i < world.count; i++) {
      const c = pool[i];
      const A = c.a;
      const B = c.b;
      const mA = A.invM + B.invM;
      c.normalMass = 1 / mA;
      c.tangentMass = 1 / (mA + A.invI * c.rA * c.rA + B.invI * c.rB * c.rB);
      c.rollMass = 1 / (A.invI + B.invI);
      c.relVel = (B.vx - A.vx) * c.nx + (B.vy - A.vy) * c.ny;
    }
  }

  function integrateVelocities(world, h) {
    const gx = world.ax * h;
    const gy = (CFG.gravity + world.ay) * h;
    const ld = 1 / (1 + h * CFG.linearDamping);
    const ad = 1 / (1 + h * CFG.angularDamping);
    const bodies = world.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      b.vx += gx;
      b.vy += gy;
      b.vx *= ld; b.vy *= ld; b.w *= ad;
    }
  }

  function integratePositions(world, h) {
    const max = CFG.maxSpeed;
    const bodies = world.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const s2 = b.vx * b.vx + b.vy * b.vy;
      if (s2 > max * max) { const k = max / Math.sqrt(s2); b.vx *= k; b.vy *= k; }
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.a += b.w * h;
    }
  }

  // Applies a combined normal + tangent + rolling impulse to both bodies of a contact.
  function apply(c, jn, jt, jr) {
    const A = c.a;
    const B = c.b;
    const tx = -c.ny;
    const ty = c.nx;
    const px = jn * c.nx + jt * tx;
    const py = jn * c.ny + jt * ty;
    if (!c.plane) {
      A.vx -= A.invM * px;
      A.vy -= A.invM * py;
      A.w -= A.invI * (c.rA * jt + jr);
    }
    B.vx += B.invM * px;
    B.vy += B.invM * py;
    B.w += B.invI * (jr - c.rB * jt);
  }

  function warmStart(world) {
    for (let i = 0; i < world.count; i++) {
      const c = world.pool[i];
      if (c.nImp !== 0 || c.tImp !== 0 || c.rImp !== 0) apply(c, c.nImp, c.tImp, c.rImp);
    }
  }

  function solve(world, h, useBias) {
    const invH = 1 / h;
    const slop = CFG.slop;
    const maxPush = CFG.maxPush;
    const pool = world.pool;
    for (let i = 0; i < world.count; i++) {
      const c = pool[i];
      const A = c.a;
      const B = c.b;
      const s = c.plane
        ? B.x * c.nx + B.y * c.ny - c.d - B.r
        : (B.x - A.x) * c.nx + (B.y - A.y) * c.ny - A.r - B.r;

      let bias = 0;
      let massScale = 1;
      let impulseScale = 0;
      if (s > 0) {
        bias = s * invH; // speculative: allow closing the gap this substep, no more
      } else if (useBias) {
        const soft = c.soft;
        bias = Math.max(soft.biasRate * Math.min(0, s + slop), -maxPush);
        massScale = soft.massScale;
        impulseScale = soft.impulseScale;
      }

      // Normal (for circles the normal row has no angular part)
      const vn = (B.vx - A.vx) * c.nx + (B.vy - A.vy) * c.ny;
      let jn = -c.normalMass * massScale * (vn + bias) - impulseScale * c.nImp;
      const nn = Math.max(c.nImp + jn, 0);
      jn = nn - c.nImp;
      c.nImp = nn;
      if (jn > c.maxNImp) c.maxNImp = jn;
      if (jn !== 0) apply(c, jn, 0, 0);

      // Friction at the contact point, including spin
      const vt = (B.vx - A.vx) * -c.ny + (B.vy - A.vy) * c.nx - B.w * c.rB - A.w * c.rA;
      const maxF = c.friction * c.nImp;
      let nt = c.tImp - c.tangentMass * vt;
      if (nt > maxF) nt = maxF; else if (nt < -maxF) nt = -maxF;
      const jt = nt - c.tImp;
      c.tImp = nt;
      if (jt !== 0) apply(c, 0, jt, 0);

      // Rolling resistance so slices settle instead of spinning forever
      if (c.roll > 0) {
        const dw = B.w - A.w;
        const maxR = c.roll * c.nImp;
        let nr = c.rImp - c.rollMass * dw;
        if (nr > maxR) nr = maxR; else if (nr < -maxR) nr = -maxR;
        const jr = nr - c.rImp;
        c.rImp = nr;
        if (jr !== 0) apply(c, 0, 0, jr);
      }
    }
  }

  function restitution(world) {
    const e = CFG.restitution;
    if (e === 0) return;
    const thr = -CFG.restitutionThreshold;
    for (let i = 0; i < world.count; i++) {
      const c = world.pool[i];
      if (c.relVel > thr || c.maxNImp === 0) continue;
      const A = c.a;
      const B = c.b;
      const vn = (B.vx - A.vx) * c.nx + (B.vy - A.vy) * c.ny;
      let jn = -c.normalMass * (vn + e * c.relVel);
      const nn = Math.max(c.nImp + jn, 0);
      jn = nn - c.nImp;
      c.nImp = nn;
      if (jn !== 0) apply(c, jn, 0, 0);
    }
  }

  function store(world) {
    const next = world.cacheB;
    const prev = world.cacheA;
    next.clear();
    for (let i = 0; i < world.count; i++) {
      const c = world.pool[i];
      if (c.nImp === 0 && c.tImp === 0 && c.rImp === 0) continue;
      let arr = prev.get(c.key);
      if (!arr) arr = [0, 0, 0];
      arr[0] = c.nImp; arr[1] = c.tImp; arr[2] = c.rImp;
      next.set(c.key, arr);
    }
    world.cacheA = next;
    world.cacheB = prev;
  }

  function findMerges(world, events) {
    const cands = world.cands;
    cands.length = 0;
    for (let i = 0; i < world.count; i++) {
      const c = world.pool[i];
      if (c.nImp > 0) {
        const B = c.b;
        if (!B.landed) { B.landed = true; events.push({ type: 'land', id: B.id, tier: B.tier, speed: -c.relVel }); }
        if (!c.plane && !c.a.landed) c.a.landed = true;
      }
      if (c.plane || world.noMerge) continue;
      const A = c.a;
      const B = c.b;
      if (A.tier !== B.tier || A.dead || B.dead) continue;
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const s = Math.sqrt(dx * dx + dy * dy) - A.r - B.r;
      if (s <= CFG.mergeTolerance) cands.push(c);
    }
    if (!cands.length) return;
    cands.sort((p, q) => (q.a.y + q.b.y) - (p.a.y + p.b.y)); // lowest pairs merge first
    let removed = false;
    for (let k = 0; k < cands.length; k++) {
      const c = cands[k];
      const A = c.a;
      const B = c.b;
      if (A.dead || B.dead) continue;
      A.dead = true;
      B.dead = true;
      removed = true;
      const tier = A.tier;
      const x = (A.x + B.x) / 2;
      const y = (A.y + B.y) / 2;
      const points = TIERS[tier].points;
      if (tier === TIERS.length - 1) {
        events.push({ type: 'pop', tier, x, y, points });
        continue;
      }
      const nt = tier + 1;
      const r0 = Math.max(A.r, B.r);
      const cx = Math.min(Math.max(x, r0), W - r0);
      const nb = addBody(world, nt, cx, y, {
        r: r0,
        vx: (A.vx + B.vx) / 2,
        vy: (A.vy + B.vy) / 2,
        w: (A.w + B.w) / 2,
        a: (A.a + B.a) / 2,
        landed: true,
      });
      events.push({ type: 'merge', tier: nt, from: tier, x: cx, y, id: nb.id, points });
    }
    if (removed) removeDead(world);
  }

  function sanitize(world, events) {
    let bad = false;
    for (const b of world.bodies) {
      if (!(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.vx) &&
            Number.isFinite(b.vy) && Number.isFinite(b.w) && Number.isFinite(b.a))) {
        b.dead = true;
        bad = true;
        events.push({ type: 'lost', id: b.id, tier: b.tier });
        continue;
      }
      if (b.a > 200 || b.a < -200) {
        const k = Math.round(b.a / TAU) * TAU;
        b.a -= k;
        b.pa -= k;
      }
    }
    if (bad) {
      removeDead(world);
      world.cacheA.clear();
    }
  }

  function step(world, dt, events) {
    const n = CFG.substeps;
    const h = dt / n;
    if (world.softH !== h) {
      world.softH = h;
      const hz = Math.min(CFG.contactHertz, 0.25 / h);
      world.soft = makeSoft(hz, CFG.contactDamping, h);
      world.softStatic = makeSoft(2 * hz, CFG.contactDamping, h);
    }
    const bodies = world.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      b.px = b.x; b.py = b.y; b.pa = b.a;
    }
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (b.r < b.rt) b.r = Math.min(b.rt, b.r + b.grow * h);
      }
      collide(world, h);
      prepare(world);
      integrateVelocities(world, h);
      warmStart(world);
      solve(world, h, true);
      integratePositions(world, h);
      solve(world, h, false);
      restitution(world);
      store(world);
    }
    world.time += dt;
    for (let i = 0; i < bodies.length; i++) bodies[i].age += dt;
    findMerges(world, events);
    sanitize(world, events);
  }

  // Lowest center height a falling circle of radius r at column x would come to rest on first.
  function landingY(world, x, r) {
    let y = H - r;
    const bodies = world.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const rr = r + b.r;
      const dx = x - b.x;
      if (dx >= rr || dx <= -rr) continue;
      const cy = b.y - Math.sqrt(rr * rr - dx * dx);
      if (cy < y) y = cy;
    }
    return y;
  }

  function serialize(world) {
    const round = (v) => Math.round(v * 1000) / 1000;
    return world.bodies.map((b) => [b.tier, round(b.x), round(b.y), round(b.vx), round(b.vy),
      round(b.a % TAU), round(b.w), round(b.r), round(b.age), b.landed ? 1 : 0]);
  }

  function restore(world, rows) {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 10) continue;
      const [tier, x, y, vx, vy, a, w, r, age, landed] = row;
      if (!(tier >= 0 && tier < TIERS.length) || ![x, y, vx, vy, a, w, r, age].every(Number.isFinite)) continue;
      addBody(world, tier | 0, x, y, { vx, vy, a, w, r, age, landed: !!landed });
    }
  }

  return { W, H, TIERS, CFG, createWorld, addBody, step, landingY, serialize, restore };
})();

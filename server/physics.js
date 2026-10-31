'use strict';
/**
 * Herní fyzika (vlastní, deterministická, bez závislostí).
 * Jednotky: stůl 1000 x 500, poloměr koule 11.5. Čas v sekundách.
 * Pevný krok 1/240 s => i při maximální rychlosti koule neprojdou skrz sebe.
 */
const W = 1000, H = 500, R = 11.5;

const C = Object.freeze({
  W, H, R,
  STEP: 1 / 240,
  FRICTION: 150,     // konstantní zpomalení sukna (jednotky/s²)
  DAMPING: 0.10,     // úměrné tlumení (1/s)
  STOP_SPEED: 6,     // pod touto rychlostí se koule zastaví
  E_BALL: 0.96,      // pružnost koule-koule
  E_CUSHION: 0.76,   // pružnost mantinelu
  MAX_SPEED: 1800,
  HEAD_X: 250,       // zaváděcí čára
  FOOT_X: 750,       // špička trojúhelníku
});

const POCKETS = Object.freeze([
  { x: 0, y: 0, r: 32 }, { x: W / 2, y: -12, r: 31 }, { x: W, y: 0, r: 32 },
  { x: 0, y: H, r: 32 }, { x: W / 2, y: H + 12, r: 31 }, { x: W, y: H, r: 32 },
].map(Object.freeze));

const CFG = Object.freeze({ ...C, POCKETS });

const groupOf = (id) => (id >= 1 && id <= 7 ? 'solid' : id >= 9 && id <= 15 ? 'stripe' : null);
const round = (n) => Math.round(n * 100) / 100;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const mk = (id, x, y) => ({ id, x, y, vx: 0, vy: 0, pocketed: false });

/** 16 koulí: 0 = bílá, 1-7 plné, 8 černá, 9-15 pruhované. */
function createBalls() {
  const balls = new Array(16);
  balls[0] = mk(0, C.HEAD_X, H / 2);
  const dx = (2 * R + 0.1) * Math.cos(Math.PI / 6);
  const dy = R + 0.05;
  const slots = [];
  for (let row = 0; row < 5; row++) {
    for (let k = 0; k <= row; k++) slots.push({ x: C.FOOT_X + row * dx, y: H / 2 + (k - row / 2) * 2 * dy });
  }
  const solids = shuffle([1, 2, 3, 4, 5, 6, 7]);
  const stripes = shuffle([9, 10, 11, 12, 13, 14, 15]);
  const ids = new Array(15).fill(null);
  ids[4] = 8;                       // osmička uprostřed 3. řady
  ids[10] = solids.pop();           // zadní rohy: jedna plná, jedna pruhovaná
  ids[14] = stripes.pop();
  const rest = shuffle([...solids, ...stripes]);
  for (let i = 0; i < 15; i++) if (ids[i] === null) ids[i] = rest.pop();
  slots.forEach((s, i) => { balls[ids[i]] = mk(ids[i], s.x, s.y); });
  return balls;
}

function pushEvent(world, ev) {
  if (world.shot.events.length < 24) world.shot.events.push(ev);
}

function sinkBall(world, b, p) {
  b.pocketed = true; b.vx = b.vy = 0;
  world.shot.pocketed.push(b.id);
  world.shot.events.push({ k: 'pocket', id: b.id, x: round(b.x), y: round(b.y), px: p.x, py: p.y });
}

function railHit(world, speed) {
  if (world.shot.firstContact !== null) world.shot.railAfter = true;
  if (speed > 15) pushEvent(world, { k: 'rail', v: Math.round(speed) });
}

/** Jeden fyzikální krok. Vrací true, pokud se ještě něco pohybuje. */
function stepWorld(world, h) {
  const balls = world.balls, shot = world.shot;
  const E = C.E_CUSHION;

  for (const b of balls) {
    if (b.pocketed) continue;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp === 0) continue;
    const ns = sp * (1 - C.DAMPING * h) - C.FRICTION * h;
    if (ns < C.STOP_SPEED) { b.vx = b.vy = 0; continue; }
    const k = ns / sp;
    b.vx *= k; b.vy *= k;
    b.x += b.vx * h; b.y += b.vy * h;
  }

  for (const b of balls) {
    if (b.pocketed) continue;
    for (const p of POCKETS) {
      const dx = b.x - p.x, dy = b.y - p.y;
      if (dx * dx + dy * dy < p.r * p.r) { sinkBall(world, b, p); break; }
    }
  }

  for (const b of balls) {
    if (b.pocketed) continue;
    if (b.x < R)     { b.x = R;     if (b.vx < 0) { railHit(world, -b.vx); b.vx = -b.vx * E; b.vy *= 0.985; } }
    if (b.x > W - R) { b.x = W - R; if (b.vx > 0) { railHit(world,  b.vx); b.vx = -b.vx * E; b.vy *= 0.985; } }
    if (b.y < R)     { b.y = R;     if (b.vy < 0) { railHit(world, -b.vy); b.vy = -b.vy * E; b.vx *= 0.985; } }
    if (b.y > H - R) { b.y = H - R; if (b.vy > 0) { railHit(world,  b.vy); b.vy = -b.vy * E; b.vx *= 0.985; } }
  }

  const D2 = 4 * R * R;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.pocketed) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.pocketed) continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= D2) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-6) { dx = 1; dy = 0; d = 1e-6; }
        const nx = dx / d, ny = dy / d;
        const overlap = 2 * R - d;
        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2; b.y += ny * overlap / 2;
        const rvn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rvn > 0) {
          const imp = (1 + C.E_BALL) / 2 * rvn;
          a.vx -= imp * nx; a.vy -= imp * ny;
          b.vx += imp * nx; b.vy += imp * ny;
          if (shot.firstContact === null && (a.id === 0 || b.id === 0)) shot.firstContact = a.id === 0 ? b.id : a.id;
          if (pass === 0 && rvn > 12) pushEvent(world, { k: 'hit', v: Math.round(rvn) });
        }
      }
    }
  }

  for (const b of balls) if (!b.pocketed && (b.vx !== 0 || b.vy !== 0)) return true;
  return false;
}

function canPlace(balls, x, y, kitchenOnly = false) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < R || x > W - R || y < R || y > H - R) return false;
  if (kitchenOnly && x > C.HEAD_X) return false;
  for (const p of POCKETS) if (Math.hypot(x - p.x, y - p.y) < p.r + R * 0.6) return false;
  for (const b of balls) {
    if (b.id === 0 || b.pocketed) continue;
    if (Math.hypot(x - b.x, y - b.y) < 2 * R + 0.5) return false;
  }
  return true;
}

/** Volné místo pro vrácenou osmičku (od špičky směrem ke krátkému mantinelu). */
function respotPosition(balls, id) {
  for (let x = C.FOOT_X; x < W - R; x += 2) {
    if (balls.every((b) => b.id === id || b.pocketed || Math.hypot(b.x - x, b.y - H / 2) >= 2 * R + 0.5)) return { x, y: H / 2 };
  }
  return { x: C.FOOT_X, y: H / 2 };
}

module.exports = { C, CFG, POCKETS, createBalls, stepWorld, canPlace, respotPosition, groupOf, round };

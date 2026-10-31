'use strict';
// Testy fyziky a pravidel bez síťových závislostí: node test/sim.test.js
const assert = require('assert');
const { C, createBalls, stepWorld, canPlace, groupOf, POCKETS } = require('../server/physics');
const { evaluateShot } = require('../server/rules');
const { Game } = require('../server/game');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const fakeRoom = () => { const log = []; return { log, emit: (ev, d) => log.push([ev, d]) }; };
const newWorld = (balls) => ({ balls, shot: { firstContact: null, pocketed: [], railAfter: false, events: [] } });
const runWorld = (w, maxSec = 60) => { let t = 0; while (stepWorld(w, C.STEP) && t < maxSec) t += C.STEP; return t; };

console.log('Fyzika');
ok('rozestavění: 16 koulí, bez překryvů, osmička uprostřed', () => {
  for (let k = 0; k < 20; k++) {
    const b = createBalls();
    assert.strictEqual(b.length, 16);
    for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) assert(Math.hypot(b[i].x - b[j].x, b[i].y - b[j].y) >= 2 * C.R, 'překryv');
    // osmička: 3. řada, uprostřed
    assert(Math.abs(b[8].y - C.H / 2) < 0.1);
    assert(Math.abs(b[8].x - (C.FOOT_X + 2 * (2 * C.R + 0.1) * Math.cos(Math.PI / 6))) < 0.01);
  }
});

ok('přímý úder: bílá narazí do koule, předá hybnost', () => {
  const balls = createBalls().map((b) => ({ ...b, pocketed: b.id > 1 }));   // jen bílá a jednička
  balls[1].x = 500; balls[1].y = 250; balls[0].x = 300; balls[0].y = 250; balls[0].vx = 600;
  const w = newWorld(balls);
  runWorld(w);
  assert.strictEqual(w.shot.firstContact, 1);
  assert(balls[1].x > 500, 'jednička se musela posunout');
});

ok('zapadnutí do rohové a boční díry', () => {
  const balls = createBalls().map((b) => ({ ...b, pocketed: b.id > 2 }));
  balls[0].x = 100; balls[0].y = 100; balls[0].vx = -300; balls[0].vy = -300;   // do rohu
  balls[1].x = 500; balls[1].y = 40; balls[1].vy = -250; balls[1].vx = 0;       // do boční díry
  balls[2].pocketed = true;
  const w = newWorld(balls);
  runWorld(w);
  assert(balls[0].pocketed && balls[1].pocketed, 'obě koule měly zapadnout');
  assert(w.shot.events.filter((e) => e.k === 'pocket').length === 2);
});

ok('odraz od mantinelu zachová kouli ve stole a zpomaluje', () => {
  const balls = createBalls().map((b) => ({ ...b, pocketed: b.id > 0 }));
  balls[0].x = 300; balls[0].y = 250; balls[0].vx = 900; balls[0].vy = 130;
  const w = newWorld(balls);
  let t = 0, maxV = 900;
  while (stepWorld(w, C.STEP) && t < 60) { t += C.STEP; maxV = Math.max(maxV, Math.hypot(balls[0].vx, balls[0].vy)); assert(balls[0].x >= C.R - 1e-6 && balls[0].x <= C.W - C.R + 1e-6); }
  assert(t > 0.5 && t < 40, `zastavení po ${t}s`);
  assert(maxV <= 910);
});

ok('fuzz: 150 náhodných úderů – žádné NaN, překryvy ani únik ze stolu', () => {
  for (let k = 0; k < 150; k++) {
    const balls = createBalls();
    const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * (C.MAX_SPEED - 40);
    balls[0].vx = Math.cos(a) * v; balls[0].vy = Math.sin(a) * v;
    const w = newWorld(balls);
    let t = 0;
    while (stepWorld(w, C.STEP)) {
      t += C.STEP;
      assert(t < 90, 'simulace neskončila');
    }
    for (const b of balls) {
      if (b.pocketed) continue;
      assert(Number.isFinite(b.x) && Number.isFinite(b.y));
      assert(b.x >= C.R - 1e-6 && b.x <= C.W - C.R + 1e-6 && b.y >= C.R - 1e-6 && b.y <= C.H - C.R + 1e-6, 'mimo stůl');
    }
    for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) {
      if (balls[i].pocketed || balls[j].pocketed) continue;
      assert(Math.hypot(balls[i].x - balls[j].x, balls[i].y - balls[j].y) > 2 * C.R - 1.0, 'překryv koulí po zastavení');
    }
  }
});

ok('canPlace: odmítne díry, překryv i okraj', () => {
  const balls = createBalls();
  assert(canPlace(balls, 250, 250));
  assert(!canPlace(balls, 5, 5));
  assert(!canPlace(balls, balls[8].x + 5, balls[8].y));
  assert(!canPlace(balls, 500, 3));
  assert(canPlace(balls, 300, 250));
  assert(!canPlace(balls, 300, 250, true), 'v kuchyni jen x <= HEAD_X');
});

console.log('Pravidla');
const base = { me: 0, groups: [null, null], onTable: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], isBreak: false, firstContact: 1, pocketed: [], railAfter: true };
ok('legální zapadnutí na otevřeném stole přidělí skupiny a hráč pokračuje', () => {
  const r = evaluateShot({ ...base, pocketed: [3] });
  assert.deepStrictEqual(r.groups, ['solid', 'stripe']);
  assert.strictEqual(r.nextTurn, 0); assert(!r.foul);
});
ok('na rozehrávce se skupiny nepřidělují, ale hráč s koulí pokračuje', () => {
  const r = evaluateShot({ ...base, isBreak: true, pocketed: [12] });
  assert.deepStrictEqual(r.groups, [null, null]); assert.strictEqual(r.nextTurn, 0);
});
ok('minutí = střídání tahu', () => {
  const r = evaluateShot({ ...base });
  assert.strictEqual(r.nextTurn, 1); assert(!r.ballInHand);
});
ok('potopení bílé = faul, soupeř dostane bílou v ruce', () => {
  const r = evaluateShot({ ...base, pocketed: [0, 3] });
  assert(r.foul && r.ballInHand && r.nextTurn === 1); assert.deepStrictEqual(r.groups, [null, null]);
});
ok('špatná první koule = faul', () => {
  const r = evaluateShot({ ...base, groups: ['solid', 'stripe'], firstContact: 10 });
  assert(r.fouls.includes('wrongfirst'));
});
ok('bez kontaktu a bez mantinelu = faul', () => {
  assert(evaluateShot({ ...base, firstContact: null }).fouls.includes('nocontact'));
  assert(evaluateShot({ ...base, railAfter: false }).fouls.includes('norail'));
});
ok('osmička předčasně = prohra', () => {
  const r = evaluateShot({ ...base, groups: ['solid', 'stripe'], firstContact: 2, pocketed: [8] });
  assert.strictEqual(r.winner, 1); assert.strictEqual(r.loseReason, 'early8');
});
ok('osmička po vyčištění = výhra; s faulem = prohra', () => {
  const only8 = [8, 9, 10, 11, 12, 13, 14, 15];
  const g = ['solid', 'stripe'];
  assert.strictEqual(evaluateShot({ ...base, groups: g, onTable: only8, firstContact: 8, pocketed: [8] }).winner, 0);
  const l = evaluateShot({ ...base, groups: g, onTable: only8, firstContact: 8, pocketed: [8, 0] });
  assert.strictEqual(l.winner, 1); assert.strictEqual(l.loseReason, 'foul8');
});
ok('osmička na rozehrávce se vrací na stůl (nikdo neprohrává)', () => {
  const r = evaluateShot({ ...base, isBreak: true, pocketed: [8] });
  assert(r.respot8 && r.winner === null);
});

console.log('Celá hra (bez sítě)');
ok('Game: rozehra → state/snap → konec úderu; střídání a validace tahu', () => {
  const room = fakeRoom();
  const g = new Game(room, ['A', 'B'], 0, { manual: true });
  g.begin();
  assert(!g.shoot(1, 0, 1), 'soupeř nesmí hrát mimo tah');
  assert(g.shoot(0, 0, 1));
  assert(!g.shoot(0, 0, 1), 'nelze střílet za pohybu');
  let guard = 0;
  while (g.phase === 'moving' && guard++ < 6000) { if (!g.advance(1 / 60)) g.finishShot(); }
  assert(g.phase !== 'moving', 'úder musí skončit');
  assert(room.log.some(([e]) => e === 'snap') && room.log.filter(([e]) => e === 'state').length >= 2);
  const last = [...room.log].reverse().find(([e]) => e === 'state')[1];
  assert(last.balls.length === 16);
  console.log(`      po rozehře: fáze=${g.phase}, na tahu=${g.turn}, potopeno=${g.pocketedOrder.length}`);
});

console.log(`\nVše v pořádku (${n} testů).`);

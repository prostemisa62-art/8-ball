'use strict';
// Integrační test síťové vrstvy s minimální náhradou Socket.IO (bez instalace balíčků).
const assert = require('assert');
const { attach } = require('../server/network');

class FakeIO {
  constructor() { this.sockets = new Map(); this.handlers = {}; }
  on(ev, fn) { this.handlers[ev] = fn; }
  deliver(target, ev, data, exceptId) {
    for (const s of this.sockets.values()) {
      if (s.id !== exceptId && s.rooms.has(target)) s.inbox.push([ev, JSON.parse(JSON.stringify(data === undefined ? null : data))]);
    }
  }
  to(target) { return { emit: (ev, data) => this.deliver(target, ev, data) }; }
  connect() {
    const io = this;
    const id = 's' + (this.sockets.size + 1) + Math.random().toString(36).slice(2, 6);
    const handlers = {};
    const sock = {
      id, data: {}, rooms: new Set([id]), inbox: [], connected: true,
      on(ev, fn) { handlers[ev] = fn; },
      emit(ev, data) { this.inbox.push([ev, JSON.parse(JSON.stringify(data === undefined ? null : data))]); },
      join(r) { this.rooms.add(r); }, leave(r) { this.rooms.delete(r); },
      to(r) { return { emit: (ev, d) => io.deliver(r, ev, d, id) }; },
    };
    this.sockets.set(id, sock);
    this.handlers.connection(sock);
    // „klientská“ strana
    return {
      sock,
      send: (ev, d) => handlers[ev] && handlers[ev](d),
      last: (ev) => { const m = sock.inbox.filter(([e]) => e === ev); return m.length ? m[m.length - 1][1] : null; },
      all: (ev) => sock.inbox.filter(([e]) => e === ev).map(([, d]) => d),
      drop: () => { sock.connected = false; sock.rooms.clear(); handlers.disconnect && handlers.disconnect(); },
    };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

(async () => {
  const io = new FakeIO();
  const mgr = attach(io, { graceMs: 150 });

  // vytvoření a připojení
  const a = io.connect(), b = io.connect();
  a.send('create', { name: 'Anna' });
  const ra = a.last('room');
  assert(/^\d{6}$/.test(ra.code) && !ra.started && ra.you === 0 && ra.token); ok('vytvoření místnosti vrací šestimístný kód');

  b.send('join', { code: '000000', name: 'Bob' });
  assert(b.last('err').message.includes('neexistuje')); ok('špatný kód → chybová zpráva');

  b.send('join', { code: ra.code, name: 'Bob' });
  assert(a.last('room').started && b.last('room').started && b.last('room').you === 1);
  assert(a.last('room').names.join() === 'Anna,Bob'); ok('připojení druhého hráče automaticky spustí hru');

  const c = io.connect();
  c.send('join', { code: ra.code, name: 'Cyril' });
  assert(c.last('err').message.includes('obsazená')); ok('třetí hráč je odmítnut (místnost obsazená)');

  // tahy
  const st = a.last('state');
  assert(st.phase === 'aiming' && st.turn === 0 && st.balls.length === 16);
  b.send('shoot', { a: 0, p: 1 });
  assert(a.last('state').phase === 'aiming'); ok('soupeř nemůže hrát mimo svůj tah');
  a.send('shoot', { a: 0.01, p: 1 });
  assert(a.last('state').phase === 'moving' && b.last('state').phase === 'moving'); ok('úder se synchronizuje oběma hráčům');
  a.send('shoot', { a: 0, p: 1 });
  assert(a.all('state').filter((s) => s.phase === 'moving').length === 1); ok('druhý úder za pohybu je ignorován');
  await sleep(300);
  assert(b.all('snap').length > 5 && b.last('snap').b.length === 16); ok('server posílá snímky pozic (snap) v reálném čase');
  for (let i = 0; i < 100 && a.last('state').phase === 'moving'; i++) await sleep(100);
  const after = b.last('state');
  assert(after.phase !== 'moving'); ok(`úder skončil (fáze: ${after.phase}, na tahu: ${after.turn})`);

  // míření se přeposílá jen soupeři a jen hráči na tahu
  const turnIdx = after.turn, P = [a, b];
  P[1 - turnIdx].send('aim', { a: 1, p: 0.5, on: true });
  assert(!P[turnIdx].all('aim').length);
  if (after.phase === 'aiming') { P[turnIdx].send('aim', { a: 1, p: 0.5, on: true }); assert(P[1 - turnIdx].last('aim').p === 0.5); ok('míření vidí soupeř, ne naopak'); }

  // odpojení a návrat
  const tokA = ra.token;
  a.drop();
  assert(b.last('opp').online === false); ok('soupeř dostane upozornění o odpojení');
  const a2 = io.connect();
  a2.send('rejoin', { code: ra.code, token: tokA });
  assert(a2.last('room').started && a2.last('state') && a2.last('room').you === 0);
  assert(b.last('opp').online === true); ok('hráč se po odpojení znovu připojí a dostane aktuální stav');
  const bad = io.connect(); bad.send('rejoin', { code: ra.code, token: 'x' });
  assert(bad.all('closed').length === 1); ok('znovupřipojení s neplatným tokenem je odmítnuto');

  // vypršení čekání
  a2.drop();
  await sleep(250);
  assert(b.last('closed').win && !mgr.rooms.size); ok('po vypršení limitu je soupeři přiznáno vítězství a místnost zanikne');

  // rychlá hra
  const q1 = io.connect(), q2 = io.connect();
  q1.send('queue', { name: 'Q1' });
  assert(q1.all('queued').length === 1);
  q2.send('queue', { name: 'Q2' });
  assert(q1.last('room').started && q2.last('room').started); ok('HRÁT ONLINE: dva čekající hráči se spárují');
  q1.send('leave');
  assert(q2.last('closed').win); ok('opuštění hry → soupeř vyhrává kontumačně');
  console.log(`\nVše v pořádku (${n} kontrol).`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

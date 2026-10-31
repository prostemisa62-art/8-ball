'use strict';
/** Síťová vrstva: propojení Socket.IO událostí se správou místností a hrou. */
const { RoomManager } = require('./rooms');

function attach(io, opts = {}) {
  const mgr = new RoomManager(io, opts);

  io.on('connection', (socket) => {
    socket.data = { code: null, seat: null, lastAim: 0 };
    const safe = (fn) => (...args) => { try { fn(...args); } catch (e) { console.error('[socket]', e); } };
    const game = () => { const r = mgr.roomOf(socket); return r && r.game ? { r, g: r.game } : null; };

    socket.on('create', safe((d) => { mgr.create(socket, d && d.name); }));
    socket.on('join', safe((d) => {
      const res = mgr.join(socket, d && d.code, d && d.name);
      if (res.error) socket.emit('err', { where: 'join', message: res.error });
    }));
    socket.on('queue', safe((d) => mgr.quick(socket, d && d.name)));
    socket.on('queue:cancel', safe(() => mgr.unqueue(socket)));
    socket.on('rejoin', safe((d) => {
      if (!d || !mgr.rejoin(socket, d.code, d.token)) socket.emit('closed', { reason: 'Místnost už neexistuje.', silent: true });
    }));
    socket.on('leave', safe(() => mgr.leave(socket)));
    socket.on('rematch', safe(() => mgr.voteRematch(socket)));

    socket.on('shoot', safe((d) => {
      const x = game();
      if (x && d) x.g.shoot(socket.data.seat, Number(d.a), Number(d.p));
    }));
    socket.on('place', safe((d) => {
      const x = game();
      if (!x || !d) return;
      if (x.g.place(socket.data.seat, Number(d.x), Number(d.y)) === 'invalid') socket.emit('notice', { text: 'Sem bílou kouli položit nelze.', type: 'foul' });
    }));
    socket.on('aim', safe((d) => {
      const x = game();
      if (!x || !d || x.g.phase === 'moving' || x.g.phase === 'over' || socket.data.seat !== x.g.turn) return;
      const now = Date.now();
      if (now - socket.data.lastAim < 30) return;
      socket.data.lastAim = now;
      const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      socket.to(x.r.code).emit('aim', { a: n(d.a), p: Math.min(1, Math.max(0, n(d.p))), x: n(d.x), y: n(d.y), on: !!d.on });
    }));

    socket.on('disconnect', safe(() => mgr.disconnect(socket)));
  });
  return mgr;
}

module.exports = { attach };

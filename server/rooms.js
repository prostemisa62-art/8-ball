'use strict';
/** Správa místností, párování (rychlá hra), tokeny pro znovupřipojení. */
const crypto = require('crypto');
const { Game } = require('./game');
const { CFG } = require('./physics');

const GRACE_MS = 120000;

function cleanName(n) {
  let s = typeof n === 'string' ? n.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16) : '';
  if (!s) s = `Hráč ${100 + Math.floor(Math.random() * 900)}`;
  return s;
}

class Room {
  constructor(mgr, code) {
    this.mgr = mgr; this.code = code;
    this.seats = [null, null];
    this.game = null;
    this.rematch = [false, false];
    this.breaker = 0;
  }
  emit(ev, data) { this.mgr.io.to(this.code).emit(ev, data); }
  emitSeat(i, ev, data) { const s = this.seats[i]; if (s && s.socketId) this.mgr.io.to(s.socketId).emit(ev, data); }
  names() { return this.seats.map((s) => (s ? s.name : null)); }
  payload(i) {
    return {
      code: this.code, you: i, names: this.names(), token: this.seats[i].token,
      started: !!this.game, cfg: CFG, online: this.seats.map((s) => !!(s && s.online)),
    };
  }
}

class RoomManager {
  constructor(io, opts = {}) {
    this.io = io; this.rooms = new Map(); this.queue = [];
    this.graceMs = opts.graceMs || GRACE_MS;
  }

  makeCode() {
    let c;
    do { c = String(Math.floor(100000 + Math.random() * 900000)); } while (this.rooms.has(c));
    return c;
  }

  roomOf(socket) { return socket.data.code ? this.rooms.get(socket.data.code) : null; }

  bind(room, i, socket) {
    const s = room.seats[i];
    if (s.socketId && s.socketId !== socket.id) this.io.to(s.socketId).emit('closed', { reason: 'Připojeno z jiného okna.' });
    clearTimeout(s.timer);
    s.socketId = socket.id; s.online = true;
    socket.join(room.code);
    socket.data.code = room.code; socket.data.seat = i;
  }

  newSeat(name) { return { name: cleanName(name), token: crypto.randomBytes(12).toString('hex'), socketId: null, online: false, timer: null }; }

  create(socket, name) {
    this.detach(socket);
    const room = new Room(this, this.makeCode());
    room.seats[0] = this.newSeat(name);
    this.rooms.set(room.code, room);
    this.bind(room, 0, socket);
    socket.emit('room', room.payload(0));
    return room;
  }

  join(socket, code, name) {
    const room = this.rooms.get(String(code || '').trim());
    if (!room) return { error: 'Místnost s tímto kódem neexistuje.' };
    if (room.seats[1] || room.game) return { error: 'Místnost je již obsazená.' };
    if (room.seats[0].socketId === socket.id) return { error: 'V této místnosti už jsi.' };
    this.detach(socket);
    room.seats[1] = this.newSeat(name);
    this.bind(room, 1, socket);
    this.startGame(room);
    return { room };
  }

  startGame(room) {
    if (room.game) room.game.destroy();
    room.rematch = [false, false];
    room.game = new Game(room, room.names(), room.breaker);
    for (let i = 0; i < 2; i++) room.emitSeat(i, 'room', room.payload(i));
    room.game.begin();
  }

  quick(socket, name) {
    this.detach(socket);
    this.queue = this.queue.filter((e) => e.socket.connected !== false && e.socket.id !== socket.id);
    const waiting = this.queue.shift();
    if (!waiting) { this.queue.push({ socket, name }); socket.emit('queued'); return; }
    const room = new Room(this, this.makeCode());
    room.seats[0] = this.newSeat(waiting.name);
    room.seats[1] = this.newSeat(name);
    this.rooms.set(room.code, room);
    this.bind(room, 0, waiting.socket);
    this.bind(room, 1, socket);
    this.startGame(room);
  }

  unqueue(socket) { this.queue = this.queue.filter((e) => e.socket.id !== socket.id); }

  voteRematch(socket) {
    const room = this.roomOf(socket);
    if (!room || !room.game || room.game.phase !== 'over') return;
    room.rematch[socket.data.seat] = true;
    room.emit('rematch', { votes: room.rematch });
    if (room.rematch[0] && room.rematch[1]) { room.breaker = 1 - room.breaker; this.startGame(room); }
  }

  rejoin(socket, code, token) {
    const room = this.rooms.get(String(code || ''));
    if (!room) return false;
    const i = room.seats.findIndex((s) => s && s.token === token);
    if (i < 0) return false;
    this.detach(socket, true);
    this.bind(room, i, socket);
    socket.emit('room', room.payload(i));
    if (room.game) {
      socket.emit('state', room.game.publicState());
      if (room.game.phase === 'over') socket.emit('gameover', { winner: room.game.winner, reason: 'Hra skončila.' });
    }
    socket.to(room.code).emit('opp', { online: true });
    const other = room.seats[1 - i];
    if (other && !other.online) socket.emit('opp', { online: false, grace: Math.round(this.graceMs / 1000) });
    return true;
  }

  dispose(room) {
    if (room.game) room.game.destroy();
    for (const s of room.seats) if (s) clearTimeout(s.timer);
    this.rooms.delete(room.code);
  }

  /** Hráč opouští místnost záměrně. */
  leave(socket) {
    const room = this.roomOf(socket);
    this.unqueue(socket);
    if (!room) return;
    const i = socket.data.seat;
    const over = !room.game || room.game.phase === 'over';
    socket.leave(room.code);
    socket.data.code = null; socket.data.seat = null;
    room.seats[i].socketId = null;
    const other = room.seats[1 - i];
    if (other && other.socketId) {
      this.io.to(other.socketId).emit('closed', {
        reason: over ? 'Soupeř opustil místnost.' : 'Soupeř opustil hru. Vítězíš kontumačně.', win: !over,
      });
    }
    this.dispose(room);
  }

  /** Vazba na socket zrušena bez ukončení místnosti (např. při založení jiné). */
  detach(socket, silent = false) {
    this.unqueue(socket);
    const room = this.roomOf(socket);
    if (!room) return;
    if (silent) return;
    this.leave(socket);
  }

  disconnect(socket) {
    this.unqueue(socket);
    const room = this.roomOf(socket);
    if (!room) return;
    const i = socket.data.seat;
    const seat = room.seats[i];
    if (!seat || seat.socketId !== socket.id) return;   // už přebrán jiným socketem
    seat.online = false; seat.socketId = null;
    room.emit('opp', { online: false, grace: Math.round(this.graceMs / 1000) });
    clearTimeout(seat.timer);
    seat.timer = setTimeout(() => {
      const other = room.seats[1 - i];
      if (other && other.socketId) this.io.to(other.socketId).emit('closed', { reason: 'Soupeř se nevrátil včas. Vítězíš kontumačně.', win: true });
      this.dispose(room);
    }, this.graceMs);
  }
}

module.exports = { RoomManager, cleanName };

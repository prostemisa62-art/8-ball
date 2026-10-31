'use strict';
/**
 * Autoritativní herní stav jedné partie. Klienti posílají jen úmysl
 * (úder / umístění bílé), vše ostatní počítá server.
 */
const { C, createBalls, stepWorld, canPlace, respotPosition, groupOf, round } = require('./physics');
const { evaluateShot, countGroup } = require('./rules');

const MAX_SHOT_MS = 45000;
const FOUL_TEXT = {
  scratch: 'bílá koule zapadla',
  nocontact: 'bílá koule se nedotkla žádné koule',
  wrongfirst: 'první zasažená koule nebyla z tvojí skupiny',
  need8: 'nejdřív je nutné zasáhnout černou osmičku',
  eightfirst: 'osmičku nelze zasáhnout jako první',
  norail: 'po kontaktu se žádná koule nedotkla mantinelu ani nezapadla',
};
const GROUP_TEXT = { solid: 'plné', stripe: 'pruhované' };

class Game {
  constructor(room, names, firstTurn = 0, opts = {}) {
    this.room = room;
    this.names = names;
    this.opts = opts;
    this.balls = createBalls();
    this.groups = [null, null];
    this.turn = firstTurn;
    this.phase = 'aiming';       // aiming | placing | moving | over
    this.isBreak = true;
    this.winner = null;
    this.pocketedOrder = [];
    this.timer = null;
    this.shot = null;
    this.ctx = null;
  }

  // ---------- veřejný stav ----------
  onTableIds() { return this.balls.filter((b) => !b.pocketed && b.id !== 0).map((b) => b.id); }

  positions() { return this.balls.map((b) => (b.pocketed ? null : [round(b.x), round(b.y)])); }

  publicState() {
    const on = this.onTableIds();
    return {
      phase: this.phase,
      turn: this.turn,
      groups: this.groups,
      onTable: on,
      pocketed: this.pocketedOrder,
      remaining: this.groups.map((g) => (g ? countGroup(g, on) : null)),
      winner: this.winner,
      balls: this.positions(),
    };
  }

  emitState() { this.room.emit('state', this.publicState()); }
  notice(text, type = 'info') { this.room.emit('notice', { text, type }); }

  begin() {
    this.emitState();
    this.notice(`Rozehrává ${this.names[this.turn]}.`);
  }

  // ---------- akce hráčů ----------
  shoot(seat, angle, power) {
    if (this.phase !== 'aiming' || seat !== this.turn) return false;
    if (!Number.isFinite(angle) || !Number.isFinite(power)) return false;
    power = Math.min(1, Math.max(0, power));
    if (power < 0.01) return false;
    const cue = this.balls[0];
    const v = 40 + (C.MAX_SPEED - 40) * power;
    cue.vx = Math.cos(angle) * v;
    cue.vy = Math.sin(angle) * v;
    this.shot = { firstContact: null, pocketed: [], railAfter: false, events: [{ k: 'cue', v: Math.round(v) }] };
    this.ctx = { me: seat, onTable: this.onTableIds(), isBreak: this.isBreak, groups: this.groups.slice() };
    this.phase = 'moving';
    this.emitState();
    this.last = Date.now();
    this.t0 = this.last;
    this.acc = 0;
    if (!this.opts.manual) this.timer = setInterval(() => this.tick(), 16);
    return true;
  }

  place(seat, x, y) {
    if (this.phase !== 'placing' || seat !== this.turn) return false;
    if (!canPlace(this.balls, x, y, false)) return 'invalid';
    const cue = this.balls[0];
    cue.x = x; cue.y = y; cue.vx = cue.vy = 0; cue.pocketed = false;
    this.phase = 'aiming';
    this.emitState();
    return true;
  }

  // ---------- simulace ----------
  advance(dt) {
    this.acc += dt;
    let moving = true;
    while (this.acc >= C.STEP) {
      moving = stepWorld(this, C.STEP);
      this.acc -= C.STEP;
      if (!moving) break;
    }
    this.room.emit('snap', { b: this.positions(), ev: this.shot.events.splice(0) });
    return moving;
  }

  tick() {
    const now = Date.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const moving = this.advance(dt);
    if (!moving || now - this.t0 > MAX_SHOT_MS) {
      if (moving) for (const b of this.balls) b.vx = b.vy = 0;
      this.finishShot();
    }
  }

  stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  finishShot() {
    this.stopTimer();
    const { me, onTable, isBreak, groups } = this.ctx;
    const shot = this.shot;
    const res = evaluateShot({ me, groups, onTable, isBreak, firstContact: shot.firstContact, pocketed: shot.pocketed, railAfter: shot.railAfter });
    const name = this.names[me];
    const opp = 1 - me;
    this.isBreak = false;

    for (const id of shot.pocketed) if (id !== 0 && !(id === 8 && res.respot8)) this.pocketedOrder.push(id);

    if (res.respot8) {
      const p = respotPosition(this.balls, 8);
      Object.assign(this.balls[8], { x: p.x, y: p.y, vx: 0, vy: 0, pocketed: false });
      this.notice('Osmička zapadla při rozehře – vrací se na stůl.');
    }

    if (res.winner !== null) {
      this.groups = res.groups;
      this.phase = 'over';
      this.winner = res.winner;
      const wn = this.names[res.winner];
      let reason;
      if (res.loseReason === 'early8') reason = `${this.names[1 - res.winner]}: osmička zapadla předčasně.`;
      else if (res.loseReason === 'foul8') reason = `${this.names[1 - res.winner]}: osmička zapadla při faulu.`;
      else reason = `${wn} potopil(a) osmičku po vyčištění všech svých koulí.`;
      this.emitState();
      this.room.emit('gameover', { winner: res.winner, reason });
      return;
    }

    this.groups = res.groups;
    if (res.assigned) {
      this.notice(`${name} hraje ${GROUP_TEXT[res.assigned]} koule, ${this.names[opp]} hraje ${GROUP_TEXT[res.groups[opp]]}.`, 'good');
    }

    if (res.foul) {
      const why = res.fouls.map((f) => FOUL_TEXT[f]).join('; ');
      this.notice(`Faul (${name}): ${why}. ${this.names[opp]} umisťuje bílou kouli kamkoliv na stůl.`, 'foul');
      const cue = this.balls[0];
      cue.pocketed = true; cue.vx = cue.vy = 0;
      this.phase = 'placing';
      this.turn = opp;
    } else {
      this.phase = 'aiming';
      this.turn = res.nextTurn;
      if (shot.pocketed.some((id) => id !== 0)) {
        if (res.nextTurn === me) this.notice(`${name} potopil(a) kouli a pokračuje.`, 'good');
      } else {
        this.notice(`Na tahu: ${this.names[this.turn]}.`);
      }
    }
    this.emitState();
  }

  destroy() { this.stopTimer(); }
}

module.exports = { Game };

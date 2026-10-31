// Klientská část hry: stav ze serveru, interpolace snímků, zvuky, ovládání myší/dotykem.
import { Renderer, FRAME } from './render.js';
import { audio } from './audio.js';
import { settings } from './settings.js';
import { updateHud, toast, $ } from './ui.js';

const INTERP_MS = 70;      // zpoždění vykreslování kvůli plynulosti při kolísání sítě
const GRAB = 75;           // jak blízko bílé koule lze úder zahájit
const MAX_PULL = 230;      // tah myší (jednotky stolu) odpovídající 100 % síly
const MIN_PULL = 14;

export class ClientGame {
  constructor(net) {
    this.net = net;
    this.cv = $('cv');
    this.r = new Renderer(this.cv);
    this.snaps = []; this.pending = []; this.sinks = [];
    this.s = null; this.names = ['', '']; this.you = 0;
    this.drag = null; this.hover = null; this.remote = null; this.lastAimSent = 0;
    this.running = false;
    this.bindInput();
    new ResizeObserver(() => this.resize()).observe($('stage'));
    window.addEventListener('resize', () => this.resize());
  }

  init(room) {
    this.cfg = room.cfg; this.you = room.you; this.names = room.names;
    this.r.setConfig(room.cfg); this.r.setTable(settings.table); this.r.setQuality(settings.quality);
    this.snaps = []; this.pending = []; this.sinks = []; this.drag = null; this.remote = null; this.hover = null;
    this.s = { phase: 'aiming', turn: 0, groups: [null, null], onTable: [], remaining: [null, null], pocketed: [], balls: new Array(16).fill(null) };
    this.resize();
  }
  resize() {
    if (!this.cfg) return;
    const st = $('stage'), cs = getComputedStyle(st);
    const w = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (w > 50 && h > 50) this.r.fit(w, h);
  }
  applySettings() { if (this.cfg) { this.r.setTable(settings.table); this.r.setQuality(settings.quality); } }

  start() { if (!this.running) { this.running = true; requestAnimationFrame((t) => this.frame(t)); } }
  stop() { this.running = false; }

  // ---------- data ze serveru ----------
  onState(s) {
    if (!s || !Array.isArray(s.balls)) return;
    const prev = this.s;
    this.s = s;
    this.snaps.push({ t: performance.now(), b: s.balls });
    this.remote = null;
    if (s.phase !== 'aiming' && s.phase !== 'placing') this.cancelDrag();
    if (prev && (prev.phase !== s.phase || prev.turn !== s.turn) && s.turn === this.you && (s.phase === 'aiming' || s.phase === 'placing') && s.phase !== 'over') audio.ui();
    updateHud(this);
  }
  onSnap(m) {
    if (!m || !Array.isArray(m.b)) return;
    const now = performance.now();
    this.snaps.push({ t: now, b: m.b });
    const delay = this.delay();
    for (const ev of m.ev || []) this.pending.push({ due: now + delay, ev });
    if (this.snaps.length > 80) this.snaps.splice(0, this.snaps.length - 80);
  }
  onRemoteAim(m) {
    this.remote = m.on ? { ...m, t: performance.now() } : null;
  }
  delay() { return settings.quality === 'low' ? 0 : INTERP_MS; }

  // ---------- smyčka ----------
  interp(rt) {
    const S = this.snaps;
    while (S.length > 2 && S[1].t <= rt) S.shift();
    if (!S.length) return new Array(16).fill(null);
    if (S.length === 1 || rt <= S[0].t) return S[0].b;
    const a = S[0], b = S[1];
    if (rt >= b.t) return b.b;
    const f = (rt - a.t) / (b.t - a.t);
    return a.b.map((p, i) => { const q = b.b[i]; if (!p || !q) return p || q; return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]; });
  }

  frame(now) {
    if (!this.running) return;
    requestAnimationFrame((t) => this.frame(t));
    if (!this.cfg) return;
    // události (zvuky, zapadnutí) ve chvíli, kdy na ně dojde v interpolované časové ose
    const rest = [];
    for (const p of this.pending) {
      if (p.due > now) { rest.push(p); continue; }
      const e = p.ev;
      if (e.k === 'hit') audio.hit(e.v); else if (e.k === 'rail') audio.rail(e.v); else if (e.k === 'cue') audio.cue(e.v);
      else if (e.k === 'pocket') { audio.pocket(); this.sinks.push({ id: e.id, fx: e.x, fy: e.y, px: e.px, py: e.py, t0: now, dur: settings.quality === 'low' ? 150 : 420 }); }
    }
    this.pending = rest;
    this.sinks = this.sinks.filter((s) => now - s.t0 < s.dur);

    const pos = this.interp(now - this.delay());
    const s = this.s, mine = s.turn === this.you;
    let aim = null, ghost = null;
    if (s.phase === 'aiming' && pos[0]) {
      if (mine && this.drag && this.drag.active) aim = { a: this.drag.a, p: this.drag.p };
      else if (!mine && this.remote && this.remote.on && now - this.remote.t < 1500) aim = { a: this.remote.a, p: this.remote.p };
    }
    if (s.phase === 'placing') {
      if (mine && this.hover) ghost = { x: this.hover.x, y: this.hover.y, valid: this.hover.valid };
      else if (!mine && this.remote && this.remote.on && now - this.remote.t < 1500) ghost = { x: this.remote.x, y: this.remote.y, valid: true };
    }
    this.r.draw({ pos, sinks: this.sinks.map((k) => ({ ...k, p: (now - k.t0) / k.dur })), aim, ghost, mine: mine });
    this.cv.style.cursor = mine && s.phase === 'placing' ? 'none' : mine && s.phase === 'aiming' ? 'crosshair' : 'default';
  }

  // ---------- ovládání ----------
  validPlace(x, y) {
    const { R, W, H, POCKETS } = this.cfg;
    if (x < R || x > W - R || y < R || y > H - R) return false;
    for (const p of POCKETS) if (Math.hypot(x - p.x, y - p.y) < p.r + R * 0.6) return false;
    const pos = this.snaps.length ? this.snaps[this.snaps.length - 1].b : [];
    for (let id = 1; id < 16; id++) { const o = pos[id]; if (o && Math.hypot(x - o[0], y - o[1]) < 2 * R + 0.5) return false; }
    return true;
  }
  cuePos() { const b = this.snaps.length ? this.snaps[this.snaps.length - 1].b : null; return b && b[0]; }

  sendAim(d, force) {
    const now = performance.now();
    if (!force && now - this.lastAimSent < 50) return;
    this.lastAimSent = now; this.net.emit('aim', d);
  }

  cancelDrag() {
    if (this.drag && this.drag.active) { this.net.emit('aim', { on: false }); }
    this.drag = null; this.setPower(0, false);
  }
  setPower(p, on) {
    $('power').classList.toggle('on', on);
    $('power-fill').style.height = Math.round(p * 100) + '%';
    $('power-txt').textContent = Math.round(p * 100) + '%';
  }

  bindInput() {
    const cv = this.cv;
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); this.cancelDrag(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.cancelDrag(); });

    cv.addEventListener('pointerdown', (e) => {
      if (!this.cfg || !this.s || this.s.turn !== this.you || e.button === 2) return;
      audio.unlock();
      const t = this.r.toTable(e);
      if (this.s.phase === 'aiming') {
        const c = this.cuePos();
        if (c && Math.hypot(t.x - c[0], t.y - c[1]) < GRAB) {
          this.drag = { active: true, a: 0, p: 0, id: e.pointerId };
          cv.setPointerCapture(e.pointerId);
          this.updateDrag(t, c);
        }
      } else if (this.s.phase === 'placing') {
        this.hover = { x: t.x, y: t.y, valid: this.validPlace(t.x, t.y) };
        this.placing = e.pointerId; cv.setPointerCapture(e.pointerId);
      }
    });

    cv.addEventListener('pointermove', (e) => {
      if (!this.cfg || !this.s || this.s.turn !== this.you) return;
      const t = this.r.toTable(e);
      if (this.s.phase === 'aiming' && this.drag && this.drag.active) {
        const c = this.cuePos(); if (c) this.updateDrag(t, c);
      } else if (this.s.phase === 'placing') {
        this.hover = { x: t.x, y: t.y, valid: this.validPlace(t.x, t.y) };
        this.sendAim({ x: t.x, y: t.y, on: true });
      }
    });

    const up = (e) => {
      if (!this.cfg || !this.s) return;
      if (this.drag && this.drag.active && this.s.phase === 'aiming') {
        const d = this.drag; this.drag = null; this.setPower(0, false);
        this.net.emit('aim', { on: false });
        if (d.p >= 0.03) this.net.emit('shoot', { a: d.a, p: d.p });
      } else if (this.s.phase === 'placing' && this.s.turn === this.you && this.placing === e.pointerId) {
        this.placing = null;
        const t = this.r.toTable(e);
        if (this.validPlace(t.x, t.y)) { this.net.emit('place', { x: t.x, y: t.y }); this.hover = null; }
        else toast('Sem bílou kouli položit nelze.', 'foul');
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', () => this.cancelDrag());
    cv.addEventListener('pointerleave', () => { if (this.s && this.s.phase === 'placing') this.hover = null; });
  }

  updateDrag(t, c) {
    const vx = t.x - c[0], vy = t.y - c[1], dist = Math.hypot(vx, vy);
    if (dist < MIN_PULL) { this.drag.p = 0; this.setPower(0, true); return; }
    this.drag.a = Math.atan2(-vy, -vx);                      // úder míří opačně než tah
    this.drag.p = Math.min(1, (dist - MIN_PULL) / (MAX_PULL - MIN_PULL));
    this.setPower(this.drag.p, true);
    this.sendAim({ a: this.drag.a, p: this.drag.p, on: true });
  }
}

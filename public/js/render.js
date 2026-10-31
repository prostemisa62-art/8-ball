// Vykreslování stolu, koulí a zaměřovače na HTML5 Canvas.
// Statická vrstva (stůl) i sprity koulí se předrenderují při změně velikosti/barvy.
export const FRAME = 70;           // šířka dřevěného rámu + mantinelu (jednotky stolu)
const CUSHION = 24;
const TAU = Math.PI * 2;
export const BALL_COLORS = { 1: '#f4c20d', 2: '#1b4fd8', 3: '#d6281f', 4: '#6a2fa0', 5: '#f07a12', 6: '#12894a', 7: '#8a1c1c', 8: '#111111' };
export const TABLES = {
  green: ['#2f9460', '#0e4a2b', '#1f6b43'], blue: ['#3a7fc2', '#133f6e', '#26598f'], red: ['#c0414a', '#661319', '#8f2a31'],
  purple: ['#8a58b5', '#3f1f5c', '#63388a'], gray: ['#7a828e', '#333840', '#555c68'],
};
const QUALITY = { low: { dpr: 1, shadow: false }, medium: { dpr: 1.5, shadow: true }, high: { dpr: 2, shadow: true } };

const canvas2d = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

export class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.cfg = null; this.table = 'green'; this.quality = 'high'; this.k = 1;
    this.cssW = 0; this.cssH = 0; this.last = null;
  }
  setConfig(cfg) { this.cfg = cfg; this.TW = cfg.W + FRAME * 2; this.TH = cfg.H + FRAME * 2; if (this.cssW) this.build(); }
  setTable(t) { this.table = TABLES[t] ? t : 'green'; if (this.cfg && this.cssW) this.buildStatic(); }
  setQuality(q) { this.quality = QUALITY[q] ? q : 'high'; if (this.cssW) this.fit(this.availW, this.availH); }

  /** Přizpůsobí canvas dostupné ploše – celý stůl je vždy vidět. */
  fit(w, h) {
    if (!this.cfg) return;
    this.availW = w; this.availH = h;
    const s = Math.min(w / this.TW, h / this.TH);
    this.cssW = Math.max(100, Math.floor(this.TW * s)); this.cssH = Math.max(60, Math.floor(this.TH * s));
    const dpr = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].dpr);
    this.cv.style.width = this.cssW + 'px'; this.cv.style.height = this.cssH + 'px';
    this.cv.width = Math.round(this.cssW * dpr); this.cv.height = Math.round(this.cssH * dpr);
    this.k = this.cv.width / this.TW;
    this.build();
  }
  build() { this.buildStatic(); this.buildSprites(); }

  // ---------- statická vrstva ----------
  buildStatic() {
    const { cfg, k } = this, W = cfg.W, H = cfg.H;
    const c = canvas2d(this.cv.width, this.cv.height), g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    const [light, dark, mid] = TABLES[this.table];

    // dřevěný rám
    const wood = g.createLinearGradient(0, 0, this.TW, this.TH);
    wood.addColorStop(0, '#6b4528'); wood.addColorStop(0.5, '#4a2d18'); wood.addColorStop(1, '#2d1a0d');
    rrect(g, 0, 0, this.TW, this.TH, 30); g.fillStyle = wood; g.fill();
    g.save(); rrect(g, 0, 0, this.TW, this.TH, 30); g.clip();
    for (let i = 0; i < 160; i++) {          // kresba dřeva
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? '20,10,4' : '150,100,60'},${0.05 + Math.random() * 0.07})`;
      g.lineWidth = 0.4 + Math.random() * 1.4;
      const y = Math.random() * this.TH; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(this.TW * 0.3, y + 6 * Math.random(), this.TW * 0.7, y - 6 * Math.random(), this.TW, y + 4 * (Math.random() - 0.5)); g.stroke();
    }
    g.restore();
    rrect(g, 3, 3, this.TW - 6, this.TH - 6, 28); g.strokeStyle = 'rgba(255,220,170,.18)'; g.lineWidth = 2; g.stroke();

    // mantinely (pryž)
    const cx = FRAME - CUSHION, cy = FRAME - CUSHION;
    rrect(g, cx, cy, W + CUSHION * 2, H + CUSHION * 2, 12);
    g.fillStyle = dark; g.fill();
    const hl = g.createLinearGradient(0, cy, 0, cy + CUSHION);
    hl.addColorStop(0, 'rgba(255,255,255,.12)'); hl.addColorStop(1, 'rgba(0,0,0,.25)');
    rrect(g, cx, cy, W + CUSHION * 2, H + CUSHION * 2, 12); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.stroke();

    // sukno
    const cloth = g.createRadialGradient(FRAME + W / 2, FRAME + H / 2, 40, FRAME + W / 2, FRAME + H / 2, W * 0.62);
    cloth.addColorStop(0, light); cloth.addColorStop(1, mid);
    g.fillStyle = cloth; g.fillRect(FRAME, FRAME, W, H);
    g.save(); g.beginPath(); g.rect(FRAME, FRAME, W, H); g.clip();
    for (let i = 0; i < 2600; i++) {         // jemné vlákno sukna
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`;
      g.fillRect(FRAME + Math.random() * W, FRAME + Math.random() * H, 1.4, 1.4);
    }
    g.restore();
    // vnitřní stín mantinelu
    const sh = 14;
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, FRAME, 0, FRAME + sh, FRAME, FRAME, W, sh], [0, FRAME + H, 0, FRAME + H - sh, FRAME, FRAME + H - sh, W, sh]]) {
      const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(rx, ry, rw, rh);
    }
    for (const [x0, x1, rx] of [[FRAME, FRAME + sh, FRAME], [FRAME + W, FRAME + W - sh, FRAME + W - sh]]) {
      const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(rx, FRAME, sh, H);
    }

    // zaváděcí čára a body
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(FRAME + cfg.HEAD_X, FRAME + 6); g.lineTo(FRAME + cfg.HEAD_X, FRAME + H - 6); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.22)';
    for (const x of [cfg.HEAD_X, cfg.FOOT_X]) { g.beginPath(); g.arc(FRAME + x, FRAME + H / 2, 3, 0, TAU); g.fill(); }

    // diamanty na rámu
    g.fillStyle = '#e9dcc0';
    const dia = (x, y) => { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-3.2, -3.2, 6.4, 6.4); g.restore(); };
    const off = (FRAME - CUSHION) / 2 + 1;
    for (let i = 1; i < 8; i++) if (i !== 4) { dia(FRAME + (W * i) / 8, off); dia(FRAME + (W * i) / 8, this.TH - off); }
    for (let i = 1; i < 4; i++) { dia(off, FRAME + (H * i) / 4); dia(this.TW - off, FRAME + (H * i) / 4); }

    // díry
    for (const p of cfg.POCKETS) {
      const px = FRAME + p.x, py = FRAME + p.y, r = p.r * 0.86;
      g.beginPath(); g.arc(px, py, r + 5, 0, TAU); g.fillStyle = '#1a1208'; g.fill();
      const gr = g.createRadialGradient(px, py, r * 0.1, px, py, r);
      gr.addColorStop(0, '#000'); gr.addColorStop(0.75, '#050505'); gr.addColorStop(1, '#201a14');
      g.beginPath(); g.arc(px, py, r, 0, TAU); g.fillStyle = gr; g.fill();
      g.beginPath(); g.arc(px, py, r + 5, 0, TAU); g.strokeStyle = 'rgba(200,160,90,.35)'; g.lineWidth = 2; g.stroke();
    }
    this.statik = c;
  }

  // ---------- sprity koulí ----------
  buildSprites() {
    const { k } = this, R = this.cfg.R, pad = 3 * k, size = Math.ceil(2 * R * k + pad * 2);
    this.spr = [];
    for (let id = 0; id < 16; id++) {
      const c = canvas2d(size, size), g = c.getContext('2d'), cx = size / 2, cy = size / 2, r = R * k;
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip();
      g.fillStyle = id === 0 || id > 8 ? '#f5f1e6' : BALL_COLORS[id]; g.fillRect(0, 0, size, size);
      if (id > 8) { g.fillStyle = BALL_COLORS[id - 8]; g.fillRect(cx - r, cy - r * 0.54, 2 * r, r * 1.08); }
      if (id > 0) {
        g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, r * 0.46, 0, TAU); g.fill();
        g.fillStyle = '#111'; g.font = `700 ${Math.round(r * 0.62)}px system-ui, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(id), cx, cy + r * 0.04);
      }
      const sd = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.05);
      sd.addColorStop(0, 'rgba(255,255,255,.5)'); sd.addColorStop(0.3, 'rgba(255,255,255,0)'); sd.addColorStop(0.6, 'rgba(0,0,0,0)'); sd.addColorStop(1, 'rgba(0,0,0,.6)');
      g.fillStyle = sd; g.fillRect(0, 0, size, size);
      g.restore();
      const sp = g.createRadialGradient(cx - r * 0.38, cy - r * 0.42, 0, cx - r * 0.38, cy - r * 0.42, r * 0.28);
      sp.addColorStop(0, 'rgba(255,255,255,.95)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sp; g.beginPath(); g.arc(cx - r * 0.38, cy - r * 0.42, r * 0.28, 0, TAU); g.fill();
      g.beginPath(); g.arc(cx, cy, r - 0.5, 0, TAU); g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = Math.max(1, k * 0.6); g.stroke();
      this.spr[id] = c;
    }
    const sh = canvas2d(size, size), g = sh.getContext('2d'), cx = size / 2, cy = size / 2, r = R * k;
    const gr = g.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.15);
    gr.addColorStop(0, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    this.shadowSpr = sh;
  }

  blit(img, x, y, scale = 1, alpha = 1) {      // x,y v souřadnicích stolu
    const g = this.ctx, w = img.width * scale;
    g.globalAlpha = alpha;
    g.drawImage(img, (x + FRAME) * this.k - w / 2, (y + FRAME) * this.k - w / 2, w, w);
    g.globalAlpha = 1;
  }

  // ---------- snímek ----------
  /**
   * fs: { pos[16]: [x,y]|null, sinks: [{id,fx,fy,px,py,p(0..1)}], aim: {a,p,x,y}|null,
   *       ghost: {x,y,valid}|null, mine: bool }
   */
  draw(fs) {
    const g = this.ctx, k = this.k, cfg = this.cfg;
    if (!cfg || !this.statik) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.statik, 0, 0);
    const shadows = QUALITY[this.quality].shadow;

    if (shadows) {
      for (let id = 0; id < 16; id++) { const p = fs.pos[id]; if (p) this.blit(this.shadowSpr, p[0] + 3, p[1] + 5); }
    }
    g.setTransform(k, 0, 0, k, FRAME * k, FRAME * k);
    if (fs.aim && fs.pos[0]) this.drawAim(fs.pos, fs.aim, fs.mine);
    g.setTransform(1, 0, 0, 1, 0, 0);

    if (fs.ghost) {
      this.blit(this.spr[0], fs.ghost.x, fs.ghost.y, 1, fs.ghost.valid ? 0.75 : 0.35);
      g.setTransform(k, 0, 0, k, FRAME * k, FRAME * k);
      g.beginPath(); g.arc(fs.ghost.x, fs.ghost.y, cfg.R + 2, 0, TAU);
      g.strokeStyle = fs.ghost.valid ? 'rgba(61,220,132,.9)' : 'rgba(255,92,92,.9)'; g.lineWidth = 2; g.stroke();
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    for (let id = 15; id >= 0; id--) { const p = fs.pos[id]; if (p) this.blit(this.spr[id], p[0], p[1]); }
    for (const s of fs.sinks) {              // zapadávající koule
      const e = s.p * s.p, x = s.fx + (s.px - s.fx) * e, y = s.fy + (s.py - s.fy) * e;
      this.blit(this.spr[s.id], x, y, 1 - 0.45 * s.p, 1 - s.p * 0.9);
    }
    if (fs.aim && fs.pos[0]) {               // hrací tágo nad koulemi
      g.setTransform(k, 0, 0, k, FRAME * k, FRAME * k);
      this.drawCue(fs.pos[0], fs.aim);
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  trace(cue, a, pos) {
    const { R, W, H } = this.cfg, dx = Math.cos(a), dy = Math.sin(a);
    let best = { t: Infinity, id: -1 };
    const cand = (t) => { if (t > 0 && t < best.t) best = { t, id: -1 }; };
    if (dx > 1e-9) cand((W - R - cue[0]) / dx); else if (dx < -1e-9) cand((R - cue[0]) / dx);
    if (dy > 1e-9) cand((H - R - cue[1]) / dy); else if (dy < -1e-9) cand((R - cue[1]) / dy);
    for (let id = 1; id < 16; id++) {
      const o = pos[id]; if (!o) continue;
      const fx = o[0] - cue[0], fy = o[1] - cue[1], proj = fx * dx + fy * dy;
      if (proj <= 0) continue;
      const perp2 = fx * fx + fy * fy - proj * proj;
      if (perp2 >= 4 * R * R) continue;
      const t = proj - Math.sqrt(4 * R * R - perp2);
      if (t < best.t) best = { t, id };
    }
    return best;
  }

  drawAim(pos, aim, mine) {
    const g = this.ctx, R = this.cfg.R, cue = pos[0], a = aim.a;
    const hit = this.trace(cue, a, pos);
    const ex = cue[0] + Math.cos(a) * hit.t, ey = cue[1] + Math.sin(a) * hit.t;
    g.save();
    g.lineCap = 'round';
    g.setLineDash([9, 8]); g.strokeStyle = mine ? 'rgba(255,255,255,.75)' : 'rgba(255,220,120,.6)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cue[0], cue[1]); g.lineTo(ex, ey); g.stroke();
    g.setLineDash([]);
    g.beginPath(); g.arc(ex, ey, R, 0, TAU); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1.6; g.stroke();
    if (hit.id > 0) {
      const o = pos[hit.id], nx = (o[0] - ex) / (2 * R), ny = (o[1] - ey) / (2 * R);
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(o[0], o[1]); g.lineTo(o[0] + nx * 70, o[1] + ny * 70); g.stroke();
      const dx = Math.cos(a), dy = Math.sin(a), dn = dx * nx + dy * ny;
      let tx = dx - dn * nx, ty = dy - dn * ny; const tl = Math.hypot(tx, ty);
      if (tl > 0.05) { tx /= tl; ty /= tl; g.strokeStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + tx * 45 * tl, ey + ty * 45 * tl); g.stroke(); }
    }
    g.restore();
  }

  drawCue(cue, aim) {
    const g = this.ctx, R = this.cfg.R, gap = R + 5 + aim.p * 150, L = 380;
    g.save(); g.translate(cue[0], cue[1]); g.rotate(aim.a);
    const gr = g.createLinearGradient(-gap, 0, -gap - L, 0);
    gr.addColorStop(0, '#e9d3a7'); gr.addColorStop(0.55, '#b98445'); gr.addColorStop(0.56, '#2a1a10'); gr.addColorStop(1, '#120a05');
    g.beginPath(); g.moveTo(-gap, -1.8); g.lineTo(-gap - L, -4.2); g.lineTo(-gap - L, 4.2); g.lineTo(-gap, 1.8); g.closePath();
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 6; g.shadowOffsetY = 4; g.fillStyle = gr; g.fill();
    g.shadowColor = 'transparent';
    g.fillStyle = '#5ab0e8'; g.fillRect(-gap - 3, -1.9, 3, 3.8);     // křída
    g.fillStyle = '#f2efe6'; g.fillRect(-gap - 9, -2.05, 6, 4.1);    // trubička
    g.restore();
  }

  /** Souřadnice události v prostoru stolu. */
  toTable(ev) {
    const r = this.cv.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * this.TW - FRAME, y: ((ev.clientY - r.top) / r.height) * this.TH - FRAME };
  }
}

function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

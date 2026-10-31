// Zvuky i hudba se generují přímo v prohlížeči (Web Audio) – žádné stahované soubory.
import { settings } from './settings.js';

let ctx = null, master, sfx, music, noiseBuf, musicTimer = null, chordIdx = 0;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.connect(master);
    music = ctx.createGain(); music.gain.value = 0.22; music.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    refresh();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return true;
}

function noise({ dur, freq, q = 1, gain, type = 'bandpass' }) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfx);
  src.start(t, Math.random() * 0.5, dur + 0.02);
}
function tone({ freq, to, dur, gain, type = 'sine' }) {
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfx); o.start(t); o.stop(t + dur + 0.02);
}
const lvl = (v, max) => Math.min(1, Math.max(0.08, v / max));

const CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
function playChord() {
  if (!ctx || !settings.music) return;
  const t = ctx.currentTime, ch = CHORDS[chordIdx++ % CHORDS.length];
  for (const f of ch) {
    for (const det of [-4, 4]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = det;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.6);
      o.connect(lp).connect(g).connect(music); o.start(t); o.stop(t + 4.8);
    }
  }
}

export const audio = {
  unlock() { ensure(); },
  refresh,
  hit(v) { if (!ready()) return; const l = lvl(v, 600); noise({ dur: 0.05, freq: 3000 + Math.random() * 1200, q: 2, gain: 0.55 * l }); tone({ freq: 1800, to: 1100, dur: 0.045, gain: 0.22 * l, type: 'triangle' }); },
  rail(v) { if (!ready()) return; const l = lvl(v, 700); tone({ freq: 170, to: 70, dur: 0.13, gain: 0.55 * l }); noise({ dur: 0.08, freq: 600, q: 0.8, gain: 0.3 * l, type: 'lowpass' }); },
  pocket() { if (!ready()) return; tone({ freq: 120, to: 55, dur: 0.28, gain: 0.55 }); noise({ dur: 0.4, freq: 1000, q: 0.7, gain: 0.3, type: 'lowpass' }); },
  cue(v) { if (!ready()) return; const l = lvl(v, 1800); noise({ dur: 0.035, freq: 4500, q: 1.5, gain: 0.6 * l }); tone({ freq: 950, to: 500, dur: 0.06, gain: 0.25 * l, type: 'square' }); },
  ui() { if (!ready()) return; tone({ freq: 660, to: 880, dur: 0.06, gain: 0.12, type: 'triangle' }); },
  foul() { if (!ready()) return; tone({ freq: 220, to: 150, dur: 0.25, gain: 0.25, type: 'sawtooth' }); },
};
const ready = () => settings.sound && ensure();

function refresh() {
  if (!ctx) return;
  master.gain.value = settings.volume;
  if (settings.music && !musicTimer) { playChord(); musicTimer = setInterval(playChord, 4000); }
  if (!settings.music && musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

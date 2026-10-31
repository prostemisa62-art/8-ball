import { BALL_COLORS } from './render.js';
import { audio } from './audio.js';

const $ = (id) => document.getElementById(id);
export { $ };

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
}
export const show = (id) => $(id).classList.remove('hidden');
export const hide = (id) => $(id).classList.add('hidden');

export function toast(text, type = 'info') {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type; el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  if (type === 'foul') audio.foul();
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4700);
}

const GROUP_LABEL = { solid: 'Plné koule (1–7)', stripe: 'Pruhované koule (9–15)' };
function dot(id, out) {
  const d = document.createElement('span');
  d.className = 'dot' + (out ? ' out' : '');
  if (id < 9) d.style.background = BALL_COLORS[id];
  else d.style.background = `linear-gradient(180deg,#f5f1e6 0 22%,${BALL_COLORS[id - 8]} 22% 78%,#f5f1e6 78%)`;
  return d;
}

export function updateHud(g) {
  const s = g.s;
  for (let i = 0; i < 2; i++) {
    const card = $('pc' + i), grp = s.groups[i];
    card.querySelector('.n').textContent = g.names[i] || '—';
    card.querySelector('em').textContent = i === g.you ? 'TY' : '';
    card.classList.toggle('active', s.turn === i && s.phase !== 'over');
    const tray = card.querySelector('.tray'); tray.textContent = '';
    if (grp) {
      const ids = grp === 'solid' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
      ids.forEach((id) => tray.appendChild(dot(id, !s.onTable.includes(id))));
      const left = s.remaining[i];
      card.querySelector('.pgroup').textContent = `${GROUP_LABEL[grp]} · zbývá ${left}${left === 0 ? ' → osmička!' : ''}`;
    } else {
      for (let k = 0; k < 7; k++) { const d = document.createElement('span'); d.className = 'dot unk'; tray.appendChild(d); }
      card.querySelector('.pgroup').textContent = 'Skupina zatím neurčena';
    }
  }
  const me = s.turn === g.you, n = g.names[s.turn];
  let t = '';
  if (s.phase === 'moving') t = 'Koule se pohybují…';
  else if (s.phase === 'placing') t = me ? 'Umísti bílou kouli kamkoliv na stůl (klikni)' : `${n} umisťuje bílou kouli`;
  else if (s.phase === 'aiming') t = me ? 'Jsi na tahu' : `Na tahu: ${n}`;
  else if (s.phase === 'over') t = 'Konec hry';
  $('turn-info').textContent = t;
}

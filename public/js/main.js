import { connect } from './net.js';
import { ClientGame } from './game.js';
import { audio } from './audio.js';
import { settings, update, onSettings, getName, setName, session } from './settings.js';
import { TABLES } from './render.js';
import { $, show, hide, showScreen, toast, updateHud } from './ui.js';

let socket = null, game = null, inRoom = false, oppTimer = null, roomCode = null;
const nameVal = () => { const n = $('name').value.trim().slice(0, 16); setName(n); return n; };

// ---------- NASTAVENÍ ----------
function buildSettings() {
  $('set-sound').checked = settings.sound; $('set-music').checked = settings.music;
  $('set-volume').value = settings.volume; $('set-quality').value = settings.quality;
  const box = $('set-table'); box.textContent = '';
  for (const [key, [light, dark]] of Object.entries(TABLES)) {
    const b = document.createElement('button');
    b.className = 'sw' + (settings.table === key ? ' sel' : ''); b.title = key; b.setAttribute('aria-label', 'Stůl ' + key);
    b.style.background = `radial-gradient(circle at 35% 30%, ${light}, ${dark})`;
    b.onclick = () => { update({ table: key }); buildSettings(); };
    box.appendChild(b);
  }
}
$('set-sound').onchange = (e) => update({ sound: e.target.checked });
$('set-music').onchange = (e) => { audio.unlock(); update({ music: e.target.checked }); };
$('set-volume').oninput = (e) => update({ volume: Number(e.target.value) });
$('set-quality').onchange = (e) => update({ quality: e.target.value });
onSettings(() => { audio.refresh(); if (game) game.applySettings(); });

document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => { audio.ui(); b.closest('.overlay').classList.add('hidden'); }));
$('btn-how').onclick = () => { audio.unlock(); audio.ui(); show('ov-how'); };
$('btn-settings').onclick = () => { audio.unlock(); buildSettings(); show('ov-settings'); };

// ---------- MENU ----------
function needConn() { if (socket && socket.connected) return true; $('conn-state').textContent = 'Server není dostupný, zkouším se připojit…'; return false; }
function resetToMenu() {
  inRoom = false; roomCode = null; session.clear();
  if (game) { game.stop(); game.cancelDrag(); }
  ['ov-over', 'ov-opp', 'ov-msg', 'ov-conn'].forEach(hide);
  clearInterval(oppTimer); showScreen('menu');
}
$('btn-online').onclick = () => { audio.unlock(); audio.ui(); if (!needConn()) return; socket.emit('queue', { name: nameVal() }); };
$('btn-queue-cancel').onclick = () => { socket.emit('queue:cancel'); showScreen('menu'); };
$('btn-create').onclick = () => { audio.unlock(); audio.ui(); if (!needConn()) return; socket.emit('create', { name: nameVal() }); };
$('btn-wait-cancel').onclick = () => { socket.emit('leave'); resetToMenu(); };
$('btn-copy').onclick = async () => {
  const code = $('room-code').textContent;
  try { await navigator.clipboard.writeText(code); } catch {
    const r = document.createRange(); r.selectNodeContents($('room-code')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy'); s.removeAllRanges();
  }
  $('btn-copy').textContent = 'ZKOPÍROVÁNO ✓'; setTimeout(() => ($('btn-copy').textContent = 'KOPÍROVAT KÓD'), 1600);
};
$('btn-join').onclick = () => { audio.unlock(); audio.ui(); $('join-error').textContent = ''; $('join-code').value = ''; showScreen('join'); setTimeout(() => $('join-code').focus(), 50); };
$('btn-join-back').onclick = () => showScreen('menu');
$('join-code').oninput = (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); $('join-error').textContent = ''; };
$('join-code').onkeydown = (e) => { if (e.key === 'Enter') $('btn-join-go').click(); };
$('btn-join-go').onclick = () => {
  const code = $('join-code').value;
  if (code.length !== 6) { $('join-error').textContent = 'Kód musí mít 6 číslic.'; return; }
  if (!needConn()) { $('join-error').textContent = 'Server není dostupný.'; return; }
  socket.emit('join', { code, name: nameVal() });
};
$('name').value = getName();

// ---------- HRA ----------
$('btn-leave').onclick = () => { if (confirm('Opravdu chceš opustit hru? Soupeř získá vítězství.')) { socket.emit('leave'); resetToMenu(); } };
$('btn-opp-leave').onclick = () => { socket.emit('leave'); resetToMenu(); };
$('btn-over-menu').onclick = () => { socket.emit('leave'); resetToMenu(); };
$('btn-msg-ok').onclick = resetToMenu;
$('btn-rematch').onclick = () => { socket.emit('rematch'); $('btn-rematch').disabled = true; $('btn-rematch').textContent = 'ČEKÁM NA SOUPEŘE…'; };

function bindSocket() {
  socket.on('connect', () => {
    $('conn-state').textContent = 'Připojeno k serveru ✓';
    hide('ov-conn');
    const s = session.get();
    if (s) socket.emit('rejoin', s);
  });
  socket.on('disconnect', () => { $('conn-state').textContent = 'Spojení ztraceno…'; if (inRoom) show('ov-conn'); });
  socket.on('connect_error', () => { $('conn-state').textContent = 'Server není dostupný, zkouším se připojit…'; });

  socket.on('queued', () => showScreen('queue'));
  socket.on('err', (m) => { if (m.where === 'join') $('join-error').textContent = m.message; else toast(m.message, 'foul'); });

  socket.on('room', (r) => {
    inRoom = true; roomCode = r.code; session.set({ code: r.code, token: r.token });
    if (!r.started) { $('room-code').textContent = r.code; showScreen('wait'); return; }
    hide('ov-over'); hide('ov-opp'); hide('ov-conn');
    $('btn-rematch').disabled = false; $('btn-rematch').textContent = 'ODVETA';
    showScreen('game'); game.init(r); game.start();
    updateHud(game);
  });
  socket.on('state', (s) => game && game.onState(s));
  socket.on('snap', (m) => game && game.onSnap(m));
  socket.on('aim', (m) => game && game.onRemoteAim(m));
  socket.on('notice', (n) => { if (inRoom) toast(n.text, n.type); });

  socket.on('opp', (m) => {
    clearInterval(oppTimer);
    if (m.online) { hide('ov-opp'); toast('Soupeř je zpět.', 'good'); return; }
    let left = m.grace || 120; $('opp-sec').textContent = left; show('ov-opp');
    oppTimer = setInterval(() => { left = Math.max(0, left - 1); $('opp-sec').textContent = left; }, 1000);
  });
  socket.on('gameover', (m) => {
    $('over-title').textContent = m.winner === game.you ? '🏆 Vítězství!' : 'Prohra';
    $('over-reason').textContent = m.reason || '';
    $('btn-rematch').disabled = false; $('btn-rematch').textContent = 'ODVETA';
    setTimeout(() => show('ov-over'), 700);
  });
  socket.on('rematch', (m) => { if (m.votes[1 - game.you] && !m.votes[game.you]) $('over-reason').textContent += ' Soupeř chce odvetu.'; });
  socket.on('closed', (m) => {
    inRoom = false; session.clear();
    if (m.silent) { resetToMenu(); return; }
    if (game) game.stop();
    ['ov-opp', 'ov-over', 'ov-conn'].forEach(hide);
    $('msg-title').textContent = m.win ? '🏆 Vítězství' : 'Hra ukončena';
    $('msg-text').textContent = m.reason || '';
    show('ov-msg');
  });
}

(async function init() {
  game = new ClientGame({ emit: (ev, d) => socket && socket.emit(ev, d) });
  try {
    socket = await connect();
    bindSocket();
  } catch (e) {
    $('conn-state').textContent = 'Nepodařilo se spojit se serverem. Zkontroluj config.js / adresu backendu.';
  }
})();

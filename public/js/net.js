// Načte klientskou knihovnu Socket.IO z backendu a vytvoří spojení.
const base = (window.BILLIARDS_SERVER_URL || '').replace(/\/$/, '');

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Nelze načíst ' + src));
    document.head.appendChild(s);
  });
}

export async function connect() {
  await loadScript(`${base}/socket.io/socket.io.js`);
  // eslint-disable-next-line no-undef
  return io(base || undefined, { transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 3000 });
}

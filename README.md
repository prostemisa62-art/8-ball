# Kulečník 8-ball online

2D kulečník (8-ball) pro dva hráče v prohlížeči. Server je autoritativní: počítá fyziku i pravidla, klienti posílají jen úmysl (úder / umístění bílé).

## Spuštění lokálně

```bash
npm install
npm start          # http://localhost:3000
```

Otevři adresu ve dvou oknech (nebo na dvou počítačích v síti, `http://IP-počítače:3000`), v jednom dej **VYTVOŘIT MÍSTNOST**, ve druhém **PŘIPOJIT SE K MÍSTNOSTI** a zadej šestimístný kód. **HRÁT ONLINE** spáruje dva čekající hráče.

Testy (bez nutnosti instalace): `node test/sim.test.js && node test/net.test.js`

## Nasazení na internet (aby hráli lidé z různých sítí)

Server obsluhuje i frontend, takže stačí nasadit jedinou službu Node.js.

- **Render.com** (zdarma): nahraj projekt na GitHub → *New > Blueprint* (použije `render.yaml`). Výsledná adresa `https://…onrender.com` je hra. Free plán usíná, první načtení může trvat ~1 min.
- **Railway / Fly.io / VPS**: `npm install && npm start`, port se bere z proměnné `PORT`. K dispozici je i `Dockerfile`.
- Hosting musí podporovat WebSocket (výše uvedené ano). Pokud běží za proxy, povol WebSocket / sticky spojení.

### Frontend a backend zvlášť

1. Backend nasaď jako výše, nastav `CORS_ORIGIN=https://adresa-tveho-frontendu` (více adres oddělených čárkou).
2. Do `public/config.js` napiš `window.BILLIARDS_SERVER_URL = 'https://adresa-backendu';` a složku `public/` nahraj na libovolný statický hosting (Netlify, GitHub Pages…).

## Struktura

```
server/physics.js   fyzika koulí (vlastní, pevný krok 1/240 s), díry, rozestavění
server/rules.js     pravidla 8-ball (čistá funkce)
server/game.js      autoritativní stav partie, smyčka simulace, snímky pozic
server/rooms.js     místnosti, kódy, párování, znovupřipojení (token, 120 s)
server/network.js   Socket.IO události, validace vstupů
server/index.js     Express + Socket.IO
public/             frontend (index.html, css/, js/: render, game, audio, ui, main)
test/               testy fyziky, pravidel a síťové vrstvy
```

## Pravidla (shrnutí)

Střídání tahů; po prvním legálně potopeném míčku (mimo rozehru) se přidělí plné/pruhované; potopíš-li svou kouli, hraješ dál. Faul = potopená bílá, špatná první zasažená koule, žádný kontakt, nebo po kontaktu žádná koule k mantinelu → soupeř položí bílou kamkoliv. Osmička předčasně nebo při faulu = prohra; při rozehře se vrací na stůl.

## Poznámky

- Fyzika je vlastní místo Matter.js (zadání to povoluje): je deterministická, bez prosakování koulí a bez závislosti navíc.
- Odpojený hráč se může do 120 s vrátit (stejný prohlížeč, karta); poté je soupeři přiznáno vítězství.
- Zvuky a hudba se generují v prohlížeči (Web Audio), nic se nestahuje.

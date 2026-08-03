# AGE OF THE CRYSTALS — munkaszabályok

## A legfontosabb szabály

**A `src/sim/` alatt a determinizmus mindent felülír.** Mielőtt bármit írsz oda,
olvasd el a `src/sim/fx.js` fejlécét. Röviden: nincs `Math.sin/cos/atan2/pow/
exp/log/hypot`, nincs `Math.random`, nincs `Date.now`/`performance.now`, nincs
`three`/DOM, és nincs sorrendfüggő objektum-iteráció. A `npm run det` ezt
statikusan is ellenőrzi — ha bukik, NE a szondát írd át.

A render sosem ír vissza a simbe. Ha hatni akarsz a világra, adj be parancsot:
`sim.parancs({ fajta: 'menet', … })`.

## Verzió

A játék verziója **`src/core/config.js` → `VERZIO`**. A `package.json` verziója
nem ez, ne azt nézd. (A TELEPESEK-ben ez rendszeresen félrevezetett.)

## Szondák futtatása ezen a gépen

macOS 12, Intel iMac: az `npx playwright install chromium` **bukik**
(„Playwright does not support chromium on mac12"). A rendszer-Chrome-ot kell
használni — ez egyben valódi GPU-t is ad SwiftShader helyett, tehát az
FPS-mérések érvényesek:

```bash
export AOC_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
npm run szonda
```

## Kód-stílus

- Magyar azonosítók és kommentek, ahogy a meglévő fájlokban.
- A fejléc-komment a **MIÉRT**-et magyarázza, ne a mit-et. A mérce a TELEPESEK
  `src/render/units3d.js`-ének fejléce.
- Nulla per-frame allokáció a render `frissit()`-jében és a sim `lep()`-jében.
- Új réteg → új fájl. A meglévőt ne írd át, ha bővítés is elég.

## Párhuzamos munka

Több agenttel dolgozunk. A szabály: **diszjunkt fájlkészlet**, minden agent
csak ÚJ fájlokat hoz létre a saját sávjában. Az `INTERFACES.md` a szerződés
közöttük — azt előbb olvasd el, mint a kódot.

## Mielőtt késznek mondasz valamit

`npm run det` (determinizmus) és `npx vite build` fusson hibátlanul. Ha a
teljesítményről állítasz valamit, **mérd is meg** a `npm run fps`-szel — a
TELEPESEK-nél többször kiderült, hogy a dokumentált „nyitott" tételek már rég
készen voltak, illetve fordítva. Ne a doksinak higgy, a mérésnek.

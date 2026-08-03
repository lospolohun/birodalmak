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

## Hol dolgozol? — ez eldönti, mit tudsz ellenőrizni

A projekt két környezetben él, és **nem ugyanaz fut mindkettőben**:

| | felhő (Claude Code weben) | otthoni iMac |
|---|---|---|
| kód írása, `npx vite build` | ✅ | ✅ |
| `npm run det` (determinizmus) | ✅ **teljes értékű** | ✅ |
| `npm run fps` (FPS-mérés) | ❌ nincs GPU | ✅ |
| `node tools/kep.mjs` (képernyőkép) | ❌ nincs GPU | ✅ |

A felhőben a Chrome szoftveres raszterizálóra (SwiftShader) esik. Az azon mért
FPS **semmit nem jelent** — ezért az `fps_szonda.mjs` szándékosan MEGTAGADJA a
mérést, ha `swiftshader|software|llvmpipe` jelzőt lát, és nem ad ítéletet.
Ez nem hiba: ne kerüld meg, ne írd át a szűrőt, és **soha ne jelents felhőben
mért FPS-t eredményként**.

Amit felhőben nyugodtan csinálhatsz: sim-logika, útkeresés, harcrendszer, AI,
UI, és a **determinizmus-szonda — az tiszta node, és pont az a legfontosabb
kapu.** Ha teljesítményt érintő változtatást csinálsz, írd a PR/commit
szövegébe, hogy `npm run fps` MÉG NEM futott rá, és az iMac-en le kell mérni.

## Szondák futtatása az otthoni iMac-en

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

## Ha ÚJ parancsfajtát veszel fel

A determinizmus-szonda nem magától találja meg az új kódot: forgatókönyvekből
dolgozik. A v0.1-es kör (`szondaParancs`) csak a `menet`-et járatja, a v0.2-es
(`szondaParancsV02`) a teljes irányítás-felületet. **Ha új parancsot adsz hozzá,
vedd bele a forgatókönyvbe is** — különben a legfrissebb, tehát legkockázatosabb
kód marad a kapun kívül, és a zöld szonda hamis biztonságérzetet ad.

A v0.1-es forgatókönyv SOSEM változhat: az a motor-mag regresszió-őre, és a
`qa/V0.1_EREDMENY.md` számai ahhoz vannak kötve.

## Mielőtt késznek mondasz valamit

`npm run det` (determinizmus) és `npx vite build` fusson hibátlanul. Ha a
teljesítményről állítasz valamit, **mérd is meg** a `npm run fps`-szel — a
TELEPESEK-nél többször kiderült, hogy a dokumentált „nyitott" tételek már rég
készen voltak, illetve fordítva. Ne a doksinak higgy, a mérésnek.

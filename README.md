# AGE OF THE CRYSTALS

Böngészős RTS az Age of Empires hagyományában — Three.js / WebGL2, Vite.
A motor a [TELEPESEK](https://github.com/lospolosadwords-dev/telepesek) render-
rétegének módszerére épül (instance-olt, alkatrész-alapú figurák, chunkolt
díszlet, LOD), de a szimuláció **nulláról, lockstep-multiplayerre készen**.

## Miért érdekes ez technikailag

Egy AoE-méretű RTS két dolgot követel, amit egy „szokásos" böngészős játék nem:

1. **1600 animált egység 60 FPS-en.** Nem sprite-ok — 3D figurák, saját
   végtag-mozgással. Ezt alkatrész-szintű `InstancedMesh` + nyers mátrix-matek +
   háromszintű LOD oldja meg (`src/render/units3d.js`).
2. **Bitre azonos szimuláció minden gépen.** Enélkül nincs lockstep
   multiplayer, és az utólag nem építhető be. Lásd alább.

## A determinizmus-szerződés

A `src/sim/` alatt futó kód **minden gépen ugyanazt az eredményt adja** ugyanabból
a seedből és parancs-sorból. Ezért ott:

| Tilos | Helyette |
|---|---|
| `Math.sin/cos/tan/atan2/exp/log/pow/hypot` | `src/sim/fx.js` saját közelítései |
| `Math.random()` | `src/sim/rng.js` seedelt generátora |
| `Date.now()`, `performance.now()` | csak a tick-szám |
| `for…in`, `Object.keys` sorrendfüggő logikában | indexelt tömbök |
| `three`, DOM, `window` | — a sim node-ban is lefut |

Az `Math.floor/abs/min/max/ceil/round/imul/sqrt` **szabad**: ezek IEEE-754
szerint egzaktak. A `+ - * /` szintén.

A `npm run det` szonda ezt **statikusan és futásban is** ellenőrzi: két friss
szimuláció 10 000 ticken át, állapot-hash minden 100. ticken. Eltérésnél
megmondja a pontos ticket.

## Rétegek

```
src/sim/      determinisztikus mag — THREE-mentes, node-ban is fut
  fx.js         determinizmus-biztos matek (sin/cos/atan2 saját közelítéssel)
  rng.js        seedelt véletlen + terep-zaj
  grid.js       a világ rácsa: magasság, járhatóság, kristály-lelőhelyek
  flowfield.js  áramlási mező útkeresés (Dial-vödrös Dijkstra) + látóvonal
  units.js      egységek SoA-ban, három rétegű mozgás
  sim.js        fix 20 Hz tick, parancs-sor, állapot-hash
src/render/   csak olvassa a simet
src/core/     config (a VERZIO ITT van, nem a package.json-ban)
tools/        szondák és mérőpadok
```

## Parancsok

```bash
npm run dev      # fejlesztői szerver
npm run det      # determinizmus-szonda (node, böngésző nélkül)
npm run fps      # FPS + réteg-bontás valódi Chrome-GPU-n
npm run szonda   # mind a kettő + build
```

⚠️ Ezen a gépen (macOS 12, Intel iMac) az `npx playwright install chromium`
**bukik**. A szondák ezért a rendszer-Chrome-ot használják — ami egyben előny,
mert így valódi GPU-t kapnak, nem SwiftShadert:

```bash
export AOC_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## Állapot

**v0.1 — motor-szonda.** A cél egyetlen kérdés eldöntése: bírja-e a motor az
AoE-léptéket ezen a gépen. Játék még nincs: nincs gazdaság, nincs harc, nincs
építés. Ami van: terep, 1600 mozgó egység, útkeresés, és a mérőeszközök.

A teljes verzió-terv a `PLAN.md`-ben.

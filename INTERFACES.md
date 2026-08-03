# AGE OF THE CRYSTALS — interfész-szerződés (v0.1 motor-szonda)

Ez a fájl az **igazságforrás** arról, hogy a rétegek hogyan kapcsolódnak. A sim
réteg (`src/sim/`) KÉSZ és **nem módosítható** — a render és a szonda ehhez
igazodik, nem fordítva.

## Alapszabály: sim / render szétvágás

| | `src/sim/` | `src/render/` |
|---|---|---|
| Ismeri a `three`-t | **nem** | igen |
| Ismeri a DOM-ot | **nem** | igen |
| `performance.now()` | **nem** | igen |
| `Math.random()` | **nem** | igen (csak látvány) |
| `Math.sin/cos/atan2/pow/exp` | **nem** (`sim/fx.js` helyette) | igen |
| Fut node-ban | **igen** | nem |

A render CSAK OLVASSA a sim állapotát. Ha a render bármit visszaír a simbe, az
azonnali desync a v0.8-ban — ilyenkor parancsot kell beadni (`sim.parancs()`),
nem állapotot írni.

## `Sim` — `src/sim/sim.js`

```js
const sim = new Sim({ seed: 20260803, n: 256, maxEgyseg: 2000 });
sim.szondaFelallas(1600);   // → tényleges egységszám
sim.szondaParancs();        // két sereg átküldése a másik oldalra
sim.lep();                  // EGY tick (20 Hz)
sim.allapotHash();          // 32 bites uint — desync-detektor
```

Mezők: `sim.tick`, `sim.racs`, `sim.egysegek`, `sim.mezoTar`.

## `Racs` — `src/sim/grid.js`

- `racs.n` — oldalhossz cellában (a pálya `n × n` világegység, 1 cella = 1 egység)
- `racs.magassag: Float64Array((n+1)²)` — **csúcs**-magasság, ebből épül a terep-háló
- `racs.kozepMagassag: Float64Array(n²)` — **cella**-magasság, ezen állnak a figurák
- `racs.terep: Uint8Array(n²)` — `TEREP.VIZ|FU|FOVENY|SZIKLA|HAVAS` (0..4)
- `racs.jarhato: Uint8Array(n²)` — 1/0
- `racs.kristalyok: number[]` — kristály-lelőhelyek cella-indexei
- `racs.magassagPont(wx, wy)`, `racs.jarhatoPont(wx, wy)`, `racs.idx(x, y)`

Világkoordináta: `x` és `y` a **vízszintes sík** (0..n). A 3D-ben ez
`position.x = x`, `position.z = y`, `position.y = magasság`.

## `Egysegek` — `src/sim/units.js` (SoA)

`e = sim.egysegek`, aktív darabszám `e.db`, index `0 .. e.db-1`:

- `e.px, e.py: Float64Array` — pozíció (világ)
- `e.szog: Float64Array` — nézésirány radiánban, `fxAtan2(vy, vx)`
- `e.vx, e.vy: Float64Array` — sebesség (világegység/mp) — a **járás-animáció fázisa ebből jön**
- `e.allapot: Uint8Array` — `ALLAPOT.ALL=0 | MEGY=1 | HARCOL=2`
- `e.tipus: Uint8Array` — `TIPUS.MUNKAS=0 | LANDZSAS=1 | IJASZ=2 | LOVAG=3`
- `e.csapat: Uint8Array` — 0 vagy 1

## Render-réteg elvárt felülete

Minden réteg ugyanezt a három metódust adja, hogy a szonda **ki tudja kapcsolni
egyesével** — a képkocka-költség bontása ezen múlik:

```js
export class Valami {
  constructor(scene, sim, opciok) {}
  frissit(sim, alfa) {}   // alfa = interpoláció a két tick között [0,1)
  set enabled(v) {}       // false → a réteg objektumai .visible = false
  get haromszog() {}      // a réteg által kirajzolt háromszögek száma
}
```

## Globális szonda-horog: `window.__aoc`

A `src/main.js` állítja be. A `tools/fps_szonda.mjs` **csak ezt** használja:

```js
window.__aoc = {
  keszen: true,                    // a boot lefutott, mérhető
  egysegSzam(n),                   // újrafelállás n egységgel (a sim újraindul)
  reteg(nev, be),                  // 'terep'|'props'|'egysegek'|'viz'|'ui' ki/be
  meres(masodperc) -> Promise<{fps, kepkocka, atlagMs, p95Ms, simMs, renderMs, haromszog, rajzhivas}>,
  simHash(),                       // sim.allapotHash()
  verzio: '0.1.0',
};
```

## Verzió

`src/core/config.js` → `export const VERZIO`. A `package.json` verziója **nem**
ez (a TELEPESEK-ben ez rendszeresen félrevezetett).

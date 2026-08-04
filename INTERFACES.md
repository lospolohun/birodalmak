# AGE OF THE CRYSTALS — interfész-szerződés (v0.3 gazdaság)

Ez a fájl az **igazságforrás** arról, hogy a rétegek hogyan kapcsolódnak.

A v0.1-ben a sim réteg „kész és nem módosítható" volt — az a kikötés a
motor-szonda idejére szólt, hogy a render és a mérés stabil célra dolgozhasson.
A v0.2 óta a sim **bővül**, de csak a projekt szabálya szerint: **új réteg → új
fájl**. A mozgás-mag (`units.js`, `flowfield.js`, `grid.js`, `fx.js`) érdemben
érintetlen; az irányítás három ÚJ fájlba került (`alakzat.js`,
`parancsallapot.js`, `parancsok.js`), és a `sim.js` csak bekötötte őket.

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

## Parancsok — `src/sim/parancsok.js` (v0.2)

**Minden** játékos-hatás ezen megy be, kivétel nélkül. A kliens sosem ír
sim-állapotot; index-tömböt ad, és a sim `KESLELTETES` tick múlva hajtja végre.
A v0.8-ban ugyanez a sor érkezik majd a hálózatról — ami nem ment át a soron, az
ott azonnal desync.

```js
sim.parancs({ fajta: 'menet',        egysegek: [12, 13], x: 88, y: 140, alakzat: ALAKZAT.EK });
sim.parancs({ fajta: 'tamado_menet', egysegek: idk, x, y, alakzat });  // útközben ellenséget keres
sim.parancs({ fajta: 'allj',         egysegek: idk });
sim.parancs({ fajta: 'tartas',       egysegek: idk });
sim.parancs({ fajta: 'allas',        egysegek: idk, allas: ALLAS.VEDEKEZO });
sim.parancs({ fajta: 'alakzat',      egysegek: idk, alakzat: ALAKZAT.VONAL });
// v0.3
sim.parancs({ fajta: 'gyujt',        egysegek: idk, x, y, nyers: NYERS.FA });  // `nyers`, NEM `fajta`!
sim.parancs({ fajta: 'epit',         csapat: 0, tipus: EPULET.RAKTAR, x, y });
sim.parancs({ fajta: 'korszak',      csapat: 0 });
// P0/1
sim.parancs({ fajta: 'feladas',      csapat: 0 });
```

⚠️ A `fajta` a PARANCS típusa. A gyűjtésnél a nyersanyagot ezért `nyers`-nek
hívjuk: névütközésnél a `p.fajta | 0` a `'gyujt'` stringből csendben 0-t (étel)
csinálna, és minden gyűjtés étel-gyűjtés lenne, hibaüzenet nélkül.

Ismeretlen `fajta` csendben elvész (nem dob). A `menet`/`tamado_menet` szintén
csendben elvész, ha a célcella nem járható — a kliens dolga járható pontot adni
(`sim._jarhatoKozel(x, y)` segít).

- `ALAKZAT` — `NEGYZET | VONAL | EK | SZORT` (`src/sim/alakzat.js`)
- `ALLAS` — `AGRESSZIV | VEDEKEZO | TARTAS | TUZSZUNET` (`src/sim/parancsallapot.js`)
- `PARANCS` — `NINCS | MENET | TAMADO_MENET | TARTAS` (egységenkénti állapot)

**Egy áramlási mező jár a csoportnak, nem egységenként egy.** Az alakzat CSAK a
végpontot tolja el. Ez a v0.1 legdrágább tanulsága (40,1 → 1,15 ms/tick), és a
determinizmus-szonda 4. vizsgálata azóta is őrzi.

## `ParancsAllapot` — `src/sim/parancsallapot.js` (v0.2)

`pa = sim.parancsAllapot`, index-párhuzamos az `Egysegek`-kel:

- `pa.parancs: Uint8Array` — `PARANCS.*`
- `pa.allas: Uint8Array` — `ALLAS.*`
- `pa.alakzat: Uint8Array` — a következő menetparancs alakzata
- `pa.celEgyseg: Int32Array` — a megszerzett célpont indexe, vagy -1
- `pa.horgonyX/horgonyY: Float64Array` — őrhely (a védekező állás ide tér vissza)

Mindhárom első mező **része az `allapotHash()`-nek**: ha két gépen más egységet
céloz ugyanaz a katona, az ugyanúgy desync, mint egy elmozdult koordináta.

⚠️ **A v0.2-ben NINCS SEBZÉS.** A harcrendszer a v0.4. A támadó menet addig visz,
hogy az egység megtalálja az ellenfelét, odamegy, megáll előtte (`ALLAPOT.HARCOL`)
és szembefordul vele.

## Gazdaság — `src/sim/` (v0.3)

Négy nyersanyag: `NYERS.ETEL | FA | KO | KRISTALY`.

- `sim.eroforrasok` (`eroforras.js`) — lelőhelyek SoA-ban: `cella, fajta,
  keszlet, x, y`, plusz `cellaNode` (cella → lelőhely). `keres()` és `kornyek()`
  spirálisan, `allohely(i, ki, valtozat)` a munkás állóhelyét adja.
- `sim.epuletek` (`epuletek.js`) — `KOZPONT` (3×3) és `RAKTAR` (2×2), mindkettő
  lerakat. `epulHatra` a hátralévő építési tick.
- `sim.gazdasag` (`gazdasag.js`) — `keszlet[csapat*4 + fajta]` **egészben**,
  `korszak`, `korszakHatra`. Négy korszak: sötét → hajnal → kristály → fény.
- `sim.munkasok` (`munkas.js`) — állapotgép: `MUNKA.NINCS →
  MEGY_LELOHELYRE → GYUJT → MEGY_LERAKATRA → …`

⚠️ **A készlet `Int32Array`, nem lebegőpontos.** A gyűjtés részmennyiségeket
adna, és lebegőpontos akkumulátorból tízezer tick alatt gépenként más maradék
jönne. Minden munkásnak egész „óra"-számlálója van; ez is a hashben van.

⚠️ **A pálya futás közben VÁLTOZIK** — kimerült erdő megnyílik, lerakott raktár
bezárul. A `Sim._mezoErvenytelenites()` ilyenkor eldobja a gyorsítótárazott
áramlási mezőket. Ha ez elmarad, a mezők egy már nem létező akadályt kerültetnek
meg, vagy átvezetnek egy frissen épült falon.

⚠️ **Az állóhelyeknek `valtozat` paraméterük van, és ez nem díszítés.** Ha minden
munkás ugyanazt az egy cellát kapná célnak, a szeparáció szétlökné őket és
egyikük sem érne oda — mérve 400-ból 285 ragadt be. A `valtozat` (jellemzően a
munkás indexe) körbeosztja a jelölteket.

## Győzelem és vereség — `src/sim/gyozelem.js` (P0/1)

`gy = sim.gyozelem`. A **render és a UI csak OLVASSA** — hatni egyetlen úton
lehet: `sim.parancs({ fajta: 'feladas', csapat })`.

- `gy.gyoztes: number` — a győztes csapat, vagy `NINCS_GYOZTES` (-1)
- `gy.vegeTick: number` — a meccs vége, vagy -1. Ez a **latch**
- `gy.vereseg / veresegTick / veresegOk: typed array` — csapatonként
- `gy.vege(): boolean` · `gy.osszesites(cs)` — jelentés a HUD-nak (allokál)

**A vereség feltétele:** nincs élő KÖZPONT **és** nincs élő MUNKÁS. Ez a kettő
zárja be a gazdasági kört (a munkást csak a központ képzi, gyűjteni csak a
munkás tud), tehát innen nincs visszaút. A fal és a torony ettől még állhat.

⚠️ **A sim NEM áll meg a meccs végén.** A `lep()` tovább fut, a tick tovább nő —
a megállás a kliens dolga, az olvassa a `vegeTick`-et. A `Gyozelem.lep()` a
`Sim.lep()` LEGVÉGÉN fut, még a `tick++` előtt, tehát a `vegeTick` pontosan
arra a tickre esik, amelyiken a döntő csapás elért.

⚠️ **Mind a hat mező benne van az `allapotHash()`-ben és a mentésben.** Enélkül a
lockstep két gépen más tickre tenné a meccs végét, egy befejezett meccs pedig
betöltve újraindulna. A determinizmus-szonda 14. vizsgálata mindkettőt
szabotázzsal próbálja ki.

## Kliens-oldal — `src/ui/` (v0.2)

A kijelölés **nem** a világ állapota, ezért nincs a simben: a `Kijeloles` olvassa
a simet és parancsot ad be, de sosem ír bele. Így a sim node-ban futtatható marad,
és a v0.8-ban nem kell kijelölést szinkronizálni.

- `Kijeloles` (`ui/kijeloles.js`) — kijelölés, keret- és kattintás-választás,
  10 Ctrl-csoport. `talajPont()` a magasságmezőre metsz, **nem** a terep-hálóra
  (az LOD-ol, tehát zoomfüggő célpontot adna).
- `Bevitel` (`ui/bevitel.js`) — egér/billentyű → parancs. A jobb gombon osztozik
  a kamerával: a FELENGEDÉSNÉL dönt, kattintás volt-e vagy forgatás.
- `Kijeloles3D` (`render/kijeloles3d.js`) — talajgyűrűk egy `InstancedMesh`-ben.
  Saját `_elozo/_most` pillanatképe van, hogy a gyűrű pontosan a figura alatt
  maradjon a tick-ek között.

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
  verzio: '0.3.0',

  // ── v0.2 ────────────────────────────────────────────────────────────
  kijeloles(),                     // a kijelölt indexek MÁSOLATA
  kijelolMind(),                   // minden saját egység kijelölése
  parancs(p),                      // parancs beadása (ugyanaz a sor, mint az egéré)
  vezerles(be),                    // a szonda-forgatókönyv ki/be
};
```

A `reteg(nev, be)` a v0.2 óta a `'kijeloles'` réteget is ismeri. Az FPS-mérés
alatt a kijelölés üres, tehát a réteg költsége nulla — a v0.1 lépcsői
összehasonlíthatók maradtak.

## Verzió

`src/core/config.js` → `export const VERZIO`. A `package.json` verziója **nem**
ez (a TELEPESEK-ben ez rendszeresen félrevezetett).

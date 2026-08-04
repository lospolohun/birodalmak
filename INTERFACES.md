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
  verzio: '0.10.1',                // MINDIG a src/core/config.js VERZIO-ja

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

⚠️ A fenti `verzio:` példa a kiadás-ellenőrző 24. elvárása: ha eltér a
`config.js` VERZIO-jától, sárga jelzést ad. Ha a VERZIO-t emeled, **ezt a sort
is emeld** — a példa különben lassan hazugsággá öregszik, ahogy a v0.3.0-val
történt.

---

# v0.16 — A JÁTÉKRÉTEG SZERZŐDÉSE (UI-panelek és látvány-sávok)

Ez a szakasz azért van, mert a v0.16-ot **sok agent írja párhuzamosan**, és a
korábbi körökben a `main.js` és az `alap.css` volt a torlódási pont. A szabály:
**egy fájlnak egy gazdája van**, a panelek pedig NEM ismerik egymást — csak ezt
a szerződést.

## Miért panel-szerződés, és miért nem „mindenki ír a HUD-ba"

A v0.11-ig a HUD egyetlen fájl volt, ami maga szedte össze az adatot, maga
formázott és maga rajzolt. Amíg egy fejlesztői szöveg-overlay volt, ez helyes
döntés volt. Játék-HUD-ként viszont nyolc-tíz független dolog kerül a képernyőre
(nyersanyag-sáv, építés-panel, kijelölés-panel, képzési sor, technológiafa,
minimap, üzenetek, sebesség-váltó), és ezek külön ütemben, külön adatból élnek.
Egy fájlban ez összeér; külön fájlban nem.

## A panel-szerződés

Minden panel ugyanezt adja, és SEMMI mást nem feltételez:

```js
import './panel_valami.css';        // a SAJÁT stílusa, senki máséba nem ír
import { IKON, ikonSvg } from './ikonok.js';

/** Hova kéri magát a HUD-vázon. */
export const PANEL = {
  nev: 'epites',
  hely: 'also_kozep',   // 'felso' | 'also_bal' | 'also_kozep' | 'also_jobb' | 'jobb_also' | 'kepernyo'
  cim: 'Építés',
};

export class PanelEpites {
  /**
   * @param {HTMLElement} gyoker   ÜRES <div>, a HUD-váz adja; a panel csak ebbe ír
   * @param {import('../sim/sim.js').Sim} sim
   * @param {import('./bevitel.js').Bevitel} bevitel  kijelölés olvasása + parancs-beadás
   * @param {{sajatCsapat:number, uzenet:(szoveg:string,fajta?:string)=>void}} opciok
   */
  constructor(gyoker, sim, bevitel, opciok) {}
  /** Képkockánként. NULLA allokáció; csak akkor írj DOM-ot, ha VÁLTOZOTT. */
  frissit(sim, most) {}
  set enabled(v) {}
  /** Eseménykezelők leszedése — a meccs végén a váz ezt hívja. */
  bont() {}
}
```

Négy kikötés, mindegyik egy-egy konkrét hibából:

1. **A panel SOSEM ír sim-állapotot.** Hatni egyetlen úton lehet:
   `sim.parancs({ fajta: '…', … })` vagy a `bevitel` felülete. Ami megkerüli a
   parancs-sort, az a v0.8 lockstepjén nem megy át.
2. **A panel a `gyoker`-én kívülre nem nyúl.** Nincs `document.querySelector`
   más panel elemeire, nincs globális stílus. A CSS-ed a saját fájlodban van, és
   minden osztályneved a panel nevével kezdődik (`aoc-epites-…`).
3. **`frissit()` nem allokál, és nem ír DOM-ot fölöslegesen.** A HUD 60-144 Hz-en
   fut. Tárold el, mit írtál ki utoljára, és csak eltérésre nyúlj a DOM-hoz —
   különben a szöveg-újraírás önmagában visz el képkockát.
4. **A panel node-ban NEM fut** (DOM-ot használ). Amit szondázni akarsz belőle,
   az az ADATRÉTEG: tedd `panel_valami_adat.js`-be, ami DOM-mentes, és azt
   szondázd. Ez a `menu.js` / `menu_adat.js` bevált mintája.

## A HUD-váz felülete (`src/ui/hud.js` — EGY gazdája van)

A váz nem tud a panelek belsejéről. Amit ad:

```js
hud.helyek                 // { felso, also_bal, also_kozep, also_jobb, jobb_also, kepernyo }
hud.uzenet(szoveg, fajta)  // 'info' | 'figyelem' | 'baj' — a tanácsadó-sáv
hud.panel(nev)             // egy felmountolt panel, ha kell
```

## A `Bevitel` publikus felülete (`src/ui/bevitel.js` — EGY gazdája van)

Minden panel megkapja a `bevitel`-t a konstruktorában. **Csak az alábbi felület
a szerződés** — aláhúzott (`_valami`) metódust panel NE hívjon: az átnevezhető,
és az ilyen függés NÉMÁN hal el (a panel nem dob, csak sosem csinál semmit).

```js
bevitel.kijeloles              // Kijeloles — .lista, .db, .sajatCsapat
bevitel.vaszon                 // a HTMLCanvasElement (eseményekhez)
bevitel.kamera                 // Kamera3D
bevitel.alakzat / .allas       // ALAKZAT.* / ALLAS.* — a KÖVETKEZŐ parancs kapcsolói
bevitel.tamadoMod              // bool, a `T` egyszeri módja
bevitel.celPont(kepX, kepY)    // → {x, y} világpont vagy null (v0.16/2)
bevitel.kijeloltEpulet         // -1 = nincs · különben index a sim.epuletek-be
bevitel.epuletKijelol(i)       // → bool (halott/tartományon kívüli indexet elutasít)
bevitel.epuletTorol()          // az épület-kijelölés elengedése
bevitel.epuletKereso           // ⬅ EZT A RENDER-SÁV ÁLLÍTJA BE, lásd alább
```

⚠️ A `celPont()` visszaadott pontja **újrahasznált objektum** (nulla allokáció a
kattintás-úton). Olvasd ki (`p.x`, `p.y`), ne tedd el — a következő hívás
felülírja.

### Épület-kijelölés: mi kész, és mi hiányzik még

- **kész (UI):** a `kijeloltEpulet` mező, a beállítás/törlés útja, és a `V`
  billentyű, ami a kurzorhoz legközelebbi saját épületet választja ki. A
  `panel_kijeloles.js` épület-nézete ebből él, és MOST is megjelenik.
- **hiányzik (RND):** a 3D-s épület-kattintás — sugárvetés az épület-példány-
  hálókra. Ez a `src/render/` sávja (`gazdasag3d.js` / `epulet_formak.js` tudja,
  hol állnak a példányok), a `bevitel.js` pedig szándékosan nem ismeri a
  `three`-t. A becsatlakozási pont EGY sor, a render-oldalról:

```js
// A visszaadott szám ÉPÜLET-INDEX a sim.epuletek-be, vagy -1, ha ott nincs
// épület. A bevitel a bal kattintás után CSAK AKKOR kérdezi, ha a kattintás
// egyetlen egységet sem talált (az egység erősebb: rá kattintani gyakoribb).
// Az élet-ellenőrzést a bevitel elvégzi, a keresőnek nem kell.
bevitel.epuletKereso = (kepX, kepY, szel, mag, kamera) => epuletIndexVagyMinusz1;
```

⚠️ A kereső **nem írhat sim-állapotot**, és nem a látvány-hálóból kell
válaszolnia, ha az LOD-ol: ugyanaz a csapda, mint a `talajPont()`-nál (a
terep-hálóra metszés zoomfüggő célpontot adna).

## Ikonok (`src/ui/ikonok.js` — EGY gazdája van)

Minden panel innen kér ikont, és SEHONNAN máshonnan. Nincs képfájl és nincs
külső betűtípus: beágyazott SVG, hogy a `dist/` egyetlen fájl maradjon.

```js
import { IKON, ikonSvg } from './ikonok.js';
elem.innerHTML = ikonSvg(IKON.ETEL, 18);   // SVG-forrás, nem elem
```

`IKON` kulcsai: a négy nyersanyag (`ETEL FA KO KRISTALY`), `NEP`, `KORSZAK`,
`IDO`, a hat egységtípus (`MUNKAS LANDZSAS IJASZ LOVAG OSTROMGEP EGYEDI`), a
tizenegy épület (`KOZPONT RAKTAR FAL KAPU HAZ LAKTANYA IJASZDA ISTALLO
OSTROMMUHELY TORONY PIAC`), és a vezérlők (`SEBESSEG SZUNET HANG TETLEN
FIGYELEM BAJ INFO`).

⚠️ `ikonSvg` ISMERETLEN névre **dob**, nem ad üres stringet. Egy elgépelt
ikonnév különben némán eltűnő gombot csinál — pontosan az a hibafajta, amiből
ebben a projektben már öt volt.

## Látvány-sávok (`src/render/`) — ki mit birtokol

| sáv | fájlok |
|---|---|
| világítás, árnyék, ég, nap-ciklus | `core3d.js` |
| terep | `terrain3d.js` |
| díszlet (fa, szikla, kristály) | `props3d.js` |
| épületek | `gazdasag3d.js`, `epulet_formak.js` |
| egységek, animáció | `units3d.js`, `egyseg_figurak.js` |
| kijelölés és parancs-visszajelzés | `kijeloles3d.js` |
| lövedék, ostrom | `lovedek3d.js`, `ostrom3d.js` |
| hadi köd | `kod3d.js` |
| kamera | `camera3d.js` |

Mindegyik tartja a fenti „Render-réteg elvárt felülete" szerződést
(`frissit` / `enabled` / `haromszog`), mert az FPS-szonda réteg-bontása ezen
múlik. Aki elrontja, az a mérést rontja el, nem csak a látványt.

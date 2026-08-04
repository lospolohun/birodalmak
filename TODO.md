# TEENDŐK — AGE OF THE CRYSTALS

Csak a teendők. A **MIÉRT**-ek és a helyzetkép az `ATADO.md`-ben vannak — ha
valamelyik tétel indoklása hiányzik innen, ott keresd.

Jelölés: **P0** = enélkül a játék nem játék · **P1** = kész réteg, ami nem fut ·
**P2** = minőség és hangolás.

Minden tétel megmondja, **melyik fájlban** és **melyik sávban** kell dolgozni.
A sávok diszjunktak: ha többen (vagy több agent) dolgoztok, egy sávot egyszerre
csak egy vigyen.

---

## P0 — enélkül a játék nem játék

### P0/1 · A MECCSET NEM LEHET MEGNYERNI

**Sáv:** sim · **Fájl:** új `src/sim/gyozelem.js`, plusz horog a `src/sim/sim.js`-ben

A simben **nincs győztes és nincs `vegeTick`**. Ellenőrizve: a `gyoztes`,
`vegeTick`, `vereseg`, `jatekVege` azonosítókra a `src/` és `tools/` alatt
**nulla találat**. A meccs technikailag örökké tart; az AI addig játszik, amíg
le nem áll a szonda. Ez a legnagyobb hiányzó darab — minden más réteg (harc,
gazdaság, AI, lockstep, mentés) kész és mért.

Amit el kell dönteni, mielőtt kód születik:

- **Mi a vereség feltétele?** A műfaj alapja: elveszíted az összes központodat
  (és általában: nincs több épületed, amiből újat építhetnél). Az „összes épület
  elpusztult" túl szigorú, a „csak a központ" túl enyhe — a fal és a torony
  attól még állhat.
- **Van-e feladás?** Ha igen, az **parancs** (`fajta: 'feladas'`), nem
  kliens-oldali gomb — különben a hálózaton nem megy át.
- **Mi történik a meccs vége UTÁN?** A sim megáll, vagy tovább lép? A lockstep
  szempontjából a „megáll" a tisztább, de akkor a `lep()` korai kilépését is
  hasholni kell.

⚠️ **A CSAPDA, AMI MIATT EZ NEM EGYSZERŰ FELADAT.** Ha bekerül a `gyoztes` és a
`vegeTick`, **be KELL tenni az `allapotHash()`-be** (`src/sim/sim.js`), különben
a lockstep két gépen **más tickre teheti a meccs végét**, és a desync-detektor
csak jóval később, egy látszólag ártatlan pozíció-eltérésen szólal meg. Ugyanez
vonatkozik a mentésre: a `mentes.js`-nek is vinnie kell mindkettőt, különben egy
befejezett meccs betöltve újraindulna.

**Ne felejtsd a szondát:** a győzelem új alrendszer, tehát kell hozzá egy szám,
ami elárulja, hogy tényleg CSINÁL is valamit. A minimum: a v0.9-es
forgatókönyvben (két gép, azonos nehézség, 16 000 tick) **el kell jutni valódi
győzelemig legalább egyszer**, és a gátnak buknia kell, ha a `vegeTick` végig
`-1` marad. Utána próbáld ki szabotázzsal, hogy a gát tényleg elsül-e.

### P0/2 · `npm run fps` — a v0.2 óta nem futott le érvényesen

**Sáv:** mérés · **Csak a te gépeden lehet**

Felhőben a Chrome szoftveres raszterizálóra esik, és az `fps_szonda.mjs`
szándékosan megtagadja a mérést. Azóta **négy render-réteg került be, amit
képernyőn még senki nem látott**:

- v0.7/1 hadi köd (GPU-textúra, 64×64 rács)
- v0.7/3 minimap és HUD
- v0.9/2 az egyedi egység kirajzolása
- v0.10/1 öt új pálya domborzata

```bash
export AOC_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
npm run szonda
```

### P0/3 · A `FIGURA` tábla szemrevételezése

**Sáv:** render · **Fájl:** `src/render/units3d.js`

A v0.9/2-ben a `& 3` maszkot egy `FIGURA` tábla váltotta le. Logikailag helyes,
és a determinizmus-kapu zöld — de **ez a legkockázatosabb ellenőrizetlen
változtatás**. Ha valami rosszul jelenik meg nálad, itt kezdd. Amit látnod kell:
az egyedi egység lándzsás-figuraként jelenik meg (saját alakja még nincs).

---

## P1 — kész rétegek, amik ma nem futnak

Három réteg elkészült, saját szondával, mind zöld — de **senki nem importálja
őket**, tehát a `npx vite build` meg sem nézi, és böngészőben még egyszer sem
futottak.

### P1/1 · Főmenü bekötése

**Sáv:** ui-bekötés · **Fájl:** `src/main.js` ← `src/ui/menu.js`, `src/ui/menu_adat.js`

A menü-állapotgép kész (6 képernyő, `meccsKonfig()` a kimenet). **Nem hoz létre
`Sim`-et** — a konfigot adja vissza, és a `main.js` példányosít. Ez szándékos:
a v0.8 lockstepjében a meccs-konfigot a hálózaton kell egyeztetni a `Sim`
létrehozása ELŐTT.

A konfig tartalma: `seed`, `n`, `terkep`, `civ[0]`, `civ[1]`, `nehezseg`,
`maxEgyseg`, `sajatCsapat`, `mentes`.

Ellenőrizd: `npm run menu`

### P1/2 · Hang bekötése

**Sáv:** hang-bekötés · **Fájl:** `src/main.js`, `src/ui/bevitel.js` ← `src/audio/hang.js`

Nincs hangfájl — minden szintetizált (24 SFX + 5 zene-téma paraméter-táblából).
A hang **sosem ír a simbe**, és a sim nem tud róla: képkockánként a sim
halmozott számlálóit olvassa, és két képkocka különbségéből csinál eseményt.

A három bekötési pont:

```js
hang.esemeny(ESEMENY.PARANCS_MENET, x, y)     // a bevitelből
hang.frissit(sim, most, kameraX, kameraY)     // a képkocka-hurokból
hang.inditas()                                // az ELSŐ kattintásra (böngésző-szabály)
```

Ellenőrizd: `npm run hang`. A vihar-gát mérve: 73 620 nyers esemény → 251
megszólaló szólam (1:293).

### P1/3 · Civ-választó bekötése

**Sáv:** ui-bekötés (a P1/1-gyel EGY sáv, ne vidd külön)

A `src/ui/civ_valaszto.js` kész; a menü már használja két példányban (saját /
ellenfél). Ha a menüt bekötöd, ez magától jön.

Ellenőrizd: `npm run civ`

---

## P2 — minőség, hangolás, hiányzó funkciók

### P2/1 · A játékos nem tudja kiválasztani az egyedi egységét

**Sáv:** ui · **Fájl:** `src/ui/bevitel.js`

A `C` gyorsbillentyű EGY parancsot ad, és az alapegységet rendeli. Ha az egyedit
rendelné, a játékos elveszítené az olcsó lándzsáshoz a hozzáférést ugyanazon az
épületen. Típus-választó felület kell — a menü mellé.

### P2/2 · v0.9/2b — az egyedi egység saját 3D-alakja

**Sáv:** render · **Fájl:** új réteg az `src/render/` alatt

Ma lándzsás-figurát kap. Az `ostrom3d.js` a minta: saját réteg, a `FIGURA`
táblában `-1`-gyel kizárva a `units3d.js`-ből.

### P2/3 · v0.10/2 — kampány

**Sáv:** sim · **Fájl:** új `src/sim/kampany.js`

Küldetések, célok, kiváltók. **A P0/1 UTÁN** csináld: a kampány-cél („pusztítsd
el X-et", „élj túl N percet") a győzelmi feltétel általánosítása, és ha előbb
születik meg, kétszer kell megírni.

### P2/4 · Balansz — a v0.13 QA-kör tárgya

- A Hegyi bányász azonos nehézségen is alulmarad a Folyami kereskedővel szemben
  (2050 vs 6885 összegyűjtött nyersanyag). Hangolatlan matchup, nem hiba.
- **A gépi gazdaság étel-szűkös:** 12 000 tick után 15 étel áll raktáron 2767 fa,
  555 kő és 460 kristály mellett. Ez a v0.6 AI-jának tulajdonsága, de már
  kényszerítette az egyedi egységek árazását a stratégiai nyersanyagokra.

### P2/5 · A kiadás-ellenőrző 5 figyelmeztetése

**Sáv:** karbantartás · **Futtasd:** `npm run kiadas` · **Doksi:** `qa/KIADAS_ELVARASOK.md`

Egyik sem buktat, de mind valós:

1. elavult verzió-példa az `INTERFACES.md`-ben (`verzio: '0.3.0'`)
2. a `vite.config.js` `base: './'` és a `PLAN.md` `'/aotc/'` kikötése nem ér
   össze — **ez a v0.15-ös SkyNet-kirakásnál fog fájni**, nem előbb
3. a `grid.js` és az `rng.js` fejléce nem az idióma szerinti
4. a `src/audio/` még nincs lefedve az ellenőrzőben (a hang-réteg az ellenőrző
   írása közben született)
5. a `KEPEZ` tudatosan rövid tábla — ez maradhat, csak dokumentálni kell

### P2/6 · v0.14 — magyar + angol

**Sáv:** i18n

A **kód magyar marad**, a felhasználói SZÖVEG lesz kétnyelvű. Az első lépés nem
a fordítás, hanem hogy a `src/sim/` alatti feliratok (`ALAKZAT_NEV`,
`ALLAS_NEV`, `NYERS_NEV`, `KORSZAK_NEV`, `EPULET_NEV`, `TAMADAS_NEV`,
`PANCEL_NEV`, `CIV_NEV`, `CIV_LEIRAS`, `TERKEP_NEV`, `TERKEP_LEIRAS`) **kulcsokká**
alakuljanak, és a feloldás a UI-ba kerüljön. A simnek nem szabadna tudnia
felhasználói szövegről.

---

## A kapuk — mit futtass, mielőtt késznek mondasz valamit

| parancs | mit néz | most |
|---|---|---|
| `npm run det` | determinizmus, 13 vizsgálat | ✅ 13/13 |
| `npm run halo` | lockstep valódi socketen | ✅ |
| `npm run civ` / `menu` / `hang` | a három új réteg adatszondája | ✅ |
| `npm run kiadas` | 61 statikus elvárás | ✅ (5 figyelmeztetés) |
| `npm run build` | éles build | ✅ |
| `npm run fps` | FPS | ❌ **soha nem futott** |
| `npm run szonda` | mind egyben | — |

---

## Három szabály, amit ne írj felül

Nem stílus-kérdés; mindhármat egy-egy konkrét hiba szülte. A részletes indoklás
az `ATADO.md` 4. pontjában.

1. **A `src/sim/` alatt a determinizmus mindent felülír.** Ha a `npm run det`
   statikus szűrője bukik, **ne a szondát írd át**.
2. **A determinizmus-kapu NEM működés-kapu.** A semmittevés tökéletesen
   reprodukálható — ez a projekt **hatszor** égett meg zöld kapu melletti néma
   rendszeren. Minden új alrendszerhez kell egy szám, ami elárulja, hogy CSINÁL
   is valamit, és **a gátat ki kell próbálni szabotázzsal**.
3. **A render sosem ír vissza a simbe.** Hatni egyetlen úton lehet:
   `sim.parancs({ fajta: '…', … })`.

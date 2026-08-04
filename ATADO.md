# ÁTADÓ — AGE OF THE CRYSTALS

> **A felhős fejlesztés itt LEZÁRVA.** Minden fel van tolva, minden kapu zöld.
> A folytatás a te gépeden, Claude appból, localhost-teszttel. A 2. és a 6.
> pont az, amivel kezdeni érdemes.

## 0. Az utolsó menet — amit a kiadás-ellenőrző talált

Az új `npm run kiadas` (61 elvárás, statikus, 0,2 mp) **három valódi hibát
fogott meg az első futásán**, mindet olyat, amire a determinizmus-kapu elvből
vak, mert **minden gépen egyformán rossz**:

1. **Három `TIPUS`-indexelt tábla rövid maradt** a v0.9/2-ből: `LATOTAV` és
   `ELENGED` (`parancsallapot.js`), `LATOTAV_EGYSEG` (`kod.js`) — mind 5 elemű
   6 helyett. Következmény: `LATOTAV[TIPUS.EGYEDI]` → `undefined`, a
   `d <= undefined` pedig MINDIG hamis, tehát **a nyolc nép saját egysége soha
   nem szerzett magától célpontot** (csak külön parancsra harcolt), és a
   hadi ködben **vak volt** — nem fedett fel semmit. Két verzión át,
   tökéletesen determinisztikusan, zöld kapu mellett. Ez pontosan az a csapda,
   amit az `egyedi.js` saját fejléce leír — és mégis belefutottunk.
   **Javítva**; mérve: az egyedi egység most 253 mintavételnél `HARCOL`
   állapotban, korábban egynél sem.
2. **`maxEgyseg`** mentődött, de a `betoltes()` sosem olvasta: nagyobb
   kapacitású mentés kisebb simbe töltve csendben levágta volna a sereget.
   **Javítva** — most elutasítja.
3. **A `civ_valaszto_szonda.mjs` nem volt a `package.json`-ban**, tehát a
   gyakorlatban soha nem futott le. **Javítva**, és mellé bekerült a `menu`,
   `hang`, `kiadas` parancs is.

Maradt **5 figyelmeztetés** (nem buktatnak, a `qa/KIADAS_ELVARASOK.md` sorolja):
elavult verzió-példa az `INTERFACES.md`-ben, a `vite.config.js` `base`-e és a
`PLAN.md` kirakási kikötése nem ér össze, két fejléc nem az idióma szerinti, és
a `src/audio/` még nincs lefedve az ellenőrzőben.

**A kapuk mostani állása:** `npm run det` **14/14**, `npm run halo`,
`npm run civ`, `npm run menu`, `npm run hang`, `npm run kiadas`,
`npx vite build` — mind zöld. `npm run fps` **továbbra sem futott**.


Ez a dokumentum egyetlen célt szolgál: **hogy a saját gépeden fel tudd venni a
fonalat** ott, ahol a felhőben abbamaradt. Nem összefoglaló és nem dicsekvés —
azt írja le, mi van kész, mi NINCS ellenőrizve, és mit érdemes elsőnek
megnézned.

- **Repó:** `lospolohun/birodalmak`
- **Ág:** `claude/age-of-crystals-w73aoj`
- **Verzió:** `src/core/config.js` → `VERZIO` (a `package.json` verziója NEM ez)

---

## 1. Indítás a gépeden

```bash
git clone <repo> birodalmak && cd birodalmak
git checkout claude/age-of-crystals-w73aoj
npm install
npm run dev            # localhost — ITT indul a játék
```

Többjátékos próbához külön kell a relay-szerver (nem PHP, önálló Node-processz):

```bash
npm run relay          # másik terminálban
```

| parancs | mit csinál | felhőben futott? |
|---|---|---|
| `npm run dev` | Vite fejlesztői szerver (localhost) | — |
| `npm run build` | éles build | ✅ zöld |
| `npm run det` | determinizmus-szonda, 14 vizsgálat | ✅ **14/14 zöld** |
| `npm run halo` | végpontok közti lockstep valódi socketen | ✅ zöld |
| `npm run fps` | FPS-mérés | ❌ **SOHA nem futott** |
| `npm run szonda` | mind a négy egyben | ❌ (az FPS miatt) |

macOS 12 / Intel iMac esetén az `npx playwright install chromium` bukik. A
rendszer-Chrome-ot kell megadni — ez egyben valódi GPU-t is ad:

```bash
export AOC_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
npm run szonda
```

---

## 2. Amit ELSŐNEK nézz meg — a felhő adóssága

Ez a lista a lényeg. Minden más kész és kapun átment; ezek azok, amiket **egy
GPU nélküli gép elvből nem tudott ellenőrizni**.

### 2.1 FPS — még soha nem mértük

A `npm run fps` a v0.2 ÓTA nem futott le érvényesen. A felhőben a Chrome
szoftveres raszterizálóra esik, és az `fps_szonda.mjs` szándékosan MEGTAGADJA
a mérést, ha `swiftshader|software|llvmpipe` jelzőt lát. Ez nem hiba, és ne
kerüld meg.

Azóta a render több réteggel bővült, amelyek közül **egyiket sem látta még
senki képernyőn**:

- v0.7/1 hadi köd (GPU-textúra, 64×64 rács)
- v0.7/3 minimap és HUD
- v0.9/2 egyedi egység kirajzolása (a `FIGURA` tábla váltotta le a `& 3` maszkot)
- v0.10/1 öt új térkép-preset domborzata

### 2.2 A `FIGURA` tábla — a legkockázatosabb render-változtatás

`src/render/units3d.js`. A régi kód a típust `& 3`-mal maszkolta, és mellé egy
„négy fölött rejtsd el" feltétel járt az ostromgép miatt. A v0.9/2 hatodik
típusa (`TIPUS.EGYEDI`) így **némán láthatatlan** lett volna. A csere logikailag
helyes, de **képernyőn nem ellenőrzött**: ha valami rosszul jelenik meg, itt
kezdd.

Amit látnod kell: egy meccsben, ahol a gép kiképzi az egyedi egységét, az
lándzsás-figuraként jelenik meg (saját alakja még nincs — az a v0.9/2b).

### 2.3 Az öt új pálya kinézete

A szonda 13. vizsgálata **csak a járhatóságukat** igazolja (a két bázis eléri
egymást, mind a négy nyersanyag megvan). Hogy a Folyam folyója szépen néz-e ki,
hogy a Hegyvidék szorosai játszhatók-e, hogy az Erdőség nem-e áthatolhatatlan
zöld massza — **ez mind szemre való kérdés**.

```js
// Így indíts adott presettel (a menü még nincs bekötve):
new Sim({ seed: 1337, n: 256, maxEgyseg: 2000, terkep: TERKEP.FOLYAM })
```

---

## 3. Hol tart a terv

| verzió | állapot |
|---|---|
| v0.1 – v0.9 | **kész** |
| v0.10/1 térkép-presetek | **kész** |
| v0.10/2 kampány | **nyitott** |
| v0.11 főmenü | adatréteg + kártyák megvannak, **a `main.js`-be kötés hiányzik** |
| v0.12 hang | katalógus-réteg megvan, **a bekötés hiányzik** |
| v0.13 QA-kör | a kiadás-ellenőrző váza megvan |
| v0.14 magyar+angol | nem kezdődött el |
| v0.15 SkyNet deploy | nem kezdődött el |

Részletek verziónként a `PLAN.md`-ben, „A v0.X állása" szakaszokban. Azok nem
összefoglalók: minden szakasz leírja, **melyik hiba hogyan bújt el**, és melyik
gát fogja meg legközelebb.

**A táblázaton kívül: P0/1 — a meccset meg lehet nyerni. Kész.** Ez a tétel egy
verzió-sorban sem szerepelt, mégis ez volt a legnagyobb hiányzó darab: tíz
verzión át nem volt a simben győztes, a meccs technikailag örökké tartott. Az új
réteg a `src/sim/gyozelem.js`, a determinizmus-szonda 14. vizsgálata őrzi. A
döntések indoklása a fájl fejlécében és a `PLAN.md` „Győzelem és vereség"
szakaszában; a mért számok a `TODO.md`-ben.

### Amit a v0.9–v0.10 alatt még nem kötöttünk be

Három új réteg készen áll, de **senki nem importálja** őket — tehát a
`npx vite build` meg sem nézi:

- `src/ui/civ_valaszto.js` + `civ_valaszto_adat.js` (civ-választó kártyák)
- `src/ui/menu.js` + `menu_adat.js` (főmenü-állapotgép)
- `src/audio/hang.js` + `hang_katalogus.js` (szintetizált SFX, nincs hangfájl)

Mindháromnak van SAJÁT szondája (`tools/*_szonda.mjs`), és azok zöldek. A
bekötés a `main.js`-be a következő valódi lépés — és az az első alkalom, amikor
ezek egyáltalán futni fognak böngészőben.

---

## 4. A három szabály, amit ne írj felül

Ezek nem stílus-kérdések; mindhármat egy-egy konkrét, drága hiba szülte.

**1. A `src/sim/` alatt a determinizmus mindent felülír.** Nincs
`Math.sin/cos/atan2/pow/exp/log/hypot`, nincs `Math.random`, nincs
`Date.now`, nincs `three`/DOM, nincs sorrendfüggő objektum-iteráció. A
`npm run det` statikusan is szűri. **Ha bukik, ne a szondát írd át.**

**2. A determinizmus-kapu NEM működés-kapu.** A semmittevés tökéletesen
reprodukálható. Ez a projekt **ötször** égett meg zöld kapu melletti halott
rendszeren: v0.3 gazdaság, v0.4 épület-célzás, v0.4 beszállásolás, v0.9/1
civ-horgok, v0.9/2 egyedi egység. Minden új alrendszerhez kell egy szám, ami
elárulja, hogy tényleg CSINÁL is valamit — és **a gátat ki kell próbálni
szabotázzsal**, különben nem tudod, hogy elsülne-e.

A legtanulságosabb eset: a v0.9/1 záró gátja eredetileg az `allapotHash()`-t
hasonlította civvel és anélkül. Mind a kilenc lekérdezőt semlegesre írva a hash
**akkor is eltért** — a civ-index maga is benne van a hashben. A gát sosem sült
volna el, és pont azt a hibát nem fogta volna meg, amiért megírtuk.

**3. A render sosem ír vissza a simbe.** Hatni egyetlen úton lehet:
`sim.parancs({ fajta: '…', … })`. Ez a lockstep előfeltétele — ami megkerüli a
parancs-sort, az a hálózaton nem megy át.

---

## 5. Két mérési csapda

**Az FPS felhőben értelmetlen** (nincs GPU) — ezt tudod.

**A tick-idő is az.** A determinizmus-szonda 4. vizsgálatának `ms/tick` száma
tiszta CPU, tehát csábító azt hinni, hogy összevethető két futás között. Nem az:
a felhő-gép osztott CPU-n fut. Mérve, ugyanaz a kód, ugyanaz a nap: 0,58 ms
reggel, 0,88 ms este. A tick-idő EGY FUTÁSON BELÜL összehasonlítható
(A/B, `git stash`-sel), két alkalom között NEM.

---

## 6. Nyitott adósságok, prioritás szerint

1. **`npm run fps` lefuttatása** — a v0.2 óta esedékes, és minden azóta hozzáadott
   render-réteg mérés nélkül van.
2. **A három kész UI/hang-réteg bekötése a `main.js`-be** — enélkül a v0.11 és a
   v0.12 papíron kész, gyakorlatban nem létezik.
3. **v0.9/2b: az egyedi egység saját 3D-alakja** — ma lándzsás-figurát kap.
4. **A játékos nem tudja kiválasztani az egyedi egységét.** A `C` gyorsbillentyű
   egy parancsot ad, és az alapegységet rendeli. Típus-választó felület kell —
   a v0.11 menüjének a dolga.
5. **v0.10/2 kampány.**
6. **Balansz.** A szonda v0.9-es körében a Hegyi bányász azonos nehézségen is
   alulmarad a Folyami kereskedővel szemben (2050 vs 6885 összegyűjtött
   nyersanyag). Ez nem hiba, hanem hangolatlan matchup — a v0.13 dolga.
7. **A gépi gazdaság étel-szűkös.** 12 000 tick után 15 étel áll raktáron 2767 fa,
   555 kő és 460 kristály mellett. Ez a v0.6 AI-jának tulajdonsága, nem a v0.9-é,
   de az egyedi egységek árazását már ez kényszerítette a stratégiai
   nyersanyagokra.

---

## 7. Ha valami elromlik

- `npm run det` → megmondja a PONTOS ticket, ahol a két futás széttart, és
  minden vizsgálatnál ki van írva, hol kezdd a keresést.
- A determinizmus-szonda 14 vizsgálata közül a 12–14. a legfrissebb
  (v0.9 civek + egyedi egységek, v0.10 térképek, P0/1 győzelem) — ha valami
  elromlik, statisztikailag ott.
- `npm run halo` → ha a hálózat gyanús. Két valódi kliens, valódi socket,
  közös relay, és a végén szándékosan elrontja az egyik oldalt, hogy lássa,
  a desync-detektor tényleg elsül-e.

Az órás „éjszakai fejlesztés" Routine **le van tiltva** (nem törölve). Ha megint
felhőben akarod futtatni, kapcsold vissza — de előbb írasd át a promptját, mert
a szövege még azt mondja, hogy a v0.5 következik.

# ÁTADÓ — AGE OF THE CRYSTALS · v0.16 (2026-08-04, otthoni iMac)

> **Ez az egyetlen fájl, amit el kell olvasnod.** Az előző átadó a felhőből a
> gépre szólt; ez a gépről vissza a felhőbe. A 0. és az 5. pont a lényeg.

- **Verzió:** `src/core/config.js` → `VERZIO` (a `package.json` verziója NEM ez)
- **Ág:** `claude/age-of-crystals-w73aoj`
- **Utolsó commit:** `95c5abc` — v0.16, a játékréteg
- **Repók:** lásd a 6. pontot — **KÉT fiók, és ez most fontos**

---

## 0. Mi történt ma, és miért

A motor a v0.10-nél tartott: determinisztikus sim, lockstep multiplayer, 1600
egység valódi GPU-n 193 FPS-en, gazdaság, technológiafa, nyolc civ, hadi köd,
gépi ellenfél, mentés. A tulajdonos viszont **kipróbálta a játékot**, és ezt
mondta:

> „ez kb v0.1" · „a TELEPESEK grafikájától fényévekre van" · „nem tudok
> semmit csinálni"

**Igaza volt**, és ez nem egy hiba volt, hanem TERVEZÉSI hiba: a `PLAN.md` a
motortól egyenesen a kiadásig ment (v0.11 menü → v0.12 hang → v0.13 QA → v0.14
nyelvek → v0.15 deploy), és **sehol nem volt verzió a játékrétegre** — se UI, se
művészeti irány. A motor v0.10-nél járt, a prezentáció v0.0-nál.

Ezért lett a v0.16 a JÁTÉKRÉTEG, tizenhat párhuzamos sávban.

### Amit a mai nap konkrét hibákban hozott

Ezek mind NÉMA hibák voltak — minden gépen egyformán rosszak, tehát a
determinizmus-kapu elvből vak rájuk:

1. **A játék FEKETE KÉPERNYŐVEL indult**, hét verzión át. A kamera a pálya
   közepére állt, a saját központ viszont `n*0.22`-nél van — a v0.7-es köddel az
   felderítetlen. 3 % felfedettség, a sereg a képen kívül. Javítva: az „otthon"
   a saját központ.
2. **A HUD két legfontosabb száma hazudott.** A „MUNKÁS" a DOLGOZÓ parasztokat
   mutatta, a „KATONA" a csapat ÖSSZES élő egységét. A meccs elején ezért
   „MUNKÁS 0 · KATONA 8" állt ott, holott 4 paraszt és 4 katona volt a pályán —
   aki ezt elolvasta, azt hitte, nincs parasztja, tehát a gazdaság
   elindíthatatlan. Nem a szám volt rossz, hanem amit a CÍMKE ígért.
3. **A `FIGURA` tábla `-1`-et ad az ostromgépre**, és a szűrés hiánya
   `TypeError`-t dobott a rAF-hurokban: a játék MEGFAGYOTT volna abban a
   pillanatban, amikor elkészül az első faltörő kos.
4. **Néma hang:** a `hang.js` `sim.lovedek`-et kérdezett `sim.lovedekek` helyett
   — a két lövedék-hang örökre néma lett volna.
5. **Rövid tábla, ötödször:** `kijeloles3d.js` `SUGAR` öt elemű a hat `TIPUS`-hoz
   → NaN a példány-mátrixban → az egyedi egység kijelölő gyűrűje némán elromlott.
6. **HULLÁMZÓ KAPU** a technológia-szondában: a nulla-allokáció szabotázs-
   kontrollja egyetlen halom-mintát vett, és ha közben futott a GC, `-261
   bájt/hívást` mért — ebből a gát azt olvasta, hogy vak. Nyolc futásból
   kettő-három bukott. **A hullámzó kapu rosszabb a bukónál: megtanítja az
   embert újrafuttatni.** A GC csak lefelé torzíthat, ezért most öt kör
   maximuma számít.

---

## 1. Indítás

```bash
git checkout claude/age-of-crystals-w73aoj && npm install && npm run dev
```

| parancs | mit csinál | hol fut |
|---|---|---|
| `npm run det` | determinizmus, 13 vizsgálat | mindenhol ✅ |
| `npm run ikon` | ikon-készlet (sim-enumokból) | mindenhol ✅ |
| `npm run panelek` | mind a 8 UI-szonda | mindenhol ✅ |
| `npm run menu` `civ` `hang` `halo` | v0.11/0.12/0.8 | mindenhol ✅ |
| `npm run kiadas` | 61 kiadási elvárás | mindenhol ✅ |
| `npm run fps` | FPS-mérés | **CSAK valódi GPU-n** |
| `node tools/kep.mjs` | képernyőkép | **CSAK valódi GPU-n** |

⚠️ **Felhőben az FPS és a képernyőkép ÉRTELMETLEN** (SwiftShader). Az
`fps_szonda.mjs` szándékosan megtagadja a mérést — ne kerüld meg, ne írd át a
szűrőt, és soha ne jelents felhőben mért FPS-t eredményként.

---

## 2. Mi van kész a v0.16-ban

**Kezelhetőség — mind a nyolc sáv teljesen elkészült:**
HUD-váz (hat mount-pont, ikonos nyersanyag-sáv trend-nyilakkal, sebesség-váltó
‖/1×/2×/4×, tanácsadó-sáv) · építés-panel (11 épület, a hiányzó nyersanyag
pirosan, kétlépéses lerakás) · kijelölés-panel (típus-csoportok, parancs-gombok
a billentyűvel, tétlen-paraszt gomb) · képzés-panel (hat típus + **végre a nyolc
nép egyedi egysége**) · technológiafa (négy korszak-oszlop, magyar mondatos
hatás, zártnál konkrét ok) · tanácsadó (15 szabály TELEPESEK-hangon, mért
elnyomással) · minimap (domborzat-árnyalás, terület, trapéz nézet-keret) ·
statisztika (19 sorozat, fix 74,9 kB lábnyom, meccs-vége mérleg).

**Látvány — mind a nyolc sáv ÍRT, de a kvóta menet közben megölte őket:**
vetett árnyék, égbolt, napszak-ciklus · terep-paletta és shader mind a hat
presetre · többféle fa, bokor, kidőlt rönk · épület-részek (a központ végre
cseréptetős épület, nem kék kocka) · egység-animáció és cipelt rakomány · öt
jelölés-réteg · harci effektek · lágyabb köd-perem.

⚠️ **A látvány-sávok NEM fejezték be az önellenőrzésüket.** A leállás
pillanatában mindegyik épp a szoftveres rajzolójával nézte a saját munkáját, és
a búcsúmondataikból látszik, hogy közben VALÓDI hibákat találtak, amiket már nem
tudtak lezárni:

- a napszak-váltásnál a terep feketébe fordul, miközben a figurák nem
  (`toneMapped:false` a figurákon, ACES a terepen — a kettő nem egy csővezeték)
- a pálya sarkánál a kamera a ködlap ALÁ kerül, és a köd teljesen eltűnik
- a törmelék nem süllyed elég mélyre, és túl világosnak olvasódik

**Ezeket a felhőben be lehet fejezni** — mind kód-kérdés, nem mérés-kérdés.

---

## 3. Mérve (otthoni iMac, ANGLE/Metal, AMD Radeon R9 M380, terheletlen gép)

| | v0.10 | v0.16 |
|---|---|---|
| p95 @1600 egység | 9,3 ms | **10,3 ms** |
| FPS | 193 | 158 |
| háromszög | 460k | 499k |
| rajzhívás | 92 | 112 |

**ÍTÉLET: GO** (a kapu ≤ 16,7 ms). Az egész UI- és látvány-réteg egyetlen
ezredmásodpercbe került. Szűk keresztmetszet az egységek (1,64 ms, 26 %), de az
„egyéb" (közös képkocka-munka) 3,39 ms — **nem rétegben kell optimalizálni.**

⚠️ A tick-idő és az FPS KÉT ALKALOM KÖZÖTT nem hasonlítható össze. Ma mérve:
ugyanaz a kód load 43-on p95 20,8 ms, load 3-on 10,3 ms. Ha teljesítmény-
változást állítasz, ugyanabban a munkamenetben mérd meg mindkét oldalt, és
NÉZD MEG A LOAD AVERAGE-T mérés előtt.

---

## 4. A négy szabály, amit ne írj felül

1. **A `src/sim/` alatt a determinizmus mindent felülír.** Nincs
   `Math.sin/cos/atan2/pow/exp/log/hypot`, `Math.random`, `Date.now`, `three`,
   DOM, sorrendfüggő objektum-iteráció. Ha a `det` bukik, NE a szondát írd át.
2. **A determinizmus-kapu NEM működés-kapu.** A semmittevés tökéletesen
   reprodukálható. Ez a projekt **hétszer** égett meg zöld kapu melletti halott
   rendszeren. Minden új alrendszerhez kell egy SZÁM, ami elárulja, hogy tényleg
   csinál is valamit — és a gátat KI KELL PRÓBÁLNI SZABOTÁZZSAL.
3. **A render sosem ír vissza a simbe.** Hatni egyetlen úton lehet:
   `sim.parancs({ … })`. Ami megkerüli a parancs-sort, az a lockstepen nem megy át.
4. **A panel a gyökerén kívülre nem nyúl**, saját CSS-fájlja van, minden
   osztályneve a panel nevével kezdődik, és a `frissit()`-je nem allokál. A
   teljes szerződés: `INTERFACES.md` → „v0.16 — A JÁTÉKRÉTEG SZERZŐDÉSE".

---

## 5. Nyitott adósságok, prioritás szerint

1. **A JÁTÉKOT NEM LEHET MEGNYERNI.** A simben nincs `gyoztes`, nincs
   `vegeTick`, a `lep()` a végtelenségig lép. A statisztika-panel ezért ÁLLÁST
   mutat, nem eredményt, és ki is írja, hogy nem hivatalos. Ami kell:
   a győzelmi szabály (a központ elvesztése a kézenfekvő), egy `sim.gyoztes`
   mező **az `allapotHash()`-ben** (különben a lockstep két gépen más tickre
   teszi a meccs végét), a `lep()` viselkedése vége után, egy feladás-parancs —
   **és mindezt bele kell venni a determinizmus-forgatókönyvbe**, különben a
   legfrissebb, tehát legkockázatosabb kód marad kapun kívül.
2. **A látvány-sávok három félbehagyott hibája** (2. pont vége).
3. **A gépi ellenfél 7,5 perc alatt EGYSZER SEM vált korszakot** — az ételt
   elköltik képzésre, mire az 500-as váltási ár összejönne. Balansz-hiba, nem
   programhiba, de azt jelenti, hogy a gép sosem jut fejlettebb egységekhez.
4. **A kristály és a fény korához nincs technológia kötve.** A fa ezt őszintén
   kiírja, de balansz-döntést igényel.
5. **Épület-kijelölés nincs** (a `kijeloles.js` csak egységeket jelöl). A
   kijelölés-panel épület-nézete KÉSZ és szondázott, csak akkor jelenik meg, ha
   valaki beteszi a `bevitel.kijeloltEpulet` mezőt.
6. **Az építés-panel a `bevitel._celPont()` PRIVÁT metódusára támaszkodik.** Ha
   azt bárki átnevezi, a lerakás némán elhal. Publikus `celPont` kellene.
7. **Korszak-gát az építésnél**: a sim `epit` ága nem néz korszakot, és az AI
   sem — egy csak-UI-ban működő gát csak az embert büntetné. Az ág kész és
   bizonyított, egy sor kell hozzá, ha a követelmény bekerül a simbe.
8. **Hiányzó `favicon.ico`** — minden szonda-futáson „1 konzol-hibát" jelent.
   Egyperces javítás, és megszünteti az örök hamis riasztást.
9. **Böngészős ránézés a panelekre.** Az adat- és szerződés-kapuk zöldek, de a
   tördelést és a tényleges kattintásokat még senki nem nézte meg élőben.

---

## 6. ⚠️ A KÉT GITHUB-FIÓK — ezt olvasd el, mielőtt pusholsz

A tulajdonosnak **két** fiókja van, és ez rendszeresen zavart okoz:

| fiók | mit lát | repó |
|---|---|---|
| `lospolosadwords-dev` | a gépen a `gh` EZZEL van bejelentkezve | `age-of-the-crystals` |
| `lospolohun` | a Claude felhő-munkamenet CSAK EZT látja | `birodalmak` (nyilvános) |

A v0.2–v0.13 munka a `lospolohun/birodalmak` `claude/age-of-crystals-w73aoj`
ágán született. **A gépről oda NEM lehet pusholni** (403: „Permission to
lospolohun/birodalmak.git denied to lospolosadwords-dev").

Ezért a mai munka ide ment fel: **`lospolosadwords-dev/age-of-the-crystals`**,
ugyanaz az ágnév, a teljes történettel.

**Ha a felhőből folytatod, a `lospolohun` fiók kell hozzá.** Tartós megoldás
(amíg nincs meg, ez újra elő fog jönni): a Claude GitHub App engedélyezése a
`lospolosadwords-dev` fiókra, VAGY a projektek átvitele egyetlen fiók alá.

---

## 7. Ha valami elromlik

- `npm run det` → megmondja a PONTOS ticket, ahol a két futás széttart.
- `npm run kiadas` → 61 statikus elvárás, 0,2 mp. Ez fogta meg a rövid táblákat.
- `npm run panelek` → mind a nyolc UI-szonda, szabotázs-kontrollal.
- `npm run halo` → két valódi kliens, valódi socket, és a végén szándékosan
  elrontja az egyik oldalt, hogy lássa, elsül-e a desync-detektor.

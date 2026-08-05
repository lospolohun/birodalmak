# ÁTADÓ — AGE OF THE CRYSTALS · v0.18.0 (2026-08-05, Claude felhő-munkamenet)

> **Ez az egyetlen fájl, amit el kell olvasnod, mielőtt bármihez hozzányúlsz.**
> A `TODO.md` a **mit**, ez a **miért**.
>
> - A **6. pont a git-helyzet.** Nélküle ugyanabba a falba futsz, amibe én.
> - A **7. pont a mérési szabály.** Nélküle hamis számokra fogsz építeni — ebben
>   a körben **három dokumentált mérésről derült ki, hogy nem igaz.**

- **Verzió:** `src/core/config.js` → `VERZIO` = **`'0.18.0'`** (a `package.json`
  verziója NEM ez, és soha nem is volt az)
- **Ág:** `claude/age-of-crystals-w73aoj`
- **Kapuk a záráskor, a commitolt fán:** `npm run det` **15/15** ·
  `npm run kiadas` **61/61, nulla figyelmeztetés** · `npx vite build` hibátlan ·
  minden panel- és rendszer-szonda zöld
- **`npm run fps` NEM FUTOTT** — felhőben nincs GPU. Lásd a 10. és a 11. pontot.

---

## 0. Mi történt, és mi ebből a fontos

Három menet: a győzelmi feltétel lezárása, a kiadás-kapu kinyitása, és egy
öt-agentes kör (a hatodikat, a kampányt, a tulajdonos leállította).

A kör legfontosabb eredménye **nem funkció, hanem egy módszertani hiba
felfedezése** — lásd a 7. pontot. Emellett három valódi, felhasználó által is
érzékelhető hibát javítottunk (2., 3., 4. pont), és a kiadás-kapu **először lett
teljesen zöld** (5. pont).

---

## 1. A JÁTÉKNAK VÉGE LEHET (v0.17)

Új réteg: `src/sim/gyozelem.js`. A központ elvesztése és a feladás ugyanazon az
egy soron zárja le a meccset. `gyoztes` / `vegeTick` / `ok`, plusz három
csapat-jelző (`voltKozpont`, `feladta`, `kiesett`) — **mind az `allapotHash()`-ben.**

Két dolog, ami nem nyilvánvaló:

- **A feltétel nem „nincs központja", hanem „VOLT és most nincs"**
  (`voltKozpont`). Enélkül a felállás nélküli szonda-simek a 0. ticken
  döntetlenre futnának.
- **A `lep()` a vége után is lép, csak parancsot nem fogad el.** A megállás
  DÖNTÉS, aminek a helye a meccs-hurok, nem a sim.

`MENTES_VERZIO` 4 → 5 → **6**. Enélkül egy lejátszott meccs a betöltés után
**futóként támadt fel**.

## 2. A KIESÉS RAGADÓS LETT — ez desync-javítás volt

A `kiesett[]`-et a `lep()` tickenként a MOSTANI világból számolta újra, tehát a
kiesett csapat **feltámadt, ha új központot épített**. Három csapaton kimérve:
`[1,0,0]` → a következő ticken `[0,0,0]`. A jelző a **hashben van**, tehát ez
desync-forrás is volt.

Két csapatnál a hiba nem jön elő (ott a kiesés tickje egyben a meccs vége) —
ezért kell a szondában **három** csapat. A `det` 14. vizsgálatának minden száma
**változatlan** maradt a javítás után (t=1867 · t=751 · 10 elutasítva ·
`0x472a9c23` oda-vissza): pont ez bizonyítja, hogy két csapatnál semleges.

## 3. A HANG NÉMA MARADT BETÖLTÉS UTÁN

A `lovedek.kilott` / `talalt` számláló kimaradt a mentésből, mert
„statisztikának" látszott — pedig a `hang.js` **különbségből képez belőle
eseményt**. F9 után az íjhúr és a becsapódás **nem szólt**, amíg a számláló
vissza nem kapaszkodott. Azért nem tűnt fel, mert az összes többi hangforrás
mentve volt.

Összesen **tíz** ilyen vezeték hiányzott. A `mentes.js` fejlécében most ki van
mondva a tényleges szabály: **a mentés halmaza = hash-mezők (a folytatás
helyessége) ∪ működés-számok (a jelentés őszintesége).**

A v5-ös mentés továbbra is betölthető, mert az 5→6 lépés csak működés-számlálót
adott. ⚠️ **Ez a mentesség NEM öröklődik:** ha egy jövőbeli lépés hash-mezőt ad
hozzá, a régi verziót ki kell venni a `REGI_VERZIOK` listából.

## 4. AZ ELLENFÉL TERMELÉSE KISZIVÁRGOTT

A kijelölés-panel csapatfüggetlenül írta ki a képzési sort, a kutatást és az
őrség létszámát — az épület-kattintás pedig ellenséges épületet is visszaad.
Nem desync (a kijelölés kliens-oldali), hanem annál rosszabb: a v0.8
lockstepben a **felderítés veszti értelmét**, némán.

A meghúzott határ: ami az épületen **kívülről** látszik, az mehet (típus,
életerő, készültség); ami a falon **belül** van, az nem.

⚠️ **A felület sem hazudhat.** A puszta nullázás után a panel „nem folyik benne
semmi"-t írt volna egy dolgozó ellenséges laktanyára, és „őrség 0 / 5"-öt egy
tele toronyra — vagyis a gát maga vált volna hazugsággá. Most „idegen épület —
a belseje nem látszik", illetve `? / 5`. **A nem-tudást hiányként kell kiírni.**

Kapu: a `p:kijeloles` **7/b** vizsgálata, mind a három ág valódi kontrollal
(sor `3 → 0`, kutatás `"ekevas" → ""`, őrség `2 → 0`), plusz külön gát arra,
hogy a kívülről látható adat MEGMARADJON.

## 5. A KIADÁS-KAPU ELŐSZÖR ZÖLD (61/61)

Ehhez nem az elvárásokat kellett lazítani, hanem hazugságokat kivenni:

- **Az 56. figyelmeztetés HAMIS RIASZTÁS volt.** Nem volt halott fájl: a
  `panel_technologia.js`-t és a `panel_uzenetek.js`-t a `main.js`
  `import.meta.glob`-bal húzza be, és a `PANEL_TERV` **modul-út-sztringgel**
  szereli fel. Az import-séta csak a `from '…'` alakot követte. A másik négy
  panel **véletlenül** menekült meg: a szondájuk szövegében ott a fájlnevük.
  Aki a lista alapján „takarít", két működő panelt töröl.
- **A 39. címke volt, nem gát:** csak a `KEPEZ` hosszát mondta vissza, az
  indoklását („az olvasói `!lista`-val védettek") **semmi nem ellenőrizte** — a
  védelmet kivéve a szöveg bitre ugyanaz maradt.
- **Az 57. maga is hibás volt:** akkor is sárgázott, ha a két oldal már
  egyetértett. DÖNTÉS: relatív `base: './'`, hogy a `dist/` bárhová másolható
  maradjon (ugyanaz az érv, ami a faviconból adat-URI-t csinált).
- **A verzió-számozás szétcsúszott.** A `PLAN.md` funkciónként osztotta ki a
  számokat, a fejlesztés viszont körönként haladt, és a **v0.12-ről a v0.16-ra
  ugrott**. A v0.13–v0.15 ezért **`kimaradt`** (nyugdíjazott szám), a tartalmuk
  hátrébb került: **QA-kör → v0.19, nyelvek → v0.20, kirakás → v0.21.**
  ⚠️ A 21. elvárás ezért kapott `kimaradt`-kivételt, és annak **ára van**, ami a
  `qa/KIADAS_ELVARASOK.md`-ben ki van mondva: **`kimaradt` csak akkor írható, ha
  a tartalom máshol MEGJELENIK.** Ha valaha valódi elmaradás eltüntetésére
  használják, az nem egy elvárást ver ki, hanem az egész verzió-táblázat
  értelmét.

---

## 6. ⚠️ A GIT-HELYZET — EZT OLVASD EL, MIELŐTT PUSHOLNÁL

A fejlesztés a **`lospolosadwords-dev/age-of-the-crystals`** repóban él. A
felhős munkamenet oda **NEM tud pusholni**: 403, és a repó csatolását a rendszer
„cross-tier" hibával utasítja el.

A megoldás: a munka a **`lospolohun/birodalmak`** repó
**`claude/age-of-crystals-w73aoj`** ágára megy fel. A két repónak **KÖZÖS a
története**, a közös ős **`c53bb46`**. Áthozni így kell:

```bash
cd age-of-the-crystals
git fetch https://github.com/lospolohun/birodalmak claude/age-of-crystals-w73aoj
git merge FETCH_HEAD
```

⚠️ Egy munkameneten belül a git-relé portja **megszűnhet** (nálam megszűnt egy
szünet alatt). Ha a push „Couldn't connect to server"-rel hal el, a távoli URL-t
kell átállítani a valódi GitHub-címre. A commit ilyenkor **már megvan**, nem
veszett el semmi.

---

## 7. ⚠️⚠️ A MÉRÉSI SZABÁLY — A KÖR LEGFONTOSABB TANULSÁGA

**A v0.17 óta a meccsnek VÉGE LEHET, és az `ai.lep()` ilyenkor kilép.** Egy
16 000 tickes futás utolsó ezrei ezért **halott meccs** lehetnek. Amit ott
mérsz — „a gép nem épít", „a munkások tétlenek", „a gazdaság áll" —, az nem
hiba, hanem a lefutott játék.

**Ez a körben egy egész TODO-tételt megdöntött és három számot vont vissza:**

| korábbi állítás | ítélet |
|---|---|
| „a munkások VÉGLEG tétlenné válnak, 12-ből 5" | **TÉVES.** A meccs a 10 740. ticken véget ér, akkor **nulla** tétlen van; a tíz utána gyűlik össze. Az `_elerhetoLelohely()` 49 hívásból **0-szor** adott `-1`-et. |
| „AI korszakváltás 0 → 11, legkorábbi t=9105" | **NEM REPRODUKÁL.** Ma 0/0 mindkét hosszú körön — a commitolt fán ÉS a változtatás előtti fán is. |
| „12 169. tickig 12 építési parancs, 16 000-ig 61 — 49 a kukába" | **NEM REPRODUKÁL**, és a hozzá tartozó gát a teljes kapu-korpuszon **holt kód** volt. |
| „`BOSEG` 500-nál a 12 994. tickre eldől a meccs" | **NEM REPRODUKÁL.** 500-nál sem dől el 16 000 tickig. A konstans működik, a „ne ebből hangold a nehézséget" tanács áll. |

**A szabály: minden hosszú futású mérés előtt nézd meg a
`sim.gyozelem.vegeTick`-et**, és a számaidat ahhoz viszonyítsd — vagy állítsd le
a mérést a meccs végén. Öt szonda ezért mostantól **kiírja**, hány tick esett a
vég utánra, a `hang` gazdaság-világa pedig meg is áll a meccs végén.

Emlékeztetőül a `CLAUDE.md`-ből, mert ugyanide tartozik: **a felhőben mért
tick-idő két alkalom között NEM összevethető.** Egy futáson belül (A/B,
`git stash`-sel) igen.

---

## 8. A KORSZAK-GÁT KÉSZ, DE SZÁNDÉKOSAN NINCS BEKAPCSOLVA

A mechanizmus a simben van (`EP_KORSZAK_IGENY`, `korszakKell()`, `korszakGat()`,
és az ellenőrző sor a `parancsok.js` `epit` ágában, **a levonás előtt**). Az
**élő tábla viszont csupa nulla** = a mai szabály.

Ez **mért döntés, nem félkész munka.** A meccs végéig mérve, 14 seeden:

| | gát ki | gát ÉLES |
|---|---|---|
| a nehéz gép álló épülete (átlag) | 8,6 | 6,6 (−23 %) |
| ebből **katonai** | 3,4 | **1,9 (−43 %)** |
| korszakváltás 28 mért oldalon | 0 | 0 |
| egyedi egység rendelése (v0.9/2) | 0–10 | **0 mind a 11 futásban** |

A −43 % nem visszafogás, hanem **végleges veszteség**: a v0.6-os körön a gép
soha nem éri el a hajnal korát, tehát az íjászda és az istálló nem „később" épül
fel, hanem **soha**. Plusz egy kész alrendszer (egyedi egység) némán nullára megy.

⚠️ **A szonda 15. köre viszont BEKAPCSOLVA járatja a gátat a saját sim-jén**
(27/27 elutasítás, A/B kontrollal) — a kód tehát a kapun **belül** van, csak a
világon nincs bekapcsolva. Ez a helyes állapot: nem maradt kapun kívül, és nem
is törte el a játékot.

**Ami az élesítéshez hiányzik:** a gép a v0.6-os körön nem tud korszakot váltani,
mert a váltás **500 étel**, ő **0,127 étel/tick**-et termel, és végig ostrom
alatt áll, ahol a `HAD.VEDEKEZIK` szabály — helyesen — kikapcsolja a tartalékot.
**A feltétel nem a nehézségtől függ, hanem attól, nyomás alatt van-e a gép.**
Bármelyik megnyitja a kaput: a `KORSZAK_AR` csökkentése, a gép étel-gazdaságának
javítása, vagy hogy a hajnal kora ne ételt kérjen.

Mellékeredmény: a gép **végre használja a piacát** (`_kereskedik`). A v0.6 óta
megvette 175 fáért és **sosem cserélt rajta** — mérve **965 fa** állt a
raktárában, miközben az étel 0–30 közt tapadt.

---

## 9. AZ i18n-RÉTEG KÉSZ, A PANELEK MÉG NEM

Új fájlok: `src/ui/szoveg.js` (feloldó), `szoveg_hu.js` / `szoveg_en.js`
(195-195 kulcs), `szoveg_sim.js` (19 enum-indexelt kulcs-tábla),
`tools/szoveg_szonda.mjs` (**14/14 szabotázst elkap**). Az `npm run szoveg`
benne van a `szonda` láncban.

**Réteghatár-döntés: a sim adjon KULCSOT, a UI oldja fel.** Az érv nem elvi
volt, hanem mért: **két `EGYSEG_NEV` tábla létezik a UI-ban ugyanarra az enumra,
és nem egyformák** (hat elemű vs. négy indexet töltő). Ugyanaz az enum, két
igazság, és egyik sem hazudik hangosan. A „UI tart párhuzamos táblát" út ezt
szabállyá tenné.

Leltár: **492 magyar felhasználói szöveg 21 UI-fájlban**, ebből 212 (43 %)
fűzött vagy behelyettesített. **A render-sáv tiszta** — ott nincs felhasználói
szöveg, azt nem kell bántani.

A `szoveg_sim.js` **híd, aminek haláldátuma van**: amíg a sim magyar szöveget
ad, ő tartja az ENUM-INDEX → KULCS táblákat, és a hűség-ellenőrzése **pirosra
fut**, ha egy sim név-tábla elcsúszik a szótártól. A panelek bekötése a
következő kör dolga — a mintakód a `szoveg.js` fejlécében áll.

Két réteghatár-sértés, amit a leltár talált, és még **nyitva van**:
- `egyedi.js` `EGYEDI_PROFIL[].nev` — a sim egy METÓDUSON ad vissza magyar szöveget
- `mentes.js` **7 magyar hibaüzenetet** ad vissza a UI-nak

---

## 10. HOL DOLGOZOL, ÉS MIT TUDSZ ELLENŐRIZNI

Változatlanul érvényes a `CLAUDE.md` táblázata. Röviden: **felhőben a
determinizmus-szonda a legfontosabb kapu, és teljes értékű**; az FPS és a
képernyőkép **nem az** — a Chrome SwiftShaderre esik, és az `fps_szonda.mjs`
szándékosan megtagadja a mérést. Ne kerüld meg, és soha ne jelents felhőben
mért FPS-t.

Az iMac-en (macOS 12, Intel — a `playwright install chromium` bukik):

```bash
export AOC_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
npm run szonda
```

---

## 11. AMI A KÖVETKEZŐ KÖRRE VÁR

A teljes, rangsorolt lista a `TODO.md`-ben. A négy legfontosabb:

1. **`npm run fps` és `node tools/kep.mjs` az iMac-en.** A v0.17 és a v0.18
   egyetlen sorát sem mérte valódi GPU. A törmelék-effekt, a tone-mapping
   egyesítése, a ködlap-követés, a sérült épületek és a **v0.16 óta ÁLLÓ, most
   újra mozgó** zászló/füst/köszörűkő látványát még senki nem **látta**.
2. **Egy forgatókönyv, amiben AI FUT és a meccs EL IS DŐL.** Ez egyszerre hozná
   a kapun belülre az „`ai.lep()` a vég után" gátat, és adna valódi terepet a
   korszakváltás mérésének. Ma a kettő kizárja egymást: ahol AI fut, a meccs nem
   dől el; ahol eldől, ott nincs AI. **Ez a 7. és a 8. pont közös gyökere.**
3. **A panelek bekötése a szöveg-rétegre** (a v0.20 első fele). A szerződés áll,
   a bekötés innentől olcsó.
4. **Böngészős ránézés minden panelre.** Az adat- és szerződés-kapuk zöldek, de
   a tördelést és a tényleges kattintásokat élőben még senki nem nézte meg.

**Kampány (v0.10/2): a tulajdonos döntése szerint EGYELŐRE NEM kell.** A
`PLAN.md`-ben nyitottként marad.

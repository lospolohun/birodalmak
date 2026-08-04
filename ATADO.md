# ÁTADÓ — AGE OF THE CRYSTALS · v0.17 (2026-08-04, Claude felhő-munkamenet)

> **Ez az egyetlen fájl, amit el kell olvasnod.** Az előző átadó a gépről szólt
> vissza a felhőbe; **ez a felhőből szól a következőnek**. A 0., az 5. és a
> **6. pont** a lényeg — a 6. nélkül ugyanabba a falba futsz, amibe ma én.

- **Verzió:** `src/core/config.js` → `VERZIO` = **`'0.18.0'`** (a `package.json`
  verziója NEM ez, és soha nem is volt az)
- **Ág:** `claude/age-of-crystals-w73aoj`
- **Kiindulási commit:** `cb814b0` — „v0.17 — a meccsnek VÉGE LEHET, és a kapu
  látja is"
- **Repók:** lásd a **6. pontot** — két fiók, és **ma az egyikbe nem lehetett
  pusholni**

> ⚠️ **EZ AZ ÁTADÓ MOZGÓ FÁRÓL ÍRÓDOTT.** A v0.17-es körben öt agent dolgozott
> párhuzamosan, és amikor ezt írtam, négyük munkája még nem volt commitolva.
> Amit a fából ellenőrizni tudtam, az itt tényként áll; a többi mellett ott a
> szó: **ellenőrizendő**. Az első dolgod: `git log --oneline -5` és
> `git status --short`.

---

## 0. Mi történt ma, és miért

### A v0.16 vádirata: „a játékot nem lehet megnyerni"

A v0.16 a JÁTÉKRÉTEG volt — nyolc UI-panel és nyolc látvány-sáv —, mert a
tulajdonos kipróbálta a motort, és azt mondta: „ez kb v0.1", „nem tudok semmit
csinálni". A panelek elkészültek, de a v0.16 átadója a nyitott adósságok élére
ezt írta:

> **A JÁTÉKOT NEM LEHET MEGNYERNI.** A simben nincs `gyoztes`, nincs `vegeTick`,
> a `lep()` a végtelenségig lép.

Egy RTS, aminek nincs vége, nem játék, hanem képernyővédő. **A v0.17 ezt zárja
le**, plusz a v0.16-ból félbehagyva maradt látvány- és balansz-tételeket.

### Amiért a győzelmi feltétel a SIMBE került, és nem a felületre

Ez a kör legfontosabb tervezési döntése. Ha a kliens döntené el („nekem már
nincs központom, kiírom, hogy vége"), akkor a v0.8 lockstepjében a két gép **két
különböző tickre** tenné a meccs végét: az egyiken még lefutna egy parancs, a
másikon már nem — és onnantól két külön meccs menne. Ezért van a
`src/sim/gyozelem.js` a sim alatt, és ezért van a `gyoztes` / `vegeTick` / `ok`
+ három csapat-jelző az `allapotHash()`-ben (`sim.js:1377`).

### A négy dolog, amit ez a kör TANÍT

1. **A determinizmus-kapu itt nézett volna félre a legcsúnyábban.** A győzelmi
   réteg az első alrendszer, amit a determinizmus önmagában NEM tud igazolni:
   **egy soha el nem dőlő meccs bitre tökéletesen reprodukálható.** Ugyanaz a
   csapda, ami a v0.3-nál elsült. Ezért a 14. vizsgálat nemcsak hash-t vet
   össze, hanem azt is méri, hogy a meccs **tényleg véget ér**.
2. **A parancs-elutasításnak a VÉGREHAJTÁSNÁL a helye, nem a beadásnál.** A
   beadás (`Sim.parancsTickre`) a hálózatról tetszőleges HELYI pillanatban
   érkezik: az egyik gép az 1000. ticknél tart, a másik az 1060.-nál, amikor
   ugyanaz a csomag befut. Ha a beadás dobná el a parancsot a `vege` alapján,
   az egyik gép sorba tenné, a másik nem — pont az a desync, ami ellen az egész
   réteg szól. A szűrő ezért a `parancsok.js` `vegrehajt()`-jának ELSŐ sorában
   van (`parancsok.js:80`).
3. **A gát a SAJÁT ellenőrzésében fogott hibát.** Első futásra kiderült: a vég
   utáni feladást az általános kapu dobja el, tehát az `elutasitottParancs` nő,
   nem a `feladasElutasitva`. Az utóbbira épített gát **örökre nullán állt
   volna, zölden.**
4. **„VOLT központja", nem „nincs központja".** A `Sim` konstruktora után,
   felállás ELŐTT egyetlen épület sem áll, és a szonda 13. vizsgálata ilyen
   simeket gyárt tucatszám. A puszta „nincs központja" szabálytól minden ilyen
   világ a 0. ticken döntetlenre futna — a meccs úgy érne véget, hogy el sem
   kezdődött.

### És egy régi néma hiba, ami mellékesen került elő

Az `epuletAnyag()` `aocIdo` uniformját **senki nem frissítette**: a lengő
zászló, a szálló füst és a forgó köszörűkő **a v0.16 óta ÁLLT**. Ez a fajta hiba
az, amire se a determinizmus-kapu, se a panel-szondák nem tudnak ránézni — csak
a szem, valódi GPU-n.

---

## 1. Indítás

```bash
git checkout claude/age-of-crystals-w73aoj && npm install && npm run dev
```

| parancs | mit csinál | hol fut |
|---|---|---|
| `npm run det` | determinizmus, **14 vizsgálat** | mindenhol ✅ |
| `npm run ikon` | ikon-készlet (sim-enumokból) | mindenhol ✅ |
| `npm run panelek` | mind a 8 UI-szonda | mindenhol ✅ |
| `npm run menu` `civ` `hang` `halo` | v0.11 / v0.12 / v0.8 | mindenhol ✅ |
| `npm run kiadas` | statikus kiadási elvárások | mindenhol ✅ |
| `npm run fps` | FPS-mérés | **CSAK valódi GPU-n** |
| `node tools/kep.mjs` | képernyőkép | **CSAK valódi GPU-n** |

⚠️ **Felhőben az FPS és a képernyőkép ÉRTELMETLEN** (SwiftShader). Az
`fps_szonda.mjs` szándékosan megtagadja a mérést — ne kerüld meg, ne írd át a
szűrőt, és **soha ne jelents felhőben mért FPS-t eredményként.**

⚠️ A `npm run det` mostanra **~8 perc** (a 12. vizsgálat nyolc civ-meccset
futtat 16 000 tickig). Ne gondold, hogy megállt.

---

## 2. Mi van kész a v0.17-ben

### SIM — a meccs vége (a P0 lezárva)

Új réteg: **`src/sim/gyozelem.js`**. A központ elvesztése és a feladás zárja a
meccset, **mindkettő ugyanazon az egy soron keresztül** — két helyen kimondott
„vége" két helyen elromolható szabály.

- `gyoztes` / `vegeTick` / `ok` + `voltKozpont` / `feladta` / `kiesett`, mind az
  `allapotHash()`-ben;
- a `lep()` a vége után is **lép**, csak parancsot nem fogad el. Három okból:
  a render a tickek közt interpolál (egy megálló sim a levegőben álló lövedékkel
  merevedne ki); a statisztika és a mentés ÉLŐ simből olvas; és a megállás
  DÖNTÉS, aminek a helye a meccs-hurok, nem a sim;
- új `feladas` parancsfajta;
- `mentes.js` `MENTES_VERZIO` **4 → 5** — enélkül egy lejátszott meccs a
  betöltés után **futóként támadt fel**;
- `panel_statisztika_adat.js` `vegallapot()`: `hivatalos: true`, ha a sim
  kimondta. **A de facto olvasat szándékosan MEGMARADT** — a két feltétel nem
  ugyanaz, és egy hazug „még fut" rosszabb, mint egy bevallottan nem hivatalos
  állás-olvasat.

### QA — a determinizmus-szonda 14. vizsgálata

Reprodukálva ebben a munkamenetben (a részletes jegyzőkönyv:
**`qa/V0.17_EREDMENY.md`**):

```
a meccs véget ért    tick 1867 — elvesztette a központját
feladás              tick 751 — feladta a meccset
vég utáni parancs    10 elutasítva (a forgatókönyv szándékosan ad be ilyet)
kész meccs mentése   0x472a9c23 → betöltve 0x472a9c23
```

### SIM/AI — balansz

- **Korszakváltás: 0 → 11** (14 mért oldalon, legkorábbi t=9105). Kiderült,
  hogy a gép nem KÉSETT: az `ai.js`-ben **nem is létezett `korszak`
  parancsfajta-ág**. ⚠️ Ezt a számot a szonda NEM írja ki — lásd az 5. pontot.
- **Az `AI.lep()` a meccs vége után is dolgozott.** 16 000 tickig 61 építési
  parancsból **49 azonnal a kukába ment**; a v0.8 lockstepjén ezek a HÁLÓZATON
  is végigmentek volna. Gát: `ai.js:481`.
- **Technológia:** a hatból négy az 1. korban nyílt. Újraosztva (kristály =
  páncélozás, fény = falazás). ⚠️ **Nem bővítve** — egy hetedik sor a UI hat
  elemű tábláit betölthetetlenné tenné.
- **Étel-szűke:** fix munkás-arány helyett készlet-visszacsatolás. Pangó készlet
  950/1070 → **480/500**, átváltott kimenet +20 % / +35 %.
- **Civ-balansz tükör-kontrollal** (ugyanaz a seed, ugyanaz a felállás, az
  egyetlen különbség a bónusz): Hegyi bányász −12,6 % → **−1,3 %**, Folyami
  kereskedő +40,0 % → **+15,8 %**, a szórás −67 %.

### RND — látvány

- **Tone-mapping egy csővezetékre.** Napszak-váltásnál a terep feketébe fordult,
  a figurák nem — mert a figurák `toneMapped:false`-szal mentek, a terep ACES-en.
- **A ködlap követi a kamerát** (a pálya sarkánál a kamera a lap ALÁ került). A
  köd HELYE változatlanul sim-oldali adat.
- **Kapu `nyitva` + épület-sérülés** a rész-táblás rendszer negyedik
  csatornájaként: **nulla új rajzhívás, nulla futásidejű geometria-építés.**

### UI/QA

- **favicon adat-URI-ként** — megszünteti az örök „1 konzol-hiba" hamis
  riasztást, és nem töri meg a „nincs képfájl" ígéretet.
- **`bevitel.celPont()` publikus**; a `_celPont()` `@deprecated` átirányítás
  maradt, hogy a régi hívások ne törjenek.
- **`VERZIO` `'0.10.1'` → `'0.18.0'`.** A konstans a v0.10/1 óta nem lett
  léptetve, tehát a `CLAUDE.md` szerinti „mérvadó verzió" hét körön át hazudott.
- **A verzió-számozás átrendezve.** A v0.13–v0.15 **nyugdíjazott szám**: a
  fejlesztés a v0.12-ről a v0.16-ra ugrott, a panel-kör már annak a nevén
  született. A tartalmuk hátrébb került — QA-kör → v0.19, nyelvek → v0.20,
  kirakás → v0.21 —, és a `PLAN.md` `kimaradt` sorral jelöli a három számot.
  ⚠️ A kiadás-ellenőrző 21. elvárása ezért kapott `kimaradt`-kivételt: e nélkül
  a 21. és a 25. (hézagmentesség) egymásnak feszült.

---

## 3. Mérve — ÉS AMI NEM LETT MÉRVE

### `npm run det`: **14/14 RENDBEN** · `npx vite build`: hibátlan (95 modul)

A teljes jegyzőkönyv a hash-ekkel: **`qa/V0.17_EREDMENY.md`**.

| mérés | érték |
|---|---:|
| sim tick-költség 1600 egységnél | 0,652 ms |
| parancs-tüske (1600 egység egy menetparancsra) | 3 ms |

### ⚠️ `npm run fps` NEM FUTOTT — a v0.17 egyetlen sorát sem mérte valódi GPU

Nincs GPU a felhőben. Ez **nem mulasztás**: az `fps_szonda.mjs` megtagadja a
mérést SwiftShaderen, mert a hamis szám rosszabb, mint a hiányzó. Ugyanezért
nincs képernyőkép sem — **a v0.17 látvány-változásait még senki nem LÁTTA.**

**Az iMac-en le kell mérni**, és a mérés előtt megnézni a load average-t:

```bash
export AOC_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
npm run fps && node tools/kep.mjs
```

Viszonyítási pont a v0.16-ból (iMac, ANGLE/Metal, AMD Radeon R9 M380,
terheletlen gép): **p95 10,3 ms @1600 egység · 158 FPS · 499 k háromszög · 112
rajzhívás**, a kapu ≤ 16,7 ms. Az épület-sérülés kb. **+12 k háromszöget** tesz
hozzá, aminek kétharmada ép állapotban elfajult — **de ez becslés, nem mérés.**

### ⚠️ A TICK-IDŐT SE HASONLÍTSD KORÁBBI ALKALMAKHOZ

A 0,652 ms **tiszta CPU**, tehát csábító azt hinni, hogy összevethető. Nem az: a
felhő-gép osztott CPU-n fut. Mérve, ugyanaz a kód ugyanazon a napon: **0,58 ms
reggel, 0,88 ms este.** A közé beírt „optimalizálás" 32 %-os romlásnak látszott,
holott a kód nem is számított. **A tick-idő EGY FUTÁSON BELÜL összehasonlítható**
(A/B, `git stash`-sel), két alkalom között nem.

---

## 4. A négy szabály, amit ne írj felül

1. **A `src/sim/` alatt a determinizmus mindent felülír.** Nincs
   `Math.sin/cos/atan2/pow/exp/log/hypot`, `Math.random`, `Date.now`, `three`,
   DOM, sorrendfüggő objektum-iteráció. **Ha a `det` bukik, NE a szondát írd át.**
2. **A determinizmus-kapu NEM működés-kapu.** A semmittevés tökéletesen
   reprodukálható. Ez a projekt **hétszer** égett meg zöld kapu melletti halott
   rendszeren, és a v0.17 volt a nyolcadik esély rá. Minden új alrendszerhez
   kell egy SZÁM, ami elárulja, hogy tényleg csinál is valamit — és a gátat KI
   KELL PRÓBÁLNI SZABOTÁZZSAL.
3. **A render sosem ír vissza a simbe**, és ne is TALÁLGASSA, honnan van a sim.
   Hatni egyetlen úton lehet: `sim.parancs({ … })`. Ami megkerüli a
   parancs-sort, az a lockstepen nem megy át.
4. **A panel a gyökerén kívülre nem nyúl**, saját CSS-fájlja van, minden
   osztályneve a panel nevével kezdődik, és a `frissit()`-je nem allokál. A
   teljes szerződés: `INTERFACES.md` → „v0.16 — A JÁTÉKRÉTEG SZERZŐDÉSE".

**Plusz egy ötödik, amit a v0.17 tett hozzá:** ha ÚJ parancsfajtát veszel fel,
**vedd bele a determinizmus-forgatókönyvbe is.** A szonda forgatókönyvekből
dolgozik, magától nem találja meg az új kódot — különben a legfrissebb, tehát
legkockázatosabb kód marad a kapun kívül, és a zöld szonda hamis
biztonságérzetet ad. A forgatókönyv a FELÁLLÁST is megszabhatja
(`fk.egysegSzam`, `fk.felallas`): a v0.17-es kör 60 egységgel indul, mert
ostromgép kell a központhoz, a v0.1-es 1600-as stressz-felállás pedig a képzést
mindig elutasításba futtatná.

---

## 5. Nyitott adósságok, prioritás szerint

A teljes, jelölt lista a **`TODO.md`**-ben. A négy legfontosabb:

1. **`npm run fps` és `node tools/kep.mjs` a v0.17-en.** Amíg ez nem futott le
   valódi GPU-n, a v0.17 nincs lezárva. Az egész látvány-sáv (tone-mapping,
   ködlap, sérült épületek, újra mozgó zászló) **mérés és látás nélkül** van a
   fán.
2. **Örökölt, NEM javított: a munkások VÉGLEG tétlenné válnak**, ha a bázistól
   `LELOHELY_SUGAR = 60`-on belül kimerülnek a lelőhelyek. Mérve 12-ből 5 a
   seed 20260804 / v0.6-os futáson. **Ez most lett igazán fájó**: a győzelmi
   feltétellel végre végig lehet játszani hosszú meccseket, és pont azokat öli
   meg. ⚠️ A szonda „navigáció nélkül álló munkás: 0" invariánsa **nem fogja
   meg** — a beragadt munkásnak VAN navigációja, csak nincs hová mennie.
3. **A `BOSEG` konstans késélen áll** (`ai.js:141`, ma 700). 500-nál a nehéz gép
   a **12 994.** tickre lerombolja a könnyű bázisát; 700-nál a 16 000. tickig
   nem dől el. A t=8000-es termelési számok a kettő között betűre azonosak — a
   különbség nem a gazdaságban van, hanem abban, melyik oldalra dől egy szoros
   csata. **A v0.17 óta ez kockázat is:** ha a szám 500 felé csúszik, a v0.6-os
   szonda-kör közben VÉGET ÉR, és minden utána mért szám egy halott meccsből jön.
4. **A `gyozelem.felad()` `this.vege` ága a parancs-útról elérhetetlen** — a
   `parancsok.js:80` általános kapuja előbb elfogja. **Nem hiba** (a mélységi
   védelem helyes), de tudni kell róla: a `feladasElutasitva` számláló kész
   meccsen nem nő, és aki lefedettséget mér, holt kódnak fogja látni.

⚠️ **Két szám, ami a KAPUN KÍVÜL van**, tehát ha elromlik, semmi nem szól:
a gép korszakváltás-száma (a 9. vizsgálat nem írja ki) és a beragadt munkások
száma. Mindkettőnek a szonda kiírásában lenne a helye.

---

## 6. ⚠️ A GITHUB-HELYZET — EZ NÉLKÜL A KÖVETKEZŐ MUNKAMENET FALNAK MEGY

A fejlesztés hivatalos otthona a **`lospolosadwords-dev/age-of-the-crystals`**
repó. **A mai felhős munkamenet oda NEM tudott pusholni**, és nem egy, hanem
KÉT úton bukott el:

- `git push origin …` → **403**;
- a repó csatolása a munkamenethez → a rendszer **„cross-tier" hibával
  elutasítja**.

### Amit ma tettünk helyette

A munka a **`lospolohun/birodalmak`** repó **`claude/age-of-crystals-w73aoj`**
ágára ment fel. Ez működik, mert a felhő-munkamenet ezt a fiókot látja. **A két
repónak KÖZÖS a története** — a régi közös ős a `c53bb46` („LEZÁRÁS — a
kiadás-ellenőrző három valódi hibát fogott"), tehát a két ág `git merge`-dzsel
minden további nélkül összeér.

### Amit a GÉPEN (iMac, `lospolosadwords-dev`-vel bejelentkezve) csinálni kell

```bash
git remote add birodalmak https://github.com/lospolohun/birodalmak.git   # ha még nincs
git fetch birodalmak claude/age-of-crystals-w73aoj
git merge birodalmak/claude/age-of-crystals-w73aoj
# és utána, hogy az origin is utolérje magát:
git push origin claude/age-of-crystals-w73aoj
```

**A helyi ref-ek szerint ez ma nem is igazi összefésülés, hanem
gyorsítás (fast-forward):** az `origin/claude/age-of-crystals-w73aoj` a
`19d31cf`-en áll (a v0.16-os átadó), a `birodalmak/claude/age-of-crystals-w73aoj`
pedig a `cb814b0`-n, és a kettő között `git log origin..birodalmak` pontosan egy
commitot mutat, visszafelé egyet sem. ⚠️ **Ellenőrizd** — ha a gépen közben
született commit, ez már valódi merge lesz.

### A helyzet mögötti ok, és a TARTÓS megoldás

A tulajdonosnak két fiókja van:

| fiók | mit lát | repó |
|---|---|---|
| `lospolosadwords-dev` | a gépen a `gh` EZZEL van bejelentkezve | `age-of-the-crystals` |
| `lospolohun` | a Claude felhő-munkamenet CSAK EZT látja | `birodalmak` (nyilvános) |

Ez oda-vissza fáj: a **gépről** a `lospolohun/birodalmak`-ba nem lehet pusholni
(„Permission to lospolohun/birodalmak.git denied to lospolosadwords-dev"), a
**felhőből** pedig a `lospolosadwords-dev/age-of-the-crystals`-ba nem (403 +
cross-tier). Amíg ez így van, **minden munkamenet kézzel fésül**.

Tartós megoldás (amíg nincs meg, ez újra és újra elő fog jönni): a Claude GitHub
App engedélyezése a `lospolosadwords-dev` fiókra
(<https://claude.ai/admin-settings/claude-in-slack>), **VAGY** a projekt átvitele
egyetlen fiók alá.

---

## 7. Ha valami elromlik

- `npm run det` → megmondja a PONTOS ticket, ahol a két futás széttart, és a
  14. vizsgálat azt is, ha a meccs nem ér véget.
- `npm run kiadas` → statikus elvárások, másodpercek alatt. Ez fogta meg a
  v0.16 rövid tábláit (`FIGURA`, `SUGAR`), amik `TypeError`-t dobtak volna a
  rAF-hurokban.
- `npm run panelek` → mind a nyolc UI-szonda, szabotázs-kontrollal.
- `npm run halo` → két valódi kliens, valódi socket, és a végén szándékosan
  elrontja az egyik oldalt, hogy lássa, elsül-e a desync-detektor.

---

## 8. ⚠️ Amit erről a körről tudnod kell, mielőtt bármit hozzáírsz

Ez a v0.17-es kör **öt agenttel, egy fán, párhuzamosan** ment, diszjunkt
fájlkészlettel (a szerződés: `INTERFACES.md`). Amikor ez az átadó íródott,
a `cb814b0` volt az egyetlen commit, a többi agent munkája még a
munkakönyvtárban állt. A `git status` akkor ezeket mutatta módosítottként:

`PLAN.md` · `src/render/effekt_keszlet.js` · `src/render/gazdasag3d.js` ·
`src/sim/epuletek.js` · `src/sim/kepzes.js` · `src/sim/parancsok.js` ·
`src/ui/bevitel.js` · `src/ui/kijeloles.js` · `tools/kiadas_ellenorzo.mjs` ·
`tools/panel_statisztika_szonda.mjs` · `vite.config.js`

Amit ezekből olvasni lehetett, és amit **ELLENŐRIZNED KELL**:

1. **Az épület-sérülés bekötése rendbe kerül.** A v0.16/2 a látványt
   megcsinálta, de az ADAT egy `Material.onBeforeRender` kerülőúton jutott oda,
   ami rajzoláskor futott és a simet a `window.__aoc.jatek.sim`-ből találgatta.
   A `gazdasag3d.js` mostani változata a példány-hurokba viszi be — egy
   bejárás, egy sorrend, egy igazság. **Ha ez bement, a `TODO.md` megfelelő
   tétele lezárható.**
2. **Az épület-kattintás (`bevitel.epuletKereso`) megkapja a render-oldali
   válaszát** ugyanott (`epuletTalalat()`). Ezzel az épület-kijelölés a `V`
   billentyűn túl egérrel is működne.
3. **Képzési sor törlése bekerül a simbe** (`kepzes.js` + `parancsok.js`
   `kepzes_torles`), **visszatérítés NÉLKÜL** — az érték a népesség- és
   sor-hely felszabadítása, nem a nyersanyag. ✅ **A v0.17/v0.18 névütközés
   eldőlt: a `VERZIO` `0.18.0`.** A szonda 14. vizsgálata a v0.17 (a meccs
   vége), a 15. a v0.18 — a `VERZIO` a legutóbb elkészült kört jelöli, tehát a
   `kepzes.js`/`parancsok.js` fejléc-jelölése helyes.
4. ✅ **A kiadás-kapu ELŐSZÖR teljesen zöld: 61/61, nulla figyelmeztetés.**
   A `base` relatív (`'./'`), a `PLAN.md` `DÖNTÉS:` sora rögzíti. ⚠️ Ez STATIKUS
   kapu: az FPS-t, a UX-végigjátszást és a balanszt szerkezetileg nem látja —
   azok a v0.19-es QA-kör tételei, és GPU-s gép kell hozzájuk.

**És a legfontosabb: futtasd le újra a `npm run det`-et a teljes, összeállt
fán.** Az én 14/14-em a `cb814b0`-ra vonatkozik, plusz a `VERZIO` egysoros
változására — a fenti tételek EGYIKE SEM volt benne.

# PORTAL HUB TYCOON — QA-KÖR ÉS FELÜLET-HANGOLÁS

Dátum: 2026-08-05 · környezet: **felhő** (Chromium/SwiftShader, GPU NÉLKÜL) ·
verzió: `portal/src/mag/config.js` → `VERZIO = 1.0.0` ·
hajtóprogram: egyszer használatos Playwright-kör (nem szonda), 1280×800,
`?seed=777&nehez=konnyu`, plusz a `tools/bongeszo_szonda.mjs`.

**Mit csináltam:** végigkattintottam a játékot böngészőből — bevezető ablak,
nyolc építés-fül, tizenhárom épület, nyolc dolgozó, mind a kilenc panel, a
„Ki áll itt?" cellanézet, épület-panel, bérbeadás, kutatásindítás,
kapunyitás, emelet (R/F), tizenegy játéknap előre, fejezetváltás, esemény,
mentés, régi mentés, betöltés. Közben javítottam a `src/ui/**`-t.

**Mit NEM mértem:** sebességet, FPS-t. A felhőben nincs GPU. Az egyetlen
sebesség-jellegű szám, ami itt szerepel (ms/képkocka), kizárólag azért van
benne, mert egy MÁSIK hiba tüneteként jelentkezett — lásd a **K1** tételt —,
és nem a játék teljesítményének ítélete.

> ⚠️ **A mérés alatt két másik ügynök dolgozott** a `src/render/` (textúrák) és
> a `src/audio/` (SFX) alatt, élőben. A `portal/src/render/texturak.js` és az
> `allomas3d.js` percenként változott, a build kétszer bukott el egy félkész
> `audio/hang_ter.js` importon. Amit ebből láttam, azt felírtam, de **nem
> javítottam** — nem az én sávom.

---

## 0. ÖSSZEFOGLALÓ

| súlyosság | db | mi |
|---|---|---|
| **kritikus** | 3 | összeomló panel · eltűnő szünet gomb · elnyelt kattintás |
| **súlyos** | 4 | adatvesztő fájl-betöltés · hazudó bérbeadás-szöveg · hazudó tanácsadó · játszhatatlan dolgozó-panel |
| közepes | 8 | felfedezhetőség, olvashatóság, formázás |
| kicsi | 5 | apróságok |
| **más sávban** | 3 | render/audio — csak jelentve |

A kritikus és a súlyos tételek mind **javítva**, kivéve amit külön jelzek.
Minden javítás a `src/ui/**` + `src/ui/stilus.css` + `index.html` +
`tools/bongeszo_szonda.mjs` fájlkészleten belül maradt.

---

## 1. KRITIKUS

### K1 · A „Ki áll itt?" panel MEGÁLLÍTOTTA A JÁTÉKOT

**Mit csináltam:** a 👆 Kéz eszközzel egy üres, járható padlócellára
kattintottam, ahol utasok álltak.
**Mit vártam:** megjelenik az ott állók terve, hangulata, türelme.
**Mi történt:** `ReferenceError: FAJOK is not defined`. A `panelek.js`
használta a `FAJOK` tömböt (`_cella()`, 322. sor és `fajLista()`), de **soha
nem importálta**.

Ez nem „egy panel nem működik". A `_epit()` a `fo.js` fő hurkából fut, ott
pedig kivétel-védelem van, ami *helyesen* megállítja a szimulációt:

> „Hiba történt, a világ megállt. Mentsd fájlba (💾 panel)…"

Vagyis **egyetlen kattintás egy üres padlóra megfagyasztotta a partit** — és
utána minden képkockán újra, mert a panel nyitva maradt. A böngésző-szonda
ezt nem fogta meg: a hét panelt az oldalgombokról nyitja, a cellanézetet
pedig csak vászonra kattintással lehet előhívni.

**Javítva:** `import { FAJOK } from '../sim/lenyek.js';`
**Ellenőrizve:** a QA-kör 7. szakasza megnyitja a cellapanelt, tartalmat kap,
és a teljes körben **nulla konzol-hiba**.

### K2 · 1280 px-es ablakban ELTŰNT a szünet gomb és a hangkapcsoló

**Mit csináltam:** elindítottam a játékot 1280×800-as ablakban.
**Mit vártam:** a felső sáv minden vezérlője elérhető.
**Mi történt:** a hat szám + a szintválasztó + a négy sebesség-gomb nem fért
ki egy sorba, a `#felso { flex-wrap: wrap }` pedig a **sebesség-gombokat és a
hangkapcsolót a második sorba** tette — pontosan oda, ahol a fejezet-kártya
áll (`top: 56px` fix). A kártya ráült a gombokra, tehát **a játékot egérrel
nem lehetett megállítani** egy tipikus laptop-ablakban. (Szóközzel igen — de
azt honnan tudná?)

**Javítva, két rétegben:**
1. `@media (max-width: 1439px)` — eltűnik a HUD-ból a játék NEVE (a lapfülön
   úgyis ott van, és semmilyen döntést nem támogat) és a „SZINT" felirat;
   1120 px alatt a kitöltés és a sávok is szűkülnek.
2. A `hud.js` **megméri** a felső sáv magasságát (50 képkockánként egyszer),
   és a `--felso-magas` CSS-változóba írja. A bal oszlop, az oldalgombok és a
   panel ehhez igazodik. Így akkor sem takar ki semmit, ha egy még keskenyebb
   ablakban mégis tördel — fix képpont ezt sosem tudná lekövetni.

**Mérve:** a felső sáv magassága 1280 px-en 83 → **47 px**, egyetlen sor,
minden vezérlő látszik.

### K3 · Az ESEMÉNY-ABLAK elnyelte a kattintást — MIKÖZBEN FUTOTT AZ IDŐ

**Mit csináltam:** a panelek végigjárása közben feljött egy esemény-ablak.
**Mit vártam:** az esemény nem szakítja meg a játékot (a `modalok.js`
fejléce ezt ígéri: „az esemény-doboz mellett fut tovább minden").
**Mi történt:** a teljes képernyős `#fatyol` `pointer-events: auto` volt, és
**minden kattintást elnyelt** — oldalgombot, építés-sávot, mindent. A
Playwright 30 másodpercig próbálkozott, majd elhasalt:
`<div id="fatyol" class="nyitva"> intercepts pointer events`.

Ez a lehető legrosszabb kombináció: az idő megy, a világ romlik, a játékos
pedig nem tehet semmit, csak az eseményre válaszolhat. A szándék pont az
ellenkezője volt.

**Javítva:** eseménynél a fátyol átengedi a mutatót (`pointer-events: none`,
csak maga az ablak fog kattintást), nem életlenít, halványabb, és **alulra
húzódik** — ott takar a legkevesebbet a játéktérből, és nem is téveszthető
össze a történet-ablakkal, ami viszont TÉNYLEG megállítja az időt.
**Ellenőrizve:** a QA-kör 15b. szakasza `elementFromPoint`-tal méri, hogy az
esemény-fátyol mellett az oldalgomb elérhető → **igen**.

---

## 2. SÚLYOS

### S1 · A fájlból betöltés NÉMÁN FELÜLÍRTA a játékos 3. mentését

**Mit csináltam:** 💾 panel → „⬆ Betöltés fájlból".
**Mit vártam:** betöltődik a fájl, a mentőhelyeim érintetlenek.
**Mi történt:** a `tarolo.js` a fájl tartalmát a `kulcs(HELYEK)` = **`pht:hely3`**
kulcsra írta, mert az újratöltéses betöltéshez kell egy hely, ahonnan a boot
felveszi. A 3. kézi mentés tehát figyelmeztetés nélkül elveszett.

**Javítva:** saját, `pht:fajl` kulcs. A `kulcs()`, a `betolt()`, a `torol()`
és a `kertBetoltes()` ismeri, a mentőhely-lista nem.

### S2 · A bérbeadás-panel 42 %-ot ígért, a valóság 60 % volt

**Mit csináltam:** 👆 Kéz → Bolt → „🤝 Bérbeadás".
**Mit vártam:** a leírásban az az arány, ami tényleg történik.
**Mi történt:** „a forgalom bevételének csak **42 %**-a marad nálad" — a
`BERLET_RESZESEDES` viszont **0,60** (egy egyensúly-hangolásban 0,42-ről ment
föl, lásd `qa/EGYENSULY.md` 5.3). A felület tehát rosszabbnak mutatta a
döntést, mint amilyen — egy visszafordítható, de fontos döntésnél.

**Javítva:** a szöveg a `config.js`-ből számol (`BERLET_RESZESEDES`,
`BERLET_NAPIDIJ`), kiírja mindkét oldalt, a napi fix díjat és a megspórolt
bér nagyságrendjét is.

**Ráadás ugyanitt:** a felület a **mosdóra és a seprűparkolóra is** kirakta a
Bérbeadás gombot, a sim viszont elutasítja (`t.szemelyzet === 0`). Egy gomb,
aminek nincs helyes használata. A UI feltétele most pontosan a sim feltétele.
**Ellenőrizve:** `wc` → gombok: `Kikapcsolás | Bontás`; `bolt`, `etterem` →
`Bérbeadás | Kikapcsolás | Bontás`.

### S3 · A tanácsadó a MÁSODPERC NULLÁN hazudott egyet

**Mit csináltam:** új játszást indítottam, és megnéztem a 💡 Tanácsadót.
**Mit vártam:** „nincs sürgős tennivaló".
**Mi történt:** `baj` szintű riasztás — „1 épület személyzet nélkül …
**15 %-on üzemel** … sorba állítja a vendégeket". Az épület az **ingyen
kapott energiamag** volt. Csakhogy az `_energiaSzamol()` szerint a szerelő
nélküli energiamag **78 %-on termel**, és nem áll benne sor.

Egy tanácsadó, aminek az első mondata sem igaz, elveszíti a hitelét — és
utána a valódi riasztásait sem olvassák el. Ez pontosan az a hiba, amit a
`tanacsado.js` fejléce meg akart előzni.

**Javítva:** a szabály kettévált. `baj` = **kiszolgáló pult** (`t.igeny`)
személyzet nélkül — az tényleg sorba állítja a vendégeket. `gond` =
háttér-épület, saját, IGAZ szöveggel (a karbantartó mérnök nélkül
egyáltalán nem farag az instabilitáson, a takarítókamra nem takarít, az
energiamag 78 %-ot termel).
**Mérve, 11. nap:** „3 pult személyzet nélkül" (baj) + „1 háttér-épület
személyzet nélkül" (gond) — az indulásnál pedig már nincs `baj`.

### S4 · A Dolgozók panel a végjátékban játszhatatlan volt

**Mit csináltam:** megnyitottam a 👷 panelt.
**Mit vártam:** látom, kinek nincs munkája, és be tudom osztani.
**Mi történt:** a panel MINDEN dolgozóhoz kirakott egy `<select>`-et az
összes hozzá illő épülettel, és **fél másodpercenként újraépítette az
egészet**. Nyolc dolgozónál még elmegy; az `qa/EGYENSULY.md` szerint egy
győztes állomáson **51–136 dolgozó** van. Az százas nagyságrendű legördülő,
ezer `<option>`-nel, **másodpercenként kétszer** újraépítve — a görgetés is
elveszett, mert az újraépítés visszaugrott a lista tetejére. És a legfontosabb
szám, hogy **hányan ülnek tétlenül**, sehol nem látszott.

**Javítva:** szakmánkénti csoportosítás (a döntés is szakmánként születik:
„kell-e még egy mérnök?"), egyszerre egy szakma nyitva, a **tétlenek elöl**,
szakmánként „N üres hely" jelzővel, és egy „Tétlenek beosztása" gomb, ami
csak a MEGLÉVŐ `beoszt` parancsot adja ki rögzített sorrendben (tehát a
mentés/visszajátszás számára közönséges parancssorozat). Egy szakmán belül
24 sor után „…és további N".
**Mérve:** zárt állapotban **0 `<select>`** a panelen (volt: annyi, ahány
dolgozó); kinyitott szakmánál 2.

---

## 3. KÖZEPES — felfedezhetőség és visszajelzés

### M1 · Emeletet senki nem talál ki magától
**Mit csináltam:** 🪜 Szintek → Mozgólépcső → lerakás a földszinten.
**Mi történt:** „a fölötte lévő szinten is kell hozzá szabad, kiépített
padló". A mondat IGAZ, de nem mondja meg, mit csinálj. A helyes sorrend
(R → 1. emelet → padlót oda → F → ide az átjáró) sehol nem volt leírva.
**Javítva:** benne van a Súgóban külön tételként, a „🪜 Szintek" fül
buborékjában, és az átjáró-épületek (`t.atjaro`) saját buborékjában.

### M2 · A szürke építés-gombról nem derült ki, MIÉRT szürke
**Mi történt:** a tiltott gomb 40 %-os átlátszó volt, és csak KATTINTÁSRA
mondta meg az okot.
**Javítva:** minden gombon külön sor az ok — „🔒 Mélyszkennelés kell hozzá"
vagy „még 3 220 💎 kell" —, és a tiltott gomb szaggatott kerettel, 55 %-on
látszik (olvasható marad: aki most tanulja a játékot, annak látnia kell, mi
LESZ elérhető).

### M3 · A tanácsadó pontosan annyira látszott, mint a súgó
**Mi történt:** a 💡 kilenc egyforma ikon egyike volt. A `.pont` jelző stílus
**a CSS-ben megvolt, de soha senki nem tette ki** — holt kód.
**Javítva:** a 💡 gombon számláló-jelzőpont (sárga = gond, piros + lüktetés =
baj), és `baj` szintnél egy **riasztás-csík** a bal oszlopban a legsúlyosabb
tanács címével, kattintásra megnyitja a panelt. Csak `baj`-nál jelenik meg,
és **az első napon egyáltalán nem** — ott a bevezető a kalauz, két versengő
„ezt csináld most" doboz ugyanabban az oszlopban pont az a zsúfoltság, ami
ellen az elrendezés készült.

### M4 · A HUD hat száma állítólag válaszlépésre hívott — de nem vitt sehova
**Javítva:** mind a hat kattintható, és abba a panelbe visz, ahol a válasz
megszületik (pénz → Statisztika, nap → Napló, hírnév → Tanácsadó, utas →
Bestiárium, energia/tisztaság → Tanácsadó). A buborék kiírja, mit jelent a
szám ÉS mi a válaszlépés. A hírnév mellé ▲/▼ irányjelző került: a „62"
egészen mást jelent 40-ről jövet, mint 85-ről csúszva.

### M5 · Az energia-szám nem szólt, MIELŐTT baj lett
**Mi történt:** `⚡ 50/203` — melyik melyik? És a jelzés csak akkor gyulladt
ki, amikor MÁR áramszünet volt.
**Javítva:** `50 / 203` (fogyasztás / termelés, a buborékban kiírva), és a
címke **88 % fölött már sárga** — a következő épület vinne áramszünetbe.

### M6 · A kutatási panel nem arra a kérdésre válaszolt, amiért megnyitják
**Mi történt:** katalógus-sorrend, a kikutatott tételek a lista tetején, a
megvehető valahol a közepén.
**Javítva:** három csoport — „Most elindítható" / „Zárva — előbb az
előfeltétele kell" / „Kikutatva" —, áron belül olcsóbb elöl. A zárt tételnél
ott a hiányzó előfeltételek NEVE és az **összes ár idáig** (enélkül a 12 000-es
legendás kapunyitás olcsóbbnak látszik, mint amennyibe tényleg kerül). A
letiltott gombon buborék: „Ehhez 800 💎 hiányzik" / „Egyszerre egy kutatás".

### M7 · A súgó irányítás-táblázata a szöveg végén, egy bekezdésben volt
**Javítva:** előre került, kulcs–jelentés táblázatba, az **R / F** kiemelve.

### M8 · Régi mentés → néma „üres" hely
**Mit csináltam:** kézzel raktam egy v1-es mentést a 3. helyre.
**Mit vártam:** érthető hibaüzenet (a v3 óta a v1/v2 szándékosan
olvashatatlan, mert a rács 64×48 → 96×72-re nőtt).
**Mi történt eredetileg:** a `tarolo.lista()` `null`-t adott, a panel
„üres"-t írt — a játékos azt hitte, a mentése eltűnt.
**Javítva:** a lista visszaadja a hiba OKÁT is, a panel pedig kiírja:
> „3. hely — ⚠️ nem olvasható. Ez a hely nem tölthető be: ismeretlen
> mentésformátum (v1), ez a verzió v3-ig olvas. A régi mentések a rács
> megnövekedése miatt nem olvashatók — a »Törlés« felszabadítja a helyet."

**Ellenőrizve:** pontosan ez a szöveg jelenik meg a QA-kör 14. szakaszában.

---

## 4. KICSI

| # | mi | javítva |
|---|---|---|
| A1 | A súgóbuborék BENNRAGADT, ha az egeret a vászonról a felületre húztad — a kezdőképernyőn épp a fejezet-kártyát takarta ki (lásd a régi `qa/bongeszo.png`-t). A cellát csak a vászon fölötti mozgás frissíti, a buborék helyét viszont az ablak-szintű `pointermove`. | igen — a HUD tudja, hogy a mutató a felületen van-e |
| A2 | Az elutasítás ugyanúgy nézett ki, mint az örömhír. | igen — a `gond`/`baj` üzenet saját háttérrel, `⚠`/`✖` előtaggal, hosszabb ideig (7,5 / 9 mp) marad kint, és nagybetűvel kezdődik |
| A3 | Egy esemény drága válaszgombja letiltva, indoklás nélkül. | igen — „Nem választható: 1 800 💎 hiányzik hozzá" |
| A4 | Ezres tagolás hiányzott több helyen (`kiszolgált 12403`, `összes távozó`, `utas`, tanácsadó-számok). | igen — mindenhol `szam()` |
| A5 | „Elégedetten: 2 300" — arány nélkül semmit nem mond. | igen — mellé kerül a százalék |
| A6 | 10–11,5 px-es szövegek, 4,2:1 kontrasztú halvány szürke. | igen — a törzsszövegek 12,5 px, `--halvany` `#93a0c8` → `#aab6da` |
| A7 | A fejezet-kártya és a bevezető FIX képpontokon ült (56 / 152 px), és hosszabb célszövegnél egymásra csúsztak. | igen — közös bal oszlop, folyó elrendezéssel |

---

## 5. AMI MÁS SÁVBAN VAN — csak jelentem

### R1 · ⚠️ A rajzolás lassabb lett, és ettől a JÁTÉK IS LASSÍTOTTBAN MEGY

Ez a kör egyetlen sebességgel kapcsolatos tétele, és nem ítélet: **azért van
itt, mert a böngésző-szonda 4. vizsgálata („halad az idő") elbukik tőle.**

A `fo.js` hurkában `dt = Math.min(0.25, …)`. Egy 250 ms-nál hosszabb képkocka
alatt eltelt idő tehát **elvész a világ számára**: négy FPS alatt a játék
lassított felvételben megy, hibaüzenet nélkül. Ugyanaz a felhő-gép, ugyanaz a
nap, ugyanaz a felület-kód:

| mikor | ms/képkocka | tick / 3 mp |
|---|---|---|
| a kör elején | 385 | 45 |
| ~40 perccel később | 613 | 25 |
| ~70 perccel később | **1 108–2 714** | **15** |

Közben a `src/render/texturak.js` és az `allomas3d.js` percenként változott
(a textúra-sáv élőben dolgozott). **A felület nem tényező:** A/B-vel
kikapcsolva a `hud.frissit()`, a `panelek.frissit()` és az
`epitesSav.frissit()` hívásokat, a képkocka-idő a zajon belül maradt
(383 → 386 → 401 ms).

⚠️ **Ez SwiftShader, tehát a szám önmagában semmit nem mond a valódi
teljesítményről** — az FPS-mérés GPU-s gép dolga. Amit mond: a szonda
küszöbét **nem szabad lejjebb venni**, mert nem a szonda szigorú. A szonda
hibaüzenetét viszont pontosítottam: most kiírja a képkocka-időt, és kimondja,
hogy ilyenkor a RAJZOLÁS a szűk keresztmetszet, nem a sim. (Ez a küszöböt nem
mozdítja, csak a piros sort teszi használhatóvá.)

**Amit érdemes megfontolni a `fo.js`-ben** (nem az én fájlom): ha a képkocka
tartósan 250 ms fölött van, a játékos ma nem tud róla — csak azt látja, hogy
„lassú a játék". Egy egyszeri üzenet („a gép nem bírja, a világ lassítva megy")
őszintébb, mint a néma csúszás.

### R2 · A kamera nem a csarnok közepére néz

A `fo.js` 82. sora: `szinter.cel.set(sim.kezdoX + 9, 0, sim.kezdoY + 8)` —
ez a **22×16-os** kezdő csarnok közepe volt. A csarnok azóta **30×22**, tehát
a kamera a bal felső negyedre néz, és a terület nagyobbik fele a képen kívül
kezdődik (lásd `qa/bongeszo_02_kezdes.png`). Pontos javaslat lent, a
6. szakaszban.

### R3 · A kapuk fülön a lezárt/rejtett világ üzenete jó, de a kamera-korlátok rendben

Ellenőriztem, mert a rács 96×72-re nőtt: a `szinter._hatarolCel()` a
`RACS_SZ`/`RACS_M` állandókból dolgozik, tehát magától követte a növekedést, a
`tav` felső korlátja (130) pedig elég ahhoz, hogy az egész rács ráférjen a
képre. **Kisebbségi térkép nincs a játékban**, tehát nem is kellett hozzáigazítani.

---

## 6. HA BEKÖTNÉD — pontos `fo.js`-változtatások (nem az én fájlom)

Egyik sem szükséges ahhoz, hogy a felület-munka működjön; mindkettő a
95×72-es rácsra való átállás elmaradt következménye.

**(1) A kamera a csarnok KÖZEPÉRE nézzen.** `portal/src/fo.js`, 82–83. sor:

```js
  // MOST:
  szinter.cel.set(sim.kezdoX + 9, 0, sim.kezdoY + 8);
  szinter.tav = 32;

  // JAVASOLT — a csarnok 22×16-ról 30×22-re nőtt, a közepe ezzel elcsúszott:
  szinter.cel.set(sim.kezdoX + KEZDO_CSARNOK_SZ / 2, 0, sim.kezdoY + KEZDO_CSARNOK_M / 2);
  szinter.tav = 42;
```

…és az importhoz: `KEZDO_CSARNOK_SZ, KEZDO_CSARNOK_M` a `./mag/config.js`-ből.
Így a szám nem csúszhat el újra, ha a csarnok mérete változik.

**(2) Ha a felület kérni akar kameramozgást** (ma nem kér, de a
„vissza a csarnokhoz" gomb ezen múlna), a `vezerlo` objektumba elég egy
metódus a 89–109. sor közé:

```js
    /** A kamera vissza a kezdő csarnok közepére. */
    kozpontba() {
      szinter.cel.set(sim.kezdoX + KEZDO_CSARNOK_SZ / 2, 0, sim.kezdoY + KEZDO_CSARNOK_M / 2);
      szinter.tav = 42;
      szinter._kamerat();
    },
```

A `hud.js` a `vezerlo`-t megkapja, tehát ettől kezdve kirakhatunk hozzá gombot
(ma szándékosan nincs: nem akartam félig működő gombot betenni).

---

## 7. AMIT NEM TUDTAM MEGVIZSGÁLNI

1. **A valódi tempó és az élvezet.** A gépi kör 11 játéknapot vitt végig, és
   a fejezetváltásig jutott. Hogy egy embernek unalmas-e a 3. nap, arra ez a
   kör nem válasz.
2. **A 3D olvashatósága.** A textúra-sáv élőben dolgozott a `render/` alatt,
   a képek félkész állapotot mutatnak. A felület fölötte van, de az
   „olvasható-e az állomás" kérdés a textúrák elkészülte után mérhető újra.
3. **Hang.** Az `audio/` szintén élő volt; a hangkapcsoló és a két csúszka
   megvan a felületen, a hangzást nem ítéltem meg.
4. **VII. fejezet, végtelen mód, csőd-képernyő.** A 11 nap alatt a II.
   fejezetig jutottam; a `_vege()` és a `_gyozelem()` ablakot nem láttam élőben.
5. **Érintőképernyő.** A vezérlés egérre készült, ez nem változott.

---

## 8. HA ÚJRA FUTTATOD

```bash
cd /home/user/birodalmak
npx vite build --config portal/vite.config.js
node portal/tools/bongeszo_szonda.mjs      # 9 vizsgálat + ms/képkocka
node portal/tools/det_szonda.mjs           # a fő kapu
node portal/tools/kiadas_ellenorzo.mjs     # kiadhatóság
```

A kézi kör hajtóprogramja szándékosan nem került a `tools/` alá: egyszer
használatos volt, és amit belőle érdemes megőrizni, az vagy ebben a
dokumentumban van, vagy a böngésző-szondában.

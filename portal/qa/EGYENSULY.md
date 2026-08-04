# PORTAL HUB TYCOON — EGYENSÚLY-MÉRÉS ÉS ÍTÉLET (v0.5-ös kör)

Dátum: 2026-08-04 · környezet: **felhő** (tiszta node, GPU nélkül) ·
eszköz: `portal/tools/egyensuly.mjs` + `portal/tools/jatekosok.mjs` ·
nyers adat: `portal/qa/egyensuly.json`

```
node portal/tools/egyensuly.mjs 60000 8        # ez a mérés (~8 perc)
node portal/tools/egyensuly.mjs 24000 3 gyors  # gyors kör hangolás közben
```

**Mit mértem:** 10 stratégia × 8 rögzített seed × 60 000 tick (50 játéknap) =
80 teljes végigjátszás, plusz 48 nehézségi futás (2 stratégia × 3 fokozat ×
8 seed), 9 ág-abláció, 7 díjszabás-kísérlet és 14 technológia-abláció.
Összesen **158 futás.**

**Mit NEM mértem:** sebességet. A `CLAUDE.md` szabálya áll: a felhőben mért
tick-idő két futás között összehasonlíthatatlan, FPS pedig nincs. Ebben a
dokumentumban egyetlen szám sem sebességről szól.

> ⚠️ **MELYIK JÁTÉKOT MÉRTEM.** A munkamenet alatt más ügynökök a `src/` alatt
> dolgoztak, és a játék **v0.4 → v0.6 → v0.9** utat járt be közben. A v0.6
> (épületenkénti kosz) és a v0.5 (végtelen mód) érdemben átírta a gazdaságot,
> ezért a méréseket kétszer eldobtam és újrafuttattam. **A lenti számok a
> `ddbca72` commit + az akkori munkafa egy IZOLÁLT PILLANATKÉPÉN futottak**
> (`VERZIO = 0.9.0`), hogy egy nyolcperces mérés közepén ne változzon a világ.
> A pillanatképen a `det_szonda` mind a 11 vizsgálata zöld volt.
>
> Ha azóta a gazdaságot érintő szám változott, **ezek a számok elavultak** —
> a futtatás viszont nyolc perc, és a seedek rögzítettek, tehát bármikor
> újrafuttatható és közvetlenül összevethető.

> ✅ **A `MAX_UTAS` plafon EBBEN A MÉRÉSBEN NEM TORZÍT.** A v0.4-es körben 48
> futásból 29 ült a plafonon; most **80 futásból 0** töltötte a tickjei több
> mint 1 %-át ott, a legmagasabb csúcs 744 az 1 600-as keretben. A számok
> tehát nincsenek levágva. (A v0.6-os kosz-modell fogja vissza a forgalmat:
> a dühös vendég hamarabb távozik.)

---

## 0. MI TÖRTÉNT A JAVASLATOKKAL — mind a tíz beépült (v1.0)

**Ez a jelentés a hangolás ELŐTTI állapotot méri.** Az 5. szakasz mind a tíz
javaslata bekerült a v1.0-ba; a lenti táblázat tehát az a kiindulás, amihez
képest a változtatások történtek. Ahol a szám itt rossznak látszik, ott a
javítás már megvan — a MOSTANI állapot méréséhez futtasd újra
(`node portal/tools/egyensuly.mjs 60000 8`), a seedek rögzítettek.

| # | mi változott | mérve utána |
|---|---|---|
| 5.1 | a IV. fejezet a Parázsmélyt is felfedi | az V. fejezet nem zsákutca többé |
| 5.2 | a `szemelyzet: 0` épület nem adható bérbe | a dominált gomb eltűnt |
| 5.3 | `BERLET_RESZESEDES` 0,42 → 0,60 | |
| 5.4 | `EMELET_FELAR` 1,1 → 0,6 · `lepcso.atjaroIdo` 40 → 25 | |
| 5.5 | `vasut.csatornaUtem` 90 → 65 | a szondában 277 → **444** vasúti utas |
| 5.6 | `legendas_kapu.ar` 6 500 → 12 000 | |
| 5.7 | `sarkanytronus.dij` 240 → 170 | |
| 5.8 | hírnév-lendület 60 → 300 | a szondában 74 → **86** záró hírnév |
| 5.9 | `NEHEZSEGEK.kemeny` 0,55 / 1,7 / 2,0 | |
| 5.10 | `NEHEZSEGEK.konnyu.erkezes` 1,15 → 1,0 | |

A determinizmus-szonda mind a 11 vizsgálata a változtatások UTÁN is zöld, és a
teljes végigjátszás javult: elégedett távozó 2 908 → **3 319**, eseményféleség
13 → **15**.

⚠️ **Amit ez NEM jelent.** Tíz egyszerre alkalmazott változtatás nem tíz
független javítás: a kölcsönhatásukat csak egy teljes újramérés mutatja meg.

### A HANGOLÁS UTÁNI ÁLLAPOT — ez a v1.0 (80 végigjátszás, ugyanazok a seedek)

| stratégia | győz | győz. napja | csőd | fejezet | nettó vagyon | hírnév | átl. utas | épület |
|---|---|---|---|---|---|---|---|---|
| nemtörődöm (kontroll) | 0/8 | — | 0/8 | 2 | 45 300 | 46,7 | 0 | 2 |
| terjeszkedő | 0/8 | — | 0/8 | 5,0 | 621 093 | **12,7** | 357 | 27,3 |
| olcsó | 0/8 | — | 0/8 | 6,5 | 1 425 171 | 14,7 | 305 | 102,5 |
| bevétel-maximalizáló | 0/8 | — | 0/8 | 7,0 | 1 536 460 | 28,2 | 214 | 70,1 |
| **kutató** | **8/8** | **15,5** | 0/8 | 8 | 2 466 474 | 47,8 | 329 | 79,5 |
| **bérbeadó** | **8/8** | 16,5 | 0/8 | 8 | 2 286 973 | 45,8 | 354 | 120 |
| **kiegyensúlyozott** | **8/8** | 17,3 | 0/8 | 8 | **2 988 778** | 47,6 | 363 | 123,6 |
| **csatornás** | **8/8** | 22,1 | 0/8 | 8 | 2 663 661 | **84,4** | 274 | 92,3 |
| **emeletes** | **8/8** | 23,9 | 0/8 | 8 | 2 069 216 | 45,2 | 295 | 105,5 |
| **óvatos** | **8/8** | **11,3** | 0/8 | 8 | 2 735 304 | 45,2 | 356 | 87,9 |

**Hat stratégia visz végig 8/8-at, négy pedig egyszer sem** — és a négy bukó
mind MÁS okból bukik: a nemtörődöm a kapuösszeomlásba (7,3 alkalom), a
terjeszkedő a 12,7-es hírnévbe, az olcsó a tömegbe, a bevétel-maximalizáló
pedig egyszerűen nem éri el a VII. fejezet 70-es hírnév-küszöbét.

Ami a hangolás előtti körhöz képest változott:
- **`ovatos` 3/8 → 8/8** — ez a Parázsmély-javítás (5.1) egyenes következménye:
  a stratégia korábban 8/8-ban ragadt be az V. fejezetnél.
- **`emeletes` és `berbeado` 8/8-ra jött vissza** a 300-as hírnév-kísérletből.
- **Csőd: 1 → 0.** A mezőny egyetlen csődje eltűnt; a büntetést most a
  BERAGADÁS hordozza, nem a csőd. (Ez tudatos: a csőd a legfrusztrálóbb
  kimenet, a „nem jutsz tovább" viszont taníthat.)
- **Gödör-kijutás: 0 → 2 a 19-ből.** Kevés, de már nem nulla.

⚠️ **Ami MEGMARADT megoldatlanul:** a 4.4 pont. Minden győztes stratégia
**66–79 %-os dühös aránnyal** fejezi be. A játék ma úgy nyerhető meg, hogy az
állomás vendégeinek kétharmada dühösen távozik. Ez nem szám-hiba (a győzelem
feltételét teljesítik), de szemben megy a „varázslatos, nyüzsgő átszállóállomás"
élményével. Az egyetlen kivétel a `csatornas` — 84,4 hírnév, KEVESEBB utassal.
Ez a v1.0 legnagyobb nyitott tervezési kérdése.

---

## 1. ÍTÉLET — játék-e a játék?

**Igen, és a v0.4-hez képest sokkal inkább.** Az akkori jelentés fő panasza az
volt, hogy „a jó játékot bőven jutalmazza, a rosszat alig bünteti". Ez már nem
áll: ma a rossz játék **nem fejezi be a történetet**.

| stratégia | győz | győz. napja | korszak | csőd | fejezet | pénz(vég) | nettó vagyon | hírnév | elég. | dühös | átl. utas | épület |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| nemtörődöm (kontroll) | 0/8 | — | 0 | 0/8 | 2 | 35 471 | 39 871 | 43,4 | 24 % | 6 % | 0 | 2 |
| óvatos | 3/8 | **16,3** | 1,0 | 0/8 | 6,1 | 1 756 524 | 1 823 849 | 45,1 | 32 % | 53 % | 257 | 68 |
| terjeszkedő | 0/8 | — | 0 | 0/8 | 5,0 | 721 913 | 763 784 | **13,6** | 16 % | **73 %** | 385 | 28,6 |
| bevétel-maximalizáló | 0/8 | — | 0 | 0/8 | 6,8 | 1 413 249 | 1 484 877 | 28,6 | 29 % | 49 % | 209 | 68,1 |
| olcsó | 0/8 | — | 0 | **1/8** | 6,8 | 1 141 689 | 1 231 328 | 12,3 | 23 % | 63 % | 293 | 95,4 |
| **kiegyensúlyozott** | **8/8** | 23,4 | 2,3 | 0/8 | **8** | **3 048 509** | **3 160 122** | 67,6 | 21 % | 68 % | 362 | 120 |
| emeletes | 8/8 | 28,1 | 2,0 | 0/8 | 8 | 1 930 373 | 2 037 691 | 60,5 | 14 % | 74 % | 283 | 108,5 |
| bérbeadó | 8/8 | 21,0 | **2,9** | 0/8 | 8 | 1 963 693 | 2 072 175 | 69,4 | 21 % | 69 % | 328 | 115,5 |
| csatornás | 8/8 | 25,5 | **2,9** | 0/8 | 8 | 2 313 286 | 2 408 975 | **83,6** | 29 % | 59 % | 253 | 92,3 |
| kutató | 8/8 | **19,5** | 2,3 | 0/8 | 8 | 2 753 515 | 2 830 337 | 59,8 | 17 % | 75 % | 319 | 81,8 |

„Fejezet 8" = végigjátszotta a hét fejezetet; a „korszak" a végtelen módban
elért szint. A **nettó vagyon = készpénz + a felépített épületek katalógus-ára**
— erre a jelentés végig ezt használja, mert a puszta készpénz növekedési
szakaszban félrevezet (aki beépíti a pénzét, attól szegényebbnek látszik).

**A büntetés megvan.** A `nemtorodom` kontroll a II. fejezetnél reked meg,
2 utassal, és a kapuja **7,6-szor omlik össze** — karbantartó nélkül a
Zsibvásár-kapu magától tönkremegy. A `terjeszkedo` (sok kapu, semmi
szolgáltatás) 13,6-os hírnévvel, 73 % dühös vendéggel **mind a nyolc seeden az
V. fejezetnél áll meg**. Az `olcso` (tömeg minden áron) egy seeden **csődbe
megy** — az első csőd az egész mérési sorozat történetében.

**A jutalom is megvan, de nem egyetlen ösvényen.** Öt stratégia visz végig
8/8-at, és **négy egymástól nagyon eltérő módon**: technológia (`kutato`,
19,5 nap), passzív bérbeadás (`berbeado`, 21 nap), kiegyensúlyozott
építkezés (23,4 nap) és csatorna-alapú, kapuszegény állomás (`csatornas`,
25,5 nap). Ez jó hír: a játéknak több nyerő stílusa van.

### Van-e domináns stratégia?

**Nincs egyetlen domináns stratégia, de van egy domináns TECHNOLÓGIA.**

A győztesek mezőnye szűk (19,5–28,1 nap), és a köztük lévő sorrend
seedenként változik. Ami viszont MINDEGYIKÜKNÉL ugyanaz: a
`legendas_kapu` kutatás. A technológia-abláció (ugyanaz a stratégia, csak EGY
technológia + előfeltételei, 4 seed × 25 nap):

| technológia | teljes ár (lépcsőkkel) | pénz-Δ |
|---|---|---|
| **legendas_kapu** | 22 900 (7) | **+620 708** |
| kristaly_takarek | 3 000 (2) | +74 244 |
| kapu_hangolas | 1 400 (1) | +45 344 |
| stabil_kapuk | 3 600 (2) | +36 020 |
| fejlett_boltok | 2 000 (1) | +27 603 |
| takaritorobot | 3 000 (2) | +18 347 |
| gyors_sorok | 1 200 (1) | +13 947 |
| ido_kotes | 11 400 (4) | +715 |
| teleport_lift / gyogyaszat / energia_halo / kapu_szkenner / vip_ellatas / auto_poggyasz | — | −3 906 … −11 667 |

**A legendás kapunyitás nyolcszor annyit ér, mint a második helyezett.** Az ok
a dimenzió-táblában van: a Sárkánytrónus **397,7 tallér/utast** hoz, a második
legjobb (űrkapu) 300,3-at, a kezdő Zsibvásár 50,2-t. A `kutato` azért nyer a
leggyorsabban, mert ő ér oda leghamarabb. Egy technológia, ami minden mást
elhomályosít, nem döntés.

### Hol dől el a játszma?

**A 12–24. nap között.** A győzelmek 19,5 és 28,1 nap közé esnek; a Pearson-
korreláció az adott napi vagyon és a végső vagyon között:

| nap | 3 | 5 | 8 | 12 | 16 | 20 | 30 | 40 |
|---|---|---|---|---|---|---|---|---|
| pénz → végső vagyon | −0,4 | −0,4 | **−0,5** | −0,1 | 0,1 | 0,3 | 0,8 | 1,0 |
| utas → végső vagyon | −0,1 | 0,0 | 0,2 | 0,2 | 0,3 | 0,6 | 0,8 | 0,7 |

A korai pénz **antikorrelál** a végeredménnyel (−0,5 a 8. napon): aki a
második héten spórol, az veszít. Ez önmagában rendben van egy tycoonnál — de
lásd a 4.2 pontot arról, hogy a túlköltekezésnek gyakorlatilag nincs ára.

---

## 2. A NÉGY ÚJ ÁG — megéri-e?

⚠️ **Ezt a kérdést a stratégiák összehasonlítása NEM tudja megválaszolni.** Az
`emeletes` és a `kiegyensulyozott` húsz számban különbözik. Ezért van külön
ág-abláció: **ugyanaz a stratégia fut, pontosan egy ág be- vagy kikapcsolva**,
6 seed × 30 játéknap.

| ág | nettó vagyon | vagyon-Δ | napi bev. (vég) | győz | utas | dolgozó | hírnév | elég. | megérte? |
|---|---|---|---|---|---|---|---|---|---|
| alap (semmi extra) | 996 903 | — | 154 344 | 6/6 | 8 113 | 136,3 | 69,5 | 41 % | alap |
| + emelet (3 blokk + üzletek) | 295 333 | **−701 570** | 85 832 | 5/6 | 4 899 | 119,3 | **80,1** | **57 %** | nem |
| + bérbeadás (mindent) | 395 886 | **−601 017** | 97 948 | 6/6 | 6 973 | **51,3** | 77,4 | 49 % | nem |
| + bérbeadás (csak személyzetes) | 326 264 | −670 639 | 100 822 | 6/6 | 6 810 | 55,3 | 72,0 | 52 % | nem |
| + vasútállomás | 1 008 240 | +11 337 | 146 433 | 6/6 | 8 795 | 135,5 | 62,2 | 39 % | ≈ semleges |
| + léghajó (emelettel) | 451 498 | −545 405 | 137 058 | 5/6 | 6 414 | 121,0 | 61,8 | 47 % | nem |
| **mind együtt** | 98 969 | −633 187 | 16 396 | **0/6** | 3 020 | 35,3 | 50,9 | 68 % | nem |
| alap, korai szkenner (kontroll) | 732 156 | — | 142 700 | 5/6 | 7 016 | 122,8 | 56,2 | 38 % | alap |
| + űrkapu (korai szkennerrel) | 943 278 | +211 123 | 130 455 | 5/6 | 7 771 | 124,0 | 58,3 | 34 % | IGEN |

⚠️ **A ZAJKÜSZÖB ~26 %.** A táblázat két „alap" sora KIZÁRÓLAG a kutatási
sorrendben különbözik, és mégis 996 903 vs 732 156 jön ki. Tehát csak a
**30 % fölötti** eltérés jelent valamit. Ez alapján:

### Emelet: NEM éri meg pénzben, de KOMFORTBAN igen

−70 % nettó vagyon, −44 % napi bevétel, **−40 % utas**. Cserébe a
legmagasabb elégedettség az egész táblázatban (57 % a 41 % helyett) és a
legmagasabb hírnév (80,1). Az ok nem a padló ára — 3 blokk emeleti padló
összesen 5 644 tallér —, hanem az **idő**: a mozgólépcsőn a szintváltás
40 tick, és az az utas türelméből megy. A ritkább, de nyugodtabb állomás
kevesebbet keres.

Az `emeletes` stratégia a fő táblában 8/8-at nyer, de a leglassabban
(28,1 nap) és a legkevesebb elégedett vendéggel (14 %) — a magasba építés ma
**lassítás, nem gyorsítás**.

### Bérbeadás: NEM éri meg pénzben, de MEGVESZI A NYUGALMAT

−60 % nettó vagyon, viszont a dolgozói létszám **136 → 51** (−62 %), a hírnév
69,5 → 77,4, és ugyanúgy 6/6 győzelem, sőt mélyebb korszakig (2,2 vs 2,0). A
bérelt üzlet ugyanis MINDIG 100 %-on megy — a `hatekonysag` nem esik le
személyzethiánytól. **A bérbeadás tehát megbízhatóságot vásárol pénzért**, és
ez valódi döntés. A fő táblában a `berbeado` 8/8-at nyer, a 2. leggyorsabban
(21 nap), és **egyetlen mínuszos napja sincs** (pénz-minimum +423 — ő az
egyetlen aktív stratégia, ami sosem ment mínuszba).

A tétel ára viszont túl magas. Épületenként kiszámolt **törésponti napi
bevétel** (ennyi alatt jobb bérbe adni, fölötte jobb magunknak üzemeltetni):

| épület | személyzet | napi bér | napi fix bérleti díj | töréspont | MÉRT napi bevétel |
|---|---|---|---|---|---|
| bolt | 1 | 75 | 4,68 | 121 | ~771 |
| konyvesbolt | 1 | 75 | 5,16 | 120 | ~838 |
| vip | 2 | 150 | 19,20 | 226 | ~2 668 |
| poggyasz | 2 | 140 | 7,20 | 229 | ~639 |
| etterem | 2 | 150 | 6,00 | 248 | ~842 |
| vam | 2 | 190 | 5,10 | 319 | ~273 |
| **wc** | **0** | **0** | 2,28 | **SOHA** | ~20 |
| **seprupark** | **0** | **0** | 3,12 | **SOHA** | ~76 |

A boltnál tehát a valódi forgalom **6,4-szerese** a töréspontnak: a bérbeadás
mai áron csak akkor jó, ha nincs pénz személyzetre. (A vám az egyetlen, ahol
tényleg határeset.)

### Csatorna: a vasút semmit nem ad, az űrkapu igen — de az ÁG mint stílus MŰKÖDIK

- **vasút: +1 % nettó vagyon** — a zajszinten belül. 3 200 tallérért, 26
  energiáért és 5×3 cellányi helyért gyakorlatilag semmi. (Igaz, +682 utas.)
- **léghajó: −55 %** — de ez a sor viseli az emeleti padló árát is, mert a
  kikötő csak emeleten áll meg. A léghajó tehát nem külön ág, hanem az
  emeletes ág egy drága kiegészítője.
- **űrkapu: +29 %** a saját kontrolljához képest — az egyetlen egyértelműen
  nyereséges csatorna. 300,3 tallér/utas, a második legjobb az egész
  dimenzió-táblában.

Ugyanakkor a `csatornas` STRATÉGIA (egyetlen kezdő kapu + három csatorna +
a végén a Sárkánytrónus) **8/8-at nyer, a legmagasabb hírnévvel (83,6) és a
legmélyebb korszakig (2,9)**, 2,4 millió nettó vagyonnal. Kevesebb utas
(253 vs 362), kevesebb pénz, de sokkal nyugodtabb állomás. **A „nyugodt ág"
mint stílus tehát él** — csak nem az egyes csatorna-épületek erejétől, hanem
attól, hogy kevés kapuval kevesebb az instabilitás és a zsúfoltság.

### Kutatás: ez a legerősebb ág, és ez a baj

A `kutato` nyer a leggyorsabban (19,5 nap), 8/8-cal, 2,83 millió vagyonnal, és
a legkevesebb épülettel (81,8 — a `kiegyensulyozott` 120-hoz képest). Aki
technológiára optimalizál, kevesebbet épít és mégis hamarabb végez. A fenti
abláció megmutatja, miért: egyetlen technológia (`legendas_kapu`) többet ér,
mint az összes többi együtt.

### ⚠️ És a legfontosabb: az ágakat NEM lehet halmozni

A „mind együtt" sor **0/6 győzelem**, 98 969 nettó vagyon (a tizede az
alapnak), napi bevétel 16 396 a 154 344 helyett. Emelet + bérbeadás + három
csatorna együtt kiéhezteti a magot: 72,8 épület 119 helyett, 35,3 dolgozó
136 helyett. Ez nem hiba, hanem tanulság: **mindhárom új alrendszer korai
tőkét szív el**, és aki mindet egyszerre akarja, egyiket sem kapja meg.

---

## 3. A HÁROM NEHÉZSÉGI FOKOZAT

Ugyanaz a stratégia, ugyanazok a seedek, csak `new Sim({ seed, nehezseg })`.
Két stratégia fut: a `kiegyensulyozott` (jó játékos) és az `olcso` (vékony
tartalékkal dolgozó tömeg-stratégia).

| stratégia | fokozat | győz | csőd | győz. napja | korszak | fejezet | nettó vagyon | pénz(min) | mínuszos nap | hírnév | dühös |
|---|---|---|---|---|---|---|---|---|---|---|---|
| kiegyensúlyozott | könnyű | 8/8 | 0/8 | **18,6** | 2,6 | 8 | 4 372 119 | **+281** | 0,4 | 63,3 | 75 % |
| kiegyensúlyozott | normál | 8/8 | 0/8 | 23,4 | 2,3 | 8 | 3 160 122 | −507 | 0,9 | 67,6 | 68 % |
| kiegyensúlyozott | kemény | **8/8** | 0/8 | **27,5** | 2,6 | 8 | 2 241 921 | −1 258 | 2,3 | 65,2 | 60 % |
| olcsó | könnyű | 0/8 | **0/8** | — | 0 | 7,0 | 1 646 487 | −1 942 | 3,0 | 11,0 | 72 % |
| olcsó | normál | 0/8 | **1/8** | — | 0 | 6,8 | 1 231 328 | −3 611 | 3,8 | 12,3 | 63 % |
| olcsó | kemény | 0/8 | **2/8** | — | 0 | 6,0 | 610 103 | −6 540 | 6,6 | 20,7 | 52 % |

**A fokozat fokozat — de csak a rossz játékosnak.**

Ami jól működik:
- **A könnyű nem unalmas.** Nem igaz, hogy „mindenki nyer": az `olcso` a
  könnyűn is 0/8-at nyer, és 7. fejezetnél áll meg. A fokozat nem ajándékozza
  el a győzelmet, csak több mozgásteret ad — a jó játékos min. készpénze
  könnyűn **pozitív** (+281), normálon már mínuszos.
- **A kemény nem lehetetlen.** A jó játékos ott is 8/8-at visz.
- **A gradiens monoton és tiszta**: győzelem napja 18,6 → 23,4 → 27,5,
  nettó vagyon 4,37 M → 3,16 M → 2,24 M, mínuszos napok 0,4 → 0,9 → 2,3,
  a gyenge stratégia csődjei 0/8 → 1/8 → 2/8.

Ami nem működik:
- **A keménynek nincs foga a jó játékossal szemben.** 8/8 győzelem és
  2,24 millió vagyon mellett a „kemény" ma **lassítás, nem nehézség**:
  4,1 nappal tolja ki a győzelmet. A fokozat a hibázás árát emeli meg
  (`olcso`: 2/8 csőd), a képességét nem.
- **Furcsaság: a könnyű fokozat hírneve ROSSZABB (63,3), mint a normálé
  (67,6),** és ott a legmagasabb a dühös vendégek aránya (75 %). Az ok az
  `erkezes: 1.15` szorzó: a könnyű mód TÖBB utast enged be ugyanarra az
  állomásra, és a zsúfoltság a v0.6-os kosz-modell mellett hangulatot visz.
  Vagyis a „könnyű" pénzben könnyebb, kiszolgálásban NEHEZEBB. Ez nem az,
  amit a fokozat leírása ígér („Az első állomáshoz").

---

## 4. HIBÁK — nem egyensúly-kérdés, hanem javítandó

### 4.1 ⚠️ AZ V. FEJEZET CSENDBEN TELJESÍTHETETLENNÉ VÁLHAT

**Ez ugyanaz a hibaosztály, mint a v0.4-ben megtalált Sárkánytrónus-ügy, és
ugyanolyan néma.**

Az V. fejezet feltétele: `s.vipKiszolgalt >= 1` — szolgálj ki egy legendás
vendéget a VIP Lounge-ban. VIP-igénye **két fajnak van**: a **démonnak**
(Parázsmély, súly 2) és a **sárkánynak** (Sárkánytrónus / űrkapu, `mindig:
['vip']`).

A III. fejezet **„Megerősítés"** ága — a biztonságos, stabilizáló választás —
**nem fedi fel a Parázsmélyt**; azt csak a „Terjeszkedés" ág teszi. A IV.
fejezet jutalma a Fagypermet adja. A Sárkánytrónushoz a VI. fejezet kell, ami
az V. után jön. **Aki tehát a biztonságos ágat választja, annak nincs
VIP-igényű vendége, és a történet megáll.**

Mérve, `ovatos` stratégia, 8 seed × 50 játéknap:

| változat | Parázsmély felfedezve | VIP-kiszolgálás | fejezet | győzelem |
|---|---|---|---|---|
| „Megerősítés", nincs `kapu_szkenner` | **0/8** | **0,0** | **5,0 (mind a 8)** | **0/8** |
| „Terjeszkedés" ág | 8/8 | 640,5 | 6,0 | 2/8 |
| „Megerősítés" + `kapu_szkenner` kutatás | 3/8 | 565,6 | 6,1 | 3/8 |

Az első sorban a bot **894 463 tallérral a kasszájában, MEGÉPÍTETT és üresen
álló VIP Lounge-dzsal** ragadt be — mind a nyolc seeden. A játék erről semmit
nem közöl: a haladásjelző egyszerűen megáll.

A menekülőút ma **véletlen**: a `kapu_szkenner` egy véletlen ismeretlen
dimenziót fed fel (8 futásból 3-ban lett a Parázsmély), vagy egy sárkány-esemény
hoz be véletlenül egy legendás vendéget. Egy fejezet, aminek a
teljesíthetőségét kockadobás dönti el, nem fejezet.

**Javaslat (a legszűkebb javítás):** a IV. fejezet jutalma a Fagyperem mellett
fedje fel a **Parázsmélyt** is — VAGY a III. fejezet „Megerősítés" ága adjon
egy VIP-forrást. (Az sem rossz, ha az V. fejezet elfogadja a „megépült VIP
Lounge + 10 elégedett démon/sárkány-igény" alternatívát.)

### 4.2 ⚠️ A MOSDÓ ÉS A SEPRŰPARKOLÓ BÉRBEADÁSA MATEMATIKAILAG SOHA NEM TÉRÜL MEG

A `_pBerbead()` feltétele ma: `if (!t.igeny || t.dij <= 0)`. Ez átengedi a
**mosdót** és a **seprűparkolót** is — pedig mindkettőnek `szemelyzet: 0`.
Bérbeadáskor tehát **nincs megspórolt bér**, csak a bevétel 58 %-át adjuk oda,
napi 2,28 illetve 3,12 tallér fix díjért cserébe. Ez nem rossz döntés, hanem
**szigorúan dominált** döntés: nincs az a forgalom, amelynél megérné.

A felület ma felajánl egy olyan gombot, aminek nincs helyes használata.

**Javaslat:** `src/sim/sim.js` → `_pBerbead()` feltétele egészüljön ki
`|| t.szemelyzet === 0`-val. (Ugyanezt a `PORTAL_TERV.md` is így írja le: „a
bolt, étterem, könyvesbolt és VIP kiadható" — a kód ennél tágabb.)

### 4.3 ⚠️ A HÍRNÉV-GÖDÖR EGYIRÁNYÚ AJTÓ LETT

| mérés | v0.4-es kör | MOST |
|---|---|---|
| hírnév < 20 előfordult | 35/48 | 18/80 |
| …ebből 40 fölé visszajött | 17 | **0** |
| pénz < 0 előfordult | 11/48 | 41/80 |
| …ebből kilábalt | 11 | 41/41 |

A pénzoldali gödörből **mind a 41 futás kilábalt** — az jól van hangolva. A
hírnév-gödörből **egyetlenegy sem**. És nem csak a szándékosan hanyag
stratégiák esnek bele: a `bevetel_maximalizalo` — kompetens építkező, 68
épülettel — a **32. és a 47. napon** esett 20 alá két seeden, és onnan sem jött
vissza.

A v0.4-ben épp erre született a hírnév-lendület javítása
(`×(1+60/(20+utas))`). Az a képlet 400 utasnál már csak **1,14×** szorzót ad —
vagyis nagy állomáson gyakorlatilag nem létezik. A v0.6-os épületenkénti kosz
azóta tovább nehezítette a visszautat.

### 4.4 Megfigyelés (nem hiba, de tervezési kérdés): MINDENKI DÜHÖS

**Minden győztes stratégia 59–75 %-os dühös-aránnyal fejezi be.** A
legjobb elégedettség az aktív mezőnyben 32 % (`ovatos`), a győzteseknél
14–29 %. A v0.4-es körben ugyanezek a számok 92–99 % elégedettséget mutattak.

A játék tehát ma úgy nyerhető meg, hogy az állomás vendégeinek kétharmada
dühösen távozik. Ez nem egyensúly-hiba (a győzelem feltétele a hírnév ≥ 70,
azt teljesítik), de a „varázslatos, nyüzsgő átszállóállomás" élményével
szemben megy. Az egyetlen kivétel a `csatornas` (83,6 hírnév, 59 % dühös) és
az abláció „+emelet" sora (57 % elégedett) — mindkettő KEVESEBB utassal.

---

## 5. KONKRÉT HANGOLÁSI JAVASLATOK

Mindegyik mellett ott a mérés, ami alátámasztja. A `src/` alatt **én nem
nyúltam semmihez** — ezek javaslatok.

### 5.1 `src/sim/tortenet.js` → IV. fejezet `jutalom` = jelenleg csak `s.dimenziotFelfed('fagyperem')`; javaslom, hogy fedje fel a **Parázsmélyt** is
Mert a mérés szerint a III. fejezet „Megerősítés" ága mellett a Parázsmély
**0/8 futásban** nyílt meg, és emiatt **8/8 futás ragadt be az V. fejezetnél**
üresen álló VIP Lounge-dzsal és 894 463 tallérral. (4.1 pont.)

### 5.2 `src/sim/sim.js` → `_pBerbead()` feltétele = jelenleg `!t.igeny || t.dij <= 0`; javaslom `|| t.szemelyzet === 0` hozzáadását
Mert a mosdó és a seprűparkoló bérbeadásánál nincs megspórolt bér: a
törésponti napi bevétel **nem létezik** (a bevétel 58 %-áért napi 2,28 és 3,12
tallér jár). Szigorúan dominált gomb. (4.2 pont.)

### 5.3 `src/mag/config.js` → `BERLET_RESZESEDES` = jelenleg **0,42**; javaslom **0,60**-at
Mert az ág-abláció szerint a bérbeadás **−60 % nettó vagyont** jelent
(996 903 → 395 886), miközben a dolgozói létszámot 136-ról 51-re viszi le. A
boltnál a töréspont ma 121 tallér/nap, a mért tényleges forgalom ~771 — vagyis
**6,4-szeres áron** vesszük meg a nyugalmat. 0,60-nál a töréspont 187-re megy
föl, a szorzó 4,1-re csökken: az ág versenyképes lesz, de nem dominál (a nagy
forgalmú üzletnél továbbra is a saját üzemeltetés nyer).

### 5.4 `src/mag/config.js` → `EMELET_FELAR` = jelenleg **1,1**, ÉS `src/sim/epuletek.js` → `lepcso.atjaroIdo` = jelenleg **40**; javaslom **0,6**-ot és **25**-öt
Mert az emelet-ág **−70 % nettó vagyont**, **−44 % napi bevételt** és
**−40 % utast** ad, miközben az emeleti padló önmagában csak 5 644 tallér
(3 blokk). A valódi ár az idő: a 40 tickes szintváltás közvetlenül az utas
türelméből megy. A jelenlegi mérleg úgy áll, hogy a magasba építés
**kényelmesebb, de kizárólag drágább** — az emelet ma büntetés, nem választás.

### 5.5 `src/sim/epuletek.js` → `vasut.csatornaUtem` = jelenleg **90**; javaslom **65**-öt
Mert a vasút ág-hatása **+1 %** nettó vagyon (996 903 → 1 008 240), ami a
26 %-os zajküszöb alatt van: 3 200 tallérért, 26 energiáért és 5×3 cellányi
helyért lényegében semmit nem ad. Az űrkapu (+29 %) mutatja, hogy a
csatorna-forma működik — a vasút üteme lassú hozzá. (Az űrkapun 300,3
tallér/utas jön, a vasúton 33,4.)

### 5.6 `src/sim/kutatas.js` → `legendas_kapu.ar` = jelenleg **6 500**; javaslom **12 000**-et
Mert az abláció szerint EGYEDÜL ez a technológia **+620 708 tallért** ér, a
második helyezett (`kristaly_takarek`) +74 244-et — **nyolcszoros** különbség.
A `kutato` stratégia is ezért nyer a leggyorsabban (19,5 nap). Egy
technológia, ami minden mást elhomályosít, nem döntés, hanem kötelező lépés.

### 5.7 `src/sim/dimenziok.js` → `sarkanytronus.dij` = jelenleg **240**; javaslom **170**-et
Az 5.6 párja. Mérve, 80 futás: a Sárkánytrónus **397,7 tallér/utast** hoz, az
űrkapu 300,3-at, a Fagyperem 132,2-t, a kezdő Zsibvásár 50,2-t. A
Sárkánytrónus egyetlen kapuja **47,4 millió** portáldíjat termelt az összes
futáson — több, mint a Zsibvásár, Ködmocsár és Kőhegység EGYÜTT (36,0 millió),
pedig csak 51 futásban volt nyitva a 80-ból.

### 5.8 `src/sim/sim.js` → `_utastElenged()` → `lendulet = HIRNEV_TEHETETLENSEG * (1 + 60 / (20 + utasSzam))`; javaslom a **60**-at **300**-ra
Mert a hírnév-gödörből **18 futásból 0** jött vissza 40 fölé — köztük a
kompetens `bevetel_maximalizalo` két futása is. A mai képlet 400 utasnál már
csak **1,14×** szorzót ad, vagyis nagy állomáson nem létezik; 300-zal ugyanott
**1,71×**, 100 utasnál 3,5×. A pénzoldalon nincs ilyen gond (41/41 kilábalt),
tehát nem az egész visszacsatolás rossz, csak ez az egy szám.

### 5.9 `src/mag/config.js` → `NEHEZSEGEK.kemeny` = jelenleg `penz 0,7 · ber 1,35 · instabil 1,5`; javaslom `penz 0,55 · ber 1,7 · instabil 2,0`
Mert a jó játékos a keményen is **8/8-at** nyer, mindössze 4,1 nappal később
(23,4 → 27,5), és a végén 2,24 millió nettó vagyona van. A kemény ma
lassítás, nem nehézség. (A gyenge stratégiánál viszont már MOST működik:
`olcso` 0/8 → 1/8 → 2/8 csőd — azt az irányt nem kell erősíteni.)

### 5.10 `src/mag/config.js` → `NEHEZSEGEK.konnyu.erkezes` = jelenleg **1,15**; javaslom **1,0**-et
Mert a könnyű fokozaton a hírnév **63,3**, a normálon **67,6**, és a dühös
vendégek aránya könnyűn a legmagasabb (**75 %**). A +15 % érkezés több utast
zúdít ugyanarra az állomásra, és a v0.6-os kosz-modell mellett a zsúfoltság
hangulatot visz. A „könnyű" ma pénzben könnyebb, kiszolgálásban nehezebb —
ami pont az ellenkezője annak, amit egy kezdő fokozattól várunk. A pénz
(×1,6), a bér (×0,75) és az instabilitás (×0,6) szorzói maradhatnak.

### 5.11 Amivel NEM kell foglalkozni (mérve rendben van)

- **A `MAX_UTAS = 1 600` plafon.** 80 futásból 0 érte el érdemben, a legnagyobb
  csúcs 744. A v0.4-es fő mérési torzítás megszűnt.
- **Kapuösszeomlás.** Aki épít karbantartót, annál **0,0** összeomlás; aki nem
  (`nemtorodom`), annál **7,6**. A mechanika pontosan úgy működik, ahogy kell.
- **Áramszünet.** Az áramszünetes tickek aránya 0–1 % minden stratégiánál.
- **A díjszabás-csúszka.** A v0.4-es „lapos csúszka" panasz megszűnt: 4 seed ×
  30 nap mellett az össz. bevétel 0,85-nél tetőzik (2 148 225), 0,5-nél
  1 419 198, 1,5-nél 1 323 615 — viszont 1,5-nél a legmagasabb az elégedettség
  (60 %) és a hírnév (85,1). Ez már valódi kompromisszum, nem díszlet.
- **Kezdő pénz és az első hét.** 80 futásból 41 ment mínuszba, mind a 41
  kilábalt, és mindössze 1 csőd lett az egész mezőnyben. Szűk, de nem
  kegyetlen indulás.
- **A vám a szűk keresztmetszet, és ez rendben van.** A leghosszabb sor
  246 fő, az átlagos 14 — messze a legnagyobb az összes épület közül. Ez
  játékos-döntés kérdése (aki elég vámot épít, annál nem áll a sor), nem
  szám-hiba.

---

## 6. A GÉPI JÁTÉKOSOKRÓL — mit hangoltam át, és mit tanultam belőle

A hat régi bot küszöbszámai a v0.1-es gazdasághoz voltak igazítva. Ami
változott (mind mérésre):

| változás | miért |
|---|---|
| **karbantartó az ELSŐ kaputól** (volt: a másodiktól), közös képlettel | az `INSTABIL_KARBANTARTAS` 40 → 14 miatt már EGY kapu is összeomlik magától a ~9. napon. Mérve: hangolatlanul 10 nap alatt 1 összeomlás, egy seedben 0 nyitott kapuval |
| `kapuTartalek` 5 500–14 000 → **3 000–3 500** | lásd lent: küszöb-szakadás |
| `takaritorobot` a kutatási sor **2. helyére** minden aktív botnál | a v0.6-os épületenkénti kosz miatt: 6 seed × 30 nap, `kiegyensulyozott` — 7. helyen 5/6 győzelem és 60-as hírnév, 2. helyen **6/6 és 73** (+12 % vagyon) |
| takarító-osztók f/170 → **f/110** | ugyanaz |
| `ovatos`: VIP a lista **elejére**, `kapu_szkenner` a kutatásba | a szigorú prioritási sor farka halott kód (lent), és az V. fejezet miatt (4.1) |
| `bevetel_maximalizalo`: forgalom-arányos boltszámok, kisebb tartalék | a v0.4-es körben 3/4-ben csődbe ment: FORGALOM ELŐTT húzta fel a drága boltokat, és az ár·2,8 %-os üzemeltetés az üres boltokon vérzett el |

### Három saját mérési csapda, amit majdnem a JÁTÉK ítéleteként írtam le

Ezeket külön kiemelem, mert mindhárom „zöld szonda, hamis biztonságérzet"
típusú hiba lett volna — csak a mérőeszközben.

1. **A `kapuTartalek` küszöb-szakadása.** 4 seed × 30 nap,
   `kiegyensulyozott` + „mindent bérbe adok": kapuTartalek **1 500 → 4/4
   győzelem · 3 000 → 4/4 · 5 500 → 0/4**, a II. fejezetnél megrekedve,
   1 kapuval, 17 utassal. A bérbeadás 58 %-os elvonása mellett a bot soha nem
   gyűjtött össze 5 500 + 4 400-at. Küszöb-seprés nélkül azt jelentettem volna,
   hogy „a bérbeadás játszhatatlan".
2. **A `break` az új-kapu ciklusban.** A motor kilépett a ciklusból, ha a
   profil egy dimenzióra nemet mondott — így a `csatornas`, ami CSAK a
   Sárkánytrónust akarja megnyitni, sosem jutott el odáig. **0/8 → 8/8**
   győzelem, miután `continue`-ra cseréltem. Ellenőrizve: a többi stratégia
   eredménye BITRE ugyanaz maradt (a predikátumaik nem függnek a dimenziótól).
3. **A prioritási sor farka halott kód.** A kívánságlista szigorú sor, a
   forgalom-arányos célok (`f/55`, `f/90`) viszont EGYÜTT NŐNEK a forgalommal
   — tehát az elején álló tételek soha nem telnek be, és a lista vége sosem
   épül meg. Az `ovatos` emiatt nem építette meg a VIP Lounge-ot. (A 4.1-es
   hiba ettől függetlenül is megvan: a VIP Lounge megépítése után is 0/8.)

---

## 7. AMIT NEM TUDOK MEGMÉRNI

Ezek nincsenek lefedve, és nem szabad úgy tenni, mintha lennének.

1. **Élvezet.** A mérés arra válaszol, hogy a jó döntés jobb-e, nem arra, hogy
   szórakoztató-e. A 4.4 pont (mindenki dühös) pont ilyen: a számok szerint
   rendben van, élményben nem biztos.
2. **Az emberi játékos.** A botjaim 10 tickenként döntenek, tökéletes
   információval, sosem kattintanak félre. A győzelmi napok (19,5–28,1) ezért
   **optimista alsó becslések**; egy ember lassabban épít.
3. **A modális ablakok időmegállítása.** A valódi játékban a fejezet-, döntés-
   és eseményablak MEGÁLLÍTJA az időt, itt nem. A valódi játék tehát az itt
   mértnél egy árnyalattal könnyebb.
4. **A térkiosztás minősége.** Minden bot ugyanazt a 4×4-es telekrácsot
   használja (szándékosan). Egy ember jobb vagy rosszabb elrendezést épít, és
   a türelem-gazdaság a távolságokon áll — erre a teljes dimenzióra vak vagyok.
   Ez különösen fáj az EMELETES ágnál: lehet, hogy egy okos, kompakt emeleti
   elrendezés nem veszít 70 %-ot.
5. **Az új felületi rétegek.** A v0.7–v0.9 bevezetője, tanácsadója,
   grafikonjai és a kiadás-ellenőrző a `parancs()` felületen kívül vannak. Az
   új események gazdasági hatása benne van a számokban (a pillanatkép v0.9),
   de eseményenként nincs lebontva.
6. **Mentés/betöltés.** Az eszköz a parancs-felületet használja, a
   visszatöltést nem gyakorolja — azt a `det_szonda` 5. vizsgálata méri.
7. **A ritkán megnyíló ágak.** A Boszorkányliget 31, a Parázsmély 26, az
   űrkapu és a vasút 8-8 futásban nyílt meg a 80-ból. A hozzájuk kötött fajok
   és igények egyensúlya **alulmintázott** — az űrkapu +29 %-os száma 6 seeden
   áll, épp a zajküszöb fölött.
8. **A hosszú végtelen mód.** A legmélyebb elért korszak 2,9. A
   `korszakTerheles` +9 %/korszak nyomása a 4–7. korszakban méretlen: nem
   tudom, hogy ott a bérek és az instabilitás megfojtják-e az állomást.
9. **Sebesség, FPS, tick-idő.** Szándékosan nincs benne. `npm run fps` az
   iMac dolga.

---

## 8. Ha újra futtatod

```bash
node portal/tools/egyensuly.mjs               # 60000 tick × 8 seed (~8 perc)
node portal/tools/egyensuly.mjs 24000 3       # gyors kör hangolás közben
node portal/tools/egyensuly.mjs 24000 3 gyors # díj-, technológia- és ág-abláció nélkül
```

A stratégiák a `portal/tools/jatekosok.mjs`-ben vannak, mindegyik egy
paraméterezett közös motor: küszöbszámok + kívánságlisták + válaszsablon. Új
stratégiához egy `motor({...})` hívás elég; az `ALAP` profil miatt csak azt
kell kiírni, amiben KÜLÖNBÖZIK.

**Fontos a hangoláshoz:**
- A seedek rögzítettek (`31337, 4242, 90210, 777, 12345, 555001, 8675309,
  2718281`), tehát két hangolási kör számai **közvetlenül összehasonlíthatók** —
  ellentétben a tick-idővel, ami nem az.
- **Egy alrendszer értékét CSAK a 13. szakasz ág-ablációja adja meg**, a
  stratégiák összehasonlítása nem. És ott is nézd meg a két „alap" sort: a
  köztük lévő különbség a zajküszöb.
- **Ha a `src/` alatt közben dolgozik valaki, másolj ki egy pillanatképet és
  azon mérj.** Ez a kör kétszer állt neki újra, mert a játék v0.4 → v0.6 →
  v0.9 utat járt be a mérés alatt.

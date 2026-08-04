# PORTAL HUB TYCOON — EGYENSÚLY-MÉRÉS ÉS ÍTÉLET

Dátum: 2026-08-04 · környezet: **felhő** (tiszta node, GPU nélkül) ·
eszköz: `portal/tools/egyensuly.mjs` + `portal/tools/jatekosok.mjs` ·
nyers adat: `portal/qa/egyensuly.json`

```
node portal/tools/egyensuly.mjs 60000 8        # ez a mérés (5 perc)
node portal/tools/egyensuly.mjs 24000 3 gyors  # gyors kör hangolás közben
```

**Mit mértem:** 6 mesterséges játékos-stratégia × 8 rögzített seed × 60 000 tick
(50 játéknap) = 48 teljes végigjátszás, plusz 7 díjszabás-kísérlet és 14
technológia-abláció. Összesen 69 futás.

**Mit NEM mértem:** sebességet. A `CLAUDE.md` szabálya áll: a felhőben mért
tick-idő két futás között összehasonlíthatatlan, FPS pedig nincs. Ebben a
dokumentumban egyetlen szám sem sebességről szól.

> ⚠️ **A mérés a `df1ea89` commit állapotán futott, külön kicsomagolt
> munkapéldányban.** Ennek oka mérési fegyelem: méréskor a munkafában egy másik
> ügynök épp a szintes rács átírásán dolgozott, és egy félbeírt fájlt elkapva
> minden futásom nulla utassal ért véget.
>
> Utólag ellenőriztem, ugyanazzal a paranccsal: a `df1ea89`, a **mai `00cf3fd`
> (v0.4/1 — szintek, nehézségi fokozatok, bérbeadás) és a munkafa BITRE UGYANAZT
> az eredményt adja.** A v0.3 és a v0.4 szigorúan hozzáadó: normál nehézségen
> minden szorzó 1,0, az emeletekre és a bérbeadásra pedig a gépi játékosaim nem
> építenek. A számok tehát a mai állapotra is érvényesek — **de csak a
> földszinti, bérbeadás nélküli, normál nehézségű játékra.**

---

## 0. A legfontosabb mérési figyelmeztetés: a MAX_UTAS plafon

**29 futás a 48-ból a tickjei több mint 1 %-át a `MAX_UTAS = 1200` plafonon
töltötte**, és öt stratégiából négy MEDIÁNBAN a 14–30. napon beleütközött:

| stratégia | plafonra ért | medián nap | tickek hány %-a a plafonon |
|---|---|---|---|
| terjeszkedo | 8/8 | **14.** | 57–73 % |
| olcso | 8/8 | **14.** | 30–46 % |
| kiegyensulyozott | 5/8 | **18.** | 2–11 % |
| bevetel_maximalizalo | 7/8 | **30.** | 0–43 % |
| ovatos | 1/8 | 22. | 2 % |
| nemtorodom | 0/8 | — | 0 % |

Ez két dolgot jelent, és mindkettő fontos:

1. **Minden 15. nap utáni szám alsó becslés.** A bevétel, a sorhosszak és a
   torlódás le van vágva; a hangulat pedig FELÜL van becsülve, mert a plafon
   miatt be nem engedett utasok nem rontják tovább a képet. Ahol ez számít, azt
   külön jelzem.
2. **Ez nem csak mérési, hanem tervezési gond.** A 15–20. naptól minden aktív
   stratégia ugyanazt a képet mutatja: 1197–1200 utas, tele csarnok. A játék
   utolsó kétharmadában a stratégiák közti különbség nem a forgalomban, hanem
   csak az egy utasra jutó bevételben látszik — a felépített állomás minősége
   onnantól alig számít.

---

## 1. Játék-e a játék?

**Igen, de csak félig: a JÓ játékot bőven jutalmazza, a ROSSZAT alig bünteti.**

### A jó játék jutalma megvan

A `nemtorodom` kontrollcsoport (semmit nem épít, senkit nem vesz fel, csak
elengedi a fejezet-ablakokat és a legolcsóbb esemény-választ adja) **egyetlen
seeden sem jutott túl a II. fejezeten**, hírneve mind a 8 futásban 20 alá esett
és onnan soha nem jött vissza, és a kapuja átlagosan **8,5-ször omlott össze**.
A `kiegyensulyozott`-hoz képest a 30. napon a vagyona a **1,3 %-a**
(29 242 vs 2 183 332). Ez rendben van.

### A rossz játék büntetése viszont NINCS MEG — két helyen is

**(a) A semmittevés nyereséges.** A `nemtorodom` a 16 000 induló tőkéből 50 nap
alatt **34 728**-ra hízott, azaz **napi ~375 tallér tiszta nyereséggel** ült
egy üres állomáson, miközben a hírneve nulla volt és a kapuja folyamatosan
omladozott. **Egyetlen futásban sem ment csődbe.** Sőt: a **10. napon a
semmittevő gazdagabb volt (24 468), mint az óvatos építkező (13 499)** — az
első 20 napban a passzivitás versenyképes stratégia.

Az ok szerkezeti: a portáldíj (34–240) az ÉRKEZÉSKOR jár, feltétel nélkül; a
kristály utasonként ~3-ba kerül; bér nincs; az üzemeltetés két épületre napi
53. Aki nem épít, annak nincs is mit veszítenie.

**(b) A rosszul üzemeltetett nagy állomás majdnem annyit hoz, mint a jó.** A
`terjeszkedo` (sok kapu, alig szolgáltatás) végállapota:

- hírnév **0,3** / 100
- a távozók **97 %-a dühösen** távozik, elégedett 2 %
- a kosz a maximumon: **1000/1000**
- 3636 hiába keresett könyv-, 2184 info-, 1698 hűsölés-igény

…és **mégis 7 nyitott kapu**, és a vagyona a `kiegyensulyozott`-énak
**59 %-a a 30. napon** (1 299 658 vs 2 187 029) és **48 %-a az 50. napon**
(2 243 292 vs 4 679 561, mediánok). Egy olyan állomásért, amit minden vendége
utál.

**Ez a mérés legsúlyosabb megállapítása.** A játékos büntetése azért ilyen
enyhe, mert a hírnév EGYETLEN dolgot csinál: szorozza az érkezési ütemet, és
azt is szűk sávban. A `sim.js`-ben `hirnevSzorzo = 0,45 + hírnév/100 × 1,1`,
tehát a **teljes hírnév-összeomlás a forgalomnak csak 55 %-át viszi el** az
induló szinthez képest — és ezt a veszteséget egy második kapu megnyitása
azonnal visszahozza. Terjeszkedni mindig olcsóbb, mint jól kiszolgálni.

---

## 2. Van-e domináns stratégia?

**Egyetlen tengely mentén sincs olyan stratégia, ami mindent visz — de a
tengelyek szét vannak esve, és ez a baj.**

| stratégia | győz | csőd | elért fejezet¹ | pénz nap 30 | pénz nap 49 | hírnév | elég.% | düh% | átl. utas | kapu |
|---|---|---|---|---|---|---|---|---|---|---|
| nemtorodom | 0/8 | 0/8 | 2,0 | 30 989 | 36 956 | 24,8 | 24 % | 6 % | 0 | 0,9 |
| ovatos | 0/8 | 0/8 | 5,0 | 705 256 | 2 511 043 | 76,1 | 76 % | 22 % | 532 | 4,0 |
| terjeszkedo | 0/8 | 0/8 | 5,0 | 1 299 658 | 2 243 292 | **0,3** | 2 % | 97 % | 1044 | **7,0** |
| bevetel_maximalizalo | 0/8 | 0/8 | 7,0 | 584 588 | 3 894 191 | 67,4 | 72 % | 25 % | 506 | 5,0 |
| olcso | 0/8 | 0/8 | 5,5 | 1 985 087 | **4 211 053** | 65,7 | 78 % | 17 % | 961 | 5,0 |
| kiegyensulyozott | **4/8** | 0/8 | **7,5** | **2 187 029** | 4 679 561 | 75,4 | 78 % | 19 % | 711 | 5,0 |

¹ 1–7 = épp az adott fejezetnél tart, 8 = végigjátszotta. Seed-átlag.
A „pénz nap 49" oszlopban a győztes futások hiányoznak (a játék véget ért) — a
`kiegyensulyozott` 4 679 561-e a 4 nem-győztes futás mediánja.

A jó hír: a `kiegyensulyozott` az egyetlen, amelyik **győzött** (4/8), és a
30. napon ő a leggazdagabb is. A referencia-játékos tehát tényleg a legjobb.

A rossz hír kettő:

1. **A pénz mint tengely a 20. nap után elveszti a jelentését.** A 30. napra
   minden aktív stratégia milliomos, a 49. napra 2,2–4,7 millió. Nincs mire
   költeni: a kapufejlesztés kifut (négy aktív stratégiánál a nyitott kapuk
   **átlagos szintje pontosan 5,0/5,0**, a kiegyensúlyozottnál 4,6 — ő a
   győzelemmel korábban abbahagyta), a kutatásfa 14 tételből áll,
   a rács betelik. A vagyoni sorrend innentől nem döntés kérdése, hanem annak a
   következménye, hogy a MAX_UTAS plafonon ki mennyit szed egy utastól.
2. **A bevétel/költség arány egyik stratégiánál sem megy 3,65 alá**
   (terjeszkedo 5,27 · bevetel_max 4,80 · olcso 4,29 · ovatos 4,05 ·
   kiegyensulyozott 3,65). Nincs olyan játékstílus, amit a költségoldal
   megfogna. **48 futásból 0 csőd.** A legmélyebb pont az egész mérésben
   **−2 210 tallér** volt (olcso / seed 777, 5–6. nap) — a csődhatár −6 000,
   azt senki meg sem közelítette.

---

## 3. Hol dől el a játszma?

**A 12–18. nap között, és utána a maradék 32 nap már csak lefutás.**

A napi pénzpálya mediánja stratégiánként (tallér):

| stratégia | n1 | n5 | n10 | n15 | n20 | n25 | n30 | n49 |
|---|---|---|---|---|---|---|---|---|
| nemtorodom | 16 815 | 23 338 | 24 468 | 26 320 | 27 196 | 30 408 | 30 989 | 36 956 |
| ovatos | 5 537 | 11 522 | 13 499 | 14 520 | 19 710 | 286 562 | 705 256 | 2 511 043 |
| terjeszkedo | 8 040 | 16 712 | 60 086 | 318 648 | 682 607 | 994 303 | 1 299 658 | 2 243 292 |
| bevetel_max | 3 165 | 3 652 | 5 541 | 6 378 | 6 036 | 91 824 | 584 588 | 3 894 191 |
| olcso | 7 552 | −302 | 23 361 | 227 805 | 791 789 | 1 373 624 | 1 985 087 | 4 211 053 |
| kiegyensulyozott | 5 586 | 7 524 | 34 199 | 377 130 | 852 430 | 1 533 203 | 2 187 029 | 4 679 561 |

Három dolog olvasható ki:

**(a) Az első 10 nap az egyetlen, amikor a pénz szűkös.** 48 futásból 11 ment
mínuszba, MIND a 11 vissza is jött. Ez a szakasz jól van hangolva.

**(b) A 12–18. nap a fordulópont.** Ekkor telik meg az állomás (a plafonra érés
mediánja a 14–18. nap), ekkor érnek 5. szintre a kapuk, és ekkor kezd a vagyon
naponta duplázódni. A **négy győzelem mind a 17–20. napon** született. A
60 000 tickes futás **utolsó 60 %-a olyan szakasz, amiben már semmi nem dől el.**

**(c) A korai pénz ANTIKORRELÁL a végeredménnyel.** Pearson-korreláció az
adott napi vagyon és a végső vagyon között (a semmittevőt kihagyva, 40 futás):

| nap | 3 | 5 | 8 | 12 | 16 | 20 | 30 |
|---|---|---|---|---|---|---|---|
| pénz → végső pénz | −0,14 | **−0,37** | −0,24 | −0,15 | 0,01 | 0,48 | 0,77 |

Aki az 5. napon spórol, az veszít; aki mindent elkölt, az nyer. Ez önmagában
nem baj (a tycoonok fele így működik), **de nincs semmi, ami a túlköltekezést
büntetné** — a csődhatárt soha senki nem érte el, tehát a „költs mindent
azonnal" nem kockázatos döntés, hanem egyszerűen a helyes.

---

## 4. Halálspirál — és egy ennél rosszabb dolog

### 4.1 Halálspirál: van, de nem fáj

Hírnév 20 alá **35 futásban** esett a szint, és onnan csak **17-ben** jött
vissza 40 fölé. A megrekedés nem véletlenszerű, hanem stratégiafüggő:

| stratégia | 20 alá esett | visszajött |
|---|---|---|
| nemtorodom | 8/8 (20–42. nap) | **0** |
| terjeszkedo | 8/8 (**6–8. nap**) | **0** |
| ovatos | 7/8 (21–31. nap) | 7 |
| bevetel_maximalizalo | 7/8 | 6 |
| olcso | 5/8 | 4 |
| kiegyensulyozott | 0/8 | — |

A spirál mechanikája világos: tele csarnok → mindenki türelme lejár → mindenki
dühösen távozik → `HIRNEV_TEHETETLENSEG` (0,004) miatt a hírnév a távozók
hangulatához tapad → 0-ban ragad. Aki egyszer 1200 dühös utassal tele van,
annak a hírneve akkor sem javul, ha később épít: a bent lévő tömeg addigra
mind lejárt türelmű.

**DE**: ez nem halálspirál, mert semmibe nem kerül. A `terjeszkedo` a 7. naptól
0 hírnévvel él, és így is 2,24 millió fölött zár (medián). **A gödörből nem azért nem jön ki,
mert nem tud, hanem mert nem éri meg neki.** Ez rosszabb, mint egy kemény
halálspirál: a játékos nem kap büntetést, csak egy csúnya számot a HUD-on.

Pénzoldali spirál nincs: 11 mínuszba került futásból 11 kilábalt.

### 4.2 Ennél rosszabb: a játék CSENDBEN megnyerhetetlenné válik

Ez a mérés legkomolyabb hibája, és nem egyensúly-kérdés, hanem tervezési hiba.

A VI. fejezet „**Lezárok egyet**" ága a `legrosszabbNyitottDimenzio()`-t zárja
be VÉGLEG. A VII. fejezet feltétele viszont az, hogy a **Sárkánytrónus kapuja
nyitva legyen**. Ha a játékos a `legendas_kapu` kutatással már felfedezte és
megnyitotta a Sárkánytrónust, az — mint frissen nyitott kapu — épp a
LEGKEVESEBB bevételt hozza, tehát a saját döntése végleg lezárja azt a világot,
ami nélkül a játék nem fejezhető be.

Mérve: **a `kiegyensulyozott` 8 futásából 4-ben pontosan ez történt.**

| seed | mit zárt le a VI. fejezet | eredmény |
|---|---|---|
| 4242, 90210, 12345, 8675309 | parazsmely | **győzelem** (17–20. nap) |
| 31337, 777, 555001, 2718281 | **sarkanytronus** (64–98 utassal) | VII. fejezetben ragadt, **örökre** |

A négy elakadt futás hírneve 70,2 / 71,6 / 74,2 / 74,4 — mind a 70-es küszöb
FÖLÖTT. Vagyis nem képességen múltak: teljesítették a nehezebb feltételt, és
egy 20 nappal korábbi, ésszerű döntés miatt a másikat már soha nem tudják.
A játék erről semmit nem közöl: nincs figyelmeztetés, nincs vég-képernyő, a
játékos csak azt látja, hogy a haladásjelző megáll.

**Ez nem hangolási kérdés, hanem javítandó hiba.** Három lehetséges megoldás,
mind egysoros:
- a `legrosszabbNyitottDimenzio()` hagyja ki a `sarkanytronus`-t (legszűkebb javítás),
- vagy a VII. fejezet feltétele legyen „a Sárkánytrónus nyitva VAGY végleg lezárva de egyszer szolgált ki utast",
- vagy a VI. fejezet döntése kérdezze meg, MELYIK világot zárja le (ez a legjobb: így valódi döntés lesz belőle, nem automatizmus).

---

## 5. Konkrét hangolási javaslatok

Minden javaslat mellett ott a mérési szám, ami alátámasztja. Ahol a konstans
nem a `config.js`-ben van, azt jelzem — és javaslom, hogy **kerüljön oda**, mert
a `config.js` fejléce épp ezt ígéri („minden szám, amit egy játszás után az
ember át akar húzni, ide kerül"), és ezek pont ilyenek.

### 5.1 A hírnév büntetése — a legfontosabb egyetlen szám

**`sim.js` → `_portalokLep()` → `hirnevSzorzo = 0.45 + hirnev/100 * 1.1`
= jelenleg 0,45…1,55; javaslom `0.12 + hirnev/100 * 1.45`-öt (0,12…1,57),
és a mellette lévő `Math.max(0.25, …)` alsó vágást 0,25 → 0,08-ra.**

Mert a mérés szerint a `terjeszkedo` 0,3-as hírnévvel, 97 %-os dühös aránnyal
is 1044 fős átlagforgalmat tartott, és a 30. napi vagyona a
`kiegyensulyozott`-énak 59 %-a volt. A teljes hírnév-összeomlás jelenleg a
forgalomnak csak 55 %-át viszi el az induló szinthez képest; a javasolt
számokkal 88 %-át, ami már valódi büntetés. (A `Math.max(0.25, …)` vágást
azért kell levinni, mert 0,12-es szorzó mellett a mai 0,25-ös padló felülírná
a változtatást, és semmi nem történne.)

### 5.2 A kapufejlesztés nem döntés, hanem automatizmus

**`sim.js` → `_pDimSzint()` → `ar = 1800 * d.szint * (1 + veszely*0.3)`
= jelenleg 1800-as alap; javaslom 6000-et. ÉS `sim.js` → `_portalokLep()` →
az `utem` képlet `(d.szint * 0.75 + 0.25)` osztója = jelenleg 5. szinten 4,0×;
javaslom `(d.szint * 0.35 + 0.65)`-öt = 5. szinten 2,4×.**

Mert **négy aktív stratégiánál a nyitott kapuk átlagos szintje pontosan
5,0/5,0** (az ötödiké 4,6, mert győzelemmel korábban véget ért), és egy normál
kapu 1→5 fejlesztése összesen ~23 400-ba kerül, miközben a `kiegyensulyozott`
25. napi medián vagyona 1 533 203. Ez nem választás. A sok
kapu × 4× érkezés a fő oka annak is, hogy a 14. napra minden állomás a
MAX_UTAS plafonon ül (lásd 0. fejezet).

### 5.3 A portálkarbantartó egyetlen épülettel kikapcsolja az instabilitást

**`config.js` → `INSTABIL_KARBANTARTAS` = jelenleg 40, javaslom 14-et**, VAGY
a hatás osszon el a nyitott kapuk között (`csokk / nyitottDimenziok().length`).

Mert egy 1500 tallérért felhúzott karbantartó 2 mérnökkel tickenként 0,8
instabilitást töröl **MINDEN kapuról egyszerre**, miközben egy kapu növekedése
0,08–0,152/tick + 0,25×veszély utasonként. Mérve: **48 futásból 40-ben NULLA
kapuösszeomlás történt**, és minden karbantartóval rendelkező futás
instabilitása a végén pontosan 0 volt. A dimenziók fájl fejléce szerint ez
lenne „az a nyomás, ami miatt a terjeszkedés nem ingyenes" — jelenleg
1500 tallérért megvásárolható, hogy ne legyen nyomás. (Aki nem épít
karbantartót — `nemtorodom` —, annál 8,5 összeomlás jött, tehát a mechanika
MŰKÖDIK, csak túl olcsón kikapcsolható.)

### 5.4 A késői játéknak nincs pénznyelője

**`sim.js` → `_napiElszamolas()` → `uzemeltetes += ar * 0.012`
= jelenleg 0,012; javaslom 0,04-et, ÉS mellé egy forgalom-arányos tételt
(pl. `utasSzam * 0.5` naponta).**

Mert a bevétel/költség arány egyetlen stratégiánál sem ment 3,65 alá (a
legrosszabbul üzemeltetett állomásé volt a legjobb: 5,27), és **48 futásból
0 csőd** lett. A `kiegyensulyozott` 30. napi medián bevétele **155 319**, a
teljes napi költsége **26 653** — ebből az üzemeltetési átalány egy 170 épületes
állomásra ~1 800, azaz a bevétel **1,2 %-a**. A javasolt 0,04 + forgalmi tétel
ugyanitt kb. 6 000 + 600 = napi 6 600-at jelentene, ami még mindig nem fojt
meg senkit, de a 30. nap utáni „minden mindegy" szakaszt legalább döntéssé
teszi (megéri-e ez a huszadik bolt?).

### 5.5 A díjszabás-csúszka nem döntés

Kísérlet: ugyanaz a stratégia, minden kapun ugyanaz a szorzó, 4 seed × 30 nap.

| dijSzorzo | érkezett utas | portáldíj | szolgáltatás | össz. bevétel | hírnév | elég.% |
|---|---|---|---|---|---|---|
| 0,50 | 17 386 | 761 543 | 1 491 560 | 2 253 103 | 72,7 | 75 % |
| 0,70 | 10 828 | 654 204 | 879 960 | 1 534 164 | 76,9 | 73 % |
| 0,85 | 12 404 | 929 477 | 1 045 154 | 1 974 631 | 75,6 | 75 % |
| 1,00 | 11 902 | 1 082 936 | 1 036 667 | 2 119 602 | 76,1 | 78 % |
| **1,15** | 12 845 | **1 337 936** | 1 131 718 | **2 469 655** | 74,5 | 82 % |
| 1,30 | 9 056 | 1 041 659 | 783 765 | 1 825 423 | 83,0 | 85 % |
| 1,50 | 4 564 | 576 710 | 379 168 | 955 877 | 94,3 | 94 % |

**`dimenziok.js` → `dijVonzero()` = jelenleg `s<=1 ? 1+(1-s)*0.7 : 1-(s-1)*0.9`;
javaslom `s<=1 ? 1+(1-s)*1.5 : 1-(s-1)*0.75`-öt** (0,5-nél 1,75× forgalom
1,35× helyett, 1,5-nél 0,63× a mai 0,55× helyett).

Mert a 0,5 és 1,3 közötti öt beállítás össz. bevétele 1,53 M és 2,47 M között
szór, **de nem monoton** (0,70 rosszabb, mint 0,85 ÉS mint 0,50) — vagyis a
különbség nagyrészt zaj, a csúszka gyakorlatilag lapos. Az egyetlen egyértelmű
tanulság a szélén van: 1,5-nél a bevétel a felére esik. Egy lapos csúszka nem
döntés, csak egy vonszolható elem a felületen. A meredekebb olcsó oldal
adna neki tartalmat: az „olcsó tömeg vs. drága kevesek" választás ma nem létezik.

⚠️ Ez a kísérlet 4 seedes, és a MAX_UTAS plafon a 0,5-ös ágat le is vágja —
a lapos jelleg biztos, a pontos optimum nem.

### 5.6 A VIP Lounge rossz üzlet (miközben a történet megköveteli)

**`epuletek.js` → `vip`: `ido` = jelenleg 220, javaslom 130-at; `szemelyzet`
= jelenleg 3, javaslom 2-t.**

Mert példányonként 50 nap alatt mindössze **114 kiszolgálást** ért el (a bolt
557-et, az étterem 554-et), és bár egy VIP 38 721 tallért termel, ez az árához
képest **12,1× megtérülés — a bolt 50,3×, a könyvesbolt 53,8×-ossal szemben**.
A technológia-abláció ugyanezt mondja a másik oldalról: a `vip_ellatas` ág az
EGYETLEN, ami a semmittevő kutatáshoz képest is mínuszban van (−151 591
tallér). 3 pincér napi 225-ös bére mellett a VIP ma tiszta veszteség — kizárólag
azért épül meg, mert az V. fejezet megköveteli.

### 5.7 Az információs pult a láthatatlan szűk keresztmetszet

**`epuletek.js` → `info`: `kapacitas` = jelenleg 2, javaslom 4-et.**

Mert az info a **legnagyobb áteresztésű épület az egész játékban**
(1704 kiszolgálás példányonként, szemben a biztonsági ellenőrzés 1071-ével),
és egyetlen pult mellett a sor **195–203 főre** hízik — öt pult mellett
mindössze 11-re. A baj nem a szám, hanem hogy a játékos ezt NEM LÁTJA: az
információ „hiány" számlálója közben végig alacsony (14–25), mert az utasok
nem lemondanak róla, hanem beállnak a sorba és ott égetik el a türelmüket.
Minden más igénynél a hiány-számláló jelez; itt nem.

### 5.8 Amivel NEM kell foglalkozni (mérve rendben van)

- **Kezdő pénz és az első 10 nap.** `KEZDO_PENZ = 16 000` mellett a 48 futásból
  11 ment mínuszba és mind a 11 kilábalt; az 1. napi medián vagyon 3 165–8 040.
  Ez pontosan a kívánt „szűk, de nem kegyetlen" indulás.
- **Kosz.** Skálázódik: 1200 utasnál a kosz 1,92/tick-kel nő, egy kobold
  0,55-öt visz el, tehát ~4 kell. Mérve: aki egyetlen takarítóval megy
  (`terjeszkedo`), annál a kosz a maximumon (1000) ül; akinél a takarítószám a
  forgalommal skálázódik, ott 1–2. Ez így jó.
- **Energia.** Az áramszünetben töltött tickek aránya 0–1,2 %. Az ingyen kezdő
  energiamag megtette a dolgát.
- **A biztonsági ellenőrzés és a vám kapacitása.** Aki épít belőlük eleget
  (15–18 db), annál a leghosszabb vám-sor 22–56; a 474-es rekord kizárólag az
  egyetlen vámmal dolgozó `terjeszkedo`-é. Nem a szám rossz, hanem az ő döntése.

### 5.9 Technológia-abláció — melyik kutatás mit ér

Külön kísérlet: ugyanaz a stratégia, de csak EGY technológiát kutat ki (és a
kötelező előfeltételeit), semmi mást. Viszonyítás: „nulla kutatás" (882 582
tallér, 4 seed × 25 nap).

| technológia | teljes ár (lépcsőkkel) | pénz-Δ |
|---|---|---|
| kapu_szkenner | 7 200 (3) | **+300 757** |
| ido_kotes | 11 400 (4) | +258 724 |
| kristaly_takarek | 3 000 (2) | +257 856 |
| kapu_hangolas | 1 400 (1) | **+216 087** |
| stabil_kapuk | 3 600 (2) | +212 219 |
| fejlett_boltok | 2 000 (1) | +175 052 |
| takaritorobot | 3 000 (2) | +131 271 |
| auto_poggyasz | 3 600 (2) | +123 393 |
| gyors_sorok | 1 200 (1) | +120 104 |
| energia_halo | 2 600 (1) | −16 724 |
| teleport_lift | 6 000 (2) | −59 830 |
| gyogyaszat | 2 200 (1) | −115 680 |
| legendas_kapu | 22 900 (7) | −121 939 |
| vip_ellatas | 5 000 (2) | −151 591 |

A rangsor **ugyanazt az egy dolgot mondja, mint az 1. fejezet**: az öt
legjobb technológia mind a KAPUKRÓL szól (több érkezés, kevesebb kristály,
kevesebb instabilitás), a négy legrosszabb mind a KISZOLGÁLÁS MINŐSÉGÉRŐL.
A játék jelenleg a mennyiséget fizeti meg, a minőséget nem.

⚠️ Két korlát: (1) a szám a technológia ÉS az előfeltételei együttes hatása,
tehát a többlépcsős tételek (`ido_kotes` 4 lépcső, `legendas_kapu` 7) a
lépcsőik érdemét is viszik — az `ido_kotes` +258 724-e nagyrészt a benne lévő
`kapu_szkenner`-é; (2) 4 seed kevés, a ±50 000 körüli különbségek zajban vannak.
Az előjel viszont mind a 14 tételnél stabil.

---

## 6. Amit NEM tudok megmérni

Ezek nincsenek lefedve, és nem szabad úgy tenni, mintha lennének:

1. **Élvezet.** A mérés a „jó döntés jobb-e" kérdésre válaszol, arra nem, hogy
   szórakoztató-e. Egy tökéletesen kiegyensúlyozott játék is lehet unalmas.
2. **Az emberi játékos sebessége és tudása.** A gépi játékosaim 10 tickenként
   döntenek, tökéletes információval, sosem kattintanak félre és sosem
   fáradnak el. A pénzpályák ezért optimista felső becslések; egy ember
   lassabban épít, tehát nála a szűk első 10 nap hosszabb.
3. **A modális ablakok időmegállítása.** A valódi játékban a fejezet-, döntés-
   és eseményablak MEGÁLLÍTJA az időt, itt nem. A valódi játék tehát az itt
   mértnél egy árnyalattal könnyebb.
4. **A térkiosztás minősége.** Minden gépi játékos ugyanazt a 4×4-es telekrácsot
   használja (szándékosan: így az elrendezés nem szennyezi az összehasonlítást).
   Egy ember jobb vagy rosszabb elrendezést épít, és a türelem-gazdaság a
   távolságokon áll — ez a mérés vak erre a teljes dimenzióra.
5. **A plafon fölötti világ.** A 15. nap utáni forgalmi számok a `MAX_UTAS`
   miatt le vannak vágva. Nem tudom, hogy egy 3000 fős állomás gazdasága
   hogyan viselkedne — csak azt, hogy a mai szabályok odáig hajtanák.
6. **A ritkán megnyíló dimenziók.** A Boszorkányliget 27, a Sárkánytrónus
   mindössze 12 futásban nyílt meg a 48-ból. A hozzájuk kötött fajok
   (boszorkány, sárkány) és igények (seprű, VIP) egyensúlya alulmintázott.
7. **Két kimenet, amit senki nem ért el:** csőd (0/48) és a
   `terjeszkedes`/`mindet_tartom` ágak hosszútávú összeomlása. A csőd-képernyő
   ebben a mérésben soha nem jelent meg — az az ág továbbra is hitelesítetlen.
8. **A v0.2–v0.4 új ágai: mentés/betöltés, EMELETEK, BÉRBEADÁS, nehézségi
   fokozatok.** Az eszköz a `parancs()` felületet használja, a
   mentés-visszatöltést nem gyakorolja. A gépi játékosaim mind a földszinten
   építkeznek és egyetlen üzletet sem adnak bérbe — a fenti számok tehát a
   földszinti, bérbeadás nélküli, NORMÁL nehézségű játékot írják le. A
   `BERLET_RESZESEDES = 0.42` + `BERLET_NAPIDIJ = 0.006` ág és a
   `konnyu`/`kemeny` fokozat egyensúlya **teljesen méretlen**. Ezek
   mindegyike egy-egy új stratégia a `jatekosok.mjs`-ben (emeletes,
   bérbeadó), és a `futas()` egy nehézség-paraméterrel — érdemes megírni,
   mielőtt a v0.4 számai megszilárdulnak.
9. **Sebesség, FPS, tick-idő.** Szándékosan nincs benne. `npm run fps` az
   iMac dolga.

---

## 7. Ha újra futtatod

```bash
node portal/tools/egyensuly.mjs               # 60000 tick × 8 seed (~5 perc)
node portal/tools/egyensuly.mjs 24000 3       # gyors kör hangolás közben (~1 perc)
node portal/tools/egyensuly.mjs 24000 3 gyors # a díj- és technológia-kísérlet nélkül
```

A stratégiák a `portal/tools/jatekosok.mjs`-ben vannak, mindegyik egy
paraméterezett közös motor: küszöbszámok + kívánságlista + válaszsablon. Új
stratégiához egy új `motor({...})` hívás elég.

**Fontos a hangoláshoz:** a mérés seedjei rögzítettek (`31337, 4242, 90210, 777,
12345, 555001, 8675309, 2718281`), tehát két hangolási kör számai KÖZVETLENÜL
összehasonlíthatók — ellentétben a tick-idővel, ami nem az. Ha egy konstanst
átírsz, futtasd le újra ugyanezzel a paranccsal, és a `qa/egyensuly.json` két
változatát vesd össze.

# AGE OF THE CRYSTALS — kiadási elvárások

A `tools/kiadas_ellenorzo.mjs` **61 elvárása** emberi olvasatban. A sorszámok
azonosak a szonda kimenetével: ha a kapu azt írja, hogy „36. BUKOTT", akkor a
36. pont mondja meg, mi az, és **miért elvárás**.

```bash
node tools/kiadas_ellenorzo.mjs      # ~0,2 másodperc
```

## Mit csinál, és mit NEM

Ez a kapu **statikus**: forrást olvas, nem futtat szimulációt. Nincs benne
16 000 tickes meccs, nincs FPS-mérés, nincs böngésző — ezért fut másodperc
alatt, és ezért lehet menet közben is elsütni, nem csak kiadás előtt.

**Nem duplikálja a determinizmus-szondát.** A tiltott `Math`-hívásokat, a
`for…in`-t és a `Date.now`-t szándékosan NEM nézi: azokat a `npm run det`
1. vizsgálata már statikusan szűri, és két igazságforrásból előbb-utóbb
ellentmondás lesz.

Amit néz, az a másik hibafajta: ami **minden gépen egyformán rossz**. A
determinizmus-kapu erre vak — a v0.9/2 rövid táblája, a v0.7/2 kimaradt
mentés-blokkja és a v0.6/1 elveszett építési parancsa mind bitre reprodukálható
volt.

## Három szint

| szint | jelentése | kilépési kód |
|---|---|---|
| **RENDBEN** | az elvárás áll | — |
| **BUKOTT** | az elvárás sérül | **1** |
| **⚠ FIGYELEM** | dokumentált, tudatos eltérés vagy heurisztika, ami tévedhet | 0 |

A figyelmeztetés-szint nem enyhítés. Minden ilyen elvárásnál a szonda forrása
leírja, MIÉRT nem lehet keményebb — jellemzően azért, mert kétféle helyes
megoldás létezik, vagy mert a kérdést (pl. „a komment a MIÉRT-et magyarázza-e?")
gép nem tudja eldönteni. **Hamis riasztásból kettő is elég ahhoz, hogy senki ne
nézze meg a kimenetet**, ezért ami nem bizonyítható, az nem buktat.

---

## A) Réteghatárok — a sim nem tudhat a világ többi részéről

**1. A `src/sim/` nem importál `render`/`ui`/`net`/`core` réteget.**
A determinizmus-szonda azt őrzi, hogy a sim node-ban lefut; egyetlen visszafelé
mutató import elveszi ezt, és a v0.8 lockstepjének nem marad futtatható magja.

**2. A `src/sim/` csak relatív modult importál (nincs `three`, nincs `ws`).**
Egy külső csomag behúzása a simbe azt jelenti, hogy a szimuláció eredménye egy
idegen könyvtár verziójától függ — a lockstep viszont bitre azonos eredményt
követel minden gépen.

**3. A `src/sim/` nem nyúl DOM-hoz és böngésző-globálishoz.**
A `document`/`window`/`fetch`/`process` bármelyike a simben azt jelenti, hogy a
szimuláció a KÖRNYEZETÉBŐL olvas, és a szonda gépén más világ áll elő, mint a
játékos gépén.

**4. A `src/sim/` importjai relatívak ÉS `.js`-re végződnek.**
A böngésző natív ESM-je nem told kiterjesztést: egy `from './fx'` a `vite dev`
alatt még működik, élesben viszont 404 — az a fajta hiba, ami csak a kirakás
után derül ki.

**5. A render és a UI nem ÍR sim-állapotot.**
A világra hatás egyetlen útja a `sim.parancs(...)`; egy `sim.valami = …` a
render felől azonnali desync a v0.8-ban, mert a másik gépen az a sor nem fut le.

**6. A `src/net/` nem importál `render`/`ui` réteget.**
A lockstep-mag a szonda alatt node-ban fut, valódi socket nélkül is — egy
render-import ezt a vizsgálhatóságot venné el.

**7. A relay-szerver nem importál `src/`-ből.**
A `PLAN.md` v0.8/2 szakasza kimondja: a szerver **nem tud semmit a játékról**,
és pont ettől nem tud desyncet okozni — egy sim-import ezt a garanciát törli.

**8. Az adat-rétegek (`ui/minimap_adat.js`, `ui/civ_valaszto_adat.js`) DOM-mentesek.**
Ezek azért külön fájlok, hogy a szonda node-ban futtatni tudja őket; egy
becsúszó `document` némán visszaviszi a minimapot és a civ-választót abba a
résbe, ahol csak szemmel lehetne ellenőrizni — a felhőben pedig nincs szem.

## B) Sim-higiénia — amit a determinizmus-szonda NEM néz

**9. Nincs `TODO`/`FIXME`/`XXX`/`HACK` a `src/sim/` alatt.**
A sim a projekt legkockázatosabb rétege: egy félkész ág itt nem „majd
megcsináljuk", hanem egy lappangó desync, amit a kapu zölden átenged.

**10. Nincs `console.*` a `src/sim/` alatt.**
Egy tickenként futó kiírás 20 Hz-en és 1600 egységnél mérhető költség, és a
sim-nek eleve nincs dolga a kimenettel — az a hívó rétegé.

**11. Nincs `Object.keys/values/entries` a `src/sim/` alatt.**
Ugyanaz a motorfüggő kulcs-sorrend, mint a `for…in`-nél, csak más köntösben — a
determinizmus-szonda az egyiket fogja, ez a kapu a másikat.

**12. Minden `.sort()` kap összehasonlítót a `src/sim/` alatt.**
Az alapértelmezett rendezés SZÖVEGES, tehát `[2, 10]`-ből `[10, 2]` lesz, és a
sorrend a halmaz méretétől függ — a hash ezt sokkal később mutatja meg, mint
ahol a hiba keletkezett.

**13. A `src/sim/` nevesített exportokat ad (nincs `export default`).**
A szondák név szerint kötnek be (`const { Sim } = await import(…)`), és egy
alapértelmezett export ezt a bekötést csendben elviszi.

## C) Fejléc-kommentek — a MIÉRT, nem a mit

**14. Minden `src/sim/` fájl komment-fejléccel kezdődik.**
A `CLAUDE.md` mércéje szerint a fejléc a MIÉRT-et magyarázza; fejléc nélkül a
következő ember (vagy agent) a kódból próbálja kitalálni a szándékot, és a
projekt eddigi drága hibái pont a félreértett szándékból jöttek.

**15. A sim-fejlécek érdemi hosszúak (≥ 6 sor, ≥ 300 karakter).**
Egy egysoros „// egységek" fejléc formailag megvan, tartalmilag semmit nem ad —
a küszöb az, ami megkülönbözteti a magyarázatot a címkétől.

**16. ⚠ A sim-fejlécek követik a MIÉRT-idiómát (`── CÍM ──` szakasz vagy kimondott „MIÉRT").**
Csak FIGYELMEZTETÉS: azt, hogy egy komment a MIÉRT-et magyarázza-e, gép nem
tudja eldönteni — a `grid.js` és az `rng.js` fejléce hibátlanul indokol, csak
régebbi, mint az idióma, és kemény gátként ez hamis riasztás lenne.

**17. Minden `src/render/` és `src/ui/` fájl komment-fejléccel kezdődik.**
Ugyanaz az elvárás, mint a simnél; a `CLAUDE.md` mércéje épp egy render-fájl
(`units3d.js`) fejléce.

**18. Minden `tools/*_szonda.mjs` fejlécében ott a `HASZNÁLAT:` és a kilépési kód.**
Egy szonda, amiről nem derül ki, hogyan kell indítani és mit jelent a
visszatérési értéke, nem kapu, hanem szkript — CI-be sem lehet kötni.

## D) Verzió — egy forrás, és a terv ne mondjon mást

**19. A `VERZIO` a `src/core/config.js`-ben van, `x.y.z` alakban.**
A `CLAUDE.md` külön kiköti, hogy a `package.json` verziója NEM a játék verziója
— a TELEPESEK-ben ez rendszeresen félrevezetett a deploy-ellenőrzésnél.

**20. A `VERZIO` és a `PLAN.md` utolsó „kész" verziója egyezik.**
Ha a kód v0.9-et mond, a terv meg v0.10-et jelöl késznek, akkor az egyik hazudik
— és a kiadási kapu nem tudja, melyik lépcsőt zárja le.

**21. A kész verziók összefüggő előtagot alkotnak a `PLAN.md`-ben.**
Egy „kész" sor egy nem-kész UTÁN azt jelenti, hogy a terv sorrendje és a munka
sorrendje elvált, tehát a lépcsők közötti függőségekre már nem lehet építeni.

**22. A `VERZIO` az egyetlen verzió-forrás — a kód nem olvas `package.json`-t.**
Két verzió-szám mindig kettéválik; a `package.json`-é szándékosan 0.1.0-n áll, és
ha bárhol az kerülne a képernyőre, a hibajelentések rossz verziót neveznének meg.

**23. Nincs beégetett verzió-sztring a `src/` alatt (csak a `config.js`-ben).**
Egy `'0.9.3'` a HUD-ban vagy a `main.js`-ben az első verzióemelés után némán
elavul, és pont a legláthatóbb helyen hazudik.

**24. ⚠ Az `INTERFACES.md` `__aoc.verzio` példája a mostani `VERZIO`.**
Csak FIGYELMEZTETÉS, mert illusztratív kódblokkról van szó, és az FPS-szonda a
FUTÓ értéket már összeveti a `config.js`-szel — attól még doksi-rothadás, ha egy
magát „igazságforrásnak" nevező fájl elavult számot mutat.

## E) A terv és a jelentések — ne mondjon készet a semmire

**25. A `PLAN.md` verzió-táblázata hézagmentes (v0.1 … v1.0).**
Egy kimaradó sor azt jelenti, hogy egy egész lépcsőről elfelejtettünk dönteni, és
ez a kimaradás pont a tervezés fázisában láthatatlan.

**26. Minden „kész" verzió alatt van „állása" szakasz vagy `qa/` jelentés.**
A `PLAN.md` maga köti ki, hogy minden lépcső saját kiadási kapuval zárul: egy
„kész", ami mögött nincs se leírás, se mérés, csak egy állítás.

**27. Minden „állása" szakaszhoz van sor a fő táblázatban.**
A fordított irány ugyanígy hazudik: egy részletesen leírt szakasz, ami a
státusz-táblázatban nem szerepel, kimarad az áttekintésből.

**28. A `PLAN.md` minden hivatkozott `qa/` fájlja létezik.**
Egy nem létező jelentésre hivatkozó „kész" a lehető legmeggyőzőbb üres állítás —
úgy néz ki, mintha mérés állna mögötte.

**29. Minden `qa/` jelentésre hivatkozik a `PLAN.md`.**
Egy jelentés, amire a terv nem mutat, elveszik: senki nem tudja, melyik lépcső
melyik számait rögzíti.

**30. A szakasz-táblák minden sorának ki van töltve az állapota.**
A `| v0.4/1 | … | |` alakú sor azt jelenti, hogy egy szakasz elkezdődött, és
senki nem írta le, hol tart — ez a féltudás rosszabb, mint a semmi.

## F) Szondák — ami nincs a `package.json`-ban, azt senki nem futtatja

**31. Minden `tools/*_szonda.mjs`-hez tartozik `npm run` parancs.**
Egy kézzel indítható szonda a gyakorlatban SOSEM fut le, tehát pontosan annyit
ér, mintha meg sem írtuk volna.

**32. A `package.json` minden hivatkozott fájlja létezik.**
Egy elgépelt vagy átnevezett útvonal a láncban csak akkor derül ki, amikor épp a
kapura lenne szükség.

**33. Az `npm run szonda` lánc minden szonda-parancsot tartalmaz.**
Ez a projekt „mindent lefuttat" gombja; ami kimarad belőle, az a legfrissebb,
tehát legkockázatosabb kód marad a kapun kívül.

**34. Minden szonda kilépési kóddal zár (`process.exit`).**
Kilépési kód nélkül egy bukott szonda is sikeresnek látszik minden láncban és
minden CI-ben — a legrosszabb fajta hamis biztonságérzet.

**35. A kiadás-ellenőrzőnek is van `npm run` parancsa.**
A 31. pont logikája önmagára is vonatkozik: egy kapu, amit csak kézzel lehet
elindítani, a gyakorlatban nem fut le — ezért ez is kemény gát (`npm run kiadas`).

## G) Tábla-teljesség — a rövid tábla CSENDBEN a 0. sort adja vissza

Ez a csoport a v0.9/2 tanulsága kódba írva. Az `egyedi.js` fejléce tizennégy
`TIPUS`-indexelt táblát sorol fel, és kimondja: egy elfelejtett tábla nem hibát
dob, hanem `undefined`-et ad, abból `NaN` lesz, a `NaN` pedig minden
összehasonlításban hamis — a rendszer nem elszáll, hanem **csendben nem csinál
semmit**, tökéletesen reprodukálhatóan.

**36. Minden `TIPUS`-indexelt tábla `TIPUS_DB` hosszú.**
Tizenhét tábla indexelődik az egységtípussal, és az elsőnél, ami rövidebb marad,
a legfelső típus (ma az `EGYEDI`) némán a munkás adatait vagy `undefined`-et kap.

**37. A `TIPUS` enum hézagmentes 0 … `TIPUS_DB`-1.**
A típus INDEX, nem címke: egy kihagyott érték a táblák közepén egy sosem
használt sort hoz létre, a végén pedig kimutathatatlan túlcímzést.

**38. Minden `EPULET`-indexelt tábla az épülettípusok számával egyezik.**
Ugyanaz a hibafajta az épület-oldalon: egy rövid ár- vagy életerő-tábla az új
épületet ingyenessé vagy halhatatlanná teszi, hibaüzenet nélkül.

**39. ⚠ A tudatosan rövid `EPULET`-táblák védettek maradnak.**
Csak FIGYELMEZTETÉS: a `KEPEZ` szándékosan rövidebb (a torony és a piac nem
képez), és mindkét olvasója `!lista`-val védi magát — de ha egyszer egy KÉPZŐ
épület kerül a lista végére, itt esne ki csendben.

**40. Az `EPULET` enum hézagmentes.**
Lásd a 37. pontot; az épület-index tizenegy táblát címez, és egy lyuk mindegyikben
eltolást okoz.

**41. Minden `CIV`-indexelt tábla `CIV_DB` hosszú.**
Egy hiányzó név, leírás vagy bónusz-sor esetén a nyolcadik nép a semmivel indul,
és a civ-választóban `undefined` jelenik meg.

**42. A `CIV` enum hézagmentes és `CIV_DB` méretű.**
A `civ.js` maga köti ki, hogy a sorrend az indexük, és sosem cseréljük fel — a
mentés és a hash egyaránt erre az indexre épül.

**43. Minden népnek van HÁTRÁNYA is (a fordított olvasattal együtt).**
A `PLAN.md` v0.9-es szakasza kimondja: egy csupa pozitívumból álló nép nem „erős
civ", hanem a választás megszüntetése — mindenki azt játszaná, a másik hét pedig
halott kód lenne.
⚠️ A vizsgálat a **fordított olvasatot** is kezeli: az ÁR és az IDŐ esetén a
POZITÍV szám a hátrány. Ezen a projekten már megbukott a determinizmus-szonda
12. vizsgálatának első változata — és ennek az ellenőrzőnek az első változata is
(a Kristálykovácsok sorát hibásnak jelentette, pedig szabályos nép).

**44. Minden `TECH`-indexelt tábla `TECH_DB` hosszú.**
Egy rövid ár- vagy idő-tábla a hatodik technológiát ingyenessé vagy azonnalivá
teszi, és a technológiafa csendben elveszti az egyensúlyát.

**45. Minden `TERKEP`-indexelt tábla `TERKEP_DB` hosszú.**
A `terkep.js` fejléce szerint EGY generátor van, és a preset csak SZÁMOKAT ad
neki — egy hiányzó paraméter-sor esetén az utolsó preset `undefined`-del generálna.

**46. Minden név-tábla a saját enumjával egyforma hosszú.**
A `NYERS_NEV`, `EPULET_NEV`, `TECH_NEV` és társaik a HUD-ra kerülnek: egy rövid
tábla nem hibát ad, hanem egy `undefined` feliratot a játékos képernyőjén.

**47. A `SZORZO` ellensúly-mátrix `TAMADAS` × `PANCEL` méretű.**
Ez a mátrix hordozza az egész fegyvernem-háromszöget; egy hiányzó oszlop a
legfelső páncéltípus (ma az ostrom) elleni minden sebzést `NaN`-ná teszi.

**48. Az `EGYSEG_TIPUS_DB` (`civ.js`) és a `TIPUS_DB` (`units.js`) egyezik.**
A civek ár- és idő-szorzói ekkora tömbökbe terülnek szét, és ha a kettő elválik,
a `MIND` indexű bónusz csendben kihagyja a legfelső típust — épp az egyedi
egységet, ami az adott népé.

## H) Mentés — ami kimarad a betöltésből, az elveszik

**49. A `betoltes()` minden `mentes()`-blokkot visszatölt.**
A v0.7/2 legdrágább hibafajtája: a mentés kiír egy blokkot, a betöltés meg nem
olvassa — mindkét művelet hibátlanul lefut, és a hiányzó réteg csak a
FOLYTATÁSBAN, több száz tickkel később mutatkozik meg.

**50. A `betoltes()` ellenőrzi a verziót, a seedet, a méretet és a presetet.**
A terepet nem mentjük (a seedből épül), tehát más seeddel vagy más
térkép-preszettel betöltve a sereg egy másik pálya vizében állna.

**51. A `MENTES_VERZIO` létezik, és a mentés is, a betöltés is használja.**
Enélkül egy régi formátumú mentés nem elutasításba fut, hanem félig betöltődik —
és a hiányzó blokkok helyén nullák maradnak.

**52. A `MENTES_VERZIO` emelése dokumentálva van (melyik blokk mikor jött).**
A puszta szám nem mond semmit; a projekt idiómája az, hogy a szám mellett ott áll,
melyik verzió melyik blokkot hozta — enélkül nem lehet eldönteni, kell-e emelni.

**53. A mentés szöveges párja is megvan (`mentesSzoveg` / `betoltesSzoveg`).**
A böngésző-tároló és a v0.8 pillanatképe egyaránt szöveggel dolgozik, és a
hibás JSON-t egy helyen kell elkapni, nem a mélyben.

## I) Render-szerződés és halott kód

**54. Minden render-osztály adja a `frissit` / `set enabled` / `get haromszog` hármast.**
Az FPS-szonda ezen a hármason kapcsolja ki a rétegeket egyesével, és a
képkocka-költség bontása ezen múlik — egy szerződést nem tartó réteg kimarad a
mérésből, és a hiányzó ezredmásodpercek senkinek nem tűnnek fel.

**55. ⚠ A render `frissit()`-je nem allokál képkockánként.**
Csak FIGYELMEZTETÉS: a `CLAUDE.md` szabálya („nulla per-frame allokáció")
egyértelmű, de egy `new Map()` egy ritkán futó ágban lehet ártalmatlan — a
heurisztika jelez, az ítéletet a mérés hozza.

**56. ⚠ Nincs halott fájl a `src/` alatt (a `main.js`-ből vagy egy szondából elérhető).**
Csak FIGYELMEZTETÉS, mert a `PLAN.md` maga jelöl be még be nem kötött fájlokat
(a civ-választót a v0.11 köti be) — a lista mégis kell, mert egy „kész"
alrendszer, amit senki nem importál, a legdrágább fajta önámítás.

## J) Build és kirakás

**57. ⚠ A `vite.config.js` `base`-e és a `PLAN.md` kirakási kikötése összeér.**
Csak FIGYELMEZTETÉS, mert két jó megoldás van (relatív `'./'` vagy abszolút
`'/aotc/'`) — de a kettő nem lehet EGYSZERRE a terv, és ez az a fajta eltérés,
ami helyi `vite preview`-val SOSEM jön elő, csak élesben.

**58. A `.gitignore` kizárja a `node_modules`-t és a `dist`-et.**
Egy verziókövetésbe kerülő build-kimenet minden ágon ütközik, és a `dist/`
zaja elrejti a valódi változásokat a felülvizsgálat elől.

**59. Az `index.html` a `src/main.js`-t tölti be.**
A belépési pont elgépelése üres képernyőt ad, amit se a determinizmus-szonda, se
a build nem vesz észre — a `vite build` a hivatkozás nélküli modult egyszerűen
kihagyja.

**60. A `CLAUDE.md`, `INTERFACES.md`, `PLAN.md` és `README.md` megvan és nem üres.**
Ezek a projekt szerződései; több agenttel dolgozunk, és a `CLAUDE.md` külön
kiköti, hogy az `INTERFACES.md`-et előbb kell elolvasni, mint a kódot.

**61. A `CLAUDE.md` által kikötött szondák léteznek.**
A munkaszabályok konkrét parancsokat írnak elő (`npm run det`, `node tools/kep.mjs`);
egy hiányzó szonda esetén a szabály betarthatatlan, és csendben elhagyják.

---

## Az ellenőrző saját kapuja: a negatív kontroll

⚠️ **Egy kapu, ami az első futásra zöld és sosem láttuk pirosnak, semmit nem ér.**
Ezért mind a 61 elvárás **negatív kontrollal** lett próbálva: a projekt egy
másolatában egyesével elrontottuk azt, amit az adott elvárás őriz, lefuttattuk az
ellenőrzőt, és megköveteltük, hogy **pontosan az az elvárás** váltson át
BUKOTT-ra (vagy FIGYELEM-re). A futás végén az alap-kimenet bitre visszaállt.

**Eredmény: 61/61 elsül.** Ötnél (16., 24., 39., 56., 57.) el sem kellett rontani
semmit: azok az ép projekten is megszólalnak, figyelmeztetés-szinten.

Néhány szabotázs a listáról, hogy látszódjon, mire megy a próba:

| elvárás | a szabotázs |
|---|---|
| 1. | `import { Mag3D } from '../render/core3d.js'` az `ai.js` tetejére |
| 5. | `sim.tick = 0;` a `kod3d.js` `frissit()`-jébe |
| 12. | `sor.sort((a, b) => a.t - b.t)` → `sor.sort()` |
| 20. | `VERZIO` átírása `'0.2.9'`-re |
| 26. | `## A v0.7 állása` → `## A v0.7 helyzete` |
| 33. | `npm run halo` kivétele a `szonda` láncból |
| 36. | a `LATOTAV_EGYSEG` visszavágása 5 eleműre |
| 37. | `OSTROMGEP: 4` → `OSTROMGEP: 7` |
| 43. | a 2. nép `[HATAS.UTEM, NYERS.KO, -10]` → `+10` |
| 47. | egy `SZORZO`-sorból egy oszlop törlése |
| 49. | a `m.maxEgyseg` ellenőrzésének kiiktatása a `betoltes()`-ből |
| 50. | a térkép-preset ellenőrzésének kiiktatása a `betoltes()`-ből |
| 54. | `get haromszog()` → `get haromszogek()` a `lovedek3d.js`-ben |

---

## Amit a kapu az ELSŐ futásán talált (v0.9.3 → v0.10.1)

Az ellenőrző első éles futása **3 BUKOTT** elvárást adott. Mindhárom valódi hiba
volt, és mindhármat a sim gazdája javította ki ugyanabban a munkamenetben —
az ellenőrzőt író agent egyiket sem nyúlta meg (diszjunkt fájlkészlettel
dolgozunk). **Ezért érdemes leírni őket: ez a kapu bizonyítéka.**

### 31. — a civ-választó szondának nem volt `npm run` parancsa

A `tools/civ_valaszto_szonda.mjs` megvolt és lefutott, de a `package.json`-ban
nem volt hozzá script, és az `npm run szonda` láncban sem szerepelt. A
gyakorlatban tehát soha nem futott le. *(Javítva: `npm run civ`, és bekerült a
láncba.)*

### 36. — HÁROM rövid `TIPUS`-indexelt tábla

A v0.9/2 saját fejlécében leírt hibafajta, élőben:

| tábla | hol | hossz volt |
|---|---|---|
| `LATOTAV` | `src/sim/parancsallapot.js` | 5 (kell: 6) |
| `ELENGED` | `src/sim/parancsallapot.js` | 5 (kell: 6) |
| `LATOTAV_EGYSEG` | `src/sim/kod.js` | 5 (kell: 6) |

Következmények, mindhárom NÉMA és tökéletesen determinisztikus:

- `LATOTAV[TIPUS.EGYEDI]` → `undefined`, tehát a `d < sugar` vizsgálat mindig
  hamis: **az egyedi egység soha nem szerzett magától célpontot.**
- `LATOTAV[…] * 2` → `NaN` az épület-célzásban, ugyanezzel a hatással.
- `LATOTAV_EGYSEG[TIPUS.EGYEDI]` → `undefined`, amiből a `Kod._folt()`-ban
  `(undefined / KOD_OSZTO) | 0 = 0` sugár lett: **az egyedi egység gyakorlatilag
  semmit nem látott a hadi ködben**, tehát felderítésre alkalmatlan volt.

A hash mindezt zölden átengedte: a semmittevés is reprodukálható. Nyolc népből
nyolcnak az egyedi egysége volt érintve, két verzión keresztül.

### 49. — a `maxEgyseg` mentődött, de nem töltődött vissza

A `mentes()` kiírta a `maxEgyseg`-et, a `betoltes()` viszont sosem olvasta (a
`seed`, `n` és `terkep` mellől kimaradt az ellenőrzése). Egy nagyobb kapacitású
mentés kisebb simbe töltve `e.db`-t a tömbök hossza fölé állította volna,
csendben.

## Amit a kapu MA mond

**0 BUKOTT, 5 figyelmeztetés.**

| # | mit mond |
|---|---|
| 16. | a `grid.js` és az `rng.js` fejléce indokol, de nem a `── CÍM ──` idióma szerint |
| 24. | az `INTERFACES.md` `verzio: '0.3.0'`-t mutat, a `config.js` viszont `0.10.1`-et |
| 39. | a `KEPEZ` 9 hosszú 11 helyett — tudatos, mert az olvasói `!lista`-val védettek |
| 56. | `src/ui/civ_valaszto.js` és `src/ui/menu.js` — se a `main.js`, se szonda nem importálja |
| 57. | `vite.config.js` `base: './'` vs. `PLAN.md` `'/aotc/'`, és a fájl kommentje `/aoc/`-t ír |

---

## Ha új réteget veszel fel

Az ellenőrző **nem magától találja meg** az új kódot — nyilvántartásból dolgozik,
pont úgy, ahogy a determinizmus-szonda forgatókönyvekből.

- **Új `TIPUS`-, `EPULET`-, `CIV`-, `TECH`- vagy `TERKEP`-indexelt tábla** →
  vedd fel a `tools/kiadas_ellenorzo.mjs` megfelelő `*_TABLAK` listájába.
- **Új név-tábla** → a `NEV_TABLAK` listába, a hozzá tartozó enummal együtt.
- **Új szonda** → `npm run` parancs a `package.json`-ba ÉS bele a `szonda` láncba
  (a 31. és a 33. pont ezt kéri számon).
- **Új elvárás** → ide is egy sorszámozott bekezdés, egy mondat a MIÉRT-ről, és
  egy negatív kontroll, ami bizonyítja, hogy tud pirosat mutatni.

⚠️ **Ma NEM fedett könyvtár: `src/audio/`.** A v0.12 hang-rétege az ellenőrző
megírása közben született, és tudatosan maradt ki a fájl-listákból, hogy ne
adjon hamis riasztást egy félkész sávra. Amint a réteg megáll, fel kell venni a
`RENDER`/`UI` melletti harmadik csoportba — a `PLAN.md` v0.12-es szakasza
kimondja, hogy **a hang SOHA nem szólhat bele a simbe**, és pont ez az a
szabály, amit az 5. pont (a render nem ír sim-állapotot) mintájára gépileg
számon lehet kérni rajta.

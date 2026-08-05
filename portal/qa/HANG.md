# HANG — SFX-hangolás mérési jegyzőkönyve

> Minden szám ebben a fájlban ugyanabból a mérésből jön:
> `node portal/tools/hang_szonda.mjs`, 6. vizsgálat.
> **Előtte** = a `68376c8` (v0.3) hangkódja, **utána** = a mostani.
> A két oszlopot UGYANAZ a szonda mérte, UGYANABBAN a munkamenetben —
> a „régi" oldalt egy külön `git worktree`-ben építettük fel, hogy a mérés
> ne a szonda változásától mozduljon el.

---

## 1. Hogyan mérünk hangot

A hangot nem lehet automatikusan meghallgatni, de meg lehet mérni. A
5. vizsgálat eddig egyetlen dolgot tudott: **van-e jel** (üres állomás 0,028 →
nyüzsgő+instabil 0,427). Ez a szám igaz marad egy fárasztó, torlódó,
levágásig vezérelt, monó hangképre is — vagyis pont arról nem mond semmit,
amiért a hangolás történik.

A 6. vizsgálat ezért **offline rendereli** a gráfot. A `Hang.inditas(ctx)`
kapott egy varratot: ha kívülről adnak neki `OfflineAudioContext`-et, ugyanaz
a hanggráf épül fel, csak valós idő helyett **kiszámolódik**. A kapott
hullámformán már mérhető FFT, csúcs, effektív érték, levágás és
sztereó-korreláció — és a mérés **megismételhető**, mert a `Math.random`-ot a
gráfépítés idejére leszögeljük.

Két mérési döntés, ami nélkül a számok félrevezetnének:

- **A sávenergia és a hangosság A-SÚLYOZOTT.** Nyers energiában minden
  természetes keverék mélyhang-uralta (a teljesítmény az amplitúdó
  négyzete). A nyers spektrum a régi hangképben **86,8 %-ot** mutatott a
  120 Hz alatti sávban — miközben a fül azt alig hallja. Nyers RMS-sel mérve
  az összeomlás-riasztás „mindössze 0,8 dB-lel" emelkedett ki a háttérből;
  A-súlyozva ugyanaz a jelenet **11,7 dB**. A második szám az igaz.
- **A sztereó-korrelációt 200 Hz FÖLÖTT mérjük.** A portál mélye
  szándékosan monó (a szétterített basszus monóban kioltja magát). Ha
  beleszámolna, a szám akkor is 0,9 fölött ülne, ha fölötte minden réteg
  tökéletesen széles.

---

## 2. Az eredmény

| mérés | előtte (v0.3) | utána | |
|---|---|---|---|
| **sztereó-korreláció (>200 Hz)** | **1,000** — teljesen monó | **0,642** | ✅ |
| **levágott minta 24 esemény alatt** | **40** | **0** | ✅ |
| csúcs ugyanott | **1,469** (a limiter UTÁN) | **0,765** | ✅ |
| élő hangszál 24 kérésből | 12 | 10 | ✅ |
| **a háttér hátralépése riasztás alatt** | **0,3 dB** | **10,2 dB** | ✅ |
| az összeomlás kiemelkedése a nyüzsgésből | 11,7 dB | **13,5 dB** | ✅ |
| **„esemeny" alaphangja 8 megszólalásból** | **0,00 %** — bitre ugyanaz | **0,83 %** | ✅ |
| **„kassza" alaphangja 8 megszólalásból** | **0,00 %** | **0,60 %** | ✅ |
| „kassza" szintje 8 megszólalásból | 2,5 % | 9,5 % | ✅ |
| 1–2,5 kHz sáv részesedése (A-súlyozva) | 37,2 % | 34,2 % | ↘ |
| 120–400 Hz | 14,4 % | 16,8 % | ↗ |
| 2,5–6 kHz | 14,5 % | 15,2 % | ↗ |
| >6 kHz | 3,5 % | 4,6 % | ↗ |
| keverék RMS / csúcs | 0,160 / 0,643 | 0,166 / 0,591 | — |
| crest (csúcs/RMS) | 12,1 dB | 11,0 dB | — |
| levágás a normál nyüzsgésben | 0 | 0 | — |

A szonda a v0.3-as kódra **20 hibát** jelez, a mostanira **nullát**.

---

## 3. Mi változott, és miért

### 3.1 Ismétlődés — a leghosszabb távú baj

A `jelez()` eddig **pontosan ugyanazt** a hullámformát ütemezte minden
megszólaláskor; egyedül a zajrétegek indultak véletlen pontról. Mérve: a
„kassza" alaphangjának szórása nyolc egymás utáni megszólalásból **0,00 %**,
a hangszíné **0,00 %**. Ez húsz perc alatt idegesítő; a játékos nem a hangot
kapcsolja le, hanem az egész hangrendszert — és vele a HUD-ot helyettesítő
állapotjelentést is.

Minden hang kapott egy `valtozat: { hangolas, hangero, ido }` mezőt: kicsi,
megszólalásonkénti véletlen eltérést a hangmagasságban, a szintben és a
jegyek időzítésében. A számok **nem egyformák**, és ez a lényeg:

| | hangolás | miért |
|---|---|---|
| `gomb` | ±4,5 % | ezerszer hallod, és nem dallamos |
| `epit`, `bont` | ±5,0 / 5,5 % | koppanás, nincs hangneme |
| `kassza`, `esemeny` | ±1,5 % | harang: ±26 cent, még nem hamis |
| `fejezet`, `gyozelem`, `csod` | ±0,6…0,8 % | fanfár — itt a hamisság azonnal feltűnik |
| `foszlany_furcsa` | ±26 % | ez pont attól jó, hogy sosem ugyanaz |

A `hangolas` a szűrőkre is hat, tehát a hangszín EGYÜTT mozog a
magassággal — nem lassított-felgyorsított szalag lesz belőle.

⚠️ A szonda csak két, dallamos kódot mér FFT-vel (`esemeny`, `kassza`): a
csúszó hangmagasságú koppanásoknál nem lehet pontos alaphangot mérni. Ezért
az 1. vizsgálat **statikusan** megköveteli, hogy MINDEN hangnak legyen
`valtozat` mezője, értelmes tartományban. A mérés a mechanizmust bizonyítja,
a statikus kapu a lefedettséget.

### 3.2 Torlódás — az egy képkockára eső eseményáradat

A rács 64×48-ról 96×72-re nőtt, tehát egyre több minden történhet egyszerre.
Mérve: 24 esemény EGYETLEN képkockában **1,469-es csúcsot** adott, azaz
40 mintányi **kemény levágást a limiter UTÁN**. A kemény levágás az egyetlen
torzítás, amit a fül azonnal hibaként hall.

Három egymásra épülő védelem került be:

1. **Kódonkénti torlódás-zár** (`torlodas`, 0,03–1,0 s). Hat kassza egy
   képkockában nem hatszor hangosabb kassza, hanem fésűszűrt reccsenés —
   azonos hullámformák néhány mintányi eltéréssel kioltják egymás sávjait.
   A másodikat tehát nem halkítjuk, hanem **eldobjuk**.
2. **Sorozat-csillapítás.** Egy 130 ms-os ablakban számoljuk az indított
   hangokat, és az újakat 1/√n-nel halkítjuk (padló: 0,34). Véletlen fázisú
   hangok összege √n-szeres, nem n-szeres — ez a szorzó tehát pont azt tartja
   szinten, amit a fül hangosságnak hall. **A 3. elsőbbség kimarad**: a
   katasztrófát nem halkíthatja le, hogy közben tíz kattintás is elindult.
3. **Puha vágó a limiter után** (`hang_ter.js` → `puhaGorbe`). A limiternek
   időállandója van (3 ms); egy képkockányi áradat egyetlen minta alatt épül
   fel. A lágy térdű `tanh`-görbe 0,62-ig pontosan egyenes, fölötte hajlik,
   és a legnagyobb lehetséges kimenet 0,91 — a levágás matematikailag
   lehetetlen.

⚠️ **Amit ez a kör megtanult:** a görbe első változata
`tanh(x·a)/tanh(a)` volt, aminek a meredeksége a nullában 1,63. Mérve: a
teljes keverék RMS-e 0,160-ról 0,260-ra ugrott (+4,3 dB) attól a görbétől,
ami elvileg csak véd. **A védelem, ami hangosít, nem védelem.** A mostani
görbe meredeksége a nullában pontosan 1.

### 3.3 Dinamikatartomány — a duck

A fontos hang eddig ugyanabba a zajba beszélt, amiben minden más: mérve a
háttér **0,3 dB-lel** halkult egy kapu-összeomlás alatt (vagyis sehogy). A
kézenfekvő válasz — „legyen hangosabb az omlás" — nem működik, mert a
limiter pontosan azt húzza vissza, amivel az egészet feljebb tolnánk.

Amit minden rádióadás csinál ehelyett: a fontos jel alatt a **háttér**
halkul. Az ambiens és a zene egy `duck` erősítőn megy át; a 3. elsőbbségű
hangok −11 dB-t, a 2. elsőbbségűek −3,9 dB-t kérnek belőle, a hang hosszára
plusz 0,3 s farokra. **Az effekt-busz NEM duckol** — az összeomlás nem
halkítja le önmagát, és a kattintás visszajelzése is éles marad.

Mérve: a háttér **10,2 dB-lel** lép hátra a riasztás alatt (előtte 0,3 dB).

A szondában ezt külön mérjük, mert a ducknak **nincs saját hangja**: ugyanaz
a jelenet lefut még egyszer, de az eseményt `hangero: 0`-val kérve — a hang
nem szól, a duck viszont igen. Ami ilyenkor a háttéren látszik, az pontosan a
mechanizmus hatása.

### 3.4 Térhatás — a hangkép eddig egy pont volt

Mérve: sztereó-korreláció **1,000**. A játék monóban szólt.

| réteg | mi lett belőle |
|---|---|
| portálzúgás | a két elhangolt fűrész ±0,72-re szétnyitva; a **mély és a disszonáns felhang középen marad** |
| tömegzaj | KÉT független zajforrás ±0,78-ra, kissé elhangolt szűrőkkel |
| hangfoszlány | minden foszlány máshonnan jön (±0,85 véletlen) |
| levegő | új, alig hallható magas réteg ±0,85-re |
| zenei pad | a négy hang ±0,38-ra szétterítve |
| egylövetű effekt | `pan` opció, és `x, y` rácskoordinátából kamerához képest |
| közös zengető | sztereó, procedurális impulzusválasz |

Két hibát kellett egyszerre elkerülni, és a korreláció mindkettőt mutatja:
1,000 közelében monó a hangkép; **nulla ALATT** viszont a két oldal
ellenfázisba kerül, és monóban lejátszva (laptop-hangszóró, telefon) a
tartalom kioltja magát. Egy közbenső állapotban a mért érték **−0,267** volt
— ott a zengető volt túl hangos (lásd lent). A végleges: **0,642**.

⚠️ **Amit ez a kör megtanult:** egyetlen monó forrást két panorámázóra
kötni nem szélesít semmit — ugyanaz a jel érkezik mindkét oldalra. A tömeg
azért lett tényleg széles, mert két KÜLÖN zajforrás megy két külön szűrőn.

### 3.5 A közös tér

Tizenkét külön effekt, mindegyik saját burkolóval, zengés nélkül tizenkét
külön szintetizátornak hallatszik. A `hang_ter.js` egy **procedurális**
impulzusválaszt épít (korai visszaverődések + sűrű, sötétedő farok, két
csatorna független véletlenből) — nincs hangfájl, a `dist/` továbbra is
másolható bárhová. Hangonként a `ter` mező mondja meg, mennyit küld bele:
a kattintás 0,07-et, a győzelem 0,52-t.

⚠️ **Amit ez a kör megtanult:** egy konvolúció ERŐSÍTÉSE nem a válasz
átlagos amplitúdója, hanem a **négyzetösszegének gyöke**. Az első változat
mintánkénti RMS-re normált, ami 72 000 mintán ~12-szeres erősítést jelentett:
a zengés háromszor hangosabb lett a száraz jelnél, és az egész keverék a
zengetőn keresztül szólt (innen a −0,267-es korreláció is). Most a válasz
egységnyi ENERGIÁRA van normálva, tehát a `TER.szint` tényleg a zengés/száraz
arányt állítja — és a terem hosszának hangolása nem mozdítja el a hangerőt.

### 3.6 Frekvencia-egyensúly

A legterheltebb sáv az 1–2,5 kHz volt, **37,2 %**-kal. Ez a fül
legérzékenyebb tartománya, és pont innen jön a „tíz perc után fáradok el"
érzés. Három forrása volt, és mind a három FOLYAMATOS:

- a hangfoszlány két sávszűrője 700 és 1900 Hz-en, Q 6 és 8 jósággal —
  két keskeny, rezonáns csúcs a legrosszabb helyen → **560 és 1450 Hz,
  Q 3,5 és 4,5**;
- a portálzúgás szűrőjének rezonanciája 100 % instabilitásnál →
  `szuroMax` 1750 → **1500 Hz**, `szuroQ` 0,9 → **0,72** (az instabilitás
  így is hallatszik, csak nem szúr);
- a kattintás sziszegő éle → felüláteresztő 2600 → **2100 Hz**, szintje
  0,22 → 0,17.

Ellensúlyként az `esemeny` a d5-ről (587 Hz) az a5-re (880 Hz) került, és
kapott egy **2,76-szoros** felhangot — ez a csöves harang jellegzetes, nem
egész számú felhangja, ettől lesz „harang" és nem „síp". A `kassza` csillogó
zaja 4200 → 5200 Hz-re és feljebb a szintben: ez az egyetlen hang, ami
tudatosan a 2,5–6 kHz-es sávba került. Ritka, jutalom, és a nyüzsgés fölött
a hirtelen megjelenő csillogásra kapja fel a fejét a fül, nem a hangerőre.

Eredmény: 37,2 % → **34,2 %** az 1–2,5 kHz-ben, és mindhárom szomszédos sáv
kapott valamit. Ez **javulás, nem megoldás** — lásd a nyitott tételeket.

### 3.7 Hangulat

Új hang: **`foszlany_furcsa`** — rövid, csúszkáló füttyentés, minden
ötödik-hatodik hangfoszlány helyett. Tíz FAJ jár az állomáson (szellem,
troll, lebegő medúza); ha mind ugyanazt a szűrt zajmormogást adja, akkor a
tömeg egyfajta tömeg. Ez a bejegyzés nem beszéd, hanem „valami MÁS is van
itt". Halk, ritka, és a hangolása ±26 % — kétszer ugyanúgy sosem szólal meg.

Új folyamatos réteg: **`levego`** — alig hallható magas suhogás (a szintje
két nagyságrenddel a tömegzaj alatt). Nem hangosít; kinyitja a teret. A
hangkép a 400 Hz – 2,5 kHz-es sávban tömörült, fölötte gyakorlatilag semmi
nem volt, és ezt a fül ZÁRT, kicsi térként hallja.

---

## 4. Ami NYITOTT

1. **Ember még nem hallgatta meg.** Minden szám ebben a fájlban gépi. A
   mérés azt tudja megmondani, hogy a hangkép nem torlódik, nem vág le, nem
   monó és nem ismétli önmagát — azt nem, hogy **szerethető**-e. Ez az
   egyetlen olyan tétel, ami a hang-sávot „mért" helyett „részben mért"
   állapotban tartja.
2. **A térhatás nincs bekötve.** A `Hang.kamera()` és a `jelez(kod, {x, y})`
   megvan és működik, de a `fo.js` még nem hívja — a `fo.js` nem ennek a
   sávnak a fájlja. A pontos bekötést lásd az 5. pontban. Amíg nincs meg,
   az egylövetű effektek középen szólnak (a folyamatos rétegek és a
   foszlányok térhatása MÁR él, mert azok a hangrétegen belülről indulnak).
3. **A frekvencia-egyensúly javult, de nem kész.** Az 1–2,5 kHz-es sáv még
   mindig a legterheltebb (34,2 %). A következő lépés valószínűleg nem újabb
   szűrő-hangolás, hanem a tömegzaj alapszínének lejjebb vitele — az viszont
   már azt kockáztatja, hogy „szellőzőrendszer" lesz belőle, tehát fülre kell
   megcsinálni, nem mérőszámra.
4. **A paletta 3 sávra terül szét, nem többre.** A 120–400 Hz-ben csak a
   `csod` és a `hiba` ül, 2,5 kHz fölött egyetlen effekt sem dominál. Ez
   nem hiba (a `kassza` csillogása odaér), de van hely.
5. **CPU-ban nem mértük.** A zengető egy `ConvolverNode` (1,5 s sztereó
   válasz), hangonként pedig 2-3 csomóponttal több épül, mint eddig. A
   felhőben mért FPS semmit nem ér (nincs GPU), tehát ezt **valódi gépen kell
   ellenőrizni** — `npm run portal:fps` MÉG NEM futott rá.

   Amit tudunk: a böngésző-szonda ezzel a hangkóddal, a `68376c8`-as
   render-réteggel **372 ms/képkockát** mért (szoftveres raszterizáló, tehát
   sebesség-ítéletnek nem használható) és **zölden futott le**. A jelenlegi
   munkapéldányban ugyanez 769 ms/képkocka és két vizsgálat elbukik — az
   viszont a párhuzamosan futó textúra/render-sáv állapota, nem a hangé: a
   különbséget úgy mértük, hogy UGYANEZT a hangkódot a régi render-réteg
   mellé raktuk.

---

## 5. Bekötés a `fo.js`-be (nem ennek a sávnak a fájlja)

A hang-sáv NEM nyúlt a `fo.js`-hez. A meglévő hívások változatlanul
működnek — a `jelez(kod)` felülete nem változott. A **térhatás** viszont csak
akkor él az egylövetű effekteknél, ha a hurok megmondja, hol áll a kamera:

**(a) A kamera minden képkockában.** A `hurok()` belsejében, közvetlenül a
`hang.frissit(sim, dt)` ELŐTT (ma a 422. sor környéke):

```js
    // A térhatás a kamerához viszonyít: ami a képernyő jobb oldalán
    // történik, a jobb fülben szóljon. Négy szám, nulla allokáció.
    hang.kamera(szinter.cel.x, szinter.cel.z, szinter.szog, szinter.tav);
    if (beallitas.hangAuto) hang.frissit(sim, dt);
```

**(b) Az építés és a bontás onnan szóljon, ahova kattintottak.** A `cella`
változó a hurokban már megvan (`const cella = szinter.egerCella();`), de az
épület-változás figyelése FÖLÖTTE van — ezért vagy előre kell hozni a
`cella` sorát, vagy a jelzést lejjebb tenni. A hívás maga:

```js
    if (sim.epuletek.length !== elozoEpuletSzam) {
      const c = szinter.egerCella();
      hang.jelez(sim.epuletek.length > elozoEpuletSzam ? 'epit' : 'bont',
        c ? { x: c.x, y: c.y } : undefined);
      elozoEpuletSzam = sim.epuletek.length;
    }
```

Mindkettő **opcionális**: nélkülük a hangrendszer pontosan úgy működik, mint
eddig, csak az egylövetű effektek középen maradnak. A `kamera()` hívás nélküli
állapot szándékosan ártalmatlan: a `_kam` alapértéke a rács KÖZEPE, tehát a
bekötetlen `{x, y}` is középen és teljes hangerőn szólal meg. (A (0,0) sarok
azt jelentené, hogy a bekötetlen állapot halkabb és féloldalas — pont az a
fajta néma hiba, amit senki nem keresne.)

Amit **nem** kell csinálni: a `hangAuto` varrat változatlan, a mentésre, a
determinizmusra és a sim-re ez a kör nem hatott (a 3. vizsgálat őrzi).

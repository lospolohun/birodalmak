# TODO — AGE OF THE CRYSTALS

Állapot: **v0.18.0** (a 2026-08-04-i felhős kör két menete). A helyzetkép és a
MIÉRT-ek az [`ATADO.md`](ATADO.md)-ben, a mérések a
[`qa/V0.17_EREDMENY.md`](qa/V0.17_EREDMENY.md)-ben és a
[`qa/V0.18_EREDMENY.md`](qa/V0.18_EREDMENY.md)-ben; ez a lista csak azt mondja
meg, **mit kell csinálni és milyen sorrendben**.

⚠️⚠️ **MIELŐTT BÁRMILYEN HOSSZÚ FUTÁSON MÉRSZ, OLVASD EL EZT.** A v0.17 óta a
meccsnek VÉGE LEHET, és az `ai.lep()` ilyenkor kilép. Egy 16 000 tickes futás
utolsó ezrei ezért HALOTT MECCS lehetnek — a bennük mért „a gép nem csinál
semmit" nem hiba, hanem a lefutott játék. Ez a v0.18-ban **egy egész TODO-tételt
megdöntött**, és **három további doksi-számot vont vissza**. A szabály:
**nézd meg a `sim.gyozelem.vegeTick`-et**, és a számaidat ahhoz viszonyítsd.

⚠️ **A verzió-számozás átrendeződött.** A `PLAN.md` funkciónként osztotta ki a
számokat, a fejlesztés viszont körönként haladt, és a v0.12-ről a v0.16-ra
ugrott. A v0.13–v0.15 ezért **nyugdíjazott szám** (`kimaradt`), a tartalmuk
hátrébb került: **QA-kör → v0.19, nyelvek → v0.20, kirakás → v0.21.**

Jelölés: `[ ]` nyitott · `[~]` félkész, van kód · `[x]` kész
Sáv: **SIM** = `src/sim/` (determinizmus-szabály!) · **UI** = `src/ui/` ·
**RND** = `src/render/` · **QA** = `tools/`

> Ez a lista eredetileg MOZGÓ FÁRÓL készült (öt párhuzamos agent), ezért volt
> tele „ellenőrizendő" szóval. A v0.18.0 zárásakor MINDEN tétel vissza lett
> ellenőrizve a commitolt fán — ami itt áll, az mért vagy olvasott tény.

---

## P0 — enélkül nem játék

### [x] SIM · A játékot MOST MÁR meg lehet nyerni
Új réteg: `src/sim/gyozelem.js`. Ellenőrizve a fán, `npm run det` **15/15**.

- [x] Győzelmi szabály: a központ elvesztése. ⚠️ A feltétel nem „nincs
      központja", hanem „**volt** és most nincs" (`voltKozpont`) — enélkül a
      felállás nélküli szonda-simek a 0. ticken döntetlenre futnának.
- [x] `gyoztes` / `vegeTick` / `ok`, és mindhárom + három csapat-jelző
      (`voltKozpont`, `feladta`, `kiesett`) az `allapotHash()`-ben
      (`src/sim/sim.js:1377`).
- [x] A `lep()` a vége után is lép, csak **parancsot nem fogad el**. A megállás
      DÖNTÉS, aminek a helye a meccs-hurok, nem a sim — az indoklás a
      `gyozelem.js` fejlécében.
- [x] `feladas` parancsfajta a `parancsok.js`-ben.
- [x] Benne a determinizmus-forgatókönyvben: ÚJ **14. vizsgálat**, két
      forgatókönyvvel (központ-rombolás és feladás), plusz **működés-vizsgálat**
      arra, hogy a meccs tényleg véget ér (t=1867 és t=751).
- [x] `panel_statisztika_adat.js` → `vegallapot()`: `hivatalos: true`, ha a sim
      kimondta. A de facto olvasat szándékosan MEGMARADT — a két feltétel nem
      ugyanaz, és egy hazug „még fut" rosszabb, mint egy bevallottan nem
      hivatalos állás-olvasat.
- [x] `mentes.js` `MENTES_VERZIO` 4 → 5: a győzelmi mezők mentve. Enélkül egy
      lejátszott meccs a betöltés után **futóként támadt fel**.

### [x] SIM · A `VERZIO` végre igazat mond
`src/core/config.js` → `VERZIO` `'0.10.1'` → **`'0.18.0'`**. A konstans a v0.10/1
óta nem lett léptetve, közben a fán rajta van a v0.11–v0.18 — vagyis a
`CLAUDE.md` szerinti „mérvadó verzió" hét körön át hazudott. A menü alcíme, a
HUD sávja, a `__aoc.verzio` és az FPS-szonda fejléce mind ebből olvas.

- [x] Az `INTERFACES.md` `verzio:` példasora `'0.18.0'` — a 24. elvárás zöld.
- [x] **A v0.17/v0.18 névütközés eldőlve: `0.18.0`.** A szonda 14. vizsgálata a
      v0.17 (a meccs vége), a 15. a v0.18 (sor-törlés + korszak-gát); a `VERZIO`
      a legutóbb elkészült kört jelöli. A `kepzes.js` és a `parancsok.js`
      fejléc-jelölése így helyes, nem kell visszaírni.

### [~] RND · A látvány-sávok félbehagyott hibái
A háromból kettő lezárva.

- [x] **Napszak-váltásnál a terep feketébe fordult, a figurák nem.** Két
      tone-mapping csővezeték futott egymás mellett; egyre hozva.
      (`fenyek_ciklus.js`, `core3d.js`)
- [x] **A pálya sarkánál a kamera a ködlap ALÁ került.** A ködlap mostantól
      követi a kamerát; a köd HELYE változatlanul sim-oldali adat. (`kod3d.js`)
- [x] **A törmelék nem süllyed elég mélyre és túl világos.** KÉT KÜLÖN OK volt:
      · a süllyedés a MÉRETBŐL számolt, nem az induló magasságból, ezért magas
        épületnél elmaradt — a rom a lejáratkor a központnál +0,76, a toronynál
        +1,28 egységgel a talaj FÖLÖTT tűnt el (a szilárd csoportnak nincs
        alfája, tehát nem tud elhalványulni). 600 sorsolt szilánkból **600** a
        levegőben pattant ki; most **0/600**.
      · a „túl világos" SZÍNTÉR-HIBA volt, nem ízlés: a three az
        `instanceColor`-t lineárisan szorozza, miközben az albedó a projektben
        mindenhol sRGB-ből jön. A rom (138,140,133) volt — VILÁGOSABB, mint az
        ép kőfal (106,111,119), amiből lett. Most (89,90,79).
      ⚠️ A `porFelho`/`fustGomb`/`nyom` UGYANEZT a félreértést hordozza, de azok
      nem törmelékek, és a hangolásuk a hívási helyekkel együtt eldöntendő — a
      számok bent vannak az `effekt_keszlet.js` fejlécében.
      ⚠️ A látvány megítélése (éjjel nem fordul-e feketébe, nem „lehúzás"-e a
      tempó) **iMac-en** kell hogy történjen.

---

## P1 — a v0.17-ben lezárult

- [~] **SIM/AI · A gép sosem váltott korszakot.** Nem KÉSETT: az `ai.js`-ben
      **nem is létezett `korszak` parancsfajta-ág**, tehát a gép soha, semennyi
      étellel nem tudott volna váltani. Az ág azóta megvan (`src/sim/ai.js`).
      ⚠️⚠️ **A HOZZÁ TARTOZÓ SZÁM VISSZAVONVA.** A v0.17 jelentése „0 → 11
      korszakváltás 14 mért oldalon, legkorábbi t=9105"-öt írt. A v0.18-as
      mérés-audit ezt **nem tudta reprodukálni: ma 0/0 jön ki mindkét hosszú
      körön, a COMMITOLT fán is** — tehát nem egy azóta bekerült változtatás
      rontotta el. A parancs-ág LÉTEZIK, de hogy a gép a gyakorlatban vált-e,
      az BIZONYÍTATLAN. Amíg nincs rá szonda-szám, ne építs rá — a korszak-gát
      élesítésének ez az ELSŐ előfeltétele.
- [x] **SIM · A kristály és a fény korához nem volt technológia kötve.** A
      hatból négy az 1. korban nyílt. Újraosztva (kristály = páncélozás,
      fény = falazás). ⚠️ **Nem bővítve**: egy hetedik sor a UI hat elemű
      tábláit betölthetetlenné tenné.
- [x] **UI · `bevitel.celPont()` publikus.** A `_celPont()` `@deprecated`
      átirányítás maradt (`src/ui/bevitel.js`), hogy a régi hívások ne törjenek.
      Törölni csak akkor szabad, ha az egész fa átállt.
- [x] **QA · favicon.** Adat-URI-ként az `index.html`-ben — megszünteti az örök
      „1 konzol-hiba" hamis riasztást, és nem töri meg a „nincs képfájl"
      ígéretet.
- [~] **SIM/AI · Az `AI.lep()` a meccs vége után is dolgozott.** A gát bent van
      (`src/sim/ai.js`), és elvileg helyes: a vég után kiadott parancsokat a
      végrehajtás úgyis eldobja, a v0.8 lockstepjén viszont a HÁLÓZATON is
      végigmennének.
      ⚠️ **A SZÁMA VISSZAVONVA, ÉS A GÁT MA HOLT KÓD.** A jelentett „12 169.
      tickig 12 parancs, 16 000-ig 61 — vagyis 49 a kukába" nem reprodukál. A
      v0.18-as audit ennél többet mond: a gát a **teljes kapu-korpuszon** soha
      nem sül el, mert ahol AI fut, ott a meccs nem dől el, ahol pedig eldől
      (a v0.17-es körök), ott `ai.aktiv = [0,0]`.
      **Amire szükség van:** egy forgatókönyv, amiben AI FUT és a meccs EL IS
      DŐL — az egyszerre hozná a kapun belülre ezt a gátat és adna valódi
      terepet a korszakváltás mérésének.
- [x] **UI · Épület-kijelölés — TELJES.** A `bevitel.js` konstruktora
      ALAPÉRTELMEZÉSBEN beköti az `epuletKereso`-t a `gazdasag3d.js`
      `epuletTalalat()`-jára. ⚠️ Az nem `Raycaster`, hanem sugár × SIM-IGAZSÁG
      doboz: az épülő ház példány-mátrixa a készültséggel van LELAPÍTVA, tehát
      a hálóra metszés a félkész laktanyát alig találná el, holott az állványa
      teljes magasságban áll.
      Mellékhaszon: a `kijeloltEpulet` a `kijeloles.epulet` fölé került
      getterként (egy tárolás, nem kettő), és ettől a `jeloles_kontur.js` már
      megírt, de HOLT ága életre kelt — a kijelölt épület alapterülete is
      kirajzolódik.

---

## P1 — amit MOST találtunk (a v0.17 kör hozadéka)

### [x] UI · Az ELLENFÉL TERMELÉSE kiszivárgott a kijelölés-panelen
A `panel_kijeloles_adat.js` `_epulet()`-je csapatfüggetlenül írta ki a képzési
sort, a kutatást és az őrség létszámát — az épület-kattintás pedig ellenséges
épületet is visszaad. Aki rákattintott az ellenfél laktanyájára, elolvasta, mit
képez és mit kutat.

⚠️ **Nem desync** (a kijelölés kliens-oldali), hanem annál rosszabb: a v0.8
lockstepben a FELDERÍTÉS veszti értelmét, méghozzá némán — a felület ettől még
tökéletesen helyesnek látszik.

- A határ, amit meghúztunk: ami az épületen KÍVÜLRŐL látszik, az mehet (típus,
  életerő, készültség — az állvány úgyis a képen van); ami a falon BELÜL van,
  az nem (képzési sor, kutatás, őrség létszáma). Az `orsegMax` marad: az
  statikus tábla-adat, nem titok.
- A felület sem hazudhat: az ellenséges épületre a panel most **„idegen épület
  — a belseje nem látszik"**-ot ír, nem „nem folyik benne semmi"-t, és az
  őrségnél `? / 5`-öt, nem `0 / 5`-öt. A nem-tudást hiányként kell kiírni,
  különben a gát maga válik hazugsággá.
- Kapu: a `p:kijeloles` szonda **7/b** vizsgálata. Mind a három ág valódi
  kontrollal indul (sor `3 → 0`, kutatás `"ekevas" → ""`, őrség `2 → 0`) —
  üres épületen nem tud hamisan zöldülni. Szabotázzsal próbálva (`sajat = true`)
  **8 gát** sül el.

### [x] RND · Az épület-sérülés bekötése — a KERÜLŐÚT KIVÉVE
A v0.16/2 megcsinálta a **látványt** (`epulet_formak.js` → `epAllapot`
példány-attribútum), de az ADAT nem tudott odajutni, mert a `gazdasag3d.js`
akkor MÁSIK AGENT sávja volt. Ezért a puffert egy
`Material.onBeforeRender`-be tett kerülőút töltötte fel
(`epulet_formak.js:905`), és a simet a `simFelold()` **találgatta**: ha nem
adták be, a `window.__aoc.jatek.sim`-ből, 30 képkockánként újrapróbálkozva.

Miért baj: a render így GLOBÁLISON át olvas a simből, ami a réteghatár-szerződés
szellemének a párja („a render sosem ír vissza a simbe" mellé: ne is TALÁLGASSA,
honnan van a sim). Ráadásul rajzoláskor fut, típusonként újra végigjárja az
összes épületet, és egy MÁSODIK, kézzel szinkronban tartott másolatát tartja a
példány-huroknak.

- [x] A `gazdasag3d.js` példány-hurka viszi a `hp/maxHp`-t és a `nyitva`-t —
      egy bejárás, egy sorrend, egy igazság.
- [x] **A kerülőút TÖRÖLVE** (`allapotIr`, `simBead`, `simFelold`,
      `onBeforeRender`). Egy ideig MINDKETTŐ írta ugyanazt a puffert, és ez a
      fajta ütközés némán romlik el: a későbbi írás győz, tehát csak akkor
      látszik, ha a két forrás elkülönbözik — például egy szonda-előnézet MÁSIK
      simmel, mert a kerülőút a globális simet oldotta fel, nem a réteget.
      Maradt a `defaultAttributeValues` (hiba esetén a v0.16-os kép jön vissza)
      és a `serulesFokozat` export, amit a réteg importál.
- [x] ⚠️ **A látvány VAK VOLT A SÉRÜLÉSRE.** A réteg változás-jele (`db`, élők
      száma, `epulHatra` összege) ostrom alatt mind a három VÁLTOZATLAN — a
      puffer soha nem íródott volna újra, és a repedés csak véletlenül, egy
      másik épület felépülésekor jelent volna meg. Negyedik tag: a FOKOZATOK
      hash-e (nem a nyers hp — azzal minden találat teljes újratöltést kérne,
      miközben a képen a küszöbök között semmi nem változik).
- [ ] **A PÉLDÁNY-SORREND SZERZŐDÉS** mindkét fájl fejlécében ki van mondva: a
      `t` típus `k`-adik példánya a `t` típus `k`-adik **ÉLŐ** épülete,
      `ep`-index szerint növekvő sorrendben. **Ne rendezd át** — a sérülés
      rossz épületre kerülne, és ez néma hiba.

### [ ] SIM · A `gyozelem.felad()` `this.vege` ága a parancs-útról ELÉRHETETLEN
`src/sim/parancsok.js:80` az általános kapu — `if (sim.gyozelem.vege) {
sim.gyozelem.elutasitottParancs++; return; }` —, és ez a `switch` **ELŐTT** van,
tehát a `feladas` ág kész meccsen oda sosem ér el. A `gyozelem.js:143`
`if (this.vege …)` ága ezért hálózati parancsból nem tud elsülni.

**Ez nem hiba, és nem is javítandó** (a mélységi védelem helyes: a `felad()`
közvetlenül is hívható), de **tudni kell róla két okból**:

1. a `feladasElutasitva` számláló kész meccsen NEM nő — az `elutasitottParancs`
   nő helyette. Aki az előbbire épít gátat, **örökre nullát fog mérni, zölden**.
   A v0.17 szondája első futásra pont ebbe futott bele;
2. ha valaki lefedettséget mér, ez az ág holt kódnak fog látszani, pedig nem az.

### [x] SIM · ~~A munkások VÉGLEG tétlenné válnak~~ — TÉVES DIAGNÓZIS, NINCS HIBA
Az eredeti bejelentés szerint: ha a bázistól `LELOHELY_SUGAR = 60`-on belül
elfogynak a lelőhelyek, az érintett munkások véglegesen leállnak (12-ből 5, seed
20260804 / v0.6). **A v0.18-ban ez kimérve MEGDŐLT.**

Amit a mérés mond (seed 20260804, 16 000 tick, mindkét oldal nehéz):

| tick | vörös munkás | tétlen |
|---|---|---|
| 2 000 … 12 000 | 10 → 26 | **0** |
| 14 000 | 26 | 4 |
| 16 000 | 26 | 10 |

⚠️ **A meccs a 10 740. ticken VÉGET ÉRT** (a vörös nyert, a kék központja
elesett), és abban a pillanatban **nulla** tétlen munkás volt. A tíz tétlen
kizárólag UTÁNA gyűlt össze — mert az `ai.lep()` első sora azóta helyesen
kilép a lefutott meccsben (`if (this.sim.gyozelem.vege) return;`, a v0.17-ben
került be, épp azért, mert a gép addig a kukába rendelt tovább).

A munkások tehát nem „ragadtak be": a játék véget ért, és senki nem osztja be
őket. A `LELOHELY_SUGAR`-nak ehhez semmi köze — műszerezve az
`_elerhetoLelohely()` a teljes futáson **49 hívásból 0-szor** adott `-1`-et.

- ⚠️ **A tanulság a MÉRÉSRŐL szól, nem a kódról:** a „12-ből 5 beragadt" szám
  egy már ELDŐLT meccsen készült. Egy 16 000 tickes futás vége ma már nem
  ugyanaz, mint a v0.17 előtt — a győzelmi feltétel óta a meccs jóval korábban
  lezárul. **Aki hosszú futáson mér AI-viselkedést, előbb nézze meg a
  `gyozelem.vegeTick`-et**, különben a halott meccset méri.
- Kipróbáltam a javasolt sugár-tágítást (két lépcső, 60 → 200, nagyobb
  jelölt-korláttal). Az eredmény bitre azonos volt, a záró hash is
  (`0xdd264890`) — vagyis **nem javított semmit, csak egy nem járt ágat adott
  volna a gépnek.** Ezért nincs benne a fán.
- Ha a jelenség valaha ELDŐLETLEN meccsben jelentkezik, akkor van valódi hiba,
  és akkor a fenti két lépcső a kiindulás. Addig a `LELOHELY_SUGAR = 60`
  bizonyítottan elég.

### [ ] SIM/AI · A `BOSEG` konstans KÉSÉLEN áll
`src/sim/ai.js:141`, ma **700**. A fejléce őszintén leírja, hogy a küszöb nem
gazdasági, hanem **kimeneteli** kérdés:

| `BOSEG` | mi történik a v0.6-os szonda-forgatókönyvön |
|---:|---|
| 500 | a nehéz gép a **12 994.** tickre lerombolja a könnyű bázisát |
| 700 | a 16 000. tickig nem dől el; a nehéz csak jobban áll (34 vs 16 egység) |

A t=8000-es termelési számok a kettő között **betűre azonosak** — a különbség
nem a gazdaságban van, hanem abban, melyik oldalra dől egy szoros csata.

- ⚠️ **Ami MOST lett ebből kockázat:** a v0.17 óta a meccsnek VÉGE LEHET. Ha ez
  a szám 500 felé csúszik, a v0.6-os szonda-kör a 12 994. ticken **véget ér**,
  és onnantól minden utána mért szám (élő katona, összegyűjtött nyersanyag,
  döntési kör, indított támadás) egy **halott meccsből** jön. A 9. vizsgálat
  gátjai ezt ma nem tudják megkülönböztetni egy elromlott AI-tól.
- Ne ebből a számból hangold a nehézséget: arra a `SEREG_CEL` és a
  `TAMADAS_KUSZOB` való.
- [ ] Megfontolandó: a 9. vizsgálat írja ki, hogy a kör végén **fut-e még a
      meccs**.

### [ ] QA · Két szám, ami a KAPUN KÍVÜL van
Ha ezek elromlanak, semmi nem szól — pedig mindkettő MŰKÖDÉS-szám, és a projekt
hétszer égett meg zöld kapu melletti halott rendszeren.

- [ ] **A gép korszakváltás-száma.** A 0 → 11 az előző kör külön mérése; a
      determinizmus-szonda 9. vizsgálata **nem ír ki korszakváltás-sort**.
- [ ] **A beragadt munkások száma** (lásd fent).

---

## P1 — ami nyitva maradt

- [x] **SIM · Képzési sor törlése — KÉSZ, a szondában is (15. vizsgálat).**
      `kepzes_torles`, **visszatérítés NÉLKÜL**, és BÁRMELYIK sor-elem
      törölhető, a folyamatban lévő is. Az indoklás jó és le van írva: az érték nem a
      nyersanyag, hanem a **népesség és a sor-hely** felszabadítása — a sorban
      álló egység foglalja a `sorbanNepesseg`-et, egy elgépelt shift+kattintás
      öt ostromgépe percekre megbénítja a csapatot. A képzés-panel gombja és
      parancs-ága eleve KÉSZEN ÁLLT, képesség-felismeréssel — a ✕ gomb magától
      életre kelt.
      ⚠️ **A visszatérítés valódi veszélye nem a nullszaldós rendelés–törlés
      kör**, hanem hogy létrejönne egy `keszlet += …` ág, ami a levonást
      SORBAÁLLÁSKOR, a visszatérítést TÖRLÉSKOR számolná újra. Ma bitre
      egyeznek; az első technológia vagy korszak-bónusz, ami az egység árához
      nyúl, csendben nyersanyag-gyárat csinálna belőle (rendelj olcsón, töröld
      drágán). A fej törlésekor a mögötte álló a TELJES idővel indul, különben
      olcsó lándzsás + törlés = félidős lovag.
      Mérve: 40 rendelés–törlés kör, 5000 → 3000 étel, **nulla növekedés**;
      9/10 törlés átment, 11/10 elutasítva (idegen sor, tartományon kívüli index).
- [~] **Korszak-gát az építésnél — A SIMBEN KÉSZ, DE SZÁNDÉKOSAN NINCS ÉLESÍTVE.**
      ⚠️ A v0.18 zárásakor a HÁROM ELŐFELTÉTELBŐL KETTŐ ELKÉSZÜLT: a
      `_buildOrder` már `continue`-ol a tiltott tételen (a nehéz gép építési
      parancsa 156 → 8, a korszak-elutasítás 148 → 0 — nem ragad be az
      íjászdánál), és a `panel_epites_adat.js` a sim tábláját veszi át, sőt a
      futó panel a PÉLDÁNYTÓL kérdez, mert a gát meccsenként állítható.
      **A harmadik (a gép tudjon korszakot váltani) NEM teljesült**, és a
      mérés a MECCS VÉGÉIG, 14 seeden ezt adja: álló épület 8,6 → 6,6,
      ebből KATONAI **3,4 → 1,9 (−43 %)**, korszakváltás 28 mért oldalon 0 → 0,
      és az egyedi egység rendelése 0–10 → **0 mind a 11 futásban**.
      A −43 % nem visszafogás, hanem VÉGLEGES veszteség: a gép soha nem éri el
      a hajnal korát, tehát az íjászda és az istálló nem „később" épül fel,
      hanem SOHA.
      **Az ok mérve:** a váltás 500 étel, a nehéz gép 0,127 étel/tick-et termel,
      és végig ostrom alatt áll, ahol a `HAD.VEDEKEZIK` — helyesen — kikapcsolja
      a tartalékot. A feltétel tehát NEM a nehézségtől függ, hanem attól,
      nyomás alatt van-e a gép. Bármelyik nyitja a kaput: a `KORSZAK_AR`
      csökkentése, a gép étel-gazdaságának javítása, vagy hogy a hajnal kora ne
      ételt kérjen.
      ✅ Mellékeredmény: a gép **végre használja a piacát** (`_kereskedik`) — a
      v0.6 óta megvette 175 fáért és sosem cserélt rajta, miközben 965 fa állt
      a raktárában, az étel meg 0–30 közt tapadt.
      (a régi leírás:)
      `EP_KORSZAK_IGENY`, `korszakKell()`, `korszakGat()`, `korszakElutasitva`,
      és az ellenőrző sor a `parancsok.js` `epit` ágában, a levonás ELŐTT.
      Az élő tábla viszont csupa nulla (= a mai szabály), és ez MÉRT DÖNTÉS:
      élesítve nem visszafogja a gépet, hanem megszünteti ellenfélként —
      16 000 tick, azonos seed: álló épület **13 → 4**, élő munkás **12 → 0**,
      156 építési parancsból 148 korszak miatt elutasítva, és a gép a saját
      központját is elveszti. Ok: a gép ebben a körben egyetlen korszakot sem
      vált, tehát a kapu sosem nyílik ki előtte, az `ai.js` `_buildOrder`-e
      pedig az első meg nem épülő tételnél `return`-öl, így beragad.
      ⚠️ A szonda 15. köre **BEKAPCSOLVA** járatja a saját sim-jén (27/27
      elutasítás, A/B kontrollal) — a kód a kapun belül van, csak a világon
      nincs bekapcsolva.
      **Az élesítés három előfeltétele:** (1) a gép tudjon korszakot váltani,
      (2) a `_buildOrder` `continue`-oljon a tiltott tételen, ne `return`-öljön,
      (3) a `panel_epites_adat.js` vegye át a sim tábláját, különben a gomb
      engedi, amit a sim eldob.
- [ ] **Böngészős ránézés minden panelre.** Az adat- és szerződés-kapuk zöldek,
      de a tördelést és a tényleges kattintásokat élőben még senki nem nézte meg.
      ⚠️ Ez csak valódi GPU-s gépen ér valamit.

---

## P2 — a terv többi része

- [ ] **v0.10/2 kampány** — el sem kezdődött.
- [ ] **v0.19 QA-kör** (volt v0.13) — a STATIKUS fele megvan (`npm run kiadas`,
      61/61), a mérő fele NEM: FPS-mérés minden lépcsőn, UX-végigjátszás,
      balansz-átnézés. ⚠️ Az FPS-hez GPU kell, tehát ez az iMac dolga.
- [ ] **v0.20 magyar + angol** (volt v0.14) — el sem kezdődött. A UI most csupa
      magyar szöveg; a panelek szövegei egy helyre gyűjtendők.
- [x] **v0.21 SkyNet deploy** (volt v0.15) — **a `base`-kérdés LEZÁRVA.**
      A `vite.config.js` `base`-e `'./'` (relatív), a `PLAN.md` `DÖNTÉS:` sora
      ezt rögzíti, és a kiadás-ellenőrző 57. elvárása (ami maga is hibás volt:
      akkor is sárgázott, ha a két oldal már egyetértett) zöld. Az érv: az
      abszolút `base` egyetlen konkrét URL-hez kötné a buildet, holott az
      adat-URI-s favicon és a „nincs képfájl, nincs külső betűtípus" ígéret épp
      azt mondja ki, hogy a `dist/` bárhová másolható.
      ⚠️ A deploy-LÁNC (a kirakás maga) ettől még nincs meg — az a v0.21.
- [ ] **v0.9/2b vége:** az egyedi egység saját alakja megvan (alabárdos bajnok,
      civenként példány-adatból változó), de a NYOLC NÉP külön modellje nincs.
- [x] **Balansz: Hegyi bányász vs Folyami kereskedő.** Tükör-kontrollal
      szétválasztva, mennyi a civ és mennyi a pálya. Civ-hatás −12,6 % / +40,0 %
      → **−1,3 % / +15,8 %**, a szórás −67 %.
- [x] **A gépi gazdaság étel-szűkös.** Fix munkás-arány helyett
      készlet-visszacsatolás. Pangó készlet 950/1070 → **480/500**, átváltott
      kimenet +20 % / +35 %.
- [x] **A kapu `nyitva` állapota nem látszott** — most a rész-táblás rendszer
      negyedik csatornája.
- [x] **Sérülés/rom nem látszott az épületeken** — ugyanaz a csatorna, nulla új
      rajzhívás, nulla futásidejű geometria-építés. ⚠️ A BEKÖTÉSÉRŐL lásd fent.
- [ ] **Az épületek nem veszik figyelembe a hadi ködöt** (a v0.3 óta így van).

---

## Örökölt figyelmeztetések (a `npm run kiadas` sárgái)

**MIND LEZÁRVA — a kapu 61/61, nulla figyelmeztetés.** (v0.18)

- [x] 16. a `grid.js` és az `rng.js` fejléce szakaszcímet kapott, a meglévő
      szöveg érintése nélkül.
- [x] 24. az `INTERFACES.md` példasora `'0.18.0'`.
- [x] 39. **CÍMKE VOLT, NEM GÁT:** csak visszamondta a `KEPEZ` hosszát, az
      indoklását („az olvasói `!lista`-val védettek") SEMMI nem ellenőrizte — a
      védelmet kivéve a szöveg bitre ugyanaz maradt. Ma mind a három olvasót
      végignézi, négy szabotázs-ággal.
- [x] 56. **HAMIS RIASZTÁS VOLT.** Nem volt halott fájl: a
      `panel_technologia.js`-t és a `panel_uzenetek.js`-t a `main.js`
      `import.meta.glob`-bal húzza be, és a `PANEL_TERV` modul-út-sztringgel
      szereli fel. Az import-séta csak a `from '…'` alakot követte; a másik négy
      panel VÉLETLENÜL menekült meg (a szondájuk szövegében ott a fájlnevük).
      Aki a lista alapján takarít, két működő panelt töröl.
- [x] 57. **maga is hibás volt:** akkor is sárgázott, ha a két oldal már
      egyetértett. DÖNTÉS: relatív `base: './'`, a `PLAN.md` rögzíti.

---

## Ami MÉG SOSEM FUTOTT LE ezen a kódon

- [ ] **`npm run fps`.** A v0.17 egyetlen sorát sem mérte valódi GPU. Az
      épület-sérülés kb. +12 k háromszöget tesz hozzá, aminek kétharmada ép
      állapotban elfajult (nulla fragment-költség) — **ez becslés, nem mérés.**
      iMac-en, `AOC_CHROME`-mal, és mérés előtt nézd meg a load average-t.
- [ ] **`node tools/kep.mjs`.** Ugyanaz: a tone-mapping egyesítését, a
      ködlap-követést, a sérült épületeket és a **v0.16 óta ÁLLÓ, most újra
      mozgó** zászlót/füstöt/köszörűkövet még senki nem LÁTTA.

---

## Amit NE csinálj

- **Ne írd át a szondát, ha bukik.** Hétszer égett meg ez a projekt zöld kapu
  melletti halott rendszeren; a szonda a barátod.
- **Ne kerüld meg az `fps_szonda.mjs` SwiftShader-szűrőjét**, és soha ne
  jelents felhőben mért FPS-t eredményként.
- **Ne hasonlíts össze tick-időt vagy FPS-t két külön alkalom között.** Ez a
  felhőben mért `ms/tick`-re is áll, pedig az tiszta CPU: a gép osztott, a
  terhelése óráról órára változik (0,58 ms reggel, 0,88 ms este, azonos kódon).
  A/B-t `git stash`-sel, EGY munkameneten belül.
- **Ne tegyél render-oldali állapotot a simbe** — a lockstepen az azonnal
  desync.
- **Ne vegyél fel új parancsfajtát a determinizmus-forgatókönyv bővítése
  nélkül.** A szonda forgatókönyvekből dolgozik; magától nem találja meg az új
  kódot, és a legfrissebb, tehát legkockázatosabb kód maradna a kapun kívül.
- **Ne bővítsd a hat elemű `EPULET`/technológia-táblákat** anélkül, hogy a UI
  tükör-tábláit is bővítenéd — a v0.17 technológia-újraosztása pont ezért lett
  újraosztás és nem bővítés.

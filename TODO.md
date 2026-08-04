# TODO — AGE OF THE CRYSTALS

Állapot: **v0.18.0** (a 2026-08-04-i felhős kör két menete). A helyzetkép és a
MIÉRT-ek az [`ATADO.md`](ATADO.md)-ben, a mérések a
[`qa/V0.17_EREDMENY.md`](qa/V0.17_EREDMENY.md)-ben; ez a lista csak azt mondja
meg, **mit kell csinálni és milyen sorrendben**.

⚠️ **A verzió-számozás átrendeződött.** A `PLAN.md` funkciónként osztotta ki a
számokat, a fejlesztés viszont körönként haladt, és a v0.12-ről a v0.16-ra
ugrott. A v0.13–v0.15 ezért **nyugdíjazott szám** (`kimaradt`), a tartalmuk
hátrébb került: **QA-kör → v0.19, nyelvek → v0.20, kirakás → v0.21.**

Jelölés: `[ ]` nyitott · `[~]` félkész, van kód · `[x]` kész
Sáv: **SIM** = `src/sim/` (determinizmus-szabály!) · **UI** = `src/ui/` ·
**RND** = `src/render/` · **QA** = `tools/`

> ⚠️ **EZ A LISTA MOZGÓ FÁRÓL KÉSZÜLT.** Öt agent dolgozott párhuzamosan, és
> íráskor csak a `cb814b0` volt commitolva — a többiek munkája a
> munkakönyvtárban állt. Amit a fából ellenőrizni tudtam, az itt tényként áll;
> a többi mellett ott a szó: **ellenőrizendő**. Az első dolgod:
> `git log --oneline -5` és `git status --short`.

---

## P0 — enélkül nem játék

### [x] SIM · A játékot MOST MÁR meg lehet nyerni
Új réteg: `src/sim/gyozelem.js`. Ellenőrizve a fán, `npm run det` **14/14**.

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
- [~] **A törmelék nem süllyed elég mélyre és túl világos.**
      `src/render/effekt_harc.js`, `src/render/effekt_keszlet.js`.
      ⚠️ **ellenőrizendő:** az `effekt_keszlet.js` a kör végén módosítottként
      állt a fán (+157 sor) — jó eséllyel épp ez készült el. Valódi GPU nélkül
      viszont csak kód-olvasásból ítélhető meg, a lezárása **iMac-en** kell
      hogy történjen.

---

## P1 — a v0.17-ben lezárult

- [x] **SIM/AI · A gép sosem váltott korszakot.** Nem KÉSETT: az `ai.js`-ben
      **nem is létezett `korszak` parancsfajta-ág**, tehát a gép soha, semennyi
      étellel nem tudott volna váltani. Most van (`src/sim/ai.js:568`),
      0 → 11 korszakváltás 14 mért oldalon, legkorábbi t=9105.
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
- [x] **SIM/AI · Az `AI.lep()` a meccs vége után is dolgozott.** Mérve a
      v0.6-os forgatókönyvön: a győztes gép a 12 169. tickig 12 építési
      parancsot adott ki, a 16 000. tickig **61-et** — vagyis 49 olyat, amit a
      végrehajtás azonnal a kukába tett. A v0.8 lockstepjén ezek a HÁLÓZATON is
      végigmentek volna, egy már eldőlt meccsben. Gát ellenőrizve:
      `src/sim/ai.js:481`. Mellékhaszon: a szonda „elveszett építési parancs"
      gátja megint arról szól, amiről szólnia kell — a koordináta-hibáról, nem
      a lefutott meccsről.
- [~] **UI · Épület-kijelölés.** A `bevitel.js`-ben megvan a mező, az
      `epuletKijelol()` / `epuletTorol()` és a `V` gyorsbillentyű, tehát a
      kijelölés-panel épület-nézete megjelenik és látszik, ha elromlik.
      ⚠️ **ellenőrizendő, de jó úton:** a kör végén a fán a `bevitel.js` már
      beköti az `epuletKereso` horgot a `gazdasag3d.js` `epuletTalalat()`-jára,
      tehát az egeres kijelölés is meglesz. Ha bement, ez `[x]`.

---

## P1 — amit MOST találtunk (a v0.17 kör hozadéka)

### [~] RND · Az épület-sérülés bekötése — a KERÜLŐÚT még ott van
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

- ⚠️ **ellenőrizendő:** a kör végén a `gazdasag3d.js` már a példány-hurokban
  viszi a `hp/maxHp`-t és a `nyitva`-t — egy bejárás, egy sorrend, egy igazság.
- [ ] **HA az bement, TÖRÖLNI KELL a kerülőutat.** Az `epulet_formak.js`
      fejléce azt ígéri, hogy „ha a sáv gazdája beköti, ez az ág magától
      elnémul: elég a `simBead()`-et meghívni" — **de a `simBead()` a simet
      ADJA, nem némít.** Ha mindkét oldal ír, két írás megy ugyanarra a
      pufferre, és a hiba pont akkor jön elő, amikor a két sorrend eltér.
      `grep -n "onBeforeRender" src/render/epulet_formak.js`
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

### [ ] SIM · ÖRÖKÖLT, NEM JAVÍTOTT: a munkások VÉGLEG tétlenné válnak
Ha a bázistól `LELOHELY_SUGAR = 60`-on belül elfogynak a lelőhelyek, az érintett
munkások nem keresnek tovább — véglegesen leállnak. Mérve: **12-ből 5** a
seed 20260804 / v0.6-os futáson. (⚠️ Ez az előző kör mérése; ebben a
munkamenetben nem reprodukáltam.)

- Hely: `src/sim/ai.js:204` (a konstans) és `:1179`
  (`ef.kornyek(fajta, bx, by, jeloltek, 8, LELOHELY_SUGAR)`).
- **Miért lett ez most igazán fájó:** a győzelmi feltétellel végre végig lehet
  játszani hosszú meccseket — és ez a hiba pont azokat öli meg.
- ⚠️ A szonda 9. vizsgálatának „navigáció nélkül álló munkás: 0" invariánsa
  **NEM fogja meg**: a beragadt munkásnak VAN navigációja, csak nincs hová
  mennie. Ha javítod, kell mellé egy új szám, ami elárulja, hogy él — például
  „tétlen munkás a kör végén".
- Irány: **sugár-tágítás**, ha a szűk körben nincs jelölt — nem konstans-emelés,
  az a bázis-közeli preferenciát ölné meg.

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

- [~] **SIM · Képzési sor törlése.** ⚠️ **ellenőrizendő:** a kör végén a fán a
      `kepzes.js` és a `parancsok.js` már tartalmazta a `kepzes_torles` ágat,
      **visszatérítés NÉLKÜL**. Az indoklás jó és le van írva: az érték nem a
      nyersanyag, hanem a **népesség és a sor-hely** felszabadítása — a sorban
      álló egység foglalja a `sorbanNepesseg`-et, egy elgépelt shift+kattintás
      öt ostromgépe percekre megbénítja a csapatot. A képzés-panel gombja és
      parancs-ága eleve KÉSZEN ÁLLT, képesség-felismeréssel. **Ha bement, ez
      `[x]` — de akkor be kell venni a determinizmus-forgatókönyvbe is**, és a
      `torolve` / `torlesElutasitva` számoknak meg kell jelenniük a szonda
      kiírásában.
- [ ] **Korszak-gát az építésnél.** A sim `epit` ága nem néz korszakot, és az AI
      sem — egy csak-UI-ban működő gát CSAK AZ EMBERT büntetné, és csendben
      átírná a balanszt. Az ág kész és bizonyított (`EP_KORSZAK_JAVASLAT` a
      `panel_epites_adat.js`-ben), egy sor kell hozzá, ha a követelmény bekerül
      a simbe.
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

Egyik sem buktat, de mind valódi. ⚠️ **ellenőrizendő**: ez a lista a v0.16-os
futásból való, és a `kiadas_ellenorzo.mjs` MAGA is mozgott a kör végén (+189
sor). **Futtasd újra**, mielőtt bármelyikre hivatkozol.

- [ ] 16. a sim-fejlécek nem mind követik a MIÉRT-idiómát
- [ ] 24. az `INTERFACES.md` `__aoc.verzio` példája elavult verziót mutat —
      **a mai VERZIO-emeléssel ez most BIZTOSAN sárga**, lásd a P0-t
- [ ] 39. a tudatosan rövid `EPULET`-táblák védettsége (lágy gát)
- [ ] 56. van halott fájl a `src/` alatt (main.js-ből vagy szondából elérhetetlen)
- [ ] 57. a `vite.config.js` `base`-e és a `PLAN.md` kirakási kikötése nem ér össze

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

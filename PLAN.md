# AGE OF THE CRYSTALS — verzió-terv

A cél: **AoE4-léptékű RTS lockstep multiplayerrel.** A döntés tudatos, a
kockázatokkal együtt (lásd „Őszinte kockázatok" alul).

Minden lépcső saját kiadási kapuval zárul — a minta a TELEPESEK
`tools/kiadas_ellenorzo.mjs`-e (67 elvárás).

| Verzió | Tartalom | Állapot |
|---|---|---|
| **v0.1** | **Motor-szonda.** 1600 animált egység, áramlási mező, ütközés-kerülés, fix-tickes determinisztikus sim, determinizmus-szonda, réteg-bontó FPS-mérés. **GO/NO-GO döntés.** | **kész — GO** (`qa/V0.1_EREDMENY.md`) |
| **v0.2** | Irányítás: keret-kijelölés, Ctrl-csoportok, attack-move, alakzatok, állás-parancsok — mind a parancs-soron át | **kész** (`qa/V0.2_EREDMENY.md`) — FPS-mérés az iMac-en még hátravan |
| **v0.3** | Gazdaság: 4 nyersanyag (étel, fa, kő, **kristály**), munkás-AI, lerakatok, korszakváltás | **kész** (`qa/V0.3_EREDMENY.md`) — FPS-mérés az iMac-en még hátravan |
| **v0.4** | Harc: páncéltípusok, repülési idejű lövedékek, fegyvernem-ellensúlyok, ostrom, fal/kapu, beszállásolás | **kész** — lásd alább |
| v0.5 | Épület-roster + technológiafa → **első játszható build** | **kész** |
| v0.6 | AI ellenfél 3 nehézséggel, build orderekkel, felderítéssel | **kész** — lásd alább |
| v0.7 | Hadi köd (GPU-textúra), minimap, mentés/betöltés, rendes HUD | **kész** — lásd alább |
| **v0.8** | **Netcode:** WebSocket relay, lockstep, bemenet-késleltetés simítás, újracsatlakozás, desync-detektor az állapot-hashre | **kész** — lásd alább |
| v0.9 | 8 aszimmetrikus civilizáció + egyedi egységek | v0.9/1 **kész** — lásd alább |
| v0.10 | Térkép-presetek, kampány | |
| v0.11 | **Főmenü** a TELEPESEK mintájára: új játék, betöltés, beállítások, civ-választó | |
| v0.12 | **Hang:** SFX (parancs, harc, építés, gyűjtés, korszakváltás) + zene | |
| v0.13 | **QA-kör:** teljes átvizsgálás — determinizmus, teljesítmény, balansz, UX, hibalista | |
| v0.14 | **Nyelvek: magyar + angol** — teljes fordítás, nyelvválasztó a menüben | |
| v0.15 | **Kirakás SkyNetre:** `skynet.lospolo.hu/aotc` — deploy-lánc, alkönyvtáras build | |
| v1.0 | Kiadási kapu, PWA | |

## A v0.4 állása

A verzió szakaszokra van bontva, és a kész szakaszok külön-külön is megállnak:

| szakasz | tartalom | állapot |
|---|---|---|
| v0.4/1 | életerő, páncéltípusok, fegyvernem-ellensúlyok, halál | **kész** |
| v0.4/2 | repülési idejű lövedékek | **kész** |
| v0.4/3 | épület-életerő, épületek elleni harc | **kész** |
| v0.4/4 | fal és kapu | **kész** (a kapu még nem csapatfüggő) |
| v0.4/6 | ostrom-EGYSÉG (új egységtípus) | **kész** |
| v0.4/5 | beszállásolás | **kész** (a bent lévő még nem lő ki) |

Az épület-oldal kész: az épületnek van életereje, a támadó menetben lévő sereg
célba veszi az ellenséges épületeket (élő katona MINDIG előbbre való), a fal
zárja a celláit, a kapu nyitható.

Az ostromgép saját páncélosztályt kapott (`PANCEL.OSTROM`), és saját render-
réteget (`ostrom3d.js`) — a `units3d.js` `& 3`-mal maszkol, tehát ott az ötödik
típus a munkásra esne vissza, és emberi alakot sem érdemes építeni egy faltörő
kosnak. A számok: 240 életerő, 360 sebzés épületre, viszont **4 sebzés élő
egységre** 3 másodpercenként. Ellene közelharcot kell küldeni (vágó 150 %), a
nyíl szinte lepattan róla (40 %). Mérve: 20 gép 237 tick alatt bont le egy 900
életerejű falat.

⚠️ **A kapu még nem csapatfüggő:** nyitva MINDENKINEK nyitva van. Ennek oka
szerkezeti — az áramlási mező a `racs.jarhato` EGY közös rétegéből épül, és a
csapatonként eltérő járhatóság csapatonként külön mezőkészletet igényelne. Ez a
v0.5 dolga, a roster mellett.

A beszállásolás kész: a bent lévő egység él, de nincs a világban (nem lökdös,
nem célozható, nem látszik), és az épület pusztulása megöli. **Amit még nem
tud:** a beszállásolt íjász nem lő ki az épületből. Az önálló mechanika
(célkeresés az épület pozíciójából, saját ütemmel), és a v0.5 tornyával együtt
érdemes megcsinálni.

**Ez az adósság is KIFIZETVE** (v0.5/3): a torony 30 tickenként sortüzet ad, és
`1 + a bent állók száma` nyilat lő ki. A beszállásolás tehát végre TÖBB a
bújásnál. A szonda 8. vizsgálata külön bukik, ha minden sortűz pontosan egy
nyíl — az ugyanis azt jelenti, hogy a bónusz-ág ki sem futott.

**Ez az adósság KIFIZETVE** (a v0.5 első szakasza): a halott slot felszabadul,
és minden slothoz tartozik egy generáció, ami felszabaduláskor lép. A
hivatkozások (`celEgyseg`, `lovedek.cel`) az indexet ÉS a generációt tárolják,
és `Egysegek.ervenyes()`-t kérdeznek. Az egység születésének EGYETLEN helye a
`Sim.egysegKepez()` — az mind az öt réteget (mozgás, parancs, harc, munkás,
beszállásolás) nullázza, mert egy újrahasznált slot különben az előző lakó
céljával vagy rakományával születne meg.

## A v0.5 állása

| szakasz | tartalom | állapot |
|---|---|---|
| v0.5/1 | slot-újrahasznosítás generációs számlálóval | **kész** |
| v0.5/2 | egység-képzés (laktanya, sorbanállás, népesség) | **kész** |
| v0.5/3 | épület-roster | **kész** — 11 épülettípus, torony (sortűz + őrség-bónusz), piac (csere) |
| v0.5/4 | technológiafa | **kész** — 6 technológia, épülethez és korszakhoz kötve |

A képzés épületenkénti SORRAL megy, nem globálisan — ettől lesz valódi döntés,
hogy több laktanya vagy több munkás. Az ár a SORBAÁLLÁSKOR megy le, nem a
végén: a törlés-visszatérítés nyersanyagot TEREMTENE, a gazdaság pedig a v0.3
óta szigorúan egyirányú. Ezért a v0.5-ben nincs sor-törlés.

A népességet tickenként ÚJRASZÁMOLJUK, nem tároljuk. A tárolt számlálót minden
halál, születés, épület-pusztulás és beszállásolás karban kellene tartani, és
egyetlen kimaradó ág olyan hibát ad, ami hónapokig lappang.

## A v0.6 állása

| szakasz | tartalom | állapot |
|---|---|---|
| v0.6/1 | AI-váz, nehézségi szintek, gazdasági kör | **kész** |
| v0.6/2 | build order: katonai épületek, katona-képzés, technológia | **kész** |
| v0.6/3 | felderítés és támadási döntés | **kész** |

Az AI a **sim része**, nem a kliensé. A v0.8 lockstepjében minden gép futtatja a
szimulációt; ha az AI a kliensben lakna, a két gép mást döntene, és az azonnali
desync lenne — nem „kicsit más gépi ellenfél".

A nehézség **döntési minőség, nem csalás.** A nehéz gép nem kap több
nyersanyagot. Két oka van: a csaló gazdaság MÁSODIK gazdasági kódutat
jelentene (a v0.3 óta minden mennyiség munkából származik), és a csaló AI-ból a
játékos nem tanul semmit — ha a gép azért nyer, mert dupla ütemben termel,
akkor a vereségre nincs válasz.

A szonda 9. vizsgálatában **a forgatókönyv maga az AI**: nincs kézi parancs-
lista, a két csapatot könnyű és nehéz szinten a gép viszi. A két szint
szándékosan KÜLÖNBÖZIK — azonos szinten egy elrontott nehézség-indexelés
semmit nem változtatna a hash-en, és a hiba a kapun belül maradna.

⚠️ **Egy szám, ami új fajta hibát fog.** A 9. vizsgálat nem csak azt nézi, hogy
a gép csinált-e valamit, hanem hogy a KIADOTT SZÁNDÉK és az EREDMÉNY összeér-e:
hány házat rendelt, és hány épült meg. Ez a v0.6/1 legdrágább hibáját őrzi — a
gép a bal-felső cellát adta át az `epit` parancsnak, ami a középpontot várja, és
100 építési parancsból EGY ház lett. Minden addigi kapu zöld volt.

### Amit a v0.6/2 a MUNKÁS-AI-ban talált

A gépi ellenfél a gazdaságot sokkal keményebben hajtja, mint bármelyik kézi
forgatókönyv — és ettől két olyan hiba jött elő a v0.3-as `munkas.js`-ben,
amit három verzió zöld kapuja sem mutatott meg:

1. **Livelock az elakadásnál.** A `_ujLelohely` a RÉGI lelőhely koordinátáiból
   keresett, tehát a legközelebbi találat maga a régi lelőhely volt. Az
   elakadt munkás visszakapta ugyanazt az elérhetetlen célt, a `probal`
   nullázódott, és a kör újraindult — örökre.
2. **Navigáció nélküli munkás.** A `_ujLelohely` szándékosan nem kért áramlási
   mezőt (a v0.1-es „mező egységenként" csapdát kerülve), és arra épített, hogy
   a rövid táv egyenesen megtehető. De a keresés a RÉGI LELŐHELYBŐL indul: az
   új cél 14 egységen belül van AHHOZ képest, a munkástól viszont lehet 33-ra.
   Ha közben az egyenes vonal zárt, a munkásnak **se mezője, se egyenese** nem
   maradt — nem elakadt, hanem meg sem tudott mozdulni.

Mérve: hat étel-munkás állt 12 000 ticken át egyetlen század világegységet sem
mozdulva, a nehéz gép 100 ételt gyűjtött 890 fa mellett, és 658 képzési
parancsa futott elutasításba. A javítás után ugyanaz a gép eléri mindkét
célszámát (30 munkás, 30 katona), és 1770 helyett 4810 nyersanyagot gyűjt.

A szonda 9. vizsgálatába ezért bekerült egy **invariáns**, nem heurisztika: a
mozgás-magnak két módja van célba érni (mező vagy szabad egyenes), és aki úton
van, annak legalább az egyikkel rendelkeznie KELL. A megengedett érték nulla.

### v0.6/3 — a gép nem olvashatja ki, hol az ellenség

Ez a szakasz legfontosabb önkorlátozása, és pont azért kell leírni, mert a kód
szintjén semmi nem akadályozná meg: az `epuletek` tömb ott van, egyetlen ciklus,
és a gép a 0. ticktől tudná az ellenséges központ helyét.

Miért nem tesszük: a v0.7 hozza a hadi ködöt, és ha a gép addig a teljes pályát
látná, a köd bevezetése egy csapásra megváltoztatná a viselkedését — egy „kész"
AI-t kellene újraírni. Ennél is fontosabb a játékos oldala: egy ellenfél, aki a
bázisod helyét a semmiből tudja, nem nehéz, hanem **igazságtalan**, és a
felderítés mint mechanika azonnal értelmét veszti.

A gép ezért saját tudást tart (`ismertX/ismertY`), amit csak úgy szerezhet meg,
ahogy a játékos: valamelyik egysége látótávon belülre kerül egy ellenséges
épülethez.

**Amit a szakasz mérése átírt:**

- **A védelem nem panikolhat egy kémtől.** Egyetlen betévedt felderítő is
  átlépi a védelmi sugarat, és az első változat ettől hazarendelte a teljes
  hadsereget. A nehéz gép háromszor váltott védekezésre, a serege végig hazafelé
  menetelt, és a KÖNNYŰ gép verte meg. Most két ellenség kell hozzá.
- **A sereg-parancs elveszi a felderítőt.** A kém a sereg része, tehát a
  hazarendelés levette az útjáról — a gép viszont azt hitte, még kint van
  (az index érvényes, az egység él), és soha nem küldött újat. Így sosem tudta
  meg, hol az ellenfél, tehát támadni sem tudott.
- **A támadási küszöb nem lehet nagyobb a sereg-célnál.** A könnyű gép 14-nél
  támadott volna, de csak 8 katonát képzett — a saját célszámával SOHA nem érte
  volna el a küszöböt. Hogy mégis támadott, az kizárólag a szonda örökölt
  kezdősereg-ének volt köszönhető. Két külön tömb ellentmondása némán megél.
- **A szonda köre csupa munkással indul.** A v0.5 felállását örökölve
  csapatonként 15 katonával kezdett, és az első döntési körben (120. tick)
  elindult egy teljes hadsereg, még mielőtt bármelyik gazdaság létezett volna.
  A meccset az örökölt sereg döntötte el, nem az AI. Most a gépnek végig kell
  mennie a saját láncán: gyűjtés → ház → laktanya → katona → felderítés →
  támadás.

⚠️ **A „hány támadást indított" önmagában HIBÁS gát** — ugyanabba a csapdába
sétál, mint a v0.4 épület-célzása: a parancs kiadható úgy is, hogy egyetlen
egység sem ér oda. Az első ötlet („okozott épület-sérülés") szintén rossz volt:
ha a védő serege kiáll, a támadók vele verekszenek, és épületig el sem jutnak,
pedig a hullám megérkezett. A szonda ezért futás közben méri a sereg **legjobb
megközelítését** az ellenséges központhoz.

## A v0.7 állása

| szakasz | tartalom | állapot |
|---|---|---|
| v0.7/1 | hadi köd (sim-oldali láthatóság + GPU-textúra) | **kész** |
| v0.7/2 | mentés / betöltés | **kész** |
| v0.7/3 | minimap és rendes HUD | **kész** |

**A köd a SIMBEN él, nem a renderben** — pedig elsőre látványnak tűnik. Három
oka van:

1. **A felfedezettség nem számolható újra.** A „hol jártam már" halmozott
   tudás: a mostani állapotból nem következik. Ami nem vezethető le, azt tárolni
   kell — és amit tárolunk, az a világ állapota, tehát megy a hashbe és a
   mentésbe is.
2. **A gépi ellenfél ebből tud.** A v0.6/3 óta a gép csak azt tudhatja, amit
   felderített. Ha a köd a kliensben élne, a gép döntése kliens-oldali adatból
   származna — az a v0.8 lockstepjében azonnali desync.
3. **A v0.8 újracsatlakozása.** A visszatérő játékosnak a saját felfedezett
   térképét kell visszakapnia, nem egy üreset.

A köd rácsa négyszer durvább a pályánál (64×64 a 256×256-hoz), és ez mérés-
vezérelt: 1600 egység × ~314 cella = 500 000 írás lenne frissítésenként, a
negyedelt sugárral viszont a kör területe tizenhatodára esik. A látvány nem
romlik — a textúra lineáris szűrése adja a lágy peremet, ingyen.

⚠️ **A v0.6/3 külön sugár-vizsgálata megszűnt.** A gép addig a saját
egységeitől mért `LATOTAV`-val nézte, lát-e ellenséges épületet — ami ugyanazt
jelentette, de KÉT külön igazsággal: a gép láthatott olyat, ami a játékos
ködtérképén sötét volt. Két igazságból előbb-utóbb ellentmondás lesz. Most
egyetlen kérdés van, és a köd ugyanazt a választ adja a gépnek és a rendernek.

⚠️ **Amit a köd bevezetése kimutatott:** a nehézségi szintek rosszul voltak
beállítva. A „nehéz" gép 22 katonánál támadott, a „könnyű" 8-nál — és mérve a
KÖNNYŰ verte meg a nehezet, mert az a 16 000. tickig gyűjtögetett, mire a
bázisát lerohanták (0 munkás, 0 katona a kör végén). **A nehezebb szint nem
lehet passzívabb:** nem attól nehéz, hogy tovább vár, hanem attól, hogy több
van mögötte, amikor üt.

A szonda köd-számai közül a legfontosabb az, hogy **maradt-e felfedezetlen
terület**. Enélkül a köd „működne" akkor is, ha egy hibás sugár-számítás az
egész pályát felfedezettnek jelölné: determinisztikus, a számai nem nullák, és
mégis pontosan semmit nem takar el.

### v0.7/2 — az állapot-hash a mentés specifikációja

Ez a szakasz szerencsés helyzetben volt. A `Sim.allapotHash()` a v0.1 óta
pontosan azt sorolja fel, ami a szimuláció állapota — mert ha valami kimaradna,
a desync-detektor vak lenne rá. A mentésnek **ugyanezt a halmazt** kell
tárolnia, ugyanabból az okból. A kettő tehát egymást ellenőrzi, és a szonda 10.
vizsgálata pont ezt használja ki:

> ments a T. ticken → tölts FRISS simbe → futtasd mindkettőt T+M-ig → a két
> hash-nek bitre egyeznie kell

⚠️ **A mentés utáni FOLYTATÁS a lényeg, nem a pillanatnyi egyezés.** Az
azonnali egyezés sokkal gyengébb állítás: ami nincs a hashben, de a döntések
ráépülnek, csak később mutatkozik meg. Mind a három hiba, amit ez a szakasz
talált, pontosan ilyen volt:

1. **A generáció-tömb a `db` fölött is élő adat.** Minden más réteget az
   `egysegKepez()` felülír születéskor, a generáció viszont szándékosan túléli
   a slot újrahasznosítását — épp az a dolga, hogy egy elavult hivatkozásról
   kiderüljön, hogy elavult. Nullával induló generációkkal az `ervenyes()` a
   két futásban más választ ad.
2. **A mező-tár nem tiszta gyorsítótár.** Az egységek `mezoId`-je INDEX a tár
   rekeszeibe. Betöltéskor érvényteleníteni nem elég: minden `mezoId` üres
   rekeszre mutatna, és a sereg a következő ticken már máshova indul. Ezért a
   célcellákat mentjük, és ugyanabba a rekeszbe számoljuk újra.
3. **Az LRU-bélyeg a kiürített rekeszen is számít.** A kiszorítás a legrégebben
   használt rekeszt írja felül; nulla bélyegekkel más rekeszt választana, és az
   egységek `mezoId`-je száz tickkel később csúszott el.

**És ami közben kiderült a motorról:** az érvénytelenített áramlási mező
KÖLTSÉG-TÖMBJE ottmaradt, tele a régi cél adataival, és aki még arra a rekeszre
hivatkozott, az ki is olvasta — vagyis egy kiszorított mező után az egység
csendben egy **idegen célpont** felé navigált tovább, amíg a 15 tickenkénti
egyenes-vizsgálat helyre nem tette. Lockstepben ez „csak" fura volt (minden
gépen ugyanúgy történt), a mentésnél viszont hibává vált. Mostantól a
`cel < 0` rekesz nulla irányt ad, a mozgás-mag pedig pont erre az esetre esik
vissza a nyers célirányra — a helyes viselkedés eddig is ott volt, csak nem
futhatott le.

A `Racs.jarhato` **benne van** a mentésben, pedig levezethető lenne (terep +
nyersanyagok + épületek). Nem vezetjük le: a levezetés sorrendfüggő (a v0.5
felállásánál egyszer már meg is bukott), és egy elrontott sorrendből származó
egyetlen nyitott cella olyan útvonalat ad, ami az eredeti meccsben nem létezett.

Játékosnak: **F5** mentés, **F9** betöltés (böngésző-tároló, egy rekesz). A
mentés mérete a 3000. ticken 184 kB JSON — a tömör bináris formátum a v0.8
hálózati kódjának dolga, ahol tényleg számít.

### v0.7/3 — a minimap nem szivárogtathat

A minimap adat-előállítása külön fájlban van (`ui/minimap_adat.js`), és
**nem tud a DOM-ról** — egyetlen dolga, hogy a sim állapotából feltöltsön egy
RGBA bájt-puffert. A szétválasztás oka gyakorlati: így node-ban is fut, tehát a
szonda vizsgálni tudja. Egy vászonba rajzoló minimapról csak szemmel derülne
ki, ha elromlik, a felhőben pedig nincs szem (nincs GPU).

⚠️ **Ez a v0.7 legkönnyebben elrontható és legnehezebben észrevehető pontja.**
A minimap egyetlen elfelejtett feltétellel megmutatná az ellenség minden
mozdulatát, miközben a nagy képernyőn sötét van. A hadi köd ilyenkor „működik"
— a rácsa frissül, a textúrája rendben van, a szonda köd-számai nem nullák —,
csak épp senkit nem érdekel, mert a valódi információ máshol elérhető. Se a
hash, se a köd-számok nem fognák meg.

A szabály tehát szigorú, és a szonda ellenőrzi:

| | mikor látszik a minimapon |
|---|---|
| saját egység, épület | mindig |
| idegen egység, épület | csak ha a cellája **éppen most** látható |
| terep, nyersanyag | ha **valaha** láttuk (a felderítés jutalma) |
| sosem látott terület | fekete |

A gát nem azt nézi, hogy „rajzolt-e valamit", hanem hogy **maradt-e bármi a
ködben rejtve**. Ellenőrizve: a láthatóság-feltétel kiiktatásával a szonda
tényleg bukik.

**A HUD** rögzített mezőkből áll, nem szövegblokkból, és minden mező csak akkor
ír, ha az értéke tényleg változott. A v0.2 óta egyetlen `textContent` volt a
`main.js`-ben — egy értékadás az egész csomópontot újratördeli, 144 Hz-en
ingyen elvitt munkára. A gyors mezők (kijelölés, üzenet) képkockánként mennek,
a lassúak (nyersanyag, népesség, felfedezettség) 120 ms-onként.

A minimapra kattintás a **kamerát** mozgatja, és ez az egyetlen felhasználói
művelet a projektben, ami NEM megy át a parancs-soron — helyesen: a kamera nem
a szimuláció része, a v0.8-ban a másik játékos nézőpontja minket nem érdekel.

**Ismert adósság:** az épületek csak akkor látszanak a minimapon, ha éppen
láthatók. A műfaj-szokás az, hogy a felfedezett épület emlékként ottmarad — ez
külön „emlékezett épületek" állapotot igényel, ami a v0.11 UI-körébe való.

## A v0.8 állása

| szakasz | tartalom | állapot |
|---|---|---|
| v0.8/1 | lockstep mag, hurok-szállítás, desync-detektor | **kész** |
| v0.8/2 | WebSocket relay (szerver + kliens) | **kész** |
| v0.8/3 | újracsatlakozás a mentésből | **kész** |
| v0.8/4 | késleltetés-simítás (adaptív körhossz) | **kész** |

**A hálózat nem világállapotot küld.** Nem pozíciókat, nem életerőt, nem
nyersanyagot — egyetlen dolgot: ki mit parancsolt, és melyik körre. Minden gép
ugyanazt a szimulációt futtatja ugyanarra a parancs-sorra, és ha a sim
determinisztikus, az eredmény bitre azonos. **Ezért volt a determinizmus kapu a
v0.1 óta**, nem „majd megnézzük" kérdés: a teljes hálózati terv erre az egy
feltevésre épül. A v0.8/1 az, ami végre ki is próbálja — és megtartotta.

A **kör nem tick**: 4 tick egy kör, egy csomag egy kör összes parancsát viszi.
A T. körben kiadott parancs a T+2. körben hajtódik végre — ez adja a csomag
útidejét. Az ára 0,4 másodperc, és pont ezért futott a sim **egyjátékosban is**
késleltetéssel a v0.1 óta: hogy a v0.8-ban ne derüljön ki hirtelen, hogy
„elromlott az irányítás".

⚠️ **Egy desync-detektor, ami sosem sül el, rosszabb a semminél** — pontosan ott
ad biztonságérzetet, ahol a legnagyobb a baj. A szonda ezért nem elégszik meg
azzal, hogy két egyező futás egyezőnek látszik: **szándékosan elront** egyetlen
egység pozícióját 0,001 egységgel, és megköveteli, hogy a detektor kiszúrja.
(Elkapja, ugyanabban a körben.)

A 11. vizsgálat három ágon fut:
1. **tiszta futás** késleltetett hálózaton — 899 kör, 51 parancs, bitre azonos;
2. **lassú hálózat** (5 kör késés) — 542 megállás, felzárkózás, ugyanaz az
   eredmény. Enélkül a `VAR` ág a kapun kívül maradna, pedig az a lockstep
   legjellemzőbb viselkedése;
3. **a detektor próbája** — a szándékos romlás elkapva.

**Két hiba, amit ez a szakasz talált:**

- **Egy objektum ne küldjön, mielőtt a hívó befejezte a bekötését.** A
  `Lockstep` a konstruktorból küldte a kezdő csomagokat, a hívó viszont csak
  utána kötötte be a szállítást — az első gép csomagjai a semmibe hullottak, a
  másodikéi nem. Az egyik oldal két kört futott, a másik egyet sem, és a meccs
  beragadt. Innen a külön `indit()`.
- **A desync-detektor kiszámolt körre nézett, és sosem talált.** Mire a társ
  ujjlenyomata megérkezett egy körre, a sajátunkat már eldobtuk: 899 kör futott
  le **nulla** hash-vizsgálattal. A detektor ott volt, csak sosem szólalt meg.
  Az összevetés most eseményvezérelt — akkor fut, amikor a párja megérkezik,
  akármelyik oldalról.

A **hurok-szállítás** (`net/hurok.js`) nem egyszerűsített változata a
valódinak: ugyanazt a felületet hajtja meg, ugyanazokkal az üzenetekkel, és tud
késleltetni is. Ha valami ott működik, a WebSocket-változat már csak szállítás.

### v0.8/2 — a szerver nem tud semmit a játékról

A relay (`server/relay.mjs`) nem ismer egységet, nyersanyagot, térképet vagy
győzelmi feltételt. Egyetlen dolgot csinál: **továbbít**. Ez nem szegényes
megoldás, hanem a lockstep közvetlen következménye — ha minden gép ugyanazt a
determinisztikus szimulációt futtatja ugyanarra a parancs-sorra, a szervernek
nincs mit hitelesítenie. Amit ezzel nyerünk: elhanyagolható szerver-terhelés,
és egy szerver, ami **nem tud desyncet okozni**, mert nincs benne játék-logika,
amiben eltérhetne.

⚠️ **Egy tekintélye viszont van, és az nem elhagyható: a játékos-azonosítót a
szerver bélyegzi.** Egy hamis kliens különben `jatekos: 0`-val küldhetne
csomagot, és a *másik* játékos seregének parancsolhatna. A kliensek nem látják
egymás kapcsolatát, tehát ezt csak a relay tudja megfogni. A hálózati szonda
külön próbálja: az egyik kliens szándékosan hazudik a feladóról, és a másiknak
a valódi azonosítót kell látnia. (Ellenőrizve: a bélyegzés kiiktatásával a
szonda bukik.)

A parancsok **tartalmát** viszont nem vizsgáljuk. Azt minden kliens simje úgyis
elutasítja, ha érvénytelen — és mindenhol ugyanúgy, mert a szabály a simben van.
Egy szerver-oldali „ellenőrzés" csak egy második, eltérő szabálykészletet
hozna, vagyis pont desync-forrás lenne.

**A hálózati szonda külön parancs (`npm run halo`), nem a `det` része.** A
determinizmus-szonda értéke az, hogy tiszta: nincs benne port, időzítés vagy
másik folyamat, tehát ha bukik, a szimuláció a hibás. Egy socketes vizsgálat
ebbe beleerőltetve egy foglalt portot „determinizmus-hibaként" jelentene, és
néhány hamis riasztás után senki nem hinne a kapunak.

Mérve (200 kör, valódi socket, külön folyamatban futó relay): 202 csomag
mindkét irányban, 21 végrehajtott parancs oldalanként, 198 hash-vizsgálat, a
két szimuláció **bitre azonos**.

### v0.8/3 — újracsatlakozás pillanatképből

A szerver **nem tud pillanatképet adni**, mert nem szimulál: a világ állapota
csak a kliensekben létezik. A visszatérő ezért egy **társtól** kapja, a relay
pedig csak továbbítja — átlátszó csomagként, bele sem nézve. A relay ezzel sem
lesz okosabb a játékról.

A pillanatképet a `Lockstep` készíti, és **kör határán**: a `Sim` állapota
pontosan a `kor`-adik kör kezdetén áll, onnan folytatható a hurok. Tick közben
készített mentésből nem lehetne visszatérni — a visszatérő a kör közepén
ébredne, és a kör parancsai vagy kimaradnának, vagy másodszor is lefutnának.

⚠️ **A mentésen felül a már elküldött, de még végre nem hajtott csomagok is
mennek.** A bemenet-késleltetés miatt minden gép két körrel előre küld, tehát a
visszatérés pillanatában mindenkinek van 1-2 környi csomagja „útban". Azokat a
visszatérő már nem kaphatja meg a hálózatról (nem volt kapcsolatban, amikor
kimentek), és a lockstep nélkülük **örökre várna rájuk** — a meccs a
visszatéréssel állna meg végleg. Ez nem elmélet: a szonda gátját úgy próbáltam
ki, hogy kivettem őket, és a meccs a 202. körnél beragadt.

A visszatérőnek a **saját** hiányzó csomagjait is el kell küldenie a rés
köreire — ezt az `indit(kor)` intézi, ugyanaz a függvény, ami a meccs elején
tölti ki ugyanezt a rést, csak nem a 0. körnél.

A v0.7/2-ben ezt írtuk a mentésről: *„a v0.8 újracsatlakozása a saját
felfedezett térképét kell visszakapja"*. Ez az a pillanat — a mentés-formátum
változtatás nélkül elég volt hozzá.

Mérve: a B kliens kiesett a 200. körnél, pillanatképből visszatért, mindkét
kliens elfutott a 260. körig, és a két szimuláció **bitre azonos**.

### v0.8/4 — nem a késleltetés nyúlik, hanem a kör

Rossz vonalon a fix körhossz elviselhetetlen: a lockstep körönként megáll, és a
játék szaggat. A kézenfekvő ötlet — „növeljük a bemenet-késleltetést" —
viszont **nem járható**:

⚠️ **A bemenet-késleltetés azt szabja meg, melyik körben hajtódik végre egy
parancs.** Ha az egyik gép 2-vel, a másik 3-mal számolna, ugyanaz a kattintás
más körben futna le a két gépen — vagyis azonnali desync. Nem „ritkán
jelentkező hiba", hanem szükségszerű.

Ezért nem a késleltetés-**szám** változik, hanem a **kör hossza tickben**.
Ugyanaz a két kör késleltetés hosszabb körökkel több valós időt fed le, tehát a
csomagnak több ideje van megérkezni — a parancs viszont minden gépen ugyanabban
a körben hajtódik végre.

A megegyezés menete, és miért determinisztikus:

1. Minden csomag viszi a küldő **kért** körhosszát (a saját megállásaiból).
2. A `K`. kör végrehajtásakor mindenkinek a kezében van az összes játékos
   `K`-ra szóló csomagja — különben nem is léphetne. Mindenki ugyanabból az
   adatból veszi a **maximumot**: aki a legrosszabb vonalon ül, az szabja meg a
   tempót.
3. A döntés a `K + 3`. körre szól, mert a `K + 2`. körre szóló csomag épp most
   megy ki — az első kör, amiről még senki nem küldött, a `KESLELTETES_KOR + 1`.

A szabályozó jelzése a **megállások aránya**, nem a valós idő. Ez tudatos: egy
`performance.now()` alapú szabályozó gépenként más hosszt kérne. A megállás-szám
viszont a saját hurkunk megfigyelése — mindenki a maga vonaláról nyilatkozik, és
a megegyezés (maximum) hozza össze őket.

A kör első tickje futó összeg (`kovetkezoTick`), nem `kor * KOR_TICK` — változó
hossz mellett a szorzás hazudna. A körhossz és a már eldöntött menetrend a
**pillanatképbe is bekerült**: a visszatérő különben az alap hosszal folytatná,
miközben a többiek megegyezett, hosszabb körrel futnak.

**Egy csendes hiba, amit a gát fogott meg:** a kért hosszat
`sor[j].kertKorHossz`-ról olvastam, csakhogy `sor[j]` az adott játékos
*parancs-listája* — azon nincs ilyen mező. A kért hossz szabályosan felment
16-ra, a megegyezés viszont végig a 4-es alapértéket adta, és a kör sosem nyúlt
meg. A hash végig zöld volt.

Mérve: gyors hálózaton 4 tick, lassún (5 kör késés) 16 tick, hat változással —
és a két gép **bitre azonos** mindkét esetben.

## A v0.9 állása

| szakasz | tartalom | állapot |
|---|---|---|
| v0.9/1 | 8 civilizáció, bónusz-tábla, beakasztás a kilenc horogra | **kész** |
| v0.9/2 | egyedi egységek civenként (új `TIPUS`, harc- és render-táblák) | nyitott |

A civ **csak adat**: nyolc nép, ugyanaz az öt egység, más számokkal. A
`CIV_BONUSZ` lapos `[hatás, index, érték]` hármasokból áll, hogy a v0.13
hangolása egyetlen szám átírása legyen, ne kódmódosítás. A bónuszok a
`beallit()`-ben terülnek szét előre számolt `Int32Array`-ekbe — a forró út csak
olvas, pont mint a technológiánál.

⚠️ **Minden népnek van hátránya is.** Nem stílus-kérdés: egy csupa pozitívumból
álló nép nem „erős civ", hanem a választás megszüntetése — mindenki azt
játszaná, a másik hét pedig halott kód lenne. A szonda ezt ellenőrzi is.

**Alapértelmezés `CIV_NINCS`, nem a 0. civ.** A v0.1 regresszió-őre civ nélkül
fut, és ha a 0. nép csendben ráülne, a `qa/V0.1_EREDMENY.md` számai
megváltoznának.

### v0.9/1 — a hash mint gát ITT NEM MŰKÖDIK

A 12. vizsgálat záró gátja eredetileg azt kérdezte: eltér-e az `allapotHash()`
civvel és civ nélkül? Kipróbálva — mind a kilenc lekérdezőt semlegesre írva —
**a hash akkor is eltért**, mert a civ-INDEX maga is benne van a hashben (épp
azért, hogy a lockstepben ne játszhasson két gép más néppel). A gát tehát
SOSEM sült volna el, és pont azt a hibát nem fogta volna meg, amiért megírtuk:
a hiányzó beakasztási pontot.

A gát ezért **mért világ-számokon** megy — összegyűjtött nyersanyag, épület- és
egység-darabszám, összesített életerő, kiképzett egységek, népesség-plafon,
kikutatott technológia —, amikhez a civ CSAK a horgokon át érhet hozzá.
Szabotázzsal ellenőrizve: ép kóddal 15/16 szám tér el, minden horgot
semlegesítve **0/16**, vagyis a gát tényleg elsül.

Mellette forrás-szintű ellenőrzés is fut arra, hogy mind a tíz hívási hely a
helyén van-e. Durva eszköz, de a hash-gát csak azt mondja meg, hogy VALAMI
hatott — két bónusz is elég a szétváláshoz, a maradék hét pedig némán elveszne.

**A mentés-vizsgálat is átállt a v0.9 felállására.** Civ nélkül a nyolc
civ-tömb mind a gyári értéken állna, és egy KIMARADÓ `civ` blokk a betöltés
után pontosan ugyanazt a világot adná vissza — a vizsgálat zöld maradna egy
olyan mentésre, ami a civ-választást elveszti. A mentés a származtatott
tömböket is tárolja, nem csak a civ-indexet: a `CIV_BONUSZ` a v0.13 hangolásának
fő célpontja, és egy hangolás után visszatöltött állás különben más számokkal
folytatódna, mint amivel elindult.

**Az AI ugyanazt az árat nézi, amit a parancs levon.** A gép előzetes
ár-vizsgálata a v0.6 óta szűri a halott parancsokat; ha listaárral számolna, a
Hegyi bányász fölöslegesen gyűjtene egy körrel tovább, a Kristálykovács pedig
sorra adna be elutasításba futó képzést — vagyis épp az a zaj térne vissza,
ami miatt a szűrés bekerült.

## A záró lépcsők (v0.11–v0.13)

**v0.11 — főmenü.** A minta a TELEPESEK főmenüje. Amíg nincs menü, a játék
minden indításnál ugyanabba az állapotba esik, és a seed, a pályaméret meg a
civ-választás kódban ül. A menü nem kozmetika: ez teszi a buildet olyanná, amit
oda lehet adni valakinek.

**v0.12 — hang.** ⚠️ **A hang SOHA nem szólhat bele a simbe.** A lejátszás
render-oldali, és a sim ESEMÉNYEIRE ül rá (csapás, halál, lerakás, korszakváltás,
kimerülés). Ha a hang bármit visszaírna — akár csak egy „mikor szólt utoljára"
időbélyeget a sim állapotába —, az azonnal desync a v0.8-ban. A `Date.now()`
ugyanígy tilos marad a sim felől nézve; a hangnak saját órája van.
A gyakorlati következmény: a simnek esemény-naplót kell adnia (mi történt ebben
a tickben), amit a render kiolvas és eldob. Ez a napló a v0.7-es mentés/betöltés
és a v0.8-as visszajátszás szempontjából is hasznos lesz.

**v0.13 — QA-kör.** Nem „még egy funkció", hanem az egyetlen lépcső, ami
kizárólag azzal foglalkozik, hogy a meglévő tényleg működik-e: teljes
determinizmus-kör, FPS-mérés minden lépcsőn, balansz-átnézés (a v0.9 nyolc
civje), UX-végigjátszás és hibalista. A `qa/` mappa eddigi jelentései ennek az
előfutárai.

**v0.14 — magyar + angol.** Teljes fordítás, nyelvválasztó a főmenüben (ezért
jön a menü UTÁN). A szerkezet a TELEPESEK i18n-jéből átvehető.

⚠️ **A KÓD magyar marad — a SZÖVEG lesz kétnyelvű.** Ez a kettő nem ugyanaz, és
a keverésük itt konkrét munkát jelent: a `src/sim/` alatt MA is vannak
megjelenítendő feliratok — `ALAKZAT_NEV`, `ALLAS_NEV`, `NYERS_NEV`,
`KORSZAK_NEV`, `EPULET_NEV`, `TAMADAS_NEV`, `PANCEL_NEV`. Ezek magyar
szövegek egy olyan rétegben, aminek semmilyen felhasználói szövegről nem
szabadna tudnia. A v0.14 első lépése ezeket KULCSOKKÁ alakítani (`'alakzat.ek'`),
és a feloldást a UI-ba tenni. A sim így node-ban is ugyanaz marad, és a
nyelvváltás egyetlen réteget érint.

A második lépés a HUD és a menü: ott ma nyers magyar sztringek vannak
összefűzve (`bevitel.js`, `main.js`). Ezeknek is a fordítási táblán kell
átmenniük — enélkül a nyelvváltás felerészben megtörténne, ami rosszabb, mint
ha egynyelvű maradna.

**v0.15 — kirakás SkyNetre.** A cél `https://skynet.lospolo.hu/aotc`.

A build STATIKUS (`vite build` → `dist/`), tehát a SkyNet PHP-s kiszolgálója
tökéletesen elég hozzá — nem kell futó Node-processz.

⚠️ **Az alkönyvtár a buktató.** A `vite.config.js`-ben `base: '/aotc/'` kell,
különben a `dist/index.html` gyökérből (`/assets/…`) hivatkozza a JS-t és a
CSS-t, a `/aotc/` alatt pedig az 404. Ez az a hiba, ami helyi `vite preview`-val
SOSEM jön elő, csak élesben — a preview a gyökérből szolgál ki.

⚠️ **A v0.8 relay-szerver NEM fér el itt.** A netcode külön futó Node-processzt
igényel (lásd „Őszinte kockázatok"), a SkyNet viszont PHP-t szolgál ki. A
kirakott build tehát EGYJÁTÉKOS marad, amíg a relay nem kap saját helyet (VPS
vagy állandó portot adó szolgáltatás). Ezt a v0.14-nek nem kell megoldania, de
tudni kell róla, hogy ne az élesben derüljön ki.

## Miért ebben a sorrendben

A **determinizmus és a parancs-sor a v0.1-ben** van, nem a v0.8-ban. Ez a terv
legfontosabb döntése. A lockstep nem hálózati funkció, hanem a szimuláció
tulajdonsága: ha a v0.7-ig „normálisan" írnánk a simet, a v0.8 nem netcode-
írás lenne, hanem az egész sim újraírása. Így viszont a v0.8-ban a hálózat
tényleg csak szállítás: ugyanaz a parancs-sor érkezik, csak távolról.

## Őszinte kockázatok

- **A v0.8 önmagában nagy.** A relay-szerver külön futó Node-processzt igényel
  (a SkyNet PHP-je nem elég), tehát VPS vagy legalább egy állandó portot kapó
  szolgáltatás kell hozzá.
- **A v0.9 nem mérnöki munka, hanem balansz.** 8 civ kiegyensúlyozásához
  játszani kell — ez lesz a leghosszabb szakasz, és nem gyorsítható agentekkel.
- **A determinizmus törékeny.** Egyetlen figyelmetlen `Math.sin` a sim-ben
  elrontja. Ezért a szonda statikusan is szűr, és a kapu része lesz.

## Ami a TELEPESEK-ből átjön

Render-módszertan (instancing, LOD, chunkolás), a szonda/mérőpad-kultúra, a
kiadási kapu, a deploy-lánc, az i18n-szerkezet. Ami **nem** jön át: a
szimuláció — az láncalapú gazdaságra készült, nem 200-pop csatákra.

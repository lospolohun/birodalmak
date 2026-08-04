# PORTAL HUB TYCOON — projektterv és állapot

> Egy dimenziók közötti központi átszállóállomás igazgatója vagy.
> Portálokon át furcsa lények érkeznek, és tovább akarnak utazni, enni,
> vásárolni, pihenni. Építsd meg a világ legnagyobb dimenziókapu-állomását.

**Verzió: `portal/src/mag/config.js` → `VERZIO`.** A `package.json` verziója az
AGE OF THE CRYSTALS-é, ne azt nézd.

---

## 1. Mi ez a mappa

A `portal/` egy ÖNÁLLÓ alprojekt a `birodalmak` repóban. Saját `index.html`-je,
saját `vite.config.js`-e és saját szondái vannak; az AGE OF THE CRYSTALS
egyetlen fájljához sem nyúl. A két játék három npm-scripten kívül semmit nem
oszt meg:

```bash
npm run portal:dev         # fejlesztői kiszolgáló (5274)
npm run portal:build       # dist/
npm run portal:det         # determinizmus-szonda — EZ A FŐ KAPU (9 vizsgálat)
npm run portal:mertan      # a 3D-mértan kerete és sziluett-ujjlenyomata
npm run portal:hang        # hangrendszer (katalógus + böngésző + jelszint)
npm run portal:bongeszo    # böngésző-szonda (indul-e, működik-e, ment-e)
npm run portal:kep 16000   # képernyőkép egy felépített állomásról
npm run portal:szonda      # mind egyben
node portal/tools/egyensuly.mjs 60000 8   # egyensúly-mérés (percek)
```

---

## 2. Rétegek — és a köztük lévő EGYETLEN szabály

```
  src/mag/     config, determinizmus-biztos matek, seedelt véletlen
  src/sim/     A VILÁG. Nincs benne three, DOM, Math.random, Date.now.
  src/render/  three.js. Csak OLVASSA a simet.
  src/ui/      DOM. Csak OLVASSA a simet.
  src/fo.js    huzalozás + fix lépésközű hurok
```

**A render és a UI sosem ír a simbe.** Ha hatni akarnak a világra, parancsot
adnak: `sim.parancs({ fajta: 'epit', tipus: 'etterem', x, y })`. Ennek három
következménye van, és mindhármat használjuk:

1. **A mentés = seed + parancsnapló.** Nem kell ezer utast szerializálni.
   A `det_szonda.mjs` 5. vizsgálata ezt méri: a naplóból újrajátszva bitre
   ugyanaz az állapot jön ki.
2. **A hibák újrajátszhatók.** A `?seed=…` paraméterrel ugyanaz a világ
   indul újra — hibajelentéshez ez az egyetlen használható eszköz.
3. **A felület cserélhető.** A UI teljes átírása nem tudja elmozdítani a
   gazdaságot.

---

## 3. Ami KÉSZ (v1.0)

### Szimuláció
- **Rács** 64×48, padló / épület / hő- / hidegzóna / tömeg rétegekkel.
- **Útkeresés**: épületenkénti BFS-távolságmező, gyorsítótárazva a rács
  verziójához kötve, tickenként korlátozott újraszámolással. Utasonként 8
  tömb-olvasás, nem A*.
- **20 épülettípus**, adatvezérelten (`sim/epuletek.js`): egy új szolgáltatás
  EGY sor a katalógusban.
- **10 faj** (`sim/lenyek.js`) saját sebességgel, türelemmel, pénzzel,
  helyigénnyel, igénylistával és két minőségi különbséggel: a szellem átmegy a
  falakon, a mimik lop.
- **Utas-AI**: érkezik → dönt → megy → sorban áll → kiszolgálás → indul.
  Türelem, hangulat, csalódás, dühös távozás.
- **7 dimenzió** külön fajmixszel, díjjal, veszélyességgel, szinttel és
  instabilitással. A díjszabás visszahat a forgalomra.
- **Gazdaság**: portáldíj, szolgáltatásbevétel, reklám / bérek, energia,
  kristály, üzemeltetés, napi elszámolás tételes bontással.
- **9 dolgozótípus**, beosztással, három szinttel, napi bérrel.
- **14 technológia** függőségi fával.
- **11 esemény**, többségük játékos-válasszal és felkészültség-függő kimenettel.
- **7 fejezetes történet** két visszafordíthatatlan döntéssel, győzelemmel és
  csőddel.

### Látvány
- Példányosított padló (sakktábla + zónaszínezés), épületek, utasok
  (szilárd/áttetsző), dolgozók, állapotjelzők — **12 rajzolási hívás** az egész
  jelenetre, 1200 lénnyel is.
- Forgó, instabilitással vörösödő portálgyűrűk, saját fénnyel.
- Színátmenetes ég + csillagok, alaplemez a lebegő sziget alatt.
- A hangulat LÁTSZIK: a lény színe a vörös felé csúszik, ha rossz a kedve.

### Felület
- Felső sáv hat számmal, mindegyikre van válaszlépés.
- Fejezet-kártya haladásjelzővel.
- Építés-sáv nyolc kategóriával; a kapuk dimenziónként külön gombbal.
- Nyolc panel: dimenziók, kutatás, dolgozók, **bestiárium**, statisztika,
  napló, **mentés/beállítások**, súgó.
- Modális ablakok: fejezet, döntés, esemény, vég.

### v0.2 — mentés, bestiárium
- **Mentés = seed + parancsnapló.** Betöltéskor a világ ÚJRAJÁTSZÓDIK,
  darabokban, folyamatjelzővel. Automata mentés naponta + 3 kézi hely.
  A böngésző-szonda méri, hogy a betöltött világ BITRE azonos a mentettel.
- **Bestiárium**: a fajok állandó tulajdonságai ÉS az élő helyzetkép
  (ki van bent, milyen a hangulatuk, honnan jöttek).
- **Hang**: procedurális WebAudio, nulla hangfájl. A portálzúgás színe az
  instabilitást követi, a tömegzaj az utasszámot.
- **Egyedi sziluett** minden épülettípusnak és minden fajnak.

### v0.3 — a többszintes állomás
- A rács három dimenziós (64×48×3). A `z` a világ állapota, nem nézet.
- **Mozgólépcső** (olcsó, lassú) és **teleport lift** (drága, azonnali) mint
  átjáró; a szintváltás IDŐBE kerül.
- Alátámasztás: emeleti padló csak padló fölé. Az átjáró cellája JÁRHATÓ.
- A szellem átmegy a FALON, de nem a PADLÓN — neki is átjáró kell.
- Szintválasztó a felső sávban (R/F): a fölötte lévő emeletek eltűnnek.

### v0.5 — végtelen mód
- A győzelem NEM állítja meg a játékot: a hét fejezet után **korszakok**
  jönnek, mindegyik saját céllal, **ranggal**, és korszakonként +9 %
  instabilitással és bérrel. A korszakcél mennyiséget ÉS minőséget is kér.

### v0.6 — élő állomás
- A **kosz épületenként** gyűlik, ott, ahol a tömeg áll. A takarító koboldok
  kiválasztják a legkoszosabb épületet, odamennek, és ott dolgoznak.

### v0.7 — a felület, ami megmondja, mi történik
- **💡 Tanácsadó**: a mérésekből tanult szűk keresztmetszeteket mondja ki.
  Csak olyat, ami mérhető és amire van válaszlépés.
- **Grafikonok**: napi idősor hírnévről, forgalomról, bevételről (canvas).
- **„Ki áll itt?"**: egy cellára kattintva látszik az ott állók terve,
  hangulata, türelme — az utas-AI eddig fekete doboz volt.

### v0.8 — bevezető
- Hat cél, mindegyikhez a MIÉRT-tel. Nem kattintgatós bemutató: célokat ad,
  nem utasításokat, és bármikor eltüntethető.

### v0.9 — kiadás-ellenőrző, események, fájlmentés
- Külön kapu a KIADHATÓSÁGRA (verzió, ottfelejtett nyomok, külső hivatkozás,
  npm-parancsok, az alprojekt szivárgása, dokumentáció, build).
- Öt új esemény (16 összesen), és egy vizsgálat arra, hogy TÖRTÉNIK-e valami.
- Mentés fájlba/fájlból — egyben a hibajelentés tökéletes formája.

### v0.4 — a hálózat
- **Nehézségi fokozatok** (könnyű / normál / kemény) szorzókkal. A fokozat a
  világ állapota: a mentés viszi, az ellenőrző-összeg tartalmazza.
- **Bérbeadás**: a bolt, étterem, könyvesbolt és VIP kiadható — nincs
  személyzeti gond, napi fix díj, cserébe a bevétel 42 %-a.
- **Érkezési csatornák**: Vasútállomás, Léghajó-kikötő (csak EMELETEN!),
  Űrkapu. Nincs instabilitásuk és nem fogyasztanak kristályt — ez a
  „nyugodt" bevételi ág a kapuk mellett.

---

## 4. Mérések (2026-08-04, felhő)

| mérés | érték |
|---|---|
| determinizmus-szonda | mind a **11** vizsgálat zöld |
| mértan-szonda | 23 épülettípus, 23 különböző sziluett, keret alatt |
| hang-szonda | üres állomás 0,028 → nyüzsgő+instabil 0,427 jelszint |
| böngésző-szonda | 9 vizsgálat zöld, a betöltés bitre azonos |
| látvány-szonda | napszak, áttetsző szintek, zárt részecskekeret |
| kiadás-ellenőrző | 7 vizsgálat zöld |
| egyensúly (80 végigjátszás) | **6 stratégia nyer 8/8-at**, 4 egyszer sem, 0 csőd |
| ms/tick 1200 utasnál | **0,137 ms** (node, felhő) |
| rajzolási hívás | 22 — 1000+ lénnyel ÉS teli részecskekerettel |
| build | 878 kB / 243 kB gzip (ebből a three.js a nagyobb rész) |

A részletes egyensúly-mérés (6 stratégia × több seed × 50 játéknap) a
[`qa/EGYENSULY.md`](qa/EGYENSULY.md)-ben van.

⚠️ **A tick-idő két futás között NEM összehasonlítható** — a felhő-gép osztott
CPU-n fut. A/B-t egy munkameneten belül mérj (`git stash`).

⚠️ **FPS-t a felhőben nem mértünk és nem is lehet**: nincs GPU, a Chrome
SwiftShaderre esik. A `qa/*.png` képek geometriát és színt mutatnak, sebességet
nem. Az FPS-mérés az iMac dolga.

---

## 5. Ami NINCS kész (v1.0 után)

Sorrend nagyjából fontosság szerint. Az első kettő NEM ötlet, hanem
**adósság**: olyan állítás, amit ma nem tudunk méréssel alátámasztani.

1. **FPS-mérés valódi GPU-n.** A render a v0.1 óta gyökeresen megváltozott
   (típusonkénti és fajonkénti mértan, három szint, portálfények, napszak,
   részecskék), és azóta EGYSZER SEM futott rá `npm run fps` GPU-s gépen.
   A felhőben nem is lehet. Ez az egyetlen olyan tétel, ami a v1.0-t
   „mért" helyett „részben mért" állapotban tartja.
2. **Emberi végigjátszás.** A gépi játékos négyszer vitte végig a történetet,
   de EMBER még nem. A tempó, a szövegek érthetősége és a bevezető haszna
   csak így ítélhető meg — botot nem lehet megkérdezni, hogy unatkozott-e.
3. **Hosszú távú stabilitás.** A leghosszabb mért futás 80 játéknap. Hogy egy
   200 napos parti mit csinál a memóriával és a mentés méretével, nem tudjuk.
4. **Negyedik-ötödik szint**, és emeletenként eltérő bérleti díj.
5. **Utas-részletek**: poggyász mint látható tárgy, csoportok (család,
   küldöttség), VIP-kíséret.
6. **Mobil / érintőképernyő.** A vezérlés egérre készült.
7. **Több nyelv.** Ma minden magyar, a kód is.

### Amit ez az ív LEZÁRT a korábbi listából

- Végtelen mód a VII. fejezet után → **kész** (korszakok, rangok, növekvő cél).
- A gépi stratégiák újrahangolása → **kész** (`qa/EGYENSULY.md`).
- A könnyű/kemény fokozat és a bérbeadás egyensúlya → **mérve**.
- Az emeleti látvány áttetsző „szellemszintje" → **kész**.

---

## 6. Ha hozzányúlsz — checklist

- `npm run portal:det` és `npm run portal:build` fusson hibátlanul.
- **Új parancsfajta → vedd bele a `tools/forgatokonyv.mjs` v01-be.** Különben a
  legfrissebb kód marad a kapun kívül, és a zöld szonda hamis biztonságérzetet
  ad. (Ez már megtörtént: az első forgatókönyv fix tick-listából dolgozott, és
  emiatt a második kapu SOHA nem nyílt meg — a több-kapus kód mérés nélkül
  maradt.)
- **Új alrendszer → kérdezd meg: mi az a szám, ami elárulja, hogy tényleg
  CSINÁL is valamit?** Tedd bele a 6. vizsgálatba. A determinizmus-kapu nem
  működés-kapu: az állomás egy ponton TARTÓS áramszünetben ült, minden épület
  40 %-on ment, a hírnév spirálba került — és a determinizmus közben hibátlan
  volt.
- A `v01` forgatókönyv a motor-mag regresszió-őre. Ne írd át; új próbához új
  függvényt írj (`v02`, …).
